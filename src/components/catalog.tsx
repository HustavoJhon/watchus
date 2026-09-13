import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { StarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { posterUrl } from '@/lib/tmdb/config'
import type { CatalogItem } from '@/lib/catalog'
import type { WatchStatus } from '@/lib/catalog'

export type { CatalogItem }

const statusLabels: Record<WatchStatus, string> = {
  watchlist: 'Pendiente',
  watching: 'Viendo',
  watched: 'Visto',
}

export function statusLabel(status: WatchStatus | null): string | null {
  return status ? statusLabels[status] : null
}

export function StateBadge({ status }: { status: WatchStatus | null }) {
  if (!status) return null
  return <Badge variant="secondary">{statusLabels[status]}</Badge>
}

function mediaTypeLabel(mediaType: string): string {
  return mediaType === 'tv' ? 'Serie' : 'Película'
}

export function TitleCard({
  item,
  footer,
  menu,
  position,
}: {
  item: CatalogItem
  footer?: ReactNode
  /** Optional overlay actions (e.g. remove) rendered top-right over the poster. */
  menu?: ReactNode
  /** Optional shared-watchlist position shown as a top-left badge. */
  position?: number | null
}) {
  const { title } = item
  const poster = posterUrl(title.poster_path, 300)
  const byBoth =
    item.ownStatus === 'watched' && item.partnerStatus === 'watched'

  return (
    <article className="group relative overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent/40">
      <Link
        to="/app/title/$titleId"
        params={{ titleId: title.id }}
        search={{ tmdbId: title.tmdb_id, mediaType: title.media_type }}
        className="flex flex-col"
      >
        <div className="relative aspect-[2/3] overflow-hidden bg-muted">
          {poster ? (
            <img
              src={poster}
              alt={`Póster de ${title.title}`}
              className="size-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center p-3">
              <span className="line-clamp-3 text-center text-sm font-semibold text-muted-foreground">
                {title.title}
              </span>
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1">
            <Badge>{mediaTypeLabel(title.media_type)}</Badge>
            {item.ownFavorite ? <Badge variant="default">★</Badge> : null}
            {position != null ? (
              <Badge variant="outline">#{position}</Badge>
            ) : null}
          </div>
          {byBoth ? (
            <div className="absolute right-2 bottom-2">
              <Badge>Visto por ambos ♥</Badge>
            </div>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <p className="line-clamp-1 text-sm font-semibold">{title.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{title.year ?? '—'}</span>
            {item.ownRating ? (
              <span className="inline-flex items-center gap-0.5">
                <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                {item.ownRating.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      {menu ? <div className="absolute top-2 right-2 z-10">{menu}</div> : null}
      {footer ? (
        <div className="border-t border-border p-2">{footer}</div>
      ) : null}
    </article>
  )
}

export function StatusPicker({
  status,
  onChange,
  disabled,
}: {
  status: WatchStatus | null
  onChange: (status: WatchStatus | null) => void
  disabled?: boolean
}) {
  const options: Array<{ value: WatchStatus | null; label: string }> = [
    { value: null, label: 'Sin estado' },
    { value: 'watchlist', label: 'Pendiente' },
    { value: 'watching', label: 'Viendo' },
    { value: 'watched', label: 'Visto' },
  ]
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const active = status === option.value
        return (
          <Button
            key={option.label}
            type="button"
            variant={active ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}

const RATING_STEPS = [1, 2, 3, 4, 5] as const

export function RatingPicker({
  rating,
  onChange,
  disabled,
}: {
  rating: number | null
  onChange: (rating: number | null) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {RATING_STEPS.map((step) => {
        const isFull = rating != null && rating >= step
        const isHalf = rating != null && rating === step - 0.5
        return (
          <span key={step} className="relative inline-flex">
            <button
              type="button"
              aria-label={`Puntuar ${step - 0.5}`}
              disabled={disabled}
              onClick={() =>
                onChange(rating === step - 0.5 ? null : step - 0.5)
              }
              className="absolute inset-0 left-0 z-10 w-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
            />
            <button
              type="button"
              aria-label={`Puntuar ${step}`}
              disabled={disabled}
              onClick={() => onChange(rating === step ? null : step)}
              className="absolute inset-0 right-0 z-10 w-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
            />
            <StarIcon
              className={cn(
                'size-5 pointer-events-none',
                isFull
                  ? 'fill-amber-400 text-amber-400'
                  : isHalf
                    ? 'fill-amber-400/50 text-amber-400'
                    : 'text-muted-foreground/40',
              )}
            />
          </span>
        )
      })}
      {rating != null ? (
        <span className="ml-1 text-xs text-muted-foreground">
          {rating.toFixed(1)}
        </span>
      ) : null}
    </div>
  )
}
