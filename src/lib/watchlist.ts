import type { CatalogItem, WatchScope } from '@/lib/catalog'

/**
 * Which pending queue the viewer is looking at.
 *
 * `shared`   -> the household queue: every title the viewer or their partner
 *               has pending as 'shared'. Both members see and reorder the same
 *               list, so the order lives in household_watchlist_order.
 * `personal` -> the viewer's own queue: only the titles they marked 'personal'.
 *               Private to them, reordered only by them, and unaffected by
 *               whatever their partner does.
 *
 * The two are genuinely independent: a title can hold a position in both at
 * once (partner marked it shared, viewer marked it personal).
 */
export type WatchlistScope = WatchScope

export const WATCHLIST_SCOPES: WatchlistScope[] = ['shared', 'personal']

/**
 * A title belongs to the shared household queue when the viewer or their partner
 * still has it pending *as shared*. A partner holding it as personal does not
 * put it in the household queue.
 */
export function isInSharedWatchlist(item: CatalogItem): boolean {
  const partnerPendingShared =
    item.partnerStatus === 'watchlist' && item.partnerScope === 'shared'
  const ownPendingShared =
    item.ownStatus === 'watchlist' && item.ownScope === 'shared'
  return partnerPendingShared || ownPendingShared
}

/** A title belongs to the viewer's personal queue only through their own row. */
export function isInPersonalWatchlist(item: CatalogItem): boolean {
  return item.ownStatus === 'watchlist' && item.ownScope === 'personal'
}

/** True when the viewer has it pending in the given queue. */
export function isPendingInScope(
  item: CatalogItem,
  scope: WatchlistScope,
): boolean {
  return scope === 'shared'
    ? isInSharedWatchlist(item)
    : isInPersonalWatchlist(item)
}

/** Titles pending in the given queue, in that queue's order (catalog-order.ts). */
export function pendingInScope(
  items: CatalogItem[],
  scope: WatchlistScope,
): CatalogItem[] {
  return items.filter((item) => isPendingInScope(item, scope))
}

/** Both queues at once, in the order the viewer sees them. */
export interface WatchlistSections {
  shared: CatalogItem[]
  personal: CatalogItem[]
  total: number
}

export function watchlistSections(items: CatalogItem[]): WatchlistSections {
  const shared = pendingInScope(items, 'shared')
  const personal = pendingInScope(items, 'personal')
  return { shared, personal, total: shared.length + personal.length }
}

/** Pluralized label for the watchlist count («N títulos pendientes»). */
export function watchlistCountLabel(count: number): string {
  return `${count} título${count === 1 ? '' : 's'} en la lista`
}

/** Human label for a queue, used in section headers and filter chips. */
export function watchlistScopeLabel(scope: WatchlistScope): string {
  return scope === 'shared' ? 'Hogar' : 'Solo para mí'
}
