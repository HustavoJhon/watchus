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
 * React binding for the auth store: re-renders the component whenever the
 * auth state changes (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / initial).
 */
export function useAuth() {
  return useSyncExternalStore((onStoreChange) => {
    const listener = subscribeToAuth(() => onStoreChange())
    return listener.unsubscribe
  }, getAuthState)
}

/**
 * Resolves the initial session before rendering protected routes.
 * Safe to await from `beforeLoad`.
 */
export async function ensureAuthLoaded() {
  await loadInitialAuth()
  return getAuthState()
}
