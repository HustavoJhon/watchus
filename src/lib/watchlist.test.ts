import { describe, expect, it } from 'vitest'
import {
  isInPersonalWatchlist,
  isInSharedWatchlist,
  isPendingInScope,
  pendingInScope,
  watchlistCountLabel,
  watchlistScopeLabel,
  watchlistSections,
} from '@/lib/watchlist'
import { makeItem, makePersonalPending, makeSharedPending } from '@/lib/testing'

describe('isInSharedWatchlist', () => {
  it('is true when either member has the title pending as shared', () => {
    expect(isInSharedWatchlist(makeSharedPending())).toBe(true)
    expect(
      isInSharedWatchlist(
        makeItem({
          ownStatus: null,
          partnerStatus: 'watchlist',
          partnerScope: 'shared',
        }),
      ),
    ).toBe(true)
  })

  it('is false when nothing is pending, or only as personal', () => {
    expect(isInSharedWatchlist(makeItem({ ownStatus: 'watched' }))).toBe(false)
    expect(isInSharedWatchlist(makeItem())).toBe(false)
    // A partner holding it personally must not publish it to the household.
    expect(
      isInSharedWatchlist(
        makeItem({
          ownStatus: null,
          partnerStatus: 'watchlist',
          partnerScope: 'personal',
        }),
      ),
    ).toBe(false)
    expect(isInSharedWatchlist(makePersonalPending())).toBe(false)
  })
})

describe('isInPersonalWatchlist', () => {
  it('depends only on the viewer own row', () => {
    expect(isInPersonalWatchlist(makePersonalPending())).toBe(true)
    expect(isInPersonalWatchlist(makeSharedPending())).toBe(false)
    // The partner's personal title is invisible here.
    expect(
      isInPersonalWatchlist(
        makeItem({
          ownStatus: 'watched',
          partnerStatus: 'watchlist',
          partnerScope: 'personal',
        }),
      ),
    ).toBe(false)
  })
})

describe('isPendingInScope', () => {
  it('routes to the right queue', () => {
    const shared = makeSharedPending()
    const personal = makePersonalPending()
    expect(isPendingInScope(shared, 'shared')).toBe(true)
    expect(isPendingInScope(shared, 'personal')).toBe(false)
    expect(isPendingInScope(personal, 'personal')).toBe(true)
    expect(isPendingInScope(personal, 'shared')).toBe(false)
  })
})

describe('pendingInScope', () => {
  it('filters a mixed catalog to one queue', () => {
    const shared = makeSharedPending()
    const personal = makePersonalPending()
    const watched = makeItem({ ownStatus: 'watched' })

    expect(pendingInScope([watched, shared, personal], 'shared')).toEqual([
      shared,
    ])
    expect(pendingInScope([watched, shared, personal], 'personal')).toEqual([
      personal,
    ])
  })
})

describe('watchlistSections', () => {
  it('splits the catalog into both queues and counts them', () => {
    const shared = makeSharedPending()
    const personal = makePersonalPending()
    const bothQueues = makeItem({
      ownStatus: 'watchlist',
      ownScope: 'personal',
      partnerStatus: 'watchlist',
      partnerScope: 'shared',
    })

    const sections = watchlistSections([shared, personal, bothQueues])

    expect(sections.shared).toEqual([shared, bothQueues])
    expect(sections.personal).toEqual([personal, bothQueues])
    // A title in both queues is pending twice, once per list.
    expect(sections.total).toBe(4)
  })
})

describe('watchlistCountLabel', () => {
  it('pluralizes the count', () => {
    expect(watchlistCountLabel(0)).toBe('0 títulos en la lista')
    expect(watchlistCountLabel(1)).toBe('1 título en la lista')
    expect(watchlistCountLabel(3)).toBe('3 títulos en la lista')
  })
})

describe('watchlistScopeLabel', () => {
  it('labels both queues', () => {
    expect(watchlistScopeLabel('shared')).toBe('Hogar')
    expect(watchlistScopeLabel('personal')).toBe('Solo para mí')
  })
})
