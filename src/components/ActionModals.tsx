import { useEffect, useState } from 'react'
import type { AppUser } from '../lib/types'

const DURATION_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: '15 Minutes', minutes: 15 },
  { label: '30 Minutes', minutes: 30 },
  { label: '1 Hour', minutes: 60 },
  { label: '6 Hours', minutes: 360 },
  { label: '12 Hours', minutes: 720 },
  { label: '1 Day', minutes: 1440 },
  { label: '3 Days', minutes: 4320 },
  { label: '7 Days', minutes: 10080 },
  { label: '15 Days', minutes: 21600 },
  { label: '30 Days', minutes: 43200 },
]

const RESET_PRESETS: Array<{ label: string; days: number }> = [
  { label: '1 Day', days: 1 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
]

const EXTEND_PRESETS: Array<{ label: string; days: number; hours: number }> = [
  { label: '6 Hours', days: 0, hours: 6 },
  { label: '1 Day', days: 1, hours: 0 },
  { label: '3 Days', days: 3, hours: 0 },
  { label: '7 Days', days: 7, hours: 0 },
  { label: '15 Days', days: 15, hours: 0 },
  { label: '30 Days', days: 30, hours: 0 },
]

// Shared props for every action modal. Consumers supply onConfirm, not onSubmit.
interface BaseModalProps {
  open: boolean
  user: AppUser | null
  busy: boolean
  error: string | null
  onCancel: () => void
}

type ConsumerProps = BaseModalProps & { onSubmit: () => void }

function renderModal(
  props: ConsumerProps,
  title: string,
  body: React.ReactNode,
  submitLabel: string,
): React.JSX.Element | null {
  const { open, user, busy, error, onCancel, onSubmit } = props
  if (!open || !user) return null
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">{body}</div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={busy}>
            {busy ? 'Applying…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ duration

interface SetDurationProps extends BaseModalProps {
  onConfirm: (minutes: number | null, customExpiry: string | null) => void
}

export function SetDurationModal(props: SetDurationProps): React.JSX.Element | null {
  const { open } = props
  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [minutes, setMinutes] = useState<number>(1440)
  const [customExpiry, setCustomExpiry] = useState('')
  const [customMinutes, setCustomMinutes] = useState<string>('')

  useEffect(() => {
    if (open) {
      setMode('preset')
      setMinutes(1440)
      setCustomExpiry('')
      setCustomMinutes('')
    }
  }, [open])

  return renderModal(
    {
      ...props,
      onSubmit: () => {
        if (mode === 'preset') return props.onConfirm(minutes, null)
        // Custom mode: minutes = usage budget; a filled date/time = wall-clock.
        const customMin = Number(customMinutes)
        if (customMin > 0) return props.onConfirm(customMin, null)
        if (customExpiry) return props.onConfirm(null, customExpiry)
        return props.onConfirm(null, null)
      },
    },
    'Set Access Duration',
    <>
      <div className="preset-grid">
        {DURATION_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`preset-chip ${mode === 'preset' && minutes === p.minutes ? 'chip--active' : ''}`}
            onClick={() => { setMode('preset'); setMinutes(p.minutes) }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`preset-chip ${mode === 'custom' ? 'chip--active' : ''}`}
          onClick={() => setMode('custom')}
        >
          Custom
        </button>
      </div>
      {mode === 'custom' && (
        <div className="custom-row">
          <div className="custom-field">
            <label className="field-label">Custom duration (minutes)</label>
            <input
              type="number"
              min={1}
              className="field-input"
              placeholder="e.g. 45"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
            />
          </div>
          <div className="custom-field">
            <label className="field-label">Or custom expiry date &amp; time</label>
            <input
              type="datetime-local"
              className="field-input"
              value={customExpiry}
              onChange={(e) => setCustomExpiry(e.target.value)}
            />
          </div>
        </div>
      )}
    </>,
    'Set Duration',
  )
}

// ------------------------------------------------------------------ reset

interface ResetAccessProps extends BaseModalProps {
  onConfirm: (days: number | null, customExpiry: string | null) => void
}

export function ResetAccessModal(props: ResetAccessProps): React.JSX.Element | null {
  const { open } = props
  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [days, setDays] = useState<number>(1)
  const [customExpiry, setCustomExpiry] = useState('')
  const [customDays, setCustomDays] = useState<string>('')

  useEffect(() => {
    if (open) {
      setMode('preset')
      setDays(1)
      setCustomExpiry('')
      setCustomDays('')
    }
  }, [open])

  return renderModal(
    {
      ...props,
      onSubmit: () => {
        if (mode === 'preset') return props.onConfirm(days, null)
        // Custom mode: days = usage budget; a filled date/time = wall-clock.
        const customD = Number(customDays)
        if (customD > 0) return props.onConfirm(customD, null)
        if (customExpiry) return props.onConfirm(null, customExpiry)
        return props.onConfirm(null, null)
      },
    },
    'Reset Access Time',
    <>
      <div className="modal-confirm-text">
        Reset access time for <strong>{props.user?.username}</strong>?
      </div>
      <div className="preset-grid">
        {RESET_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`preset-chip ${mode === 'preset' && days === p.days ? 'chip--active' : ''}`}
            onClick={() => { setMode('preset'); setDays(p.days) }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`preset-chip ${mode === 'custom' ? 'chip--active' : ''}`}
          onClick={() => setMode('custom')}
        >
          Custom Duration
        </button>
      </div>
      {mode === 'custom' && (
        <div className="custom-row">
          <div className="custom-field">
            <label className="field-label">Custom days</label>
            <input
              type="number"
              min={1}
              className="field-input"
              placeholder="e.g. 2"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
            />
          </div>
          <div className="custom-field">
            <label className="field-label">Or custom expiry date &amp; time</label>
            <input
              type="datetime-local"
              className="field-input"
              value={customExpiry}
              onChange={(e) => setCustomExpiry(e.target.value)}
            />
          </div>
        </div>
      )}
    </>,
    'Reset Access',
  )
}

// ------------------------------------------------------------------ extend

interface ExtendAccessProps extends BaseModalProps {
  onConfirm: (days: number, hours: number, minutes: number) => void
}

export function ExtendAccessModal(props: ExtendAccessProps): React.JSX.Element | null {
  const { open } = props
  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [days, setDays] = useState(7)
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(0)

  useEffect(() => {
    if (open) {
      setMode('preset')
      setDays(7)
      setHours(0)
      setMinutes(0)
    }
  }, [open])

  return renderModal(
    {
      ...props,
      onSubmit: () => {
        if (mode === 'preset') return props.onConfirm(days, 0, 0)
        return props.onConfirm(days, hours, minutes)
      },
    },
    'Extend Access',
    <>
      {props.user && (
        <div className="modal-hint">
          {props.user.username} — current expiry:{' '}
          {props.user.access_expiry_time
            ? new Date(props.user.access_expiry_time).toLocaleString()
            : '—'}
        </div>
      )}
      <div className="modal-confirm-text">
        Add time to the existing expiry date (timer is not restarted).
      </div>
      <div className="preset-grid">
        {EXTEND_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`preset-chip ${mode === 'preset' && days === p.days && hours === p.hours ? 'chip--active' : ''}`}
            onClick={() => { setMode('preset'); setDays(p.days); setHours(p.hours); setMinutes(0) }}
          >
            +{p.label}
          </button>
        ))}
        <button
          type="button"
          className={`preset-chip ${mode === 'custom' ? 'chip--active' : ''}`}
          onClick={() => setMode('custom')}
        >
          Custom
        </button>
      </div>
      {mode === 'custom' && (
        <div className="custom-row three">
          <div className="custom-field">
            <label className="field-label">Days</label>
            <input
              type="number"
              min={0}
              className="field-input"
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 0)}
            />
          </div>
          <div className="custom-field">
            <label className="field-label">Hours</label>
            <input
              type="number"
              min={0}
              className="field-input"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value) || 0)}
            />
          </div>
          <div className="custom-field">
            <label className="field-label">Minutes</label>
            <input
              type="number"
              min={0}
              className="field-input"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || 0)}
            />
          </div>
        </div>
      )}
    </>,
    'Extend Access',
  )
}