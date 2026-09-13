-- Fase 9: shared, manually-ordered household watchlist.
--
-- The priority order of pending titles is a property of the HOUSEHOLD, not of
-- a single user: both members must see the same list in the same order. The
-- existing tables cannot represent that:
--   * user_title_state is per-user (two rows per title, one per member) — the
--     order would diverge between partners and titles added by the other
--     member would have no row to hold a position.
--   * titles is global across households — a single title can be in several
--     households' catalogs, so no per-household order can live there.
-- This migration adds the dedicated table `household_watchlist_order`:
--   * PK (household_id, title_id): one position per title per household.
--   * UNIQUE (household_id, position): no two titles share a slot.
--   * FK to households/titles with ON DELETE CASCADE: a fully orphaned title
--     (removed by remove_title_from_catalog) cleans its order row; a deleted
--     household cleans its rows.
--
-- Lifecycle:
--   * A row appears when a household member marks a title 'watchlist'
--     (trigger appends it at the end).
--   * The row is kept while the title moves to 'watching'/'watched', so if it
--     comes back to 'watchlist' it resumes its previous spot. Kept rows that
--     are no longer pending never collide with new positions: reordering
--     compacts them after the pending block.
--   * Reordering goes through the security-definer RPC
--     reorder_household_watchlist, which validates that the passed list is
--     exactly the current pending set of the caller's household (no dupes, no
--     drops) and rewrites positions atomically.

