import type { TmdbMediaType, TmdbMovieResult } from './types'

/** Normalized title ready to be persisted via get_or_create_title. */
export interface TitleCandidate {
  tmdbId: number
  mediaType: TmdbMediaType
  title: string
  year: number | null
  overview: string
  posterPath: string | null
  backdropPath: string | null
  genres: string[]
}

const MIN_YEAR = 1850
const MAX_YEAR = 2100

/** "2014-11-05" -> 2014; anything outside the DB range -> null. */
export function parseYear(date: string | null | undefined): number | null {
  if (!date) return null
  const year = Number.parseInt(date.slice(0, 4), 10)
  if (Number.isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) return null
  return year
}

/** Resolves numeric TMDB genre ids to their names using a genre map. */
export function resolveGenres(
  ids: number[] | undefined,
  genres: ReadonlyMap<number, string>,
): string[] {
  if (!ids) return []
  return ids.flatMap((id) => {
    const name = genres.get(id)
    return name ? [name] : []
  })
}

/** Shape shared by /search results: title vs name, date field differs. */
function mapResult(
  raw: TmdbMovieResult,
  mediaType: TmdbMediaType,
  genres: ReadonlyMap<number, string>,
  title: string,
  date: string | undefined,
): TitleCandidate {
  const year = parseYear(date)
  return {
    tmdbId: raw.id,
    mediaType,
    title,
    year,
    overview: raw.overview ?? '',
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    genres: resolveGenres(raw.genre_ids, genres),
  }
}

export function mapMovieToCandidate(
  raw: TmdbMovieResult,
  genres: ReadonlyMap<number, string>,
): TitleCandidate {
  return mapResult(
    raw,
    'movie',
    genres,
    raw.title ?? raw.name ?? '',
    raw.release_date,
  )
}

export function mapTvToCandidate(
  raw: TmdbMovieResult,
  genres: ReadonlyMap<number, string>,
): TitleCandidate {
  return mapResult(
    raw,
    'tv',
    genres,
    raw.name ?? raw.title ?? '',
    raw.first_air_date,
  )
}

/**
 * Maps a /search/multi entry. `media_type` decides movie vs tv; entries the
 * API types as anything else (e.g. person) are skipped.
 */
export function mapMultiToCandidate(
  raw: TmdbMovieResult,
  genres: ReadonlyMap<number, string>,
): TitleCandidate | null {
  if (raw.media_type === 'movie') {
    return mapMovieToCandidate(raw, genres)
  }
  if (raw.media_type === 'tv') {
    return mapTvToCandidate(raw, genres)
  }
  return null
}
