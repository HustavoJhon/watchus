import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ArrowRightIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TitleCard } from '@/components/catalog'
import { CatalogFilters as CatalogFiltersBar } from '@/components/catalog-filters'
import { ReorderBoard } from '@/components/catalog-board'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import {
  useCatalog,
  useCatalogMutations,
  useHouseholdContext,
} from '@/lib/queries'
import {
  DEFAULT_FILTERS,
  filterCatalog,
  hasActiveFilters,
  countLabelOf,
  type CatalogFilters,
} from '@/lib/catalog-filter'
import { reorderWithSubset } from '@/lib/catalog-order'
import { householdWatchlist } from '@/lib/watchlist'
import { toast } from '@/lib/toast'

export const Route = createFileRoute('/_authenticated/app/catalog')({
  validateSearch: (search: Record<string, unknown>): CatalogFilters => ({
    type: search.type === 'movie' || search.type === 'tv' ? search.type : 'all',
    status:
      search.status === 'watchlist' ||
      search.status === 'watching' ||
      search.status === 'watched' ||
      search.status === 'none'
        ? search.status
        : 'all',
    favorites: search.favorites === 'favorites' ? 'favorites' : 'all',
    query: typeof search.query === 'string' ? search.query : '',
  }),
  component: CatalogPage,
})

function CatalogPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const catalogQuery = useCatalog(auth.user)
  const mutations = useCatalogMutations(auth.user)
  const { household, secondMember } = useHouseholdContext(auth.user)
  const searchParams = Route.useSearch()

  const filters = {
    ...DEFAULT_FILTERS,
    ...searchParams,
  }
  const items = catalogQuery.data ?? []
  const filtered = filterCatalog(items, filters)
  const hasFilters = hasActiveFilters(filters)
  const fullPending = householdWatchlist(items)
  const fullPendingIds = fullPending.map((item) => item.title.id)

  const [prevQuery, setPrevQuery] = useState(searchParams.query)
  const [input, setInput] = useState(searchParams.query)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the input in sync when the query URL changes (back/forward, filters).
  if (searchParams.query !== prevQuery) {
    setPrevQuery(searchParams.query)
    setInput(searchParams.query)
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const timeout = setTimeout(() => {
      void navigate({
        to: '/app/catalog',
        search: {
          type: filters.type,
          status: filters.status,
          favorites: filters.favorites,
          query: input.trim(),
        },
      })
    }, 300)
    timer.current = timeout
    return () => {
      clearTimeout(timeout)
    }
  }, [input, navigate, filters.type, filters.status, filters.favorites])

  function setFilters(next: Partial<CatalogFilters>) {
    void navigate({
      to: '/app/catalog',
      search: { ...filters, ...next, query: input.trim() },
    })
  }

  function resetFilters() {
    void navigate({ to: '/app/catalog', search: DEFAULT_FILTERS })
  }

  function reorder(from: number, to: number) {
    const orderedIds = reorderWithSubset(
      fullPendingIds,
      filtered.map((item) => item.title.id),
      from,
      to,
    )
    mutations.reorder.mutate(orderedIds, {
      onSuccess: () => toast({ title: 'Orden actualizado' }),
    })
  }

  const emptyDescription = [] as string[]
  if (filters.type === 'movie') emptyDescription.push('películas')
  if (filters.type === 'tv') emptyDescription.push('series')
  if (filters.status === 'none') emptyDescription.push('sin estado')
  if (filters.status === 'watchlist') emptyDescription.push('pendientes')
  if (filters.status === 'watching') emptyDescription.push('en curso')
  if (filters.status === 'watched') {
    emptyDescription.push(
      filters.type === 'tv' ? 'series vistas' : 'películas vistas',
    )
  }
  if (filters.favorites === 'favorites') {
    emptyDescription.push(filters.type === 'all' ? 'favoritos' : 'favoritas')
  }

  const isWatchlist = filters.status === 'watchlist'

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="sr-only">Catálogo</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void navigate({
            to: '/app/catalog',
            search: { ...filters, query: input.trim() },
          })
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Buscar en tu catálogo…"
            className="pl-8"
            aria-label="Buscar en tu catálogo"
          />
          {input ? (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setInput('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link to="/app/search" search={{ q: '' }}>
            <PlusIcon />
            Añadir
          </Link>
        </Button>
      </form>

      <CatalogFiltersBar filters={filters} onFiltersChange={setFilters} />

      <span className="text-xs text-muted-foreground" role="status">
        {countLabelOf(filtered, filters)}
      </span>

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
            {items.length === 0
              ? 'Tu catálogo está vacío'
              : filters.query.trim()
                ? `No hay resultados para «${filters.query.trim()}»`
                : `No hay ${emptyDescription.join(' ni ')} por aquí`}
          </p>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? 'Busca una película o serie y añádela para tenerla a la vista.'
              : hasFilters
                ? 'No encontramos títulos con estos filtros.'
                : 'Prueba cambiando los filtros.'}
          </p>
          <div className="flex gap-2">
            {items.length === 0 ? (
              <Button asChild className="mt-2">
                <Link to="/app/search" search={{ q: '' }}>
                  Ir a Búsqueda
                  <ArrowRightIcon />
                </Link>
              </Button>
            ) : hasFilters ? (
              <Button variant="outline" className="mt-2" onClick={resetFilters}>
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {filtered.length > 0 && isWatchlist ? (
        <p className="text-xs text-muted-foreground">
          Arrastra (o usa las flechas) para ordenar la cola compartida.
        </p>
      ) : null}

      {filtered.length > 0 ? (
        isWatchlist ? (
          <ReorderBoard items={filtered} onMove={reorder} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((item) => (
              <TitleCard key={item.title.id} item={item} />
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
