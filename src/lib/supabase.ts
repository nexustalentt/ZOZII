import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export const adminKey = (import.meta.env.VITE_ADMIN_KEY as string | undefined)?.trim() ?? ''

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl.startsWith('http') &&
  !rawUrl.includes('your-project-ref')
)

if (!isSupabaseConfigured) {
  console.warn(
    '[Zozii] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not configured. Admin functions requiring backend database will be disabled until environment variables are configured in Vercel.',
  )
}

// Fallback dummy client if credentials are not configured yet, preventing top-level crash on launch
const safeUrl = isSupabaseConfigured ? rawUrl : 'https://placeholder-project.supabase.co'
const safeKey = isSupabaseConfigured ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder'

export const supabase: SupabaseClient = createClient(safeUrl, safeKey)

