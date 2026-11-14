-- Fase 10: ámbito de los pendientes (hogar vs personal).
--
-- El modelo anterior trataba todo pendiente como compartido: cualquier miembro
-- con watch_status='watchlist' metía el título en la cola del hogar. Eso no
-- permite decidir "esto lo veo yo solo".
--
-- Decisión (D-24): el ámbito es una propiedad de la RELACIÓN usuario-título, no
-- del título. Por eso vive en user_title_state y no en titles:
--
--   * `titles` es global entre hogares (D-04): un scope ahí haría el ámbito
--     global para todos los usuarios y hogares. Descartado.
--   * `user_title_state` ya es la fila usuario-título: ancla el ámbito al
--     usuario, hereda el aislamiento por RLS y no duplica títulos.
--   * El ámbito compartido se deriva del hogar (cualquier miembro con
--     scope='shared' lo mantiene en la cola del hogar); el personal es del
--     propio usuario.
--
-- Migración ADITIVA y no destructiva:
--   * `watch_scope not null default 'shared'` deja cada fila existente
--     exactamente como estaba (cola compartida). Ningún dato de estado, reseña,
--     rating o posición se toca.
--   * `personal_watchlist_order` es una tabla nueva; el orden compartido sigue
--     en `household_watchlist_order` y ahora solo contiene pendientes con
--     scope='shared'.
--
-- Semántica resultante:
--   * Hogar    -> ambos pueden verla, reordenarla y cambiar su estado.
--   * Personal -> solo el usuario; el orden es suyo e independiente del del
--                 hogar, y no se ve afectado por lo que haga su pareja.
--   * El mismo título puede estar en la cola del hogar (porque la pareja lo
--     marcó compartido) y en la personal del usuario (porque él lo marcó
--     personal): son dos listas distintas con posiciones propias. Dentro de cada
--     lista el título aparece una sola vez (PK).

-- ============================================================
-- 1. Ámbito por relación usuario-título
-- ============================================================
create type public.watch_scope as enum ('shared', 'personal');

alter table public.user_title_state
  add column watch_scope public.watch_scope not null default 'shared';

comment on column public.user_title_state.watch_scope is
  'Whether this member''s pending title belongs to the shared household queue or to their personal queue. Only meaningful while watch_status = ''watchlist''.';
-- ------------------------------------------------------------
-- Un título pendiente personal NO es un pendiente compartido: la fila no debe
-- aparecer en household_watchlist_order.
create index user_title_state_personal_watchlist_idx
  on public.user_title_state (user_id) where watch_status = 'watchlist' and watch_scope = 'personal';

create index user_title_state_shared_watchlist_idx
  on public.user_title_state (user_id) where watch_status = 'watchlist' and watch_scope = 'shared';

-- ============================================================
-- 2. Cola personal
-- ============================================================
create table public.personal_watchlist_order (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title_id   uuid not null references public.titles (id) on delete cascade,
  position   integer not null check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id),
  constraint personal_watchlist_order_position_unique unique (user_id, position)
);

comment on table public.personal_watchlist_order is
  'Per-user priority order of the personal pending queue. Independent from the household queue: a title can hold a position in both.';

create index personal_watchlist_order_title_id_idx
  on public.personal_watchlist_order (title_id);

create trigger personal_watchlist_order_set_updated_at
  before update on public.personal_watchlist_order
  for each row execute procedure public.set_updated_at();

alter table public.personal_watchlist_order enable row level security;

-- ============================================================
-- 3. RLS de la cola personal: estrictamente del dueño
-- ============================================================
-- El ámbito personal es del usuario, así que la frontera es auth.uid() y no el
-- hogar: otro miembro del mismo hogar tampoco puede leerla ni escribirla.
create policy "personal_watchlist_order_select_own"
  on public.personal_watchlist_order
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "personal_watchlist_order_insert_own"
  on public.personal_watchlist_order
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "personal_watchlist_order_update_own"
  on public.personal_watchlist_order
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "personal_watchlist_order_delete_own"
  on public.personal_watchlist_order
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.personal_watchlist_order from anon, authenticated;
grant select, insert, update, delete on table public.personal_watchlist_order to authenticated;

