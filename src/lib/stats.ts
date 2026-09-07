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
  }
}
