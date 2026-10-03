import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  countLabelOf,
  filterCatalog,
  hasActiveFilters,
  matchesCatalogQuery,
  matchesCatalogFilters,
  scopeFilterApplies,
} from '@/lib/catalog-filter'
import type { CatalogFilters } from '@/lib/catalog-filter'
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

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    title: title(),
    ownStatus: null,
    ownWatchedAt: null,
    ownRating: null,
    ownFavorite: false,
    partnerStatus: null,
    partnerWatchedAt: null,
    partnerRating: null,
    ownUpdatedAt: null,
    partnerUpdatedAt: null,
    ownScope: null,
    partnerScope: null,
    sharedPosition: null,
    personalPosition: null,
    ...overrides,
  }
}

const fixture: CatalogItem[] = [
  item({
    title: title({
      id: 'm1',
      title: 'Interstellar',
      media_type: 'movie',
      tmdb_id: 157336,
    }),
    ownStatus: 'watched',
    ownFavorite: true,
  }),
  item({
    title: title({
      id: 'm2',
      title: 'Dune',
      media_type: 'movie',
      tmdb_id: 399055,
    }),
    ownStatus: 'watchlist',
    ownScope: 'shared',
  }),
  item({
    title: title({ id: 't1', title: 'Dark', media_type: 'tv', tmdb_id: 70523 }),
    ownStatus: 'watching',
    ownFavorite: true,
  }),
  item({
    title: title({
      id: 't2',
      title: 'Stranger Things',
      media_type: 'tv',
      tmdb_id: 66732,
    }),
    ownStatus: 'watched',
  }),
]

/**
 * Separate fixture for the scope filter, so the counts asserted by the other
 * suites stay stable.
 */
const scopeFixture: CatalogItem[] = [
  item({
    title: title({
      id: 's1',
      title: 'Común',
      media_type: 'movie',
      tmdb_id: 710,
    }),
    ownStatus: 'watchlist',
    ownScope: 'shared',
  }),
  item({
    title: title({ id: 's2', title: 'Mío', media_type: 'movie', tmdb_id: 711 }),
    ownStatus: 'watchlist',
    ownScope: 'personal',
  }),
  // Only the partner holds it pending, and as personal: neither queue.
  item({
    title: title({
      id: 's3',
      title: 'Secreto',
      media_type: 'movie',
      tmdb_id: 712,
    }),
    ownStatus: null,
    partnerStatus: 'watchlist',
    partnerScope: 'personal',
  }),
  // Only the partner holds it pending, as shared: household queue.
  item({
    title: title({
      id: 's4',
      title: 'Puesto',
      media_type: 'movie',
      tmdb_id: 713,
    }),
    ownStatus: null,
    partnerStatus: 'watchlist',
    partnerScope: 'shared',
  }),
]

const allFilters: CatalogFilters = {
  ...DEFAULT_FILTERS,
  query: '',
}

describe('matchesCatalogFilters', () => {
  it('keeps everything with no filters', () => {
    expect(
      fixture.filter((i) => matchesCatalogFilters(i, allFilters)),
    ).toHaveLength(4)
  })

  it('filters by type: movies only', () => {
    const out = filterCatalog(fixture, { ...allFilters, type: 'movie' })
    expect(out.map((i) => i.title.media_type)).toEqual(['movie', 'movie'])
  })

  it('filters by type: series only', () => {
    const out = filterCatalog(fixture, { ...allFilters, type: 'tv' })
    expect(out.map((i) => i.title.media_type)).toEqual(['tv', 'tv'])
  })

  it('filters by status', () => {
    const out = filterCatalog(fixture, { ...allFilters, status: 'watched' })
    expect(out.map((i) => i.ownStatus)).toEqual(['watched', 'watched'])
  })

  it('filters by "sin estado" (ownStatus null)', () => {
    const withNone = [
      ...fixture,
      item({
        title: title({
          id: 'n1',
          title: 'Nuevo sin estado',
          media_type: 'movie',
          tmdb_id: 100,
        }),
      }),
    ]
    const out = filterCatalog(withNone, { ...allFilters, status: 'none' })
    expect(out.map((i) => i.title.title)).toEqual(['Nuevo sin estado'])
  })

  it('combines "sin estado" with a media type', () => {
    const withNone = [
      ...fixture,
      item({
        title: title({
          id: 'n1',
          title: 'Nuevo sin estado',
          media_type: 'movie',
          tmdb_id: 100,
        }),
      }),
      item({
        title: title({
          id: 'n2',
          title: 'Serie sin estado',
          media_type: 'tv',
          tmdb_id: 101,
        }),
      }),
    ]
    const out = filterCatalog(withNone, {
      ...allFilters,
      type: 'movie',
      status: 'none',
    })
    expect(out.map((i) => i.title.title)).toEqual(['Nuevo sin estado'])
  })

  it('filters by favorites', () => {
    const out = filterCatalog(fixture, {
      ...allFilters,
      favorites: 'favorites',
    })
    expect(out.map((i) => i.title.title)).toEqual(['Interstellar', 'Dark'])
  })

  it('combines type + status + favorites', () => {
    const out = filterCatalog(fixture, {
      ...allFilters,
      type: 'movie',
      status: 'watched',
      favorites: 'favorites',
    })
    expect(out.map((i) => i.title.title)).toEqual(['Interstellar'])
  })

  it('combines search query with filters', () => {
    const out = filterCatalog(fixture, {
      ...allFilters,
      type: 'tv',
      query: 'dark',
    })
    expect(out.map((i) => i.title.title)).toEqual(['Dark'])
  })
})

