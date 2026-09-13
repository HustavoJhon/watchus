import { describe, expect, it } from 'vitest'
import {
  applyPendingOrder,
  attachWatchlistOrder,
  compareWatchlistPosition,
  moveItem,
  sortByWatchlistPosition,
} from '@/lib/catalog-order'
import { makeItem } from '@/lib/testing'

describe('compareWatchlistPosition', () => {
  it('sorts pending titles by position, non-pending after them', () => {
    const pending1 = makeItem({ watchlistPosition: 1 })
    const pending2 = makeItem({ watchlistPosition: 2 })
    const none = makeItem({ watchlistPosition: null })

    const sorted = [none, pending2, pending1].sort(compareWatchlistPosition)
    expect(sorted.map((i) => i.watchlistPosition)).toEqual([1, 2, null])
  })

  it('keeps created_at desc as tie-break when no position exists', () => {
    const a = makeItem({ watchlistPosition: null })
    const b = makeItem({ watchlistPosition: null })
    const sorted = [a, b].sort(compareWatchlistPosition)
    expect(sorted[0].title.id).toBe(
      [a, b].sort((x, y) => y.title.created_at.localeCompare(x.title.created_at))[0]
        .title.id,
    )
  })
})

describe('sortByWatchlistPosition', () => {
  it('does not mutate the input array', () => {
    const items = [makeItem({ watchlistPosition: 2 }), makeItem({ watchlistPosition: 1 })]
    const original = [...items]
    sortByWatchlistPosition(items)
    expect(items).toEqual(original)
  })
})

describe('attachWatchlistOrder', () => {
  it('maps order rows onto items and sorts by position', () => {
    const a = makeItem({ watchlistPosition: null })
    const b = makeItem({ watchlistPosition: null })
    const result = attachWatchlistOrder(
      [a, b],
      [
        { title_id: b.title.id, position: 1 },
        { title_id: a.title.id, position: 2 },
      ],
    )
    expect(result.map((i) => i.title.id)).toEqual([b.title.id, a.title.id])
    expect(result[0].watchlistPosition).toBe(1)
    expect(result[1].watchlistPosition).toBe(2)
  })
})

describe('moveItem', () => {
  it('moves an item to the target index', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op for invalid indices', () => {
    expect(moveItem(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })
})

describe('applyPendingOrder', () => {
  it('moves the pending titles to the given order, others after', () => {
    const pendingFirst = makeItem({ watchlistPosition: 1 })
    const pendingSecond = makeItem({ watchlistPosition: 2 })
    const other = makeItem({ watchlistPosition: null })

    const result = applyPendingOrder(
      [pendingFirst, pendingSecond, other],
      [pendingSecond.title.id, pendingFirst.title.id],
    )
    expect(result.map((i) => i.title.id)).toEqual([
      pendingSecond.title.id,
      pendingFirst.title.id,
      other.title.id,
    ])
  })

  it('drops ids not present in the items', () => {
    const a = makeItem()
    const result = applyPendingOrder([a], ['missing-id', a.title.id])
    expect(result.map((i) => i.title.id)).toEqual([a.title.id])
  })
})