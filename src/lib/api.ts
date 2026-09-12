import { supabase, adminKey, isSupabaseConfigured } from './supabase'
import type {
  AccessHistoryEntry,
  AccessStatus,
  ApiResult,
  AppRelease,
  AppUser,
  PlanRequest,
  UserDetail,
  ValidateResult,
} from './types'

// All admin RPCs return a jsonb payload. The `data` from supabase.rpc is that
// parsed payload (object or array). We normalize into a friendly shape.
async function call(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null }> {
  if (!isSupabaseConfigured) {
    return {
      data: null,
      error:
        'Supabase database is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel environment variables.',
    }
  }
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { data: null, error: error.message }
  return { data, error: null }
}

/**
 * Normalize a single admin RPC result object like { ok:true, user:..., history:... }
 * or { error:"..." }. Used for object-returning RPCs.
 */
function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return {}
}

// ---------------------------------------------------------------- Admin read

export async function fetchUsers(): Promise<AppUser[]> {
  const { data, error } = await call('admin_get_users', { p_key: adminKey })
  if (error) throw new Error(error)
  if (Array.isArray(data)) return (data as unknown as AppUser[]).map(normalizeUser)
  const obj = asObject(data)
  if (obj.error) throw new Error(String(obj.error))
  // Fallback: if the jsonb got wrapped as a single-key array spread, recover.
  const keys = Object.keys(obj)
  const nested = keys.find((k) => Array.isArray(obj[k]))
  if (nested) return (obj[nested] as unknown as AppUser[]).map(normalizeUser)
  return []
}

export async function fetchUserDetail(id: string): Promise<UserDetail> {
  const { data, error } = await call('admin_get_user', { p_id: id, p_key: adminKey })
  if (error) throw new Error(error)
  const obj = asObject(data)
  if (obj.error) throw new Error(String(obj.error))
  // The RPC returns a SINGLE jsonb object: { ok, user:{...}, history:[...] }.
  const userRaw = obj.user
  if (!userRaw) throw new Error('User not found')
  let historyRaw = obj.history
  // Fallback for spread-wrap cases.
  if (!historyRaw) {
    const nested = Object.keys(obj).find((k) => Array.isArray(obj[k]) || (obj[k] && typeof obj[k] === 'object' && 'user' in (obj[k] as object)))
    if (nested) {
      const nestedObj = obj[nested] as Record<string, unknown>
      historyRaw = nestedObj?.history ?? []
    }
  }
  return {
    user: normalizeUser(userRaw as AppUser),
    history: (Array.isArray(historyRaw) ? historyRaw : []).map((h) => ({
      date: (h as AccessHistoryEntry).date,
      action: (h as AccessHistoryEntry).action,
      detail: (h as AccessHistoryEntry).detail,
    })),
  }
}

function normalizeUser(u: AppUser): AppUser {
  return {
    ...u,
    device_info: u.device_info ?? null,
  }
}

// ------------------------------------------------------------- Admin actions

async function actionCall(
  fn: string,
  args: Record<string, unknown>,
): Promise<ApiResult> {
  const { data, error } = await call(fn, args)
  if (error) return { ok: false, error }
  const obj = asObject(data)
  if (obj.error) return { ok: false, error: String(obj.error) }
  return { ok: obj.ok !== false, ...obj, error: undefined }
}

export async function setStatus(
  id: string,
  status: AccessStatus,
  action: string,
  detail?: string,
): Promise<ApiResult> {
  return actionCall('admin_set_status', {
    p_id: id,
    p_status: status,
    p_action: action,
    p_detail: detail ?? null,
    p_key: adminKey,
  })
}

export function activateUser(id: string): Promise<ApiResult> {
  return setStatus(id, 'ACTIVE', 'activated', 'Manually activated')
}

export function deactivateUser(id: string): Promise<ApiResult> {
  return setStatus(id, 'INACTIVE', 'deactivated', 'Manually deactivated')
}

export function suspendUser(id: string): Promise<ApiResult> {
  return setStatus(id, 'SUSPENDED', 'suspended', 'Account suspended')
}

