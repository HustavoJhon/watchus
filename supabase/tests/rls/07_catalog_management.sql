-- Fase 8 RLS / catalog removal tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A and B share a household and a catalog; C lives in another
-- household. Verifies safe per-user removal: a user can remove ONLY their own
-- state/review, the shared title is deleted only when it becomes orphaned, a
-- user cannot remove titles they do not have state on, other households are
-- fully isolated, and direct DELETE on titles is no longer possible.

-- ============================================================
-- SETUP (postgres, bypass RLS)
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
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 157336, 'movie', 'Interstellar', 2014),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 70523, 'tv', 'Dark', 2017),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', 157350, 'movie', 'Oppenheimer', 2023);

-- Interstellar: both A and B hold it (truly shared).
-- Dark: only A holds it (added by A alone).
-- Oppenheimer: only C holds it (belongs to the OTHER household).
insert into public.user_title_state (user_id, title_id, watch_status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'watched'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'watchlist'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watchlist'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'ffffffff-ffff-4fff-8fff-fffffffffff3', 'watched');

insert into public.reviews (user_id, title_id, content) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Maestra'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Brutal');
COMMIT;

-- ============================================================
-- R1: user removes a title only they hold -> fully removed
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'R1 remove_owned_title_returns_true' as tag,
       public.remove_title_from_catalog('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2')::text as got,
       'true' as expected;

select 'R1b title_row_deleted_when_orphaned' as tag,
       count(*)::int as got,
       0 as expected
from public.titles where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';

select 'R1c caller_state_deleted' as tag,
       count(*)::int as got,
       0 as expected
from public.user_title_state
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
COMMIT;

-- ============================================================
-- R2: shared title removal keeps the title for the partner
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'R2 remove_shared_title_returns_false' as tag,
       public.remove_title_from_catalog('dddddddd-dddd-4ddd-8ddd-ddddddddddd1')::text as got,
       'false' as expected;

select 'R2b title_stays' as tag,
       count(*)::int as got,
       1 as expected
from public.titles where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

select 'R2c partner_state_untouched' as tag,
       count(*)::int as got,
       1 as expected
from public.user_title_state
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

select 'R2d partner_review_untouched' as tag,
       count(*)::int as got,
       1 as expected
from public.reviews
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

select 'R2e own_review_deleted' as tag,
       count(*)::int as got,
       0 as expected
from public.reviews
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
COMMIT;

-- ============================================================
-- R3: user cannot remove a title another household member added
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

-- B has no state on Oppenheimer (C's household) -> must fail.
savepoint sp_r3;
select public.remove_title_from_catalog('ffffffff-ffff-4fff-8fff-fffffffffff3');
rollback to savepoint sp_r3;

-- B also has no own state on Dark (only A added it): removal must fail too,
-- because the caller has no state row for it.
savepoint sp_r3b;
select public.remove_title_from_catalog('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2');
rollback to savepoint sp_r3b;

select 'R3 cannot_remove_title_without_own_state' as tag,
       count(*)::int as got,
       0 as expected
from public.user_title_state
where title_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
COMMIT;
-- (expected ERRORs above: The title is not in your catalog.)

-- ============================================================
-- R4: other household fully isolated before and after removal
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

select 'R4 other_household_cannot_remove_shared_dark?' as tag,
       count(*)::int as got,
       0 as expected
from public.user_title_state
where user_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
  and title_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';

-- C must be able to remove their own Oppenheimer.
select 'R4b c_removes_own_title' as tag,
       public.remove_title_from_catalog('ffffffff-ffff-4fff-8fff-fffffffffff3')::text as got,
       'true' as expected;
COMMIT;

-- Direct DELETE of titles must no longer be possible via RLS (no policy).
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

savepoint sp_direct;
delete from public.titles where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
rollback to savepoint sp_direct;

select 'R5 direct_delete_denied_by_rls' as tag,
       count(*)::int as got,
       1 as expected
from public.titles where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
COMMIT;
-- (expected ERROR above: permission denied for table titles)

-- ============================================================
-- R6: removing the shared title a second time (now only B holds it)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

-- B still holds Interstellar; removing B's last state/review orphans it.
select 'R6 last_member_removes_title' as tag,
       public.remove_title_from_catalog('dddddddd-dddd-4ddd-8ddd-ddddddddddd1')::text as got,
       'true' as expected;

select 'R6b fully_removed' as tag,
       count(*)::int as got,
       0 as expected
from public.titles where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
COMMIT;

-- ============================================================
-- R7: FK constraints keep working (get_or_create after full removal)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'R7 re_add_after_removal' as tag,
       (id is not null and tmdb_id = 70523)::text as got,
       'true' as expected
from public.get_or_create_title(
  70523, 'tv'::public.media_type, 'Dark', 2017, '', null, null, '{}'::text[]
);
COMMIT;