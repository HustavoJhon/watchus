import { describe, expect, it } from 'vitest'
import { buildCatalog, watchedByBoth } from '@/lib/catalog'
import type { CatalogItem } from '@/lib/catalog'
import type { TitleRow } from '@/lib/catalog'

function title(overrides: Partial<TitleRow> = {}): TitleRow {
  return {
    id: 'title-1',
    tmdb_id: 157336,
    media_type: 'movie',
    title: 'Interstellar',
    year: 2014,
    overview: '',
    poster_path: null,
    backdrop_path: null,
    genres: [],
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function stateRow(
  userId: string,
  t: TitleRow,
  overrides: Partial<{
    watch_status: 'watchlist' | 'watching' | 'watched' | null
    watched_at: string | null
    rating: number | null
    is_favorite: boolean
    updated_at: string | null
  }> = {},
) {
  return {
    user_id: userId,
    watch_status: overrides.watch_status ?? null,
    watched_at: overrides.watched_at ?? null,
    rating: overrides.rating ?? null,
    is_favorite: overrides.is_favorite ?? false,
    updated_at: overrides.updated_at ?? null,
    title: t,
  }
}

describe('buildCatalog', () => {
  it('groups own and partner rows per title', () => {
    const t = title()
    const rows = [
      stateRow('me', t, { watch_status: 'watching' }),
      stateRow('partner', t, { watch_status: 'watched', rating: 4.5 }),
    ]

    const [item] = buildCatalog(rows, 'me')

    expect(item.title.title).toBe('Interstellar')
    expect(item.ownStatus).toBe('watching')
    expect(item.partnerStatus).toBe('watched')
    expect(item.ownRating).toBeNull()
    expect(item.partnerWatchedAt).toBeNull()
  })

  it('returns one item per title even with multiple state rows', () => {
    const t = title()
    const rows = [
      stateRow('me', t, { watch_status: 'watched' }),
      stateRow('partner', t, { watch_status: 'watched' }),
      stateRow('me', title({ id: 'title-2', title: 'Dune', tmdb_id: 399055 })),
    ]

    const items = buildCatalog(rows, 'me')
    expect(items).toHaveLength(2)
  })

  it('keeps own favorite and rating when partner lacks state', () => {
    const t = title()
    const rows = [
      stateRow('me', t, { is_favorite: true, rating: 3.5 }),
      stateRow('partner', t),
    ]
    const [item] = buildCatalog(rows, 'me')
    expect(item.ownFavorite).toBe(true)
    expect(item.ownRating).toBe(3.5)
  })
})

describe('watchedByBoth', () => {
  it('is true only when both members watched the title', () => {
    const base: CatalogItem = {
      title: title(),
      ownStatus: 'watched',
      ownWatchedAt: '2026-01-01',
      ownRating: null,
      ownFavorite: false,
      partnerStatus: 'watched',
      partnerWatchedAt: '2026-01-02',
      partnerRating: null,
      ownUpdatedAt: null,
      partnerUpdatedAt: null,
      watchlistPosition: null,
    }
    expect(watchedByBoth(base)).toBe(true)
    expect(watchedByBoth({ ...base, partnerStatus: 'watchlist' })).toBe(false)
    expect(watchedByBoth({ ...base, ownStatus: 'watching' })).toBe(false)
  })
})
