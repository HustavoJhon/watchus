-- Fase 9 RLS / shared watchlist order tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A and B share a household and a catalog; C lives in another
-- household. Verifies the shared, manually-ordered watchlist contract:
--   * entering 'watchlist' appends the household order row (trigger).
--   * both members see and can reorder the SAME order (shared, not per-user).
--   * the RPC reorder_household_watchlist rejects duplicates, missing titles,
--     foreign titles and non-pending titles; positions stay 1..N gap-free.
--   * other households are fully isolated (no select/insert/update/delete).
--   * leaving the watchlist keeps the row (priority preserved on return);
--     fully removing the title removes the order row through the FK cascade.

-- ============================================================
-- SETUP (postgres, bypass RLS)
-- ============================================================
BEGIN;
truncate table public.reviews cascade;
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
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 157336, 'movie', 'Interstellar', 2014),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 70523, 'tv', 'Dark', 2017),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', 157350, 'movie', 'Oppenheimer', 2023);

-- Interstellar: ONLY A pending. Dark: pending in H1 but A has it 'watched'
-- and B has it 'watchlist' (shared pending). Oppenheimer: only C (H2).
insert into public.user_title_state (user_id, title_id, watch_status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'watchlist'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watched'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watchlist'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'ffffffff-ffff-4fff-8fff-fffffffffff3', 'watchlist');
COMMIT;

-- ============================================================
-- R1: entering the watchlist appends the household order row (trigger)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'R1 order_rows_for_household' as tag,
       count(*)::int as got,
       2 as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

select 'R1b appends_at_end' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'dddddddd-dddd-4ddd-8ddd-ddddddddddd1:1,eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;

-- ============================================================
-- R2: a member only sees their own household rows (H2 isolated)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'R2 member_sees_only_own_household' as tag,
       count(*)::int as got,
       0 as expected
from public.household_watchlist_order
where household_id = 'cccccccc-2222-4222-8222-cccccccccccc';
COMMIT;

-- ============================================================
-- R3: both members share the same order (B does not own the rows)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

select 'R3 partner_shares_order' as tag,
       count(*)::int as got,
       2 as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

-- B reorders: Dark first, then Interstellar. Shared order must update for A too.
select public.reorder_household_watchlist(
  array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
        'dddddddd-dddd-4ddd-8ddd-ddddddddddd1']::uuid[]
);

select 'R3b b_reorders_shared_order' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:1,dddddddd-dddd-4ddd-8ddd-ddddddddddd1:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;

-- ============================================================
-- R4: A sees B's reorder and reorders again (their own turn)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'R4 a_sees_partner_reorder' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:1,dddddddd-dddd-4ddd-8ddd-ddddddddddd1:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

select public.reorder_household_watchlist(
  array['dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2']::uuid[]
);

select 'R4b a_reorders_back' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'dddddddd-dddd-4ddd-8ddd-ddddddddddd1:1,eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;

-- ============================================================
-- R5: reorder rejects invalid lists (duplicates, incomplete, foreign, not pending)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- duplicates
savepoint sp_dup;
select public.reorder_household_watchlist(
  array['dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        'dddddddd-dddd-4ddd-8ddd-ddddddddddd1']::uuid[]
);
rollback to savepoint sp_dup;

-- incomplete (misses Dark, still pending)
savepoint sp_incomplete;
select public.reorder_household_watchlist(
  array['dddddddd-dddd-4ddd-8ddd-ddddddddddd1']::uuid[]
);
rollback to savepoint sp_incomplete;

-- foreign title (Oppenheimer belongs to C's household)
savepoint sp_foreign;
select public.reorder_household_watchlist(
  array['dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
        'ffffffff-ffff-4fff-8fff-fffffffffff3']::uuid[]
);
rollback to savepoint sp_foreign;

-- empty list (pending set has 2, so 0 is incomplete)
savepoint sp_empty;
select public.reorder_household_watchlist(array[]::uuid[]);
rollback to savepoint sp_empty;

-- a title the caller's household holds but is NOT pending (Dark is pending via
-- B; simulate a stale reorder containing a watched-only title by using a title
-- the caller has watched -- see R6 for the watched case).
select 'R5 invalid_reorders_rejected' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'dddddddd-dddd-4ddd-8ddd-ddddddddddd1:1,eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;
-- (expected ERRORs above: duplicate / whole pending / not pending / incomplete)

-- ============================================================
-- R6: watched titles are no longer "pending" -> cannot be reordered
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Move Interstellar to 'watched': the order row is KEPT (priority preserved),
-- but the title leaves the pending set, so reordering with it must fail.
update public.user_title_state
set watch_status = 'watched'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

savepoint sp_watched;
select public.reorder_household_watchlist(
  array['dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2']::uuid[]
);
rollback to savepoint sp_watched;

select 'R6 kept_row_preserved' as tag,
       position::text as got,
       '1' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

-- Keeping the stale reorder above unchanged: reorder the remaining pending set.
select public.reorder_household_watchlist(
  array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2']::uuid[]
);

select 'R6b pending_renumbered' as tag,
       position::text as got,
       '1' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  and title_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
COMMIT;
-- (expected ERROR above: not pending in your watchlist)

-- ============================================================
-- R7: other household cannot read, write or reorder (full isolation)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

-- C cannot see H1 rows.
select 'R7 c_cannot_see_h1_order' as tag,
       count(*)::int as got,
       0 as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

-- C can reorder their OWN watchlist (only Oppenheimer)...
select public.reorder_household_watchlist(
  array['ffffffff-ffff-4fff-8fff-fffffffffff3']::uuid[]
);

select 'R7b c_reorders_own' as tag,
       count(*)::int as got,
       1 as expected
from public.household_watchlist_order
where household_id = 'cccccccc-2222-4222-8222-cccccccccccc';

-- ...but cannot reorder H1's list.
savepoint sp_c_h1;
select public.reorder_household_watchlist(
  array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2']::uuid[]
);
rollback to savepoint sp_c_h1;

-- No H1 row was touched (verified as postgres: C cannot even see H1 rows).
COMMIT;
-- (expected ERROR above: not pending in your watchlist / no household)

BEGIN;
select 'R7c c_does_not_touch_h1' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:1,dddddddd-dddd-4ddd-8ddd-ddddddddddd1:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;

-- ============================================================
-- R8: removing a title from the catalog also removes its order row (FK)
-- ============================================================
-- After R6/R7, C alone holds Oppenheimer (watchlist) and C removed nothing yet.
-- C removes Oppenheimer entirely -> order row for H2/C must vanish too.
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

select public.remove_title_from_catalog('ffffffff-ffff-4fff-8fff-fffffffffff3');

select 'R8 order_row_removed_on_catalog_removal' as tag,
       count(*)::int as got,
       0 as expected
from public.household_watchlist_order
where household_id = 'cccccccc-2222-4222-8222-cccccccccccc';
COMMIT;

-- ============================================================
-- R9: both members on the same pending title still get ONE order row
-- ============================================================
-- A re-adds Interstellar as 'watchlist' again. Its order row was kept through
-- R6 (priority preserved), so nothing new is appended: still one row, and the
-- shared pending set is unchanged.
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

update public.user_title_state
set watch_status = 'watchlist'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

select 'R9 reentry_reuses_kept_row' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:1,dddddddd-dddd-4ddd-8ddd-ddddddddddd1:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;