describe('matchesCatalogQuery', () => {
  it('is case-insensitive and trims whitespace', () => {
    expect(matchesCatalogQuery(fixture[0], '  intersTellar ')).toBe(true)
    expect(matchesCatalogQuery(fixture[0], 'dune')).toBe(false)
  })

  it('matches partial titles', () => {
    expect(matchesCatalogQuery(fixture[3], 'things')).toBe(true)
  })

  it('empty query matches everything', () => {
    expect(matchesCatalogQuery(fixture[0], '   ')).toBe(true)
  })
})

describe('hasActiveFilters', () => {
  it('is false for defaults and true when any filter is set', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, type: 'movie' })).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: 'watched' })).toBe(
      true,
    )
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: 'none' })).toBe(true)
    expect(
      hasActiveFilters({ ...DEFAULT_FILTERS, favorites: 'favorites' }),
    ).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: 'd' })).toBe(true)
  })

  it('counts the scope only while filtering by pending', () => {
    expect(
      hasActiveFilters({
        ...DEFAULT_FILTERS,
        status: 'watchlist',
        scope: 'shared',
      }),
    ).toBe(true)
    // The scope is inert outside «Pendientes», so it adds nothing here: the
    // status alone already makes these active.
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, scope: 'shared' })).toBe(
      false,
    )
    expect(
      hasActiveFilters({
        ...DEFAULT_FILTERS,
        status: 'watched',
        scope: 'personal',
      }),
    ).toBe(true)
  })
})

describe('scope filtering', () => {
  const pending: CatalogFilters = { ...allFilters, status: 'watchlist' }

  const ids = (items: CatalogItem[]) => items.map((i) => i.title.id)

  it('falls back to the viewer own pending when the scope is all', () => {
    // Without a queue selected «Pendientes» keeps its legacy meaning: what the
    // viewer has pending, in either queue. s4 is the partner's, s3 is personal
    // to them, so neither belongs here.
    expect(ids(filterCatalog(scopeFixture, pending))).toEqual(['s1', 's2'])
  })

  it('keeps only the household queue for scope shared', () => {
    expect(
      ids(filterCatalog(scopeFixture, { ...pending, scope: 'shared' })),
    ).toEqual(['s1', 's4'])
  })

  it('keeps only the viewer own queue for scope personal', () => {
    expect(
      ids(filterCatalog(scopeFixture, { ...pending, scope: 'personal' })),
    ).toEqual(['s2'])
  })

  it('ignores the scope when the status is not pending', () => {
    const watching: CatalogFilters = {
      ...allFilters,
      status: 'watched',
      scope: 'personal',
    }
    expect(ids(filterCatalog(scopeFixture, watching))).toEqual([])
  })

  it('never leaks a partner personal title into the shared scope', () => {
    const shared = filterCatalog(scopeFixture, { ...pending, scope: 'shared' })
    expect(ids(shared)).not.toContain('s3')
  })
})

