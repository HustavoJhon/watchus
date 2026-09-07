-- Fase 4: catalog persistence helpers.
-- Adds: get_or_create_title RPC (race-safe, single call) and the
-- watched_at sync trigger (DB is the authority for the watched_at rule).

-- ============================================================
-- 1. get_or_create_title
-- ============================================================
-- Single-call get-or-create: inserts minimal TMDB metadata when the
-- (tmdb_id, media_type) pair does not exist yet and always returns the
-- canonical local row. The unique constraint serializes concurrent inserts
-- (insert ... on conflict do nothing), so no duplicates can be created.
create or replace function public.get_or_create_title(
  p_tmdb_id integer,
  p_media_type public.media_type,
  p_title text,
  p_year integer,
  p_overview text,
  p_poster_path text,
  p_backdrop_path text,
  p_genres text[]
)
returns public.titles
language plpgsql
security definer set search_path = ''
as $$
declare
  existing public.titles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.titles (
    tmdb_id, media_type, title, year, overview, poster_path, backdrop_path, genres
  )
  values (
    p_tmdb_id, p_media_type, p_title, p_year, p_overview,
    p_poster_path, p_backdrop_path, p_genres
  )
  on conflict (tmdb_id, media_type) do nothing;

  select * into existing
  from public.titles
  where tmdb_id = p_tmdb_id and media_type = p_media_type;

  if existing.id is null then
    raise exception 'Could not create title.';
  end if;

  return existing;
end;
$$;

comment on function public.get_or_create_title(integer, public.media_type, text, integer, text, text, text, text[]) is
  'Returns the single local row for a TMDB title, creating it with minimal metadata if it does not exist. Race-safe via the titles unique constraint.';

grant execute on function public.get_or_create_title(integer, public.media_type, text, integer, text, text, text, text[]) to authenticated;

-- ============================================================
-- 2. watched_at sync trigger
-- ============================================================
-- The DB, not the client, owns the watched_at rule:
--   * marking a title watched fills watched_at when it is still null;
--   * leaving the watched state clears watched_at.
-- This keeps the CHECK (watched_at is null or watch_status = 'watched')
-- satisfiable no matter how the row is updated.
create or replace function private.sync_title_watched_at()
returns trigger
language plpgsql
as $$
begin
  if new.watch_status = 'watched' and new.watched_at is null then
    new.watched_at = now();
  elsif new.watch_status is distinct from 'watched' then
    new.watched_at = null;
  end if;

  return new;
end;
$$;

create trigger user_title_state_sync_watched_at
  before insert or update on public.user_title_state
  for each row execute procedure private.sync_title_watched_at();