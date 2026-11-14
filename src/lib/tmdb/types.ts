/**
 * Minimal external TMDB v3 response types. Only the fields WatchUs uses;
 * the API returns far more than these.
 */

export interface TmdbGenre {
  id: number
  name: string
}

export interface TmdbGenreListResponse {
  genres: TmdbGenre[]
}

export type TmdbMediaType = 'movie' | 'tv'

export interface TmdbMovieResult {
  id: number
  /** TMDB tags multi results with 'movie' | 'tv' | 'person' | ... */
  media_type?: string
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genre_ids?: number[]
  release_date?: string
  first_air_date?: string
}

export interface TmdbSearchPageResponse {
  page: number
  total_pages: number
  results: TmdbMovieResult[]
}

export interface TmdbCredit {
  name: string
  job?: string
  known_for_department?: string
  character?: string
  order?: number
}

export interface TmdbCreditsResponse {
  cast?: TmdbCredit[]
  crew?: TmdbCredit[]
}

export interface TmdbVideo {
  key?: string
  site?: string
  type?: string
  name?: string
}

export interface TmdbVideosResponse {
  results?: TmdbVideo[]
}

export interface TmdbSeasonSummary {
  id: number
  name?: string
  season_number?: number
  episode_count?: number
  air_date?: string | null
  poster_path?: string | null
  overview?: string
}

export interface TmdbEpisode {
  id: number
  name?: string
  overview?: string
  episode_number?: number
  season_number?: number
  air_date?: string | null
  still_path?: string | null
  runtime?: number | null
}

export interface TmdbSeasonDetailResponse {
  id?: number
  name?: string
  season_number?: number
  episodes?: TmdbEpisode[]
}

export interface TmdbDetailResponse extends TmdbMovieResult {
  release_date?: string
  first_air_date?: string
  runtime?: number | null
  status?: string
  tagline?: string
  genres?: TmdbGenre[]
  credits?: TmdbCreditsResponse
  videos?: TmdbVideosResponse
  created_by?: Array<{ name?: string; id?: number }>
  seasons?: TmdbSeasonSummary[]
}
