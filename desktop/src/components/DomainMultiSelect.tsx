import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OPTION_GROUPS, findOption } from '../lib/options'

interface DomainMultiSelectProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.4 6.4L4.8 8.8L9.6 3.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6.2" cy="6.2" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.4 9.4L12.2 12.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function GlobeIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c-1.8 2-2.7 4-2.7 6.2s.9 4.2 2.7 6.2M8 1.8c1.8 2 2.7 4 2.7 6.2s-.9 4.2-2.7 6.2" />
    </svg>
  )
}

export default function DomainMultiSelect({ selectedIds, onChange }: DomainMultiSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedLabels = useMemo(
    () => selectedIds.map((id) => findOption(id)?.label ?? id),
    [selectedIds],
  )

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return OPTION_GROUPS
    return OPTION_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0)
  }, [query])

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

  useLayoutEffect(() => {
    if (open) {
      setQuery('')
      // Keep the panel inside short/compact windows.
      window.requestAnimationFrame(() => {
        const list = listRef.current
        if (!list) return
        const rect = list.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.top - 8
        list.style.maxHeight = `${Math.max(180, Math.min(340, spaceBelow))}px`
      })
      searchRef.current?.focus()
    }
  }, [open])

  const toggleItem = (id: string): void => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id])
  }

  const triggerText =
    selectedLabels.length === 0
      ? 'General Interview'
      : selectedLabels.length <= 2
        ? selectedLabels.join(' + ')
        : `${selectedLabels[0]} + ${selectedLabels.length - 1} more`

  return (
    <div className="domain-select" ref={rootRef}>
      <button
        type="button"
        className={`domain-trigger${selectedIds.length > 0 ? ' domain-trigger--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={
          selectedLabels.length === 0
            ? 'Select domains and technologies'
            : `Context: ${selectedLabels.join(', ')}`
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <GlobeIcon />
        <span className="domain-trigger-label">{triggerText}</span>
      </button>

      {open && (
        <div className="domain-panel" role="listbox" aria-multiselectable="true">
          <div className="domain-search">
            <SearchIcon />
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder="Search domains, skills, tools..."
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
            />
          </div>

          {selectedIds.length > 0 && (
            <div className="domain-chips">
              {selectedLabels.map((label, index) => (
                <span key={selectedIds[index]} className="chip chip--removable">
                  {label}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => toggleItem(selectedIds[index])}
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path
                        d="M2 2l6 6M8 2l-6 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="domain-list" ref={listRef}>
            {filteredGroups.length === 0 && <p className="domain-empty">No matches for “{query}”</p>}
            {filteredGroups.map((group) => (
              <div key={group.id} className="domain-group">
                <p className="domain-group-label">{group.label}</p>
                {group.items.map((item) => {
                  const checked = selectedIds.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      className={`domain-option${checked ? ' domain-option--checked' : ''}`}
                      onClick={() => toggleItem(item.id)}
                    >
                      <span className="domain-checkbox">{checked && <CheckIcon />}</span>
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="domain-footer">
            <span className="domain-count">
              {selectedIds.length === 0 ? 'Nothing selected' : `${selectedIds.length} selected`}
            </span>
            <div className="domain-footer-actions">
              {selectedIds.length > 0 && (
                <button type="button" className="link-button" onClick={() => onChange([])}>
                  Clear all
                </button>
              )}
              <button type="button" className="done-button" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