export function blockUser(id: string): Promise<ApiResult> {
  return setStatus(id, 'BLOCKED', 'blocked', 'Account blocked')
}

export async function setDuration(
  id: string,
  minutes: number | null,
  customExpiry: string | null,
): Promise<ApiResult> {
  return actionCall('admin_set_duration', {
    p_id: id,
    p_minutes: minutes,
    p_custom_expiry: customExpiry,
    p_key: adminKey,
  })
}

export async function resetAccess(
  id: string,
  days: number | null,
  customExpiry: string | null,
): Promise<ApiResult> {
  return actionCall('admin_reset_access', {
    p_id: id,
    p_days: days,
    p_custom_expiry: customExpiry,
    p_key: adminKey,
  })
}

export async function extendAccess(
  id: string,
  days: number,
  hours: number,
  minutes: number,
): Promise<ApiResult> {
  return actionCall('admin_extend_access', {
    p_id: id,
    p_days: days,
    p_hours: hours,
    p_minutes: minutes,
    p_key: adminKey,
  })
}

export function resetDevice(id: string): Promise<ApiResult> {
  return actionCall('admin_reset_device', { p_id: id, p_key: adminKey })
}

export async function fetchPlanRequests(): Promise<PlanRequest[]> {
  const { data, error } = await call('admin_get_requests', { p_key: adminKey })
  if (error) throw new Error(error)
  if (Array.isArray(data)) return (data as unknown as PlanRequest[])
  const obj = asObject(data)
  if (obj.error) throw new Error(String(obj.error))
  const keys = Object.keys(obj)
  const nested = keys.find((k) => Array.isArray(obj[k]))
  if (nested) return (obj[nested] as unknown as PlanRequest[])
  return []
}

export function dismissPlanRequest(id: string): Promise<ApiResult> {
  return actionCall('admin_set_plan_request', {
    p_id: id,
    p_status: 'DENIED',
    p_key: adminKey,
  })
}

export function deleteUser(id: string): Promise<ApiResult> {
  return actionCall('admin_delete_user', { p_id: id, p_key: adminKey })
}

// ---------------------------------------------------------------- EXE calls

export async function exeValidateAccess(
  username: string,
  password: string,
): Promise<ValidateResult> {
  const { data, error } = await supabase.rpc('validate_access', {
    p_username: username,
    p_password: password,
    p_device: null,
  })
  if (error || !data) return { status: 'NOT_FOUND' }
  const res = data as ValidateResult
  return {
    status: res.status,
    access_expiry_time: res.access_expiry_time,
    access_start_time: res.access_start_time,
    user_id: res.user_id,
    name: res.name,
  }
}

export async function exeRegisterUser(
  username: string,
  password: string,
  name: string,
  email: string,
): Promise<ApiResult> {
  return actionCall('register_user', {
    p_username: username,
    p_password: password,
    p_name: name,
    p_email: email,
    p_device: null,
  })
}

// ------------------------------------------------------------ App Releases

const STORAGE_BUCKET = 'releases'
const LOCAL_STORAGE_KEY = 'zozii_active_release'

export const DEFAULT_RELEASE: AppRelease = {
  version: '1.09.01',
  filename: 'DTDC.Service.Setup.exe',
  download_url:
    'https://github.com/nexustalentt/ZOZII/releases/download/v1.09.01/DTDC.Service.Setup.exe',
  file_size_bytes: 95525483,
  has_release: true,
}