-- ============================================================
-- 4. Renumeración atómica de la cola personal
-- ============================================================
create or replace function private.renumber_personal_watchlist(
  p_user_id    uuid,
  p_title_ids  uuid[]
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  parked_from integer;
  n integer;
begin
  n := coalesce(array_length(p_title_ids, 1), 0);

  select coalesce(max(position), 0) + 1 into parked_from
  from public.personal_watchlist_order
  where user_id = p_user_id;

  update public.personal_watchlist_order
  set position = position + parked_from
  where user_id = p_user_id;

  insert into public.personal_watchlist_order (user_id, title_id, position)
  select p_user_id, v.id, v.ordinality
  from unnest(p_title_ids) with ordinality as v (id, ordinality)
  on conflict (user_id, title_id) do update
    set position = excluded.position;

  delete from public.personal_watchlist_order
  where user_id = p_user_id and position > n;
end;
$$;

revoke execute on function private.renumber_personal_watchlist(uuid, uuid[])
  from public;

comment on function private.renumber_personal_watchlist(uuid, uuid[]) is
  'Rewrites the personal watchlist order to exactly p_title_ids at 1..N, atomically and collision-free.';

-- ============================================================
-- 5. Trigger único que mantiene las dos colas coherentes
-- ============================================================
-- El anterior solo conocía la cola del hogar y no miraba el ámbito. Ahora, para
-- cada cambio de user_title_state:
--   * pendientes + shared  -> household_watchlist_order (cola del hogar);
--   * pendientes + personal-> personal_watchlist_order (cola propia);
--   * en cualquier otro caso -> se borra la fila y se compacta.
-- La cola personal NO depende del hogar: un pendiente personal mantiene su
-- posición aunque el usuario entre o salga de un hogar.
create or replace function public.sync_watchlist_order_entry()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  target_user uuid;
  target_title uuid;
  target_household uuid;
  is_pending boolean;
  is_personal boolean;
  in_shared boolean;
  in_personal boolean;
begin
  if tg_op = 'DELETE' then
    target_user := old.user_id;
    target_title := old.title_id;
    is_pending := false;
    is_personal := false;
  else
    target_user := new.user_id;
    target_title := new.title_id;
    is_pending := new.watch_status = 'watchlist';
    is_personal := new.watch_scope = 'personal';
  end if;

  select p.household_id into target_household
  from public.profiles p
  where p.id = target_user;

  -- ---------- cola personal (independiente del hogar) ----------
  perform pg_advisory_xact_lock(
    hashtext('watchus_personal_watchlist:' || target_user::text)
  );

  select true into in_personal
  from public.personal_watchlist_order w
  where w.user_id = target_user and w.title_id = target_title;

  if is_pending and is_personal then
    if not coalesce(in_personal, false) then
      insert into public.personal_watchlist_order (user_id, title_id, position)
      values (
        target_user,
        target_title,
        (
          select coalesce(max(w.position), 0) + 1
          from public.personal_watchlist_order w
          where w.user_id = target_user
        )
      )
      on conflict (user_id, title_id) do nothing;
    end if;
  elsif coalesce(in_personal, false) then
    delete from public.personal_watchlist_order
    where user_id = target_user and title_id = target_title;

    perform private.renumber_personal_watchlist(
      target_user,
      (
        select coalesce(array_agg(w.title_id order by w.position), '{}'::uuid[])
        from public.personal_watchlist_order w
        where w.user_id = target_user
      )
    );
  end if;

  -- ---------- cola compartida del hogar ----------
  if target_household is not null then
    perform pg_advisory_xact_lock(
      hashtext('watchus_watchlist:' || target_household::text)
    );

    select true into in_shared
    from public.household_watchlist_order w
    where w.household_id = target_household and w.title_id = target_title;

    if is_pending and not is_personal then
      if not coalesce(in_shared, false) then
        insert into public.household_watchlist_order (household_id, title_id, position)
        values (
          target_household,
          target_title,
          (
            select coalesce(max(w.position), 0) + 1
            from public.household_watchlist_order w
            where w.household_id = target_household
          )
        )
        on conflict (household_id, title_id) do nothing;
      end if;
    elsif coalesce(in_shared, false) and not exists (
      select 1
      from public.user_title_state s
      join public.profiles p on p.id = s.user_id
      where s.title_id = target_title
        and s.watch_status = 'watchlist'
        and s.watch_scope = 'shared'
        and p.household_id = target_household
    ) then
      delete from public.household_watchlist_order
      where household_id = target_household and title_id = target_title;

      perform private.renumber_watchlist_order(
        target_household,
        (
          select coalesce(array_agg(w.title_id order by w.position), '{}'::uuid[])
          from public.household_watchlist_order w
          where w.household_id = target_household
        )
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Se retiran los dos triggers previos antes de crear el nuevo:
--   * user_title_state_ensure_watchlist_order (Fase 9) solo conocía la cola del
--     hogar y, al no mirar el ámbito, metería en household_watchlist_order los
--     pendientes personales;
--   * user_title_state_sync_watchlist_order (integridad) queda reemplazado por
--     la versión de arriba, que además mantiene la cola personal.
-- Dejar el de la Fase 9 además duplicaría el trabajo de cada INSERT.
drop trigger if exists user_title_state_ensure_watchlist_order
  on public.user_title_state;

drop trigger if exists user_title_state_sync_watchlist_order
  on public.user_title_state;

create trigger user_title_state_sync_watchlist_order
  after insert or delete or update of watch_status, watch_scope
  on public.user_title_state
  for each row execute procedure public.sync_watchlist_order_entry();

comment on function public.sync_watchlist_order_entry() is
  'Keeps both queues exactly in sync with user_title_state: shared pending titles in household_watchlist_order, personal pending titles in personal_watchlist_order; removals compact the affected queue.';

-- ============================================================
-- 6. El trigger de hogar solo arrastra pendientes compartidos
-- ============================================================
create or replace function public.sync_watchlist_order_on_household_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.household_id is not distinct from old.household_id then
    return new;
  end if;

  if old.household_id is not null then
    perform pg_advisory_xact_lock(
      hashtext('watchus_watchlist:' || old.household_id::text)
    );

    delete from public.household_watchlist_order w
    where w.household_id = old.household_id
      and not exists (
        select 1
        from public.user_title_state s
        join public.profiles p on p.id = s.user_id
        where s.title_id = w.title_id
          and s.watch_status = 'watchlist'
          and s.watch_scope = 'shared'
          and p.household_id = old.household_id
      );

    perform private.renumber_watchlist_order(
      old.household_id,
      (
        select coalesce(array_agg(w2.title_id order by w2.position), '{}'::uuid[])
        from public.household_watchlist_order w2
        where w2.household_id = old.household_id
      )
    );
  end if;

  if new.household_id is not null then
    perform pg_advisory_xact_lock(
      hashtext('watchus_watchlist:' || new.household_id::text)
    );

    insert into public.household_watchlist_order (household_id, title_id, position)
    select new.household_id, pending.title_id, pending.next_position
    from (
      select
        s.title_id,
        coalesce(
          (
            select max(w.position)
            from public.household_watchlist_order w
            where w.household_id = new.household_id
          ),
          0
        )
        + row_number() over (order by t.created_at desc, s.title_id) as next_position
      from public.user_title_state s
      join public.titles t on t.id = s.title_id
      where s.user_id = new.id
        and s.watch_status = 'watchlist'
        and s.watch_scope = 'shared'
    ) pending
    on conflict (household_id, title_id) do nothing;
  end if;

  return new;
end;
$$;

-- ============================================================
-- 7. reorder_personal_watchlist
-- ============================================================
-- Simétrico al reordenamiento compartido, pero la frontera es el usuario: el
-- advisory lock es por usuario (dos pestañas del mismo usuario se serializan) y
-- la validación corre contra sus propias filas, así que ni la pareja ni otro
-- hogar pueden tocar esta cola ni alterar su orden.
create or replace function public.reorder_personal_watchlist(p_ordered_title_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid;
  pending_count integer;
  n integer;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  n := coalesce(array_length(p_ordered_title_ids, 1), 0);

  perform pg_advisory_xact_lock(
    hashtext('watchus_personal_watchlist:' || caller_id::text)
  );

  if exists (
    select 1 from unnest(p_ordered_title_ids) t (id)
    group by t.id having count(*) > 1
  ) then
    raise exception 'The reordered list contains duplicate titles.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_title_ids) t (id)
    where not exists (
      select 1
      from public.user_title_state s
      where s.user_id = caller_id
        and s.title_id = t.id
        and s.watch_status = 'watchlist'
        and s.watch_scope = 'personal'
    )
  ) then
    raise exception 'Cannot reorder titles that are not pending in your personal list.'
      using errcode = 'check_violation';
  end if;

  select count(*) into pending_count
  from public.user_title_state s
  where s.user_id = caller_id
    and s.watch_status = 'watchlist'
    and s.watch_scope = 'personal';

  if n <> pending_count then
    raise exception 'The reorder must include the whole pending watchlist.'
      using errcode = 'check_violation';
  end if;

  perform private.renumber_personal_watchlist(caller_id, p_ordered_title_ids);
end;
$$;

grant execute on function public.reorder_personal_watchlist(uuid[]) to authenticated;

comment on function public.reorder_personal_watchlist(uuid[]) is
  'Atomically rewrites the caller''s personal pending order to 1..N, validating the list against their own personal pending set.';

-- ============================================================
-- 8. La RPC compartida solo acepta pendientes con ámbito compartido
-- ============================================================
create or replace function public.reorder_household_watchlist(p_ordered_title_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid;
  caller_household uuid;
  pending_count integer;
  n integer;
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

  perform pg_advisory_xact_lock(
    hashtext('watchus_watchlist:' || caller_household::text)
  );

  if exists (
    select 1 from unnest(p_ordered_title_ids) t (id)
    group by t.id having count(*) > 1
  ) then
    raise exception 'The reordered list contains duplicate titles.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_title_ids) t (id)
    where not exists (
      select 1
      from public.user_title_state s
      join public.profiles p on p.id = s.user_id
      where s.title_id = t.id
        and s.watch_status = 'watchlist'
        and s.watch_scope = 'shared'
        and p.household_id = caller_household
    )
  ) then
    raise exception 'Cannot reorder titles that are not pending in your watchlist.'
      using errcode = 'check_violation';
  end if;

  select count(distinct s.title_id) into pending_count
  from public.user_title_state s
  join public.profiles p on p.id = s.user_id
  where s.watch_status = 'watchlist'
    and s.watch_scope = 'shared'
    and p.household_id = caller_household;

  if n <> pending_count then
    raise exception 'The reorder must include the whole pending watchlist.'
      using errcode = 'check_violation';
  end if;

  perform private.renumber_watchlist_order(caller_household, p_ordered_title_ids);
end;
$$;

-- ============================================================
-- 9. remove_title_from_catalog no necesita cambios
-- ============================================================
-- Su DELETE en user_title_state dispara el trigger de la sección 5, que retira
-- el título de la cola personal del llamante y de la cola del hogar si nadie más
-- lo mantiene pendiente. Ese trigger corre también cuando el llamante no tiene
-- hogar, así que no queda ninguna fila personal huérfana y la función original
-- (que solo borra filas del llamante y el título si queda huérfano) sigue siendo
-- correcta tal cual. Se deja intacta a propósito: recrearla sin necesidad
-- introduciría riesgo sin cubrir ningún hueco.

-- ============================================================
-- 10. Backfill: la cola personal de los pendientes ya existentes
-- ============================================================
-- Con el default 'shared' no hay ninguna fila personal que sembrar: cada estado
-- existente sigue siendo exactamente lo que era. El bloque solo cubre el caso de
-- una instalación donde el default se hubiera cambiado a 'personal' antes de
-- correr esta migración.
insert into public.personal_watchlist_order (user_id, title_id, position)
select pending.user_id, pending.title_id, pending.next_position
from (
  select
    s.user_id,
    s.title_id,
    coalesce(
      (
        select max(w.position)
        from public.personal_watchlist_order w
        where w.user_id = s.user_id
      ),
      0
    )
    + row_number() over (
        partition by s.user_id
        order by t.created_at desc, s.title_id
      ) as next_position
  from public.user_title_state s
  join public.titles t on t.id = s.title_id
  where s.watch_status = 'watchlist'
    and s.watch_scope = 'personal'
) pending
on conflict (user_id, title_id) do nothing;

-- La cola del hogar solo debe contener pendientes compartidos (idempotente).
delete from public.household_watchlist_order w
where not exists (
  select 1
  from public.user_title_state s
  join public.profiles p on p.id = s.user_id
  where s.title_id = w.title_id
    and s.watch_status = 'watchlist'
    and s.watch_scope = 'shared'
    and p.household_id = w.household_id
);

-- ============================================================
-- 11. Realtime: el cambio de orden lo ve el otro miembro
-- ============================================================
-- Sin esto el cliente dependía de staleTime/refetch por foco y una reordenación
-- tardaba hasta 30 s en verse (o se pisaba). Las tres tablas participan en la
-- publicación; RLS sigue aplicando, así que cada usuario solo recibe cambios de
-- los suyos y de su hogar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'household_watchlist_order'
    ) then
      alter publication supabase_realtime add table public.household_watchlist_order;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'personal_watchlist_order'
    ) then
      alter publication supabase_realtime add table public.personal_watchlist_order;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'user_title_state'
    ) then
      alter publication supabase_realtime add table public.user_title_state;
    end if;
  end if;
end;
$$;