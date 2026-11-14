-- Fase 10 RLS / watchlist scopes tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A and B share a household, C lives in another household.
-- Verifies the shared/personal scope contract:
--   * every existing row defaults to 'shared', so no data changes meaning.
--   * a 'personal' pending title does NOT enter household_watchlist_order; a
--     'shared' one does not enter personal_watchlist_order.
--   * the same title can hold a position in BOTH queues (B shared, A personal)
--     and the two orders are fully independent.
--   * the personal queue is private to its owner: the partner cannot read it,
--     write it, or reorder it, even inside the same household.
--   * reorder_personal_watchlist validates against the caller's OWN personal
--     pending set and rejects duplicates, foreign titles and partial lists.
--   * reorder_household_watchlist rejects a title that is only personal.
--   * leaving the pending set drops the row and compacts that queue; re-entering
--     appends at the end. The partner's claim on the title keeps the shared row.
--   * the personal queue survives a household change and catalog removal.

\pset format unaligned

-- ============================================================
-- SETUP (postgres, bypass RLS)
-- ============================================================
BEGIN;
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
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 157336, 'movie', 'Interstellar', 2014),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 70523, 'tv', 'Dark', 2017),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', 157350, 'movie', 'Oppenheimer', 2023),
  ('11111111-1111-4111-8111-111111111111', 163872, 'movie', 'Sicario', 2015),
  ('22222222-2222-4222-8222-222222222222', 87108, 'tv', 'Chernobyl', 2019);

-- t1 shared by A; t2 shared by B; t3 shared by B AND personal for A;
-- t4 personal for A only; t5 belongs to C's household.
insert into public.user_title_state (user_id, title_id, watch_status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'watchlist');

insert into public.user_title_state (user_id, title_id, watch_status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watchlist');

-- t3 enters as PERSONAL for A first, so it must not reach the household queue.
insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ffffffff-ffff-4fff-8fff-fffffffffff3', 'watchlist', 'personal');

-- Then B marks the same title as SHARED, which puts it in the household queue
-- while A keeps his own personal position for it.
insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ffffffff-ffff-4fff-8fff-fffffffffff3', 'watchlist', 'shared');

-- A gets a second personal title so queue order is observable.
insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'watchlist', 'personal');

-- C is in another household, pending t5 shared.
insert into public.user_title_state (user_id, title_id, watch_status) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', '22222222-2222-4222-8222-222222222222', 'watchlist');
COMMIT;

-- ============================================================
-- S1: existing rows default to 'shared' (no behaviour change)
-- ============================================================
BEGIN;
select 'S1 default_scope_is_shared' as tag,
       count(*)::int as got,
       4 as expected
from public.user_title_state
where watch_status = 'watchlist' and watch_scope = 'shared';

select 'S1b explicit_personal_kept' as tag,
       count(*)::int as got,
       2 as expected
from public.user_title_state
where watch_status = 'watchlist' and watch_scope = 'personal';
COMMIT;

-- ============================================================
-- S2: a personal title is absent from the household queue
-- ============================================================
BEGIN;
-- t4 is personal-only for A: B must not see it in the household queue.
select 'S2 personal_absent_from_household' as tag,
       count(*)::int as got,
       0 as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  and title_id = '11111111-1111-4111-8111-111111111111';

-- t3 is shared by B, so it IS in the household queue...
select 'S2b shared_present_in_household' as tag,
       count(*)::int as got,
       1 as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';

-- ...and the household queue is exactly the three shared titles, gap-free.
select 'S2c household_queue_is_shared_only' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'dddddddd-dddd-4ddd-8ddd-ddddddddddd1:1,eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:2,ffffffff-ffff-4fff-8fff-fffffffffff3:3' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;

-- ============================================================
-- S3: personal queue holds A's personal titles, in order
-- ============================================================
BEGIN;
select 'S3 personal_queue' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'ffffffff-ffff-4fff-8fff-fffffffffff3:1,11111111-1111-4111-8111-111111111111:2' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- B has no personal queue at all: everything of B's is shared.
select 'S3b partner_has_no_personal_queue' as tag,
       count(*)::int as got,
       0 as expected
from public.personal_watchlist_order
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
COMMIT;

-- ============================================================
-- S4: the personal queue is private to its owner (same household)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

-- B cannot read A's personal rows, even though they share a household.
select 'S4 partner_cannot_read_personal' as tag,
       count(*)::int as got,
       0 as expected
from public.personal_watchlist_order;

-- B cannot write into A's personal queue.
savepoint sp_partner_write;
insert into public.personal_watchlist_order (user_id, title_id, position) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-2222-4222-8222-222222222222',
  99
);
rollback to savepoint sp_partner_write;

