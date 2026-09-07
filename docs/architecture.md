# Arquitectura

## Stack

| Capa             | Tecnología                  | Rol                                |
| ---------------- | --------------------------- | ---------------------------------- |
| Frontend         | React + TypeScript + Vite   | SPA                                |
| Routing          | TanStack Router             | Navegación y protección de rutas   |
| Datos cliente    | TanStack Query              | Caché, estados loading/error/empty |
| UI               | Tailwind CSS v4 + shadcn/ui | Diseño y componentes               |
| Backend (BaaS)   | Supabase                    | PostgreSQL + Auth + RLS            |
| Catálogo externo | TMDB API                    | Información de películas y series  |
| Deploy           | Vercel                      | Frontend                           |

## Principios

- **Simplicidad** — sin backend separado. Supabase como BaaS cubre datos, autenticación y seguridad.
- **Un título, una fila** — la colección es compartida; la calificación, el estado y los favoritos son relaciones usuario-título.
- **RLS como frontera de seguridad** — cada política se define en la base de datos, no en el cliente.
- **TMDB bajo demanda** — en la BD solo se guarda lo mínimo para la UI de WatchUs.

## Decisiones de arquitectura

### D-01: Sin backend separado

Supabase cubre Postgres, Auth y RLS. Un backend (Elysia/Bun) no aporta nada por ahora: no hay lógica que deba ocultarse al cliente más allá de la TMDB read key (que TMDB publica para uso en cliente). Si en el futuro apareciera una necesidad real (webhooks, cron, secretos reales), se evaluará.

### D-02: Un "hogar" (household) modela el grupo de dos

Aunque la app está pensada para dos personas, los nombres y la relación entre ambos no deben estar hardcodeados en componentes ni consultas. Una tabla `households` y `profiles.household_id` materializan "quiénes pertenecen a mi grupo", lo que permite derivar conceptos como "visto por ambos" o "¿qué vemos hoy?" consultando al otro usuario por datos, no por constante. Costo: dos tablas pequeñas.

### D-03: TMDB se consulta desde el frontend

La TMDB API key v4 es una clave de cliente por diseño. Se expone vía `VITE_TMDB_API_KEY` (ver `.env.example`). Ningún secreto de Supabase va al cliente: solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

### D-04: la colección de títulos es compartida a nivel de hogar

`titles` no lleva `household_id`: con un único hogar de facto, la colección pertenece a todos los autenticados. Las filas personales (`user_title_state`, `reviews`) sí se restringen por usuario. Tradeoff: si algún día hubiera varios hogares, habría que añadir `household_id` a `titles`. Se acepta para mantener las consultas simples.

### D-05: escritura protegida por RLS, lectura compartida dentro del hogar

Cada usuario escribe únicamente sus filas (`user_id = auth.uid()`), pero lee las de su hogar para poder ver la colección completa y "visto por ambos".

## Flujo de datos

```
Browser ── Query (TanStack Query) ──> TMDB API (search, detail, images)
Browser ── Query ────────────────────> Supabase (titles, states, reviews)
Browser ── Supabase Auth (email) ────> auth.users + public.profiles
```

## Seguridad

- RLS activada en todas las tablas expuestas.
- Solo el rol `authenticated` recibe grants de las tablas de negocio; `anon` no accede a nada de negocio.
- `service_role` nunca se usa en el cliente.
- El perfil se crea en `auth.users` mediante trigger `security definer` (`set search_path = ''`).

Ver todo el detalle de políticas en [data-model.md](./data-model.md).
