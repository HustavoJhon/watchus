import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { TitleCandidate } from '@/lib/tmdb/mapper'

export type TitleRow = Database['public']['Tables']['titles']['Row']
export type TitleStateRow =
  Database['public']['Tables']['user_title_state']['Row']
export type WatchStatus = Database['public']['Enums']['watch_status']
export type WatchScope = Database['public']['Enums']['watch_scope']
export type WatchlistOrderRow =
  Database['public']['Tables']['household_watchlist_order']['Row']

/** Catalog entry joined with the viewer's and their partner's state. */
export interface CatalogItem {
  title: TitleRow
  ownStatus: WatchStatus | null
  ownWatchedAt: string | null
  ownRating: number | null
  ownFavorite: boolean
  /**
   * Which pending queue this member's row belongs to. Only meaningful while
   * `ownStatus === 'watchlist'`; null when the member has no row, and left as
   * the stored value (default 'shared') otherwise.
   */
  ownScope: WatchScope | null
  partnerStatus: WatchStatus | null
  partnerWatchedAt: string | null
  partnerRating: number | null
  /** Same contract as `ownScope`, for the partner. */
  partnerScope: WatchScope | null
  ownUpdatedAt: string | null
  partnerUpdatedAt: string | null
  /**
   * Position in the shared household queue (1..N), or null when the title is
   * not in it. Assigned by the client after fetching the household order.
   */
  sharedPosition: number | null
  /**
   * Position in the viewer's own personal queue (1..N), or null when absent.
   * Independent from `sharedPosition`: a title can hold a position in both.
   */
  personalPosition: number | null
}

/** Rows of the shared household watchlist order (RLS filters to own household). */
export function getWatchlistOrder() {
  return supabase
    .from('household_watchlist_order')
    .select('household_id, title_id, position')
    .order('position', { ascending: true })
}

/** Rows of the caller's personal watchlist order (RLS filters to own user). */
export function getPersonalWatchlistOrder() {
  return supabase
    .from('personal_watchlist_order')
    .select('user_id, title_id, position')
    .order('position', { ascending: true })
}

interface JoinedStateRow {
  user_id: string
  watch_status: WatchStatus | null
  watch_scope: WatchScope
  watched_at: string | null
  rating: number | null
  is_favorite: boolean
  updated_at: string | null
  title: TitleRow
}

/**
 * Derives "watched by both" in memory: groups the household's state rows by
 * title and splits them between the viewer and their partner.
 *
 * Grouping is keyed on `title.id`, not `tmdb_id`: a movie and a series can
 * share a TMDB id, and keying on it merged two different entries into one and
 * dropped one of them from the catalog.
 */
export function buildCatalog(
  rows: JoinedStateRow[],
  userId: string,
): CatalogItem[] {
  const ownByTitle = new Map<string, JoinedStateRow>()
  const partnerByTitle = new Map<string, JoinedStateRow>()
  for (const row of rows) {
    const bucket = row.user_id === userId ? ownByTitle : partnerByTitle
    if (!bucket.has(row.title.id)) {
      bucket.set(row.title.id, row)
    }
  }
  const seen = new Set<string>()
  const items: CatalogItem[] = []
  for (const row of rows) {
    const titleId = row.title.id
    if (seen.has(titleId)) continue
    seen.add(titleId)
    const own = ownByTitle.get(titleId)
    const partner = partnerByTitle.get(titleId)
    items.push({
      title: row.title,
      ownStatus: own?.watch_status ?? null,
      ownWatchedAt: own?.watched_at ?? null,
      ownRating: own?.rating ?? null,
      ownFavorite: own?.is_favorite ?? false,
      ownScope: own?.watch_scope ?? null,
      partnerStatus: partner?.watch_status ?? null,
      partnerWatchedAt: partner?.watched_at ?? null,
      partnerRating: partner?.rating ?? null,
      partnerScope: partner?.watch_scope ?? null,
      ownUpdatedAt: own?.updated_at ?? null,
      partnerUpdatedAt: partner?.updated_at ?? null,
      sharedPosition: null,
      personalPosition: null,
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
      'user_id, watch_status, watch_scope, watched_at, rating, is_favorite, updated_at, title:titles(*)',
    )
    .order('created_at', { referencedTable: 'titles', ascending: false })
}

/**
 * Same catalog query without `watch_scope`, for databases that have not run the
 * watchlist-scopes migration yet. The caller defaults every row to 'shared',
 * which is exactly the behaviour before scopes existed.
 */
export function getCatalogWithoutScopes() {
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

/**
 * Moves the viewer's pending title between the shared household queue and their
 * own personal queue. Only meaningful while the status is 'watchlist'; the
 * server trigger moves the order row and compacts whichever queue it leaves.
 */
export async function setWatchScope(
  userId: string,
  titleId: string,
  watchScope: WatchScope,
) {
  const { error } = await supabase
    .from('user_title_state')
    .upsert(
      { user_id: userId, title_id: titleId, watch_scope: watchScope },
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

/**
 * Removes the caller's own state (and review) for a title. The shared title
 * row is deleted by the RPC only when it becomes orphaned (nobody in the
 * household references it anymore). Returns true when the title itself was
 * removed, false when the partner still holds it in the shared catalog.
 */
export async function removeTitleFromCatalog(
  titleId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_title_from_catalog', {
    p_title_id: titleId,
  })
  if (error) throw error
  return data ?? false
}

/**
 * Atomically rewrites the shared household watchlist order. `orderedTitleIds`
 * must be exactly the titles the household currently has pending as 'shared'
 * (both members see the same list), in the new order 1..N.
 */
export async function reorderWatchlist(orderedTitleIds: string[]) {
  const { error } = await supabase.rpc('reorder_household_watchlist', {
    p_ordered_title_ids: orderedTitleIds,
  })
  if (error) throw error
}

/**
 * Atomically rewrites the caller's personal watchlist order.
 * `orderedTitleIds` must be exactly the caller's own pending 'personal' titles,
 * in the new order 1..N. Nobody else, not even a household partner, can read or
 * reorder this list.
 */
export async function reorderPersonalWatchlist(orderedTitleIds: string[]) {
  const { error } = await supabase.rpc('reorder_personal_watchlist', {
    p_ordered_title_ids: orderedTitleIds,
  })
  if (error) throw error
}
