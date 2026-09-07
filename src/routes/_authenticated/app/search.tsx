import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { posterUrl } from '@/lib/tmdb/config'
import { tmdbUserMessage } from '@/lib/tmdb/errors'
import type { TitleCandidate } from '@/lib/tmdb/mapper'
import { useCatalog, useCatalogMutations, useTitleSearch } from '@/lib/queries'
import type { SearchMediaType } from '@/lib/tmdb/search'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_authenticated/app/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  component: SearchPage,
})

const mediaTypes: Array<{ value: SearchMediaType; label: string }> = [
  { value: 'all', label: 'Todo' },
  { value: 'movie', label: 'Películas' },
  { value: 'tv', label: 'Series' },
]

function SearchPage() {
  const routerQuery = Route.useSearch()
  const navigate = useNavigate()
  const auth = useAuth()
  const catalogQuery = useCatalog(auth.user)

  const [prevQuery, setPrevQuery] = useState(routerQuery.q)
  const [input, setInput] = useState(routerQuery.q)
  const [query, setQuery] = useState(routerQuery.q)
  const [mediaType, setMediaType] = useState<SearchMediaType>('all')
  const [page, setPage] = useState(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mutations = useCatalogMutations(auth.user)

  if (routerQuery.q !== prevQuery) {
    setPrevQuery(routerQuery.q)
    setInput(routerQuery.q)
    setQuery(routerQuery.q)
    setPage(1)
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const timeout = setTimeout(() => {
      setQuery(input)
      setPage(1)
      void navigate({ to: '/app/search', search: { q: input.trim() } })
    }, 350)
    timer.current = timeout
    return () => {
      clearTimeout(timeout)
    }
  }, [input, navigate])

  const searchQuery = useTitleSearch(query, { mediaType, page })

  const catalogItems = catalogQuery.data ?? []
  const inCatalog = new Set(
    catalogItems.map(
      (item) => `${item.title.tmdb_id}:${item.title.media_type}`,
    ),
  )

  const results = searchQuery.data?.candidates ?? []
  const totalPages = searchQuery.data?.totalPages ?? 0

  function addResult(candidate: TitleCandidate) {
    mutations.add.mutate(candidate, {
      onSuccess: (title) => {
        void navigate({
          to: '/app/title/$titleId',
          params: { titleId: title.id },
          search: { tmdbId: title.tmdb_id, mediaType: title.media_type },
        })
      },
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Buscar en TMDB…"
            className="pl-8"
            autoFocus
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {mediaTypes.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={mediaType === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMediaType(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {!query.trim() ? (
        <Card className="bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Escribe el nombre de una película o serie para buscarla en TMDB.
        </Card>
      ) : null}

      {query.trim() && searchQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
      ) : null}

      {searchQuery.isError ? (
        <Card className="bg-destructive/10 p-4">
          <p role="alert" className="text-sm text-destructive">
            {tmdbUserMessage(searchQuery.error)}
          </p>
        </Card>
      ) : null}

      {query.trim() &&
      !searchQuery.isLoading &&
      !searchQuery.isError &&
      results.length === 0 ? (
        <Card className="bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Sin resultados para «{query.trim()}».
        </Card>
      ) : null}

      {results.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {results.map((candidate) => {
              const key = `${candidate.tmdbId}:${candidate.mediaType}`
              const isAdded = inCatalog.has(key)
              return (
                <article
                  key={key}
                  className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent/40"
                >
                  <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                    {candidate.posterPath ? (
                      <img
                        src={posterUrl(candidate.posterPath, 300) ?? undefined}
                        alt={`Póster de ${candidate.title}`}
                        className="size-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center p-3">
                        <span className="line-clamp-3 text-center text-sm font-semibold text-muted-foreground">
                          {candidate.title}
                        </span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <Badge>
                        {candidate.mediaType === 'tv' ? 'Serie' : 'Película'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-1 text-sm font-semibold">
                      {candidate.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{candidate.year ?? '—'}</span>
                      {candidate.genres.length > 0 ? (
                        <span className="line-clamp-1">
                          {candidate.genres.slice(0, 3).join(' · ')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="border-t border-border p-2">
                    {isAdded ? (
                      <Button size="sm" className="w-full" disabled>
                        <CheckIcon />
                        En catálogo
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => addResult(candidate)}
                        disabled={mutations.add.isPending}
                      >
                        <PlusIcon />
                        Añadir al catálogo
                      </Button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="flex items-center justify-center gap-2 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeftIcon />
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
              <ChevronRightIcon />
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
