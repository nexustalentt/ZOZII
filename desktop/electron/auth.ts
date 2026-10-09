import { createClient } from '@supabase/supabase-js'
import { app, safeStorage } from 'electron'
import crypto from 'node:crypto'
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
const LOCAL_USERS_FILE = 'auth-local-users.json'

function credPath(): string {
  return path.join(appPath(), CRED_FILE)
}

function localUsersPath(): string {
  return path.join(appPath(), LOCAL_USERS_FILE)
}

function appPath(): string {
  return app.getPath('userData')
}

// ---------------------------------------------------------------- local trial storage
interface LocalUserRecord {
  userId: string
  username: string
  email: string
  name?: string
  passwordHash: string
  createdAt: string
  planType: 'trial' | 'paid'
  grantDurationSeconds: number
  usedSeconds: number
  lastActiveStart: number | null
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash
}

function readLocalUsers(): Record<string, LocalUserRecord> {
  try {
    const p = localUsersPath()
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (data && typeof data === 'object') return data
    }
  } catch {
    // best effort
  }
  return {}
}

function writeLocalUsers(users: Record<string, LocalUserRecord>): void {
  try {
    fs.mkdirSync(appPath(), { recursive: true })
    fs.writeFileSync(localUsersPath(), JSON.stringify(users, null, 2), 'utf8')
  } catch {
    // best effort
  }
}

function findLocalUser(identity: string): LocalUserRecord | null {
  const users = readLocalUsers()
  const clean = identity.trim().toLowerCase()
  if (!clean) return null
  for (const key of Object.keys(users)) {
    const u = users[key]
    if (
      u.email.toLowerCase() === clean ||
      u.username.toLowerCase() === clean
    ) {
      return u
    }
  }
  return null
}

export function isConnectivityError(err: unknown): boolean {
  if (!err) return false
  const msg = typeof err === 'string' ? err : (err as { message?: string }).message || String(err)
  return /TypeError|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|network/i.test(msg)
}

export function formatAuthError(err: unknown): string {
  if (!err) return 'Registration failed.'
  const msg = typeof err === 'string' ? err : (err as { message?: string }).message || String(err)
  if (isConnectivityError(msg)) {
    return 'Could not connect to authentication server. Please check your network connection.'
  }
  return msg
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

function updateLocalUsage(
  identity: string,
  action: 'start' | 'heartbeat' | 'stop',
): AuthValidateResult | null {
  const users = readLocalUsers()
  const clean = identity.trim().toLowerCase()
  let targetKey: string | null = null
  for (const key of Object.keys(users)) {
    const u = users[key]
    if (u.email.toLowerCase() === clean || u.username.toLowerCase() === clean) {
      targetKey = key
      break
    }
  }
  if (!targetKey) return null
  const u = users[targetKey]
  const now = Date.now()

  if (action === 'start') {
    u.lastActiveStart = now
  } else if (action === 'heartbeat') {
    if (u.lastActiveStart) {
      const deltaSec = Math.max(0, Math.round((now - u.lastActiveStart) / 1000))
      u.usedSeconds += deltaSec
      u.lastActiveStart = now
    } else {
      u.lastActiveStart = now
    }
  } else if (action === 'stop') {
    if (u.lastActiveStart) {
      const deltaSec = Math.max(0, Math.round((now - u.lastActiveStart) / 1000))
      u.usedSeconds += deltaSec
      u.lastActiveStart = null
    }
  }

  writeLocalUsers(users)
  const remaining = Math.max(0, u.grantDurationSeconds - u.usedSeconds)
  const status: AuthValidateResult['status'] = remaining > 0 ? 'ACTIVE' : 'EXPIRED'
  return {
    status,
    access_expiry_time: null,
    access_start_time: u.createdAt,
    user_id: u.userId,
    name: u.name ?? null,
    plan_type: u.planType,
    grant_duration_seconds: u.grantDurationSeconds,
    used_seconds: u.usedSeconds,
    remaining_seconds: remaining,
  }
}

// ---------------------------------------------------------------- validation
export async function validateAccess(
  username: string,
  password: string,
): Promise<AuthValidateResult> {
  const cleanIdent = username.trim()

  // 1. Attempt validation via remote Supabase
  try {
    const { data, error } = await supabase.rpc('validate_access', {
      p_username: cleanIdent,
      p_password: password,
      p_device: deviceFingerprint(),
    })
    if (!error && data) {
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
    // If Supabase returned a real error that is not a connectivity failure
    if (error && !isConnectivityError(error.message)) {
      return { status: 'NOT_FOUND' }
    }
  } catch (err) {
    if (!isConnectivityError(err)) {
      return { status: 'NOT_FOUND' }
    }
  }

  // 2. Check local user storage (offline / fallback mode)
  const localUser = findLocalUser(cleanIdent)
  if (localUser && verifyPassword(password, localUser.passwordHash)) {
    const remaining = Math.max(0, localUser.grantDurationSeconds - localUser.usedSeconds)
    const status: AuthValidateResult['status'] = remaining > 0 ? 'ACTIVE' : 'EXPIRED'
    return {
      status,
      access_expiry_time: null,
      access_start_time: localUser.createdAt,
      user_id: localUser.userId,
      name: localUser.name ?? null,
      plan_type: localUser.planType,
      grant_duration_seconds: localUser.grantDurationSeconds,
      used_seconds: localUser.usedSeconds,
      remaining_seconds: remaining,
    }
  }

  return { status: 'NOT_FOUND' }
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
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },
    })
    if (error) {
      logOtpFailure('send', { email: clean, status: error.status, message: error.message })
      return { ok: false, error: describeOtpRequestError(error.status, error.message) }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: formatAuthError(err) }
  }
}

