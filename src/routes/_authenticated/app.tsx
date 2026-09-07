import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router'
import {
  SearchIcon,
  HomeIcon,
  ListVideoIcon,
  UsersIcon,
  BarChart3Icon,
  LibraryIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/app')({
  component: AppLayout,
})

const tabs = [
  {
    to: '/app',
    label: 'Dashboard',
    icon: HomeIcon,
    active: (pathname: string) => pathname === '/app',
  },
  {
    to: '/app/catalog',
    label: 'Catálogo',
    icon: LibraryIcon,
    active: (pathname: string) => pathname.startsWith('/app/catalog'),
  },
  {
    to: '/app/search',
    label: 'Búsqueda',
    icon: SearchIcon,
    active: (pathname: string) => pathname.startsWith('/app/search'),
  },
  {
    to: '/app/watchlist',
    label: 'Pendientes',
    icon: ListVideoIcon,
    active: (pathname: string) => pathname.startsWith('/app/watchlist'),
  },
  {
    to: '/app/stats',
    label: 'Estadísticas',
    icon: BarChart3Icon,
    active: (pathname: string) => pathname.startsWith('/app/stats'),
  },
  {
    to: '/app/hogar',
    label: 'Hogar',
    icon: UsersIcon,
    active: (pathname: string) => pathname.startsWith('/app/hogar'),
  },
]

function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 sm:p-6">
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-border p-1">
        {tabs.map((tab) => {
          const active = tab.active(pathname)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
