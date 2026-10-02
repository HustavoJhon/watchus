import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router'
import { SearchIcon, HomeIcon, LibraryIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/app')({
  component: AppLayout,
})

const tabs = [
  {
    to: '/app',
    label: 'Inicio',
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
]

function AppLayout() {
  const { pathname } = useLocation()
  return (
    <>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 pb-20 sm:p-6 md:pb-6">
        <nav className="mb-4 hidden gap-1 rounded-lg border border-border p-1 md:flex">
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

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-background/90 backdrop-blur-md md:hidden"
      >
        {tabs.map((tab) => {
          const active = tab.active(pathname)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 py-2 text-[0.65rem] font-medium transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon className="size-5" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
