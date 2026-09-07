import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type ReviewRow = Database['public']['Tables']['reviews']['Row']

/**
 * Household reviews for a single title. RLS restricts the result to the
 * signed-in user's own reviews plus their household partner's.
 */
export function getReviewsForTitle(titleId: string) {
  return supabase
    .from('reviews')
    .select('*')
    .eq('title_id', titleId)
    .order('created_at', { ascending: true })
}

/** All household reviews (used to derive per-user review counts). */
export function getAllReviews() {
  return supabase.from('reviews').select('*').order('created_at')
}

/** Creates or updates the signed-in user's review for a title (PK upsert). */
export async function saveReview(
  userId: string,
  titleId: string,
  content: string,
) {
  const { error } = await supabase
    .from('reviews')
    .upsert(
      { user_id: userId, title_id: titleId, content },
      { onConflict: 'user_id,title_id' },
    )
  if (error) throw error
}

export async function deleteReview(userId: string, titleId: string) {
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('user_id', userId)
    .eq('title_id', titleId)
  if (error) throw error
}
