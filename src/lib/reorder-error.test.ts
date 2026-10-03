import { describe, expect, it } from 'vitest'
import { describeReorderError } from '@/lib/reorder-error'

/**
 * The server messages come from the Postgres RPCs, so the matcher keys on the
 * fragments the migrations actually raise.
 */
const WHOLE_PENDING = 'The reorder must include the whole pending watchlist.'
const NOT_PENDING =
  'Cannot reorder titles that are not pending in your personal list.'
const DUPLICATE = 'The reordered list contains duplicate titles.'
const NO_HOUSEHOLD = 'You do not belong to a household.'
const NO_SESSION = 'Not authenticated'

describe('describeReorderError', () => {
  it('explains a stale shared list', () => {
    expect(describeReorderError(new Error(WHOLE_PENDING))).toBe(
      'La lista cambió mientras la ordenabas. Se ha actualizado.',
    )
  })

  it('explains a title that stopped being pending', () => {
    expect(describeReorderError(new Error(NOT_PENDING))).toBe(
      'Uno de los títulos ya no está pendiente. Se ha actualizado.',
    )
  })

  it('explains duplicates in the submitted list', () => {
    expect(describeReorderError(new Error(DUPLICATE))).toBe(
      'La lista tenía títulos repetidos. Se ha actualizado.',
    )
  })

  it('points out a missing household', () => {
    expect(describeReorderError(new Error(NO_HOUSEHOLD))).toBe(
      'Necesitas pertenecer a un hogar para ordenar la lista del hogar.',
    )
  })

  it('points out an expired session', () => {
    expect(describeReorderError(new Error(NO_SESSION))).toBe(
      'Tu sesión ha caducado. Vuelve a iniciar sesión.',
    )
  })

  it('falls back to a generic message that still confirms the refresh', () => {
    const fallback =
      'No se ha podido guardar el nuevo orden. Se ha actualizado.'
    expect(describeReorderError(new Error('boom'))).toBe(fallback)
    expect(describeReorderError({ code: '42501' })).toBe(fallback)
    expect(describeReorderError(undefined)).toBe(fallback)
    expect(describeReorderError(null)).toBe(fallback)
  })

  it('accepts a plain string error', () => {
    expect(describeReorderError(NOT_PENDING)).toBe(
      'Uno de los títulos ya no está pendiente. Se ha actualizado.',
    )
  })
})
