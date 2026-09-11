import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const adminKey = (import.meta.env.VITE_ADMIN_KEY as string | undefined) ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in website/.env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
