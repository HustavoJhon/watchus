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
  setFavorite,
  setRating,
  setWatchStatus,
} from '@/lib/catalog'
import type { WatchStatus } from '@/lib/catalog'
import type { TitleCandidate } from '@/lib/tmdb/mapper'
import { searchTitles } from '@/lib/tmdb/search'
import type { SearchMediaType } from '@/lib/tmdb/search'

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  household: (householdId: string | undefined) =>
    ['household', householdId] as const,
  householdProfiles: (householdId: string | undefined) =>
    ['household_profiles', householdId] as const,
  catalog: (userId: string) => ['catalog', userId] as const,
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
  return useQuery({
    queryKey: queryKeys.catalog(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await getCatalog()
      if (error) throw error
      return buildCatalog(data ?? [], user!.id)
    },
    enabled: user?.id != null,
    staleTime: 30 * 1000,
  })
}

export function useCatalogMutations(user?: User | null): {
  add: ReturnType<typeof useAddTitleMutation>
  setStatus: ReturnType<typeof useSetStatusMutation>
  clearStatus: ReturnType<typeof useClearStatusMutation>
  rate: ReturnType<typeof useRateMutation>
  favorite: ReturnType<typeof useFavoriteMutation>
} {
  const queryClient = useQueryClient()
  const userId = user?.id
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog'] })
  }
  return {
    add: useAddTitleMutation(userId),
    setStatus: useSetStatusMutation(userId, invalidate),
    clearStatus: useClearStatusMutation(userId, invalidate),
    rate: useRateMutation(userId, invalidate),
    favorite: useFavoriteMutation(userId, invalidate),
  }
}

function useAddTitleMutation(userId: string | undefined) {
  return useMutation({
    mutationFn: (candidate: TitleCandidate) => {
      if (!userId) throw new Error('Sesión no iniciada.')
      return addTitleToCatalog(candidate, userId)
    },
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
