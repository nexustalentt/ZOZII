import { useRef } from 'react'

interface ComposerProps {
  value: string
  disabled?: boolean
  transparency: number
  onTransparencyChange: (val: number) => void
  onValueChange: (value: string) => void
  onSubmit: (question: string) => void
  codeOnly: boolean
  onCodeOnlyChange: (codeOnly: boolean) => void
  fullCode: boolean
  onFullCodeChange: (fullCode: boolean) => void
}

function ContrastIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ flexShrink: 0, color: 'rgba(255,255,255,0.7)' }}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 2.5a9.5 9.5 0 0 0 0 19z" fill="currentColor" />
    </svg>
  )
}

function SendIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  )
}

export default function Composer({
  value,
  disabled = false,
  transparency,
  onTransparencyChange,
  onValueChange,
  onSubmit,
  codeOnly,
  onCodeOnlyChange,
  fullCode,
  onFullCodeChange,
}: ComposerProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (): void => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    onSubmit(trimmed)
    onValueChange('')
    inputRef.current?.focus()
  }

  const fillPercent = Math.round(transparency * 100)

  return (
    <div className={`composer-container${disabled ? ' composer-container--disabled' : ''}`}>
      <div className="composer-row">
        <div className="transparency-control" title="Window transparency">
          <ContrastIcon />
          <input
            type="range"
            className="transparency-slider"
            min={0}
            max={1}
            step={0.01}
            value={transparency}
            onChange={(e) => onTransparencyChange(Number(e.target.value))}
            style={{ '--fill': `${fillPercent}%` } as React.CSSProperties}
            aria-label="Window transparency"
          />
        </div>

        <input
          ref={inputRef}
          type="text"
          className="composer-input"
          value={value}
          placeholder={disabled ? 'Listening...' : 'Ask a question...'}
          spellCheck={false}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          aria-label="Ask a question"
        />

        <div className="composer-actions">
          <button
            type="button"
            className={`code-chip${codeOnly ? ' code-chip--active' : ''}`}
            onClick={() => {
              onCodeOnlyChange(!codeOnly)
              if (!codeOnly) onFullCodeChange(false)
            }}
            title="Code only response"
          >
            Code
          </button>
          <button
            type="button"
            className={`code-chip${fullCode ? ' code-chip--active' : ''}`}
            onClick={() => {
              onFullCodeChange(!fullCode)
              if (!fullCode) onCodeOnlyChange(false)
            }}
            title="Full code response"
          >
            Full
          </button>
          <button
            type="button"
            className="send-button"
            onClick={submit}
            disabled={disabled || value.trim().length === 0}
            aria-label="Send question"
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
