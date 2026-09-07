import type { Session, User } from '@supabase/supabase-js'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthState {
  status: AuthStatus
  user: User | null
  session: Session | null
}

export const initialAuthState: AuthState = {
  status: 'loading',
  user: null,
  session: null,
}
