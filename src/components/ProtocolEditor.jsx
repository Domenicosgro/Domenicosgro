import React, { useMemo, useState, useEffect } from 'react'
import { ArrowLeft, Printer, Download, Send, RefreshCw, AlertCircle, Lock, Unlock, Building2 } from 'lucide-react'
import MeetingHeader    from './MeetingHeader'
import ParticipantsList from './ParticipantsList'
import AgendaDraft      from './AgendaDraft'
import AgendaEmailModal from './AgendaEmailModal'
import ProtocolItems    from './ProtocolItems'
import ActionItems      from './ActionItems'
import NotesSection     from './NotesSection'
import { formatDate, buildProtocolNo, uid, emptyAgendaItem } from '../utils'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

// ── Carryover helpers ─────────────────────────────────────────────────────────
function carryProtocolItems(predecessorItems) {
  return predecessorItems
    .filter(it => !(it.status === 'erledigt' && it.carriedGray === true))
    .map(it => ({
      ...it,
      id:            uid(),
      carriedFromId: it.id,
      carriedGray:   it.status === 'erledigt',
      createdAt:     it.createdAt ?? new Date().toISOString(),
      // Anlage entfernen sobald Punkt freigemeldet wurde (grau = war erledigt im Vorgänger)
      attachment:    it.status === 'erledigt' ? null : it.attachment,
    }))
}

// On close: only promote UNLINKED agenda items (linked ones are already live in agendaItems)
function promoteAgenda(agenda, existingItems) {
  const unlinked = (agenda ?? []).filter(a => !a.linkedProtocolItemId)
  if (!unlinked.length) return existingItems
  const topMax = existingItems
    .filter(it => (it.level ?? 1) === 1)
    .reduce((m, it) => Math.max(m, parseInt(it.no) || 0), 0)
  return [
    ...existingItems,
    ...unlinked.map((a, i) => ({
      ...emptyAgendaItem(1),
      no:         String(topMax + i + 1),
      topic:      a.topic,
      assignedTo: a.responsible || '',
    })),
  ]
}

