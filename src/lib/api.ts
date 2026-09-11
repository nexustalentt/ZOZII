import { supabase, adminKey } from './supabase'
import type {
  AccessHistoryEntry,
  AccessStatus,
  ApiResult,
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