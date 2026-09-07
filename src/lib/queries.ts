import { useQuery } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import {
  getHousehold,
  getHouseholdProfiles,
  getUserProfile,
} from '@/lib/auth/local'
import type { HouseholdRow, ProfileRow } from '@/lib/auth/local'

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  household: (householdId: string | undefined) =>
    ['household', householdId] as const,
  householdProfiles: (householdId: string | undefined) =>
    ['household_profiles', householdId] as const,
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
