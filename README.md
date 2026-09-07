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

- **Fase 3 (en curso):** auth de Supabase (login/registro/recuperación de contraseña), perfil, hogar de 2 integrantes con invitación por `join_code`, todo protegido con RLS probada en `supabase/tests/rls/`.
- Próximo: catálogo compartido (TMDB) y dashboard del hogar.

## Documentación

- [Arquitectura](./docs/architecture.md)
- [Modelo de datos](./docs/data-model.md)
