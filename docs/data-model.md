# Modelo de datos

Diseño acordado para la Fase 1. Este documento es la fuente de verdad antes de escribir migraciones en la Fase 2.

## 1. Entidades y relaciones

```
auth.users (Supabase)
   │ 1┼1
   ▼
households ──1┼N── profiles ──1┼N── user_title_state ──N┼1── titles
                    │                                   │
                    │                                   └── reviews
                    │
                    └── N┼1 (mismo user_title_state y reviews por título)
```

| Tabla              | Propósito                                                                        |
| ------------------ | -------------------------------------------------------------------------------- |
| `households`       | El grupo de dos (la pareja). Define "quiénes comparten la colección".            |
| `profiles`         | Perfil público de cada usuario, ligado a `auth.users`.                           |
| `titles`           | Catálogo compartido: un título existe una sola vez por `tmdb_id` + `media_type`. |
| `user_title_state` | Relación usuario-título: estado, favorito y calificación del usuario.            |
| `reviews`          | Reseña personal por usuario-título (una por par).                                |

**Interstellar (tmdb_id 157336) se modela así:**

| Tabla              | Filas                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `titles`           | 1 fila: `tmdb_id=157336`, `media_type='movie'`                     |
| `user_title_state` | 2 filas: (Jhon, watched, rating 5.0) y (Ella, watched, rating 4.0) |
| `reviews`          | 0..2 filas: una por usuario que escribió                           |

## 2. Tablas eliminadas respecto al borrador inicial

- **`ratings`** → absorbida como columna `rating` en `user_title_state`. La calificación es una relación usuario-título sin lógica propia; una fila por par en la misma tabla que el estado evita joins y políticas duplicadas.
- **`favorites`** → absorbida como flag `is_favorite` en `user_title_state` (ver decisión 3).
- **`genres` / `title_genres`** → denormalizada: `titles.genres` es `text[]` (ver decisión 7).

Resultado: 5 tablas de negocio en vez de las 6-8 del borrador, sin perder información.

> **Nota (Fase 3):** la invitación al hogar se simplificó con un `join_code` rotable en `households`. El diseño inicial con tabla `invitations` (tokens de un uso) se descartó en la migración `20260907180000_simplify_household_invitations.sql` y la tabla se eliminó: con un hogar privado de máximo 2 integrantes y rotación del código a demanda, el token de un uso era sobredimensionado.

## 3. Favoritos: dónde viven

Decisión: **`is_favorite boolean not null default false` dentro de `user_title_state`**, no una tabla `favorites`.

Razones:

- Un favorito es, por naturaleza, una relación usuario-título con cero atributos propios.
- Puede existir sin estado (`watch_status null`, `is_favorite true`) si el usuario solo quiere destacarlo.
- Nos ahorramos una tabla, sus claves foráneas y dos políticas de escritura; la lista de favoritos se obtiene con un índice parcial.

## 4. Estados de visualización

`titles` no sabe nada del estado: **el estado vive por usuario** en `user_title_state.watch_status`.

Enum `watch_status`:

| Valor       | Significado                |
| ----------- | -------------------------- |
| `watchlist` | Pendiente de ver           |
| `watching`  | Empezado, aún no terminado |
| `watched`   | Visto                      |

`NULL` = el usuario todavía no lo ha añadido a la colección. Una fila existe en `user_title_state` únicamente cuando el usuario interactúa (añade a pendiente, marca visto, califica, favoritear, etc.).

**Cómo se derivan los conceptos del producto:**

| Concepto             | Derivación                                                                  |
| -------------------- | --------------------------------------------------------------------------- |
| "Pendiente para mí"  | `watch_status = 'watchlist'` en mi fila                                     |
| "Visto por Jhon"     | fila de Jhon con `watch_status = 'watched'`                                 |
| "Visto por ambos"    | las filas de ambos usuarios (mismo hogar) tienen `watch_status = 'watched'` |
| "Visto por uno solo" | exactamente una de las filas del hogar es `'watched'`                       |

"Visto por ambos" **no se almacena** (no hay columna `watched_by_both`): se deriva en memoria en el cliente con `buildCatalog` (`src/lib/catalog.ts`) agrupando las filas de `user_title_state` visibles para el hogar. Ver tests `CT14`.

Consulta "visto por ambos" (ver §9, Q2): se compara el conteo de filas `'watched'` del hogar contra el número de miembros del hogar.

`watched_at date null` registra cuándo el usuario lo vio (para "últimos vistos"); no existe `started_at` para `watching` (YAGNI por ahora).

