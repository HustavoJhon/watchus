-- Fase 11: calificaciones por episodio para las series.
--
-- Hasta ahora una serie se puntuaba como un todo (`user_title_state.rating`).
-- Esta migración añade una fila por persona y episodio, de modo que cada quien
-- pueda puntuar los capítulos que ha visto sin tener que cerrar la serie.
--
-- Decisiones:
--   * El episodio se identifica con su id de TMDB (`tmdb_episode_id`), que es
--     estable entre temporadas y reinicios de numeración.
--   * Se guardan también `season_number`/`episode_number` para poder pintar
--     los datos sin volver a llamar a TMDB (y para validar la coherencia).
--   * La calificación es obligatoria en la fila: quitar una nota borra la fila,
--     igual que la cola privada solo existe mientras el título está pendiente.
--   * RLS: cada persona escribe solo sus filas, y el hogar puede leer las de
--     ambos miembros para mostrar «tu nota» y «la de tu pareja», igual que ya
--     ocurre con la calificación del título.

create table public.episode_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  tmdb_episode_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  rating numeric(2, 1) not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint episode_ratings_pkey primary key (user_id, title_id, tmdb_episode_id),
  constraint episode_ratings_rating_range check (rating >= 0.5 and rating <= 5.0),
  constraint episode_ratings_rating_step check ((rating * 10) % 5 = 0),
  constraint episode_ratings_season_number check (season_number >= 0),
  constraint episode_ratings_episode_number check (episode_number >= 0)
);

create index episode_ratings_title_idx
  on public.episode_ratings (title_id, tmdb_episode_id);

create index episode_ratings_user_idx
  on public.episode_ratings (user_id);

create trigger episode_ratings_set_updated_at
  before update on public.episode_ratings
  for each row execute function public.set_updated_at();

alter table public.episode_ratings enable row level security;

create policy "episode_ratings_select_self_or_household"
  on public.episode_ratings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select private.my_watch_partners())
  );

create policy "episode_ratings_insert_self"
  on public.episode_ratings
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "episode_ratings_update_self"
  on public.episode_ratings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "episode_ratings_delete_self"
  on public.episode_ratings
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.episode_ratings to authenticated;

-- Quitar un título del catálogo también borra las notas de sus episodios del
-- propio usuario. Si la pareja conserva el título, las notas de ella siguen.
create or replace function public.remove_title_from_catalog(p_title_id uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.user_title_state
    where title_id = p_title_id and user_id = caller_id
  ) then
    raise exception 'The title is not in your catalog.'
      using errcode = 'check_violation';
  end if;

  delete from public.user_title_state
  where title_id = p_title_id and user_id = caller_id;

  delete from public.reviews
  where title_id = p_title_id and user_id = caller_id;

  delete from public.episode_ratings
  where title_id = p_title_id and user_id = caller_id;

  delete from public.titles t
  where t.id = p_title_id
    and not exists (
      select 1 from public.user_title_state s where s.title_id = t.id
    )
    and not exists (
      select 1 from public.reviews r where r.title_id = t.id
    )
    and not exists (
      select 1 from public.episode_ratings e where e.title_id = t.id
    );

  return found;
end;
$$;

grant execute on function public.remove_title_from_catalog(uuid) to authenticated;

comment on function public.remove_title_from_catalog(uuid) is
  'Removes the caller''s own user_title_state, reviews and episode ratings for a title and deletes the shared title row only when it becomes orphaned. Returns true when the title itself was deleted, false when the household still holds it.';

comment on table public.episode_ratings is
  'Per-member episode ratings for a series. One row per user, title and TMDB episode; the household can read both members'' rows.';
