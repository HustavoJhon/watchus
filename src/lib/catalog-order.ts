import type { CatalogItem } from '@/lib/catalog'

/**
 * Orders the pending list: the shared household watchlist position wins, then
 * titles without a position fall back to the default catalog order (newest
 * created first). Titles leaving the watchlist keep a (compacted) position
 * behind the pending block, so the relative order is preserved.
 */
export function compareWatchlistPosition(
  a: CatalogItem,
  b: CatalogItem,
): number {
  const pa = a.watchlistPosition
  const pb = b.watchlistPosition
  if (pa != null && pb != null) return pa - pb
  if (pa != null) return -1
  if (pb != null) return 1
  return (
    b.title.created_at.localeCompare(a.title.created_at) ||
    a.title.id.localeCompare(b.title.id)
  )
}

export function sortByWatchlistPosition(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort(compareWatchlistPosition)
}

/**
 * Maps the household's order rows onto the items and returns them sorted.
 * Items without an order row keep the default catalog order.
 */
export function attachWatchlistOrder(
  items: CatalogItem[],
  order: Array<{ title_id: string; position: number }>,
): CatalogItem[] {
  const positionByTitle = new Map(
    order.map((row) => [row.title_id, row.position]),
  )
  const withPosition = items.map((item) => ({
    ...item,
    watchlistPosition: positionByTitle.get(item.title.id) ?? null,
  }))
  return sortByWatchlistPosition(withPosition)
}

/**
 * Pure array move used by drag & drop and the up/down buttons: returns a new
 * array with the element at `from` moved to `to`.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  ) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Produces the catalog array that reflects a new pending order: the ordered
 * pending titles (given as title ids) come first, everything else keeps its
 * place behind them. Used for the optimistic reorder update.
 */
export function applyPendingOrder(
  items: CatalogItem[],
  orderedTitleIds: string[],
): CatalogItem[] {
  const byId = new Map(items.map((item) => [item.title.id, item]))
  const ordered = orderedTitleIds
    .map((id) => byId.get(id))
    .filter((item): item is CatalogItem => item != null)
  const orderedIds = new Set(orderedTitleIds)
  const rest = items.filter((item) => !orderedIds.has(item.title.id))
  return [...ordered, ...rest]
}

/**
 * Recomputes the full pending order when only a filtered subset is visible
 * (e.g. a movie-only view). `displayedIds` must be a subsequence of
 * `fullIds`; the item at `from` moves to `to` inside the subset, and the
 * hidden items keep their relative place in the full list. Returns the new
 * full id order (the full pending set, as required by the RPC).
 */
export function reorderWithSubset(
  fullIds: string[],
  displayedIds: string[],
  from: number,
  to: number,
): string[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= displayedIds.length ||
    to >= displayedIds.length ||
    from === to
  ) {
    return fullIds
  }
  const movedId = displayedIds[from]
  const newDisplayed = moveItem(displayedIds, from, to)
  const without = fullIds.filter((id) => id !== movedId)
  if (to === 0) {
    return [movedId, ...without]
  }
  const previous = newDisplayed[to - 1]
  const at = without.indexOf(previous)
  const next = [...without]
  next.splice(at + 1, 0, movedId)
  return next
}
