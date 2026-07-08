import React, { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Users, FolderOpen, RefreshCw, AlertCircle, Search, X, Database } from 'lucide-react'
import { emptyParticipant, uid } from '../utils'

// ── Globale Kontaktsuche ──────────────────────────────────────────────────────
// Dedup-Schlüssel identisch zur zentralen Kontaktdatenbank (App.jsx allContacts)
const contactKey = (c) =>
  (c.email || '').trim().toLowerCase() ||
  `${(c.name || '').trim().toLowerCase()}|${(c.company || '').trim().toLowerCase()}`

function ContactSearchPanel({ projectContacts = [], allContacts, participants, onAdd, onClose }) {
  const [q, setQ] = useState('')
  const inputRef  = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const existingEmails = new Set(participants.map(p => p.email).filter(Boolean))
  const projectKeys    = new Set(projectContacts.map(contactKey))

  const term = q.trim().toLowerCase()

  const matches = (c) => {
    if (!term) return true
    return (
      (c.name    ?? '').toLowerCase().includes(term) ||
      (c.company ?? '').toLowerCase().includes(term) ||
      (c.email   ?? '').toLowerCase().includes(term) ||
      (c.role    ?? '').toLowerCase().includes(term) ||
      (c.gewerk  ?? '').toLowerCase().includes(term)
    )
  }

  // Rang: Präfix-Treffer (Name → Firma → E-Mail) vor Teiltreffern → Vorschläge
  // werden mit jedem weiteren Buchstaben konkreter.
  const rank = (c) => {
    if (!term) return 5
    const name  = (c.name    ?? '').toLowerCase()
    const comp  = (c.company ?? '').toLowerCase()
    const email = (c.email   ?? '').toLowerCase()
    if (name.startsWith(term))  return 0
    if (comp.startsWith(term))  return 1
    if (email.startsWith(term)) return 2
    if (name.includes(term))    return 3
    return 4
  }
  const byRank = (a, b) =>
    rank(a) - rank(b) ||
    (a.name || a.company || '').localeCompare(b.name || b.company || '', 'de')

  // Gruppe 1: Kontakte des konkreten Projekts. Gruppe 2: übrige Datenbank.
  const projectResults = projectContacts.filter(matches).sort(byRank)
  const otherResults   = allContacts
    .filter(c => !projectKeys.has(contactKey(c)))
    .filter(matches)
    .sort(byRank)

  const LIMIT      = 50
  const shownProj  = projectResults.slice(0, LIMIT)
  const shownOther = otherResults.slice(0, Math.max(0, LIMIT - shownProj.length))
  const totalShown = shownProj.length + shownOther.length
  const dbCount    = allContacts.length

  const renderRow = (c, fromProject) => {
    const alreadyAdded = !!c.email && existingEmails.has(c.email)
    return (
      <button
        key={`${fromProject ? 'p' : 'a'}-${c.id}-${contactKey(c)}`}
        className={`w-full text-left px-3 py-2 flex items-start gap-3 hover:bg-brand-50 transition-colors
          ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : ''}`}
        onClick={() => { if (!alreadyAdded) { onAdd(c); setQ('') } }}
        disabled={alreadyAdded}
        title={alreadyAdded ? 'Bereits in der Teilnehmerliste' : ''}
      >
        <div className="w-7 h-7 flex-shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold mt-0.5">
          {(c.name || c.company || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{c.name || '–'}</div>
          <div className="text-xs text-gray-500 truncate">
            {[c.company, c.role || c.gewerk].filter(Boolean).join(' · ')}
            {c.email && <span className="ml-1 text-gray-400">{c.email}</span>}
          </div>
        </div>
        {alreadyAdded && <span className="text-xs text-gray-400 flex-shrink-0 self-center">✓</span>}
      </button>
    )
  }

  return (
    <div className="border border-brand-200 bg-white shadow-sm mt-2">
      {/* Suchfeld */}
      <div className="flex items-center gap-2 p-2 border-b border-gray-100">
        <Search size={14} className="text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
          placeholder="Name, Firma oder E-Mail suchen…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="text-gray-400 hover:text-gray-600 flex-shrink-0" onClick={onClose} title="Schließen">
          <X size={14} />
        </button>
      </div>

      {/* Ergebnisliste – Projektkontakte zuerst, dann restliche Datenbank */}
      <div className="max-h-72 overflow-y-auto">
        {totalShown === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Keine Kontakte gefunden.</p>
        )}

        {shownProj.length > 0 && (
          <>
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-500 bg-brand-50/60 border-b border-brand-100 sticky top-0">
              Projektkontakte
            </div>
            <div className="divide-y divide-gray-50">
              {shownProj.map(c => renderRow(c, true))}
            </div>
          </>
        )}

        {shownOther.length > 0 && (
          <>
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border-y border-gray-100 sticky top-0">
              {shownProj.length > 0 ? 'Weitere Kontakte' : 'Alle Kontakte'}
            </div>
            <div className="divide-y divide-gray-50">
              {shownOther.map(c => renderRow(c, false))}
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
        {dbCount} Kontakt{dbCount !== 1 ? 'e' : ''} in der Datenbank
        {term && ` · ${totalShown} Treffer`}
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function ParticipantsList({ participants, onChange, readOnly, projectContacts, allContacts = [] }) {
  const [showSearch, setShowSearch] = useState(false)

  const importFromProject = () => {
    const existing = new Set(participants.map(p => p.email).filter(Boolean))
    const toAdd = (projectContacts ?? [])
      .filter(c => !existing.has(c.email) || !c.email)
      .map(c => ({
        ...emptyParticipant(),
        id:        uid(),
        name:      c.name      ?? '',
        company:   c.company   ?? '',
        role:      c.role      ?? '',
        email:     c.email     ?? '',
        contactId: c.id,
      }))
    if (toAdd.length === 0) return
    onChange([...participants, ...toAdd])
  }

  const addFromDb = (c) => {
    onChange([...participants, {
      ...emptyParticipant(),
      id:      uid(),
      name:    c.name    ?? '',
      company: c.company ?? '',
      role:    c.role    ?? c.gewerk ?? '',
      email:   c.email   ?? '',
    }])
  }

  const add = () => onChange([...participants, emptyParticipant()])

  const update = (id, field, value) =>
    onChange(participants.map(p => p.id === id ? { ...p, [field]: value } : p))

  const remove = (id) => onChange(participants.filter(p => p.id !== id))

  const stale = !readOnly ? participants.filter(p => {
    if (!p.contactId) return false
    const c = (projectContacts ?? []).find(c => c.id === p.contactId)
    if (!c) return false
    return (
      (p.name    ?? '') !== (c.name    ?? '') ||
      (p.company ?? '') !== (c.company ?? '') ||
      (p.role    ?? '') !== (c.role    ?? '') ||
      (p.email   ?? '') !== (c.email   ?? '')
    )
  }) : []

  const syncStale = () => {
    onChange(participants.map(p => {
      if (!p.contactId) return p
      const c = (projectContacts ?? []).find(c => c.id === p.contactId)
      if (!c) return p
      return { ...p, name: c.name ?? '', company: c.company ?? '', role: c.role ?? '', email: c.email ?? '' }
    }))
  }

  const present = participants.filter(p => p.present)
  const absent  = participants.filter(p => !p.present)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="section-title"><Users size={16} /> Eingeladene Teilnehmer</h2>
          {participants.length > 0 && (
            <span className="text-xs text-gray-500">
              {present.length} anwesend{absent.length > 0 ? `, ${absent.length} entschuldigt` : ''}
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-2 no-print flex-wrap">
            {(projectContacts ?? []).length > 0 && (
              <button className="btn-secondary" onClick={importFromProject} title="Projektkontakte als Teilnehmer importieren">
                <FolderOpen size={14} /> Aus Projekt
              </button>
            )}
            {(allContacts.length > 0 || (projectContacts ?? []).length > 0) && (
              <button
                className={`btn-secondary ${showSearch ? 'bg-brand-50 border-brand-300 text-brand-700' : ''}`}
                onClick={() => setShowSearch(v => !v)}
                title="Aus Kontaktdatenbank hinzufügen – Projektkontakte zuerst"
              >
                <Database size={14} /> Datenbank
              </button>
            )}
            <button className="btn-primary" onClick={add}><Plus size={14} /> Hinzufügen</button>
          </div>
        )}
      </div>

      {/* Globale Kontaktsuche */}
      {showSearch && !readOnly && (
        <ContactSearchPanel
          projectContacts={projectContacts ?? []}
          allContacts={allContacts}
          participants={participants}
          onAdd={(c) => { addFromDb(c) }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Stale-data hint */}
      {stale.length > 0 && (
        <div className="no-print flex items-center gap-3 bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          <AlertCircle size={16} className="flex-shrink-0 text-amber-500" />
          <span className="flex-1">
            {stale.length === 1
              ? <>Kontaktdaten von <strong>{stale[0].name || 'einem Teilnehmer'}</strong> haben sich geändert.</>
              : <><strong>{stale.length} Teilnehmer</strong> haben geänderte Kontaktdaten.</>
            }{' '}Anwesenheitsstatus bleibt erhalten.
          </span>
          <button className="btn-secondary text-xs flex-shrink-0" onClick={syncStale}>
            <RefreshCw size={13} /> Kontaktdaten aktualisieren
          </button>
        </div>
      )}

      {participants.length === 0 && (
        <p className="text-sm text-gray-400 italic">Keine eingeladenen Teilnehmer erfasst.</p>
      )}

      {participants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500 w-7">#</th>
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">Firma</th>
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">Funktion</th>
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">E-Mail</th>
                <th className="text-center pb-2 pr-3 text-xs font-medium text-gray-500 w-20">Anwesend</th>
                <th className="pb-2 w-8 no-print" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participants.map((p, i) => {
                const isStale = stale.some(s => s.id === p.id)
                return (
                  <tr key={p.id} className={p.present ? '' : 'opacity-60'}>
                    <td className="py-2 pr-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2 pr-3">
                      {readOnly
                        ? <span className="text-sm text-gray-800">{p.name || '–'}</span>
                        : <input className={`input py-1 ${isStale ? 'border-amber-300' : ''}`} placeholder="Max Mustermann" value={p.name} onChange={e => update(p.id, 'name', e.target.value)} />
                      }
                    </td>
                    <td className="py-2 pr-3">
                      {readOnly
                        ? <span className="text-sm text-gray-700">{p.company || '–'}</span>
                        : <input className={`input py-1 ${isStale ? 'border-amber-300' : ''}`} placeholder="Baufirma GmbH" value={p.company} onChange={e => update(p.id, 'company', e.target.value)} />
                      }
                    </td>
                    <td className="py-2 pr-3">
                      {readOnly
                        ? <span className="text-sm text-gray-700">{p.role || '–'}</span>
                        : <input className={`input py-1 ${isStale ? 'border-amber-300' : ''}`} placeholder="Bauleiter" value={p.role} onChange={e => update(p.id, 'role', e.target.value)} />
                      }
                    </td>
                    <td className="py-2 pr-3">
                      {readOnly
                        ? <span className="text-sm text-gray-500">{p.email || '–'}</span>
                        : <input className={`input py-1 ${isStale ? 'border-amber-300' : ''}`} type="email" placeholder="max@firma.de" value={p.email ?? ''} onChange={e => update(p.id, 'email', e.target.value)} />
                      }
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-brand-600 cursor-pointer"
                        checked={p.present}
                        onChange={e => !readOnly && update(p.id, 'present', e.target.checked)}
                        disabled={readOnly}
                      />
                    </td>
                    {!readOnly && (
                      <td className="py-2 no-print">
                        <button
                          className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => remove(p.id)}
                          title="Entfernen"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
