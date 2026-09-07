-- Fase 5 RLS / reviews tests.
-- Runs as postgres. Simulates roles via SET LOCAL (JWT claims).
-- Scenario: A and B share a household and a catalog; C lives in another
-- household. Verifies create/edit/delete of one's own review, reading the
-- partner's review, blocking edits/deletes of other users' reviews and full
-- isolation across households (plus one-review-per-user-title and content
-- constraints).

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
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 70523, 'tv', 'Dark', 2017);

insert into public.user_title_state (user_id, title_id, watch_status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'watchlist'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'watchlist'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watched');
COMMIT;

-- ============================================================
-- R1: own review create
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
with ins as (insert into public.reviews (user_id, title_id, content)
             values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                     'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Brutal') returning 1)
select 'R1 can_create_own_review' as tag, count(*)::int as got, 1 as expected from ins;
COMMIT;

-- ============================================================
-- R2: own review edit
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
with upd as (update public.reviews set content = 'Mejor peli'
             where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
               and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'R2 can_edit_own_review' as tag, count(*)::int as got, 1 as expected from upd;
select 'R2b content_persisted' as tag,
       (content = 'Mejor peli')::text as got, 'true' as expected
from public.reviews
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
COMMIT;

-- ============================================================
-- R3: B creates own review; A and B read each other's review
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
with ins as (insert into public.reviews (user_id, title_id, content)
             values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
                     'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Buenísima') returning 1)
select 'R3 b_can_create_own_review' as tag, count(*)::int as got, 1 as expected from ins;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
select 'R3b a_reads_partner_review' as tag,
       (count(*) = 1)::text as got, 'true' as expected
from public.reviews
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
select 'R3c b_reads_partner_review' as tag,
       (count(*) = 1)::text as got, 'true' as expected
from public.reviews
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
COMMIT;

-- ============================================================
-- R4: blocking others' edits / deletes / impersonation
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
with upd as (update public.reviews set content = 'hacked'
             where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
               and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'R4 cannot_edit_others' as tag, count(*)::int as got, 0 as expected from upd;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
with del as (delete from public.reviews
             where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
               and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'R5 cannot_delete_others' as tag, count(*)::int as got, 0 as expected from del;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.reviews (user_id, title_id, content)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
              'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'impersonating');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'R6 FAIL: creating a review for another user was allowed';
  end if;
end $$;
select 'R6 cannot_create_for_other' as tag, true::text as got, 'true' as expected;
COMMIT;

-- ============================================================
-- R7: one review per user/title (PK)
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.reviews (user_id, title_id, content)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
              'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'duplicada');
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'R7 FAIL: second review for the same user/title was allowed';
  end if;
end $$;
select 'R7 one_review_per_user_title' as tag, true::text as got, 'true' as expected;
COMMIT;

-- ============================================================
-- R8: outsider household isolation
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
with ins as (insert into public.reviews (user_id, title_id, content)
             values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
                     'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'Ños') returning 1)
select 'R8 outsider_create_own_review' as tag, count(*)::int as got, 1 as expected from ins;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
select 'R9 outsider_cannot_read_household' as tag,
       (count(*) = 0)::text as got, 'true' as expected
from public.reviews
where user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
select 'R9b outsider_sees_only_own' as tag,
       (count(*) = 1)::text as got, 'true' as expected
from public.reviews;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
with upd as (update public.reviews set content = 'hacked2'
             where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
               and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'R10 outsider_cannot_edit' as tag, count(*)::int as got, 0 as expected from upd;
with del as (delete from public.reviews
             where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
               and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'R10b outsider_cannot_delete' as tag, count(*)::int as got, 0 as expected from del;
COMMIT;

-- ============================================================
-- R11: blank content rejected; B can still delete own review
-- ============================================================
BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.reviews (user_id, title_id, content)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
              'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '   ');
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'R11 FAIL: blank review content was allowed';
  end if;
end $$;
select 'R11 blank_content_rejected' as tag, true::text as got, 'true' as expected;
COMMIT;

BEGIN;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
with del as (delete from public.reviews
             where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
               and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'R12 can_delete_own_review' as tag, count(*)::int as got, 1 as expected from del;
COMMIT;