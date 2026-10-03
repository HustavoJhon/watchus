import type { CatalogItem } from '@/lib/catalog'
import type { WatchlistScope } from '@/lib/watchlist'

/**
 * Reads the position a title holds in one of the two queues. They are separate
 * lists, so a title can be positioned in one, both or neither.
 */
export function positionForScope(
  item: CatalogItem,
  scope: WatchlistScope,
): number | null {
  return scope === 'shared' ? item.sharedPosition : item.personalPosition
}

/**
 * Orders a pending list by its queue position. Titles without a position fall
 * back to the default catalog order (newest created first).
 *
 * The server keeps each queue gap-free 1..N and holds exactly one row per
 * pending title, so the fallback is only a safety net for a title that is
 * pending but whose order row has not loaded yet.
 */
export function compareWatchlistPosition(
  a: CatalogItem,
  b: CatalogItem,
  scope: WatchlistScope,
): number {
  const pa = positionForScope(a, scope)
  const pb = positionForScope(b, scope)
  if (pa != null && pb != null) return pa - pb
  if (pa != null) return -1
  if (pb != null) return 1
  return (
    b.title.created_at.localeCompare(a.title.created_at) ||
    a.title.id.localeCompare(b.title.id)
  )
}

export function sortByWatchlistPosition(
  items: CatalogItem[],
  scope: WatchlistScope,
): CatalogItem[] {
  return [...items].sort((a, b) => compareWatchlistPosition(a, b, scope))
}

/**
 * Maps order rows onto the items for one queue and returns them sorted.
 * Items without an order row keep the default catalog order.
 */
export function attachWatchlistOrder(
  items: CatalogItem[],
  order: Array<{ title_id: string; position: number }>,
  scope: WatchlistScope,
): CatalogItem[] {
  const positionByTitle = new Map(
    order.map((row) => [row.title_id, row.position]),
  )
  const withPosition = items.map((item) =>
    scope === 'shared'
      ? {
          ...item,
          sharedPosition: positionByTitle.get(item.title.id) ?? null,
        }
      : {
          ...item,
          personalPosition: positionByTitle.get(item.title.id) ?? null,
        },
  )
  return sortByWatchlistPosition(withPosition, scope)
}

/**
 * Writes positions 1..N onto the items of one queue, leaving the other queue's
 * positions untouched. Used by the optimistic reorder so the numbers the UI
 * shows match the order that was just submitted.
 */
export function applyOptimisticPositions(
  items: CatalogItem[],
  orderedTitleIds: string[],
  scope: WatchlistScope,
): CatalogItem[] {
  const positionById = new Map(
    orderedTitleIds.map((id, index) => [id, index + 1]),
  )
  return items.map((item) => {
    const position = positionById.get(item.title.id) ?? null
    return scope === 'shared'
      ? { ...item, sharedPosition: position }
      : { ...item, personalPosition: position }
  })
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
 * Produces the catalog array that reflects a new order for one queue: the
 * ordered titles come first, everything else keeps its place behind them.
 * Positions are written separately by `applyOptimisticPositions`.
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
