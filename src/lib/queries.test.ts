import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/queries'

describe('queryKeys', () => {
  it('scopes profile, household and member queries by id', () => {
    expect(queryKeys.profile('user-1')).toEqual(['profile', 'user-1'])
    expect(queryKeys.household('h-1')).toEqual(['household', 'h-1'])
    expect(queryKeys.householdProfiles('h-1')).toEqual([
      'household_profiles',
      'h-1',
    ])
  })

  it('keeps "no household" queries distinct from a real one', () => {
    expect(queryKeys.household(undefined)).not.toEqual(
      queryKeys.household('h-1'),
    )
    expect(queryKeys.householdProfiles(undefined)).not.toEqual(
      queryKeys.householdProfiles('h-1'),
    )
  })
})
