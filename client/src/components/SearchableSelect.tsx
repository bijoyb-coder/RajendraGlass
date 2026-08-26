import { useEffect, useRef, useState } from 'react'

export interface SearchableSelectOption {
  value: number
  label: string
}

interface Props {
  value: number | ''
  options: SearchableSelectOption[]
  onChange: (value: number) => void
  placeholder?: string
  className?: string
}

/** A plain-text-searchable dropdown — types to filter, click or Enter to pick. Used in place of a
 * native <select> wherever the option list is long enough that scrolling through it by hand (e.g.
 * hundreds of products by code/description) is slower than typing a few characters. */
export default function SearchableSelect({ value, options, onChange, placeholder = 'Select…', className }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  // Keep the displayed text in sync with the current selection when the dropdown isn't actively
  // being typed into (e.g. after the line's product changes elsewhere, or on first mount).
  useEffect(() => {
    if (!open) setQuery(selected ? selected.label : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(selected ? selected.label : '')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const filtered = query.trim() === ''
    ? options
    : options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))

  function selectOption(o: SearchableSelectOption) {
    onChange(o.value)
    setQuery(o.label)
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); setHighlighted(0) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(0) }}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlighted]) selectOption(filtered[highlighted]) }
          else if (e.key === 'Escape') { setOpen(false); setQuery(selected ? selected.label : '') }
        }}
        className={className}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
          ) : (
            filtered.map((o, i) => (
              <button
                type="button"
                key={o.value}
                onMouseDown={(e) => { e.preventDefault(); selectOption(o) }}
                className={`block w-full text-left px-3 py-2 text-sm truncate ${i === highlighted ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
