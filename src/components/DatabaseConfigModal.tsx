import { useState } from 'react'
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  clearCustomSupabaseConfig,
  getActiveSupabaseConfig,
  setCustomSupabaseConfig,
} from '../lib/supabase'
import { isDemoMode, setDemoMode, resetDemoState } from '../lib/api'

interface DatabaseConfigModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export default function DatabaseConfigModal({
  open,
  onClose,
  onSaved,
}: DatabaseConfigModalProps): React.JSX.Element | null {
  const current = getActiveSupabaseConfig()
  const [url, setUrl] = useState(current.url)
  const [anonKey, setAnonKey] = useState(current.key)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [demoActive, setDemoActive] = useState(isDemoMode())

  if (!open) return null

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const testUrl = url.trim().replace(/\/$/, '')
    try {
      // Supabase REST endpoint ping
      const res = await fetch(`${testUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: anonKey.trim(),
        },
      })
      if (res.ok || res.status === 200 || res.status === 401 || res.status === 404) {
        setTestResult({
          ok: true,
          message: `Connection successful (Server responded with HTTP ${res.status}). Database host is online.`,
        })
      } else {
        setTestResult({
          ok: false,
          message: `Server returned HTTP ${res.status} (${res.statusText}).`,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setTestResult({
        ok: false,
        message: `Failed to connect (${msg}). The project may be paused or the URL is incorrect.`,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    setCustomSupabaseConfig(url.trim(), anonKey.trim())
    setDemoMode(false)
    setDemoActive(false)
    onSaved()
    onClose()
  }

  const handleReset = () => {
    clearCustomSupabaseConfig()
    setUrl(DEFAULT_SUPABASE_URL)
    setAnonKey(DEFAULT_SUPABASE_ANON_KEY)
    setTestResult(null)
    onSaved()
  }

  const handleToggleDemo = () => {
    const next = !demoActive
    setDemoMode(next)
    setDemoActive(next)
    if (next) resetDemoState()
    onSaved()
    onClose()
  }

  const projectRef = url.match(/https:\/\/([a-z0-9_-]+)\.supabase\.co/i)?.[1]

  return (
    <div className="dialog-backdrop" style={{ zIndex: 9999 }}>
      <div className="dialog" style={{ maxWidth: '640px', width: '92%' }}>
        <div className="dialog-header">
          <h2 className="dialog-title">Supabase Database Connection</h2>
          <button type="button" className="dialog-close-x" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.2 2.2l7.6 7.6M9.8 2.2l-7.6 7.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: '0.85rem',
              lineHeight: 1.45,
            }}
          >
            <strong>Why is the database unreachable?</strong>
            <p style={{ margin: '0.35rem 0 0 0' }}>
              Supabase Free Tier automatically pauses databases after 7 days of inactivity. If your project is paused,
              you can resume it instantly from your Supabase Dashboard:
            </p>
            {projectRef && (
              <div style={{ marginTop: '0.5rem' }}>
                <a
                  href={`https://supabase.com/dashboard/project/${projectRef}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                >
                  Resume Project on Supabase Dashboard ↗
                </a>
              </div>
            )}
          </div>

          <div>
            <label className="auth-label" style={{ fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>
              Supabase Project URL
            </label>
            <input
              type="text"
              className="auth-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label className="auth-label" style={{ fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>
              Supabase Anon / Publishable Key
            </label>
            <input
              type="text"
              className="auth-input"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="sb_publishable_... or eyJhbGci..."
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>

          {testResult && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                background: testResult.ok ? '#dcfce7' : '#fee2e2',
                color: testResult.ok ? '#166534' : '#991b1b',
                border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              {testResult.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleTest()}
              disabled={testing || !url.trim()}
            >
              {testing ? 'Testing connection…' : 'Test Connection'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleReset}
            >
              Reset to Default
            </button>
            <button
              type="button"
              className={`btn btn-sm ${demoActive ? 'btn-danger' : 'btn-secondary'}`}
              onClick={handleToggleDemo}
              style={{ marginLeft: 'auto' }}
            >
              {demoActive ? 'Exit Demo Mode' : 'Switch to Demo Mode'}
            </button>
          </div>
        </div>

        <div className="dialog-actions" style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save & Connect
          </button>
        </div>
      </div>
    </div>
  )
}
