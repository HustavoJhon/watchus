import { describe, expect, it } from 'vitest'
import {
  householdWatchlist,
  isInHouseholdWatchlist,
  watchlistCountLabel,
} from '@/lib/watchlist'
import { makeItem } from '@/lib/testing'

describe('isInHouseholdWatchlist', () => {
  it('is true when either member has the title pending', () => {
    expect(isInHouseholdWatchlist(makeItem({ ownStatus: 'watchlist' }))).toBe(
      true,
    )
    expect(
      isInHouseholdWatchlist(
        makeItem({ ownStatus: null, partnerStatus: 'watchlist' }),
      ),
    ).toBe(true)
    expect(isInHouseholdWatchlist(makeItem({ ownStatus: 'watched' }))).toBe(
      false,
    )
    expect(isInHouseholdWatchlist(makeItem())).toBe(false)
  })
})

describe('householdWatchlist', () => {
  it('filters a mixed catalog to the shared pending set', () => {
    const pending = makeItem({ ownStatus: 'watchlist' })
    const partnerPending = makeItem({
      ownStatus: null,
      partnerStatus: 'watchlist',
    })
    const watched = makeItem({ ownStatus: 'watched' })
    const empty = makeItem()

    expect(
      householdWatchlist([watched, pending, empty, partnerPending]),
    ).toEqual([pending, partnerPending])
  })
})

describe('watchlistCountLabel', () => {
  it('pluralizes the count', () => {
    expect(watchlistCountLabel(0)).toBe('0 títulos en la lista')
    expect(watchlistCountLabel(1)).toBe('1 título en la lista')
    expect(watchlistCountLabel(3)).toBe('3 títulos en la lista')
  })
})
