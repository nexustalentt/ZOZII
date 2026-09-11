import { useEffect, useMemo, useState } from 'react'
import type { AccessStatus, AppUser } from '../lib/types'
import { formatDateTime, formatRemainingCompact, usageRemainingMs } from '../lib/time'
import type { FilterState } from './FilterBar'

interface UserTableProps {
  users: AppUser[]
  filter: FilterState
  onSelect: (user: AppUser) => void
}

const STATUS_LABEL: Record<AccessStatus, string> = {
  INACTIVE: 'Inactive',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Blocked',
}

export default function UserTable({ users, filter, onSelect }: UserTableProps): React.JSX.Element {
  const [, setTick] = useState(0)

  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(i)
  }, [])

  const filtered = useMemo(() => {
    const q = filter.query.trim().toLowerCase()
    return users.filter((u) => {
      if (filter.status !== 'ALL' && u.access_status !== filter.status) return false
      if (!q) return true
      switch (filter.searchBy) {
        case 'username':
          return u.username.toLowerCase().includes(q)
        case 'email':
          return (u.email ?? '').toLowerCase().includes(q)
        case 'userid':
          return u.user_id.toLowerCase().includes(q)
        default:
          return (
            u.username.toLowerCase().includes(q) ||
            (u.email ?? '').toLowerCase().includes(q) ||
            u.user_id.toLowerCase().includes(q) ||
            (u.name ?? '').toLowerCase().includes(q)
          )
      }
    })
  }, [users, filter])

  return (
    <div className="table-wrap">
      <table className="user-table">
        <thead>
          <tr>
            <th>User ID</th>
            <th>Name</th>
            <th>Email / Username</th>
            <th>Email</th>
            <th>Registered</th>
            <th>Activated</th>
            <th>Access Starts</th>
            <th>Expires</th>
            <th>Remaining</th>
            <th>Last Login</th>
            <th>Device</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={13} className="table-empty">
                No users match the current filters.
              </td>
            </tr>
          )}
          {filtered.map((u) => {
            const remaining = usageRemainingMs(u)
            const deviceName =
              u.device_info?.pcName ?? u.device_info?.hardwareId ?? u.device_info?.os ?? null
            return (
              <tr key={u.id} className="user-row" onClick={() => onSelect(u)}>
                <td className="mono">{u.user_id}</td>
                <td>{u.name || '—'}</td>
                <td>{u.username}</td>
                <td>{u.email || '—'}</td>
                <td>{formatDateTime(u.registration_date)}</td>
                <td>{formatDateTime(u.activation_date)}</td>
                <td>{formatDateTime(u.access_start_time)}</td>
                <td>{formatDateTime(u.access_expiry_time)}</td>
                <td>
                  <span
                    className={`remaining ${remaining <= 0 ? 'remaining--expired' : 'remaining--live'}`}
                  >
                    {formatRemainingCompact(remaining)}
                  </span>
                </td>
                <td>{formatDateTime(u.last_login)}</td>
                <td className="device-cell" title={deviceName ?? ''}>
                  {deviceName || '—'}
                </td>
                <td>
                  <span className={`badge badge--${u.access_status.toLowerCase()}`}>
                    {STATUS_LABEL[u.access_status]}
                  </span>
                </td>
                <td>
                  <span className="row-hint">View →</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}