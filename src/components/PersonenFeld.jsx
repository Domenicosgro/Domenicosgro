import React, { useState } from 'react'
import { X, Plus } from 'lucide-react'
import ContactAutocomplete from './ContactAutocomplete'

// ── Zuständigkeit für mehrere Personen ───────────────────────────────────────
//
// Ein Punkt gehört oft nicht einer Person allein: „Fenster OG – Meier und
// Schulz". Das Feld nimmt deshalb beliebig viele Namen auf und zeigt sie als
// Chips.
//
// **Gespeichert wird weiterhin ein Text**, die Namen mit „ · " verbunden.
// Das ist Absicht: Zuständigkeiten stehen im Ausdruck, im PDF, in der E-Mail,
// in der Maßnahme im Protokoll und in der Freimeldung durch die Firma. Ein
// eigenes Datenformat hätte jede dieser Stellen angefasst – und alte Notizen
// hätten umgezogen werden müssen. Ein einzelner Name bleibt genau das, was er
// vorher war; der Mittelpunkt kommt in Namen nicht vor, anders als das Komma
// („Müller, Meier & Co").
export const TRENNER = ' · '

export const personenAus = (wert) =>
  String(wert || '').split('·').map(s => s.trim()).filter(Boolean)

export const personenZu = (liste) => liste.join(TRENNER)

export default function PersonenFeld({
  value,
  onChange,
  quellen = null,
  contacts = [],
  extraOptions = [],
  preferredLabel,
  placeholder = 'Zuständig…',
  className = 'input py-0.5 text-xs w-40',
  disabled = false,
}) {
  const personen = personenAus(value)
  const [entwurf, setEntwurf] = useState('')
  const [offen, setOffen] = useState(personen.length === 0)

  const setzen = (liste) => onChange(personenZu(liste))

  const hinzu = (name) => {
    const sauber = String(name || '').trim()
    if (!sauber) return
    // Doppelte verhindern – zweimal derselbe Name sagt nichts.
    if (personen.some(p => p.toLowerCase() === sauber.toLowerCase())) { setEntwurf(''); return }
    setzen([...personen, sauber])
    setEntwurf('')
  }

  const weg = (name) => setzen(personen.filter(p => p !== name))

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {personen.map(p => (
        <span key={p}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-brand-50 border border-brand-100 text-brand-800 max-w-[12rem]">
          <span className="truncate">{p}</span>
          {!disabled && (
            <button className="text-brand-400 hover:text-red-500 flex-shrink-0"
                    onClick={() => weg(p)} title={`${p} entfernen`}>
              <X size={10} />
            </button>
          )}
        </span>
      ))}

      {offen || personen.length === 0 ? (
        <ContactAutocomplete
          className={className}
          placeholder={personen.length ? 'weitere Person…' : placeholder}
          title="Namen wählen oder eintippen; Enter übernimmt ihn. Mehrere sind möglich."
          value={entwurf}
          onChange={setEntwurf}
          onPick={(label) => hinzu(label)}
          onSubmit={(text) => hinzu(text)}
          quellen={quellen}
          contacts={contacts}
          extraOptions={extraOptions}
          preferredLabel={preferredLabel}
          disabled={disabled}
        />
      ) : !disabled && (
        <button className="btn-ghost p-0.5 text-gray-300 hover:text-brand-600"
                onClick={() => setOffen(true)} title="Weitere Person">
          <Plus size={12} />
        </button>
      )}
    </div>
  )
}
