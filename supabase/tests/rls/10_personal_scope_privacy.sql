-- Fase 10 RLS / personal scope privacy tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A and B share a household, C lives in another household.
--
-- Why this file exists: `watch_scope` lives in `user_title_state`, and that table
-- has always been readable by the rest of the household. When the scope landed,
-- that pre-existing read became a way to enumerate somebody else's private
-- queue. These tests pin the fixed contract:
--   * the partner cannot read the rows a person has pending in `personal`.
--   * the partner still sees everything that is NOT private-queue membership:
--     the shared pending set, and any `watching`/`watched` row whatever its scope.
--   * the owner still sees their own personal rows.
--   * other-household rows stay hidden.

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

-- `public.profiles` rows are created by the auth.signup trigger, so they are
-- updated rather than inserted here.
update public.profiles set household_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
               'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
update public.profiles set household_id = 'cccccccc-2222-4222-8222-cccccccccccc'
  where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

insert into public.titles (id, tmdb_id, media_type, title, year) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 157336, 'movie', 'Interstellar', 2014),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 70523, 'tv', 'Dark', 2017),
  ('ffffffff-ffff-4fff-8fff-fffffffffff3', 157350, 'movie', 'Oppenheimer', 2023),
  ('11111111-1111-4111-8111-111111111111', 163872, 'movie', 'Sicario', 2015);

-- t1 pending shared for A; t2 pending personal for A; t3 pending personal for A
-- AND pending shared for B; t4 watched by A with personal scope (no longer
-- pending, so not private-queue membership and still visible to B).
insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'watchlist', 'shared');

insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watchlist', 'personal');

insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'ffffffff-ffff-4fff-8fff-fffffffffff3', 'watchlist', 'personal');

insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ffffffff-ffff-4fff-8fff-fffffffffff3', 'watchlist', 'shared');

insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'watched', 'personal');
COMMIT;

-- ============================================================
-- P1: B cannot read A's rows that are pending in the personal scope
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

-- The leak: t2 and t3 are A's private pending queue.
with q as (
  select count(*)::int c
  from public.user_title_state
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and watch_status = 'watchlist'
    and watch_scope = 'personal'
)
select 'P1 partner_cannot_read_personal_pending' as tag, c as got, 0 as expected from q;

-- The shared queue must be untouched: A's row for t1 is pending in the SHARED
-- scope, so B still reads it. (A's row for t3 is A's personal pending, so it
-- stays hidden: what B sees about t3 comes from B's own row, checked in P6.)
with q as (
  select count(*)::int c
  from public.user_title_state
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
    and watch_status = 'watchlist'
    and watch_scope = 'shared'
)
select 'P2 partner_still_reads_shared_pending_row' as tag, c as got, 1 as expected from q;
COMMIT;

-- ============================================================
-- P3: B still sees A's non-pending rows (scope is irrelevant there)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

-- t4 is A's row, watched, and its personal scope must stay readable: this is
-- what keeps "visto por ambos" derivable.
with q as (
  select count(*)::int c
  from public.user_title_state
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and title_id = '11111111-1111-4111-8111-111111111111'
    and watch_status = 'watched'
    and watch_scope = 'personal'
)
select 'P3 partner_reads_partner_watched_row' as tag, c as got, 1 as expected from q;

-- And a partner row that is `watching` with personal scope too.
insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watching', 'personal');
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- A must see B's watching row even though B's scope is personal: by the time a
-- row is not pending it carries no private-queue information.
with q as (
  select count(*)::int c
  from public.user_title_state
  where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    and watch_status = 'watching'
)
select 'P4 owner_reads_partner_watching_row' as tag, c as got, 1 as expected from q;
COMMIT;

-- ============================================================
-- P5: A still sees their whole personal pending queue
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

with q as (
  select count(*)::int c
  from public.user_title_state
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and watch_status = 'watchlist'
    and watch_scope = 'personal'
)
select 'P5 owner_reads_own_personal_pending' as tag, c as got, 2 as expected from q;

-- The personal queue table keeps its own strict RLS: the owner reads it, the
-- partner does not.
with q as (
  select count(*)::int c from public.personal_watchlist_order
)
select 'P6 personal_order_table_visible_to_owner' as tag, c as got, 2 as expected from q;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

with q as (
  select count(*)::int c from public.personal_watchlist_order
)
select 'P7 partner_cannot_read_personal_order_table' as tag, c as got, 0 as expected from q;
COMMIT;

-- ============================================================
-- P8: another household is still fully hidden
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

insert into public.user_title_state (user_id, title_id, watch_status, watch_scope) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watchlist', 'personal');

with q as (
  select count(*)::int c
  from public.user_title_state
  where user_id <> 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
)
select 'P8 other_household_hidden' as tag, c as got, 0 as expected from q;
COMMIT;

-- ============================================================
-- P9: the shape of both read policies, checked through pg_policies
-- ============================================================
-- The personal queue table keeps an own-only SELECT policy, and the state table
-- policy is the hardened one (it must mention the personal scope). Both are
-- asserted through the catalog so a future edit cannot silently reopen the read.
with q as (
  select count(*)::int c
  from pg_policies
  where tablename = 'personal_watchlist_order'
    and policyname = 'personal_watchlist_order_select_own'
    and qual ilike '%auth.uid()%'
)
select 'P9 personal_order_select_is_own_only' as tag, c as got, 1 as expected from q;

with q as (
  select count(*)::int c
  from pg_policies
  where tablename = 'user_title_state'
    and policyname = 'user_title_state_select_self_or_household'
    and qual ilike '%personal%'
)
select 'P10 personal_scope_excluded_from_partner_read' as tag, c as got, 1 as expected from q;

-- And no extra SELECT policy may sit on top of it for that table.
with q as (
  select count(*)::int c
  from pg_policies
  where tablename = 'user_title_state'
    and cmd = 'SELECT'
)
select 'P11 single_state_select_policy' as tag, c as got, 1 as expected from q;
