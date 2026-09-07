export const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'
export const TMDB_LANGUAGE = 'es-ES'

/**
 * Returns the TMDB API key from the environment. The key is only ever used in
 * the browser as a query parameter (TMDB v3 convention); never write it to
 * storage, logs or the database.
 */
export function getTmdbApiKey(): string | undefined {
  return import.meta.env.VITE_TMDB_API_KEY as string | undefined
}

export function posterUrl(
  path: string | null | undefined,
  width = 500,
): string | null {
  if (!path) return null
  return `${TMDB_IMAGE_BASE_URL}/w${width}${path}`
}

export function backdropUrl(
  path: string | null | undefined,
  width = 1280,
): string | null {
  if (!path) return null
  return `${TMDB_IMAGE_BASE_URL}/w${width}${path}`
}