**Regla de `watched_at` (Fase 4):** la BD es la autoridad. El trigger `private.sync_title_watched_at()` (migración `20260907190000_catalog.sql`) llena `watched_at` con `now()` al marcar `watched` y lo limpia al salir de ese estado, en `INSERT` y `UPDATE` (el cliente solo manda `watch_status`). El CHECK `watched_at is null or watch_status = 'watched'` queda como respaldo si alguien deshabilita el trigger. Ver tests `CT6`–`CT8` y `C3`/`C3b`.

## 5. Calificaciones (0.5–5)

Columna `user_title_state.rating numeric(2,1) null`.

- Paso de 0.5 (3.0, 3.5, 4.0…).
- `NULL` = no calificado (no se muestra media).
- Constraints:
  - `CHECK (rating between 0.5 and 5.0)`
  - `CHECK ((rating * 10) % 5 = 0)` — fuerza el paso de 0.5.
- La calificación es **individual por usuario**; el promedio para un título se calcula sobre las filas de los miembros del hogar que sí calificaron (`AVG(rating)` sobre `rating is not null`).

## 6. Reseñas

Decisión: **una reseña por par (usuario, título)**. Sin historial.

- PK compuesta `(user_id, title_id)` — garantiza unicidad a nivel base de datos.
- Editar reseña = `UPDATE` la misma fila (`updated_at` se refresca).
- Sin historial de versiones: no aporta valor con dos usuarios y duplica filas y complejidad.
- `content text not null check (length(btrim(content)) > 0)`.

## 7. Géneros

Decisión: **`titles.genres text[]`** con nombres (ej. `{"Drama","Adventure","Sci-Fi"}`).

- Sin tablas `genres`/`title_genres`: para un catálogo pequeño, la normalización en 3 tablas es sobreingeniería.
- Los resultados de `/search/*` solo traen `genre_ids`; la capa TMDB (`src/lib/tmdb/`) resuelve los nombres con las listas `/genre/movie/list` y `/genre/tv/list`, cacheadas una vez por sesión. El detalle on-demand (`/movie/{id}` o `/tv/{id}`) sí devuelve `genres[]` con nombres.
- Los ids de TMDB no se guardan: no son estables como llave del catálogo local (la llave es `tmdb_id` + `media_type`).

## 8. Qué se almacena de TMDB y qué se consulta bajo demanda

### Se almacena en `titles` (lo mínimo para cards y lista)

| Campo           | Tipo                                                       |
| --------------- | ---------------------------------------------------------- |
| `tmdb_id`       | integer (llave hacia TMDB)                                 |
| `media_type`    | enum (`movie` \| `tv`)                                     |
| `title`         | text — nombre unificado (movie `title` / tv `name`)        |
| `year`          | integer — año (movie `release_date` / tv `first_air_date`) |
| `overview`      | text                                                       |
| `poster_path`   | text (ruta TMDB, null si no hay)                           |
| `backdrop_path` | text (ruta TMDB, null si no hay)                           |
| `genres`        | text[]                                                     |

### Bajo demanda (nunca en BD)

Detalles completos, elenco y créditos, tráilers, proveedores de streaming, rating/popularidad de TMDB, imágenes adicionales. En Fase 4 el detalle de `/app/title/$titleId` consulta on-demand (`append_to_response=credits,videos`) cast, director, creadores, duración, fecha y tráiler; no cambian los datos propios de WatchUs.

> **Reseñas (Fase 5):** la UI de reviews ahora está implementada en el detalle de título y cubierta por RLS/suite (`06_phase5.sql`). Una reseña por par (usuario, título); el cliente hace upsert por PK y delete. Ni las estadísticas ni "¿Qué vemos hoy?" añaden tablas ni RPCs: todo se deriva en el cliente desde las queries cacheadas (ver D-13/D-14 en `architecture.md`).

## 9. Evitar títulos duplicados

1. **Constraint único**: `UNIQUE (tmdb_id, media_type)` en `titles`.
2. **RPC `get_or_create_title` (Fase 4)**: flujo get-or-create en **una sola llamada** dentro de la BD (`security definer`, migración `20260907190000_catalog.sql`):
   - `insert into titles (...) on conflict (tmdb_id, media_type) do nothing`
   - `select` posterior de la fila canónica y devolución.
   - Dos usuarios que añaden el mismo título a la vez compiten por la misma llave única: el segundo `insert` se convierte en no-op y ambos reciben la misma fila. Sin duplicados posibles.
3. Estado de usuario: tras el get-or-create, el cliente hace un `upsert` con `onConflict: 'user_id,title_id'` e `ignoreDuplicates` para no tocar un estado existente.

## 10. Row Level Security

Reglas generales:

- Solo el rol `authenticated` tiene grants en tablas de negocio. `anon` no accede.
- El rol `service_role` se reserva al servidor/migraciones, nunca al cliente.
- Escritura: cada usuario toca solo sus filas (`user_id = auth.uid()`).
- Lectura: propia + de los miembros de su hogar.

