-- Initial schema for WatchUs.
-- Follows docs/data-model.md (Fase 1 design).
-- Covers: enums, tables, constraints, indexes, updated_at triggers,
-- auth user trigger, private helpers, RLS policies and grants.

-- ============================================================
-- 0. Extensions
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- 1. Enums
-- ============================================================
create type public.media_type as enum ('movie', 'tv');

create type public.watch_status as enum ('watchlist', 'watching', 'watched');

-- ============================================================
-- 2. Tables
-- ============================================================
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.households is
  'Group of two users that share a collection.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_empty check (length(btrim(display_name)) > 0)
);

comment on table public.profiles is
  'Public profile per user, linked to auth.users.';

create index profiles_household_id_idx on public.profiles (household_id);

create table public.titles (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type public.media_type not null,
  title text not null,
  year integer,
  overview text not null default '',
  poster_path text,
  backdrop_path text,
  genres text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint titles_tmdb_media_type_unique unique (tmdb_id, media_type),
  constraint titles_year_range check (year is null or year between 1850 and 2100)
);

comment on table public.titles is
  'Shared catalog. A title exists exactly once per tmdb_id + media_type.';

create index titles_media_type_idx on public.titles (media_type);
create index titles_genres_idx on public.titles using gin (genres);

create table public.user_title_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  watch_status public.watch_status,
  watched_at date,
  is_favorite boolean not null default false,
  rating numeric(2, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id),
  constraint user_title_state_rating_range check (rating is null or rating between 0.5 and 5.0),
  constraint user_title_state_rating_step check (rating is null or (rating * 10) % 5 = 0),
  constraint user_title_state_watched_at_requires_watched check (
    watched_at is null or watch_status = 'watched'
  )
);

comment on table public.user_title_state is
  'Per-user relation to a title: watch status, favorite flag and rating.';

create index user_title_state_title_id_idx on public.user_title_state (title_id);
create index user_title_state_favorite_idx on public.user_title_state (user_id) where is_favorite;
create index user_title_state_watchlist_idx on public.user_title_state (user_id) where watch_status = 'watchlist';

create table public.reviews (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id),
  constraint reviews_content_not_empty check (length(btrim(content)) > 0)
);

comment on table public.reviews is
  'Personal review, one row per user-title pair.';

create index reviews_title_id_idx on public.reviews (title_id);

-- ============================================================
-- 3. updated_at triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger user_title_state_set_updated_at
  before update on public.user_title_state
  for each row execute procedure public.set_updated_at();

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 4. Auth trigger: create a profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, household_id, display_name)
  values (
    new.id,
    null,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 5. Private helper functions used by RLS policies
-- ============================================================
-- Security definer: breaks the policy recursion that would occur if these
-- helpers ran as the caller (they read profiles, whose policies reference them).
create schema if not exists private;

create or replace function private.my_household_id()
returns uuid
language sql
stable
security definer set search_path = ''
as $$
  select household_id
  from public.profiles
  where id = (select auth.uid());
$$;

create or replace function private.my_watch_partners()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select id
  from public.profiles
  where household_id = (select private.my_household_id());
$$;

revoke execute on function private.my_household_id() from public;
revoke execute on function private.my_watch_partners() from public;
grant usage on schema private to authenticated;
grant execute on function private.my_household_id() to authenticated;
grant execute on function private.my_watch_partners() to authenticated;

-- ============================================================
-- 6. Row Level Security
-- ============================================================
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.titles enable row level security;
alter table public.user_title_state enable row level security;
alter table public.reviews enable row level security;

-- Grants: authenticated only; extra tables get no grant by default.
revoke all on table public.households from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.titles from anon, authenticated;
revoke all on table public.user_title_state from anon, authenticated;
revoke all on table public.reviews from anon, authenticated;

grant select, update on table public.households to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.titles to authenticated;
grant select, insert, update, delete on table public.user_title_state to authenticated;
grant select, insert, update, delete on table public.reviews to authenticated;

-- ---------- households ----------
create policy "households_select_members"
  on public.households for select
  to authenticated
  using (id = (select private.my_household_id()));

create policy "households_update_members"
  on public.households for update
  to authenticated
  using (id = (select private.my_household_id()))
  with check (id = (select private.my_household_id()));

-- ---------- profiles ----------
create policy "profiles_select_self_or_household"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or household_id = (select private.my_household_id()));

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_self_keep_household"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and household_id is not distinct from (select private.my_household_id())
  );

create policy "profiles_delete_self"
  on public.profiles for delete
  to authenticated
  using (id = (select auth.uid()));

-- ---------- titles (shared catalog) ----------
create policy "titles_select_authenticated"
  on public.titles for select
  to authenticated
  using (true);

create policy "titles_insert_authenticated"
  on public.titles for insert
  to authenticated
  with check (true);

create policy "titles_update_authenticated"
  on public.titles for update
  to authenticated
  using (true)
  with check (true);

create policy "titles_delete_authenticated"
  on public.titles for delete
  to authenticated
  using (true);

-- ---------- user_title_state ----------
create policy "user_title_state_select_self_or_household"
  on public.user_title_state for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select private.my_watch_partners())
  );

create policy "user_title_state_insert_self"
  on public.user_title_state for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_title_state_update_self"
  on public.user_title_state for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user_title_state_delete_self"
  on public.user_title_state for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------- reviews ----------
create policy "reviews_select_self_or_household"
  on public.reviews for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select private.my_watch_partners())
  );

create policy "reviews_insert_self"
  on public.reviews for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "reviews_update_self"
  on public.reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reviews_delete_self"
  on public.reviews for delete
  to authenticated
  using (user_id = (select auth.uid()));