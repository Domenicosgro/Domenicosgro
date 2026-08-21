import React, { useState, useEffect, useRef } from 'react'
import { AlertCircle, FunctionSquare } from 'lucide-react'
import { evaluate, isFormula } from '../../kosten/formula'
import { fmtNum } from '../../kosten/calc'

// Eingabezellen der Kostenermittlung.
//
// Konvention aus der Methodendokumentation: bewusst wählbare Eingaben sind
// blau hinterlegt. Berechnete Zellen bleiben grau. Eine Zelle darf statt einer
// Zahl eine Formel enthalten ("=FASS_VHF-FASS_HALLE_A"); außerhalb des Fokus
// wird dann das Ergebnis angezeigt, im Fokus die Formel selbst.

export const CELL_INPUT  = 'w-full px-1.5 py-1 text-sm text-right bg-sky/20 border border-transparent hover:border-sky focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:bg-white'
export const CELL_TEXT   = 'w-full px-1.5 py-1 text-sm text-left bg-sky/20 border border-transparent hover:border-sky focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 focus:bg-white'
export const CELL_STATIC = 'px-1.5 py-1 text-sm text-right text-gray-700 tabular-nums'

/**
 * Zahl-/Formelzelle.
 * @param value    Rohwert ("166", "0,983", "=PERIMETER*2")
 * @param lookup   Namensauflösung für Formeln
 * @param suffix   Einheitenkürzel hinter dem Wert (nur außerhalb des Fokus)
 */
export function ValueCell({ value, onChange, lookup, suffix = '', placeholder = '', align = 'right', title, disabled }) {
  const [focused, setFocused] = useState(false)
  const [buffer,  setBuffer]  = useState(value ?? '')
  const inputRef = useRef(null)

  useEffect(() => { if (!focused) setBuffer(value ?? '') }, [value, focused])

  const raw     = value ?? ''
  const formula = isFormula(raw)
  const res     = formula ? evaluate(raw, { lookup: lookup ?? (() => undefined) }) : null
  const display = focused
    ? buffer
    : formula
      ? (res.error ? '#FEHLER' : fmtNum(res.value) + (suffix ? ' ' + suffix : ''))
      : (raw === '' ? '' : String(raw) + (suffix ? ' ' + suffix : ''))

  const commit = () => {
    setFocused(false)
    if (buffer !== raw) onChange?.(buffer)
  }

  return (
    <div className="relative group">
      <input
        ref={inputRef}
        className={`${align === 'right' ? CELL_INPUT : CELL_TEXT} ${res?.error ? 'bg-red-50 text-red-700' : ''} ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
        value={display}
        placeholder={placeholder}
        title={title ?? (formula ? `${raw}${res?.error ? ' → ' + res.error : ''}` : undefined)}
        onFocus={() => { setBuffer(raw); setFocused(true) }}
        onChange={e => setBuffer(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.currentTarget.blur() }
          if (e.key === 'Escape') { setBuffer(raw); setFocused(false); e.currentTarget.blur() }
        }}
      />
      {formula && !focused && (
        <FunctionSquare
          size={10}
          className={`absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none ${res?.error ? 'text-red-500' : 'text-brand-400'}`}
        />
      )}
      {res?.error && !focused && (
        <span className="absolute -bottom-0.5 right-0 hidden group-hover:block z-20 bg-red-600 text-white text-[10px] px-1.5 py-0.5 whitespace-nowrap">
          {res.error}
        </span>
      )}
    </div>
  )
}

/** Einfaches Textfeld im Tabellenraster. */
export function TextCell({ value, onChange, placeholder = '', title, list }) {
  const [buffer, setBuffer] = useState(value ?? '')
  useEffect(() => { setBuffer(value ?? '') }, [value])
  return (
    <input
      className={CELL_TEXT}
      value={buffer}
      list={list}
      placeholder={placeholder}
      title={title ?? value ?? ''}
      onChange={e => setBuffer(e.target.value)}
      onBlur={() => { if (buffer !== (value ?? '')) onChange?.(buffer) }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

/** Auswahlfeld im Tabellenraster. */
export function SelectCell({ value, onChange, options, className = '' }) {
  return (
    <select
      className={`w-full px-1 py-1 text-xs bg-sky/20 border border-transparent hover:border-sky focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer ${className}`}
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
    >
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  )
}

/** Mehrzeiliges Feld, wächst mit dem Inhalt. */
export function AreaCell({ value, onChange, placeholder = '', rows = 2 }) {
  const [buffer, setBuffer] = useState(value ?? '')
  useEffect(() => { setBuffer(value ?? '') }, [value])
  return (
    <textarea
      rows={rows}
      className="w-full px-1.5 py-1 text-sm bg-sky/20 border border-transparent hover:border-sky focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white resize-y"
      value={buffer}
      placeholder={placeholder}
      onChange={e => setBuffer(e.target.value)}
      onBlur={() => { if (buffer !== (value ?? '')) onChange?.(buffer) }}
    />
  )
}

/** Rechenergebnis, nicht editierbar. */
export function ResultCell({ value, format, strong, className = '' }) {
  return (
    <div className={`${CELL_STATIC} ${strong ? 'font-semibold text-night' : ''} ${className}`}>
      {format ? format(value) : value}
    </div>
  )
}

/** Hinweisleiste für Rechenfehler. */
export function ErrorList({ errors }) {
  if (!errors?.length) return null
  return (
    <div className="card border-l-4 border-l-red-500 p-3 space-y-1">
      <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
        <AlertCircle size={13} /> {errors.length} Rechenhinweis{errors.length !== 1 ? 'e' : ''}
      </p>
      <ul className="text-xs text-red-700 space-y-0.5 list-disc pl-5">
        {errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
        {errors.length > 8 && <li className="list-none text-red-500">… und {errors.length - 8} weitere</li>}
      </ul>
    </div>
  )
}
