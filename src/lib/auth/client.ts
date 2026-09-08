import type { Session } from '@supabase/supabase-js'
import type { AuthState } from './state'
import { initialAuthState } from './state'
import { supabase } from '@/lib/supabase'

let currentState: AuthState = initialAuthState
const handlers = new Set<(state: AuthState) => void>()
/**
 * Cached wrapper for the currently authenticated session. Kept per session
 * reference so that repeated auth events with the same session produce the
 * exact same AuthState object (referential stability for the store snapshot).
 */
let sessionState: AuthState | null = null

function authStateFor(session: Session | null): AuthState {
  if (session === null) return initialAuthState
  if (sessionState === null || sessionState.session !== session) {
    sessionState = { status: 'authenticated', user: session.user, session }
  }
  return sessionState
}

function emit(state: AuthState) {
  if (state === currentState) return
  currentState = state
  for (const handler of handlers) {
    handler(state)
  }
}

export function getAuthState(): AuthState {
  return currentState
}

/**
 * Loads the current session once at startup. Updates the shared auth state
 * and returns it so callers can await the initial check.
 */
export async function loadInitialAuth(): Promise<AuthState> {
  const { data, error } = await supabase.auth.getSession()

  emit(authStateFor(error || data.session === null ? null : data.session))

  return currentState
}

export interface AuthListener {
  unsubscribe: () => void
  dispose: () => void
}

/**
 * Registers an auth state listener. The callback is invoked on every future
 * auth change (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / INITIAL_SESSION)
 * that actually changes the state. `dispose` releases the listener AND the
 * underlying Supabase Auth subscription; `unsubscribe` only detaches this
 * handler.
 *
 * The current state is NOT delivered synchronously here: `useSyncExternalStore`
 * re-reads the snapshot itself after subscribing, so notifying inside
 * `subscribe` is both unnecessary and a source of render loops.
 */
export function subscribeToAuth(
  onAuthStateChange: (state: AuthState) => void,
): AuthListener {
  handlers.add(onAuthStateChange)

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    emit(authStateFor(session))
  })

  return {
    unsubscribe: () => {
      handlers.delete(onAuthStateChange)
    },
    dispose: () => {
      data.subscription.unsubscribe()
      handlers.delete(onAuthStateChange)
    },
  }
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  })
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function sendPasswordResetEmail(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password?recovery=true`,
  })
}

export async function updateUserPassword(password: string) {
  return supabase.auth.updateUser({ password })
}
