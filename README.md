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

- **Fase 4 (en curso):** catálogo compartido con TMDB — búsqueda (movie/tv/all, géneros en español, paginada), get-or-create race-safe en `titles`, estados individuales (pendiente/viendo/visto con `watched_at`), favoritos, calificación 0.5–5, "visto por ambos" derivado en memoria, detalle del título con TMDB on-demand (sin persistir), tests SQL RLS (`supabase/tests/rls/`) y unitarios (vitest).
- Fase 3: auth (login/registro/recuperación), perfil, hogar de 2 integrantes con invitación por `join_code`, RLS probada.
- Diferido: dashboard/estadísticas y reseñas (los datos ya existen en `reviews`; falta la UI).

## Documentación

- [Arquitectura](./docs/architecture.md)
- [Modelo de datos](./docs/data-model.md)

## Configuración local

Copia `.env.example` a `.env.local` y rellena:

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — proyecto Supabase (local o hosted).
- `VITE_TMDB_API_KEY` — clave de API v3 de TMDB. Si va vacía, la búsqueda y el detalle muestran un mensaje de error claro sin romper el resto de la app.

```
pnpm install
pnpm dev
```

Para regenerar tipos de la BD (`src/types/database.ts`): `~/.local/bin/supabase gen types typescript --local --schema public > src/types/database.ts`.
