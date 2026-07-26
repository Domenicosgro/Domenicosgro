import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useContactUsage } from '../contactUsage'

// Wiederverwendbares Namensfeld mit smarter Suche: Bei Eingabe der ersten
// Buchstaben werden passende Kontakte vorgeschlagen (Treffer in Name/Firma/
// E-Mail/Funktion). Präfix-Treffer stehen vor Teiltreffern → die Vorschläge
// werden mit jedem Buchstaben konkreter. Freitext bleibt jederzeit erlaubt.
// Das Dropdown wird per Portal gerendert, damit es nicht in Tabellen/Scroll-
// Containern abgeschnitten wird.

// Einzufügender Wert (identisch zur bisherigen datalist-Option)
const labelOf = (c) =>
  c.name ? (c.company ? `${c.name} (${c.company})` : c.name) : (c.company || c.email || '')

// extraOptions: feste Einträge, die über den Kontakten stehen, z. B.
// [{ value: 'Info', hint: 'nur zur Kenntnisnahme' }]. Sie sind normale Werte –
// Freitext bleibt daneben jederzeit möglich.
export default function ContactAutocomplete({
  value,
  onChange,
  contacts = [],
  extraOptions = [],
  placeholder = '',
  className = 'input',
  type = 'text',
  title,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi]     = useState(-1)   // hervorgehobener Vorschlag
  const [rect, setRect] = useState(null)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  const { scoreOf, record } = useContactUsage()

  const q = (value || '').toLowerCase().trim()

  const rank = useCallback((c) => {
    if (!q) return 5
    const name = (c.name || '').toLowerCase()
    const comp = (c.company || '').toLowerCase()
    const mail = (c.email || '').toLowerCase()
    if (name.startsWith(q)) return 0
    if (comp.startsWith(q)) return 1
    if (mail.startsWith(q)) return 2
    if (name.includes(q))   return 3
    return 4
  }, [q])

  const matches = useMemo(() => {
    if (!contacts.length) return []
    const hit = (c) => !q
      || (c.name || '').toLowerCase().includes(q)
      || (c.company || '').toLowerCase().includes(q)
      || (c.email || '').toLowerCase().includes(q)
      || (c.role || '').toLowerCase().includes(q)
      || (c.gewerk || '').toLowerCase().includes(q)
    // Nach Anzeige-Wert deduplizieren
    const seen = new Set()
    return contacts
      .filter(hit)
      .map(c => ({ c, label: labelOf(c), score: scoreOf(c) }))
      .filter(({ label }) => label && !seen.has(label) && seen.add(label))
      // Ohne Suchtext: meistgenutzte zuerst. Mit Suchtext: Treffergüte zuerst,
      // Nutzungshäufigkeit als Tiebreak – so werden Vorschläge trotzdem konkreter.
      .sort((a, b) =>
        (q ? rank(a.c) - rank(b.c) : 0)
        || b.score - a.score
        || a.label.localeCompare(b.label, 'de'))
      .slice(0, 10)
  }, [contacts, q, rank, scoreOf])

  // Feste Auswahleinträge zuerst, danach – ohne Suchtext gruppiert – die Kontakte:
  // „Häufig genutzt" (score > 0) vor „Weitere Kontakte".
  const options = useMemo(() => {
    const extra = extraOptions
      .filter(o => !q || o.value.toLowerCase().includes(q))
      .map(o => ({ kind: 'extra', label: o.value, hint: o.hint }))
    const contactRows = matches.map(({ c, label, score }) => ({ kind: 'contact', label, c, score }))
    if (q) return [...extra, ...contactRows]
    const frequent = contactRows.filter(r => r.score > 0)
    const rest     = contactRows.filter(r => r.score <= 0)
    const out = [...extra]
    if (frequent.length) { out.push({ kind: 'header', label: '★ Häufig genutzt' }); out.push(...frequent) }
    if (rest.length)     { if (frequent.length) out.push({ kind: 'header', label: 'Weitere Kontakte' }); out.push(...rest) }
    return out
  }, [extraOptions, q, matches])

  const place = useCallback(() => {
    const el = inputRef.current
    if (el) setRect(el.getBoundingClientRect())
  }, [])

  const openMenu = () => { if (contacts.length || extraOptions.length) { place(); setHi(-1); setOpen(true) } }
  const close    = () => { setOpen(false); setHi(-1) }

  const choose = (opt) => {
    // opt kann ein Options-Objekt (mit Kontakt) oder ein reiner Label-String sein.
    const label = typeof opt === 'string' ? opt : opt.label
    if (typeof opt === 'object' && opt.kind === 'contact') record(opt.c)
    onChange(label); close(); inputRef.current?.focus()
  }

  const isSelectable = (o) => o && o.kind !== 'header'
  const firstSelectable = (from, dir) => {
    for (let i = from; i >= 0 && i < options.length; i += dir) {
      if (isSelectable(options[i])) return i
    }
    return -1
  }

  // Außerhalb klicken / scrollen / Größe ändern → schließen bzw. neu positionieren
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (inputRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      close()
    }
    const onScroll = () => place()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, place])

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown')) { openMenu(); return }
    if (!open) return
    if (e.key === 'ArrowDown')      { e.preventDefault(); setHi(h => { const n = firstSelectable(h + 1, +1); return n === -1 ? h : n }) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => { const n = firstSelectable(h - 1, -1); return n === -1 ? h : n }) }
    else if (e.key === 'Enter')     { if (hi >= 0 && isSelectable(options[hi])) { e.preventDefault(); choose(options[hi]) } }
    else if (e.key === 'Escape')    { close() }
  }

  return (
    <>
      <input
        ref={inputRef}
        type={type}
        className={className}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        value={value ?? ''}
        onChange={e => { onChange(e.target.value); if (!open) openMenu(); else place() }}
        onFocus={openMenu}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && rect && options.length > 0 && createPortal(
        <div
          ref={listRef}
          className="fixed z-[9999] bg-white border border-brand-200 shadow-lg max-h-60 overflow-y-auto text-sm"
          style={{ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 220) }}
        >
          {options.map((o, i) => (
            o.kind === 'header' ? (
              <div key={`h-${o.label}-${i}`}
                className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 sticky top-0">
                {o.label}
              </div>
            ) : (
            <button
              key={`${o.kind}-${o.label}-${i}`}
              type="button"
              className={`w-full text-left px-3 py-1.5 flex flex-col ${i === hi ? 'bg-brand-50' : 'hover:bg-gray-50'} ${
                o.kind === 'extra' ? 'border-l-2 border-sky bg-sky/5' : ''}`}
              onMouseDown={e => { e.preventDefault(); choose(o) }}
              onMouseEnter={() => setHi(i)}
            >
              {o.kind === 'extra' ? (
                <>
                  <span className="text-gray-900 font-medium truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-gray-400 truncate">{o.hint}</span>}
                </>
              ) : (
                <>
                  <span className="text-gray-900 truncate">{o.c.name || o.c.company || o.label}</span>
                  <span className="text-xs text-gray-400 truncate">
                    {[o.c.company && o.c.name ? o.c.company : null, o.c.role || o.c.gewerk, o.c.email].filter(Boolean).join(' · ')}
                  </span>
                </>
              )}
            </button>
            )
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
