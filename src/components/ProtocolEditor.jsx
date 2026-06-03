import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeft, Printer, Download, Send, RefreshCw, AlertCircle, Lock, Unlock, FileText, RotateCcw, Layers, Loader } from 'lucide-react'
import MeetingHeader    from './MeetingHeader'
import ParticipantsList from './ParticipantsList'
import AgendaDraft      from './AgendaDraft'
import AgendaEmailModal from './AgendaEmailModal'
import ProtocolItems    from './ProtocolItems'
import ActionItems      from './ActionItems'
import NotesSection     from './NotesSection'
import { formatDate, buildProtocolNo, getChainNo, uid, emptyAgendaItem } from '../utils'
import { exportDocx } from '../exportDocx'
import { attachmentStore } from '../attachmentStore'
import GesamtprotokollModal from './GesamtprotokollModal'
import TileSidebar from './TileSidebar'

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
  const existingLinkedIds = new Set(existingItems.map(it => it.linkedFromAgendaId).filter(Boolean))
  const unlinked = (agenda ?? []).filter(a => !a.linkedProtocolItemId && !existingLinkedIds.has(a.id))
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

export default function ProtocolEditor({ protocol, protocols, projects, projectContacts, logoDataUrl, onLogoUpdate, onLogoClear, onUpdate, onUpdateProject, onBack, onRefresh }) {
  const change = (patch) => onUpdate(protocol.id, patch)
  const linkedProject  = (projects ?? []).find(p => p.id === protocol.projectId) ?? null
  const linkedFolders  = linkedProject?.linkedFolders ?? []
  const tiles          = linkedProject?.tiles ?? []
  const handleTilesChange = (nextTiles) => {
    if (linkedProject && onUpdateProject) onUpdateProject(linkedProject.id, { tiles: nextTiles })
  }

  const [showEmailModal,       setShowEmailModal]       = useState(false)
  const [confirmClose,         setConfirmClose]         = useState(false)
  const [showGesamtprotokoll,  setShowGesamtprotokoll]  = useState(false)
  const [printAttachmentData,  setPrintAttachmentData]  = useState({})  // attId → base64
  const [graphSendState,       setGraphSendState]       = useState(null)  // null | 'confirm' | 'sending' | { error } | 'done'

  // Tracks which predecessorId we have already initiated item-carryover for.
  // Prevents double-firing (React Strict Mode, rapid predecessor switches, etc.)
  const carriedForRef = useRef(null)

  const chainNo     = getChainNo(protocol, protocols ?? [])
  const protocolNo  = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)
  const hasChain    = chainNo !== null
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

  // Both handlers recompute which items are genuinely missing at call-time
  // (independent of the memos), so they are safe to call multiple times.

  const handleActionCarryover = () => {
    if (!predecessor) return
    const already = new Set((protocol.actionItems ?? []).map(a => a.carriedFromId).filter(Boolean))
    const toCarry = (predecessor.actionItems ?? []).filter(
      a => a.status !== 'erledigt' && !already.has(a.id)
    )
    if (toCarry.length === 0) return
    const carried = toCarry.map(a => ({ ...a, id: uid(), carriedFromId: a.id, completedAt: null }))
    change({ actionItems: [...(protocol.actionItems ?? []), ...carried] })
  }

  const handleItemCarryover = () => {
    if (!predecessor) return
    const already = new Set((protocol.agendaItems ?? []).map(i => i.carriedFromId).filter(Boolean))
    const toCarry = (predecessor.agendaItems ?? []).filter(it => {
      if (it.status === 'erledigt' && it.carriedGray === true) return false
      return !already.has(it.id)
    })
    if (toCarry.length === 0) return
    const carried = carryProtocolItems(toCarry)
    // itemCarriedFrom persistiert, dass für diesen Vorgänger bereits automatisch
    // übernommen wurde → verhindert, dass gelöschte Punkte beim Wieder-Öffnen
    // erneut eingefügt werden (carriedForRef lebt nur im Speicher).
    change({ agendaItems: [...(protocol.agendaItems ?? []), ...carried], itemCarriedFrom: predecessor.id })
  }

  // Auto-carry protocol items from predecessor.
  // Guard 1 (ref): prevents double-fire within the same component lifecycle
  //   (React Strict Mode runs effects twice; rapid predecessor changes can also
  //   trigger a re-run before the previous state update has propagated).
  // Guard 2 (pendingItemCarryover.length): data-level check so a remount of a
  //   protocol whose items are already present skips the carry silently.
  useEffect(() => {
    if (!predecessor?.id || isClosed) return
    if (protocol.itemCarriedFrom === predecessor.id) return  // persistent: bereits übernommen
    if (carriedForRef.current === predecessor.id) return
    // Legacy-Schutz für Bestandsprotokolle ohne itemCarriedFrom-Marker:
    // wurde bereits mindestens ein Punkt dieses Vorgängers übernommen, gilt der
    // Vorgang als erledigt (sonst tauchen gelöschte Punkte einmalig wieder auf).
    const predItemIds    = new Set((predecessor.agendaItems ?? []).map(i => i.id))
    const alreadyCarried = (protocol.agendaItems ?? []).some(i => i.carriedFromId && predItemIds.has(i.carriedFromId))
    if (alreadyCarried) { carriedForRef.current = predecessor.id; return }
    if (pendingItemCarryover.length === 0) return
    carriedForRef.current = predecessor.id
    handleItemCarryover()
  }, [predecessor?.id, protocol.itemCarriedFrom]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Pre-load attachment blobs for the print view, then call window.print().
  // Uses flushSync to ensure React re-renders before the print dialog opens.
  const handlePrint = useCallback(async () => {
    const prev = document.title
    document.title = protocolNo

    const imageItems = (protocol.agendaItems ?? []).filter(
      item => item.attachment?.id && item.attachment.mimeType?.startsWith('image/')
    )
    if (imageItems.length > 0) {
      const resolved = {}
      await Promise.allSettled(
        imageItems.map(async (item) => {
          try {
            const b64 = await attachmentStore.load(item.attachment.id)
            if (b64) resolved[item.attachment.id] = b64
          } catch {}
        })
      )
      if (Object.keys(resolved).length > 0) {
        flushSync(() => setPrintAttachmentData(resolved))
      }
    }

    window.print()
    setTimeout(() => {
      document.title = prev
      setPrintAttachmentData({})
    }, 500)
  }, [protocol.agendaItems, protocolNo])

  // Allow the Electron menu shortcut (Cmd+P) to also use our async print handler
  const handlePrintRef = useRef(null)
  handlePrintRef.current = handlePrint
  useEffect(() => {
    const handler = () => handlePrintRef.current?.()
    window.addEventListener('app:print', handler)
    return () => window.removeEventListener('app:print', handler)
  }, [])

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

  // Send protocol Word document via Microsoft Graph
  const handleGraphSendProtocol = async () => {
    if (graphSendState === 'confirm') {
      setGraphSendState('sending')
      try {
        const { blob, filename } = await exportDocx(protocol, chainNo, logoDataUrl, true)
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result.split(',')[1])
          reader.onerror = rej
          reader.readAsDataURL(blob)
        })
        const to = (protocol.participants ?? []).filter(p => p.email).map(p => p.email)
        const result = await window.electronAPI.graphSendProtocol({
          to,
          subject:          `Protokoll: ${protocolNo}`,
          bodyText:         `Anbei das Protokoll zur ${protocol.meetingType}${protocol.projectName ? ' – ' + protocol.projectName : ''} vom ${protocol.date ? new Date(protocol.date + 'T12:00:00').toLocaleDateString('de-DE') : ''}.`,
          attachmentBase64: base64,
          attachmentName:   filename,
        })
        if (!result.ok) throw new Error(result.error)
        setGraphSendState('done')
        setTimeout(() => setGraphSendState(null), 4000)
      } catch (err) {
        setGraphSendState({ error: err.message || 'Versand fehlgeschlagen.' })
      }
    } else {
      setGraphSendState('confirm')
    }
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
    <div className="mb-4">
      <div className="flex items-end justify-between pb-3 border-b border-black">
        <div className="flex-shrink-0">
          {logoDataUrl
            ? <img src={logoDataUrl} alt="Logo" className="h-12 max-w-[150px] object-contain" />
            : <div className="h-12 w-8" />
          }
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest">{subtitle}</div>
          <div className="text-xl font-bold">{protocol.meetingType}</div>
          <div className="text-sm">{protocol.projectName}</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex items-start gap-2 px-4 sm:px-6 py-4 justify-center print:block">
    <div className="flex-1 min-w-0 max-w-5xl space-y-0">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-4 no-print flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Zurück</button>
          <button className="btn-ghost p-2 text-gray-400" title="Daten aktualisieren" onClick={onRefresh}>
            <RotateCcw size={15} />
          </button>
        </div>
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
          {hasChain && (
            <button className="btn-secondary" onClick={() => setShowGesamtprotokoll(true)}>
              <Layers size={16} /> Gesamtprotokoll
            </button>
          )}
          <button className="btn-secondary" onClick={() => exportDocx(protocol, chainNo, logoDataUrl)}>
            <FileText size={16} /> Word
          </button>
          {isElectron && window.electronAPI?.graphSendProtocol && (
            graphSendState === 'confirm' ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">An Teilnehmer senden?</span>
                <button className="btn-primary text-xs" onClick={handleGraphSendProtocol}>Ja, senden</button>
                <button className="btn-secondary text-xs" onClick={() => setGraphSendState(null)}>Abbrechen</button>
              </div>
            ) : graphSendState === 'sending' ? (
              <button className="btn-secondary text-xs" disabled>
                <Loader size={12} className="animate-spin" /> Sende…
              </button>
            ) : graphSendState === 'done' ? (
              <span className="text-xs text-green-600 font-medium">✓ Gesendet</span>
            ) : graphSendState?.error ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-600 max-w-xs truncate" title={graphSendState.error}>{graphSendState.error}</span>
                <button className="btn-ghost text-xs text-gray-400" onClick={() => setGraphSendState(null)}>×</button>
              </div>
            ) : (
              <button className="btn-secondary text-xs" onClick={handleGraphSendProtocol} title="Protokoll als Word-Anhang per Outlook versenden">
                <Send size={14} /> Per E-Mail
              </button>
            )
          )}
          <button className="btn-secondary" onClick={handlePrint}>
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
      {(() => {
        const agendaItems   = protocol.agenda ?? []
        const sectionItems  = (protocol.agendaItems ?? []).filter(
          it => it.topic && (it.level ?? 1) === 1 && !it.linkedFromAgendaId
        )
        if (agendaItems.length === 0 && sectionItems.length === 0) return null
        return (
          <div className="hidden print:block">
            <div className="print-agenda-page">
              <PrintHeader subtitle="Einladung / Agenda" />
              <table className="w-full text-sm mb-4 border-collapse">
                <tbody>
                  {[
                    ['Datum',    formatDate(protocol.date)],
                    ['Ort',      protocol.location || '–'],
                    ['Einladung',protocol.preparedBy || '–'],
                  ].map(([l, v]) => (
                    <tr key={l}>
                      <td className="py-1 pr-6 text-xs uppercase tracking-wide w-28">{l}</td>
                      <td className="py-1">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="font-bold text-sm border-b border-black pb-1 mb-1 mt-4 uppercase tracking-wide">Tagesordnung</div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-black text-xs uppercase">
                    <th className="text-left py-1 pr-3 w-10">Nr.</th>
                    <th className="text-left py-1 pr-3">Thema</th>
                    <th className="text-right py-1 pr-3 w-20">Dauer</th>
                    <th className="text-left py-1 w-36">Zuständig</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionItems.length === 0
                    ? agendaItems.map((item, i) => (
                        <tr key={item.id}>
                          <td className="py-2 pr-3 font-semibold">{item.no || i + 1}</td>
                          <td className="py-2 pr-3">
                            <span className="font-medium">{item.topic || '–'}</span>
                            {item.documents && <span className="block text-xs">Unterlagen: {item.documents}</span>}
                          </td>
                          <td className="py-2 pr-3 text-right">{item.duration ? `${item.duration} min` : '–'}</td>
                          <td className="py-2">{item.responsible || '–'}</td>
                        </tr>
                      ))
                    : sectionItems.map(si => {
                        const label   = `${si.no ? si.no + ' – ' : ''}${si.topic}`
                        const linked  = agendaItems.filter(a => a.linkedProtocolItemId === si.id)
                        return (
                          <React.Fragment key={si.id}>
                            <tr>
                              <td colSpan={4} className="pt-3 pb-1 font-bold text-xs uppercase tracking-wide border-t border-gray-400">
                                {label}
                              </td>
                            </tr>
                            {linked.map((item, i) => (
                              <tr key={item.id}>
                                <td className="py-1.5 pr-3 pl-3 font-semibold">{item.no || i + 1}</td>
                                <td className="py-1.5 pr-3">
                                  <span className="font-medium">{item.topic || '–'}</span>
                                  {item.documents && <span className="block text-xs">Unterlagen: {item.documents}</span>}
                                </td>
                                <td className="py-1.5 pr-3 text-right">{item.duration ? `${item.duration} min` : '–'}</td>
                                <td className="py-1.5">{item.responsible || '–'}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        )
                      })
                  }
                </tbody>
                {agendaItems.reduce((s, a) => s + (parseInt(a.duration) || 0), 0) > 0 && (
                  <tfoot>
                    <tr className="border-t border-black">
                      <td colSpan={2} className="pt-2 text-xs">Gesamt</td>
                      <td className="pt-2 text-right text-sm font-bold pr-3">
                        {agendaItems.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)} min
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>

              {present.length > 0 && (
                <div className="mt-5">
                  <div className="text-xs mb-1 uppercase tracking-wide">Eingeladene Teilnehmer</div>
                  <p className="text-sm">{present.map(p => p.name).filter(Boolean).join(' · ')}</p>
                </div>
              )}
            </div>
            <div className="print-page-break" />
          </div>
        )
      })()}

      {/* ════════════════════════════════════════
          PRINT: COVER PAGE (Deckblatt)
          ════════════════════════════════════════ */}
      <div className="hidden print:block">
        <div className="print-cover-page">
          <PrintHeader subtitle="Besprechungsprotokoll" />
          <table className="w-full text-sm mb-6 border-collapse">
            <tbody>
              {[
                ['Protokoll-Nr.', protocolNo],
                ['Datum',         formatDate(protocol.date)],
                ['Ort / Raum',    protocol.location || '–'],
                ['Erstellt von',  protocol.preparedBy || '–'],
                ...(isClosed ? [['Status', 'Abgeschlossen']] : []),
                ...(protocol.nextMeeting ? [['Nächste Besprechung', formatDate(protocol.nextMeeting)]] : []),
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="py-1 pr-6 w-44 text-xs uppercase tracking-wide">{label}</td>
                  <td className="py-1 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(protocol.participants ?? []).length > 0 && (
            <>
              <div className="font-bold mb-2 text-sm border-b border-black pb-1 uppercase tracking-wide">
                Teilnehmerliste ({present.length} anwesend{absent.length > 0 ? `, ${absent.length} entschuldigt` : ''})
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-black text-xs uppercase">
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
                    <tr key={p.id} className={!p.present ? 'italic' : ''}>
                      <td className="py-1.5 pr-4 text-xs">{i + 1}</td>
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
      <div className="hidden print:flex items-center justify-between border-b border-black pb-1 mb-6 text-xs">
        <span className="font-bold">{protocol.projectName} – {protocol.meetingType}</span>
        <span>{protocolNo}{isClosed ? ' · Abgeschlossen' : ''}</span>
      </div>

      {/* ── Carryover banners ── */}
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

        {/* Agenda draft + controls – screen only; print version is above as hidden print:block */}
        {!isClosed && (
          <div className="py-6 space-y-4 no-print">
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
            allTasks={protocol.actionItems ?? []}
            onTasksChange={actionItems => change({ actionItems })}
            readOnly={isClosed}
            projectContacts={projectContacts ?? []}
          />
        </div>

        {/* Action items */}
        <div className="py-6">
          <ActionItems
            items={protocol.actionItems ?? []}
            onChange={actionItems => change({ actionItems })}
            agendaItems={protocol.agendaItems ?? []}
            projectContacts={projectContacts ?? []}
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
        <span className="font-bold">{protocol.projectName || '–'} · {protocol.meetingType}</span>
        <span>{protocolNo}</span>
      </div>

      {/* ── Print: Anlagen ─────────────────────────────────────────────────────
           Each attachment gets its own page. Images get a diagonal watermark
           (the protocol item number). Non-image files get a printed notice.
           ────────────────────────────────────────────────────────────────── */}
      {(protocol.agendaItems ?? []).filter(item => item.attachment).map(item => {
        const att     = item.attachment
        const isImage = att.mimeType?.startsWith('image/')
        return (
          <div key={`pa-${item.id}`} className="hidden print:block"
            style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
            {/* Attachment label */}
            <div style={{
              borderBottom: '0.5pt solid #000', paddingBottom: '3mm', marginBottom: '6mm',
              fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.08em',
              fontFamily: 'Arial, sans-serif',
            }}>
              Anlage {item.no} – {att.name}
            </div>

            {isImage ? (
              /* Image with diagonal item-number watermark */
              <div style={{ position: 'relative' }}>
                <img
                  src={`data:${att.mimeType};base64,${printAttachmentData[att.id] ?? att.data ?? ''}`}
                  alt={att.name}
                  style={{ display: 'block', width: '100%', maxHeight: '248mm', objectFit: 'contain' }}
                />
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', pointerEvents: 'none',
                }}>
                  <span style={{
                    fontFamily: 'Arial, sans-serif', fontWeight: 900,
                    fontSize: '160pt', lineHeight: 1, whiteSpace: 'nowrap',
                    transform: 'rotate(-45deg)', opacity: 0.08,
                    color: '#000', userSelect: 'none',
                  }}>
                    {item.no}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}

      <div className="h-16 no-print" />

      {showEmailModal && (
        <AgendaEmailModal
          protocol={protocol}
          onClose={() => setShowEmailModal(false)}
          onSent={() => change({ agendaSentAt: new Date().toISOString() })}
        />
      )}

      {showGesamtprotokoll && (
        <GesamtprotokollModal
          protocol={protocol}
          protocols={protocols ?? []}
          logoDataUrl={logoDataUrl}
          onClose={() => setShowGesamtprotokoll(false)}
        />
      )}
    </div>

    {/* Tile-Sidebar: sticky rechts neben der Protokollmaske, kein Druck */}
    <div className="no-print hidden sm:block sticky top-4 self-start">
      <TileSidebar
        tiles={tiles}
        linkedFolders={linkedFolders}
        onChange={handleTilesChange}
      />
    </div>
    </div>
  )
}
