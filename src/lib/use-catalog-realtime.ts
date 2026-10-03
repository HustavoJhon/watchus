import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryKeys } from '@/lib/queries'

/**
 * Keeps the catalog in sync with changes made by the partner, or by this
 * session on another tab/device.
 *
 * Three tables feed the catalog: `user_title_state` (statuses, scopes, ratings
 * and favorites) plus the two order tables, whose rows the server trigger
 * rewrites when a title leaves or joins a pending queue. Any change to any of
 * them invalidates the catalog query, which then re-fetches both queues.
 *
 * RLS does the filtering on the server: Realtime only delivers rows the caller
 * is allowed to see, so the partner's personal queue never reaches this client.
 */
export function useCatalogRealtime(user?: User | null) {
  const queryClient = useQueryClient()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`catalog:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_title_state' },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.catalog(userId),
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_watchlist_order' },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.catalog(userId),
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_watchlist_order' },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.catalog(userId),
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, userId])
}
