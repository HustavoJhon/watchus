import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import {
  getHousehold,
  getHouseholdProfiles,
  getUserProfile,
} from '@/lib/auth/local'
import type { HouseholdRow, ProfileRow } from '@/lib/auth/local'
import {
  addTitleToCatalog,
  buildCatalog,
  clearWatchStatus,
  getCatalog,
  getWatchlistOrder,
  removeTitleFromCatalog,
  reorderWatchlist,
  setFavorite,
  setRating,
  setWatchStatus,
} from '@/lib/catalog'
import type { WatchStatus } from '@/lib/catalog'
import type { CatalogItem } from '@/lib/catalog'
import { applyPendingOrder, attachWatchlistOrder } from '@/lib/catalog-order'
import type { TitleCandidate } from '@/lib/tmdb/mapper'
import { searchTitles } from '@/lib/tmdb/search'
import type { SearchMediaType } from '@/lib/tmdb/search'
import {
  deleteReview,
  getAllReviews,
  getReviewsForTitle,
  saveReview,
} from '@/lib/reviews'

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  household: (householdId: string | undefined) =>
    ['household', householdId] as const,
  householdProfiles: (householdId: string | undefined) =>
    ['household_profiles', householdId] as const,
  catalog: (userId: string) => ['catalog', userId] as const,
  reviewForTitle: (titleId: string) => ['reviews', 'title', titleId] as const,
  reviews: () => ['reviews'] as const,
  titleSearch: (query: string, mediaType: SearchMediaType, page: number) =>
    ['title_search', mediaType, query.trim(), page] as const,
}

/**
 * Returns the profile for the signed-in user. Disabled while loading auth
 * or for unauthenticated users so no request fires before a session exists.
 */
export function useMyProfile(user?: User | null) {
  return useQuery({
    queryKey: queryKeys.profile(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await getUserProfile()
      if (error) throw error
      return data
    },
    enabled: user?.id != null,
    staleTime: 5 * 60 * 1000,
  })
}

export function useHousehold(householdId?: string | null) {
  return useQuery({
    queryKey: queryKeys.household(householdId ?? undefined),
    queryFn: async () => {
      const { data, error } = await getHousehold(householdId!)
      if (error) throw error
      return data
    },
    enabled: householdId != null,
    staleTime: 5 * 60 * 1000,
  })
}

export function useHouseholdProfiles(householdId?: string | null) {
  return useQuery({
    queryKey: queryKeys.householdProfiles(householdId ?? undefined),
    queryFn: async () => {
      const { data, error } = await getHouseholdProfiles(householdId!)
      if (error) throw error
      return data ?? []
    },
    enabled: householdId != null,
    staleTime: 30 * 1000,
  })
}

export interface HouseholdContext {
  profile: ProfileRow | null
  household: HouseholdRow | null
  members: ProfileRow[]
  secondMember: ProfileRow | null
  isLoading: boolean
  isError: boolean
}

/**
 * Aggregates the signed-in user's profile, their household and household
 * members. Centralizes these queries so individual components never repeat
 * them. `secondMember` is null until the second user joins.
 */
export function useHouseholdContext(user?: User | null): HouseholdContext {
  const profileQuery = useMyProfile(user)
  const householdId = profileQuery.data?.household_id ?? null

  const householdQuery = useHousehold(householdId)
  const membersQuery = useHouseholdProfiles(householdId)

  const members = membersQuery.data ?? []
  const secondMember = members.find((member) => member.id !== user?.id) ?? null

  return {
    profile: profileQuery.data ?? null,
    household: householdQuery.data ?? null,
    members,
    secondMember,
    isLoading:
      profileQuery.isLoading ||
      householdQuery.isLoading ||
      membersQuery.isLoading,
    isError:
      profileQuery.isError || householdQuery.isError || membersQuery.isError,
  }
}

/**
 * Fetches the household catalog (title + own/partner state) for the signed-in
 * user. RLS restricts reads to the viewer's and their partner's rows.
 */
export function useCatalog(user?: User | null) {
  const queryKey = queryKeys.catalog(user?.id ?? '')
  const userId = user?.id
  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!userId) throw new Error('Sesión no iniciada.')
      const rows = await getCatalogRows(userId)
      return buildCatalogWithOrder(rows)
    },
    enabled: userId != null,
    staleTime: 30 * 1000,
  })
}

async function getCatalogRows(userId: string): Promise<{
  items: CatalogItem[]
  order: Array<{ title_id: string; position: number }>
}> {
  const [catalogQuery, orderQuery] = await Promise.all([
    getCatalog(),
    getWatchlistOrder(),
  ])
  const { data: rows, error } = catalogQuery
  if (error) throw error
  const { data: order, error: orderError } = orderQuery
  if (orderError) throw orderError
  return { items: buildCatalog(rows ?? [], userId), order: order ?? [] }
}

/** Attaches the shared watchlist position and returns the ordered catalog. */
function buildCatalogWithOrder({
  items,
  order,
}: {
  items: CatalogItem[]
  order: Array<{ title_id: string; position: number }>
}): CatalogItem[] {
  return attachWatchlistOrder(items, order)
}

