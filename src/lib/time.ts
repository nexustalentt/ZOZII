// Server-time based countdown helpers. The server returns its own `now`
// every time we fetch users; we compute offsets relative to that so a skewed
// client clock never affects the displayed remaining time.

export interface TimeParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  positive: boolean
}

let drift = 0

// Recalibrate the client <-> server clock drift every time the server sends
// its authoritative `now`. remainingMs is the remaining ms the server computed
// at that moment; serverNow is that server timestamp.
export function calibrateServerClock(serverNow: string | null, serverRemainingMs: number | null): void {
  if (!serverNow) return
  const serverNowMs = new Date(serverNow).getTime()
  if (Number.isNaN(serverNowMs)) return
  const clientNowMs = Date.now()
  // drift = serverTime - clientTime
  drift = serverNowMs - clientNowMs
  void serverRemainingMs
}

export function getServerNow(): number {
  return Date.now() + drift
}

export function remainingMs(expiry: string | null): number {
  if (!expiry) return 0
  const exp = new Date(expiry).getTime()
  if (Number.isNaN(exp)) return 0
  return exp - getServerNow()
}

// For budget-mode users the remaining time is grant minus used (seconds → ms).
// Falls back to the pure clock countdown when no usage grant is set.
export function usageRemainingMs(user: {
  grant_duration_seconds?: number | null
  used_seconds?: number | null
  access_expiry_time?: string | null
}): number {
  if (user.grant_duration_seconds != null) {
    const budget = Number(user.grant_duration_seconds)
    const used = Number(user.used_seconds ?? 0)
    return Math.max(0, budget - used) * 1000
  }
  return remainingMs(user.access_expiry_time ?? null)
}

export function formatDuration(ms: number): TimeParts {
  const positive = ms > 0
  const abs = Math.abs(ms)
  const totalSeconds = Math.floor(abs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds, totalMs: abs, positive }
}

// e.g. "23 Days 04 Hours 35 Minutes"
export function formatRemainingLarge(ms: number): string {
  const p = formatDuration(ms)
  if (!p.positive) return 'Expired'
  const parts: string[] = []
  if (p.days > 0) parts.push(`${p.days} Day${p.days === 1 ? '' : 's'}`)
  if (p.hours > 0) parts.push(`${p.hours} Hour${p.hours === 1 ? '' : 's'}`)
  if (p.minutes > 0) parts.push(`${p.minutes} Minute${p.minutes === 1 ? '' : 's'}`)
  if (parts.length === 0) parts.push('Less than a minute')
  return parts.join(' ')
}

// Compact "23D 04H 35M" for table cells
export function formatRemainingCompact(ms: number): string {
  const p = formatDuration(ms)
  if (!p.positive) return 'Expired'
  if (p.days > 0) return `${p.days}D ${p.hours}H ${p.minutes}M`
  if (p.hours > 0) return `${p.hours}H ${p.minutes}M ${p.seconds}S`
  if (p.minutes > 0) return `${p.minutes}M ${p.seconds}S`
  return `${p.seconds}S`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatHistoryDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}