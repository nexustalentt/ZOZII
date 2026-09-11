import { useCallback, useEffect, useRef, useState } from 'react'
import { ExtendAccessModal, ResetAccessModal, SetDurationModal } from './components/ActionModals'
import AdminLogin, { ADMIN_SESSION_KEY } from './components/AdminLogin'
import ConfirmDialog from './components/ConfirmDialog'
import FilterBar, { type FilterState } from './components/FilterBar'
import PlanRequestsPanel from './components/PlanRequestsPanel'
import StatsCards from './components/StatsCards'
import UserDetailsPanel from './components/UserDetailsPanel'
import UserTable from './components/UserTable'
import ZoziiLogo from './components/ZoziiLogo'
import Landing from './Landing'
import {
  activateUser,
  blockUser,
  deactivateUser,
  deleteUser,
  dismissPlanRequest,
  extendAccess,
  fetchPlanRequests,
  fetchUserDetail,
  fetchUsers,
  resetAccess,
  resetDevice,
  setDuration,
  suspendUser,
} from './lib/api'
import type { AccessHistoryEntry, AppUser, PlanRequest } from './lib/types'
import { calibrateServerClock } from './lib/time'

interface ModalState {
  selected?: AppUser
  setDuration?: boolean
  resetAccess?: boolean
  extendAccess?: boolean
  confirmAction?: string
}

// Landing site at `/`, admin dashboard at `/admin` (path or `#/admin`).
function isAdminRoute(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase()
  if (path === '/admin') return true
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  return hash === 'admin'
}

