import type { CatalogItem, WatchStatus } from '@/lib/catalog'
import { isPendingInScope } from '@/lib/watchlist'
import type { WatchlistScope } from '@/lib/watchlist'

/** Media-type filter. */
export type MediaTypeFilter = 'all' | 'movie' | 'tv'

/**
 * Watch-status filter. `none` means the title has no state at all yet
 * (added to the catalog but nothing decided); it matches ownStatus === null.
 */
export type StatusFilter = 'all' | 'none' | WatchStatus

/** Favorite filter. */
export type FavoriteFilter = 'all' | 'favorites'

/**
 * Which pending queue to show: `all` (both), the household queue or the
 * viewer's personal one. Only meaningful together with status === 'watchlist'.
 */
export type ScopeFilter = 'all' | WatchlistScope

export interface CatalogFilters {
  type: MediaTypeFilter
  status: StatusFilter
  favorites: FavoriteFilter
  scope: ScopeFilter
  /** Local in-catalog search by title name (no TMDB call). */
  query: string
}

export const DEFAULT_FILTERS: CatalogFilters = {
  type: 'all',
  status: 'all',
  favorites: 'all',
  scope: 'all',
  query: '',
}

/** The scope filter only narrows pending titles, so it is inert otherwise. */
export function scopeFilterApplies(filters: CatalogFilters): boolean {
  return filters.status === 'watchlist' && filters.scope !== 'all'
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.type !== 'all' ||
    filters.status !== 'all' ||
    filters.favorites !== 'all' ||
    scopeFilterApplies(filters) ||
    filters.query.trim() !== ''
  )
}

export function matchesCatalogQuery(item: CatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return item.title.title.toLowerCase().includes(q)
}

export function matchesCatalogFilters(
  item: CatalogItem,
  filters: CatalogFilters,
): boolean {
  if (filters.type !== 'all' && item.title.media_type !== filters.type) {
    return false
  }
  if (filters.status === 'watchlist' && filters.scope !== 'all') {
    // When a queue is selected it owns the meaning of «Pendientes»: the
    // household queue also holds whatever the partner has pending as shared,
    // which the plain own-status check below would hide.
    if (!isPendingInScope(item, filters.scope)) return false
  } else if (filters.status !== 'all') {
    if (filters.status === 'none') {
      if (item.ownStatus !== null) return false
    } else if (item.ownStatus !== filters.status) {
      return false
    }
  }
  if (filters.favorites === 'favorites' && !item.ownFavorite) {
    return false
  }
  return matchesCatalogQuery(item, filters.query)
}

/** Applies filters preserving the underlying catalog order. */
export function filterCatalog(
  items: CatalogItem[],
  filters: CatalogFilters,
): CatalogItem[] {
  return items.filter((item) => matchesCatalogFilters(item, filters))
}

export function countLabelOf(
  items: CatalogItem[],
  filters: CatalogFilters,
): string {
  const count = items.length
  if (count === 0) return '0 títulos'

  // Base noun with gender for Spanish concordance.
  const noun =
    filters.type === 'movie'
      ? count === 1
        ? 'película'
        : 'películas'
      : filters.type === 'tv'
        ? count === 1
          ? 'serie'
          : 'series'
        : count === 1
          ? 'título'
          : 'títulos'

  const feminine = filters.type !== 'all'
  const parts: string[] = [noun]

  if (filters.favorites === 'favorites') {
    parts.push(
      feminine
        ? count === 1
          ? 'favorita'
          : 'favoritas'
        : count === 1
          ? 'favorito'
          : 'favoritos',
    )
  }

  if (filters.status !== 'all') {
    const statusWord =
      filters.status === 'none'
        ? 'sin estado'
        : filters.status === 'watching'
          ? 'en curso'
          : filters.status === 'watched'
            ? feminine
              ? count === 1
                ? 'vista'
                : 'vistas'
              : count === 1
                ? 'visto'
                : 'vistos'
            : count === 1
              ? 'pendiente'
              : 'pendientes'
    parts.push(statusWord)
  }

  if (filters.status === 'watchlist' && filters.scope !== 'all') {
    parts.push(filters.scope === 'shared' ? 'del hogar' : 'solo para mí')
  }

  return `${count} ${parts.join(' ')}`
}
