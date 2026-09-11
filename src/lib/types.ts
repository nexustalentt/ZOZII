export type AccessStatus = 'INACTIVE' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BLOCKED'

export interface DeviceInfo {
  pcName?: string | null
  os?: string | null
  hardwareId?: string | null
  [key: string]: unknown
}

export interface AppUser {
  id: string
  user_id: string
  name: string | null
  username: string
  email: string | null
  registration_date: string | null
  activation_date: string | null
  access_status: AccessStatus
  access_start_time: string | null
  access_expiry_time: string | null
  grant_duration_seconds?: number | null
  used_seconds?: number | null
  plan_type?: string | null
  last_login: string | null
  device_info: DeviceInfo | null
  device_locked: boolean
  now?: string | null
}

export interface PlanRequest {
  id: string
  user_ref: string
  username: string
  email: string | null
  requested_minutes: number
  note: string | null
  created_at: string
  status: string
  user_id: string | null
  access_status: AccessStatus | null
  plan_type: string | null
}

export interface AccessHistoryEntry {
  date: string
  action: string
  detail: string | null
}

export interface UserDetail {
  user: AppUser
  history: AccessHistoryEntry[]
}

export interface ApiResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

export interface ValidateResult {
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BLOCKED' | 'NOT_FOUND'
  access_expiry_time?: string | null
  access_start_time?: string | null
  user_id?: string | null
  name?: string | null
}

export interface ValidationError {
  message: string
}

export interface DurationPreset {
  label: string
  minutes: number | null
}

export interface ExtendPreset {
  label: string
  days: number
  hours: number
  minutes: number
}
