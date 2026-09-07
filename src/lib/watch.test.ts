import { describe, expect, it } from 'vitest'
import { getWatchTonightCandidates, pickWatchTonight } from '@/lib/watch'
import { makeItem, makeTitle } from '@/lib/testing'

const bothPending = makeItem({
  title: makeTitle({ tmdb_id: 1 }),
  ownStatus: 'watchlist',
  partnerStatus: 'watchlist',
})
const onePending = makeItem({
  title: makeTitle({ tmdb_id: 2 }),
  ownStatus: 'watchlist',
  partnerStatus: null,
})
const partnerPending = makeItem({
  title: makeTitle({ tmdb_id: 3 }),
  ownStatus: null,
  partnerStatus: 'watchlist',
})
const bothWatched = makeItem({
  title: makeTitle({ tmdb_id: 4 }),
  ownStatus: 'watched',
  partnerStatus: 'watched',
})
const ownWatched = makeItem({
  title: makeTitle({ tmdb_id: 5 }),
  ownStatus: 'watched',
  partnerStatus: 'watchlist',
})
const unwatched = makeItem({ title: makeTitle({ tmdb_id: 6 }) })

describe('getWatchTonightCandidates', () => {
  it('prefers titles both have in their watchlist', () => {
    const candidates = getWatchTonightCandidates([
      onePending,
      bothPending,
      partnerPending,
    ])
    expect(candidates).toEqual([bothPending])
  })

  it('falls back to titles where at least one member has it pending', () => {
    const candidates = getWatchTonightCandidates([onePending, partnerPending])
    expect(candidates).toEqual([onePending, partnerPending])
  })

  it('excludes titles already watched by both', () => {
    const candidates = getWatchTonightCandidates([bothWatched, onePending])
    expect(candidates).toEqual([onePending])
  })

  it('keeps titles one member watched if the other still has them pending', () => {
    const candidates = getWatchTonightCandidates([ownWatched, bothWatched])
    expect(candidates).toEqual([ownWatched])
  })

  it('ignores titles without any pending state', () => {
    const candidates = getWatchTonightCandidates([unwatched, bothWatched])
    expect(candidates).toEqual([])
  })
})

describe('pickWatchTonight', () => {
  it('returns the single candidate for empty-ish catalogs (case D)', () => {
    expect(pickWatchTonight([bothPending])).toEqual(bothPending)
    expect(pickWatchTonight([bothPending, bothWatched])).toEqual(bothPending)
  })

  it('returns null when everything is already watched by both (case C)', () => {
    expect(pickWatchTonight([bothWatched, bothWatched])).toBeNull()
    expect(pickWatchTonight([])).toBeNull()
  })

  it('picks deterministically with an injected RNG (case E)', () => {
    const candidates = [onePending, partnerPending]
    expect(pickWatchTonight(candidates, () => 0)).toEqual(onePending)
    expect(pickWatchTonight(candidates, () => 0.99)).toEqual(partnerPending)
    expect(pickWatchTonight(candidates, () => 1)).toEqual(partnerPending)
  })

  it('allows a different pick on the next roll', () => {
    const candidates = [onePending, partnerPending]
    const first = pickWatchTonight(candidates, () => 0)
    const second = pickWatchTonight(candidates, () => 0.51)
    expect(first).not.toEqual(second)
  })

  it('is deterministic for the same catalog and RNG', () => {
    const candidates = [onePending, partnerPending]
    expect(pickWatchTonight(candidates, () => 0.4)).toEqual(
      pickWatchTonight(candidates, () => 0.4),
    )
  })
})