export function useCatalogMutations(user?: User | null): {
  add: ReturnType<typeof useAddTitleMutation>
  setStatus: ReturnType<typeof useSetStatusMutation>
  clearStatus: ReturnType<typeof useClearStatusMutation>
  rate: ReturnType<typeof useRateMutation>
  favorite: ReturnType<typeof useFavoriteMutation>
  remove: ReturnType<typeof useRemoveTitleMutation>
  reorder: ReturnType<typeof useReorderWatchlistMutation>
} {
  const queryClient = useQueryClient()
  const userId = user?.id
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog'] })
  }
  return {
    add: useAddTitleMutation(userId, invalidate),
    setStatus: useSetStatusMutation(userId, invalidate),
    clearStatus: useClearStatusMutation(userId, invalidate),
    rate: useRateMutation(userId, invalidate),
    favorite: useFavoriteMutation(userId, invalidate),
    remove: useRemoveTitleMutation(userId, invalidate),
    reorder: useReorderWatchlistMutation(userId, queryClient),
  }
}

function useAddTitleMutation(
  userId: string | undefined,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: (candidate: TitleCandidate) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return addTitleToCatalog(candidate, userId)
    },
    onSuccess,
  })
}

function useSetStatusMutation(
  userId: string | undefined,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: ({
      titleId,
      status,
    }: {
      titleId: string
      status: WatchStatus
    }) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return setWatchStatus(userId, titleId, status)
    },
    onSuccess,
  })
}

function useClearStatusMutation(
  userId: string | undefined,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: (titleId: string) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return clearWatchStatus(userId, titleId)
    },
    onSuccess,
  })
}

function useRateMutation(userId: string | undefined, onSuccess: () => void) {
  return useMutation({
    mutationFn: ({
      titleId,
      rating,
    }: {
      titleId: string
      rating: number | null
    }) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return setRating(userId, titleId, rating)
    },
    onSuccess,
  })
}

function useFavoriteMutation(
  userId: string | undefined,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: ({
      titleId,
      favorite,
    }: {
      titleId: string
      favorite: boolean
    }) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return setFavorite(userId, titleId, favorite)
    },
    onSuccess,
  })
}

/**
 * Removes the caller's own state for a title. Also invalidates reviews
 * because the title may have been fully removed (orphaned), which deletes
 * its review rows as well.
 */
function useRemoveTitleMutation(
  userId: string | undefined,
  onSuccess: () => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (titleId: string) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return removeTitleFromCatalog(titleId)
    },
    onSuccess: (removed) => {
      onSuccess()
      if (removed) {
        void queryClient.invalidateQueries({ queryKey: ['reviews'] })
      }
    },
  })
}

/**
 * Debounced TMDB search results. Disabled until the query has content; the
 * caller owns the debounce and page state.
 */
export function useTitleSearch(
  query: string,
  options: { mediaType?: SearchMediaType; page?: number } = {},
) {
  const mediaType = options.mediaType ?? 'all'
  const page = options.page ?? 1
  return useQuery({
    queryKey: queryKeys.titleSearch(query, mediaType, page),
    queryFn: () => searchTitles(query, { mediaType, page }),
    enabled: query.trim().length > 0,
    staleTime: 60 * 1000,
  })
}

/**
 * Household reviews for one title. Shared by the reviews section and cached;
 * RLS returns only the signed-in user's reviews plus the partner's.
 */
export function useTitleReviews(titleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reviewForTitle(titleId ?? ''),
    queryFn: async () => {
      const { data, error } = await getReviewsForTitle(titleId!)
      if (error) throw error
      return data ?? []
    },
    enabled: titleId != null,
    staleTime: 30 * 1000,
  })
}

/**
 * All household reviews. Used to derive stats (review counts per user) with a
 * single query instead of hundreds of individual requests.
 */
export function useAllReviews(user?: User | null) {
  return useQuery({
    queryKey: queryKeys.reviews(),
    queryFn: async () => {
      const { data, error } = await getAllReviews()
      if (error) throw error
      return data ?? []
    },
    enabled: user?.id != null,
    staleTime: 30 * 1000,
  })
}

export function useReviewMutations(user?: User | null): {
  save: ReturnType<typeof useSaveReviewMutation>
  remove: ReturnType<typeof useDeleteReviewMutation>
} {
  const queryClient = useQueryClient()
  const userId = user?.id
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['reviews'] })
  }
  return {
    save: useSaveReviewMutation(userId, invalidate),
    remove: useDeleteReviewMutation(userId, invalidate),
  }
}

function useSaveReviewMutation(
  userId: string | undefined,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: ({
      titleId,
      content,
    }: {
      titleId: string
      content: string
    }) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return saveReview(userId, titleId, content)
    },
    onSuccess,
  })
}

function useDeleteReviewMutation(
  userId: string | undefined,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: (titleId: string) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return deleteReview(userId, titleId)
    },
    onSuccess,
  })
}

/**
 * Reorders the shared household watchlist. Optimistic update with rollback on
 * error; the invalidation refreshes any other view (e.g. the partner) without
 * a full reload.
 */
function useReorderWatchlistMutation(
  userId: string | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return useMutation({
    mutationFn: (orderedTitleIds: string[]) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return reorderWatchlist(orderedTitleIds)
    },
    onMutate: async (orderedTitleIds) => {
      const queryKey = queryKeys.catalog(userId ?? '')
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<CatalogItem[]>(queryKey)
      if (previous) {
        queryClient.setQueryData(
          queryKey,
          applyPendingOrder(previous, orderedTitleIds),
        )
      }
      return { previous }
    },
    onError: (_err, _ordered, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.catalog(userId ?? ''),
          context.previous,
        )
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
}
