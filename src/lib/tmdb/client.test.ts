import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmdbGet, TmdbError } from '@/lib/tmdb/client'

function stubFetch(response: Partial<Response>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('tmdbGet', () => {
  it('throws a missing-key error when no API key is set', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', '')
    await expect(tmdbGet('/search/movie')).rejects.toMatchObject({
      kind: 'missing-key',
    })
  })

  it('requests the URL with api_key, language and extra params', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ page: 1 }),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await tmdbGet('/search/movie', { query: 'dune', page: 2 })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/3/search/movie')
    expect(url.searchParams.get('api_key')).toBe('secret')
    expect(url.searchParams.get('language')).toBe('es-ES')
    expect(url.searchParams.get('query')).toBe('dune')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('parses the json payload on success', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    stubFetch({
      ok: true,
      json: () => Promise.resolve({ results: [1] }),
    } as unknown as Response)

    await expect(tmdbGet<{ results: number[] }>('/x')).resolves.toEqual({
      results: [1],
    })
  })

  it.each([
    [401, 'unauthorized'],
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'server'],
    [418, 'http'],
  ])('maps status %i to kind %s', async (status, kind) => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    stubFetch({ ok: false, status } as unknown as Response)
    await expect(tmdbGet('/x')).rejects.toMatchObject({ kind })
  })

  it('throws a network error when fetch rejects', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(tmdbGet('/x')).rejects.toBeInstanceOf(TmdbError)
    await expect(tmdbGet('/x')).rejects.toMatchObject({ kind: 'network' })
  })

  it('reports a friendly message when the request times out', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    const aborted = new Error('aborted')
    aborted.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted))
    await expect(tmdbGet('/x')).rejects.toMatchObject({
      kind: 'network',
      message: 'TMDB tardó demasiado en responder. Inténtalo de nuevo.',
    })
  })

  it('throws an invalid-response error when json is unparsable', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    stubFetch({
      ok: true,
      json: () => Promise.reject(new Error('bad json')),
    } as unknown as Response)
    await expect(tmdbGet('/x')).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })
})
