import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { AuthState } from '@/lib/auth/state'

type GoTrueCallback = (event: string, session: Session | null) => void

/**
 * Faithful fake of `supabase.auth`: `onAuthStateChange(cb)` registers the
 * callback and fires `INITIAL_SESSION` on a microtask (auth-js behavior),
 * and every registration returns a subscription whose `unsubscribe` detaches
 * it. The test can swap `state.currentSession` and replay GoTrue events.
 */
const supabaseMock = vi.hoisted(() => {
  const state = {
    currentSession: null as Session | null,
    registrations: [] as GoTrueCallback[],
  }
  const getSession = vi.fn(
    async (): Promise<{
      data: { session: Session | null }
      error: Error | null
    }> => ({
      data: { session: state.currentSession },
      error: null,
    }),
  )
  const unsubscribe = vi.fn()
  const onAuthStateChange = vi.fn((cb: GoTrueCallback) => {
    state.registrations.push(cb)
    queueMicrotask(() => cb('INITIAL_SESSION', state.currentSession))
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            unsubscribe()
            state.registrations = state.registrations.filter((c) => c !== cb)
          },
        },
      },
    }
  })
  return { state, getSession, onAuthStateChange, unsubscribe }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: supabaseMock.getSession,
      onAuthStateChange: supabaseMock.onAuthStateChange,
    },
  },
}))

import type { AuthListener } from '@/lib/auth/client'

let client: typeof import('@/lib/auth/client')

function makeSession(id: string): Session {
  return {
    access_token: `token-${id}`,
    refresh_token: `refresh-${id}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${id}@test.dev`,
      created_at: '2026-01-01T00:00:00.000Z',
      app_metadata: {},
      user_metadata: { display_name: 'Test' },
    },
  } as Session
}

/** Replays a GoTrue event through every live registration. */
function emitEvent(event: string) {
  for (const cb of supabaseMock.state.registrations) {
    cb(event, supabaseMock.state.currentSession)
  }
}

/** Drains queued microtasks (INITIAL_SESSION deliveries). */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

function listen(seen: AuthState[]): AuthListener {
  return client.subscribeToAuth((s) => seen.push(s))
}

beforeEach(async () => {
  vi.resetModules()
  supabaseMock.state.currentSession = null
  supabaseMock.state.registrations = []
  supabaseMock.getSession.mockClear()
  supabaseMock.onAuthStateChange.mockClear()
  supabaseMock.unsubscribe.mockClear()
  client = await import('@/lib/auth/client')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('auth store snapshot stability', () => {
  it('getSnapshot returns the same object while the state is unchanged', () => {
    expect(client.getAuthState()).toBe(client.getAuthState())
    expect(client.getAuthState().status).toBe('loading')
  })

  it('loadInitialAuth with a session keeps that snapshot reference stable', async () => {
    supabaseMock.state.currentSession = makeSession('u1')
    const state = await client.loadInitialAuth()
    expect(state.status).toBe('authenticated')
    await flush()
    expect(client.getAuthState()).toBe(state)

    // A later INITIAL_SESSION with the same session must not change it.
    // Replaying a notification is expected; the snapshot must not move.
    const before = client.getAuthState()
    emitEvent('INITIAL_SESSION')
    await flush()
    expect(client.getAuthState()).toBe(before)
  })

  it('a genuinely new session produces a new snapshot and notifies once', async () => {
    const seen: AuthState[] = []
    listen(seen)
    await flush()
    expect(seen).toHaveLength(0)

    supabaseMock.state.currentSession = makeSession('a')
    emitEvent('SIGNED_IN')
    expect(client.getAuthState().status).toBe('authenticated')
    expect(seen).toHaveLength(1)

    const previous = client.getAuthState()
    supabaseMock.state.currentSession = makeSession('b')
    emitEvent('SIGNED_IN')
    expect(client.getAuthState()).not.toBe(previous)
    expect(seen).toHaveLength(2)
  })

  it('loadInitialAuth with an error falls back to the initial state', async () => {
    supabaseMock.state.currentSession = makeSession('u1')
    supabaseMock.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('boom'),
    })
    const state = await client.loadInitialAuth()
    expect(state.status).toBe('loading')
    expect(client.getAuthState()).toBe(state)
  })
})

describe('auth subscription lifecycle', () => {
  it('registers one GoTrue listener and does not notify while subscribing', async () => {
    const seen: AuthState[] = []
    const listener = listen(seen)
    expect(supabaseMock.onAuthStateChange).toHaveBeenCalledTimes(1)
    expect(seen).toHaveLength(0)
    await flush() // INITIAL_SESSION lands here
    expect(seen).toHaveLength(0) // no session yet → snapshot unchanged → no delivery
    listener.dispose()
  })

  it('a subscription does not loop on repeated events with the same session', async () => {
    supabaseMock.state.currentSession = makeSession('u1')
    const seen: AuthState[] = []
    const listener = listen(seen)
    await flush()
    expect(seen).toHaveLength(1) // initial authenticated delivery

    // Replaying the same session any number of times must not notify again.
    for (let i = 0; i < 50; i++) {
      emitEvent('INITIAL_SESSION')
    }
    expect(seen).toHaveLength(1)
    listener.dispose()
  })

  it('an INITIAL_SESSION with a live session never triggers unbounded notifications', async () => {
    supabaseMock.state.currentSession = makeSession('u1')
    const seen: AuthState[] = []
    listen(seen)
    await flush()
    expect(seen).toHaveLength(1)

    // Re-subscribing (as the old identity-changing subscribe did) must be inert:
    // same snapshot ⇒ no new deliveries, no cascade.
    emitEvent('INITIAL_SESSION')
    expect(seen).toHaveLength(1)

    // A second subscription shared the same snapshot and produces nothing new.
    const seen2: AuthState[] = []
    listen(seen2)
    await flush()
    expect(seen2).toHaveLength(0)
    expect(seen).toHaveLength(1)
  })

  it('dispose detaches the handler and the Supabase subscription', async () => {
    const seen: AuthState[] = []
    const listener = listen(seen)
    listener.dispose()
    expect(supabaseMock.unsubscribe).toHaveBeenCalledTimes(1)

    supabaseMock.state.currentSession = makeSession('u1')
    emitEvent('SIGNED_IN')
    expect(seen).toHaveLength(0)
  })

  it('repeated subscribe/dispose cycles do not accumulate listeners', async () => {
    const seenA: AuthState[] = []
    for (let i = 0; i < 25; i++) {
      const listener = listen(seenA)
      listener.dispose()
    }
    expect(supabaseMock.onAuthStateChange).toHaveBeenCalledTimes(25)
    expect(supabaseMock.unsubscribe).toHaveBeenCalledTimes(25)

    const seenB: AuthState[] = []
    const live = listen(seenB)
    expect(supabaseMock.onAuthStateChange).toHaveBeenCalledTimes(26)
    expect(supabaseMock.unsubscribe).toHaveBeenCalledTimes(25)

    supabaseMock.state.currentSession = makeSession('u2')
    emitEvent('SIGNED_IN')
    expect(seenA).toHaveLength(0)
    expect(seenB).toHaveLength(1)
    live.dispose()
    expect(supabaseMock.unsubscribe).toHaveBeenCalledTimes(26)
  })
})
