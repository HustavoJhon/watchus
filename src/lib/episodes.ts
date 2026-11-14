import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type EpisodeRatingRow =
  Database['public']['Tables']['episode_ratings']['Row']

/** One episode as exposed by the title detail page. */
export interface EpisodeRef {
  tmdbEpisodeId: number
  seasonNumber: number
  episodeNumber: number
}

/**
 * All episode ratings for one title, from the viewer and their partner. RLS
 * limits the result to the household; the caller splits rows by `user_id`.
 */
export function getEpisodeRatings(titleId: string) {
  return supabase
    .from('episode_ratings')
    .select('*')
    .eq('title_id', titleId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true })
}

/** Creates or replaces the signed-in user's rating for one episode. */
export async function setEpisodeRating(
  userId: string,
  titleId: string,
  episode: EpisodeRef,
  rating: number,
) {
  const { error } = await supabase.from('episode_ratings').upsert(
    {
      user_id: userId,
      title_id: titleId,
      tmdb_episode_id: episode.tmdbEpisodeId,
      season_number: episode.seasonNumber,
      episode_number: episode.episodeNumber,
      rating,
    },
    { onConflict: 'user_id,title_id,tmdb_episode_id' },
  )
  if (error) throw error
}

/** Deletes the signed-in user's rating for one episode (rating cleared). */
export async function clearEpisodeRating(
  userId: string,
  titleId: string,
  tmdbEpisodeId: number,
) {
  const { error } = await supabase
    .from('episode_ratings')
    .delete()
    .eq('user_id', userId)
    .eq('title_id', titleId)
    .eq('tmdb_episode_id', tmdbEpisodeId)
  if (error) throw error
}
