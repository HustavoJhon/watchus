import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowRightIcon, SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TitleCard } from '@/components/catalog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { useCatalog, useHouseholdContext } from '@/lib/queries'
import type { WatchStatus } from '@/lib/catalog'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/app/catalog')({
  component: CatalogPage,
})

type Filter = 'all' | WatchStatus

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'watchlist', label: 'Pendiente' },
  { value: 'watching', label: 'Viendo' },
  { value: 'watched', label: 'Visto' },
]

function CatalogPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const catalogQuery = useCatalog(auth.user)
  const { household, secondMember } = useHouseholdContext(auth.user)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const items = catalogQuery.data ?? []
  const filtered = items.filter((item) =>
    filter === 'all' ? true : item.ownStatus === filter,
  )

  function submitSearch() {
    const query = search.trim()
    if (query) {
      void navigate({ to: '/app/search', search: { q: query } })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submitSearch()
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar películas o series en TMDB…"
            className="pl-8"
            aria-label="Buscar películas o series en TMDB"
          />
        </div>
        <Button type="submit" disabled={!search.trim()}>
          Buscar
        </Button>
      </form>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {filters.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={filter === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtered.length} título{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {!household ? null : !secondMember ? (
        <Card className="bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            Tu pareja todavía no se unió al hogar. Consíguela en la pestaña{' '}
            <Link to="/app/hogar" className="font-medium text-primary">
              Hogar
            </Link>
            .
          </p>
        </Card>
      ) : null}

      {catalogQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
      ) : null}

      {catalogQuery.isError ? (
        <Card className="flex flex-col items-start gap-2 bg-destructive/10 p-4">
          <p role="alert" className="text-sm text-destructive">
            No se pudo cargar tu catálogo.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void catalogQuery.refetch()}
          >
            Reintentar
          </Button>
        </Card>
      ) : null}

      {!catalogQuery.isLoading &&
      !catalogQuery.isError &&
      filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 bg-muted/40 p-8 text-center">
          <p className="text-sm font-medium">
            {filter === 'all' ? 'Tu catálogo está vacío' : 'Nada por aquí'}
          </p>
          <p className="text-sm text-muted-foreground">
            Busca una película o serie y añádela para tenerla a la vista.
          </p>
          <Button asChild className="mt-2">
            <Link
              to="/app/search"
              search={{ q: '' }}
              onClick={() =>
                void navigate({ to: '/app/search', search: { q: '' } })
              }
            >
              Ir a Búsqueda
              <ArrowRightIcon />
            </Link>
          </Button>
        </Card>
      ) : null}

      {filtered.length > 0 ? (
        <div
          className={cn(
            'grid gap-4',
            'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
          )}
        >
          {filtered.map((item) => (
            <TitleCard key={item.title.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
