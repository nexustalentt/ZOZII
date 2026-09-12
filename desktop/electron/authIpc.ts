import { ipcMain } from 'electron'
import {
  hasCachedCredentials,
  loginAndCache,
  logout,
  revalidateCached,
  registerUser,
  requestEmailOtp,
  sendPlanRequest,
  usageHeartbeat,
  usageStart,
  usageStop,
  verifyEmailOtp,
  type AuthValidateResult,
  type OtpResult,
  type PlanRequestResult,
  type RegisterResult,
} from './auth'

export function registerAuthIpc(): void {
  // Login / validate with explicit credentials, caching on success.
  ipcMain.handle(
    'zozii:auth-login',
    (_event, username: unknown, password: unknown): Promise<AuthValidateResult> => {
      const u = typeof username === 'string' ? username : ''
      const p = typeof password === 'string' ? password : ''
      return loginAndCache(u, p)
    },
  )

  // Re-validate using persisted credentials (startup + periodic).
  ipcMain.handle('zozii:auth-revalidate', (): Promise<AuthValidateResult> => revalidateCached())

  ipcMain.handle('zozii:auth-has-session', (): Promise<boolean> => hasCachedCredentials())

  // Register a new EXE user.
  ipcMain.handle(
    'zozii:auth-register',
    (
      _event,
      username: unknown,
      password: unknown,
      name: unknown,
      email: unknown,
    ): Promise<RegisterResult> => {
      const u = typeof username === 'string' ? username : ''
      const p = typeof password === 'string' ? password : ''
      const n = typeof name === 'string' ? name : ''
      const e = typeof email === 'string' ? email : ''
      return registerUser(u, p, n, e)
    },
  )

  // Email OTP gate used before registration: send, then verify the code.
  ipcMain.handle(
    'zozii:auth-send-otp',
    (_event, email: unknown): Promise<OtpResult> => {
      const e = typeof email === 'string' ? email : ''
      return requestEmailOtp(e)
    },
  )

  ipcMain.handle(
    'zozii:auth-verify-otp',
    (_event, email: unknown, token: unknown): Promise<OtpResult> => {
      const e = typeof email === 'string' ? email : ''
      const t = typeof token === 'string' ? token : ''
      return verifyEmailOtp(e, t)
    },
  )

  ipcMain.handle('zozii:auth-logout', (): Promise<void> => logout())

  // Usage-meter bridge (only meaningful while a user is logged in via cache).
  ipcMain.handle('zozii:usage-start', (): Promise<AuthValidateResult> => usageStart())
  ipcMain.handle('zozii:usage-stop', (): Promise<AuthValidateResult> => usageStop())
  ipcMain.handle('zozii:usage-heartbeat', (): Promise<AuthValidateResult> => usageHeartbeat())

  // Plan / access request sent from the EXE to the dashboard.
  ipcMain.handle(
    'zozii:plan-request',
    (_event, minutes: unknown): Promise<PlanRequestResult> => {
      const mins = typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : 0
      return sendPlanRequest(mins)
    },
  )
}
