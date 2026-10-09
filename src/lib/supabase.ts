import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_SUPABASE_URL = 'https://usdesrkwivnsjgjaobyf.supabase.co'
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_Kq7lHYDOsXMbAaZbLHYssA_-VdIKuFk'

export function getCustomSupabaseUrl(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('zozii_supabase_url')
}

export function getCustomSupabaseAnonKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('zozii_supabase_anon_key')
}

export function setCustomSupabaseConfig(url: string, key: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('zozii_supabase_url', url.trim())
  localStorage.setItem('zozii_supabase_anon_key', key.trim())
  clientInstance = null
  clientConfigKey = ''
}

export function clearCustomSupabaseConfig(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('zozii_supabase_url')
  localStorage.removeItem('zozii_supabase_anon_key')
  clientInstance = null
  clientConfigKey = ''
}

export function getActiveSupabaseConfig(): { url: string; key: string; isCustom: boolean } {
  const customUrl = getCustomSupabaseUrl()
  const customKey = getCustomSupabaseAnonKey()
  if (customUrl && customKey) {
    return { url: customUrl, key: customKey, isCustom: true }
  }
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  return {
    url: envUrl || DEFAULT_SUPABASE_URL,
    key: envKey || DEFAULT_SUPABASE_ANON_KEY,
    isCustom: false,
  }
}

let clientInstance: SupabaseClient | null = null
let clientConfigKey = ''

export function getSupabaseClient(): SupabaseClient {
  const config = getActiveSupabaseConfig()
  const key = `${config.url}::${config.key}`
  if (!clientInstance || clientConfigKey !== key) {
    clientConfigKey = key
    clientInstance = createClient(config.url, config.key)
  }
  return clientInstance
}

export const adminKey = (import.meta.env.VITE_ADMIN_KEY as string | undefined)?.trim() ?? ''

export const isSupabaseConfigured = true

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient()
    const val = (client as unknown as Record<string, unknown>)[prop as string]
    return typeof val === 'function' ? val.bind(client) : val
  },
})


