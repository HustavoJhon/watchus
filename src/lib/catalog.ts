import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { TitleCandidate } from '@/lib/tmdb/mapper'

export type TitleRow = Database['public']['Tables']['titles']['Row']
export type TitleStateRow =
  Database['public']['Tables']['user_title_state']['Row']
export type WatchStatus = Database['public']['Enums']['watch_status']

/** Catalog entry joined with the viewer's and their partner's state. */
export interface CatalogItem {
  title: TitleRow
  ownStatus: WatchStatus | null
  ownWatchedAt: string | null
  ownRating: number | null
  ownFavorite: boolean
  partnerStatus: WatchStatus | null
  partnerWatchedAt: string | null
  partnerRating: number | null
  ownUpdatedAt: string | null
  partnerUpdatedAt: string | null
}

interface JoinedStateRow {
  user_id: string
  watch_status: WatchStatus | null
  watched_at: string | null
  rating: number | null
  is_favorite: boolean
  updated_at: string | null
  title: TitleRow
}

/**
 * Derives "watched by both" in memory: groups the household's state rows by
 * title and splits them between the viewer and their partner.
 */
export function buildCatalog(
  rows: JoinedStateRow[],
  userId: string,
): CatalogItem[] {
  const ownByTmdb = new Map<number, JoinedStateRow>()
  const partnerByTmdb = new Map<number, JoinedStateRow>()
  for (const row of rows) {
    const bucket = row.user_id === userId ? ownByTmdb : partnerByTmdb
    if (!bucket.has(row.title.tmdb_id)) {
      bucket.set(row.title.tmdb_id, row)
    }
  }
  const seen = new Set<number>()
  const items: CatalogItem[] = []
  for (const row of rows) {
    const tmdbId = row.title.tmdb_id
    if (seen.has(tmdbId)) continue
    seen.add(tmdbId)
    const own = ownByTmdb.get(tmdbId)
    const partner = partnerByTmdb.get(tmdbId)
    items.push({
      title: row.title,
      ownStatus: own?.watch_status ?? null,
      ownWatchedAt: own?.watched_at ?? null,
      ownRating: own?.rating ?? null,
      ownFavorite: own?.is_favorite ?? false,
      partnerStatus: partner?.watch_status ?? null,
      partnerWatchedAt: partner?.watched_at ?? null,
      partnerRating: partner?.rating ?? null,
      ownUpdatedAt: own?.updated_at ?? null,
      partnerUpdatedAt: partner?.updated_at ?? null,
    })
  }
  return items
}

export const watchedByBoth = (item: CatalogItem): boolean =>
  item.ownStatus === 'watched' && item.partnerStatus === 'watched'

/** Fetches the household catalog (RLS filters to viewer + partner rows). */
export function getCatalog() {
  return supabase
    .from('user_title_state')
    .select(
      'user_id, watch_status, watched_at, rating, is_favorite, updated_at, title:titles(*)',
    )
    .order('created_at', { referencedTable: 'titles', ascending: false })
}

/**
 * Adds a title to the shared catalog (race-safe get-or-create) and drops it
 * into the caller's watchlist. Returns the canonical local title row.
 */
export async function addTitleToCatalog(
  candidate: TitleCandidate,
  userId: string,
): Promise<TitleRow> {
  const { data: title, error: rpcError } = await supabase.rpc(
    'get_or_create_title',
    {
      p_tmdb_id: candidate.tmdbId,
      p_media_type: candidate.mediaType,
      p_title: candidate.title,
      p_year: candidate.year as number,
      p_overview: candidate.overview,
      p_poster_path: candidate.posterPath as string,
      p_backdrop_path: candidate.backdropPath as string,
      p_genres: candidate.genres,
    },
  )
  if (rpcError) throw rpcError
  if (!title) throw new Error('TMDB no devolvió un título válido.')

  const { error } = await supabase
    .from('user_title_state')
    .upsert(
      { user_id: userId, title_id: title.id, watch_status: 'watchlist' },
      { onConflict: 'user_id,title_id', ignoreDuplicates: true },
    )
  if (error) throw error
  return title
}

export async function setWatchStatus(
  userId: string,
  titleId: string,
  watchStatus: WatchStatus,
) {
  const { error } = await supabase
    .from('user_title_state')
    .upsert(
      { user_id: userId, title_id: titleId, watch_status: watchStatus },
      { onConflict: 'user_id,title_id' },
    )
  if (error) throw error
}

export async function clearWatchStatus(userId: string, titleId: string) {
  const { error } = await supabase
    .from('user_title_state')
    .upsert(
      { user_id: userId, title_id: titleId, watch_status: null },
      { onConflict: 'user_id,title_id' },
    )
  if (error) throw error
}

export async function setRating(
  userId: string,
  titleId: string,
  rating: number | null,
) {
  const { error } = await supabase
    .from('user_title_state')
    .upsert(
      { user_id: userId, title_id: titleId, rating },
      { onConflict: 'user_id,title_id' },
    )
  if (error) throw error
}

export async function setFavorite(
  userId: string,
  titleId: string,
  isFavorite: boolean,
) {
  const { error } = await supabase
    .from('user_title_state')
    .upsert(
      { user_id: userId, title_id: titleId, is_favorite: isFavorite },
      { onConflict: 'user_id,title_id' },
    )
  if (error) throw error
}
