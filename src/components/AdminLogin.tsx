import { useState, type FormEvent } from 'react'
import ZoziiLogo from './ZoziiLogo'

export const ADMIN_USERNAME =
  (import.meta.env.VITE_ADMIN_USERNAME as string | undefined) ||
  (import.meta.env.ADMIN_USERNAME as string | undefined) ||
  'vigneshshetty799@gmail.com'
export const ADMIN_PASSWORD =
  (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) ||
  (import.meta.env.ADMIN_PASSWORD as string | undefined) ||
  'Udupa@799'
export const ADMIN_SESSION_KEY = 'hireme-admin-session'

interface AdminLoginProps {
  onSuccess: () => void
}

export default function AdminLogin({ onSuccess }: AdminLoginProps): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Small delay so the "Signing in…" state is visible rather than flashing.
    window.setTimeout(() => {
      if (username.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, '1')
        onSuccess()
      } else {
        setError('Invalid username or password.')
        setBusy(false)
      }
    }, 250)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <ZoziiLogo size={40} />
          <h1 className="login-title">Zozii Admin</h1>
          <p className="login-sub">Access management · by Nexus Talent</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="admin-username">
            Username
          </label>
          <input
            id="admin-username"
            className="login-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="vigneshshetty799@gmail.com"
            autoComplete="username"
            autoFocus
          />

          <label className="login-label" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            autoComplete="current-password"
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}