-- Phase 3 RLS / household flow tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A creates a household, rotates the code, B joins, C is rejected
-- (max-2), D cannot see data and rejects invalid codes.
-- Expected invitation errors are caught with savepoints and verified afterwards.

-- ============================================================
-- SETUP (postgres, bypass RLS): four auth users, no household yet
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
    '{"display_name":"C"}'::jsonb),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'd@example.com',
    '{"display_name":"D"}'::jsonb);
COMMIT;

-- ============================================================
-- Scenario 1: A creates a household
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select (public.create_household('Hogar de A')).join_code as code_initial \gset hs_

select 'HS1 create_household_returns_join_code' as tag,
       (join_code is not null and length(join_code) = 8)::text as got,
       'true' as expected
from public.households
where id = (select household_id from public.profiles
            where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

select 'HS2 profile_linked_to_household' as tag,
       (household_id is not null)::text as got,
       'true' as expected
from public.profiles
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
COMMIT;

-- ============================================================
-- Scenario 2: A rotates the code, B joins with the new code
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select (public.generate_invitation_code()).join_code as code_rotated \gset hs_

select 'HS3 rotation_generates_new_code' as tag,
       (:'hs_code_rotated' is distinct from :'hs_code_initial')::text as got,
       'true' as expected;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

select 'HS4 accept_invitation_returns_household' as tag,
       (id is not null and name = 'Hogar de A' and join_code = :'hs_code_rotated')::text as got,
       'true' as expected
from public.accept_invitation_code(:'hs_code_rotated');

select 'HS4b profile_linked_to_household' as tag,
       (household_id is not null)::text as got,
       'true' as expected
from public.profiles
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

select 'HS5 second_user_in_same_household' as tag,
       (((select household_id from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
          = (select household_id from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')))::text as got,
       'true' as expected;
COMMIT;

-- ============================================================
-- Scenario 3: household is full, C is rejected
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

savepoint sp_full;
select public.accept_invitation_code(:'hs_code_rotated');
rollback to savepoint sp_full;

select 'HS6 third_user_rejected_max_two' as tag,
       (household_id is null)::text as got,
       'true' as expected
from public.profiles
where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
COMMIT;
-- (expected ERROR above: "Household is full. A household can only have 2 members.")

-- ============================================================
-- Scenario 4: D (no household, no code) cannot see A/B data via RLS
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';

select 'HS7 outsider_sees_no_households' as tag,
       count(*)::int as got,
       0 as expected
from public.households;

select 'HS8 outsider_sees_no_profiles_household' as tag,
       count(*)::int as got,
       0 as expected
from public.profiles
where household_id is not null;

savepoint sp_bogus;
select public.accept_invitation_code('boguscode');
rollback to savepoint sp_bogus;

select 'HS9 outsider_rejected_bogus_code_still_no_household' as tag,
       (household_id is null)::text as got,
       'true' as expected
from public.profiles
where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
COMMIT;
-- (expected ERROR above: "Invalid invitation code. Please check and try again.")

-- ============================================================
-- Scenario 5: A (member) cannot create a second household
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

savepoint sp_double;
select public.create_household('Hogar duplicado');
rollback to savepoint sp_double;
COMMIT;
-- (expected ERROR above: "You already belong to a household. Leave it before creating a new one.")

-- ============================================================
-- Scenario 6: A rotated code again; member reads own data
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'HS10 member_sees_own_household' as tag,
       count(*)::int as got,
       1 as expected
from public.households;

select 'HS11 member_sees_own_household_members' as tag,
       count(*)::int as got,
       2 as expected
from public.profiles
where household_id is not null;

select 'HS12 member_reads_own_join_code' as tag,
       (count(*) = 1 and max(join_code) = :'hs_code_rotated')::text as got,
       'true' as expected
from public.households;
COMMIT;

-- ============================================================
-- Scenario 7: rotating the code invalidates the previous one
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select (public.generate_invitation_code()).join_code as code_new \gset hs_
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';

savepoint sp_stale;
select public.accept_invitation_code(:'hs_code_rotated');
rollback to savepoint sp_stale;

select 'HS13 stale_code_rejected_after_rotation' as tag,
       (household_id is null)::text as got,
       'true' as expected
from public.profiles
where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
COMMIT;
-- (expected ERROR above: "Invalid invitation code. Please check and try again.")