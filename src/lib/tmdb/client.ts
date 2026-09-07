import { TMDB_BASE_URL, TMDB_LANGUAGE, TMDB_TIMEOUT_MS } from './config'
import type { TmdbErrorKind } from './errors'
import { TmdbError, tmdbErrorForStatus } from './errors'

/**
 * Low-level TMDB v3 client: thin wrapper over `fetch` that attaches the API
 * key, the language and JSON parsing. Throws `TmdbError` on any failure.
 * Requests are aborted after `TMDB_TIMEOUT_MS` so a hung connection surfaces
 * as a controlled error instead of an infinite spinner.
 */
export async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const apiKey = import.meta.env.VITE_TMDB_API_KEY as string | undefined
  if (!apiKey) {
    throw new TmdbError('missing-key')
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', TMDB_LANGUAGE)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url.toString(), { signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TmdbError(
        'network',
        'TMDB tardó demasiado en responder. Inténtalo de nuevo.',
      )
    }
    throw new TmdbError('network')
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw tmdbErrorForStatus(response.status)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new TmdbError('invalid-response')
  }
}

export { TmdbError }
export type { TmdbErrorKind }