export default function App(): React.JSX.Element {
  const [isAdmin, setIsAdmin] = useState(isAdminRoute)

  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdmin(isAdminRoute())
    }
    window.addEventListener('popstate', handleLocationChange)
    window.addEventListener('hashchange', handleLocationChange)
    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      window.removeEventListener('hashchange', handleLocationChange)
    }
  }, [])

  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) === '1',
  )
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterState>({
    query: '',
    searchBy: 'all',
    status: 'ALL',
  })

  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [history, setHistory] = useState<AccessHistoryEntry[] | null>(null)

  const [planRequests, setPlanRequests] = useState<PlanRequest[]>([])
  const [requestsBusy, setRequestsBusy] = useState<string | null>(null)

  const [modals, setModals] = useState<ModalState>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const loadUsersRef = useRef<() => Promise<void>>(async () => {})

  const loadUsers = useCallback(async () => {
    try {
      const list = await fetchUsers()
      setUsers(list)
      const latest = list.find((u) => u.now) ?? list[0]
      if (latest?.now) {
        calibrateServerClock(latest.now, null)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
    try {
      setPlanRequests(await fetchPlanRequests())
    } catch {
      // Requests are supplementary; a fetch failure shouldn't block the table.
    }
  }, [])

  loadUsersRef.current = loadUsers

  useEffect(() => {
    if (!isAdmin || !authed) return
    void loadUsers()
    const interval = window.setInterval(() => void loadUsersRef.current(), 30000)
    return () => window.clearInterval(interval)
  }, [isAdmin, authed, loadUsers])

  const openUser = useCallback(async (user: AppUser) => {
    setSelectedUser(user)
    setDetailLoading(true)
    setHistory(null)
    try {
      const detail = await fetchUserDetail(user.id)
      setHistory(detail.history)
      setSelectedUser(() => detail.user)
      if (detail.user.now) {
        calibrateServerClock(detail.user.now, null)
      }
    } catch {
      setHistory([])
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleSelect = useCallback(
    (user: AppUser) => {
      void openUser(user)
    },
    [openUser],
  )

  const openUserFromRequest = useCallback(
    (request: PlanRequest) => {
      const found = users.find((u) => u.id === request.user_ref)
      if (found) {
        void openUser(found)
        return
      }
      void openUser({
        id: request.user_ref,
        user_id: request.user_id ?? 'U-??????',
        name: null,
        username: request.username,
        email: request.email ?? null,
        registration_date: null,
        activation_date: null,
        access_status: request.access_status ?? 'INACTIVE',
        access_start_time: null,
        access_expiry_time: null,
        grant_duration_seconds: null,
        used_seconds: 0,
        plan_type: request.plan_type ?? null,
        last_login: null,
        device_info: null,
        device_locked: false,
      })
    },
    [users, openUser],
  )

  const handleDismissRequest = useCallback(
    async (request: PlanRequest) => {
      setRequestsBusy(request.id)
      try {
        const res = await dismissPlanRequest(request.id)
        if (!res.ok) {
          setModalError(res.error ?? 'Failed to dismiss request')
        } else {
          setPlanRequests(await fetchPlanRequests())
        }
      } catch {
        setModalError('Failed to dismiss request')
      } finally {
        setRequestsBusy(null)
      }
    },
    [],
  )

  const runSimpleAction = useCallback(
    async (user: AppUser, action: string) => {
      setBusy(action)
      setModalError(null)
      setModals({})
      try {
        let res: { ok: boolean; error?: string }
        switch (action) {
          case 'activate':
            res = await activateUser(user.id)
            break
          case 'deactivate':
            res = await deactivateUser(user.id)
            break
          case 'suspend':
            res = await suspendUser(user.id)
            break
          case 'block':
            res = await blockUser(user.id)
            break
          case 'reset-device':
            res = await resetDevice(user.id)
            break
          case 'delete':
            res = await deleteUser(user.id)
            break
          default:
            res = { ok: false, error: 'Unknown action' }
        }
        if (!res.ok) {
          setModalError(res.error ?? 'Action failed')
          setBusy(null)
          return
        }
        await loadUsers()
        if (action === 'delete') setSelectedUser(null)
        else if (selectedUser?.id === user.id) void openUser(user)
        setBusy(null)
      } catch {
        setBusy(null)
        setModalError('Action failed')
      }
    },
    [loadUsers, selectedUser, openUser],
  )

  const confirmStatus = useCallback(async () => {
    if (!modals.selected || !modals.confirmAction) return
    await runSimpleAction(modals.selected, modals.confirmAction)
    setModals({})
  }, [modals, runSimpleAction])

  const confirmDialogMessage = (): React.ReactNode => {
    const action = modals.confirmAction
    const name = modals.selected?.username ?? 'this user'
    switch (action) {
      case 'activate':
        return <>Activate <strong>{name}</strong>?</>
      case 'deactivate':
        return <>Deactivate <strong>{name}</strong>? Access will be revoked until reactivated.</>
      case 'suspend':
        return <>Suspend <strong>{name}</strong>? The user will see a suspension notice in the EXE.</>
      case 'block':
        return <>Block <strong>{name}</strong>? The user will be permanently denied access.</>
      case 'reset-device':
        return <>Reset device association for <strong>{name}</strong>?</>
      case 'delete':
        return <>Permanently delete <strong>{name}</strong> and all access history? This cannot be undone.</>
      default:
        return 'Are you sure?'
    }
  }

  const confirmTitle = (): string => {
    const action = modals.confirmAction ?? 'Confirm'
    return action.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const confirmLabel = (): string => {
    switch (modals.confirmAction) {
      case 'delete':
        return 'Delete User'
      case 'reset-device':
        return 'Reset Device'
      case 'activate':
        return 'Activate'
      default:
        return 'Confirm'
    }
  }

  const closeModals = useCallback(() => {
    setModals({})
    setModalError(null)
  }, [])

  const isDangerConfirm =
    modals.confirmAction === 'delete' || modals.confirmAction === 'block' || modals.confirmAction === 'deactivate'

  return isAdmin ? (
    <div className="app">
      {!authed ? (
        <AdminLogin
          onSuccess={() => {
            setAuthed(true)
            void loadUsers()
          }}
        />
      ) : (
        <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <ZoziiLogo size={34} />
            <div>
              <h1 className="brand-title">Zozii Admin</h1>
              <p className="brand-sub">Manage access · grant time · review requests</p>
            </div>
          </div>
          <div className="header-actions">
            <a
              className="btn btn-ghost"
              href="/"
              onClick={(e) => {
                // Let hash-based navigation work before falling back to normal navigation.
                if (window.location.hash.toLowerCase().startsWith('#/admin')) {
                  e.preventDefault()
                  window.location.assign('/')
                }
              }}
            >
              View site
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void loadUsers()}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                sessionStorage.removeItem(ADMIN_SESSION_KEY)
                setAuthed(false)
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="app-content">
        {error && (
          <div className="app-error">
            {error}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadUsers()}>
              Retry
            </button>
          </div>
        )}

        <div className="content-section">
          <StatsCards users={users} />
        </div>

        <div className="content-section">
          <PlanRequestsPanel
            requests={planRequests}
            loadingRequest={requestsBusy}
            onOpenUser={openUserFromRequest}
            onDismiss={(r) => void handleDismissRequest(r)}
          />
        </div>

        <div className="content-section">
          <FilterBar filter={filter} onChange={setFilter} />
        </div>

        <div className="content-section">
          {loading ? (
            <div className="loading-state">Loading users…</div>
          ) : (
            <UserTable users={users} filter={filter} onSelect={handleSelect} />
          )}
        </div>
      </div>

      <UserDetailsPanel
        user={selectedUser}
        history={history}
        loading={detailLoading}
        busy={busy}
        onResetDevice={(user) => setModals({ selected: user, confirmAction: 'reset-device' })}
        onActivate={(user) => setModals({ selected: user, confirmAction: 'activate' })}
        onDeactivate={(user) => setModals({ selected: user, confirmAction: 'deactivate' })}
        onSuspend={(user) => setModals({ selected: user, confirmAction: 'suspend' })}
        onBlock={(user) => setModals({ selected: user, confirmAction: 'block' })}
        onDelete={(user) => setModals({ selected: user, confirmAction: 'delete' })}
        onSetDuration={(user) => setModals({ selected: user, setDuration: true })}
        onResetAccess={(user) => setModals({ selected: user, resetAccess: true })}
        onExtendAccess={(user) => setModals({ selected: user, extendAccess: true })}
        onClose={() => setSelectedUser(null)}
      />

      <SetDurationModal
        open={!!modals.setDuration}
        user={modals.selected ?? null}
        busy={busy === 'set-duration'}
        error={modalError}
        onCancel={closeModals}
        onConfirm={(minutes, customExpiry) => {
          const target = modals.selected
          if (!target) return
          setBusy('set-duration')
          void (async () => {
            const res = await setDuration(target.id, minutes, customExpiry)
            if (!res.ok) {
              setModalError(res.error ?? 'Failed')
              setBusy(null)
              return
            }
            await loadUsers()
            if (selectedUser?.id === target.id) void openUser(target)
            closeModals()
          })()
        }}
      />

      <ResetAccessModal
        open={!!modals.resetAccess}
        user={modals.selected ?? null}
        busy={busy === 'reset-access'}
        error={modalError}
        onCancel={closeModals}
        onConfirm={(days, customExpiry) => {
          const target = modals.selected
          if (!target) return
          setBusy('reset-access')
          void (async () => {
            const res = await resetAccess(target.id, days, customExpiry)
            if (!res.ok) {
              setModalError(res.error ?? 'Failed')
              setBusy(null)
              return
            }
            await loadUsers()
            if (selectedUser?.id === target.id) void openUser(target)
            closeModals()
          })()
        }}
      />

      <ExtendAccessModal
        open={!!modals.extendAccess}
        user={modals.selected ?? null}
        busy={busy === 'extend-access'}
        error={modalError}
        onCancel={closeModals}
        onConfirm={(days, hours, minutes) => {
          const target = modals.selected
          if (!target) return
          setBusy('extend-access')
          void (async () => {
            const res = await extendAccess(target.id, days, hours, minutes)
            if (!res.ok) {
              setModalError(res.error ?? 'Failed')
              setBusy(null)
              return
            }
            await loadUsers()
            if (selectedUser?.id === target.id) void openUser(target)
            closeModals()
          })()
        }}
      />

      <ConfirmDialog
        open={!!modals.confirmAction}
        title={confirmTitle()}
        message={confirmDialogMessage()}
        confirmLabel={confirmLabel()}
        danger={isDangerConfirm}
        busy={busy !== null}
        onConfirm={() => void confirmStatus()}
        onCancel={closeModals}
      />
        </>
      )}
    </div>
  ) : (
    <Landing />
  )
}