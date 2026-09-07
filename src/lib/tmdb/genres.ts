import { tmdbGet } from './client'
import type { TmdbGenreListResponse } from './types'

/**
 * Fetches TMDB genre names once and caches them for the session. TMDB search
 * results only carry numeric `genre_ids`, so names are resolved against these
 * two lists (movie and tv). Memoized at module level to avoid repeated
 * network calls while the SPA lives.
 */
let genreNamesPromise: Promise<ReadonlyMap<number, string>> | null = null

async function loadGenreNames(): Promise<ReadonlyMap<number, string>> {
  const [movies, tv] = await Promise.all([
    tmdbGet<TmdbGenreListResponse>('/genre/movie/list'),
    tmdbGet<TmdbGenreListResponse>('/genre/tv/list'),
  ])
  const names = new Map<number, string>()
  for (const genre of [...movies.genres, ...tv.genres]) {
    names.set(genre.id, genre.name)
  }
  return names
}

export function fetchGenreNames(): Promise<ReadonlyMap<number, string>> {
  genreNamesPromise ??= loadGenreNames()
  return genreNamesPromise
}

/** Test helper: forget the cached genre lists. */
export function resetGenreNamesCache(): void {
  genreNamesPromise = null
}
