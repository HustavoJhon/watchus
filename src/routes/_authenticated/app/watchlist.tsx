import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * The household watchlist (shared order, drag & drop) now lives inside
 * Catálogo under the «Pendientes» filter. The route stays so old links and
 * deep links keep working: `/app/watchlist` → `/app/catalog?status=watchlist`.
 */
export const Route = createFileRoute('/_authenticated/app/watchlist')({
  beforeLoad: () => {
    throw redirect({
      to: '/app/catalog',
      search: { type: 'all', status: 'watchlist', favorites: 'all', query: '' },
    })
  },
  component: () => null,
})
