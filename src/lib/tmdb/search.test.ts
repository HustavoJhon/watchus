import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetGenreNamesCache } from '@/lib/tmdb/genres'
import { searchTitles } from '@/lib/tmdb/search'

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response
}

const genreLists = {
  movie: { genres: [{ id: 28, name: 'Acción' }] },
  tv: { genres: [{ id: 18, name: 'Drama' }] },
}

function stubFetch(pages: Record<string, unknown>) {
  const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
    const pathname = new URL(input).pathname
    const body = pages[pathname]
    if (!body) {
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response)
    }
    return Promise.resolve(jsonResponse(body))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetGenreNamesCache()
})

describe('searchTitles', () => {
  it('returns an empty result without calling fetch for blank queries', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchTitles('   ')).resolves.toEqual({
      candidates: [],
      page: 1,
      totalPages: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('searches all types and resolves genre names from the cached lists', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    stubFetch({
      '/3/genre/movie/list': genreLists.movie,
      '/3/genre/tv/list': genreLists.tv,
      '/3/search/multi': {
        page: 1,
        total_pages: 1,
        results: [
          {
            id: 1,
            media_type: 'movie',
            title: 'Acción Total',
            release_date: '2019-05-05',
            overview: 'boom',
            genre_ids: [28],
          },
          {
            id: 2,
            media_type: 'tv',
            name: 'Dramón',
            first_air_date: '2010-09-12',
            genre_ids: [18],
          },
          { id: 3, media_type: 'person', name: 'Alguien' },
        ],
      },
    })

    const result = await searchTitles('accion total')

    expect(result.totalPages).toBe(1)
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].mediaType).toBe('movie')
    expect(result.candidates[0].genres).toEqual(['Acción'])
    expect(result.candidates[1].mediaType).toBe('tv')
    expect(result.candidates[1].genres).toEqual(['Drama'])
  })

  it('loads genre lists only once across calls', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    const fetchMock = stubFetch({
      '/3/genre/movie/list': genreLists.movie,
      '/3/genre/tv/list': genreLists.tv,
      '/3/search/movie': {
        page: 1,
        total_pages: 1,
        results: [{ id: 9, title: 'Foo', genre_ids: [28] }],
      },
      '/3/search/tv': {
        page: 1,
        total_pages: 1,
        results: [{ id: 10, name: 'Bar', genre_ids: [18] }],
      },
    })

    await searchTitles('foo', { mediaType: 'movie' })
    await searchTitles('bar', { mediaType: 'tv' })

    const takesUrls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(
      takesUrls.filter((url) => url.includes('/genre/movie/list')),
    ).toHaveLength(1)
    expect(
      takesUrls.filter((url) => url.includes('/genre/tv/list')),
    ).toHaveLength(1)
  })

  it('uses the type-specific endpoint and forwards the page', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    const fetchMock = stubFetch({
      '/3/genre/movie/list': genreLists.movie,
      '/3/genre/tv/list': genreLists.tv,
      '/3/search/tv': {
        page: 3,
        total_pages: 9,
        results: [{ id: 7, name: 'Twin Peaks' }],
      },
    })

    const result = await searchTitles('twin peaks', {
      mediaType: 'tv',
      page: 3,
    })

    expect(result.page).toBe(3)
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/3/search/tv'))).toBe(true)
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input))
        return (
          url.pathname.endsWith('/search/tv') &&
          url.searchParams.get('page') === '3'
        )
      }),
    ).toBe(true)
  })

  it('propagates TMDB errors as TmdbError', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = new URL(input)
      if (url.pathname === '/3/genre/movie/list') {
        return Promise.resolve(jsonResponse(genreLists.movie))
      }
      if (url.pathname === '/3/genre/tv/list') {
        return Promise.resolve(jsonResponse(genreLists.tv))
      }
      return Promise.resolve({ ok: false, status: 429 } as unknown as Response)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchTitles('x')).rejects.toMatchObject({
      kind: 'rate-limited',
    })
  })
})
