import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ClockIcon, TvIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RatingPicker, RatingStars } from '@/components/catalog'
import { useAuth } from '@/lib/auth'
import { isMissingTableError } from '@/lib/db-errors'
import {
  queryKeys,
  useEpisodeRatingMutations,
  useEpisodeRatings,
  useHouseholdContext,
} from '@/lib/queries'
import { fetchSeasonEpisodes } from '@/lib/tmdb/details'
import type { SeasonSummary } from '@/lib/tmdb/details'
import { stillUrl } from '@/lib/tmdb/config'
import { tmdbUserMessage } from '@/lib/tmdb/errors'
import type { EpisodeRatingRow } from '@/lib/episodes'
import { formatShortDate } from '@/lib/format'

function seasonLabel(seasonNumber: number): string {
  return seasonNumber === 0 ? 'Especiales' : `Temporada ${seasonNumber}`
}

/** Indexes one member's ratings by TMDB episode id. */
function ratingsByEpisode(
  rows: EpisodeRatingRow[],
  userId: string | undefined,
): Map<number, EpisodeRatingRow> {
  const map = new Map<number, EpisodeRatingRow>()
  for (const row of rows) {
    if (row.user_id === userId && !map.has(row.tmdb_episode_id)) {
      map.set(row.tmdb_episode_id, row)
    }
  }
  return map
}

/**
 * Episode list for a series. Seasons come from the title detail payload and
 * episodes are fetched on demand per season, so only what the viewer opens is
 * downloaded. Each episode exposes the viewer's rating picker and, when
 * present, the partner's rating for the same episode.
 */
export function EpisodesSection({
  titleId,
  tmdbId,
  seasons,
}: {
  titleId: string
  tmdbId: number
  seasons: SeasonSummary[]
}) {
  const auth = useAuth()
  const { members } = useHouseholdContext(auth.user)
  const ratingsQuery = useEpisodeRatings(titleId)
  const mutations = useEpisodeRatingMutations(auth.user)

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)

  const defaultSeason =
    seasons.find((season) => season.seasonNumber === 1) ??
    seasons.find((season) => season.seasonNumber > 0) ??
    seasons[0]
  const activeSeason = selectedSeason ?? defaultSeason?.seasonNumber ?? null

  const episodesQuery = useQuery({
    queryKey: queryKeys.seasonEpisodes(tmdbId, activeSeason ?? 0),
    queryFn: () => fetchSeasonEpisodes(tmdbId, activeSeason!),
    enabled: activeSeason != null,
    staleTime: 10 * 60 * 1000,
  })

  if (seasons.length === 0) return null

  const partner = members.find((member) => member.id !== auth.user?.id)
  const ratings = ratingsQuery.data ?? []
  const ownRatings = ratingsByEpisode(ratings, auth.user?.id)
  const partnerRatings = ratingsByEpisode(ratings, partner?.id)
  const ratingsUnavailable =
    ratingsQuery.isError &&
    isMissingTableError(ratingsQuery.error, 'episode_ratings')

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Episodios</h2>
          <p className="text-xs text-muted-foreground">
            Puntúa cada capítulo por separado. Tu pareja verá tus notas.
          </p>
        </div>
        {partner ? (
          <p className="text-xs text-muted-foreground">
            También verás las de {partner.display_name}.
          </p>
        ) : null}
      </header>

      <div
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label="Temporadas"
      >
        {seasons.map((season) => {
          const active = season.seasonNumber === activeSeason
          return (
            <Button
              key={season.id}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              className="shrink-0"
              onClick={() => setSelectedSeason(season.seasonNumber)}
            >
              <TvIcon />
              {seasonLabel(season.seasonNumber)}
            </Button>
          )
        })}
      </div>

      {ratingsUnavailable ? (
        <Card className="bg-muted/40 p-3 text-xs text-muted-foreground">
          Las calificaciones por episodio todavía no están disponibles en este
          entorno. Si administras la base de datos, aplica las migraciones
          pendientes.
        </Card>
      ) : ratingsQuery.isError ? (
        <Card className="flex flex-col items-start gap-2 bg-destructive/10 p-3">
          <p role="alert" className="text-sm text-destructive">
            No se pudieron cargar las calificaciones de los episodios.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void ratingsQuery.refetch()}
          >
            Reintentar
          </Button>
        </Card>
      ) : null}

      {episodesQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {episodesQuery.isError ? (
        <Card className="flex flex-col items-start gap-2 bg-destructive/10 p-3">
          <p role="alert" className="text-sm text-destructive">
            {tmdbUserMessage(episodesQuery.error)}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void episodesQuery.refetch()}
          >
            Reintentar
          </Button>
        </Card>
      ) : null}

      {episodesQuery.data && episodesQuery.data.episodes.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {seasonLabel(episodesQuery.data.seasonNumber)}
            </p>
            <p className="text-xs text-muted-foreground">
              {episodesQuery.data.episodes.length}{' '}
              {episodesQuery.data.episodes.length === 1
                ? 'episodio'
                : 'episodios'}
            </p>
          </div>
          <ol className="flex flex-col gap-2">
            {episodesQuery.data.episodes.map((episode) => {
              const own = ownRatings.get(episode.id)?.rating ?? null
              const partnerRating =
                partnerRatings.get(episode.id)?.rating ?? null
              const still = stillUrl(episode.stillPath, 300)
              return (
                <li
                  key={episode.id}
                  className="flex gap-3 rounded-lg border border-border bg-card p-2.5"
                >
                  <div className="hidden w-28 shrink-0 self-start overflow-hidden rounded-md bg-muted sm:block">
                    {still ? (
                      <img
                        src={still}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
                        {episode.episodeNumber}
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                        {episode.seasonNumber}×{episode.episodeNumber}
                      </span>
                      <p className="min-w-0 truncate text-sm font-medium">
                        {episode.name}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {episode.airDate ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarIcon className="size-3" />
                          {formatShortDate(episode.airDate)}
                        </span>
                      ) : null}
                      {episode.runtimeMinutes ? (
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="size-3" />
                          {episode.runtimeMinutes} min
                        </span>
                      ) : null}
                    </div>

                    {episode.overview ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {episode.overview}
                      </p>
                    ) : null}

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {ratingsUnavailable ? null : (
                        <RatingPicker
                          compact
                          rating={own}
                          disabled={mutations.isPending}
                          onChange={(rating) => {
                            if (rating == null) {
                              mutations.clear.mutate({
                                titleId,
                                tmdbEpisodeId: episode.id,
                              })
                              return
                            }
                            mutations.rate.mutate({
                              titleId,
                              episode: {
                                tmdbEpisodeId: episode.id,
                                seasonNumber: episode.seasonNumber,
                                episodeNumber: episode.episodeNumber,
                              },
                              rating,
                            })
                          }}
                        />
                      )}
                      {partnerRating != null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="font-medium">
                            {partner?.display_name}
                          </span>
                          <RatingStars rating={partnerRating} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          {mutations.rate.isError || mutations.clear.isError ? (
            <p role="alert" className="text-xs text-destructive">
              No se pudo guardar la calificación del episodio.
            </p>
          ) : null}
        </>
      ) : null}

      {episodesQuery.data && episodesQuery.data.episodes.length === 0 ? (
        <Card className="bg-muted/40 p-3 text-sm text-muted-foreground">
          TMDB no tiene episodios para {seasonLabel(activeSeason ?? 0)}.
        </Card>
      ) : null}
    </section>
  )
}