-- ============================================================
-- 1. Table
-- ============================================================
create table public.household_watchlist_order (
  household_id uuid not null references public.households (id) on delete cascade,
  title_id     uuid not null references public.titles (id) on delete cascade,
  position     integer not null check (position > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (household_id, title_id),
  constraint household_watchlist_order_position_unique
    unique (household_id, position)
);

comment on table public.household_watchlist_order is
  'Shared priority order of the household watchlist. A pending title has a row; a title without a row (or no longer pending) follows the default catalog order.';

create index household_watchlist_order_title_id_idx
  on public.household_watchlist_order (title_id);

-- ============================================================
-- 2. Auto updated_at
-- ============================================================
create trigger household_watchlist_order_set_updated_at
  before update on public.household_watchlist_order
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 3. Backfill existing watchlists
-- ============================================================
-- Pending titles already in the catalog get a position derived from the
-- current catalog order (titles.created_at desc, which getCatalog uses).
insert into public.household_watchlist_order (household_id, title_id, position)
select
  household_id,
  title_id,
  row_number() over (partition by household_id order by created_at desc, title_id) as position
from (
  select distinct
         p.household_id,
         s.title_id,
         t.created_at
  from public.user_title_state s
  join public.profiles p on p.id = s.user_id
  join public.titles  t on t.id = s.title_id
  where s.watch_status = 'watchlist'
    and p.household_id is not null
) pending
on conflict (household_id, title_id) do nothing;

-- ============================================================
-- 4. RLS (household-scoped: only members share and edit their own order)
-- ============================================================
alter table public.household_watchlist_order enable row level security;

create policy "household_watchlist_order_select_members"
  on public.household_watchlist_order
  for select to authenticated
  using (household_id = (select private.my_household_id()));

create policy "household_watchlist_order_insert_members"
  on public.household_watchlist_order
  for insert to authenticated
  with check (household_id = (select private.my_household_id()));

create policy "household_watchlist_order_update_members"
  on public.household_watchlist_order
  for update to authenticated
  using (household_id = (select private.my_household_id()))
  with check (household_id = (select private.my_household_id()));

create policy "household_watchlist_order_delete_members"
  on public.household_watchlist_order
  for delete to authenticated
  using (household_id = (select private.my_household_id()));

-- ============================================================
-- 5. Trigger: append pending titles to the order list
-- ============================================================
-- Whenever a user_title_state row enters 'watchlist' (or another member adds
-- the same title), the trigger creates the household order row at the end.
-- Unique (household_id, position) is guarded with an advisory lock so two
-- concurrent appends cannot collide into the same slot.
create or replace function public.ensure_watchlist_order_entry()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_household uuid;
  next_position integer;
begin
  if new.watch_status = 'watchlist' then
    select household_id into caller_household
    from public.profiles
    where id = new.user_id;

    if caller_household is not null then
      perform pg_advisory_xact_lock(hashtext('watchus_watchlist:' || caller_household::text));

      select coalesce(max(position), 0) + 1 into next_position
      from public.household_watchlist_order
      where household_id = caller_household;

      insert into public.household_watchlist_order (household_id, title_id, position)
      values (caller_household, new.title_id, next_position)
      on conflict (household_id, title_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger user_title_state_ensure_watchlist_order
  after insert or update of watch_status on public.user_title_state
  for each row execute procedure public.ensure_watchlist_order_entry();

-- ============================================================
-- 6. Grants
-- ============================================================
revoke all on table public.household_watchlist_order from anon, authenticated;
grant select, insert, update, delete on table public.household_watchlist_order to authenticated;

-- ============================================================
-- 7. reorder_household_watchlist: atomic shared reorder
-- ============================================================
-- The caller passes the full ordered list of titles that currently form their
-- household watchlist (the pending set: at least one member still has them as
-- 'watchlist'). The RPC validates the list is exactly that set (no duplicates,
-- no missing title), then rewrites positions 1..N in a single transaction and
-- compacts any kept rows (titles whose status changed away from 'watchlist')
-- after the pending block so they never occupy a pending slot.
create or replace function public.reorder_household_watchlist(p_ordered_title_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid;
  caller_household uuid;
  i integer;
  n integer;
  k integer := 0;
  rec record;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into caller_household
  from public.profiles
  where id = caller_id;
  if caller_household is null then
    raise exception 'You do not belong to a household.'
      using errcode = 'no_data_found';
  end if;

  n := coalesce(array_length(p_ordered_title_ids, 1), 0);

  -- No duplicates.
  if exists (
    select 1 from unnest(p_ordered_title_ids) t(id)
    group by t.id having count(*) > 1
  ) then
    raise exception 'The reordered list contains duplicate titles.'
      using errcode = 'check_violation';
  end if;

  -- Every passed id must be a pending title of this household right now.
  if exists (
    select 1 from unnest(p_ordered_title_ids) t(id)
    where not exists (
      select 1
      from public.household_watchlist_order w
      join public.user_title_state s on s.title_id = w.title_id
      join public.profiles p on p.id = s.user_id
      where w.household_id = caller_household
        and w.title_id = t.id
        and s.watch_status = 'watchlist'
        and p.household_id = caller_household
    )
  ) then
    raise exception 'Cannot reorder titles that are not pending in your watchlist.'
      using errcode = 'check_violation';
  end if;

  -- The list must contain exactly the currently pending titles: this keeps
  -- positions continuous and gap-free (the client always sends the whole
  -- pending list) and rejects stale or forged reorders.
  if n <> (
    select count(distinct w.title_id)
    from public.household_watchlist_order w
    join public.user_title_state s on s.title_id = w.title_id
    join public.profiles p on p.id = s.user_id
    where w.household_id = caller_household
      and s.watch_status = 'watchlist'
      and p.household_id = caller_household
  ) then
    raise exception 'The reorder must include the whole pending watchlist.'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('watchus_watchlist:' || caller_household::text));

  -- Offset every row so compaction never collides with the pending rewrite.
  update public.household_watchlist_order
  set position = position + 1000000
  where household_id = caller_household;

  -- Write the pending order 1..N in the passed order.
  for i in 1..n loop
    update public.household_watchlist_order
    set position = i
    where household_id = caller_household and title_id = p_ordered_title_ids[i];
  end loop;

  -- Compact kept (no longer pending) titles right after the pending block,
  -- preserving their relative order.
  for rec in
    select w.title_id
    from public.household_watchlist_order w
    where w.household_id = caller_household
      and not exists (
        select 1 from unnest(p_ordered_title_ids) t(id) where t.id = w.title_id
      )
    order by w.position
  loop
    k := k + 1;
    update public.household_watchlist_order
    set position = n + k
    where household_id = caller_household and title_id = rec.title_id;
  end loop;
end;
$$;

grant execute on function public.reorder_household_watchlist(uuid[]) to authenticated;

comment on function public.reorder_household_watchlist(uuid[]) is
  'Atomically rewrites the household watchlist order to 1..N following the passed pending title ids, validating they match the current pending set exactly. Kept titles (no longer pending) are compacted after the pending block.';