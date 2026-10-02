import type { CatalogItem } from '@/lib/catalog'
import { watchedByBoth } from '@/lib/catalog'
import type { ReviewRow } from '@/lib/reviews'

/** Counts derived directly from the household catalog, without extra queries. */
export interface CatalogStats {
  total: number
  movies: number
  series: number
  watchlist: number
  watching: number
  watched: number
  favorites: number
  rated: number
  watchedByBoth: number
}

export interface UserStats {
  userId: string
  displayName: string
  watched: number
  rated: number
  avgRating: number | null
  reviews: number
}

export interface TitleStats {
  catalog: CatalogStats
  users: UserStats[]
  ratingDistribution: Array<{ value: number; count: number }>
  topGenres: Array<{ genre: string; count: number }>
  moviesWatched: number
  seriesWatched: number
  householdStatus: HouseholdStatusCounts
  mediaTypes: MediaTypeCounts
  progress: CatalogProgress
  watchedActivity: MonthlyWatched[]
}

export function computeCatalogStats(items: CatalogItem[]): CatalogStats {
  return {
    total: items.length,
    movies: items.filter((item) => item.title.media_type === 'movie').length,
    series: items.filter((item) => item.title.media_type === 'tv').length,
    watchlist: items.filter((item) => item.ownStatus === 'watchlist').length,
    watching: items.filter((item) => item.ownStatus === 'watching').length,
    watched: items.filter((item) => item.ownStatus === 'watched').length,
    favorites: items.filter((item) => item.ownFavorite).length,
    rated: items.filter((item) => item.ownRating != null).length,
    watchedByBoth: items.filter(watchedByBoth).length,
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((acc, value) => acc + value, 0)
  return Math.round((sum / values.length) * 10) / 10
}

function reviewCount(reviews: ReviewRow[], userId: string): number {
  return reviews.filter((review) => review.user_id === userId).length
}

/** Viewer-oriented aggregation: reads the signed-in user's own state. */
export function computeUserStats(
  items: CatalogItem[],
  reviews: ReviewRow[],
  userId: string,
  displayName: string,
): UserStats {
  const ratings = items
    .map((item) => item.ownRating)
    .filter((rating): rating is number => rating != null)
  return {
    userId,
    displayName,
    watched: items.filter((item) => item.ownStatus === 'watched').length,
    rated: ratings.length,
    avgRating: average(ratings),
    reviews: reviewCount(reviews, userId),
  }
}

/**
 * Partner-oriented aggregation: same numbers, but read from the `partner*`
 * fields of the viewer's catalog so each household member gets their own.
 */
function computePartnerStats(
  items: CatalogItem[],
  reviews: ReviewRow[],
  userId: string,
  displayName: string,
): UserStats {
  const ratings = items
    .map((item) => item.partnerRating)
    .filter((rating): rating is number => rating != null)
  return {
    userId,
    displayName,
    watched: items.filter((item) => item.partnerStatus === 'watched').length,
    rated: ratings.length,
    avgRating: average(ratings),
    reviews: reviewCount(reviews, userId),
  }
}

export function computeRatingDistribution(
  items: CatalogItem[],
): Array<{ value: number; count: number }> {
  const buckets = new Map<number, number>()
  for (const item of items) {
    if (item.ownRating != null) {
      buckets.set(item.ownRating, (buckets.get(item.ownRating) ?? 0) + 1)
    }
  }
  const values = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
  return values
    .filter((value) => buckets.has(value))
    .map((value) => ({ value, count: buckets.get(value) ?? 0 }))
}

export function computeTopGenres(
  items: CatalogItem[],
  limit = 5,
): Array<{ genre: string; count: number }> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const seenByAnyone =
      item.ownStatus === 'watched' || item.partnerStatus === 'watched'
    if (!seenByAnyone) continue
    for (const genre of item.title.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, limit)
}

/**
 * Canonical shared status for a single title. Each household title maps to
 * exactly one bucket — watched wins over watching over watchlist — so the
 * distribution never double-counts a title only because both members hold
 * different states for it.
 */
export type HouseholdStatus = 'watchlist' | 'watching' | 'watched' | 'none'

export function householdStatusOf(item: CatalogItem): HouseholdStatus {
  if (item.ownStatus === 'watched' || item.partnerStatus === 'watched')
    return 'watched'
  if (item.ownStatus === 'watching' || item.partnerStatus === 'watching')
    return 'watching'
  if (item.ownStatus === 'watchlist' || item.partnerStatus === 'watchlist')
    return 'watchlist'
  return 'none'
}

