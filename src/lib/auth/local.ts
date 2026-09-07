import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type HouseholdRow = Database['public']['Tables']['households']['Row']
export type ProfileRow = Database['public']['Tables']['profiles']['Row']

export function getUserProfile() {
  return supabase.from('profiles').select('*').maybeSingle()
}

export function getProfileByUserId(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
}

export function getHousehold(householdId: string) {
  return supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .maybeSingle()
}

export function getHouseholdProfiles(householdId: string) {
  return supabase.from('profiles').select('*').eq('household_id', householdId)
}

export function createHousehold(name: string) {
  return supabase.rpc('create_household', { household_name: name })
}

export function generateInvitationCode() {
  return supabase.rpc('generate_invitation_code')
}

export function acceptInvitationCode(code: string) {
  return supabase.rpc('accept_invitation_code', { invite_code: code })
}
