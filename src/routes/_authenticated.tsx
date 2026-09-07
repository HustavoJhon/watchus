import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth, ensureAuthLoaded } from '@/lib/auth'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const auth = await ensureAuthLoaded()
    if (auth.status !== 'authenticated') {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthenticatedLayout,
})

function RedirectWhenUnauthenticated() {
  const auth = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (auth.status !== 'authenticated') {
      navigate({ to: '/login' })
    }
  }, [auth.status, navigate])
  return null
}

function AuthenticatedLayout() {
  return (
    <>
      <RedirectWhenUnauthenticated />
      <Outlet />
    </>
  )
}
