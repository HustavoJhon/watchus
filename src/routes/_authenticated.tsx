import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { LogOutIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, signOut, ensureAuthLoaded } from '@/lib/auth'
import { useMyProfile } from '@/lib/queries'

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
  const auth = useAuth()
  const profileQuery = useMyProfile(auth.user)
  const profile = profileQuery.data ?? null

  return (
    <div className="flex min-h-svh flex-col">
      <RedirectWhenUnauthenticated />
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/app" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              W
            </span>
            WatchUs
          </Link>
          {profile ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar size="sm">
                  <AvatarFallback>
                    {profile.display_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:block">
                  {profile.display_name}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{profile.display_name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => void signOut()}
                >
                  <LogOutIcon />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