// Verify the code the user received. On success the email's ownership is
// proven and the caller proceeds with registerUser to create the account.
export async function verifyEmailOtp(email: string, token: string): Promise<OtpResult> {
  const cleanToken = token.trim()
  if (!cleanToken) {
    return { ok: false, error: 'Enter the code that was sent to your email.' }
  }
  try {
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
  } catch (err) {
    return { ok: false, error: formatAuthError(err) }
  }
}

// Register a new user, then auto-login.
export async function registerUser(
  username: string,
  password: string,
  name: string,
  email: string,
): Promise<RegisterResult> {
  const cleanEmail = email.trim().toLowerCase()
  const cleanUser = username.trim() || cleanEmail
  const cleanName = name.trim()

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  if (!password || password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' }
  }

  // 1. Try remote Supabase registration
  try {
    const { data, error } = await supabase.rpc('register_user', {
      p_username: cleanUser,
      p_password: password,
      p_name: cleanName,
      p_email: cleanEmail,
      p_device: deviceFingerprint(),
    })

    if (!error) {
      const res = (data ?? {}) as { ok?: boolean; error?: string; user_id?: string }
      if (res.ok !== false && !res.error) {
        // Auto-login + cache for future checks.
        await loginAndCache(cleanUser, password)
        return {
          ok: true,
          user_id: res.user_id,
        }
      }
      if (res.error) {
        return { ok: false, error: res.error }
      }
    } else {
      if (!isConnectivityError(error.message)) {
        return { ok: false, error: formatAuthError(error.message) }
      }
      // If it IS a connectivity error, fall through to local trial registration
    }
  } catch (err) {
    if (!isConnectivityError(err)) {
      return { ok: false, error: formatAuthError(err) }
    }
    // Fall through to local trial registration
  }

  // 2. Fall back to local trial registration if remote database is unreachable
  const existing = findLocalUser(cleanEmail) || findLocalUser(cleanUser)
  if (existing) {
    return { ok: false, error: 'This email is already registered.' }
  }

  const userId = 'U-' + Math.random().toString(36).substring(2, 8).toUpperCase()
  const users = readLocalUsers()
  const localRecord: LocalUserRecord = {
    userId,
    username: cleanUser,
    email: cleanEmail,
    name: cleanName,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    planType: 'trial',
    grantDurationSeconds: 600, // 10 minutes free trial
    usedSeconds: 0,
    lastActiveStart: null,
  }

  users[cleanEmail] = localRecord
  if (cleanUser !== cleanEmail) {
    users[cleanUser] = localRecord
  }
  writeLocalUsers(users)
  saveCredentials(cleanUser, password)

  return {
    ok: true,
    user_id: userId,
  }
}

// Usage-meter RPCs. These run only after a login/registration (creds cached),
// mirroring validateAccess so the result always carries status + remaining budget.
async function runUsageRpc(
  fn: 'usage_start' | 'usage_stop' | 'usage_heartbeat',
  rpcArgs: Record<string, unknown>,
  identity: string,
): Promise<AuthValidateResult> {
  try {
    const { data, error } = await supabase.rpc(fn, rpcArgs)
    if (!error && data) {
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
  } catch {
    // fall through to local usage
  }

  const action = fn === 'usage_start' ? 'start' : fn === 'usage_stop' ? 'stop' : 'heartbeat'
  const localRes = updateLocalUsage(identity, action)
  if (localRes) return localRes

  return { status: 'NOT_FOUND' }
}

export async function usageStart(): Promise<AuthValidateResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { status: 'NOT_FOUND' }
  }
  return runUsageRpc(
    'usage_start',
    {
      p_username: creds.username,
      p_password: creds.password,
      p_device: deviceFingerprint(),
    },
    creds.username,
  )
}

export async function usageStop(): Promise<AuthValidateResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { status: 'NOT_FOUND' }
  }
  return runUsageRpc(
    'usage_stop',
    {
      p_username: creds.username,
      p_password: creds.password,
    },
    creds.username,
  )
}

export async function usageHeartbeat(): Promise<AuthValidateResult> {
  const creds = readCredentials()
  if (!creds?.username || !creds.password) {
    return { status: 'NOT_FOUND' }
  }
  return runUsageRpc(
    'usage_heartbeat',
    {
      p_username: creds.username,
      p_password: creds.password,
    },
    creds.username,
  )
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
  try {
    const { data, error } = await supabase.rpc('send_plan_request', {
      p_identity: creds.username,
      p_password: creds.password,
      p_minutes: minutes,
    })
    if (!error) {
      const res = (data ?? {}) as { ok?: boolean; note?: string; error?: string }
      if (res.ok !== false && !res.error) {
        return { ok: true, note: res.note }
      }
      if (res.error) {
        return { ok: false, error: res.error }
      }
    }
  } catch {
    // fall through
  }

  const localUser = findLocalUser(creds.username)
  if (localUser) {
    return { ok: true, note: 'Plan request saved locally.' }
  }

  return { ok: true, note: 'Request noted.' }
}

