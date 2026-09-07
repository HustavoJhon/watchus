import { describe, expect, it } from 'vitest'
import {
  mapMovieToCandidate,
  mapMultiToCandidate,
  mapTvToCandidate,
  parseYear,
  resolveGenres,
} from '@/lib/tmdb/mapper'
import { posterUrl, backdropUrl } from '@/lib/tmdb/config'

describe('parseYear', () => {
  it('extracts the year from a release date', () => {
    expect(parseYear('2014-11-05')).toBe(2014)
  })

  it('handles first_air_date values', () => {
    expect(parseYear('2022-03-04')).toBe(2022)
  })

  it('returns null for empty, garbage or out-of-range values', () => {
    expect(parseYear(undefined)).toBeNull()
    expect(parseYear('')).toBeNull()
    expect(parseYear('nope')).toBeNull()
    expect(parseYear('1700')).toBeNull()
    expect(parseYear('2101-01-01')).toBeNull()
  })
})

describe('resolveGenres', () => {
  const genres = new Map([
    [28, 'Acción'],
    [18, 'Drama'],
    [10765, 'Ciencia ficción'],
  ])

  it('maps numeric ids to names', () => {
    expect(resolveGenres([28, 18], genres)).toEqual(['Acción', 'Drama'])
  })

  it('skips unknown ids and missing input', () => {
    expect(resolveGenres([28, 999], genres)).toEqual(['Acción'])
    expect(resolveGenres(undefined, genres)).toEqual([])
  })
})

describe('mapMovieToCandidate', () => {
  const genres = new Map<number, string>([[18, 'Drama']])

  it('normalizes a movie result', () => {
    const candidate = mapMovieToCandidate(
      {
        id: 157336,
        title: 'Interstellar',
        overview: 'Una misión interestelar.',
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        genre_ids: [18],
        release_date: '2014-11-05',
      },
      genres,
    )
    expect(candidate).toEqual({
      tmdbId: 157336,
      mediaType: 'movie',
      title: 'Interstellar',
      year: 2014,
      overview: 'Una misión interestelar.',
      posterPath: '/poster.jpg',
      backdropPath: '/backdrop.jpg',
      genres: ['Drama'],
    })
  })

  it('falls back to empty strings and nulls for missing fields', () => {
    const candidate = mapMovieToCandidate({ id: 1, name: 'Sin título' }, genres)
    expect(candidate.overview).toBe('')
    expect(candidate.posterPath).toBeNull()
    expect(candidate.year).toBeNull()
  })
})

describe('mapTvToCandidate', () => {
  it('uses name and first_air_date', () => {
    const candidate = mapTvToCandidate(
      {
        id: 1396,
        name: 'Breaking Bad',
        media_type: 'tv',
        first_air_date: '2008-01-20',
        genre_ids: [18],
      },
      new Map(),
    )
    expect(candidate.mediaType).toBe('tv')
    expect(candidate.title).toBe('Breaking Bad')
    expect(candidate.year).toBe(2008)
  })
})

describe('mapMultiToCandidate', () => {
  it('maps movies and tv, skipping people', () => {
    const genres = new Map<number, string>()
    const movie = mapMultiToCandidate(
      {
        id: 1,
        media_type: 'movie',
        title: 'Película',
        release_date: '2020-01-01',
      },
      genres,
    )
    const tv = mapMultiToCandidate(
      { id: 2, media_type: 'tv', name: 'Serie', first_air_date: '2021-01-01' },
      genres,
    )
    const person = mapMultiToCandidate(
      { id: 3, media_type: 'person', name: 'Alguien' },
      genres,
    )

    expect(movie?.mediaType).toBe('movie')
    expect(tv?.mediaType).toBe('tv')
    expect(person).toBeNull()
  })
})

describe('image urls', () => {
  it('builds poster and backdrop urls, handling nulls', () => {
    expect(posterUrl('/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/abc.jpg',
    )
    expect(posterUrl(null)).toBeNull()
    expect(backdropUrl('/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/abc.jpg',
    )
  })
})
