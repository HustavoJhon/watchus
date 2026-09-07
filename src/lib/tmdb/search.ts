import { tmdbGet } from './client'
import { fetchGenreNames } from './genres'
import {
  mapMovieToCandidate,
  mapMultiToCandidate,
  mapTvToCandidate,
} from './mapper'
import type { TitleCandidate } from './mapper'
import type { TmdbSearchPageResponse } from './types'

export type SearchMediaType = 'movie' | 'tv' | 'all'

export interface TitleSearchResult {
  candidates: TitleCandidate[]
  page: number
  totalPages: number
}

const searchEndpoint: Record<SearchMediaType, string> = {
  movie: '/search/movie',
  tv: '/search/tv',
  all: '/search/multi',
}

function mapResults(
  rawResults: TmdbSearchPageResponse['results'],
  mediaType: SearchMediaType,
  genres: ReadonlyMap<number, string>,
): TitleCandidate[] {
  return rawResults.flatMap((result) => {
    if (mediaType === 'movie') {
      return [mapMovieToCandidate(result, genres)]
    }
    if (mediaType === 'tv') {
      return [mapTvToCandidate(result, genres)]
    }
    const candidate = mapMultiToCandidate(result, genres)
    return candidate ? [candidate] : []
  })
}

/**
 * Searches TMDB for a query. Results are normalized into `TitleCandidate`s
 * with Spanish genre names resolved from the cached genre lists.
 */
export async function searchTitles(
  query: string,
  options: { page?: number; mediaType?: SearchMediaType } = {},
): Promise<TitleSearchResult> {
  const trimmed = query.trim()
  if (!trimmed) {
    return { candidates: [], page: 1, totalPages: 0 }
  }

  const mediaType = options.mediaType ?? 'all'
  const [genres, page] = await Promise.all([
    fetchGenreNames(),
    tmdbGet<TmdbSearchPageResponse>(searchEndpoint[mediaType], {
      query: trimmed,
      page: options.page ?? 1,
      include_adult: 'false',
    }),
  ])

  return {
    candidates: mapResults(page.results ?? [], mediaType, genres),
    page: page.page,
    totalPages: page.total_pages,
  }
}
