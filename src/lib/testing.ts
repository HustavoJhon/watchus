import type { CatalogItem, TitleRow } from '@/lib/catalog'
import type { ReviewRow } from '@/lib/reviews'

let seq = 0

/** Minimal deterministic title for unit tests. */
export function makeTitle(overrides: Partial<TitleRow> = {}): TitleRow {
  seq += 1
  return {
    id: `title-${seq}`,
    tmdb_id: 1000 + seq,
    media_type: 'movie',
    title: `Title ${seq}`,
    year: 2020,
    overview: '',
    poster_path: null,
    backdrop_path: null,
    genres: [],
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Minimal catalog item for unit tests (own/partner state both null). */
export function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  const base: CatalogItem = {
    title: makeTitle(),
    ownStatus: null,
    ownWatchedAt: null,
    ownRating: null,
    ownFavorite: false,
    partnerStatus: null,
    partnerWatchedAt: null,
    partnerRating: null,
    ownUpdatedAt: null,
    partnerUpdatedAt: null,
  }
  return { ...base, ...overrides }
}

export function makeReview(
  userId: string,
  titleId: string,
  overrides: Partial<ReviewRow> = {},
): ReviewRow {
  return {
    user_id: userId,
    title_id: titleId,
    content: 'Me gustó mucho.',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
