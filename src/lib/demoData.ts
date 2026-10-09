import type { AccessHistoryEntry, AccessStatus, ApiResult, AppUser, PlanRequest, UserDetail } from './types'

const DEMO_USERS_KEY = 'zozii_demo_users'
const DEMO_REQUESTS_KEY = 'zozii_demo_requests'
const DEMO_HISTORY_KEY = 'zozii_demo_history'

const INITIAL_DEMO_USERS: AppUser[] = [
  {
    id: 'demo-user-1',
    user_id: 'U-A8F12B',
    username: 'alex.morgan@gmail.com',
    name: 'Alex Morgan',
    email: 'alex.morgan@gmail.com',
    access_status: 'ACTIVE',
    plan_type: 'trial',
    grant_duration_seconds: 600,
    used_seconds: 140,
    registration_date: new Date(Date.now() - 3600 * 1000).toISOString(),
    activation_date: new Date(Date.now() - 3600 * 1000).toISOString(),
    access_start_time: new Date(Date.now() - 3600 * 1000).toISOString(),
    access_expiry_time: null,
    last_login: new Date(Date.now() - 1800 * 1000).toISOString(),
    device_locked: false,
    now: new Date().toISOString(),
    device_info: { pcName: 'DESKTOP-ALEX', os: 'Windows 11 (x64)', hardwareId: 'A7F92C' },
  },
  {
    id: 'demo-user-2',
    user_id: 'U-C34E91',
    username: 'priya.sharma@techcorp.io',
    name: 'Priya Sharma',
    email: 'priya.sharma@techcorp.io',
    access_status: 'ACTIVE',
    plan_type: 'paid',
    grant_duration_seconds: 7200,
    used_seconds: 1800,
    registration_date: new Date(Date.now() - 86400 * 1000 * 2).toISOString(),
    activation_date: new Date(Date.now() - 86400 * 1000 * 2).toISOString(),
    access_start_time: new Date(Date.now() - 86400 * 1000 * 2).toISOString(),
    access_expiry_time: new Date(Date.now() + 86400 * 1000 * 28).toISOString(),
    last_login: new Date(Date.now() - 3600 * 1000).toISOString(),
    device_locked: true,
    now: new Date().toISOString(),
    device_info: { pcName: 'PRIYA-LAPTOP', os: 'Windows 10 (x64)', hardwareId: '98D10E' },
  },
  {
    id: 'demo-user-3',
    user_id: 'U-E9012A',
    username: 'rahul.kumar@outlook.com',
    name: 'Rahul Kumar',
    email: 'rahul.kumar@outlook.com',
    access_status: 'EXPIRED',
    plan_type: 'trial',
    grant_duration_seconds: 600,
    used_seconds: 600,
    registration_date: new Date(Date.now() - 86400 * 1000).toISOString(),
    activation_date: new Date(Date.now() - 86400 * 1000).toISOString(),
    access_start_time: new Date(Date.now() - 86400 * 1000).toISOString(),
    access_expiry_time: null,
    last_login: new Date(Date.now() - 86400 * 1000).toISOString(),
    device_locked: false,
    now: new Date().toISOString(),
    device_info: { pcName: 'RAHUL-PC', os: 'Windows 11 (x64)', hardwareId: '43B87F' },
  },
  {
    id: 'demo-user-4',
    user_id: 'U-F55C33',
    username: 'sarah.connor@cyberdyne.net',
    name: 'Sarah Connor',
    email: 'sarah.connor@cyberdyne.net',
    access_status: 'INACTIVE',
    plan_type: 'trial',
    grant_duration_seconds: 600,
    used_seconds: 0,
    registration_date: new Date(Date.now() - 86400 * 1000 * 3).toISOString(),
    activation_date: null,
    access_start_time: null,
    access_expiry_time: null,
    last_login: null,
    device_locked: false,
    now: new Date().toISOString(),
    device_info: null,
  },
]

const INITIAL_DEMO_REQUESTS: PlanRequest[] = [
  {
    id: 'demo-req-1',
    user_ref: 'demo-user-3',
    user_id: 'U-E9012A',
    username: 'rahul.kumar@outlook.com',
    email: 'rahul.kumar@outlook.com',
    requested_minutes: 30,
    note: 'Need more time for testing',
    status: 'PENDING',
    created_at: new Date(Date.now() - 1800 * 1000).toISOString(),
    access_status: 'EXPIRED',
    plan_type: 'trial',
  },
]

const INITIAL_DEMO_HISTORY: Record<string, AccessHistoryEntry[]> = {
  'demo-user-1': [
    { date: new Date(Date.now() - 3600 * 1000).toISOString(), action: 'registered', detail: 'Account registered' },
    { date: new Date(Date.now() - 3600 * 1000).toISOString(), action: 'activated', detail: 'Trial started: 10 minutes of usage' },
    { date: new Date(Date.now() - 1800 * 1000).toISOString(), action: 'used', detail: 'Session: used 140s' },
  ],
  'demo-user-2': [
    { date: new Date(Date.now() - 86400 * 1000 * 2).toISOString(), action: 'registered', detail: 'Account registered' },
    { date: new Date(Date.now() - 86400 * 1000 * 2).toISOString(), action: 'set_duration', detail: 'Granted 120 minutes of usage' },
  ],
  'demo-user-3': [
    { date: new Date(Date.now() - 86400 * 1000).toISOString(), action: 'registered', detail: 'Account registered' },
    { date: new Date(Date.now() - 86400 * 1000).toISOString(), action: 'activated', detail: 'Trial started: 10 minutes' },
    { date: new Date(Date.now() - 3600 * 1000).toISOString(), action: 'expired', detail: 'Trial usage budget reached 0' },
    { date: new Date(Date.now() - 1800 * 1000).toISOString(), action: 'plan_requested', detail: 'Requested 30 minutes' },
  ],
}

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // fallback
  }
  return fallback
}

function saveStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // fallback
  }
}

export function getDemoUsers(): AppUser[] {
  return loadStorage<AppUser[]>(DEMO_USERS_KEY, INITIAL_DEMO_USERS).map((u) => ({
    ...u,
    now: new Date().toISOString(),
  }))
}

export function getDemoPlanRequests(): PlanRequest[] {
  return loadStorage<PlanRequest[]>(DEMO_REQUESTS_KEY, INITIAL_DEMO_REQUESTS)
}

export function getDemoUserDetail(id: string): UserDetail {
  const users = getDemoUsers()
  const user = users.find((u) => u.id === id || u.user_id === id)
  if (!user) throw new Error('User not found in demo data')
  const historyMap = loadStorage<Record<string, AccessHistoryEntry[]>>(DEMO_HISTORY_KEY, INITIAL_DEMO_HISTORY)
  const history = historyMap[user.id] || [
    { date: user.registration_date || new Date().toISOString(), action: 'registered', detail: 'Account registered' },
  ]
  return { user, history }
}

function addDemoHistory(userId: string, action: string, detail: string): void {
  const historyMap = loadStorage<Record<string, AccessHistoryEntry[]>>(DEMO_HISTORY_KEY, INITIAL_DEMO_HISTORY)
  const list = historyMap[userId] || []
  list.unshift({ date: new Date().toISOString(), action, detail })
  historyMap[userId] = list
  saveStorage(DEMO_HISTORY_KEY, historyMap)
}

function updateDemoUser(id: string, updater: (u: AppUser) => AppUser): ApiResult {
  const users = getDemoUsers()
  const idx = users.findIndex((u) => u.id === id || u.user_id === id)
  if (idx < 0) return { ok: false, error: 'User not found' }
  const updated = updater(users[idx])
  users[idx] = updated
  saveStorage(DEMO_USERS_KEY, users)
  return { ok: true }
}

export function demoSetStatus(id: string, status: AccessStatus, action: string, detail?: string): ApiResult {
  const res = updateDemoUser(id, (u) => ({
    ...u,
    access_status: status,
    ...(status === 'ACTIVE' && !u.activation_date ? { activation_date: new Date().toISOString() } : {}),
  }))
  if (res.ok) {
    addDemoHistory(id, action, detail || `Status changed to ${status}`)
  }
  return res
}

export function demoSetDuration(id: string, minutes: number | null, customExpiry: string | null): ApiResult {
  const res = updateDemoUser(id, (u) => {
    const grantSec = typeof minutes === 'number' && minutes > 0 ? minutes * 60 : u.grant_duration_seconds || 600
    return {
      ...u,
      access_status: 'ACTIVE',
      plan_type: 'paid',
      grant_duration_seconds: grantSec,
      used_seconds: 0,
      access_expiry_time: customExpiry || null,
      activation_date: u.activation_date || new Date().toISOString(),
    }
  })
  if (res.ok) {
    addDemoHistory(id, 'set_duration', minutes ? `Set duration: ${minutes} min` : `Custom expiry: ${customExpiry}`)
  }
  return res
}

export function demoResetAccess(id: string, days: number | null, customExpiry: string | null): ApiResult {
  const res = updateDemoUser(id, (u) => {
    const durationSec = typeof days === 'number' && days > 0 ? days * 86400 : (u.grant_duration_seconds || 3600)
    return {
      ...u,
      access_status: 'ACTIVE',
      plan_type: 'paid',
      grant_duration_seconds: durationSec,
      used_seconds: 0,
      access_expiry_time: customExpiry || (days ? new Date(Date.now() + days * 86400 * 1000).toISOString() : null),
    }
  })
  if (res.ok) {
    addDemoHistory(id, 'reset_access', days ? `Reset access for ${days} days` : `Reset to ${customExpiry}`)
  }
  return res
}

export function demoExtendAccess(id: string, days: number, hours: number, minutes: number): ApiResult {
  const addSec = days * 86400 + hours * 3600 + minutes * 60
  const res = updateDemoUser(id, (u) => {
    const newGrant = (u.grant_duration_seconds || 0) + addSec
    return {
      ...u,
      access_status: 'ACTIVE',
      grant_duration_seconds: newGrant,
    }
  })
  if (res.ok) {
    addDemoHistory(id, 'extended', `Extended access by ${days}d ${hours}h ${minutes}m`)
  }
  return res
}

export function demoResetDevice(id: string): ApiResult {
  const res = updateDemoUser(id, (u) => ({
    ...u,
    device_info: null,
  }))
  if (res.ok) {
    addDemoHistory(id, 'reset_device', 'Device association cleared')
  }
  return res
}

export function demoDeleteUser(id: string): ApiResult {
  const users = getDemoUsers().filter((u) => u.id !== id && u.user_id !== id)
  saveStorage(DEMO_USERS_KEY, users)
  return { ok: true }
}

export function demoDismissPlanRequest(requestId: string): ApiResult {
  const requests = getDemoPlanRequests().filter((r) => r.id !== requestId)
  saveStorage(DEMO_REQUESTS_KEY, requests)
  return { ok: true }
}

export function resetDemoState(): void {
  saveStorage(DEMO_USERS_KEY, INITIAL_DEMO_USERS)
  saveStorage(DEMO_REQUESTS_KEY, INITIAL_DEMO_REQUESTS)
  saveStorage(DEMO_HISTORY_KEY, INITIAL_DEMO_HISTORY)
}
