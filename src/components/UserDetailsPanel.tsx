import { useMemo } from 'react'
import type { AccessHistoryEntry, AccessStatus, AppUser } from '../lib/types'
import { formatDateTime, formatHistoryDate, formatRemainingCompact, usageRemainingMs } from '../lib/time'

interface UserDetailsPanelProps {
  user: AppUser | null
  history: AccessHistoryEntry[] | null
  loading: boolean
  busy: string | null
  onActivate: (user: AppUser) => void
  onDeactivate: (user: AppUser) => void
  onSuspend: (user: AppUser) => void
  onBlock: (user: AppUser) => void
  onSetDuration: (user: AppUser) => void
  onResetAccess: (user: AppUser) => void
  onExtendAccess: (user: AppUser) => void
  onResetDevice: (user: AppUser) => void
  onDelete: (user: AppUser) => void
  onClose: () => void
}

const STATUS_LABEL: Record<AccessStatus, string> = {
  INACTIVE: 'Inactive',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Blocked',
}

function actionLabel(action: string): string {
  switch (action) {
    case 'registered':
    case 'registration':
      return 'Registered'
    case 'activated':
      return 'Activated'
    case 'deactivated':
      return 'Deactivated'
    case 'suspended':
      return 'Suspended'
    case 'blocked':
      return 'Blocked'
    case 'extended':
      return 'Extended'
    case 'reset':
      return 'Access Reset'
    case 'reset_device':
      return 'Device Reset'
    case 'deleted':
      return 'Deleted'
    case 'expired':
      return 'Expired'
    case 'login':
      return 'Logged In'
    default:
      return action
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
  }
}

export default function UserDetailsPanel({
  user,
  history,
  loading,
  busy,
  onActivate,
  onDeactivate,
  onSuspend,
  onBlock,
  onSetDuration,
  onResetAccess,
  onExtendAccess,
  onResetDevice,
  onDelete,
  onClose,
}: UserDetailsPanelProps): React.JSX.Element | null {
  const remainingMsMemo = useMemo(
    () => (user ? usageRemainingMs(user) : 0),
    [user],
  )
  const budgetMs = useMemo(() => {
    if (!user?.grant_duration_seconds) return null
    return Number(user.grant_duration_seconds) * 1000
  }, [user])
  const budgetUsedMs = useMemo(() => {
    if (budgetMs == null) return null
    return Number(user?.used_seconds ?? 0) * 1000
  }, [user, budgetMs])

  if (!user) return null

  const device = user.device_info

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title">{user.name || user.username}</h2>
            <div className="drawer-subtitle mono">{user.user_id}</div>
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawer-actions">
          <button className="btn btn-primary btn-sm" onClick={() => onActivate(user)} disabled={busy !== null}>
            Activate
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDeactivate(user)} disabled={busy !== null}>
            Deactivate
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onSetDuration(user)} disabled={busy !== null}>
            Set Duration
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onResetAccess(user)} disabled={busy !== null}>
            Reset Time
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onExtendAccess(user)} disabled={busy !== null}>
            Extend Access
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onSuspend(user)} disabled={busy !== null}>
            Suspend
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onBlock(user)} disabled={busy !== null}>
            Block
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onResetDevice(user)} disabled={busy !== null}>
            Reset Device
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(user)} disabled={busy !== null}>
            Delete User
          </button>
        </div>

        <div className="drawer-body">
          <div className="detail-section">
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className={`badge badge--${user.access_status.toLowerCase()}`}>
                {STATUS_LABEL[user.access_status]}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Plan</span>
              <span>
                {user.plan_type === 'trial'
                  ? 'Trial'
                  : user.plan_type === 'paid'
                    ? 'Paid'
                    : user.plan_type ?? '—'}
              </span>
            </div>
            {user.access_status === 'ACTIVE' && user.access_expiry_time && (
              <div className="detail-row">
                <span className="detail-label">Remaining Time</span>
                <span className="remaining remaining--live">
                  {formatRemainingCompact(remainingMsMemo)}
                </span>
              </div>
            )}
            {budgetMs != null && (
              <div className="detail-row">
                <span className="detail-label">Usage</span>
                <span className={`remaining ${remainingMsMemo > 0 ? 'remaining--live' : 'remaining--expired'}`}>
                  {formatRemainingCompact(budgetUsedMs ?? 0)} / {formatRemainingCompact(budgetMs)}
                </span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Registered</span>
              <span>{formatDateTime(user.registration_date)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Activated</span>
              <span>{formatDateTime(user.activation_date)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Access Starts</span>
              <span>{formatDateTime(user.access_start_time)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Access Expiry</span>
              <span>{formatDateTime(user.access_expiry_time)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Last Login</span>
              <span>{formatDateTime(user.last_login)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Email / Username</span>
              <span>{user.username}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Email</span>
              <span>{user.email || '—'}</span>
            </div>
          </div>

          {device && (device.pcName || device.os || device.hardwareId) && (
            <div className="detail-section">
              <h4 className="section-title">Device / PC</h4>
              <div className="device-details">
                {device.pcName && (
                  <div>
                    <div className="device-label">PC Name</div>
                    <div>{device.pcName}</div>
                  </div>
                )}
                {device.os && (
                  <div>
                    <div className="device-label">OS</div>
                    <div>{device.os}</div>
                  </div>
                )}
                {device.hardwareId && (
                  <div>
                    <div className="device-label">Hardware ID</div>
                    <div className="mono">{device.hardwareId}</div>
                  </div>
                )}
                <div>
                  <div className="device-label">Device Locked</div>
                  <div>{user.device_locked ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>
          )}

          <div className="detail-section">
            <h4 className="section-title">Access History</h4>
            {loading ? (
              <div className="history-loading">Loading…</div>
            ) : !history || history.length === 0 ? (
              <div className="history-empty">No history yet.</div>
            ) : (
              <ol className="timeline">
                {history.map((h, i) => (
                  <li key={`${h.date}-${i}`} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div className="timeline-action">{actionLabel(h.action)}</div>
                      {h.detail && <div className="timeline-detail">{h.detail}</div>}
                      <div className="timeline-date">{formatHistoryDate(h.date)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}