Helpers que se usarán en las políticas:

- `auth.uid()` para identificar al usuario.
- `profiles.household_id` para resolver "mi hogar".

### `households`

| Operación | Política                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| SELECT    | `id` es mi hogar: `exists (select 1 from profiles where household_id = households.id and user_id = auth.uid())` |
| INSERT    | Sin acceso directo (onboarding por RPC `create_household`)                                                      |
| UPDATE    | Solo si el hogar es el mío                                                                                      |
| DELETE    | Sin acceso directo                                                                                              |

### RPCs de hogar (Fase 3)

El onboarding y la invitación no insertan filas directamente: pasan por RPCs `security definer` (`set search_path = ''`), que validan reglas que una política RLS no puede expresar.

| Función                        | Reglas                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_household(name)`       | El llamante no pertenece a ningún hogar; crea el hogar y lo asigna. Devuelve el hogar (con `join_code`).                                            |
| `generate_invitation_code()`   | Rota el `join_code` del hogar del llamante. Devuelve el hogar actualizado.                                                                          |
| `accept_invitation_code(code)` | El llamante no pertenece a ningún hogar; `join_code` (mayúsculas) debe existir. El trigger max-2 rechaza si el hogar está lleno. Devuelve el hogar. |

**Límite de 2 integrantes:** trigger `private.profile_household_limit()` antes de `insert`/`update of household_id` en `profiles`. Usa `pg_advisory_xact_lock` para que dos `accept` simultáneos no traspasen el límite, y eleva `check_violation` ("Household is full…") si ya hay 2 miembros. Ver tests en `supabase/tests/rls/04_household_phase3.sql`.

### `profiles`

| Operación | Política                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| SELECT    | `user_id = auth.uid() OR user_id in (miembros de mi hogar)`                                                                                     |
| INSERT    | `user_id = auth.uid()` (con `with check`) — usado en onboarding manual; el trigger de signup corre como `security definer` y no depende de esto |
| UPDATE    | `user_id = auth.uid()` (with `with check` igual)                                                                                                |
| DELETE    | `user_id = auth.uid()`                                                                                                                          |

### `titles` (catálogo compartido)

| Operación | Política                                                 |
| --------- | -------------------------------------------------------- |
| SELECT    | `true` para `authenticated` — la colección es compartida |
| INSERT    | `authenticated` (get-or-create)                          |
| UPDATE    | `authenticated` (corregir metadata)                      |
| DELETE    | `authenticated` (quitar de la colección)                 |

Tradeoff aceptado: con un solo hogar, cualquier autenticado puede tocar el catálogo. El template una cuenta externa en la instancia no ocurre en el uso previsto (2 personas).

### `user_title_state`

| Operación | Política                                                         |
| --------- | ---------------------------------------------------------------- |
| SELECT    | `user_id = auth.uid() OR user_id in (miembros de mi hogar)`      |
| INSERT    | `with check user_id = auth.uid()`                                |
| UPDATE    | `using user_id = auth.uid()` + `with check user_id = auth.uid()` |
| DELETE    | `using user_id = auth.uid()`                                     |

### `reviews`

Igual que `user_title_state` (por usuario, lectura compartida en el hogar).

### Trigger de creación de perfil

En `auth.users`, `after insert`:

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, household_id, display_name)
  values (new.id, null, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
```

`household_id` se asigna en el onboarding (unirse a un hogar existente o crear el primero).

## 11. Enums, constraints e índices

### Enums

- `media_type`: `movie`, `tv`
- `watch_status`: `watchlist`, `watching`, `watched`

### Tabla por tabla

#### `households`

| Columna      | Tipo          | Notas                                                                                                 |
| ------------ | ------------- | ----------------------------------------------------------------------------------------------------- |
| `id`         | uuid PK       | `default gen_random_uuid()`                                                                           |
| `name`       | text          | nombre del hogar                                                                                      |
| `join_code`  | text not null | código de invitación, 8 hex mayúsculas (ej. `A1B2C3D4`); `unique`; visible solo para miembros vía RLS |
| `created_at` | timestamptz   | `default now()`                                                                                       |

#### `profiles`

| Columna                     | Tipo          | Notas                                      |
| --------------------------- | ------------- | ------------------------------------------ |
| `id`                        | uuid PK       | FK → `auth.users(id)` `on delete cascade`  |
| `household_id`              | uuid null     | FK → `households(id)` `on delete set null` |
| `display_name`              | text not null | visible para el otro usuario               |
| `avatar_url`                | text null     |                                            |
| `created_at` / `updated_at` | timestamptz   | `updated_at` vía trigger                   |

Check: `display_name` no vacío (`length(btrim(display_name)) > 0`).

#### `titles`

