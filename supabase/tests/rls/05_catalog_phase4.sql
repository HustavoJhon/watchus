-- Fase 4 RLS / catalog flow tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A creates/gets titles (dedup), A adds to watchlist, state rules
-- (watched_at sync), rating constraints, favorites, cross-user isolation,
-- titles unique constraint and watched-by-both derivation.

-- ============================================================
-- SETUP (postgres, bypass RLS): two auth users in the same household
-- ============================================================
BEGIN;
truncate table public.reviews cascade;
truncate table public.user_title_state cascade;
truncate table public.titles cascade;
truncate table public.households cascade;
truncate table public.profiles cascade;
truncate table auth.users cascade;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'a@example.com',
    '{"display_name":"A"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'b@example.com',
    '{"display_name":"B"}'::jsonb);

insert into public.households (id, name) values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Hogar de A y B');

update public.profiles set household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
               'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
COMMIT;

-- ============================================================
-- Scenario 1: get_or_create_title dedup
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'CT1 get_or_create_returns_title' as tag,
       (id is not null and tmdb_id = 157336 and media_type = 'movie'::public.media_type
        and title = 'Interstellar' and year = 2014 and genres = array['Drama','Sci-Fi']::text[])::text as got,
       'true' as expected
from public.get_or_create_title(
  157336, 'movie'::public.media_type, 'Interstellar', 2014,
  'Una misión interestelar.', '/poster.jpg', '/backdrop.jpg',
  array['Drama','Sci-Fi']::text[]
);

select 'CT2 get_or_create_is_idempotent' as tag,
       (id = (select id from public.titles where tmdb_id = 157336 and media_type = 'movie'))::text as got,
       'true' as expected
from public.get_or_create_title(
  157336, 'movie'::public.media_type, 'Interstellar', 2014,
  'Texto distinto NO debe sobrescribir.', null, null, '{}'::text[]
);

select 'CT2b metadata_not_overwritten' as tag,
       (title = 'Interstellar' and overview = 'Una misión interestelar.'
        and poster_path = '/poster.jpg' and genres = array['Drama','Sci-Fi']::text[])::text as got,
       'true' as expected
from public.titles
where tmdb_id = 157336 and media_type = 'movie';

select 'CT3 single_row_per_tmdb_title' as tag,
       count(*)::int as got,
       1 as expected
from public.titles
where tmdb_id = 157336 and media_type = 'movie';
COMMIT;

-- ============================================================
-- Scenario 2: direct duplicate is rejected by the unique constraint
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

savepoint sp_dup;
insert into public.titles (tmdb_id, media_type, title) values (157336, 'movie', 'Interstellar duplicado');
rollback to savepoint sp_dup;
COMMIT;
-- (expected ERROR above: duplicate key value violates unique constraint "titles_tmdb_media_type_unique")

-- ============================================================
-- Scenario 3: A adds to watchlist and state rules
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

insert into public.user_title_state (user_id, title_id, watch_status)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', id, 'watchlist'
from public.titles where tmdb_id = 157336 and media_type = 'movie';

select 'CT4 add_defaults_to_watchlist' as tag,
       (watch_status = 'watchlist'::public.watch_status and rating is null and is_favorite = false)::text as got,
       'true' as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

select 'CT5 adding_again_is_idempotent' as tag,
       count(*)::int as got,
       1 as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

-- watched: watched_at auto-filled by the trigger
update public.user_title_state set watch_status = 'watched'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

select 'CT6 watched_sets_watched_at' as tag,
       (watch_status = 'watched' and watched_at is not null)::text as got,
       'true' as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

-- leaving watched clears watched_at
update public.user_title_state set watch_status = 'watching'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

select 'CT7 leaving_watched_clears_watched_at' as tag,
       (watch_status = 'watching' and watched_at is null)::text as got,
       'true' as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

-- watch_status null -> watched_at also null (trigger)
update public.user_title_state set watch_status = null
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

select 'CT8 null_status_clears_watched_at' as tag,
       (watch_status is null and watched_at is null)::text as got,
       'true' as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

-- rating valid
update public.user_title_state set rating = 4.5, is_favorite = true
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

select 'CT9 rating_and_favorite_apply' as tag,
       (rating = 4.5 and is_favorite = true)::text as got,
       'true' as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

-- rating out of range / step forbidden by CHECK constraints
savepoint sp_rating_range;
update public.user_title_state set rating = 5.5
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);
rollback to savepoint sp_rating_range;

savepoint sp_rating_step;
update public.user_title_state set rating = 4.3
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);
rollback to savepoint sp_rating_step;

select 'CT10 invalid_ratings_rejected' as tag,
       (rating = 4.5)::text as got,
       'true' as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);
COMMIT;
-- (expected ERRORs above: rating 5.5 out of range, rating 4.3 breaks the 0.5 step)

-- ============================================================
-- Scenario 4: cross-user isolation
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaabb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

-- Cannot create a row for another user (RLS with check)
savepoint sp_is;
insert into public.user_title_state (user_id, title_id, watch_status)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', id, 'watchlist'::public.watch_status
from public.titles where tmdb_id = 157336;
rollback to savepoint sp_is;
COMMIT;
-- (expected ERROR above: new row violates row-level security policy)

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Direct duplicate insert (same user+title) is a no-op via PK conflict
insert into public.user_title_state (user_id, title_id, watch_status)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', id, 'watchlist'
from public.titles where tmdb_id = 157336
on conflict (user_id, title_id) do nothing;

select 'CT11 duplicate_state_noop' as tag,
       count(*)::int as got,
       1 as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

-- Cannot update another user's state via RLS: 0 rows affected
with upd as (
  update public.user_title_state set watch_status = 'watched'
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    and title_id = (select id from public.titles where tmdb_id = 157336)
  returning 1
)
select 'CT12 cannot_update_others_state' as tag,
       count(*)::int as got,
       0 as expected
from upd;

-- Cannot change the owner of a row via RLS with check
savepoint sp_owner;
update public.user_title_state set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);
rollback to savepoint sp_owner;
COMMIT;
-- (expected ERROR above: new row violates row-level security policy)

-- ============================================================
-- Scenario 5: B manages own state; watched-by-both derivation
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

insert into public.user_title_state (user_id, title_id, watch_status)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', id, 'watchlist'
from public.titles where tmdb_id = 157336;

update public.user_title_state set watch_status = 'watched', rating = 3.5
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  and title_id = (select id from public.titles where tmdb_id = 157336);

select 'CT13 b_updates_own_state' as tag,
       (watch_status = 'watched' and rating = 3.5 and watched_at is not null)::text as got,
       'true' as expected
from public.user_title_state
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  and title_id = (select id from public.titles where tmdb_id = 157336);
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- A makes it watched again so both members are watched for the title
update public.user_title_state set watch_status = 'watched'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = (select id from public.titles where tmdb_id = 157336);

select 'CT14 watched_by_both_derives_from_states' as tag,
       (count(*) = 2)::text as got,
       'true' as expected
from public.user_title_state
where title_id = (select id from public.titles where tmdb_id = 157336)
  and watch_status = 'watched'
  and user_id in (select private.my_watch_partners());
COMMIT;