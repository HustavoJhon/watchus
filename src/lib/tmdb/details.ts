import { tmdbGet } from './client'
import { parseYear } from './mapper'
import type { TmdbDetailResponse, TmdbMediaType } from './types'

export interface CastMember {
  name: string
  character: string | null
}

export interface TitleDetails {
  /** First aired / premiere year, from the release date. */
  year: number | null
  /** Exact release date if TMDB provides one. */
  releaseDate: string | null
  runtimeMinutes: number | null
  status: string | null
  tagline: string | null
  genres: string[]
  cast: CastMember[]
  director: string | null
  creators: string[]
  trailerKey: string | null
}

function findDirector(detail: TmdbDetailResponse): string | null {
  const director = detail.credits?.crew?.find(
    (member) => member.job === 'Director',
  )
  return director?.name ?? null
}

function findTrailer(detail: TmdbDetailResponse): string | null {
  const trailer = detail.videos?.results?.find(
    (video) => video.site === 'YouTube' && video.type === 'Trailer',
  )
  return trailer?.key ?? null
}

/**
 * Fetches extended details straight from TMDB on demand (used on the title
 * detail page). Nothing here is persisted: the catalog keeps a light copy
 * and this call adds cast, crew, runtime and trailer at view time.
 */
export async function fetchTitleDetails(
  tmdbId: number,
  mediaType: TmdbMediaType,
): Promise<TitleDetails> {
  const detail = await tmdbGet<TmdbDetailResponse>(`/${mediaType}/${tmdbId}`, {
    append_to_response: 'credits,videos',
  })

  const movieDate =
    mediaType === 'movie'
      ? (detail.release_date ?? null)
      : (detail.first_air_date ?? null)

  return {
    year: parseYear(movieDate ?? undefined),
    releaseDate: movieDate,
    runtimeMinutes: mediaType === 'movie' ? (detail.runtime ?? null) : null,
    status: detail.status ?? null,
    tagline: detail.tagline ?? null,
    genres: (detail.genres ?? []).map((genre) => genre.name),
    cast: (detail.credits?.cast ?? [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .slice(0, 10)
      .map((member) => ({
        name: member.name,
        character: member.character ?? null,
      })),
    director: findDirector(detail),
    creators: (detail.created_by ?? []).map((creator) => creator.name ?? ''),
    trailerKey: findTrailer(detail),
  }
}

export function trailerEmbedUrl(trailerKey: string): string {
  return `https://www.youtube-nocookie.com/embed/${trailerKey}`
}
