import type { CatalogItem } from '@/lib/catalog'

/**
 * A title belongs to the shared household watchlist when at least one member
 * still has it pending. The order is a household property (see
 * docs/architecture.md D-19), so both members see exactly the same list.
 */
export function isInHouseholdWatchlist(item: CatalogItem): boolean {
  return item.ownStatus === 'watchlist' || item.partnerStatus === 'watchlist'
}

/** Household watchlist titles, in the shared order (see catalog-order.ts). */
export function householdWatchlist(items: CatalogItem[]): CatalogItem[] {
  return items.filter(isInHouseholdWatchlist)
}

/** Pluralized label for the watchlist count («N títulos pendientes»). */
export function watchlistCountLabel(count: number): string {
  return `${count} título${count === 1 ? '' : 's'} en la lista`
}
