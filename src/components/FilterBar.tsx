import type { AccessStatus } from '../lib/types'

export interface FilterState {
  query: string
  searchBy: 'username' | 'email' | 'userid' | 'all'
  status: 'ALL' | AccessStatus
}

interface FilterBarProps {
  filter: FilterState
  onChange: (f: FilterState) => void
}

const STATUS_FILTERS: Array<{ value: 'ALL' | AccessStatus; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'BLOCKED', label: 'Blocked' },
]

export default function FilterBar({ filter, onChange }: FilterBarProps): React.JSX.Element {
  return (
    <div className="filter-bar">
      <div className="search-box">
        <span className="search-icon" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="search-input"
          type="text"
          placeholder="Search by username, email, or user ID…"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
        />
        <select
          className="search-select"
          value={filter.searchBy}
          onChange={(e) =>
            onChange({ ...filter, searchBy: e.target.value as FilterState['searchBy'] })
          }
        >
          <option value="all">All fields</option>
          <option value="username">Username</option>
          <option value="email">Email</option>
          <option value="userid">User ID</option>
        </select>
      </div>
      <div className="filter-chips">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`chip ${filter.status === f.value ? 'chip--active' : ''}`}
            onClick={() => onChange({ ...filter, status: f.value })}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}