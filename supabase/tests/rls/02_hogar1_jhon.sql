\pset format unaligned
BEGIN;
-- Pruebas RLS como Jhon (Hogar 1)
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- T1: catálogo compartido visible
with q as (select count(*)::int c from public.titles)
select 'T1 catalog_shared' as tag, c as got, 2 as expected from q;

-- T2: estados visibles = propios + compañero de hogar
with q as (select count(*)::int c from public.user_title_state)
select 'T2 states_same_household' as tag, c as got, 2 as expected from q;

-- T3: estados de OTRO hogar no visibles
with q as (select count(*)::int c from public.user_title_state
             where user_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3')
select 'T3 states_other_household_hidden' as tag, c as got, 0 as expected from q;

-- T4: reseñas del hogar visibles
with q as (select count(*)::int c from public.reviews)
select 'T4 reviews_same_household' as tag, c as got, 2 as expected from q;

-- T5: update de estado ajeno (mismo hogar) -> 0 filas
with upd as (update public.user_title_state set is_favorite = true
              where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' returning 1)
select 'T5 cannot_update_other_state' as tag, count(*)::int as got, 0 as expected from upd;

-- T6: update reseña ajena -> 0 filas
with upd as (update public.reviews set content = 'hack'
              where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' returning 1)
select 'T6 cannot_update_other_review' as tag, count(*)::int as got, 0 as expected from upd;

-- T7: update de su propio estado -> 1 fila
with upd as (update public.user_title_state
              set rating = 4.5, is_favorite = true
              where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
                and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'T7 can_update_own_state' as tag, count(*)::int as got, 1 as expected from upd;

-- T8: update de su propia reseña -> 1 fila
with upd as (update public.reviews set content = 'Obra maestra'
              where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
                and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'T8 can_update_own_review' as tag, count(*)::int as got, 1 as expected from upd;

-- T9: insert de estado en nombre de OTRO usuario -> 42501 (with check)
do $$ begin
  begin
    insert into public.user_title_state (user_id, title_id, watch_status)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
              'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'watchlist');
    raise exception 'T9 FAIL: 42501 no raised';
  exception when insufficient_privilege then
    raise notice 'T9 OK insert_for_other_denied';
  end;
end $$;

-- T10: delete de estado ajeno -> 0 filas
with del as (delete from public.user_title_state
              where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' returning 1)
select 'T10 cannot_delete_other_state' as tag, count(*)::int as got, 0 as expected from del;

-- T11: puede actualizar su perfil (display_name)
with upd as (update public.profiles
              set display_name = 'Jhon28'
              where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning 1)
select 'T11 can_update_own_profile' as tag, count(*)::int as got, 1 as expected from upd;

-- T12: insert de perfil en nombre de OTRO usuario (uid nuevo) -> 42501
do $$ begin
  begin
    insert into public.profiles (id, display_name, household_id)
      values ('eeeeeeee-dddd-4ddd-8ddd-ddddddddddd9', 'Eklaus', null);
    raise exception 'T12 FAIL: 42501 no raised';
  exception when insufficient_privilege then
    raise notice 'T12 OK insert_profile_for_other_denied';
  end;
end $$;

-- T13: cambiar su household_id (irse de su hogar) -> 42501 (with check)
do $$ begin
  begin
    update public.profiles
      set household_id = '66666666-7777-4888-8999-aaaaaaaaaaaa'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'T13 FAIL: 42501 no raised';
  exception when insufficient_privilege then
    raise notice 'T13 OK cannot_leave_household';
  end;
end $$;

-- T14: poner household_id NULL -> 42501 (with check)
do $$ begin
  begin
    update public.profiles set household_id = null
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'T14 FAIL: 42501 no raised';
  exception when insufficient_privilege then
    raise notice 'T14 OK cannot_null_household';
  end;
end $$;

-- C1: rating fuera de rango (5.5) -> check violation
do $$ begin
  begin
    update public.user_title_state set rating = 5.5
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
        and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
    raise exception 'C1 FAIL: rating range no enforced';
  exception when check_violation then
    raise notice 'C1 OK rating_out_of_range_denied';
  end;
end $$;

-- C2: rating fuera de paso (4.3) -> check violation
do $$ begin
  begin
    update public.user_title_state set rating = 4.3
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
        and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
    raise exception 'C2 FAIL: rating step no enforced';
  exception when check_violation then
    raise notice 'C2 OK rating_step_denied';
  end;
end $$;

-- C3: al salir de 'watched' el trigger limpia watched_at (regla del modelo)
do $$ begin
  update public.user_title_state
    set watch_status = 'watchlist', watched_at = '2026-09-03'
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

  if (select watched_at from public.user_title_state
        where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
          and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1') is not null then
    raise exception 'C3 FAIL: watched_at no cleared';
  end if;

  raise notice 'C3 OK watched_at_cleared_on_exit';
end $$;

-- C3b: el CHECK sigue siendo backstop si se deshabilita el trigger
do $$ begin
  begin
    alter table public.user_title_state
      disable trigger user_title_state_sync_watched_at;
    update public.user_title_state
      set watch_status = 'watchlist', watched_at = '2026-09-03'
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
        and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
    alter table public.user_title_state
      enable trigger user_title_state_sync_watched_at;
    raise exception 'C3b FAIL: constraint no enforced';
  exception when check_violation then
    alter table public.user_title_state
      enable trigger user_title_state_sync_watched_at;
    raise notice 'C3b OK watched_at_requires_watched_backstop';
  end;
end $$;

-- C4: watched con watched_at -> OK (1 fila)
with upd as (update public.user_title_state
              set watch_status = 'watched', watched_at = '2026-09-03'
              where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
                and title_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1)
select 'C4 watched_with_date_ok' as tag, count(*)::int as got, 1 as expected from upd;

-- C5: el trigger set_updated_at refresca updated_at
with q as (select (updated_at > created_at)::text v
             from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
select 'C5 updated_at_touched' as tag, v as got, 'true' as expected from q;

-- T16: helpers sin recursión RLS
do $$ begin
  perform private.my_household_id();
  perform private.my_watch_partners();
  raise notice 'T16 OK helpers_without_recursion';
end $$;

-- T15: puede eliminar su propio perfil -> 1 fila; CASCADE limpia sus datos
with del as (delete from public.profiles
              where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning 1)
select 'T15 can_delete_own_profile' as tag, count(*)::int as got, 1 as expected from del;

-- C6: tras eliminar el perfil, sus estados y reseñas se fueron
with q as (
  select (select count(*)::int from public.user_title_state
           where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') as s,
         (select count(*)::int from public.reviews
           where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') as r)
select 'C6 cascade_cleanup' as tag, (s + r)::int as got, 0 as expected from q;
COMMIT;