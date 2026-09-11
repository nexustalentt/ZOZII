import type { AuthRegisterResult, AuthValidateResult, PlanRequestResult } from '../types/zozii'

// Thin renderer wrapper around the main-process Supabase bridge. All network
// access happens in the Electron main process (which holds the secret key and
// the persisted encrypted credentials); this module only forwards to window.zozii.

export type AccessState =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'BLOCKED'
  | 'NOT_FOUND'

export async function backendLogin(
  username: string,
  password: string,
): Promise<AuthValidateResult> {
  if (!window.zozii?.authLogin) {
    return { status: 'NOT_FOUND' }
  }
  return window.zozii.authLogin(username, password)
}

export async function backendRevalidate(): Promise<AuthValidateResult> {
  if (!window.zozii?.authRevalidate) {
    return { status: 'NOT_FOUND' }
  }
  return window.zozii.authRevalidate()
}

export async function backendHasSession(): Promise<boolean> {
  if (!window.zozii?.authHasSession) return false
  return window.zozii.authHasSession()
}

export async function backendRegister(
  username: string,
  password: string,
  name: string,
  email: string,
): Promise<AuthRegisterResult> {
  if (!window.zozii?.authRegister) {
    return { ok: false, error: 'Backend bridge is unavailable.' }
  }
  return window.zozii.authRegister(username, password, name, email)
}

export async function backendLogout(): Promise<void> {
  await window.zozii?.authLogout()
}

export async function backendUsageStart(): Promise<AuthValidateResult> {
  if (!window.zozii?.usageStart) {
    return { status: 'NOT_FOUND' }
  }
  return window.zozii.usageStart()
}

export async function backendUsageStop(): Promise<AuthValidateResult> {
  if (!window.zozii?.usageStop) {
    return { status: 'NOT_FOUND' }
  }
  return window.zozii.usageStop()
}

export async function backendUsageHeartbeat(): Promise<AuthValidateResult> {
  if (!window.zozii?.usageHeartbeat) {
    return { status: 'NOT_FOUND' }
  }
  return window.zozii.usageHeartbeat()
}

export async function backendSendPlanRequest(minutes: number): Promise<PlanRequestResult> {
  if (!window.zozii?.planRequest) {
    return { ok: false, error: 'Backend bridge is unavailable.' }
  }
  return window.zozii.planRequest(minutes)
}

export function validateErrorMessage(state: AccessState): string {
  switch (state) {
    case 'ACTIVE':
      return ''
    case 'EXPIRED':
      return 'Your access has expired.'
    case 'INACTIVE':
      return 'Your access has not been granted yet.'
    case 'SUSPENDED':
      return 'Your account has been temporarily suspended.'
    case 'BLOCKED':
      return 'Your account has been blocked.'
    case 'NOT_FOUND':
      return 'Invalid username or password. Please register.'
    default:
      return ''
  }
}
