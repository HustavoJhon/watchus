# WatchUs

Una aplicación web para que dos personas lleven una colección compartida de películas y series que han visto, sus calificaciones y una lista de contenido pendiente.

## Stack

- React + TypeScript + Vite
- TanStack Router + TanStack Query
- Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL + Auth + RLS)
- TMDB API
- Desplegado en Vercel

## Estado

- **Fase 9 (completada):** dos listas de pendientes independientes y ordenables — **del hogar** (`household_watchlist_order`, idéntica para ambos miembros; el botón "Me gusta" y la decisión de _qué vemos_ comparten orden) y **solo para mí** (`personal_watchlist_order`, con RLS que la vuelve opaca incluso para la pareja: no puede leerla, escribirla ni ordenarla, y tampoco se suscribe a ella por Realtime). El ámbito vive en `user_title_state.watch_scope`, así que un título puede estar en las dos colas a la vez con posiciones independientes. Como el ámbito está en una tabla que el hogar sí puede leer, la política SELECT de `user_title_state` excluye explícitamente las filas **pendientes en ámbito personal** de la pareja (`20260913120000_personal_scope_privacy.sql`); los estados ya no pendientes siguen siendo visibles para no romper la derivación de «visto por ambos». Reordenamiento atómico por RPC (`reorder_household_watchlist` / `reorder_personal_watchlist`) con validación del conjunto pendiente completo y mensaje de error explicativo, drag & drop (dnd-kit, mobile-first) con fallback de flechas y teclado, filtro de lista en search params compartibles, badge de posición en tarjetas, un único trigger que mantiene ambas colas al entrar/salir de pendientes y al cambiar de ámbito, sincronización por Realtime, tests RLS (`08_watchlist_order.sql`, `09_watchlist_scopes.sql`, `10_personal_scope_privacy.sql`) y unitarios de ordenamiento, ámbitos, filtros y errores.
- **Fase 8 (completada):** gestión y filtrado del catálogo — eliminación segura por usuario (RPC `remove_title_from_catalog` solo borra el estado/reseña propios y el título compartido solo si queda huérfano; se cierra el DELETE directo sobre `titles` que con CASCADE borraba datos ajenos), filtros combinables Tipo/Estado/Favoritos en search params compartibles, búsqueda local en memoria (sin llamada TMDB), contador con concordancia («3 películas pendientes»), estados vacíos con «Limpiar filtros», menú de eliminación con confirmación en tarjetas y detalle, tests RLS (`07_catalog_management.sql`) y unitarios de filtros.
- **Fase 7 (completada):** despliegue en producción — Vercel (canónico `https://watchus-orcin.vercel.app`) + Supabase Cloud, smoke tests en prod, comprobaciones en `docs/production.md`.
- **Fase 6 (completada):** hardening y preparación para producción — errores de render/ruta con fallback en español y sin stack traces, timeout en el cliente TMDB, invalidación de catálogo tras añadir títulos, accesibilidad (labels/aria en español, `aria-current`), retry en tarjetas de error, metadata básica (`lang`, description, theme-color), `vercel.json` con rewrite SPA, checklist de producción documentado en `docs/production.md` (incluye evaluaciones diferidas de PWA y tests E2E).
- **Fase 5 (completada):** dashboard en `/app` con totales, "¿Qué vemos hoy?" y actividad reciente; catálogo movido a `/app/catalog`; estadísticas en `/app/stats` (totales, movie/tv, vistos por ambos, ratings, géneros top) derivadas en cliente; reseñas con UI (crear/editar/eliminar) en el detalle del título; tests SQL (`06_phase5.sql` incluida en la suite) y unitarios (stats/QVH).
- **Fase 4 (completada):** catálogo compartido con TMDB — búsqueda (movie/tv/all, géneros en español, paginada), get-or-create race-safe en `titles`, estados individuales (pendiente/viendo/visto con `watched_at`), favoritos, calificación 0.5–5, "visto por ambos" derivado en memoria, detalle del título con TMDB on-demand (sin persistir), tests SQL RLS (`supabase/tests/rls/`) y unitarios (vitest).
- Fase 3: auth (login/registro/recuperación), perfil, hogar de 2 integrantes con invitación por `join_code`, RLS probada.

## Documentación

- [Arquitectura](./docs/architecture.md)
- [Modelo de datos](./docs/data-model.md)
- [Producción](./docs/production.md) — checklist Vercel + Supabase Cloud, variables y decisiones diferidas.

## Requisitos

- Node.js ≥ 20 y `pnpm`.
- Supabase CLI para la base de datos local (`~/.local/bin/supabase`, o el binario de tu PATH).
- Una clave de API v3 de TMDB (opcional en local; sin ella la búsqueda y el detalle muestran un error claro).

## Instalación

```sh
pnpm install
cp .env.example .env.local   # rellena los valores (ver "Variables de entorno")
```

## Variables de entorno

Solo existen tres, todas de cliente. `.env.example` se versiona con valores vacíos; `.env.local` está en `.gitignore` y **nunca** se sube a Git.

| Variable                 | Uso                                                                    |
| ------------------------ | ---------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | URL del proyecto Supabase (Cloud o `http://127.0.0.1:54321` en local). |
| `VITE_SUPABASE_ANON_KEY` | Key `anon` del proyecto. **Nunca** la `service_role`.                  |
| `VITE_TMDB_API_KEY`      | API key v3 de TMDB (read-only, pensada para clientes).                 |

## Desarrollo local

```sh
pnpm dev   # arranca Vite en http://localhost:5173
```

### Supabase local

```sh
~/.local/bin/supabase start    # Postgres, Studio (54323), Mailpit (54324)
pnpm dev                       # la app apunta a http://127.0.0.1:54321
```

Para restablecer la base a cero (aplica migraciones en orden y limpia datos):

```sh
~/.local/bin/supabase db reset
```

Studio: http://localhost:54323 · Mailpit (emails): http://localhost:54324

Regenerar tipos locales de la BD (`src/types/database.ts`):

```sh
~/.local/bin/supabase gen types typescript --local --schema public > src/types/database.ts
```

## Comandos principales

```sh
pnpm dev          # servidor de desarrollo
pnpm build        # build de producción (output: dist/)
pnpm preview      # previsualiza el build
pnpm typecheck    # tsc -b
pnpm lint         # eslint
pnpm format       # prettier --write .
pnpm format:check # prettier --check .
pnpm test         # vitest run (unitarios)
```

### Suite SQL RLS

Los tests de RLS corren con `psql` contra la base local (cada archivo se ejecuta sin parser de errores en stop: los archivos 04 y 05 incluyen errores esperados por diseño):

```sh
for f in supabase/tests/rls/*.sql; do
  ~/.local/bin/supabase db reset  # o psql directo como postgres
done
```

Más detalles de los comandos exactos en `docs/production.md` y en los comentarios de `supabase/tests/rls/`.

## Producción

Ver [docs/production.md](./docs/production.md): pasos para Supabase Cloud, migraciones (`db push`), Auth (site/redirect URLs), variables en Vercel y la rewrite SPA (`vercel.json`). Producción desplegada en `https://watchus-orcin.vercel.app`.