| Columna         | Tipo                         | Notas                       |
| --------------- | ---------------------------- | --------------------------- |
| `id`            | uuid PK                      | `default gen_random_uuid()` |
| `tmdb_id`       | integer not null             |                             |
| `media_type`    | media_type not null          |                             |
| `title`         | text not null                |                             |
| `year`          | integer null                 |                             |
| `overview`      | text not null default ''     |                             |
| `poster_path`   | text null                    |                             |
| `backdrop_path` | text null                    |                             |
| `genres`        | text[] not null default '{}' |                             |
| `created_at`    | timestamptz                  | `default now()`             |

Constraints:

- `UNIQUE (tmdb_id, media_type)` — llave natural "un título una vez".
- `CHECK (year between 1850 and 2100)` si `year` no es null (sanity).

Índices:

- `titles_tmdb_media_type_key` (unique, cubre get-or-create)
- `titles_media_type_idx` — filtro película/serie
- `titles_genres_idx` (`gin`) — filtro por género

#### `user_title_state`

| Columna                     | Tipo                           | Notas                                   |
| --------------------------- | ------------------------------ | --------------------------------------- |
| `user_id`                   | uuid                           | FK → `profiles(id)` `on delete cascade` |
| `title_id`                  | uuid                           | FK → `titles(id)` `on delete cascade`   |
| `watch_status`              | watch_status null              |                                         |
| `watched_at`                | date null                      |                                         |
| `is_favorite`               | boolean not null default false |                                         |
| `rating`                    | numeric(2,1) null              |                                         |
| `created_at` / `updated_at` | timestamptz                    |                                         |

Constraints:

- `PRIMARY KEY (user_id, title_id)`
- `CHECK (rating between 0.5 and 5.0)` y `CHECK ((rating * 10) % 5 = 0)`
- `CHECK (watched_at is null or watch_status = 'watched')` — no puede haber fecha de visto sin estar marcado como visto

Índices:

- PK cubre `(user_id, title_id)` → políticas que filtran por `user_id` (leading column).
- `user_title_state_title_id_idx` — cargar todos los estados de un título, duplicación del otro usuario.
- `user_title_state_favorite_idx` parcial: `(user_id) where is_favorite`.
- `user_title_state_watchlist_idx` parcial: `(user_id) where watch_status = 'watchlist'` (para ¿qué vemos hoy?)

#### `reviews`

| Columna                     | Tipo          | Notas                                   |
| --------------------------- | ------------- | --------------------------------------- |
| `user_id`                   | uuid          | FK → `profiles(id)` `on delete cascade` |
| `title_id`                  | uuid          | FK → `titles(id)` `on delete cascade`   |
| `content`                   | text not null |                                         |
| `created_at` / `updated_at` | timestamptz   |                                         |

Constraints:

- `PRIMARY KEY (user_id, title_id)`
- `CHECK (length(btrim(content)) > 0)`

Índices:

- `reviews_title_id_idx` — listar reseñas de un título (y quién las escribió).

## Consultas de referencia

Se implementarán en la API de datos de la Fase 2.

**Q1 — Visto por ambos** (dos miembros concretos de un hogar):

```sql
select t.*
from titles t
  join user_title_state s on s.title_id = t.id
  join profiles p on p.id = s.user_id
where p.household_id = :household_id
  and s.watch_status = 'watched'
group by t.id
having count(*) = (select count(*) from profiles where household_id = :household_id);
```

**Q2 — Promedio de calificación de un título:**

```sql
select t.title, avg(s.rating)::numeric(3,1) as avg_rating, count(s.rating) as votes, count(*) as members
from titles t
  left join user_title_state s on s.title_id = t.id and s.rating is not null
where t.id = :title_id
group by t.id;
```

**Q3 — "¿Qué vemos hoy?"** (aleatorio entre pendientes del hogar):

```sql
select t.*
from titles t
  join user_title_state s on s.title_id = t.id
  join profiles p on p.id = s.user_id
where p.household_id = :household_id
  and s.watch_status = 'watchlist'
order by random()
limit 1;
```

## Lista de verificación frente a los requisitos

- [x] Un título existe una sola vez (unique `tmdb_id`+`media_type`, RPC get-or-create)
- [x] Calificación individual por usuario y promedio del hogar (UI: pasos de 0.5)
- [x] Favoritos por usuario (flag)
- [x] Pendiente / viendo / visto + "visto por Jhon/Ella/ambos" (derivado en memoria)
- [x] `watched_at` consistente por trigger en BD
- [x] Reseña única por usuario-título, editable (tabla lista; UI diferida)
- [x] Géneros sin normalización innecesaria (`text[]`, nombres resueltos)
- [x] TMDB solo con datos mínimos almacenados; detalle on-demand
- [x] RLS: escritura propia, lectura compartida del hogar
- [x] Sin nombres hardcodeados (household + profiles)
