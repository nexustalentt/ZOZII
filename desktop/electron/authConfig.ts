// EXE backend connection config.
//
// The EXE calls Supabase exclusively through SECURITY DEFINER RPCs that are
// granted EXECUTE to the anon role (see supabase/migrations/001 and 004).
// Direct row access is denied to anon by RLS, so the EXE only needs the
// PUBLIC publishable (anon) key — no secret/service key is ever shipped
// in the binary. Values below are overridable via environment variables.

export const SUPABASE_URL =
  process.env['SUPABASE_URL'] ?? 'https://usdesrkwivnsjgjaobyf.supabase.co'

// Public publishable (anon) key — safe to embed. Override with the
// SUPABASE_ANON_KEY env var (e.g. from a gitignored .env) when needed.
export const SUPABASE_ANON_KEY =
  process.env['SUPABASE_ANON_KEY'] ?? 'sb_publishable_Kq7lHYDOsXMbAaZbLHYssA_-VdIKuFk'