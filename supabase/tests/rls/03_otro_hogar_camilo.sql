\pset format unaligned
BEGIN;
-- Pruebas RLS como Camilo (Hogar 2)
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

-- L1: catálogo compartido visible
with q as (select count(*)::int c from public.titles)
select 'L1 catalog_shared' as tag, c as got, 2 as expected from q;

-- L2: solo ve SUS estados (1 propio), nunca los del Hogar 1
with q as (select count(*)::int c from public.user_title_state)
select 'L2 only_own_states' as tag, c as got, 1 as expected from q;

-- L3: no ve estados del Hogar 1
with q as (select count(*)::int c from public.user_title_state
             where user_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                               'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'))
select 'L3 other_household_hidden' as tag, c as got, 0 as expected from q;

-- L4: no ve reseñas del Hogar 1
with q as (select count(*)::int c from public.reviews)
select 'L4 no_other_household_reviews' as tag, c as got, 0 as expected from q;

-- L5: update de estado de Jhon -> 0 filas
with upd as (update public.user_title_state set is_favorite = true
              where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning 1)
select 'L5 cannot_update_other_household_state' as tag, count(*)::int as got, 0 as expected from upd;

-- L6: insert estado en nombre de Jhon -> 42501
do $$ begin
  begin
    insert into public.user_title_state (user_id, title_id, watch_status)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
              'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watched');
    raise exception 'L6 FAIL: 42501 no raised';
  exception when insufficient_privilege then
    raise notice 'L6 OK insert_for_other_household_denied';
  end;
end $$;

-- L7: puede actualizar su propio estado (watchlist -> watched)
with upd as (update public.user_title_state
              set watch_status = 'watched', watched_at = '2026-09-04'
              where user_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
                and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'L7 can_update_own_state' as tag, count(*)::int as got, 1 as expected from upd;

-- L8: puede escribir una reseña propia
with ins as (insert into public.reviews (user_id, title_id, content)
              values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
                      'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Me gustó') returning 1)
select 'L8 can_insert_own_review' as tag, count(*)::int as got, 1 as expected from ins;
COMMIT;