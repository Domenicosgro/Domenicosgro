import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Mail, Info, UserPlus, AlertTriangle } from 'lucide-react'
import { DISTRIBUTION_CHANNELS, emptyDistributionRecipient } from '../utils'

// ── Verteiler-Terminal je Projekt ─────────────────────────────────────────────
// Matrix: je Empfänger ein Häkchen je Nachrichtenart. Steuert, wer welche
// Nachrichten erhält – insbesondere die automatischen Wochen-/Statusberichte.
// Der Zustand liegt beim Aufrufer (ProjectAdminPanel), diese Komponente ist
// kontrolliert: recipients + onChange.
export default function ProjectDistribution({ recipients = [], onChange, projectContacts = [], projectUsers = [] }) {
  const [addOpen, setAddOpen] = useState(false)

  const usedEmails = useMemo(
    () => new Set(recipients.map(r => (r.email || '').trim().toLowerCase()).filter(Boolean)),
    [recipients]
  )

  // Vorschläge zum schnellen Hinzufügen: Projektkontakte + Projekt-App-Nutzer mit
  // E-Mail, die noch nicht im Verteiler stehen (nach E-Mail dedupliziert).
  const candidates = useMemo(() => {
    const out = []
    const seen = new Set(usedEmails)
    const add = (name, email, extra) => {
      const key = (email || '').trim().toLowerCase()
      if (!key || !key.includes('@') || seen.has(key)) return
      seen.add(key)
      out.push({ name: (name || '').trim(), email: email.trim(), ...extra })
    }
    for (const c of projectContacts) add(c.name || c.company, c.email, { contactId: c.id ?? null, from: 'Kontakt' })
    for (const u of projectUsers)    add(u.display_name || u.username, u.email, { username: u.username, from: 'Benutzer' })
    return out.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'de'))
  }, [projectContacts, projectUsers, usedEmails])

  const update = (id, patch) =>
    onChange(recipients.map(r => r.id === id ? { ...r, ...patch } : r))

  const toggleChannel = (id, key) => {
    const r = recipients.find(x => x.id === id)
    if (!r) return
    update(id, { channels: { ...r.channels, [key]: !r.channels?.[key] } })
  }

  const remove = (id) => onChange(recipients.filter(r => r.id !== id))

  const addFromCandidate = (c) => {
    onChange([...recipients, {
      ...emptyDistributionRecipient(),
      name: c.name, email: c.email,
      contactId: c.contactId ?? null, username: c.username ?? null,
      scope: c.username ? 'full' : 'short',   // App-Nutzer = intern (Vollbericht)
      channels: { report: true, protocol: false, freigabe: false, actions: false },
    }])
  }

  const addBlank = () => {
    onChange([...recipients, { ...emptyDistributionRecipient(), channels: { report: true, protocol: false, freigabe: false, actions: false } }])
    setAddOpen(false)
  }

  const reportCount = recipients.filter(r => r.channels?.report && (r.email || '').includes('@')).length

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-gray-500 bg-brand-50 border border-brand-100 px-3 py-2">
        <Info size={14} className="flex-shrink-0 mt-0.5 text-brand-600" />
        <div>
          Legen Sie je Empfänger fest, welche Nachrichten dieses Projekts er erhält. Die Auswahl
          steuert die <strong>automatischen Wochen-/Statusberichte</strong> sowie die Vorauswahl beim
          Protokoll- und Aufgabenversand.
          <span className="block mt-0.5 text-amber-700">
            Ohne Empfänger mit Häkchen bei „Bericht“ wird für dieses Projekt <strong>kein</strong> automatischer Bericht versendet.
          </span>
        </div>
      </div>

      {recipients.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-3 text-center border border-dashed border-gray-200">
          Noch keine Empfänger im Verteiler.
        </p>
      ) : (
        <div className="overflow-x-auto border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-left font-medium px-3 py-2">Empfänger</th>
                <th className="text-left font-medium px-3 py-2">Bericht-Umfang</th>
                {DISTRIBUTION_CHANNELS.map(ch => (
                  <th key={ch.key} className="font-medium px-2 py-2 text-center whitespace-nowrap" title={ch.hint}>
                    {ch.label}
                  </th>
                ))}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recipients.map(r => {
                const invalid = !(r.email || '').includes('@')
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 align-top min-w-[13rem]">
                      <input
                        className="input py-1 text-sm w-full"
                        placeholder="Name"
                        value={r.name || ''}
                        onChange={e => update(r.id, { name: e.target.value })}
                      />
                      <div className="flex items-center gap-1 mt-1">
                        <Mail size={11} className={invalid ? 'text-red-400' : 'text-gray-400'} />
                        <input
                          className={`input py-1 text-xs w-full ${invalid ? 'border-red-300' : ''}`}
                          placeholder="E-Mail-Adresse"
                          value={r.email || ''}
                          onChange={e => update(r.id, { email: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        className="select py-1 text-xs"
                        value={r.scope === 'full' ? 'full' : 'short'}
                        onChange={e => update(r.id, { scope: e.target.value })}
                        title="Voll = interner Bericht mit allen Abschnitten, Kurz = gekürzte externe Fassung"
                        disabled={!r.channels?.report}
                      >
                        <option value="full">Voll (intern)</option>
                        <option value="short">Kurz (extern)</option>
                      </select>
                    </td>
                    {DISTRIBUTION_CHANNELS.map(ch => (
                      <td key={ch.key} className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-brand-600"
                          checked={!!r.channels?.[ch.key]}
                          onChange={() => toggleChannel(r.id, ch.key)}
                          title={ch.hint}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center align-middle">
                      <button className="btn-ghost p-1 text-red-400 hover:text-red-600" title="Empfänger entfernen"
                        onClick={() => remove(r.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {reportCount === 0 && recipients.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 flex items-center gap-1.5">
          <AlertTriangle size={12} /> Kein Empfänger für „Bericht“ ausgewählt – es wird kein automatischer Bericht versendet.
        </p>
      )}

      {/* Hinzufügen */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setAddOpen(v => !v)}>
          <Plus size={13} /> Empfänger hinzufügen
        </button>
        {addOpen && (
          <button className="btn-ghost btn-sm text-gray-500" onClick={addBlank}>
            <UserPlus size={13} /> Freie E-Mail-Adresse
          </button>
        )}
      </div>

      {addOpen && candidates.length > 0 && (
        <div className="border border-gray-200 divide-y divide-gray-100 max-h-52 overflow-y-auto">
          <p className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
            Aus Projektkontakten &amp; Projektbenutzern
          </p>
          {candidates.map(c => (
            <button key={c.email} type="button"
              className="w-full text-left px-3 py-2 hover:bg-brand-50 flex items-center gap-2"
              onClick={() => addFromCandidate(c)}>
              <Plus size={12} className="text-brand-600 flex-shrink-0" />
              <span className="text-sm text-gray-900 truncate">{c.name || c.email}</span>
              <span className="badge-gray text-[10px] flex-shrink-0">{c.from}</span>
              <span className="text-xs text-gray-400 ml-auto truncate">{c.email}</span>
            </button>
          ))}
        </div>
      )}
      {addOpen && candidates.length === 0 && (
        <p className="text-xs text-gray-400 px-1">
          Keine weiteren Kontakte/Benutzer mit E-Mail verfügbar – „Freie E-Mail-Adresse“ nutzen.
        </p>
      )}
    </div>
  )
}
