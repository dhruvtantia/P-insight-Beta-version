/**
 * Supabase client — browser-side auth only
 * ------------------------------------------
 * Single shared client, used exclusively for Supabase Auth (sign up / sign
 * in / session / sign out). P-Insight does not use Supabase's database or
 * storage from the frontend — portfolio data still flows entirely through
 * the FastAPI backend (see services/api.ts), which independently verifies
 * the JWT this client produces (see backend/app/core/auth.py).
 *
 * Placeholder-safe by design: until a real Supabase project is provisioned
 * (Stage 0.2 in MASTER_ACTION_PLAN.md), NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are unset, and this file falls back to
 * inert placeholder values so the client still constructs successfully and
 * the app builds/runs normally. Sign-in/sign-up calls are short-circuited
 * with a clear error in that state (see AuthContext) rather than making a
 * network call against a fake project — the backend's AUTH_ENABLED=False
 * default already handles unauthenticated requests, so nothing breaks.
 */

import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js'

const RAW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const RAW_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** True once real Supabase project values are set in .env.local. */
export const isSupabaseConfigured = Boolean(RAW_URL && RAW_ANON_KEY)

// Syntactically valid placeholders so createClient() never throws at
// import time, even before a real project exists.
const SUPABASE_URL = RAW_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = RAW_ANON_KEY || 'placeholder-anon-key'

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * Current access token, if any. Used by services/api.ts to attach
 * `Authorization: Bearer <token>` to every backend request. Returns null
 * in placeholder/legacy mode (no session) — the backend treats a missing
 * token as unscoped/legacy when AUTH_ENABLED=False.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export type { Session, User }