-- B cannot reorder A's personal queue.
savepoint sp_partner_reorder;
select public.reorder_personal_watchlist(
  array['11111111-1111-4111-8111-111111111111',
        'ffffffff-ffff-4fff-8fff-fffffffffff3']::uuid[]
);
rollback to savepoint sp_partner_reorder;
COMMIT;
-- (expected ERRORs above: RLS policy on the insert, and
--  "not pending in your personal list" for B on t3/t4)

-- Verified as postgres, because B's own reads of A's queue return nothing: that
-- is exactly the isolation asserted above, so the check cannot run as B.
BEGIN;
select 'S4b personal_queue_untouched' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'ffffffff-ffff-4fff-8fff-fffffffffff3:1,11111111-1111-4111-8111-111111111111:2' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
COMMIT;

-- ============================================================
-- S5: reorder_personal_watchlist accepts a full, valid reorder
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select public.reorder_personal_watchlist(
  array['11111111-1111-4111-8111-111111111111',
        'ffffffff-ffff-4fff-8fff-fffffffffff3']::uuid[]
);

select 'S5 personal_reordered' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       '11111111-1111-4111-8111-111111111111:1,ffffffff-ffff-4fff-8fff-fffffffffff3:2' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Reordering A's personal list must not touch the household queue.
select 'S5b household_queue_untouched' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'dddddddd-dddd-4ddd-8ddd-ddddddddddd1:1,eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:2,ffffffff-ffff-4fff-8fff-fffffffffff3:3' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;

-- ============================================================
-- S6: reorder_personal_watchlist rejects malformed lists
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- duplicate titles
savepoint sp_dup;
select public.reorder_personal_watchlist(
  array['11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111']::uuid[]
);
rollback to savepoint sp_dup;

-- title that is shared-pending for A, not personal
savepoint sp_foreign;
select public.reorder_personal_watchlist(
  array['11111111-1111-4111-8111-111111111111',
        'dddddddd-dddd-4ddd-8ddd-ddddddddddd1']::uuid[]
);
rollback to savepoint sp_foreign;

-- title that belongs to nobody / another household
savepoint sp_other_household;
select public.reorder_personal_watchlist(
  array['22222222-2222-4222-8222-222222222222']::uuid[]
);
rollback to savepoint sp_other_household;

-- incomplete list (drops one of A's two personal titles)
savepoint sp_partial;
select public.reorder_personal_watchlist(
  array['11111111-1111-4111-8111-111111111111']::uuid[]
);
rollback to savepoint sp_partial;

-- no partial write survived any rejection
select 'S6 rejected_reorders_change_nothing' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       '11111111-1111-4111-8111-111111111111:1,ffffffff-ffff-4fff-8fff-fffffffffff3:2' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
COMMIT;
-- (expected ERRORs above: duplicate / not pending in your personal list /
--  whole pending watchlist)

-- ============================================================
-- S7: the shared RPC refuses a title that is only personal
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- t4 is A's personal title: A cannot use it to reorder the household queue.
savepoint sp_personal_in_shared;
select public.reorder_household_watchlist(
  array['dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
        'ffffffff-ffff-4fff-8fff-fffffffffff3',
        '11111111-1111-4111-8111-111111111111']::uuid[]
);
rollback to savepoint sp_personal_in_shared;

-- A's shared claim on t3 alone does not make it reorderable for A: the shared
-- queue is the household union, so all three shared titles must be present.
savepoint sp_partial_shared;
select public.reorder_household_watchlist(
  array['11111111-1111-4111-8111-111111111111']::uuid[]
);
rollback to savepoint sp_partial_shared;

-- The valid full shared set still reorders fine (both members share it).
select public.reorder_household_watchlist(
  array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
        'ffffffff-ffff-4fff-8fff-fffffffffff3',
        'dddddddd-dddd-4ddd-8ddd-ddddddddddd1']::uuid[]
);

select 'S7 shared_reordered' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:1,ffffffff-ffff-4fff-8fff-fffffffffff3:2,dddddddd-dddd-4ddd-8ddd-ddddddddddd1:3' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

-- ...and A's personal order is still his own.
select 'S7b personal_still_independent' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       '11111111-1111-4111-8111-111111111111:1,ffffffff-ffff-4fff-8fff-fffffffffff3:2' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
COMMIT;
-- (expected ERRORs above: not pending in your watchlist)

-- ============================================================
-- S8: switching scope moves the title between the two queues
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- t3: A personal -> shared. B already holds it shared, so the household row
-- stays put; A's personal row disappears.
update public.user_title_state
set watch_scope = 'shared'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';

select 'S8 personal_row_dropped_on_scope_change' as tag,
       count(*)::int as got,
       0 as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';

-- The remaining personal title was compacted to position 1 (no gap left).
select 'S8b personal_compacted' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       '11111111-1111-4111-8111-111111111111:1' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- The household queue is unchanged: B's shared claim kept t3 in place.
select 'S8c household_keeps_t3' as tag,
       count(*)::int as got,
       1 as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';
