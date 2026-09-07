import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth, ensureAuthLoaded } from '@/lib/auth'

export const Route = createFileRoute('/_public')({
  beforeLoad: async () => {
    const auth = await ensureAuthLoaded()
    if (auth.status === 'authenticated') {
      throw redirect({ to: '/' })
    }
  },
  component: PublicLayout,
})

function RedirectWhenAuthenticated() {
  const auth = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (auth.status === 'authenticated') {
      navigate({ to: '/' })
    }
  }, [auth.status, navigate])
  return null
}

function PublicLayout() {
  return (
    <>
      <RedirectWhenAuthenticated />
      <Outlet />
    </>
  )
}
