import type { PlanRequest } from '../lib/types'
import { formatDateTime } from '../lib/time'

interface PlanRequestsPanelProps {
  requests: PlanRequest[]
  loadingRequest: string | null
  onOpenUser: (request: PlanRequest) => void
  onDismiss: (request: PlanRequest) => void
}

function formatRequestedMinutes(minutes: number): string {
  const mins = Math.round(Number(minutes) || 0)
  if (mins <= 0) return '—'
  if (mins < 60) return `${mins} minutes`
  const hours = mins / 60
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`
  const days = mins / 1440
  return `${days} day${Math.round(days) === 1 ? '' : 's'}`
}

export default function PlanRequestsPanel({
  requests,
  loadingRequest,
  onOpenUser,
  onDismiss,
}: PlanRequestsPanelProps): React.JSX.Element | null {
  if (requests.length === 0) return null

  return (
    <div className="requests-card">
      <div className="requests-header">
        <h3 className="requests-title">
          Access Requests <span className="requests-count">{requests.length}</span>
        </h3>
        <p className="requests-sub">Users asked for more time — grant it with the usual duration / reset controls.</p>
      </div>
      <ul className="requests-list">
        {requests.map((r) => (
          <li key={r.id} className="requests-item">
            <div className="requests-info">
              <div className="requests-name">
                {r.email || r.username}
                {r.plan_type === 'trial' && <span className="badge badge--trial">Trial</span>}
              </div>
              <div className="requests-meta">
                wants <strong>{formatRequestedMinutes(r.requested_minutes)}</strong> · {formatDateTime(r.created_at)}
              </div>
            </div>
            <div className="requests-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={loadingRequest !== null}
                onClick={() => onOpenUser(r)}
              >
                Open User
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={loadingRequest !== null}
                onClick={() => onDismiss(r)}
              >
                {loadingRequest === r.id ? '…' : 'Dismiss'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}