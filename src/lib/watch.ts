import type { CatalogItem } from '@/lib/catalog'
import { watchedByBoth } from '@/lib/catalog'

/**
 * Candidates for "¿Qué vemos hoy?", deterministic on the catalog:
 * 1. titles both members have in their watchlist, else
 * 2. titles where at least one member has it pending.
 * Titles already watched by both are always excluded.
 */
export function getWatchTonightCandidates(items: CatalogItem[]): CatalogItem[] {
  const notWatchedByBoth = items.filter((item) => !watchedByBoth(item))
  const sharedPending = notWatchedByBoth.filter(
    (item) =>
      item.ownStatus === 'watchlist' && item.partnerStatus === 'watchlist',
  )
  if (sharedPending.length > 0) return sharedPending
  return notWatchedByBoth.filter(
    (item) =>
      item.ownStatus === 'watchlist' || item.partnerStatus === 'watchlist',
  )
}

/**
 * Random but reproducible pick (injectable RNG for tests). Returns null only
 * when there is nothing left to watch.
 */
export function pickWatchTonight(
  items: CatalogItem[],
  rng: () => number = Math.random,
): CatalogItem | null {
  const candidates = getWatchTonightCandidates(items)
  if (candidates.length === 0) return null
  const index = Math.min(
    candidates.length - 1,
    Math.floor(rng() * candidates.length),
  )
  return candidates[index]
}
