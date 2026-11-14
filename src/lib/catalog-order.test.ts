import { describe, expect, it } from 'vitest'
import {
  applyOptimisticPositions,
  applyPendingOrder,
  attachWatchlistOrder,
  compareWatchlistPosition,
  moveItem,
  positionForScope,
  reorderWithSubset,
  sortByWatchlistPosition,
} from '@/lib/catalog-order'
import { makeItem } from '@/lib/testing'

describe('compareWatchlistPosition', () => {
  it('sorts pending titles by position, non-pending after them', () => {
    const pending1 = makeItem({ sharedPosition: 1 })
    const pending2 = makeItem({ sharedPosition: 2 })
    const none = makeItem({ sharedPosition: null })

    const sorted = [none, pending2, pending1].sort((a, b) =>
      compareWatchlistPosition(a, b, 'shared'),
    )
    expect(sorted.map((i) => i.sharedPosition)).toEqual([1, 2, null])
  })

  it('reads the position of the requested queue only', () => {
    const item = makeItem({ sharedPosition: 1, personalPosition: 7 })
    expect(positionForScope(item, 'shared')).toBe(1)
    expect(positionForScope(item, 'personal')).toBe(7)
  })

  it('keeps created_at desc as tie-break when no position exists', () => {
    const a = makeItem({ sharedPosition: null })
    const b = makeItem({ sharedPosition: null })
    const sorted = [a, b].sort((x, y) =>
      compareWatchlistPosition(x, y, 'shared'),
    )
    expect(sorted[0].title.id).toBe(
      [a, b].sort((x, y) =>
        y.title.created_at.localeCompare(x.title.created_at),
      )[0].title.id,
    )
  })
})

describe('sortByWatchlistPosition', () => {
  it('does not mutate the input array', () => {
    const items = [
      makeItem({ sharedPosition: 2 }),
      makeItem({ sharedPosition: 1 }),
    ]
    const original = [...items]
    sortByWatchlistPosition(items, 'shared')
    expect(items).toEqual(original)
  })
})

describe('attachWatchlistOrder', () => {
  it('maps shared order rows onto items and sorts by position', () => {
    const a = makeItem({ sharedPosition: null })
    const b = makeItem({ sharedPosition: null })
    const result = attachWatchlistOrder(
      [a, b],
      [
        { title_id: b.title.id, position: 1 },
        { title_id: a.title.id, position: 2 },
      ],
      'shared',
    )
    expect(result.map((i) => i.title.id)).toEqual([b.title.id, a.title.id])
    expect(result[0].sharedPosition).toBe(1)
    expect(result[1].sharedPosition).toBe(2)
  })

  it('writes personal rows without disturbing the shared positions', () => {
    const a = makeItem({ sharedPosition: 1 })
    const b = makeItem({ sharedPosition: 2 })
    const result = attachWatchlistOrder(
      [a, b],
      [
        { title_id: b.title.id, position: 1 },
        { title_id: a.title.id, position: 2 },
      ],
      'personal',
    )
    // Sorted by the personal queue (b first), shared positions left intact.
    expect(result.map((i) => i.title.id)).toEqual([b.title.id, a.title.id])
    expect(result.map((i) => i.personalPosition)).toEqual([1, 2])
    expect(result.map((i) => i.sharedPosition)).toEqual([2, 1])
  })
})

describe('applyOptimisticPositions', () => {
  it('writes 1..N onto the submitted queue only', () => {
    const a = makeItem({ sharedPosition: 1, personalPosition: 5 })
    const b = makeItem({ sharedPosition: 2, personalPosition: 6 })

    const result = applyOptimisticPositions(
      [a, b],
      [b.title.id, a.title.id],
      'shared',
    )

    const byId = new Map(result.map((i) => [i.title.id, i]))
    expect(byId.get(b.title.id)?.sharedPosition).toBe(1)
    expect(byId.get(a.title.id)?.sharedPosition).toBe(2)
    // The personal queue is a separate list and must not move.
    expect(byId.get(a.title.id)?.personalPosition).toBe(5)
    expect(byId.get(b.title.id)?.personalPosition).toBe(6)
  })

  it('nulls the position of titles left out of the order', () => {
    const a = makeItem({ sharedPosition: 1 })
    const b = makeItem({ sharedPosition: 2 })
    const result = applyOptimisticPositions([a, b], [a.title.id], 'shared')
    const byId = new Map(result.map((i) => [i.title.id, i.sharedPosition]))
    expect(byId.get(a.title.id)).toBe(1)
    expect(byId.get(b.title.id)).toBeNull()
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
    const pendingFirst = makeItem({ sharedPosition: 1 })
    const pendingSecond = makeItem({ sharedPosition: 2 })
    const other = makeItem({ sharedPosition: null })

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

describe('reorderWithSubset', () => {
  const full = ['a', 'b', 'c', 'd']

  it('reorders within the visible subset and keeps hidden items in place', () => {
    // Displayed: ['a', 'c']. Move a after c: it lands right after c.
    expect(reorderWithSubset(full, ['a', 'c'], 0, 1)).toEqual([
      'b',
      'c',
      'a',
      'd',
    ])
  })

  it('moves an item to the first visible slot', () => {
    // Displayed: ['b', 'c', 'd']. Move d to index 0.
    expect(reorderWithSubset(full, ['b', 'c', 'd'], 2, 0)).toEqual([
      'd',
      'a',
      'b',
      'c',
    ])
  })

  it('is a no-op when nothing changes', () => {
    expect(reorderWithSubset(full, ['a', 'c'], 0, 0)).toEqual(full)
  })
})
