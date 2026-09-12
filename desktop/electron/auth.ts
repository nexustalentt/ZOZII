import { createClient } from '@supabase/supabase-js'
import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './authConfig'

export interface AuthValidateResult {
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BLOCKED' | 'NOT_FOUND'
  access_expiry_time?: string | null
  access_start_time?: string | null
  user_id?: string | null
  name?: string | null
  plan_type?: string | null
  grant_duration_seconds?: number | null
  used_seconds?: number | null
  remaining_seconds?: number | null
}

export interface RegisterResult {
  ok: boolean
  user_id?: string
  error?: string
}

export interface PlanRequestResult {
  ok: boolean
  note?: string
  error?: string
}

export interface OtpResult {
  ok: boolean
  error?: string
}

// The EXE's Supabase client. Uses the PUBLIC publishable (anon) key — all
// access goes through SECURITY DEFINER RPCs; direct row access is denied by RLS.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------------------------------------------------------------- credential store
const CRED_FILE = 'auth-credentials.bin'

function credPath(): string {
  return path.join(appPath(), CRED_FILE)
}

function appPath(): string {
  return app.getPath('userData')
}

// Persist validated credentials in the OS keychain (safeStorage) so the EXE can
// re-validate on every launch and periodically WITHOUT storing a plaintext
// password in localStorage or the renderer.
function saveCredentials(username: string, password: string): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return
    const payload = Buffer.from(JSON.stringify({ username, password }))
    const encrypted = safeStorage.encryptString(payload.toString('utf8'))
    fs.mkdirSync(path.dirname(credPath()), { recursive: true })
    fs.writeFileSync(credPath(), encrypted)
  } catch {
    // best effort
  }
}

function readCredentials(): { username?: string; password?: string } | null {
  try {
    if (!fs.existsSync(credPath())) return null
    if (typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(fs.readFileSync(credPath()))
      return JSON.parse(decrypted)
    }
  } catch {
    // fall through
  }
  return null
}

function clearCredentials(): void {
  try {
    if (fs.existsSync(credPath())) fs.unlinkSync(credPath())
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------- OTP diagnostics
// The OTP email is sent by Supabase Auth (server-side) through the project's
// SMTP/Resend provider. Delivery failures come back as a generic 500
// "Error sending confirmation email", so we log the raw detail to a file and
// map it to an actionable message instead of showing the raw error.
function logOtpFailure(context: string, detail: unknown): void {
  try {
    const dir = path.join(appPath(), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(
      path.join(dir, 'otp.log'),
      `${new Date().toISOString()} [${context}] ${JSON.stringify(detail)}\n`,
    )
  } catch {
    // best effort
  }
}

function describeOtpRequestError(status: number | undefined, message: string): string {
  if (status === 429 || /rate limit|too many requests|exceeded/i.test(message)) {
    return 'Too many requests. Please wait a moment before requesting a new code.'
  }
  if (status === 500 || /confirmation email/i.test(message)) {
    return "We couldn't send the verification code. Check Supabase → Authentication → Email: SMTP/Resend must be enabled with a verified sender, then try again."
  }
  return message
}

// ---------------------------------------------------------------- device fingerprint
function deviceFingerprint(): Record<string, unknown> {
  return {
    pcName: os.hostname(),
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    hardwareId: computeHardwareId(),
  }
}

function computeHardwareId(): string {
  try {
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
      const addrs = ifaces[name] ?? []
      const mac = addrs.find((a) => a.family === 'IPv4' && !a.internal)?.mac
      if (mac && mac !== '00:00:00:00:00:00') {
        return simpleHash(`${os.hostname()}::${mac}`)
      }
    }
  } catch {
    // fall through
  }
  return simpleHash(os.hostname())
}

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 8)
}

// ---------------------------------------------------------------- validation
export async function validateAccess(
  username: string,
  password: string,
): Promise<AuthValidateResult> {
  const { data, error } = await supabase.rpc('validate_access', {
    p_username: username,
    p_password: password,
    p_device: deviceFingerprint(),
  })
  if (error || !data) {
    return { status: 'NOT_FOUND' }
  }
  const res = data as AuthValidateResult
  return {
    status: res.status,
    access_expiry_time: res.access_expiry_time,
    access_start_time: res.access_start_time,
    user_id: res.user_id,
    name: res.name,
    plan_type: res.plan_type ?? null,
    grant_duration_seconds:
      typeof res.grant_duration_seconds === 'number' ? res.grant_duration_seconds : null,
    used_seconds: typeof res.used_seconds === 'number' ? res.used_seconds : null,
    remaining_seconds: typeof res.remaining_seconds === 'number' ? res.remaining_seconds : null,
  }
}

// Validate and, on success, persist credentials for future automatic checks.
export async function loginAndCache(
  username: string,
  password: string,
): Promise<AuthValidateResult> {
  const result = await validateAccess(username, password)
  if (result.status === 'ACTIVE') {
    saveCredentials(username, password)
  } else if (result.status === 'NOT_FOUND') {
    clearCredentials()
  }
  return result
}