export default function ProtocolEditor({ protocol, protocols, projects, projectContacts, logoDataUrl, onLogoUpdate, onLogoClear, onUpdate, onBack }) {
  const change = (patch) => onUpdate(protocol.id, patch)

  const [showEmailModal, setShowEmailModal] = useState(false)
  const [confirmClose,   setConfirmClose]   = useState(false)

  const protocolNo  = buildProtocolNo(protocol.projectName, protocol.date)
  const createdDate = formatDate(protocol.createdAt?.slice(0, 10) ?? protocol.date)
  const isClosed    = !!protocol.isClosed

  const predecessor = useMemo(
    () => protocols.find(p => p.id === protocol.predecessorId) ?? null,
    [protocols, protocol.predecessorId]
  )

  const pendingActionCarryover = useMemo(() => {
    if (!predecessor) return []
    const already = new Set((protocol.actionItems ?? []).map(a => a.carriedFromId).filter(Boolean))
    return predecessor.actionItems.filter(a => a.status !== 'erledigt' && !already.has(a.id))
  }, [predecessor, protocol.actionItems])

  const pendingItemCarryover = useMemo(() => {
    if (!predecessor) return []
    const already = new Set((protocol.agendaItems ?? []).map(i => i.carriedFromId).filter(Boolean))
    return predecessor.agendaItems.filter(it => {
      if (it.status === 'erledigt' && it.carriedGray === true) return false
      return !already.has(it.id)
    })
  }, [predecessor, protocol.agendaItems])

  const handleActionCarryover = () => {
    const carried = pendingActionCarryover.map(a => ({ ...a, id: uid(), carriedFromId: a.id, completedAt: null }))
    change({ actionItems: [...(protocol.actionItems ?? []), ...carried] })
  }
  const handleItemCarryover = () => {
    const carried = carryProtocolItems(pendingItemCarryover)
    change({ agendaItems: [...(protocol.agendaItems ?? []), ...carried] })
  }

  // Live sync: whenever agenda changes, create/move/remove protocol items immediately.
  // "Neu erstellen" (null)  → standalone new Hauptpunkt appended at the end.
  // Linked to Hauptpunkt    → sub-item inserted directly after that parent.
  // Topic/responsible edits → kept in sync on the linked protocol item.
  const handleAgendaChange = (newAgenda) => {
    const oldAgenda = protocol.agenda ?? []
    let agendaItems = [...(protocol.agendaItems ?? [])]

    const subtreeEnd = (arr, idx) => {
      const lvl = arr[idx].level ?? 1
      let i = idx + 1
      while (i < arr.length && (arr[i].level ?? 1) > lvl) i++
      return i
    }

    for (const newItem of newAgenda) {
      const oldItem   = oldAgenda.find(a => a.id === newItem.id)
      const newParent = newItem.linkedProtocolItemId ?? null
      const oldParent = oldItem?.linkedProtocolItemId ?? null
      const isNew     = !oldItem

      if (!isNew && newParent === oldParent) {
        // No structural change — sync topic/responsible on the linked protocol item
        agendaItems = agendaItems.map(it =>
          it.linkedFromAgendaId === newItem.id
            ? { ...it, topic: newItem.topic, assignedTo: newItem.responsible || '' }
            : it
        )
        continue
      }

      // Remove the previous protocol item tied to this agenda item
      agendaItems = agendaItems.filter(it => it.linkedFromAgendaId !== newItem.id)

      if (newParent === null) {
        // "Neu erstellen" → append a new standalone Hauptpunkt
        const topMax = agendaItems
          .filter(it => (it.level ?? 1) === 1)
          .reduce((m, it) => Math.max(m, parseInt(it.no) || 0), 0)
        agendaItems = [
          ...agendaItems,
          {
            ...emptyAgendaItem(1),
            no:                 String(topMax + 1),
            topic:              newItem.topic,
            assignedTo:         newItem.responsible || '',
            linkedFromAgendaId: newItem.id,
          },
        ]
      } else {
        // Link to existing Hauptpunkt → insert as sub-item after its subtree
        const parentIdx = agendaItems.findIndex(it => it.id === newParent)
        if (parentIdx >= 0) {
          const parent      = agendaItems[parentIdx]
          const childLevel  = Math.min((parent.level ?? 1) + 1, 3)
          const parentLevel = parent.level ?? 1
          const prefix      = parent.no || String(parentIdx + 1)
          let maxSuffix     = 0
          for (let i = parentIdx + 1; i < agendaItems.length; i++) {
            const lvl = agendaItems[i].level ?? 1
            if (lvl <= parentLevel) break
            if (lvl === childLevel) {
              const s = parseInt((agendaItems[i].no ?? '').split('.').pop()) || 0
              if (s > maxSuffix) maxSuffix = s
            }
          }
          const insertAt = subtreeEnd(agendaItems, parentIdx)
          agendaItems = [
            ...agendaItems.slice(0, insertAt),
            {
              ...emptyAgendaItem(childLevel),
              no:                 `${prefix}.${maxSuffix + 1}`,
              topic:              newItem.topic,
              assignedTo:         newItem.responsible || '',
              linkedFromAgendaId: newItem.id,
            },
            ...agendaItems.slice(insertAt),
          ]
        }
      }
    }

    // Remove protocol items whose agenda item was deleted
    for (const old of oldAgenda) {
      if (!newAgenda.find(a => a.id === old.id)) {
        agendaItems = agendaItems.filter(it => it.linkedFromAgendaId !== old.id)
      }
    }

    change({ agenda: newAgenda, agendaItems })
  }

  // Close protocol
  const handleClose = () => {
    const promoted = promoteAgenda(protocol.agenda ?? [], protocol.agendaItems ?? [])
    change({
      isClosed:   true,
      closedAt:   new Date().toISOString(),
      agendaItems: promoted,
    })
    setConfirmClose(false)
  }

  const handleReopen = () => {
    if (!confirm('Protokoll wieder öffnen?')) return
    change({ isClosed: false, closedAt: null })
  }

  useEffect(() => {
    const handler = () => { if ((protocol.agenda ?? []).length) setShowEmailModal(true) }
    window.addEventListener('app:send-agenda', handler)
    return () => window.removeEventListener('app:send-agenda', handler)
  }, [protocol.agenda])

  const present = (protocol.participants ?? []).filter(p => p.present)
  const absent  = (protocol.participants ?? []).filter(p => !p.present)

  // ── Shared print header (agenda page + cover page use same logo/title block)
  const PrintHeader = ({ subtitle }) => (
    <div className="flex items-start justify-between mb-6">
      {logoDataUrl
        ? <img src={logoDataUrl} alt="Logo" className="h-14 max-w-[180px] object-contain" />
        : <Building2 size={32} className="text-brand-600" />
      }
      <div className="text-right">
        <div className="text-xs text-gray-400 uppercase tracking-widest">{subtitle}</div>
        <div className="text-xl font-bold text-gray-900">{protocol.meetingType}</div>
        <div className="text-sm text-gray-600">{protocol.projectName}</div>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-0">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-4 no-print flex-wrap gap-2">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Zurück</button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-xs text-gray-400 hidden sm:inline">
            Gespeichert: {new Date(protocol.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isClosed && <span className="badge-gray flex items-center gap-1"><Lock size={11} /> Abgeschlossen</span>}
          {isElectron && (
            <button className="btn-secondary" onClick={() => window.electronAPI.exportJSON(protocol)}>
              <Download size={16} /> Exportieren
            </button>
          )}
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Drucken / PDF
          </button>
          {isClosed
            ? <button className="btn-secondary text-amber-600 border-amber-300" onClick={handleReopen}>
                <Unlock size={15} /> Protokoll öffnen
              </button>
            : <button className="btn-primary bg-green-700 hover:bg-green-800 focus:ring-green-600"
                onClick={() => setConfirmClose(true)}>
                <Lock size={15} /> Protokoll abschließen
              </button>
          }
        </div>
      </div>

      {/* ── Close confirmation dialog ── */}
      {confirmClose && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Lock size={18} className="text-green-700" /> Protokoll abschließen
            </h3>
            <p className="text-sm text-gray-600">
              Folgendes wird beim Abschließen ausgeführt:
            </p>
            <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
              <li>Alle Agenda-Punkte werden als Protokollpunkte übernommen</li>
              <li>Verknüpfte Agenda-Punkte aktualisieren bestehende Protokollpunkte</li>
              <li>Das Protokoll wird als <strong>Abgeschlossen</strong> markiert</li>
              <li>Inhalte können danach nicht mehr bearbeitet werden</li>
            </ul>
            <div className="flex gap-3 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setConfirmClose(false)}>Abbrechen</button>
              <button className="btn-primary bg-green-700 hover:bg-green-800 focus:ring-green-600" onClick={handleClose}>
                <Lock size={14} /> Jetzt abschließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          PRINT: AGENDA PAGE
          ════════════════════════════════════════ */}
      {(protocol.agenda ?? []).length > 0 && (
        <div className="hidden print:block">
          <div className="print-agenda-page">
            <PrintHeader subtitle="Einladung / Agenda" />
            <table className="w-full text-sm mb-6 border-collapse">
              <tbody>
                {[
                  ['Datum',    formatDate(protocol.date)],
                  ['Ort',      protocol.location || '–'],
                  ['Einladung',protocol.preparedBy || '–'],
                ].map(([l, v]) => (
                  <tr key={l} className="border-b border-gray-100">
                    <td className="py-1.5 pr-6 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">{l}</td>
                    <td className="py-1.5 font-medium text-gray-900">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {protocol.agendaGreeting && (
              <p className="text-sm text-gray-700 mb-5 whitespace-pre-line">{protocol.agendaGreeting}</p>
            )}

            <div className="font-semibold text-gray-800 text-sm border-b-2 border-gray-700 pb-1 mb-2">Tagesordnung</div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-300 text-xs text-gray-500 uppercase">
                  <th className="text-left py-1 pr-3 w-10">Nr.</th>
                  <th className="text-left py-1 pr-3">Thema</th>
                  <th className="text-right py-1 pr-3 w-20">Dauer</th>
                  <th className="text-left py-1 w-36">Zuständig</th>
                </tr>
              </thead>
              <tbody>
                {(protocol.agenda ?? []).map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-semibold text-gray-600">{item.no || i + 1}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{item.topic || '–'}</span>
                      {item.documents && <span className="block text-xs text-gray-400">Unterlagen: {item.documents}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-500">{item.duration ? `${item.duration} min` : '–'}</td>
                    <td className="py-2 text-gray-500">{item.responsible || '–'}</td>
                  </tr>
                ))}
              </tbody>
              {(protocol.agenda ?? []).reduce((s, a) => s + (parseInt(a.duration) || 0), 0) > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-300">
                    <td colSpan={2} className="pt-2 text-xs text-gray-500">Gesamt</td>
                    <td className="pt-2 text-right text-sm font-semibold text-brand-700 pr-3">
                      {(protocol.agenda ?? []).reduce((s, a) => s + (parseInt(a.duration) || 0), 0)} min
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>

            {present.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Eingeladene Teilnehmer</div>
                <p className="text-sm text-gray-700">{present.map(p => p.name).filter(Boolean).join(' · ')}</p>
              </div>
            )}
          </div>
          <div className="print-page-break" />
        </div>
      )}

      {/* ════════════════════════════════════════
          PRINT: COVER PAGE (Deckblatt)
          ════════════════════════════════════════ */}
      <div className="hidden print:block">
        <div className="print-cover-page">
          <PrintHeader subtitle="Besprechungsprotokoll" />
          <table className="w-full text-sm mb-8 border-collapse">
            <tbody>
              {[
                ['Protokoll-Nr.', protocolNo],
                ['Datum',         formatDate(protocol.date)],
                ['Ort / Raum',    protocol.location || '–'],
                ['Erstellt von',  protocol.preparedBy || '–'],
                ...(isClosed ? [['Status', 'Abgeschlossen']] : []),
                ...(protocol.nextMeeting ? [['Nächste Besprechung', formatDate(protocol.nextMeeting)]] : []),
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-gray-200">
                  <td className="py-2 pr-6 font-medium text-gray-500 w-44 text-xs uppercase tracking-wide">{label}</td>
                  <td className="py-2 text-gray-900 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(protocol.participants ?? []).length > 0 && (
            <>
              <div className="font-semibold text-gray-700 mb-2 text-sm border-b border-gray-300 pb-1">
                Teilnehmerliste ({present.length} anwesend{absent.length > 0 ? `, ${absent.length} entschuldigt` : ''})
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300 text-xs text-gray-500 uppercase">
                    <th className="text-left py-1 pr-4 w-6">#</th>
                    <th className="text-left py-1 pr-4">Name</th>
                    <th className="text-left py-1 pr-4">Firma</th>
                    <th className="text-left py-1 pr-4">Funktion</th>
                    <th className="text-left py-1 pr-4">E-Mail</th>
                    <th className="text-center py-1 w-20">Anwesend</th>
                  </tr>
                </thead>
                <tbody>
                  {protocol.participants.map((p, i) => (
                    <tr key={p.id} className={`border-b border-gray-100 ${!p.present ? 'text-gray-400 italic' : ''}`}>
                      <td className="py-1.5 pr-4 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-1.5 pr-4 font-medium">{p.name || '–'}</td>
                      <td className="py-1.5 pr-4">{p.company || '–'}</td>
                      <td className="py-1.5 pr-4">{p.role || '–'}</td>
                      <td className="py-1.5 pr-4 text-xs">{p.email || '–'}</td>
                      <td className="py-1.5 text-center">{p.present ? '✓' : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="print-page-break" />
      </div>

      {/* ── Print running header ── */}
      <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-1 mb-6 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{protocol.projectName} – {protocol.meetingType}</span>
        <span>{protocolNo}{isClosed ? ' · Abgeschlossen' : ''}</span>
      </div>

      {/* ── Carryover banners ── */}
      {pendingItemCarryover.length > 0 && !isClosed && (
        <div className="no-print flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-800 mb-4">
          <AlertCircle size={18} className="flex-shrink-0 text-indigo-500" />
          <div className="flex-1">
            <strong>{pendingItemCarryover.length} Protokollpunkt{pendingItemCarryover.length !== 1 ? 'e' : ''}</strong>{' '}
            aus dem Vorgänger noch nicht übernommen.
            <span className="block text-xs text-indigo-600 mt-0.5">Erledigte werden grau dargestellt, danach ausgeblendet.</span>
          </div>
          <button className="btn-primary text-xs" onClick={handleItemCarryover}><RefreshCw size={14} /> Übernehmen</button>
        </div>
      )}
      {pendingActionCarryover.length > 0 && !isClosed && (
        <div className="no-print flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mb-4">
          <AlertCircle size={18} className="flex-shrink-0 text-blue-500" />
          <div className="flex-1">
            <strong>{pendingActionCarryover.length} offene Maßnahme{pendingActionCarryover.length !== 1 ? 'n' : ''}</strong>{' '}
            aus dem Vorgänger noch nicht übernommen.
          </div>
          <button className="btn-primary text-xs" onClick={handleActionCarryover}><RefreshCw size={14} /> Übernehmen</button>
        </div>
      )}

      {/* ════════════════════════════════════════
          SCREEN: flat protocol document
          ════════════════════════════════════════ */}
      <div className={`divide-y divide-gray-100 ${isClosed ? 'pointer-events-none select-none opacity-90' : ''}`}>

        {/* Meeting header */}
        <div className="py-4">
          <MeetingHeader
            protocol={protocol} protocols={protocols} projects={projects ?? []}
            logoDataUrl={logoDataUrl} onLogoUpdate={onLogoUpdate} onLogoClear={onLogoClear}
            onChange={change}
          />
        </div>

        {/* Participants — screen only; print version is on the cover page */}
        <div className="py-6 print:hidden">
          <ParticipantsList
            participants={protocol.participants ?? []}
            onChange={participants => change({ participants })}
            readOnly={isClosed}
            projectContacts={projectContacts ?? []}
          />
        </div>

        {/* Agenda draft + controls */}
        {!isClosed && (
          <div className="py-6 space-y-4">
            <AgendaDraft
              agenda={protocol.agenda ?? []}
              agendaGreeting={protocol.agendaGreeting ?? ''}
              agendaSentAt={protocol.agendaSentAt}
              protocolItems={protocol.agendaItems ?? []}
              projectContacts={projectContacts ?? []}
              onChange={handleAgendaChange}
              onChangeGreeting={agendaGreeting => change({ agendaGreeting })}
            />
            <div className="flex items-center gap-3 flex-wrap no-print">
              <button className="btn-primary" onClick={() => setShowEmailModal(true)}
                disabled={!(protocol.agenda ?? []).length}>
                <Send size={14} /> Agenda versenden
              </button>
              <span className="text-xs text-gray-400">Verknüpfte Agendapunkte erscheinen sofort als Unterpunkt im Protokoll.</span>
            </div>
          </div>
        )}

        {/* Protocol points */}
        <div className="py-6">
          <ProtocolItems
            items={protocol.agendaItems ?? []}
            onChange={agendaItems => change({ agendaItems })}
            readOnly={isClosed}
            projectContacts={projectContacts ?? []}
          />
        </div>

        {/* Action items */}
        <div className="py-6">
          <ActionItems
            items={protocol.actionItems ?? []}
            onChange={actionItems => change({ actionItems })}
          />
        </div>

        {/* Notes */}
        <div className="py-6">
          <NotesSection
            notes={protocol.notes ?? ''}
            onChange={notes => change({ notes })}
            readOnly={isClosed}
          />
        </div>
      </div>

      {/* ── Print footer (every page) ── */}
      <div className="print-footer hidden print:flex">
        <span>{protocol.projectName || '–'} · {protocol.meetingType}</span>
        <span className="font-semibold">{protocolNo}</span>
        <span>Erstellt: {createdDate}{protocol.preparedBy ? ' · ' + protocol.preparedBy : ''}{isClosed ? ' · Abgeschlossen' : ''}</span>
      </div>

      <div className="h-16 no-print" />

      {showEmailModal && (
        <AgendaEmailModal
          protocol={protocol}
          onClose={() => setShowEmailModal(false)}
          onSent={() => change({ agendaSentAt: new Date().toISOString() })}
        />
      )}
    </div>
  )
}
