import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { validNummer, validKuerzel, composeName } from './ProjektdatenView'

/**
 * Anlage eines neuen Projekts mit Codierung (3–4 Ziffern · 3–4 Buchstaben/Ziffern ·
 * Bezeichnung). Ruft onCreate({ name, projectData }) auf; der Aufrufer legt
 * das Projekt an und entscheidet über Defaults (z. B. onProtocolBoard).
 */
export default function NewProjectModal({ onCreate, onClose }) {
  const [nummer,      setNummer]      = useState('')
  const [kuerzel,     setKuerzel]     = useState('')
  const [ausnahme,    setAusnahme]    = useState(false)
  const [bezeichnung, setBezeichnung] = useState('')

  const nummerOk  = validNummer(nummer)
  const kuerzelOk = ausnahme ? kuerzel.trim().length > 0 : validKuerzel(kuerzel)
  const name      = composeName(nummer, kuerzel, bezeichnung)
  const valid     = nummerOk && kuerzelOk && bezeichnung.trim().length > 0

  const submit = () => {
    if (!valid) return
    onCreate({
      name,
      projectData: { nummer, kuerzel, kuerzelAusnahme: ausnahme, bezeichnung: bezeichnung.trim() },
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md border border-gray-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Plus size={16} className="text-brand-600" /> Neues Projekt</h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-400">Codierung: 3–4 Ziffern · 3–4 Buchstaben/Ziffern · Projektbezeichnung</p>
          <div className="grid grid-cols-[100px_120px] gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nummer *</label>
              <input className={`input font-mono ${nummer && !nummerOk ? 'border-red-400' : ''}`}
                placeholder="1234" maxLength={4} autoFocus value={nummer}
                onChange={e => setNummer(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Kürzel *
                <label className="ml-1.5 font-normal text-gray-400 cursor-pointer">
                  <input type="checkbox" className="mr-0.5 align-middle" checked={ausnahme}
                    onChange={e => setAusnahme(e.target.checked)} />Ausnahme
                </label>
              </label>
              <input className={`input font-mono uppercase ${kuerzel && !kuerzelOk ? 'border-red-400' : ''}`}
                placeholder="MUST" maxLength={ausnahme ? 12 : 4} value={kuerzel}
                onChange={e => setKuerzel(ausnahme ? e.target.value : e.target.value.replace(/[^A-Za-z0-9ÄÖÜäöüß]/g, '').toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Projektbezeichnung *</label>
            <input className="input" placeholder="z. B. Neubau Produktionshalle Musterstadt"
              value={bezeichnung} onChange={e => setBezeichnung(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          {name && (
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 px-3 py-2">
              Projektname: <strong className="text-night">{name}</strong>
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={!valid} onClick={submit}>
            <Plus size={14} /> Projekt anlegen
          </button>
        </div>
      </div>
    </div>
  )
}
