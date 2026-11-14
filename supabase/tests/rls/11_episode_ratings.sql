-- Fase 11 RLS / per-episode ratings tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A and B share a household, C lives in another household.
--
-- Contract pinned here:
--   * each member writes ONLY their own episode ratings (insert/update/delete),
--   * the household can READ both members' ratings (the UI shows the partner's
--     note next to each episode),
--   * another household sees nothing,
--   * the rating/season/episode constraints are enforced by the database,
--   * removing a title deletes the caller's episode ratings but keeps the
--     partner's rows while the title stays in the household catalog.

\pset format unaligned

-- ============================================================
-- SETUP (postgres, bypass RLS)
-- ============================================================
BEGIN;
truncate table public.episode_ratings cascade;
truncate table public.reviews cascade;
truncate table public.personal_watchlist_order cascade;
truncate table public.household_watchlist_order cascade;
truncate table public.user_title_state cascade;
truncate table public.titles cascade;
truncate table public.households cascade;
truncate table public.profiles cascade;
truncate table auth.users cascade;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a@example.com',
    '{"display_name":"A"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'b@example.com',
    '{"display_name":"B"}'::jsonb),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'c@example.com',
    '{"display_name":"C"}'::jsonb);

insert into public.households (id, name) values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Hogar de A y B'),
  ('cccccccc-2222-4222-8222-cccccccccccc', 'Hogar de C');

update public.profiles set household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
               'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
update public.profiles set household_id = 'cccccccc-2222-4222-8222-cccccccccccc'
  where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

insert into public.titles (id, tmdb_id, media_type, title, year) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 1396, 'tv', 'Breaking Bad', 2008),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', 1399, 'tv', 'Juego de tronos', 2011);

insert into public.user_title_state (user_id, title_id, watch_status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watching'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watched'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'ffffffff-ffff-4fff-8fff-fffffffffff3', 'watching');

-- A rated two episodes of Breaking Bad; B rated one of them; C rated an episode
-- of their own series (other household).
insert into public.episode_ratings
  (user_id, title_id, tmdb_episode_id, season_number, episode_number, rating)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62085, 1, 1, 5.0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62086, 1, 2, 4.0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62085, 1, 1, 3.5),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'ffffffff-ffff-4fff-8fff-fffffffffff3', 63000, 1, 1, 2.5);
COMMIT;

-- ============================================================
-- E1: the owner reads only their own rows...
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
)
select 'E1 owner_reads_own_ratings' as tag, c as got, 2 as expected from q;
COMMIT;

-- ============================================================
-- E2: ...and also the partner's rows, so the UI can show both notes
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
)
select 'E2 partner_reads_household_ratings' as tag, c as got, 1 as expected from q;

with q as (
  select rating from public.episode_ratings
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    and tmdb_episode_id = 62085
)
select 'E3 partner_rating_value_visible' as tag, rating::text as got, '3.5' as expected from q;
COMMIT;

-- ============================================================
-- E4: another household stays invisible
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id <> 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
)
select 'E4 other_household_hidden' as tag, c as got, 0 as expected from q;
COMMIT;

-- ============================================================
-- E5: nobody can write another member's ratings
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Inserting a row attributed to B must be rejected by the INSERT policy.
savepoint sp_e5_insert;
insert into public.episode_ratings
  (user_id, title_id, tmdb_episode_id, season_number, episode_number, rating)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62087, 1, 3, 1.0);
rollback to savepoint sp_e5_insert;

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    and tmdb_episode_id = 62087
)
select 'E5 cannot_insert_for_partner' as tag, c as got, 0 as expected from q;

-- Updating B's row affects nothing (USING filters it out).
update public.episode_ratings set rating = 1.0
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  and tmdb_episode_id = 62085;

with q as (
  select rating from public.episode_ratings
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    and tmdb_episode_id = 62085
)
select 'E6 cannot_update_partner_rating' as tag, rating::text as got, '3.5' as expected from q;

-- Deleting B's row affects nothing either.
delete from public.episode_ratings
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  and tmdb_episode_id = 62085;

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    and tmdb_episode_id = 62085
)
select 'E7 cannot_delete_partner_rating' as tag, c as got, 1 as expected from q;
COMMIT;
-- (expected ERROR above: new row violates row-level security policy for table
--  "episode_ratings".)

-- ============================================================
-- E8: the owner can rate, re-rate and clear their own episodes
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

insert into public.episode_ratings
  (user_id, title_id, tmdb_episode_id, season_number, episode_number, rating)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62087, 1, 3, 4.5)
on conflict (user_id, title_id, tmdb_episode_id)
do update set rating = excluded.rating;

update public.episode_ratings set rating = 2.5
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and tmdb_episode_id = 62087;

with q as (
  select rating from public.episode_ratings
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and tmdb_episode_id = 62087
)
select 'E8 owner_upserts_own_rating' as tag, rating::text as got, '2.5' as expected from q;

delete from public.episode_ratings
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and tmdb_episode_id = 62087;

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and tmdb_episode_id = 62087
)
select 'E9 owner_clears_own_rating' as tag, c as got, 0 as expected from q;
COMMIT;

-- ============================================================
-- E10: rating/season/episode constraints are enforced
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Out of range.
savepoint sp_e10_range;
insert into public.episode_ratings
  (user_id, title_id, tmdb_episode_id, season_number, episode_number, rating)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62090, 1, 4, 5.5);
rollback to savepoint sp_e10_range;

-- Not a 0.5 step.
savepoint sp_e10_step;
insert into public.episode_ratings
  (user_id, title_id, tmdb_episode_id, season_number, episode_number, rating)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62090, 1, 4, 4.3);
rollback to savepoint sp_e10_step;

-- Negative episode number.
savepoint sp_e10_number;
insert into public.episode_ratings
  (user_id, title_id, tmdb_episode_id, season_number, episode_number, rating)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 62090, 1, -1, 4.0);
rollback to savepoint sp_e10_number;

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and tmdb_episode_id = 62090
)
select 'E10 invalid_ratings_rejected' as tag, c as got, 0 as expected from q;
COMMIT;
-- (expected ERRORs above: check constraint violations.)

-- ============================================================
-- E11: removing the title deletes the caller's episode rows only
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'E11 remove_shared_series_returns_false' as tag,
       public.remove_title_from_catalog('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2')::text as got,
       'false' as expected;

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
)
select 'E12 own_ratings_deleted' as tag, c as got, 0 as expected from q;

with q as (
  select count(*)::int c from public.episode_ratings
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
)
select 'E13 partner_ratings_kept' as tag, c as got, 1 as expected from q;

with q as (
  select count(*)::int c from public.titles
  where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
)
select 'E14 title_stays_for_partner' as tag, c as got, 1 as expected from q;
COMMIT;

-- ============================================================
-- E15: policy shape, so a future edit cannot silently widen writes
-- ============================================================
with q as (
  select count(*)::int c from pg_policies
  where tablename = 'episode_ratings'
    and cmd = 'SELECT'
    and qual ilike '%my_watch_partners%'
)
select 'E15 select_policy_includes_household' as tag, c as got, 1 as expected from q;

with q as (
  select count(*)::int c from pg_policies
  where tablename = 'episode_ratings'
    and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and (qual is null or qual ilike '%auth.uid()%')
    and (with_check is null or with_check ilike '%auth.uid()%')
)
select 'E16 write_policies_are_own_only' as tag, c as got, 3 as expected from q;
