import { createFileRoute, Link } from '@tanstack/react-router'
import { ActivityIcon, ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { WatchTonight } from '@/components/watch-tonight'
import { statusLabel } from '@/components/catalog'
import { useAuth } from '@/lib/auth'
import { useAllReviews, useCatalog, useHouseholdContext } from '@/lib/queries'
import type { CatalogItem } from '@/lib/catalog'
import type { ReviewRow } from '@/lib/reviews'
import { computeCatalogStats, type CatalogStats } from '@/lib/stats'
import { formatRelativeTime } from '@/lib/format'

export const Route = createFileRoute('/_authenticated/app/')({
  component: DashboardPage,
})

const statCards: Array<{ key: keyof CatalogStats; label: string }> = [
  { key: 'total', label: 'Títulos' },
  { key: 'watchlist', label: 'Pendientes' },
  { key: 'watching', label: 'Viendo' },
  { key: 'watched', label: 'Vistos' },
  { key: 'favorites', label: 'Favoritos' },
  { key: 'watchedByBoth', label: 'Vistos por ambos' },
]

interface ActivityEvent {
  at: string
  text: string
}

/**
 * Recent household activity, derived in memory from the catalog state rows and
 * the household reviews (both already cached by useCatalog/useAllReviews).
 */
function buildActivity(
  items: CatalogItem[],
  reviews: ReviewRow[],
  selfId: string,
  partnerId: string | null,
  nameFor: (userId: string) => string | null,
): ActivityEvent[] {
  const events: ActivityEvent[] = []
  for (const item of items) {
    const title = `«${item.title.title}»`
    const rows = [
      { at: item.ownUpdatedAt, status: item.ownStatus, id: selfId },
      { at: item.partnerUpdatedAt, status: item.partnerStatus, id: partnerId },
    ]
    for (const row of rows) {
      if (!row.at || !row.status || !row.id) continue
      const label = statusLabel(row.status)
      const who = nameFor(row.id)
      if (!label || !who) continue
      events.push({
        at: row.at,
        text: `${who} marcó ${title} como ${label}`,
      })
    }
  }
  const titleById = new Map(
    items.map((item) => [item.title.id, item.title.title]),
  )
  for (const review of reviews) {
    const title = titleById.get(review.title_id)
    if (!title) continue
    const who = nameFor(review.user_id) ?? 'Alguien'
    events.push({
      at: review.updated_at,
      text: `${who} escribió una reseña de «${title}»`,
    })
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
}

function DashboardPage() {
  const auth = useAuth()
  const catalogQuery = useCatalog(auth.user)
  const reviewsQuery = useAllReviews(auth.user)
  const { household, profile, secondMember, members } = useHouseholdContext(
    auth.user,
  )

  const items = catalogQuery.data ?? []
  const stats = computeCatalogStats(items)

  const me = members.find((member) => member.id === auth.user?.id)
  const partner = members.find((member) => member.id !== auth.user?.id)

  const nameFor = (userId: string) =>
    members.find((member) => member.id === userId)?.display_name ?? null

  const activity = buildActivity(
    items,
    reviewsQuery.data ?? [],
    auth.user?.id ?? '',
    partner?.id ?? null,
    nameFor,
  )

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">
            Hola, {me?.display_name ?? profile?.display_name ?? '—'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {household?.name ?? 'Tu hogar'}
            {me && partner
              ? ` · ${partner.display_name} y tú`
              : ' · invita a tu pareja'}
          </p>
        </div>
        {!secondMember && household ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/app/hogar">
              Invita a tu pareja
              <ArrowRightIcon />
            </Link>
          </Button>
        ) : null}
      </header>

      {catalogQuery.isLoading ? (
        <Skeleton className="h-36 w-full rounded-lg" />
      ) : null}

      {catalogQuery.isError ? (
        <Card className="bg-destructive/10 p-4">
          <p role="alert" className="text-sm text-destructive">
            No se pudieron cargar los datos de tu Dashboard.
          </p>
        </Card>
      ) : null}

      {!catalogQuery.isLoading && !catalogQuery.isError ? (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {statCards.map(({ key, label }) => (
              <Card key={key} className="p-3">
                <p className="text-xl font-bold">{stats[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </Card>
            ))}
          </section>

          <WatchTonight />

          <section className="flex flex-col gap-3">
            <header className="flex items-center gap-2">
              <ActivityIcon className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Actividad reciente</h2>
            </header>
            {activity.length === 0 ? (
              <Card className="bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                Todavía no hay actividad. Añade títulos y marca lo que estás
                viendo para empezar.
              </Card>
            ) : (
              <ol className="flex max-w-2xl flex-col divide-y divide-border rounded-lg border border-border">
                {activity.map((event) => (
                  <li
                    key={`${event.at}-${event.text}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">{event.text}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatRelativeTime(event.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
