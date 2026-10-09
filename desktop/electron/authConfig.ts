import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// EXE backend connection config.
//
// The EXE calls Supabase exclusively through SECURITY DEFINER RPCs that are
// granted EXECUTE to the anon role (see supabase/migrations/001 and 004).
// Direct row access is denied to anon by RLS, so the EXE only needs the
// PUBLIC publishable (anon) key — no secret/service key is ever shipped
// in the binary. Values below are overridable via environment variables.

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {}
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          result[key] = val
        }
      }
    }
  } catch {
    // best effort
  }
  return result
}

function resolveEnvConfig(): { url: string; key: string } {
  const candidateFiles: string[] = []
  try {
    candidateFiles.push(path.join(process.cwd(), '.env'))
    candidateFiles.push(path.join(process.cwd(), 'desktop', '.env'))
    if (process.execPath) {
      candidateFiles.push(path.join(path.dirname(process.execPath), '.env'))
    }
    if (app?.getPath) {
      candidateFiles.push(path.join(app.getPath('userData'), '.env'))
    }
  } catch {
    // best effort
  }

  let envUrl = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL']
  let envKey = process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY']

  for (const file of candidateFiles) {
    if (!envUrl || !envKey) {
      const parsed = parseEnvFile(file)
      if (!envUrl && (parsed['SUPABASE_URL'] || parsed['VITE_SUPABASE_URL'])) {
        envUrl = parsed['SUPABASE_URL'] || parsed['VITE_SUPABASE_URL']
      }
      if (!envKey && (parsed['SUPABASE_ANON_KEY'] || parsed['VITE_SUPABASE_ANON_KEY'])) {
        envKey = parsed['SUPABASE_ANON_KEY'] || parsed['VITE_SUPABASE_ANON_KEY']
      }
    }
  }

  return {
    url: envUrl || 'https://usdesrkwivnsjgjaobyf.supabase.co',
    key: envKey || 'sb_publishable_Kq7lHYDOsXMbAaZbLHYssA_-VdIKuFk',
  }
}

const config = resolveEnvConfig()

export const SUPABASE_URL = config.url
export const SUPABASE_ANON_KEY = config.key