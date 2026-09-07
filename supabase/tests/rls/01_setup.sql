-- Setup escenarios RLS (corre como postgres, bypass RLS).
truncate table public.reviews cascade;
truncate table public.user_title_state cascade;
truncate table public.titles cascade;
truncate table public.households cascade;
truncate table public.profiles cascade;
truncate table auth.users cascade;

-- Hogares
insert into public.households (id, name) values
  ('11111111-2222-4333-8444-555555555555', 'Jhon y Ella'),
  ('66666666-7777-4888-8999-aaaaaaaaaaaa', 'Solo Camilo');

-- Usuarios: el trigger on_auth_user_created debe crear cada profile
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'jhon@example.com',
    '{"display_name":"Jhon"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ella@example.com',
    '{"display_name":"Ella"}'::jsonb),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'camilo@example.com',
    '{"display_name":"Camilo"}'::jsonb);

-- Asignar hogares
update public.profiles set household_id = '11111111-2222-4333-8444-555555555555'
  where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
update public.profiles set household_id = '66666666-7777-4888-8999-aaaaaaaaaaaa'
  where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

-- Títulos
insert into public.titles (id, tmdb_id, media_type, title, year, overview, genres) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 157336, 'movie', 'Interstellar', 2014,
    'Un viaje a través de un agujero de gusano.', '{Drama,Adventure,Scifi}'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 1399, 'tv', 'Game of Thrones', 2011,
    'Tronos, traición y dragones.', '{Drama,Fantasy}');

-- Estados: Jhon y Ella watched (visto por ambos); Camilo pendiente
insert into public.user_title_state
  (user_id, title_id, watch_status, watched_at, is_favorite, rating) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'watched', '2026-09-01', true, 5.0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'watched', '2026-09-02', false, 4.0),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'watchlist', null, false, null);

-- Reseñas: una de cada miembro del Hogar 1
insert into public.reviews (user_id, title_id, content) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Masterpiece'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Muy buena');