// Re-validate using the persisted credentials (startup + periodic checks).
export async function revalidateCached(): Promise<AuthValidateResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { status: 'NOT_FOUND' }
  }
  return validateAccess(creds.username, creds.password)
}

export async function hasCachedCredentials(): Promise<boolean> {
  const creds = readCredentials()
  return !!creds?.username && !!creds.password
}

// Email OTP gate used before registering. A 6-digit code is emailed to the
// address via Supabase Auth (sender configured in the project dashboard). The
// code only proves the email belongs to the user; the account itself is still
// created by register_user below.
export async function requestEmailOtp(email: string): Promise<OtpResult> {
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes('@')) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { shouldCreateUser: true },
  })
  if (error) {
    logOtpFailure('send', { email: clean, status: error.status, message: error.message })
    return { ok: false, error: describeOtpRequestError(error.status, error.message) }
  }
  return { ok: true }
}

// Verify the code the user received. On success the email's ownership is
// proven and the caller proceeds with registerUser to create the account.
export async function verifyEmailOtp(email: string, token: string): Promise<OtpResult> {
  const cleanToken = token.trim()
  if (!cleanToken) {
    return { ok: false, error: 'Enter the code that was sent to your email.' }
  }
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: cleanToken,
    type: 'email',
  })
  if (error) {
    logOtpFailure('verify', { email: email.trim().toLowerCase(), status: error.status, message: error.message })
    const invalid =
      error.status === 400 ||
      error.status === 403 ||
      error.status === 422 ||
      /expired|invalid|has expired/i.test(error.message)
    return { ok: false, error: invalid ? 'Invalid or expired code.' : error.message }
  }
  return { ok: true }
}

// Register a new user, then optionally auto-login.
export async function registerUser(
  username: string,
  password: string,
  name: string,
  email: string,
): Promise<RegisterResult> {
  const { data, error } = await supabase.rpc('register_user', {
    p_username: username,
    p_password: password,
    p_name: name,
    p_email: email,
    p_device: deviceFingerprint(),
  })
  if (error) {
    return { ok: false, error: error.message }
  }
  const res = (data ?? {}) as { ok?: boolean; error?: string; user_id?: string }
  if (res.ok === false || res.error) {
    return { ok: false, error: res.error ?? 'Registration failed' }
  }
  // Auto-login + cache for future checks.
  await loginAndCache(username, password)
  return {
    ok: true,
    user_id: res.user_id,
  }
}

// Usage-meter RPCs. These run only after a login/registration (creds cached),
// mirroring validateAccess so the result always carries status + remaining budget.
async function runUsageRpc(
  fn: 'usage_start' | 'usage_stop' | 'usage_heartbeat',
  rpcArgs: Record<string, unknown>,
): Promise<AuthValidateResult> {
  const { data, error } = await supabase.rpc(fn, rpcArgs)
  if (error || !data) {
    return { status: 'NOT_FOUND' }
  }
  const res = data as AuthValidateResult
  return {
    status: res.status,
    access_expiry_time: res.access_expiry_time,
    access_start_time: res.access_start_time,
    user_id: res.user_id,
    name: res.name,
    plan_type: res.plan_type ?? null,
    grant_duration_seconds:
      typeof res.grant_duration_seconds === 'number' ? res.grant_duration_seconds : null,
    used_seconds: typeof res.used_seconds === 'number' ? res.used_seconds : null,
    remaining_seconds: typeof res.remaining_seconds === 'number' ? res.remaining_seconds : null,
  }
}

export async function usageStart(): Promise<AuthValidateResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { status: 'NOT_FOUND' }
  }
  return runUsageRpc('usage_start', {
    p_username: creds.username,
    p_password: creds.password,
    p_device: deviceFingerprint(),
  })
}

export async function usageStop(): Promise<AuthValidateResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { status: 'NOT_FOUND' }
  }
  return runUsageRpc('usage_stop', {
    p_username: creds.username,
    p_password: creds.password,
  })
}

export async function usageHeartbeat(): Promise<AuthValidateResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { status: 'NOT_FOUND' }
  }
  return runUsageRpc('usage_heartbeat', {
    p_username: creds.username,
    p_password: creds.password,
  })
}

export async function logout(): Promise<void> {
  clearCredentials()
}

// Ask the admin for more time. The request lands in the dashboard's pending
// requests list; a grant via Set Duration / Reset / Extend marks it resolved.
export async function sendPlanRequest(minutes: number): Promise<PlanRequestResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { ok: false, error: 'Not logged in.' }
  }
  const { data, error } = await supabase.rpc('send_plan_request', {
    p_identity: creds.username,
    p_password: creds.password,
    p_minutes: minutes,
  })
  if (error) {
    return { ok: false, error: error.message }
  }
  const res = (data ?? {}) as { ok?: boolean; note?: string; error?: string }
  if (res.ok === false || res.error) {
    return { ok: false, error: res.error ?? 'Request failed' }
  }
  return { ok: true, note: res.note }
}
