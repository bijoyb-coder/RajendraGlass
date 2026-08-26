import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

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
 * hundreds of products by code/description) is slower than typing a few characters.
 *
 * The option list is rendered through a portal into document.body, positioned with `fixed`
 * coordinates read off the input's own bounding box. It has to live outside the input's own DOM
 * subtree: every call site so far places this inside a horizontally-scrolling table
 * (`overflow-x-auto`), and setting overflow on one axis forces the browser to compute the other
 * axis to `auto` too — so a plain `position: absolute` panel nested inside that container gets
 * clipped by it instead of floating above the table. */
export default function SearchableSelect({ value, options, onChange, placeholder = 'Select…', className }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; panelWidth: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  // Keep the displayed text in sync with the current selection when the dropdown isn't actively
  // being typed into (e.g. after the line's product changes elsewhere, or on first mount).
  useEffect(() => {
    if (!open) setQuery(selected ? selected.label : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      // The portalled list isn't inside containerRef in the DOM tree — its own onMouseDown
      // (preventDefault + select) already handles clicks on an option, so anything else outside
      // the input closes the list.
      setOpen(false)
      setQuery(selected ? selected.label : '')
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Recompute the portal's position whenever it opens, and keep it pinned to the input while
  // scrolling (the table wrapper, the page, or any other ancestor) or resizing.
  useLayoutEffect(() => {
    if (!open) return
    function updateRect() {
      const r = inputRef.current?.getBoundingClientRect()
      if (!r) return
      // The input itself is often just wide enough for a rate/qty column, far too narrow for a
      // full "code — description" label (the longest product label runs ~72 characters) — so the
      // panel widens to whichever is bigger, capped to the viewport and shifted left if it would
      // otherwise run off the right edge.
      const minPanelWidth = 620
      const panelWidth = Math.min(Math.max(r.width, minPanelWidth), window.innerWidth - 16)
      const left = Math.min(r.left, window.innerWidth - panelWidth - 8)
      setRect({ top: r.bottom, left, width: r.width, panelWidth })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

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
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); setHighlighted(0) }}
        onClick={() => { if (!open) { setOpen(true); setQuery(''); setHighlighted(0) } }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(0) }}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlighted]) selectOption(filtered[highlighted]) }
          else if (e.key === 'Escape') { setOpen(false); setQuery(selected ? selected.label : '') }
        }}
        className={className}
        style={{ paddingRight: '2rem' }}
        autoComplete="off"
      />
      <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      {open && rect && createPortal(
        <div
          style={{ position: 'fixed', top: rect.top + 4, left: rect.left, width: rect.panelWidth }}
          className="z-50 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
          ) : (
            filtered.map((o, i) => (
              <button
                type="button"
                key={o.value}
                onMouseDown={(e) => { e.preventDefault(); selectOption(o) }}
                className={`block w-full text-left px-3 py-2 text-sm whitespace-nowrap ${i === highlighted ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
