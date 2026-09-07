import { createFileRoute, redirect } from '@tanstack/react-router'
import { ensureAuthLoaded } from '@/lib/auth'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const auth = await ensureAuthLoaded()
    throw redirect({ to: auth.status === 'authenticated' ? '/app' : '/login' })
  },
})