export interface HouseholdStatusCounts {
  watchlist: number
  watching: number
  watched: number
  none: number
}

export function countByHouseholdStatus(
  items: CatalogItem[],
): HouseholdStatusCounts {
  const counts: HouseholdStatusCounts = {
    watchlist: 0,
    watching: 0,
    watched: 0,
    none: 0,
  }
  for (const item of items) counts[householdStatusOf(item)] += 1
  return counts
}

export interface MediaTypeCounts {
  movies: number
  series: number
}

/** Counts each title once by its own media type. */
export function countByMediaType(items: CatalogItem[]): MediaTypeCounts {
  let movies = 0
  let series = 0
  for (const item of items) {
    if (item.title.media_type === 'movie') movies += 1
    else series += 1
  }
  return { movies, series }
}

export interface CatalogProgress {
  total: number
  /** Titles watched by at least one member (canonical status). */
  watched: number
  watching: number
  watchlist: number
  /** Titles with any canonical status (added to the shared workflow). */
  active: number
  watchedByBoth: number
}

export function computeCatalogProgress(items: CatalogItem[]): CatalogProgress {
  const status = countByHouseholdStatus(items)
  return {
    total: items.length,
    watched: status.watched,
    watching: status.watching,
    watchlist: status.watchlist,
    active: items.length - status.none,
    watchedByBoth: items.filter(watchedByBoth).length,
  }
}

export interface MonthlyWatched {
  /** UTC month key, e.g. `2026-09`, for stable ordering. */
  key: string
  /** Spanish short label, e.g. `sep 2026`. */
  label: string
  count: number
}

const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const

export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Maximum amount of months kept so an old spike cannot flood the chart. */
const MAX_ACTIVITY_MONTHS = 24

/**
 * Household viewing activity: every `watched_at` (own or partner, filled by a
 * DB trigger) becomes one event bucketed by UTC month. Months between the
 * first event and `now` are zero-filled so the axis stays honest.
 */
export function watchedActivityByMonth(
  items: CatalogItem[],
  now = new Date(),
): MonthlyWatched[] {
  const counts = new Map<string, number>()
  let minKey: string | null = null
  for (const item of items) {
    for (const iso of [item.ownWatchedAt, item.partnerWatchedAt]) {
      if (!iso) continue
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) continue
      const key = monthKeyOf(date)
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (!minKey || key < minKey) minKey = key
    }
  }
  if (minKey === null) return []

  const currentKey = monthKeyOf(now)
  const [startYear, startMonth] = minKey.split('-').map(Number)
  let cursor = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const earliestAllowed = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - (MAX_ACTIVITY_MONTHS - 1),
      1,
    ),
  )
  if (cursor < earliestAllowed) cursor = earliestAllowed

  const months: MonthlyWatched[] = []
  while (monthKeyOf(cursor) <= currentKey) {
    const key = monthKeyOf(cursor)
    months.push({
      key,
      label: `${MONTH_LABELS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      count: counts.get(key) ?? 0,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}

/**
 * All household statistics in one pass. Everything is derived in memory from
 * the catalog, the household reviews and the member profiles; no stats tables.
 * `viewerId` decides which member reads the `own*` fields (the signed-in user)
 * and which reads the `partner*` fields.
 */
export function computeStats(
  items: CatalogItem[],
  reviews: ReviewRow[],
  members: Array<{ id: string; displayName: string }>,
  viewerId: string,
): TitleStats {
  const catalog = computeCatalogStats(items)
  const seenByAnyone = items.filter(
    (item) => item.ownStatus === 'watched' || item.partnerStatus === 'watched',
  )
  return {
    catalog,
    users: members.map((member) =>
      member.id === viewerId
        ? computeUserStats(items, reviews, member.id, member.displayName)
        : computePartnerStats(items, reviews, member.id, member.displayName),
    ),
    ratingDistribution: computeRatingDistribution(items),
    topGenres: computeTopGenres(items),
    moviesWatched: seenByAnyone.filter(
      (item) => item.title.media_type === 'movie',
    ).length,
    seriesWatched: seenByAnyone.filter((item) => item.title.media_type === 'tv')
      .length,
    householdStatus: countByHouseholdStatus(items),
    mediaTypes: countByMediaType(items),
    progress: computeCatalogProgress(items),
    watchedActivity: watchedActivityByMonth(items),
  }
}
