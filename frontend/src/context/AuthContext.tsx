/**
 * AuthContext — Supabase session provider
 * ------------------------------------------
 * Mirrors the PortfolioContext pattern: one provider mounted in AppShell,
 * consumed everywhere via useAuth().
 *
 * Placeholder-safe: when Supabase isn't configured yet (see
 * lib/supabaseClient.ts), `loading` resolves to false immediately with no
 * session, and signUp/signIn return a clear "not configured yet" error
 * instead of attempting a network call against a fake project. Nothing
 * here requires a live Supabase project to build, run, or be reviewed —
 * only to actually authenticate.
 */

'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseConfigured, type Session, type User } from '@/lib/supabaseClient'

export interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  /** False until a real Supabase project is wired in — see .env.local.example. */
  configured: boolean
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const NOT_CONFIGURED_ERROR =
  'Supabase isn’t connected yet — this form is wired but running in placeholder mode. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to go live.'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Placeholder mode — skip the session lookup entirely rather than
      // hitting a fake project URL.
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR }
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        configured: isSupabaseConfigured,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
