import type { CatalogItem } from '@/lib/catalog'
import type { WatchStatus } from '@/lib/catalog'

/** Media-type filter. */
export type MediaTypeFilter = 'all' | 'movie' | 'tv'

/** Watch-status filter. */
export type StatusFilter = 'all' | WatchStatus

/** Favorite filter. */
export type FavoriteFilter = 'all' | 'favorites'

export interface CatalogFilters {
  type: MediaTypeFilter
  status: StatusFilter
  favorites: FavoriteFilter
  /** Local in-catalog search by title name (no TMDB call). */
  query: string
}

export const DEFAULT_FILTERS: CatalogFilters = {
  type: 'all',
  status: 'all',
  favorites: 'all',
  query: '',
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.type !== 'all' ||
    filters.status !== 'all' ||
    filters.favorites !== 'all' ||
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
  if (filters.status !== 'all' && item.ownStatus !== filters.status) {
    return false
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
      filters.status === 'watching'
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

  return `${count} ${parts.join(' ')}`
}
