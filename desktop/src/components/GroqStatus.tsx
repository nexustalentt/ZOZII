import { useEffect, useRef, useState } from 'react'

interface GroqStatusProps {
  provider: 'groq' | 'gemini'
  connected: boolean
  onAddConnection: () => void
  onDisconnect: () => void
}

export default function GroqStatus({
  provider,
  connected,
  onAddConnection,
  onDisconnect,
}: GroqStatusProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
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

  const providerName = provider === 'groq' ? 'Groq' : 'Gemini'
  const statusText = connected ? `${providerName}: Connected ✓` : `${providerName}: Not Connected`

  return (
    <div className="groq-wrap" ref={rootRef}>
      <button
        type="button"
        className={`groq-pill${connected ? ' groq-pill--on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={statusText}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="groq-dot" aria-hidden="true" />
        <span className="groq-label">{statusText}</span>
      </button>

      {connected && (
        <button
          type="button"
          className="groq-disconnect"
          onClick={() => {
            setOpen(false)
            onDisconnect()
          }}
          title={`Disconnect ${providerName}`}
        >
          Disconnect
        </button>
      )}

      {open && (
        <div className="groq-menu" role="menu">
          <p className={`groq-menu-status${connected ? ' groq-menu-status--on' : ''}`}>{statusText}</p>
          <div className="groq-menu-divider" />
          <button
            type="button"
            className="settings-row"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onAddConnection()
            }}
          >
            Add Connection
          </button>
        </div>
      )}
    </div>
  )
}
