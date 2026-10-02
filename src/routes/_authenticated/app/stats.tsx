import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Statistics were merged into the dashboard (Inicio). The route stays in the
 * tree so old links and deep links keep working: `/app/stats` → `/app`.
 */
export const Route = createFileRoute('/_authenticated/app/stats')({
  beforeLoad: () => {
    throw redirect({ to: '/app' })
  },
  component: () => null,
})
