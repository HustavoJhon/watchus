import { describe, expect, it } from 'vitest'
import { isMissingColumnError, isMissingTableError } from '@/lib/db-errors'

describe('isMissingTableError', () => {
  it('recognizes a PostgREST schema-cache miss', () => {
    expect(
      isMissingTableError(
        {
          code: 'PGRST205',
          message:
            "Could not find the table 'public.personal_watchlist_order' in the schema cache",
        },
        'personal_watchlist_order',
      ),
    ).toBe(true)
  })

  it('recognizes a raw postgres undefined-table error', () => {
    expect(
      isMissingTableError(
        { code: '42P01', message: 'relation "episode_ratings" does not exist' },
        'episode_ratings',
      ),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(
      isMissingTableError({
        code: '42501',
        message: 'permission denied for table personal_watchlist_order',
      }),
    ).toBe(false)
    expect(isMissingTableError(null)).toBe(false)
    expect(isMissingTableError(new Error('offline'))).toBe(false)
  })
})

describe('isMissingColumnError', () => {
  it('recognizes a missing column from postgres', () => {
    expect(
      isMissingColumnError(
        {
          code: '42703',
          message: 'column user_title_state.watch_scope does not exist',
        },
        'watch_scope',
      ),
    ).toBe(true)
  })

  it('recognizes a PostgREST schema-cache miss for a column', () => {
    expect(
      isMissingColumnError(
        {
          code: 'PGRST204',
          message:
            "Could not find the 'watch_scope' column of 'user_title_state' in the schema cache",
        },
        'watch_scope',
      ),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(
      isMissingColumnError({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      }),
    ).toBe(false)
  })
})
