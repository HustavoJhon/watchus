import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  countLabelOf,
  filterCatalog,
  hasActiveFilters,
  matchesCatalogQuery,
  matchesCatalogFilters,
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
    watchlistPosition: null,
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
    expect(
      hasActiveFilters({ ...DEFAULT_FILTERS, favorites: 'favorites' }),
    ).toBe(true)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: 'd' })).toBe(true)
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
})
