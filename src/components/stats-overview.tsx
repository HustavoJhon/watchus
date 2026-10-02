import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartLegend,
  DonutChart,
  MonthBarChart,
  SegmentedBar,
  type ChartSegment,
} from '@/components/stats-charts'
import type { CatalogItem } from '@/lib/catalog'
import type { ReviewRow } from '@/lib/reviews'
import { computeStats } from '@/lib/stats'
import { cn } from '@/lib/utils'

/**
 * Household statistics in a compact, chart-first layout. Everything is
 * derived in memory from the already-cached catalog, reviews and members, so
 * no extra Supabase queries are fired. Reused by the dashboard.
 */
export function StatsOverview({
  items,
  reviews,
  members,
  viewerId,
}: {
  items: CatalogItem[]
  reviews: ReviewRow[]
  members: Array<{ id: string; displayName: string }>
  viewerId: string
}) {
  const stats = computeStats(items, reviews, members, viewerId)

  const statusSegments: ChartSegment[] = [
    {
      key: 'watchlist',
      label: 'Pendientes',
      value: stats.householdStatus.watchlist,
      color: 'var(--color-watchlist)',
    },
    {
      key: 'watching',
      label: 'Viendo',
      value: stats.householdStatus.watching,
      color: 'var(--color-watching)',
    },
    {
      key: 'watched',
      label: 'Vistos',
      value: stats.householdStatus.watched,
      color: 'var(--color-watched)',
    },
  ]
  const activeTotal = statusSegments.reduce(
    (sum, segment) => sum + segment.value,
    0,
  )

  const typeSegments: ChartSegment[] = [
    {
      key: 'movies',
      label: 'Películas',
      value: stats.mediaTypes.movies,
      color: 'var(--color-primary)',
    },
    {
      key: 'series',
      label: 'Series',
      value: stats.mediaTypes.series,
      color: 'var(--color-ring)',
    },
  ]
  const totalTitles = stats.catalog.total
  const watchedPct =
    totalTitles > 0
      ? Math.round((stats.progress.watched / totalTitles) * 100)
      : 0
  const statusSummary = statusSegments
    .map((segment) => `${segment.label}: ${segment.value}`)
    .concat(`Sin estado: ${stats.householdStatus.none}`)
    .join(' · ')
  const activitySummary = stats.watchedActivity
    .map((month) => `${month.label}: ${month.count}`)
    .join(' · ')
  const maxRatingCount = Math.max(
    1,
    ...stats.ratingDistribution.map((bucket) => bucket.count),
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado de la biblioteca</CardTitle>
          <CardDescription>
            Cada título cuenta una sola vez, aunque ambos miembros tengan
            estados distintos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeTotal === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay títulos con estado. Añade títulos desde la búsqueda.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <DonutChart
                segments={statusSegments}
                centerValue={String(activeTotal)}
                centerLabel="con estado"
              />
              <ChartLegend segments={statusSegments} total={activeTotal} />
            </div>
          )}
          <p className="sr-only">{statusSummary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Películas vs series</CardTitle>
          <CardDescription>
            Composición del catálogo compartido ({totalTitles} títulos).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {totalTitles === 0 ? (
            <p className="text-sm text-muted-foreground">
              El catálogo aún está vacío.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <SegmentedBar segments={typeSegments} />
              <ChartLegend segments={typeSegments} total={totalTitles} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progreso de la biblioteca</CardTitle>
          <CardDescription>
            Títulos vistos por al menos un miembro del hogar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {totalTitles === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay títulos en el catálogo.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vistos</span>
                <span className="font-semibold tabular-nums">
                  {stats.progress.watched} de {totalTitles} · {watchedPct}%
                </span>
              </div>
              <div
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-watched"
                  style={{ width: `${watchedPct}%` }}
                />
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <li>{stats.progress.watchlist} pendientes</li>
                <li>{stats.progress.watching} viendo</li>
                <li>{stats.progress.watchedByBoth} vistos por ambos</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Marcados como vistos por mes
          </CardTitle>
          <CardDescription>
            Cada vez que alguien del hogar marca un título como visto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.watchedActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no han marcado nada como visto.
            </p>
          ) : (
            <>
              <MonthBarChart data={stats.watchedActivity} />
              <p className="sr-only">{activitySummary}</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus ratings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {stats.ratingDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no has puntuado ningún título.
            </p>
          ) : (
            stats.ratingDistribution.map((bucket) => (
              <div
                key={bucket.value}
                className="flex items-center gap-2 text-sm"
              >
                <span className="w-8 shrink-0 text-muted-foreground">
                  {bucket.value.toFixed(1)}
                </span>
                <div className="h-4 flex-1 rounded-md bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-md bg-primary/80',
                      bucket.count === 0 && 'w-0',
                    )}
                    style={{
                      width: `${(bucket.count / maxRatingCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-xs text-muted-foreground">
                  {bucket.count}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Géneros más vistos</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topGenres.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay títulos vistos para calcular géneros.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {stats.topGenres.map(({ genre, count }) => (
                <li
                  key={genre}
                  className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                >
                  <span className="font-medium">{genre}</span>{' '}
                  <span className="text-muted-foreground">×{count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
