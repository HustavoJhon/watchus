import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { DicesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { useCatalog, useHouseholdContext } from '@/lib/queries'
import { statusLabel } from '@/components/catalog'
import { getWatchTonightCandidates, pickWatchTonight } from '@/lib/watch'
import { posterUrl } from '@/lib/tmdb/config'

function randomIndex(seed: number, length: number): number {
  if (length <= 1) return 0
  return Math.min(length - 1, Math.floor(seed * length))
}

/** "¿Qué vemos hoy?" — random pick from the household candidates. */
export function WatchTonight() {
  const auth = useAuth()
  const catalogQuery = useCatalog(auth.user)
  const { members } = useHouseholdContext(auth.user)
  const [seed, setSeed] = useState(() => Math.random())

  const items = catalogQuery.data ?? []
  const candidates = useMemo(() => getWatchTonightCandidates(items), [items])
  const selected = useMemo(
    () => pickWatchTonight(candidates, () => seed),
    [candidates, seed],
  )

  const name = (userId: string) =>
    members.find((member) => member.id === userId)?.display_name ?? '—'

  if (catalogQuery.isLoading) {
    return <Skeleton className="h-40 w-full rounded-lg" />
  }

  if (catalogQuery.isError) {
    return (
      <Card className="bg-destructive/10 p-4">
        <p role="alert" className="text-sm text-destructive">
          No se pudo preparar la sugerencia.
        </p>
      </Card>
    )
  }

  function pickAnother() {
    if (candidates.length <= 1) {
      setSeed(Math.random())
      return
    }
    let next = Math.random()
    let attempts = 0
    while (
      randomIndex(next, candidates.length) ===
        randomIndex(seed, candidates.length) &&
      attempts < 20
    ) {
      next = Math.random()
      attempts += 1
    }
    setSeed(next)
  }

  if (candidates.length === 0 || !selected) {
    return (
      <Card className="flex flex-col items-start gap-2 bg-muted/40 p-4">
        <div className="flex items-center gap-2">
          <DicesIcon className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">¿Qué vemos hoy?</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No hay nada pendiente para ver juntos. Añade títulos a vuestro
          catálogo o déjalos en pendientes.
        </p>
        <Button asChild size="sm">
          <Link to="/app/search" search={{ q: '' }}>
            Buscar algo que ver
          </Link>
        </Button>
      </Card>
    )
  }

  const poster = posterUrl(selected.title.poster_path, 300)
  const partner = members.find((member) => member.id !== auth.user?.id)

  const statuses: Array<{ userId: string; label: string }> = []
  if (selected.ownStatus) {
    statuses.push({
      userId: auth.user!.id,
      label: statusLabel(selected.ownStatus)!,
    })
  }
  if (selected.partnerStatus && partner) {
    statuses.push({
      userId: partner.id,
      label: statusLabel(selected.partnerStatus)!,
    })
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <DicesIcon className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">¿Qué vemos hoy?</h2>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Link
          to="/app/title/$titleId"
          params={{ titleId: selected.title.id }}
          search={{
            tmdbId: selected.title.tmdb_id,
            mediaType: selected.title.media_type,
          }}
          className="group w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
        >
          {poster ? (
            <img
              src={poster}
              alt={`Póster de ${selected.title.title}`}
              className="aspect-[2/3] w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center p-2">
              <span className="line-clamp-3 text-center text-xs font-semibold text-muted-foreground">
                {selected.title.title}
              </span>
            </div>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/title/$titleId"
              params={{ titleId: selected.title.id }}
              search={{
                tmdbId: selected.title.tmdb_id,
                mediaType: selected.title.media_type,
              }}
              className="text-lg font-bold hover:underline"
            >
              {selected.title.title}
            </Link>
            {selected.title.year ? (
              <span className="text-sm text-muted-foreground">
                {selected.title.year}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge>
              {selected.title.media_type === 'tv' ? 'Serie' : 'Película'}
            </Badge>
            {statuses.map((item) => (
              <Badge key={item.userId} variant="outline">
                {name(item.userId)} · {item.label}
              </Badge>
            ))}
          </div>
          {selected.ownRating != null || selected.partnerRating != null ? (
            <p className="text-sm text-muted-foreground">
              {selected.ownRating != null
                ? `${name(auth.user!.id)} lo puntúa ${selected.ownRating.toFixed(1)}`
                : null}
              {selected.ownRating != null && selected.partnerRating != null
                ? ' · '
                : null}
              {partner && selected.partnerRating != null
                ? `${name(partner.id)} lo puntúa ${selected.partnerRating.toFixed(1)}`
                : null}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 self-start"
            onClick={pickAnother}
          >
            <DicesIcon />
            Elegir otra
          </Button>
        </div>
      </div>
    </Card>
  )
}
