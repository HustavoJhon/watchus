export type TmdbErrorKind =
  | 'missing-key'
  | 'network'
  | 'invalid-response'
  | 'unauthorized'
  | 'not-found'
  | 'rate-limited'
  | 'server'
  | 'http'

const kindMessages: Record<TmdbErrorKind, string> = {
  'missing-key':
    'Falta la clave de API de TMDB. Configura VITE_TMDB_API_KEY en tu .env.local.',
  network:
    'No se pudo contactar con TMDB. Revisa tu conexión a internet e inténtalo de nuevo.',
  'invalid-response':
    'TMDB devolvió una respuesta inesperada. Inténtalo de nuevo.',
  unauthorized:
    'La clave de API de TMDB no es válida. Revisa VITE_TMDB_API_KEY.',
  'not-found': 'No se encontró el título solicitado en TMDB.',
  'rate-limited':
    'TMDB alcanzó el límite de peticiones. Espera un momento e inténtalo de nuevo.',
  server: 'TMDB está teniendo problemas. Inténtalo más tarde.',
  http: 'TMDB devolvió un error inesperado.',
}

/**
 * Error raised by the TMDB layer. `kind` lets the UI choose a friendly
 * message while `message` stays developer-facing.
 */
export class TmdbError extends Error {
  readonly kind: TmdbErrorKind

  constructor(kind: TmdbErrorKind, message?: string) {
    super(message ?? kindMessages[kind])
    this.name = 'TmdbError'
    this.kind = kind
  }
}

/** Maps an HTTP status to the closest TMDB-specific error kind. */
export function tmdbErrorForStatus(status: number): TmdbError {
  if (status === 401) {
    return new TmdbError('unauthorized')
  }
  if (status === 404) {
    return new TmdbError('not-found')
  }
  if (status === 429) {
    return new TmdbError('rate-limited')
  }
  if (status >= 500) {
    return new TmdbError('server')
  }
  return new TmdbError('http', `TMDB respondió con estado ${status}.`)
}

/** Human-readable message the UI can render (already in Spanish). */
export function tmdbUserMessage(error: unknown): string {
  if (error instanceof TmdbError) {
    return error.message
  }
  const message = (error as { message?: string } | undefined)?.message
  return message ?? 'No se pudo completar la búsqueda.'
}
