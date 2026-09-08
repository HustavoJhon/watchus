import { useSyncExternalStore } from 'react'
import {
  getAuthState,
  subscribeToAuth,
  loadInitialAuth,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  sendPasswordResetEmail,
  updateUserPassword,
} from './client'

export * from './state'
export * from './errors'
export {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  sendPasswordResetEmail,
  updateUserPassword,
}

/**
 * Stable subscribe adapter for `useSyncExternalStore`. Lives at module level
 * so its identity never changes across renders: React only (re-)subscribes on
 * mount/unmount and never on re-render. Each subscription owns one Supabase
 * Auth listener and releases it (including the GoTrue subscription) via
 * `dispose` on cleanup.
 */
function subscribeAuth(onStoreChange: () => void) {
  return subscribeToAuth(() => onStoreChange()).dispose
}

/**
 * React binding for the auth store: re-renders the component whenever the
 * auth state changes (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / initial).
 */
export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthState)
}

/**
 * Resolves the initial session before rendering protected routes.
 * Safe to await from `beforeLoad`.
 */
export async function ensureAuthLoaded() {
  await loadInitialAuth()
  return getAuthState()
}
