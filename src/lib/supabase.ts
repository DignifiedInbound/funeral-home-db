import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

export function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase env vars not set')
    _supabase = createClient(url, key)
  }
  return _supabase
}

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase env vars not set')
    _supabaseAdmin = createClient(url, key)
  }
  return _supabaseAdmin
}

// Keep named exports for convenience — lazily initialized
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_, prop) => (getSupabase() as unknown as Record<string, unknown>)[prop as string]
})
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (_, prop) => (getSupabaseAdmin() as unknown as Record<string, unknown>)[prop as string]
})
