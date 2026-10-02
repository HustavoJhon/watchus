import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { HeartIcon, StarIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useCatalogMutations } from '@/lib/queries'
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

const stateStyles: Record<WatchStatus, string> = {
  watchlist: 'bg-watchlist/15 text-watchlist',
  watching: 'bg-watching/15 text-watching',
  watched: 'bg-watched/15 text-watched',
}

export function StateBadge({ status }: { status: WatchStatus | null }) {
  if (!status) return null
  return <Badge className={stateStyles[status]}>{statusLabels[status]}</Badge>
}

export function mediaTypeLabel(mediaType: string): string {
  return mediaType === 'tv' ? 'Serie' : 'Película'
}

const RATING_STEPS = [1, 2, 3, 4, 5] as const

function RatingStarIcon({
  step,
  rating,
  className,
}: {
  step: number
  rating: number | null
  className?: string
}) {
  const isFull = rating != null && rating >= step
  const isHalf = rating != null && rating === step - 0.5
  return (
    <StarIcon
      className={cn(
        className,
        'pointer-events-none',
        isFull
          ? 'fill-rating text-rating'
          : isHalf
            ? 'fill-rating/40 text-rating'
            : 'text-muted-foreground/40',
      )}
    />
  )
}

/** Compact display of a 0.5–5 rating using WatchUs' star representation. */
export function RatingStars({
  rating,
  className = 'size-3.5',
}: {
  rating: number | null
  className?: string
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={
        rating != null
          ? `Valoración ${rating.toFixed(1)} de 5`
          : 'Sin valoración'
      }
    >
      {RATING_STEPS.map((step) => (
        <RatingStarIcon
          key={step}
          step={step}
          rating={rating}
          className={className}
        />
      ))}
    </span>
  )
}

/** Inline favorite toggle with a generous touch target but a small glyph. */
function FavoriteButton({
  item,
  className,
}: {
  item: CatalogItem
  className?: string
}) {
  const auth = useAuth()
  const mutations = useCatalogMutations(auth.user)
  const busy = mutations.favorite.isPending
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      disabled={busy}
      aria-pressed={item.ownFavorite}
      aria-label={item.ownFavorite ? 'Quitar de favoritos' : 'Marcar favorito'}
      className={cn(
        '-m-1 shrink-0 text-muted-foreground hover:text-foreground',
        item.ownFavorite && 'text-favorite hover:text-favorite',
        className,
      )}
      onClick={() =>
        mutations.favorite.mutate({
          titleId: item.title.id,
          favorite: !item.ownFavorite,
        })
      }
    >
      <HeartIcon className={cn('size-4', item.ownFavorite && 'fill-current')} />
    </Button>
  )
}

/**
 * Poster-first media card: consistent poster ratio, truncated title, a compact
 * year/rating row and an inline favorite toggle. Nothing else is shown
 * permanently; state and secondary actions live in the detail view.
 */
export function TitleCard({
  item,
  menu,
  position,
}: {
  item: CatalogItem
  /** Optional overlay actions (e.g. reorder) shown over the poster. */
  menu?: ReactNode
  /** Optional shared-watchlist position shown as a discreet `#N` chip. */
  position?: number | null
}) {
  const { title } = item
  const poster = posterUrl(title.poster_path, 300)

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-accent/40">
      <Link
        to="/app/title/$titleId"
        params={{ titleId: title.id }}
        search={{ tmdbId: title.tmdb_id, mediaType: title.media_type }}
        className="relative block aspect-[2/3] shrink-0 overflow-hidden bg-muted"
      >
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
        {position != null ? (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-background/70 px-1.5 py-0.5 text-[0.65rem] leading-none font-semibold text-foreground/80 backdrop-blur-sm">
            #{position}
          </span>
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <Link
            to="/app/title/$titleId"
            params={{ titleId: title.id }}
            search={{ tmdbId: title.tmdb_id, mediaType: title.media_type }}
            className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="line-clamp-2 text-sm leading-snug font-semibold">
              {title.title}
            </p>
          </Link>
          <FavoriteButton item={item} />
        </div>
        <div className="mt-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {title.year ? <span className="shrink-0">{title.year}</span> : null}
          {item.ownRating != null ? (
            <RatingStars rating={item.ownRating} />
          ) : null}
        </div>
      </div>

      {menu ? (
        <div className="absolute top-2 right-2 z-10 transition-opacity md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:focus-within:pointer-events-auto md:focus-within:opacity-100">
          {menu}
        </div>
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
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-pressed={active}
            className={
              active
                ? option.value === null
                  ? 'bg-secondary text-secondary-foreground'
                  : stateStyles[option.value]
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}

export function RatingPicker({
  rating,
  onChange,
  disabled,
  compact = false,
}: {
  rating: number | null
  onChange: (rating: number | null) => void
  disabled?: boolean
  /** Smaller stars to fit narrow card footers. */
  compact?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {RATING_STEPS.map((step) => (
        <span key={step} className="relative inline-flex">
          <button
            type="button"
            aria-label={`Puntuar ${step - 0.5}`}
            disabled={disabled}
            onClick={() => onChange(rating === step - 0.5 ? null : step - 0.5)}
            className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
          />
          <button
            type="button"
            aria-label={`Puntuar ${step}`}
            disabled={disabled}
            onClick={() => onChange(rating === step ? null : step)}
            className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
          />
          <RatingStarIcon
            step={step}
            rating={rating}
            className={compact ? 'size-4' : 'size-5'}
          />
        </span>
      ))}
      {rating != null ? (
        <span className="ml-1 text-xs text-muted-foreground">
          {rating.toFixed(1)}
        </span>
      ) : null}
    </div>
  )
}
