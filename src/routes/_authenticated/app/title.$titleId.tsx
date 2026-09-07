import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HeartIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RatingPicker, StatusPicker, StateBadge } from '@/components/catalog'
import { ReviewsSection } from '@/components/reviews'
import { useAuth } from '@/lib/auth'
import { useCatalog, useCatalogMutations } from '@/lib/queries'
import type { WatchStatus } from '@/lib/catalog'
import { backdropUrl, posterUrl } from '@/lib/tmdb/config'
import { fetchTitleDetails, trailerEmbedUrl } from '@/lib/tmdb/details'
import { tmdbUserMessage } from '@/lib/tmdb/errors'
import type { TmdbMediaType } from '@/lib/tmdb/types'

export const Route = createFileRoute('/_authenticated/app/title/$titleId')({
  validateSearch: (search: Record<string, unknown>) => ({
    tmdbId:
      typeof search.tmdbId === 'number'
        ? search.tmdbId
        : typeof search.tmdbId === 'string' && search.tmdbId !== ''
          ? Number.parseInt(search.tmdbId, 10)
          : undefined,
    mediaType:
      search.mediaType === 'movie' || search.mediaType === 'tv'
        ? (search.mediaType as TmdbMediaType)
        : undefined,
  }),
  component: TitleDetailPage,
})

function TitleDetailPage() {
  const { titleId } = Route.useParams()
  const { tmdbId, mediaType } = Route.useSearch()
  const auth = useAuth()
  const catalogQuery = useCatalog(auth.user)
  const mutations = useCatalogMutations(auth.user)

  const item = catalogQuery.data?.find((entry) => entry.title.id === titleId)

  const detailsQuery = useQuery({
    queryKey: ['tmdb_details', tmdbId, mediaType],
    queryFn: () => fetchTitleDetails(tmdbId!, mediaType!),
    enabled: tmdbId != null && mediaType != null,
    staleTime: 10 * 60 * 1000,
  })

  const busy =
    mutations.setStatus.isPending ||
    mutations.clearStatus.isPending ||
    mutations.rate.isPending ||
    mutations.favorite.isPending

  if ((catalogQuery.isLoading || catalogQuery.isFetching) && !item) {
    return <Skeleton className="h-96 w-full rounded-lg" />
  }

  if (!item) {
    return (
      <Card className="bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        Este título no está en tu catálogo.{' '}
        <Link
          to="/app/search"
          search={{ q: '' }}
          className="font-medium text-primary"
        >
          Búscalo para añadirlo
        </Link>
        .
      </Card>
    )
  }

  const localTitleId = item.title.id
  const detail = detailsQuery.data
  const poster = posterUrl(item.title.poster_path, 500)
  const backdrop = backdropUrl(item.title.backdrop_path, 1280)

  const myStatus = item.ownStatus
  const myWatchedAt = item.ownWatchedAt
  const byBoth =
    item.ownStatus === 'watched' && item.partnerStatus === 'watched'

  function setStatus(status: WatchStatus | null) {
    if (status === null) {
      mutations.clearStatus.mutate(localTitleId)
    } else {
      mutations.setStatus.mutate({ titleId: localTitleId, status })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {backdrop ? (
        <div className="relative -mx-4 -mt-4 h-48 sm:-mx-6 sm:h-64">
          <img
            src={backdrop}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-background/20" />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-40 shrink-0 self-start overflow-hidden rounded-lg border border-border bg-muted">
          {poster ? (
            <img
              src={poster}
              alt={`Póster de ${item.title.title}`}
              className="w-full"
            />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center p-3">
              <span className="text-sm font-semibold text-muted-foreground">
                {item.title.title}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{item.title.title}</h1>
              {item.title.year ? (
                <span className="text-muted-foreground">{item.title.year}</span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge>{mediaType === 'tv' ? 'Serie' : 'Película'}</Badge>
              {item.title.genres.map((genre) => (
                <Badge key={genre} variant="outline">
                  {genre}
                </Badge>
              ))}
              {byBoth ? <StateBadge status="watched" /> : null}
              {myStatus ? <StateBadge status={myStatus} /> : null}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {detail?.tagline ? (
              <span className="italic">«{detail.tagline}» </span>
            ) : null}
            {item.title.overview || 'Sin sinopsis disponible.'}
          </p>

          {detail ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {detail.runtimeMinutes ? (
                <>
                  <dt className="text-muted-foreground">Duración</dt>
                  <dd>{detail.runtimeMinutes} min</dd>
                </>
              ) : null}
              {detail.releaseDate ? (
                <>
                  <dt className="text-muted-foreground">
                    {mediaType === 'tv' ? 'Estreno' : 'Fecha'}
                  </dt>
                  <dd>{detail.releaseDate}</dd>
                </>
              ) : null}
              {detail.director ? (
                <>
                  <dt className="text-muted-foreground">Director</dt>
                  <dd>{detail.director}</dd>
                </>
              ) : null}
              {detail.creators.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Creadores</dt>
                  <dd>{detail.creators.join(', ')}</dd>
                </>
              ) : null}
            </dl>
          ) : null}

          {myWatchedAt ? (
            <p className="text-xs text-muted-foreground">
              La viste el {myWatchedAt}
              {byBoth ? '. ¡Tu pareja también!' : ''}
            </p>
          ) : null}

          {detail?.trailerKey ? (
            <div className="aspect-video overflow-hidden rounded-lg border border-border">
              <iframe
                src={trailerEmbedUrl(detail.trailerKey)}
                className="size-full"
                title={`Tráiler de ${item.title.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Tu relación con este título
            </p>
            <StatusPicker
              status={myStatus}
              disabled={busy}
              onChange={setStatus}
            />
            <div className="flex items-center justify-between gap-2">
              <RatingPicker
                rating={item.ownRating}
                disabled={busy}
                onChange={(rating) =>
                  mutations.rate.mutate({ titleId: localTitleId, rating })
                }
              />
              <Button
                type="button"
                size="sm"
                variant={item.ownFavorite ? 'default' : 'outline'}
                disabled={busy}
                onClick={() =>
                  mutations.favorite.mutate({
                    titleId: localTitleId,
                    favorite: !item.ownFavorite,
                  })
                }
              >
                <HeartIcon
                  className={item.ownFavorite ? 'fill-current' : undefined}
                />
                {item.ownFavorite ? 'Favorito' : 'Favorito'}
              </Button>
            </div>
            {mutations.setStatus.isError ? (
              <p role="alert" className="text-xs text-destructive">
                No se pudo actualizar el estado.
              </p>
            ) : null}
          </div>

          {detail ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Reparto</h2>
              {detail.cast.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {detail.cast.map((member) => (
                    <li
                      key={`${member.name}-${member.character}`}
                      className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                    >
                      <span className="font-medium">{member.name}</span>
                      {member.character ? (
                        <span className="text-muted-foreground">
                          {' '}
                          como {member.character}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin reparto disponible.
                </p>
              )}
            </div>
          ) : null}

          <ReviewsSection titleId={localTitleId} />
        </div>
      </div>

      {detailsQuery.isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : null}

      {detailsQuery.isError ? (
        <Card className="bg-destructive/10 p-4">
          <p role="alert" className="text-sm text-destructive">
            {tmdbUserMessage(detailsQuery.error)}
          </p>
        </Card>
      ) : null}
    </div>
  )
}
