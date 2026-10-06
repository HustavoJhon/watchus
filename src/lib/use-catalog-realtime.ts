import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queries'

/**
 * Keeps the catalog in sync with changes made by the partner, or by this
 * session on another tab/device.
 *
 * Two tables feed the catalog: `user_title_state` (statuses, scopes, ratings and
 * favorites) and `household_watchlist_order`, whose rows the server trigger
 * rewrites when a title leaves or joins the shared queue. Any change to either
 * invalidates the catalog query, which then re-fetches both queues.
 *
 * `personal_watchlist_order` is deliberately NOT subscribed. It is private to
 * its owner, so the partner's rows must never influence this catalog, and
 * Realtime does not apply RLS to DELETE events ("RLS policies are not applied
 * to DELETE statements, because there is no way for Postgres to verify that a
 * user has access to a deleted record"). A subscription would therefore leak to
 * the partner the id of every title leaving somebody's private queue. Nothing
 * is lost by not subscribing: the owner's own changes are already applied
 * optimistically by the mutation that made them, and their state rows arrive
 * through `user_title_state`.
 *
 * RLS does the filtering on the server: Realtime only delivers rows the caller
 * is allowed to see, and the read policy on `user_title_state` keeps each
 * person's personal pending queue out of their partner's catalog.
 */
export function useCatalogRealtime(user?: User | null) {
  const queryClient = useQueryClient()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return

    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.catalog(userId),
      })
    }

    const channel = supabase
      .channel(`catalog:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_title_state' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_watchlist_order' },
        invalidate,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, userId])
}