export async function fetchActiveRelease(): Promise<AppRelease> {
  // 1. Try RPC get_active_release
  try {
    const { data, error } = await supabase.rpc('get_active_release')
    if (!error && data && typeof data === 'object') {
      const rec = data as Record<string, unknown>
      if (rec.ok && rec.download_url) {
        const release: AppRelease = {
          id: rec.id as string | undefined,
          version: (rec.version as string) || '1.09.01',
          filename: (rec.filename as string) || 'DTDC.Service.Setup.exe',
          file_size_bytes: rec.file_size_bytes ? Number(rec.file_size_bytes) : null,
          download_url: rec.download_url as string,
          release_notes: (rec.release_notes as string) || null,
          updated_at: (rec.updated_at as string) || null,
          has_release: true,
        }
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(release))
        } catch {}
        return release
      }
    }
  } catch {
    // RPC may not exist yet
  }

  // 2. Direct table query fallback
  try {
    const { data } = await supabase
      .from('app_releases')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data && data.download_url) {
      const release: AppRelease = {
        id: data.id,
        version: data.version || '1.09.01',
        filename: data.filename || 'DTDC.Service.Setup.exe',
        file_size_bytes: data.file_size_bytes ? Number(data.file_size_bytes) : null,
        download_url: data.download_url,
        release_notes: data.release_notes || null,
        updated_at: data.updated_at || null,
        has_release: true,
      }
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(release))
      } catch {}
      return release
    }
  } catch {
    // Ignore table query errors
  }

  // 3. Fallback to localStorage if previously saved and valid
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (
        parsed?.download_url &&
        typeof parsed.download_url === 'string' &&
        parsed.download_url.startsWith('http') &&
        parsed.download_url !== '/DTDC Service Setup.exe' &&
        parsed.version !== '0.1.0'
      ) {
        return parsed
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY)
      }
    }
  } catch {
    // Ignore JSON errors
  }

  // 4. Default bundled installer
  return DEFAULT_RELEASE
}

export async function uploadReleaseFile(
  file: File,
  version: string = '1.09.01',
  notes: string = '',
): Promise<{ ok: boolean; release?: AppRelease; error?: string }> {
  try {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `installer_${Date.now()}_${cleanName}`

    // Upload to Supabase Storage bucket 'releases'
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      return {
        ok: false,
        error: `Storage upload failed: ${uploadError.message}. If the file exceeds Supabase free tier size limit, you can use the External Download URL option below.`,
      }
    }

    // Retrieve public URL
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
    const publicUrl = urlData.publicUrl

    return await setActiveRelease({
      version,
      filename: file.name,
      file_size_bytes: file.size,
      download_url: publicUrl,
      release_notes: notes || null,
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown upload error occurred',
    }
  }
}

export async function setActiveRelease(
  release: Partial<AppRelease> & { download_url: string },
): Promise<{ ok: boolean; release?: AppRelease; error?: string }> {
  const finalRelease: AppRelease = {
    version: release.version?.trim() || '1.09.01',
    filename: release.filename?.trim() || 'DTDC.Service.Setup.exe',
    file_size_bytes: release.file_size_bytes ?? null,
    download_url: release.download_url.trim(),
    release_notes: release.release_notes || null,
    updated_at: new Date().toISOString(),
    is_active: true,
    has_release: true,
  }

  // 1. Try RPC
  try {
    const { data, error } = await supabase.rpc('admin_set_active_release', {
      p_download_url: finalRelease.download_url,
      p_filename: finalRelease.filename,
      p_file_size_bytes: finalRelease.file_size_bytes,
      p_version: finalRelease.version,
      p_release_notes: finalRelease.release_notes,
      p_key: adminKey,
    })
    if (!error && (data as Record<string, unknown>)?.ok) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(finalRelease))
      } catch {}
      return { ok: true, release: finalRelease }
    }
  } catch {
    // Fall back to direct table update
  }

  // 2. Direct table update fallback
  try {
    await supabase.from('app_releases').update({ is_active: false }).eq('is_active', true)
    const { data: inserted, error: insertError } = await supabase
      .from('app_releases')
      .insert({
        version: finalRelease.version,
        filename: finalRelease.filename,
        file_size_bytes: finalRelease.file_size_bytes,
        download_url: finalRelease.download_url,
        release_notes: finalRelease.release_notes,
        is_active: true,
      })
      .select()
      .single()

    if (!insertError && inserted) {
      finalRelease.id = inserted.id
    }
  } catch {
    // Ignore table missing errors
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(finalRelease))
  } catch {}
  return { ok: true, release: finalRelease }
}

export function resetToBundledRelease(): AppRelease {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  } catch {}
  void (async () => {
    try {
      await supabase.from('app_releases').update({ is_active: false }).eq('is_active', true)
    } catch {}
  })()
  return DEFAULT_RELEASE
}