COMMIT;

-- ============================================================
-- S9: leaving the pending set drops only the caller's queue row
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- A re-marks t3 as personal (back to the personal queue, appended), then marks
-- it 'watched'. B keeps it shared-pending, so the household row MUST survive.
update public.user_title_state
set watch_scope = 'personal'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';

select 'S9 reentering_personal_appends' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       '11111111-1111-4111-8111-111111111111:1,ffffffff-ffff-4fff-8fff-fffffffffff3:2' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

update public.user_title_state
set watch_status = 'watched'
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';

select 'S9a personal_row_dropped' as tag,
       count(*)::int as got,
       0 as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';

select 'S9b personal_compacted' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       '11111111-1111-4111-8111-111111111111:1' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- B's shared claim keeps the title in the household queue, same position.
select 'S9c household_row_survives_partner_claim' as tag,
       count(*)::int as got,
       1 as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  and title_id = 'ffffffff-ffff-4fff-8fff-fffffffffff3';
COMMIT;

-- ============================================================
-- S10: personal order survives a household change
-- ============================================================
-- A is moved to a brand-new household. The personal queue is per user and must
-- not move; A's shared-pending titles migrate to the new household and leave the
-- old one, while B's own shared titles stay put and are compacted.
--
-- Done as postgres because `authenticated` cannot change its own household (see
-- 02_hogar1_jhon T13); this exercises the profile trigger directly.
BEGIN;
insert into public.households (id, name) values
  ('33333333-3333-4333-8333-333333333333', 'Hogar nuevo de A');

update public.profiles
set household_id = '33333333-3333-4333-8333-333333333333'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- A's personal queue is untouched: same title, same position.
select 'S10 personal_survives_household_change' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       '11111111-1111-4111-8111-111111111111:1' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- A's only shared-pending title moved to the new household.
select 'S10b shared_migrates_to_new_household' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'dddddddd-dddd-4ddd-8ddd-ddddddddddd1:1' as expected
from public.household_watchlist_order
where household_id = '33333333-3333-4333-8333-333333333333';

-- The old household lost it and compacted what is left.
select 'S10c old_household_compacted' as tag,
       string_agg(title_id || ':' || position, ',' order by position) as got,
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2:1,ffffffff-ffff-4fff-8fff-fffffffffff3:2' as expected
from public.household_watchlist_order
where household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
COMMIT;

-- ============================================================
-- S11: removing a title from the catalog drops the personal row
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select public.remove_title_from_catalog('11111111-1111-4111-8111-111111111111');
COMMIT;

BEGIN;
select 'S11 personal_row_removed' as tag,
       count(*)::int as got,
       0 as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select 'S11b personal_queue_now_empty' as tag,
       coalesce(string_agg(title_id || ':' || position, ',' order by position), '') as got,
       '' as expected
from public.personal_watchlist_order
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
COMMIT;

-- ============================================================
-- S12: the queues are published for Realtime
-- ============================================================
BEGIN;
select 'S12 realtime_publication' as tag,
       count(*)::int as got,
       3 as expected
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('user_title_state', 'household_watchlist_order', 'personal_watchlist_order');
COMMIT;

-- ============================================================
-- S13: every queue is gap-free 1..N with no duplicates (invariant sweep)
-- ============================================================
BEGIN;
-- No household queue has gaps or repeated positions.
select 'S13 household_positions_are_dense' as tag,
       count(*)::int as got,
       0 as expected
from (
  select household_id
  from public.household_watchlist_order
  group by household_id
  having count(*) <> count(distinct position)
      or min(position) <> 1
      or max(position) <> count(*)
) broken;

-- Same for every personal queue.
select 'S13b personal_positions_are_dense' as tag,
       count(*)::int as got,
       0 as expected
from (
  select user_id
  from public.personal_watchlist_order
  group by user_id
  having count(*) <> count(distinct position)
      or min(position) <> 1
      or max(position) <> count(*)
) broken;

-- No shared queue row without a supporting shared-pending member.
select 'S13c no_orphan_shared_rows' as tag,
       count(*)::int as got,
       0 as expected
from public.household_watchlist_order w
where not exists (
  select 1
  from public.user_title_state s
  join public.profiles p on p.id = s.user_id
  where s.title_id = w.title_id
    and s.watch_status = 'watchlist'
    and s.watch_scope = 'shared'
    and p.household_id = w.household_id
);

-- No personal row without a supporting personal-pending owner.
select 'S13d no_orphan_personal_rows' as tag,
       count(*)::int as got,
       0 as expected
from public.personal_watchlist_order w
where not exists (
  select 1
  from public.user_title_state s
  where s.user_id = w.user_id
    and s.title_id = w.title_id
    and s.watch_status = 'watchlist'
    and s.watch_scope = 'personal'
);
COMMIT;