describe('scopeFilterApplies', () => {
  it('is true only when pending plus a narrowed scope', () => {
    expect(scopeFilterApplies({ ...allFilters, status: 'watchlist' })).toBe(
      false,
    )
    expect(
      scopeFilterApplies({
        ...allFilters,
        status: 'watchlist',
        scope: 'shared',
      }),
    ).toBe(true)
    expect(
      scopeFilterApplies({
        ...allFilters,
        status: 'watchlist',
        scope: 'personal',
      }),
    ).toBe(true)
    expect(scopeFilterApplies({ ...allFilters, scope: 'shared' })).toBe(false)
  })
})

describe('countLabelOf', () => {
  it('says 0 títulos when empty', () => {
    expect(countLabelOf([], allFilters)).toBe('0 títulos')
  })

  it('labels all movies as peliculas', () => {
    expect(
      countLabelOf(filterCatalog(fixture, { ...allFilters, type: 'movie' }), {
        ...allFilters,
        type: 'movie',
      }),
    ).toBe('2 películas')
  })

  it('labels all series as series', () => {
    expect(
      countLabelOf(filterCatalog(fixture, { ...allFilters, type: 'tv' }), {
        ...allFilters,
        type: 'tv',
      }),
    ).toBe('2 series')
  })

  it('labels default view as títulos', () => {
    expect(countLabelOf(fixture, allFilters)).toBe('4 títulos')
  })

  it('labels watched movies with feminine plural', () => {
    expect(
      countLabelOf(
        filterCatalog(fixture, {
          ...allFilters,
          type: 'movie',
          status: 'watched',
        }),
        {
          ...allFilters,
          type: 'movie',
          status: 'watched',
        },
      ),
    ).toBe('1 película vista')
  })

  it('labels watched series', () => {
    expect(
      countLabelOf(
        filterCatalog(fixture, {
          ...allFilters,
          type: 'tv',
          status: 'watched',
        }),
        {
          ...allFilters,
          type: 'tv',
          status: 'watched',
        },
      ),
    ).toBe('1 serie vista')
  })

  it('labels favorited movies', () => {
    expect(
      countLabelOf(
        filterCatalog(fixture, {
          ...allFilters,
          type: 'movie',
          favorites: 'favorites',
        }),
        {
          ...allFilters,
          type: 'movie',
          favorites: 'favorites',
        },
      ),
    ).toBe('1 película favorita')
  })

  it('labels mixed default favorites in masculine', () => {
    expect(
      countLabelOf(
        filterCatalog(fixture, { ...allFilters, favorites: 'favorites' }),
        {
          ...allFilters,
          favorites: 'favorites',
        },
      ),
    ).toBe('2 títulos favoritos')
  })

  it('labels pending movies', () => {
    expect(
      countLabelOf(
        filterCatalog(fixture, {
          ...allFilters,
          type: 'movie',
          status: 'watchlist',
        }),
        {
          ...allFilters,
          type: 'movie',
          status: 'watchlist',
        },
      ),
    ).toBe('1 película pendiente')
  })

  it('names the queue in the label', () => {
    expect(
      countLabelOf(
        filterCatalog(scopeFixture, {
          ...allFilters,
          status: 'watchlist',
          scope: 'shared',
        }),
        {
          ...allFilters,
          status: 'watchlist',
          scope: 'shared',
        },
      ),
    ).toBe('2 títulos pendientes del hogar')
    expect(
      countLabelOf(
        filterCatalog(scopeFixture, {
          ...allFilters,
          status: 'watchlist',
          scope: 'personal',
        }),
        { ...allFilters, status: 'watchlist', scope: 'personal' },
      ),
    ).toBe('1 título pendiente solo para mí')
  })

  it('labels watching series', () => {
    expect(
      countLabelOf(
        filterCatalog(fixture, {
          ...allFilters,
          type: 'tv',
          status: 'watching',
        }),
        {
          ...allFilters,
          type: 'tv',
          status: 'watching',
        },
      ),
    ).toBe('1 serie en curso')
  })

  it('labels titles without state', () => {
    const withNone = [
      item({
        title: title({
          id: 'n1',
          title: 'Nuevo sin estado',
          media_type: 'movie',
          tmdb_id: 100,
        }),
      }),
    ]
    expect(
      countLabelOf(
        filterCatalog(withNone, {
          ...allFilters,
          type: 'movie',
          status: 'none',
        }),
        { ...allFilters, type: 'movie', status: 'none' },
      ),
    ).toBe('1 película sin estado')
  })
})
