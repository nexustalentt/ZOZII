import { useEffect, useRef, useState } from 'react'
import DomainMultiSelect from './DomainMultiSelect'
import { applyWindowTransparency, loadTransparency } from '../lib/transparency'
import { SITE_URL } from '../lib/site'

interface AssistantHeaderProps {
  listening: boolean
  processing?: boolean
  elapsedSeconds: number
  version: string
  groqConnected: boolean
  aiProvider: 'groq' | 'gemini'
  selectedIds: string[]
  listenMeeting: boolean
  hoverEnabled: boolean
  isCollapsed: boolean
  onToggleHover: () => void
  onToggleCollapse: () => void
  onListenMeetingChange: (enabled: boolean) => void
  onSelectionChange: (ids: string[]) => void
  onToggleListening: () => void
  onResetConversation: () => void
  onAddConnection: () => void
  onDisconnect: () => void
  remainingSeconds?: number | null
  questionsRemaining?: number | null
  onLogout?: () => void
}

export function formatTimer(totalSeconds: number): string {
  if (totalSeconds === 999999) return 'Unlimited'
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

function MicIcon({ active }: { active: boolean }): React.JSX.Element {
  return active ? (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.6" fill="currentColor" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="1.2" width="4" height="7" rx="2" stroke="none" fill="currentColor" />
      <path d="M2.8 6.4a4.2 4.2 0 008.4 0M7 10.8v2" />
    </svg>
  )
}

function GearIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="2.3" />
      <path d="M8 1.6l.55 1.75a4.9 4.9 0 011.63.68l1.77-.62.94 1.63-1.22 1.37a4.96 4.96 0 010 1.88l1.22 1.37-.94 1.63-1.77-.62a4.9 4.9 0 01-1.63.68L8 14.4l-.55-1.75a4.9 4.9 0 01-1.63-.68l-1.77.62-.94-1.63 1.22-1.37a4.96 4.96 0 010-1.88L3.11 6.34l.94-1.63 1.77.62a4.9 4.9 0 011.63-.68L8 1.6z" />
    </svg>
  )
}

function SignalBarsIcon({ connected }: { connected: boolean }): React.JSX.Element {
  const color = connected ? '#f59e0b' : 'rgba(255, 255, 255, 0.3)'
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ color }}>
      <rect x="2" y="11" width="2" height="4" rx="0.5" />
      <rect x="6" y="8" width="2" height="7" rx="0.5" />
      <rect x="10" y="5" width="2" height="10" rx="0.5" />
      <rect x="14" y="2" width="2" height="13" rx="0.5" />
    </svg>
  )
}

function CaretIcon({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {collapsed ? <path d="M4 6l4 4 4-4" /> : <path d="M4 10l4-4 4 4" />}
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h11M5.5 4.5V2.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M12.5 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 3.5 13.5v-9" />
      <line x1="6.5" y1="7.5" x2="6.5" y2="11.5" />
      <line x1="9.5" y1="7.5" x2="9.5" y2="11.5" />
    </svg>
  )
}

function LogoutIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10.5 11.5l3.5-3.5-3.5-3.5M14 8H6" />
    </svg>
  )
}

function ZoziiLogo(): React.JSX.Element {
  return (
    <div
      className="brand-logo-wrap"
      style={{ display: 'flex', alignItems: 'center', gap: '7px', WebkitAppRegion: 'no-drag', cursor: 'pointer' } as React.CSSProperties}
      onClick={() => void window.zozii?.openExternal(SITE_URL)}
      title="Open ZOZII website (https://zozii-iota.vercel.app/)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="z-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b7cf7" />
            <stop offset="100%" stopColor="#2ee6c8" />
          </linearGradient>
        </defs>
        <path
          d="M6 6h12L8 18h10"
          stroke="url(#z-grad)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="6" cy="6" r="2.8" fill="#8b7cf7" />
        <circle cx="18" cy="6" r="2.8" fill="#2ee6c8" />
        <circle cx="8" cy="18" r="2.8" fill="#8b7cf7" />
        <circle cx="18" cy="18" r="2.8" fill="#2ee6c8" />
      </svg>
      <span className="brand-title" style={{ fontSize: '13.5px', fontWeight: 800, letterSpacing: '0.04em' }}>ZOZII</span>
    </div>
  )
}

function CardIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="10" rx="2" />
      <line x1="1.5" y1="6.5" x2="14.5" y2="6.5" />
      <line x1="4" y1="10" x2="7" y2="10" />
    </svg>
  )
}

function SettingsMenu({
  version,
  onReset,
  listenMeeting,
  onListenMeetingChange,
  aiProvider,
  groqConnected,
  onAddConnection,
  onDisconnect,
  onLogout,
}: {
  version: string
  onReset: () => void
  listenMeeting: boolean
  onListenMeetingChange: (enabled: boolean) => void
  aiProvider: 'groq' | 'gemini'
  groqConnected: boolean
  onAddConnection: () => void
  onDisconnect: () => void
  onLogout?: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggleOnTop = (): void => {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    void window.zozii?.setAlwaysOnTop(next)
  }

  const providerName = aiProvider === 'groq' ? 'Groq' : 'Gemini'

  return (
    <div className="settings-wrap" ref={rootRef}>
      <button
        type="button"
        className={`icon-button${open ? ' icon-button--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        title="Settings"
      >
        <GearIcon />
      </button>

      {open && (
        <div className="settings-popover">
          <button type="button" className="settings-row" onClick={toggleOnTop}>
            <span>Always on top</span>
            <span className={`switch-mini${alwaysOnTop ? ' switch-mini--on' : ''}`}>
              <span className="switch-mini-thumb" />
            </span>
          </button>
          <button
            type="button"
            className="settings-row"
            onClick={() => onListenMeetingChange(!listenMeeting)}
            title="Capture participant audio from Teams/Zoom/Meet via system loopback"
          >
            <span>Listen to meeting audio</span>
            <span className={`switch-mini${listenMeeting ? ' switch-mini--on' : ''}`}>
              <span className="switch-mini-thumb" />
            </span>
          </button>
          <div className="settings-divider" />
          <div className="settings-row-info">
            <span>AI Status: {providerName}</span>
            <span className={`status-tag ${groqConnected ? 'status-tag--on' : 'status-tag--off'}`}>
              {groqConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <button
            type="button"
            className="settings-row"
            onClick={() => {
              setOpen(false)
              onAddConnection()
            }}
          >
            <span>Change AI / API Key</span>
          </button>
          {groqConnected && (
            <button
              type="button"
              className="settings-row"
              onClick={() => {
                setOpen(false)
                onDisconnect()
              }}
            >
              <span style={{ color: 'var(--danger)' }}>Disconnect {providerName}</span>
            </button>
          )}
          <div className="settings-divider" />
          <button
            type="button"
            className="settings-row"
            onClick={() => {
              onReset()
              setOpen(false)
            }}
          >
            <span>Clear Conversation</span>
          </button>
          {onLogout && (
            <button
              type="button"
              className="settings-row"
              onClick={() => {
                onLogout()
                setOpen(false)
              }}
            >
              <span style={{ color: 'var(--danger)' }}>Logout</span>
            </button>
          )}
          <button
            type="button"
            className="settings-row"
            onClick={() => { void window.zozii?.openExternal(SITE_URL); setOpen(false) }}
          >
            <span>Visit ZOZII website</span>
          </button>
          <div className="settings-divider" />
          <p className="settings-version">ZOZII v{version} · Nexus Talent</p>
        </div>
      )}
    </div>
  )
}

export default function AssistantHeader(props: AssistantHeaderProps): React.JSX.Element {
  const {
    listening,
    elapsedSeconds,
    version,
    groqConnected,
    aiProvider,
    selectedIds,
    listenMeeting,
    hoverEnabled,
    isCollapsed,
    onToggleHover,
    onToggleCollapse,
    onListenMeetingChange,
    onSelectionChange,
    onToggleListening,
    onResetConversation,
    onAddConnection,
    onDisconnect,
    remainingSeconds,
    questionsRemaining = null,
    onLogout,
  } = props

  // Initial transparency load
  useEffect(() => {
    applyWindowTransparency(loadTransparency())
  }, [])

  // Compute a friendly remaining-time label directly from the remaining budget
  // seconds reported by the server.  No local clock ticking is needed; the value
  // updates on every server response (heartbeat, stop, or periodic revalidate).
  let minsRemaining = '—'
  if (remainingSeconds != null && remainingSeconds > 0) {
    const mins = Math.ceil(remainingSeconds / 60)
    if (mins >= 60 * 24) {
      const days = Math.floor(mins / (60 * 24))
      const hours = Math.floor((mins % (60 * 24)) / 60)
      minsRemaining = `${days}d ${hours}h`
    } else if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const rem = mins % 60
      minsRemaining = `${hours}h ${rem}m`
    } else {
      minsRemaining = `${mins}m`
    }
  } else if (remainingSeconds != null && remainingSeconds <= 0) {
    minsRemaining = 'Expired'
  }

  const qRemaining = questionsRemaining == null ? '∞Q' : `${Math.max(0, questionsRemaining)}Q`

  return (
    <header className="assistant-header">
      <div className="header-left">
        <ZoziiLogo />

        <DomainMultiSelect selectedIds={selectedIds} onChange={onSelectionChange} />

        <button
          type="button"
          className={`pill-btn pill-btn--hover${hoverEnabled ? ' pill-btn--hover-on' : ''}`}
          onClick={onToggleHover}
          title={hoverEnabled ? 'Hover mode ON (dim when mouse leaves)' : 'Hover mode OFF'}
        >
          Hover {hoverEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="header-scroll">
        <button
          type="button"
          className="pill-badge pill-badge--plan"
          title="Remaining access time set by the admin dashboard"
        >
          <CardIcon />
          <span>{minsRemaining} | {qRemaining}</span>
        </button>

        <span className={`session-timer${elapsedSeconds > 0 || listening ? ' session-timer--active' : ''}`}>
          {formatTimer(elapsedSeconds)}
        </span>

        <button
          type="button"
          className={`start-btn${listening ? ' start-btn--stop' : ''}`}
          onClick={onToggleListening}
          title={listening ? 'Stop listening' : 'Start listening'}
        >
          <MicIcon active={listening} />
          <span>{listening ? 'Stop' : 'Start'}</span>
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={onAddConnection}
          title={groqConnected ? `${aiProvider === 'groq' ? 'Groq' : 'Gemini'}: Connected` : 'AI Not Connected - Click to configure'}
        >
          <SignalBarsIcon connected={groqConnected} />
        </button>

        <SettingsMenu
          version={version}
          onReset={onResetConversation}
          listenMeeting={listenMeeting}
          onListenMeetingChange={onListenMeetingChange}
          aiProvider={aiProvider}
          groqConnected={groqConnected}
          onAddConnection={onAddConnection}
          onDisconnect={onDisconnect}
          onLogout={onLogout}
        />

        <button
          type="button"
          className="icon-button"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          <CaretIcon collapsed={isCollapsed} />
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={onResetConversation}
          title="Clear Conversation"
          aria-label="Clear Conversation"
        >
          <TrashIcon />
        </button>

        {onLogout && (
          <button
            type="button"
            className="icon-button"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogoutIcon />
          </button>
        )}
      </div>

      <div className="window-controls">
        <button
          type="button"
          className="win-btn"
          onClick={() => void window.zozii?.minimizeWindow()}
          title="Minimize"
          aria-label="Minimize"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="win-btn win-btn--close"
          onClick={() => void window.zozii?.closeWindow()}
          title="Close App"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}

function MinimizeIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
