import type { AccessStatus, AppUser } from '../lib/types'

interface StatsCardsProps {
  users: AppUser[]
}

export default function StatsCards({ users }: StatsCardsProps): React.JSX.Element {
  const total = users.length
  const active = users.filter((u) => u.access_status === 'ACTIVE').length
  const expired = users.filter((u) => u.access_status === 'EXPIRED').length
  const suspended = users.filter((u) => u.access_status === 'SUSPENDED').length
  const blocked = users.filter((u) => u.access_status === 'BLOCKED').length

  const stats: Array<{
    label: string
    value: number
    tone: 'total' | AccessStatus
  }> = [
    { label: 'Total Users', value: total, tone: 'total' },
    { label: 'Active Users', value: active, tone: 'ACTIVE' },
    { label: 'Expired Users', value: expired, tone: 'EXPIRED' },
    { label: 'Suspended Users', value: suspended, tone: 'SUSPENDED' },
    { label: 'Blocked Users', value: blocked, tone: 'BLOCKED' },
  ]

  return (
    <div className="stats-grid">
      {stats.map((s) => (
        <div key={s.label} className={`stat-card stat-card--${s.tone.toLowerCase()}`}>
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  )
}