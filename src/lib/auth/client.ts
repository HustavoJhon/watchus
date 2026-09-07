import type { AuthState } from './state'
import { initialAuthState } from './state'
import { supabase } from '@/lib/supabase'

let currentState: AuthState = initialAuthState
const handlers = new Set<(state: AuthState) => void>()

function emit(state: AuthState) {
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

  if (error || data.session === null) {
    emit(initialAuthState)
  } else {
    emit({
      status: 'authenticated',
      user: data.session.user,
      session: data.session,
    })
  }

  return currentState
}

export interface AuthListener {
  unsubscribe: () => void
  dispose: () => void
}

/**
 * Registers an auth state listener. The provided callback receives the
 * current snapshot immediately (no race with the initial load) and every
 * future change (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED).
 */
export function subscribeToAuth(
  onAuthStateChange: (state: AuthState) => void,
): AuthListener {
  handlers.add(onAuthStateChange)
  onAuthStateChange(currentState)

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    emit(
      session !== null
        ? { status: 'authenticated', user: session.user, session }
        : initialAuthState,
    )
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
