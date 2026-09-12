import { useEffect, useRef, useState } from 'react'
import type { AiProvider } from '../types/zozii'

interface ConnectionDialogProps {
  open: boolean
  provider: AiProvider
  onClose: () => void
  onProviderChange: (provider: AiProvider) => Promise<void>
  onConnected: (provider: AiProvider) => void
}

type ErrorKind = 'invalid' | 'network' | 'model' | null

export default function ConnectionDialog({
  open, provider, onClose, onProviderChange, onConnected,
}: ConnectionDialogProps): React.JSX.Element | null {
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(provider)
  const [apiKey, setApiKey] = useState('')
  const [visible, setVisible] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<ErrorKind>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSelectedProvider(provider)
      setApiKey('')
      setVisible(false)
      setError(null)
      setConnecting(false)
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  if (!open) return null

  const providerName = selectedProvider === 'groq' ? 'API 1' : 'API 2'

  const selectProvider = async (next: AiProvider): Promise<void> => {
    setSelectedProvider(next)
    setApiKey('')
    setError(null)
    await onProviderChange(next)
  }

  const connect = async (): Promise<void> => {
    const key = apiKey.trim()
    if (key.length === 0 || connecting) return
    setConnecting(true)
    setError(null)
    try {
      const result = selectedProvider === 'groq'
        ? await window.zozii?.groqConnect(key)
        : await window.zozii?.geminiConnect(key)
      if (result?.ok) {
        onConnected(selectedProvider)
        onClose()
        return
      }
      setError(result?.reason === 'network' ? 'network' : result?.reason === 'model' ? 'model' : 'invalid')
    } catch {
      setError('network')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="AI provider settings">
        <p className="dialog-title">AI Provider</p>
        <label className="dialog-subtitle" htmlFor="ai-provider-select">Active provider</label>
        <select
          id="ai-provider-select"
          className="dialog-input dialog-select"
          value={selectedProvider}
          disabled={connecting}
          onChange={(event) => void selectProvider(event.target.value as AiProvider)}
        >
          <option value="groq">API 1</option>
          <option value="gemini">API 2</option>
        </select>
        <p className="dialog-subtitle">Enter your {providerName} Key</p>

        <div className="api-key-field">
          <input ref={inputRef} type={visible ? 'text' : 'password'} className="dialog-input" placeholder="**********************" value={apiKey} disabled={connecting} spellCheck={false} autoComplete="off" onChange={(event) => setApiKey(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void connect(); if (event.key === 'Escape') onClose() }} />
          <button type="button" className="key-visibility-button" onClick={() => setVisible((value) => !value)} disabled={connecting}>{visible ? 'Hide' : 'Show'}</button>
        </div>

        {error === 'invalid' && (
          <p className="dialog-error">Invalid {providerName} key. Please check your key and try again.</p>
        )}
        {error === 'network' && (
          <p className="dialog-error">Could not reach {providerName}. Check your internet connection and try again.</p>
        )}
        {error === 'model' && (
          <p className="dialog-error">This project has no text model available. Enable API access or choose a project with model access.</p>
        )}

        <div className="dialog-actions">
          <button type="button" className="link-button" onClick={onClose} disabled={connecting}>
            Cancel
          </button>
          <button
            type="button"
            className="done-button"
            onClick={() => void connect()}
            disabled={connecting || apiKey.trim().length === 0}
          >
            {connecting ? 'Connecting...' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
