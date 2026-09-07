import { createFileRoute } from '@tanstack/react-router'
import { BarChart3Icon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useAllReviews, useCatalog, useHouseholdContext } from '@/lib/queries'
import { computeStats } from '@/lib/stats'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/app/stats')({
  component: StatsPage,
})

const statLabels: Array<{
  key: keyof ReturnType<typeof computeStats>['catalog']
  label: string
}> = [
  { key: 'total', label: 'Títulos' },
  { key: 'movies', label: 'Películas' },
  { key: 'series', label: 'Series' },
  { key: 'watchlist', label: 'Pendientes' },
  { key: 'watching', label: 'Viendo' },
  { key: 'watched', label: 'Vistos' },
  { key: 'favorites', label: 'Favoritos' },
  { key: 'watchedByBoth', label: 'Vistos por ambos' },
]

function StatsPage() {
  const auth = useAuth()
  const catalogQuery = useCatalog(auth.user)
  const reviewsQuery = useAllReviews(auth.user)
  const { members, isLoading: contextLoading } = useHouseholdContext(auth.user)

  const isLoading =
    catalogQuery.isLoading || reviewsQuery.isLoading || contextLoading

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-lg" />
  }

  const items = catalogQuery.data ?? []
  const reviews = reviewsQuery.data ?? []
  const householdMembers = members.map((member) => ({
    id: member.id,
    displayName: member.display_name,
  }))
  const stats = computeStats(items, reviews, householdMembers, auth.user!.id)

  if (catalogQuery.isError || reviewsQuery.isError) {
    return (
      <Card className="flex flex-col items-start gap-2 bg-destructive/10 p-4">
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar las estadísticas.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void catalogQuery.refetch()
            void reviewsQuery.refetch()
          }}
        >
          Reintentar
        </Button>
      </Card>
    )
  }

  const maxRatingCount = Math.max(
    1,
    ...stats.ratingDistribution.map((bucket) => bucket.count),
  )

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="flex items-center gap-2">
        <BarChart3Icon className="size-5 text-muted-foreground" />
        <h1 className="text-base font-semibold">Estadísticas</h1>
      </header>

      {stats.users.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {stats.users.map((user) => (
            <Card key={user.userId}>
              <CardHeader>
                <CardTitle className="text-base">{user.displayName}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <StatCell value={user.watched} label="vistos" />
                <StatCell
                  value={
                    user.avgRating != null ? user.avgRating.toFixed(1) : '—'
                  }
                  label="rating promedio"
                />
                <StatCell value={user.rated} label="títulos puntuados" />
                <StatCell value={user.reviews} label="reseñas" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {statLabels.map(({ key, label }) => (
            <StatCell key={key} value={stats.catalog[key]} label={label} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vistos en el hogar</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm">
          <StatCell value={stats.moviesWatched} label="películas vistas" />
          <StatCell value={stats.seriesWatched} label="series vistas" />
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

function StatCell({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-border p-2">
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
