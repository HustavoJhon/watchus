import { tmdbGet } from './client'
import { parseYear } from './mapper'
import type {
  TmdbDetailResponse,
  TmdbMediaType,
  TmdbSeasonDetailResponse,
} from './types'

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
  /** TV only: seasons available for this series (including specials, 0). */
  seasons: SeasonSummary[]
}

export interface SeasonSummary {
  /** TMDB season id. */
  id: number
  name: string
  seasonNumber: number
  episodeCount: number
  airDate: string | null
  posterPath: string | null
}

export interface EpisodeSummary {
  /** TMDB episode id, stable across API calls. */
  id: number
  name: string
  overview: string
  seasonNumber: number
  episodeNumber: number
  airDate: string | null
  stillPath: string | null
  runtimeMinutes: number | null
}

export interface SeasonEpisodes {
  name: string
  seasonNumber: number
  episodes: EpisodeSummary[]
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
    seasons: (detail.seasons ?? [])
      .filter((season) => (season.season_number ?? 0) >= 0)
      .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0))
      .map((season) => ({
        id: season.id,
        name: season.name?.trim() || `Temporada ${season.season_number ?? '?'}`,
        seasonNumber: season.season_number ?? 0,
        episodeCount: season.episode_count ?? 0,
        airDate: season.air_date ?? null,
        posterPath: season.poster_path ?? null,
      })),
  }
}

/**
 * Fetches one season's episodes on demand, straight from TMDB. The detail page
 * only requests the season the viewer is looking at, so a long series never
 * downloads every episode up front.
 */
export async function fetchSeasonEpisodes(
  tmdbId: number,
  seasonNumber: number,
): Promise<SeasonEpisodes> {
  const season = await tmdbGet<TmdbSeasonDetailResponse>(
    `/tv/${tmdbId}/season/${seasonNumber}`,
  )

  return {
    name: season.name?.trim() || `Temporada ${seasonNumber}`,
    seasonNumber: season.season_number ?? seasonNumber,
    episodes: (season.episodes ?? [])
      .map((episode) => ({
        id: episode.id,
        name: episode.name?.trim() || 'Episodio sin título',
        overview: episode.overview ?? '',
        seasonNumber: episode.season_number ?? seasonNumber,
        episodeNumber: episode.episode_number ?? 0,
        airDate: episode.air_date ?? null,
        stillPath: episode.still_path ?? null,
        runtimeMinutes: episode.runtime ?? null,
      }))
      .sort((a, b) => a.episodeNumber - b.episodeNumber),
  }
}

export function trailerEmbedUrl(trailerKey: string): string {
  return `https://www.youtube-nocookie.com/embed/${trailerKey}`
}
