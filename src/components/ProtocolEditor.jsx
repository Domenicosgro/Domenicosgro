import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeft, Printer, Download, Send, RefreshCw, AlertCircle, Lock, Unlock, FileText, RotateCcw, Layers, Loader, Eye, EyeOff, Users, Box, ClipboardCheck, Paperclip, Trash2, Plus, Upload } from 'lucide-react'
import MeetingHeader    from './MeetingHeader'
import ParticipantsList from './ParticipantsList'
import AgendaDraft      from './AgendaDraft'
import AgendaEmailModal from './AgendaEmailModal'
import ProtocolEmailModal from './ProtocolEmailModal'
import ProtocolItems    from './ProtocolItems'
import ActionItems      from './ActionItems'
import NotesSection     from './NotesSection'
import { formatDate, buildProtocolNo, getChainNo, uid, emptyAgendaItem, distributionFor, emptyContact, isMirrorAction } from '../utils'
import { exportDocx } from '../exportDocx'
import { attachmentStore } from '../attachmentStore'
import GesamtprotokollModal from './GesamtprotokollModal'
import TileSidebar from './TileSidebar'
import ProtocolNotesPanel from './ProtocolNotesPanel'
import ProtocolActionsPanel from './ProtocolActionsPanel'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI
const isServer   = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Carryover helpers ─────────────────────────────────────────────────────────
function carryProtocolItems(predecessorItems) {
  return predecessorItems
    .filter(it => !(it.status === 'erledigt' && it.carriedGray === true))
    .map(it => ({
      ...it,
      id:                 uid(),
      carriedFromId:      it.id,
      carriedGray:        it.status === 'erledigt',
      createdAt:          it.createdAt ?? new Date().toISOString(),
      attachment:         it.status === 'erledigt' ? null : it.attachment,
      // Link zum Agenda-Entwurf des Vorgängers löschen — im neuen Protokoll
      // sollen Hauptpunkte (level 1) als Agenda-Abschnitte sichtbar sein, was
      // nur funktioniert wenn linkedFromAgendaId nicht gesetzt ist.
      linkedFromAgendaId: null,
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

export default function ProtocolEditor({ protocol, protocols, projects, projectContacts, serverUser, logoDataUrl, clientLogoDataUrl, onUpdate, onUpdateProject, onBack, onRefresh, onOpenBim, onOpenBimIssue, notes = [], onCreateNote, onUpdateNote, onDeleteNote }) {
  const change = (patch) => onUpdate(protocol.id, patch)
  const linkedProject  = (projects ?? []).find(p => p.id === protocol.projectId) ?? null
  // Freimeldung genehmigen: Systemadmin oder Projektadmin (Ersteller/Co-Admin)
  const canManageRelease = !!serverUser && (serverUser.role === 'admin'
    || (linkedProject && (linkedProject.projectAdminUser === serverUser.username
        || linkedProject.projectAdmins?.includes(serverUser.username))))
  const linkedFolders  = linkedProject?.linkedFolders ?? []
  const tiles          = linkedProject?.tiles ?? []
  const handleTilesChange = (nextTiles) => {
    if (linkedProject && onUpdateProject) onUpdateProject(linkedProject.id, { tiles: nextTiles })
  }

  // Zentrale Kontaktdatenbank: alle Kontakte aller Projekte (dedupliziert per E-Mail)
  const allContacts = React.useMemo(() => {
    const seen = new Set()
    return (projects ?? []).flatMap(p =>
      (p.contacts ?? []).map(c => ({ ...c, _projectName: p.name }))
    ).filter(c => {
      if (!c.name && !c.email) return false
      const key = c.email ? c.email.toLowerCase() : `${c.name}|${c.company}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [projects])

  // Enriched contact list for task assignment: project contacts + admin users (deduplicated)
  const enrichedProjectContacts = React.useMemo(() => {
    const seen = new Set()
    const result = []
    const add = (c) => {
      if (!c.name && !c.email) return
      const key = c.email ? c.email.toLowerCase() : (c.name || '').toLowerCase().trim()
      if (!key || seen.has(key)) return
      seen.add(key)
      result.push(c)
    }
    ;(projectContacts ?? []).forEach(add)
    ;(linkedProject?.adminContacts ?? []).forEach(add)
    return result
  }, [projectContacts, linkedProject?.adminContacts])

  const [showParticipants, setShowParticipants] = useState(() => {
    try { return localStorage.getItem('kp_show_participants') !== 'false' } catch { return true }
  })
  const toggleParticipants = () => setShowParticipants(v => {
    try { localStorage.setItem('kp_show_participants', String(!v)) } catch {}
    return !v
  })

  const [showEmailModal,       setShowEmailModal]       = useState(false)
  const [confirmClose,         setConfirmClose]         = useState(false)
  const [showGesamtprotokoll,  setShowGesamtprotokoll]  = useState(false)
  const [showProtocolEmail,    setShowProtocolEmail]    = useState(false)
  const [emailMode,            setEmailMode]            = useState('send')   // 'send' | 'freigabe'
  const [printAttachmentData,  setPrintAttachmentData]  = useState({})  // attId → base64
  const [notesOpen,            setNotesOpen]            = useState(false)
  const [actionsOpen,          setActionsOpen]          = useState(false)
  // Beide Seitenpanels teilen sich den rechten Rand → sich gegenseitig ausschließen.
  const openNotes   = (v) => { setNotesOpen(v); if (v) setActionsOpen(false) }
  const openActions = (v) => { setActionsOpen(v); if (v) setNotesOpen(false) }
  const openActionCount = (protocol.actionItems ?? [])
    .filter(a => !isMirrorAction(a) && (a.status === 'offen' || a.status === 'in_arbeit')).length
  const attachInputRef = useRef(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachDragOver, setAttachDragOver] = useState(false)

  // ── Protokoll-Anlagen ───────────────────────────────────────────────────────
  // Beliebige Dateien; sie werden dem E-Mail-Versand (Protokoll + Freigabe)
  // als eigene Anhänge beigefügt und im Anlagenverzeichnis gelistet.
  const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024

  const addProtocolAttachments = async (fileList) => {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    const tooBig = files.filter(f => f.size > MAX_ATTACHMENT_SIZE)
    if (tooBig.length > 0) {
      alert(`Zu groß (max. 25 MB je Datei):\n${tooBig.map(f => f.name).join('\n')}`)
    }
    const usable = files.filter(f => f.size <= MAX_ATTACHMENT_SIZE)
    if (usable.length === 0) return
    setAttachBusy(true)
    try {
      const added = []
      for (const file of usable) {
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload  = () => resolve(String(r.result).split(',')[1])
          r.onerror = reject
          r.readAsDataURL(file)
        })
        const id = uid()
        await attachmentStore.save(id, base64)
        added.push({ id, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size })
      }
      change({ attachments: [...(protocol.attachments ?? []), ...added] })
    } catch {
      alert('Anlage konnte nicht gespeichert werden.')
    } finally {
      setAttachBusy(false)
    }
  }

  const removeProtocolAttachment = async (id) => {
    change({ attachments: (protocol.attachments ?? []).filter(a => a.id !== id) })
    try { await attachmentStore.remove(id) } catch {}
  }
  const [graphSendState,       setGraphSendState]       = useState(null)  // null | 'confirm' | 'sending' | { error } | 'done'

  // Tracks which predecessorId we have already initiated item-carryover for.
  // Prevents double-firing (React Strict Mode, rapid predecessor switches, etc.)
  const carriedForRef       = useRef(null)
  const actionCarriedForRef = useRef(null)   // dito für Maßnahmen

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
    return predecessor.actionItems.filter(
      a => a.status !== 'erledigt' && !a.bimIssueId && !a.planReviewId && !already.has(a.id)
    )
  }, [predecessor, protocol.actionItems])

  // Aus dem Vorgänger werden NUR die Hauptpunkte (Ebene 1) übernommen. Unterpunkte
  // entstehen im neuen Protokoll frisch – direkt in der Agenda oder im Protokoll.
  const pendingItemCarryover = useMemo(() => {
    if (!predecessor) return []
    const already = new Set((protocol.agendaItems ?? []).map(i => i.carriedFromId).filter(Boolean))
    return predecessor.agendaItems.filter(it => {
      if ((it.level ?? 1) !== 1) return false
      if (it.status === 'erledigt' && it.carriedGray === true) return false
      return !already.has(it.id)
    })
  }, [predecessor, protocol.agendaItems])

  // Both handlers recompute which items are genuinely missing at call-time
  // (independent of the memos), so they are safe to call multiple times.

  const handleActionCarryover = () => {
    if (!predecessor) return
    // Dopplungsschutz: nur Maßnahmen übernehmen, deren Vorgänger-ID noch NICHT als
    // carriedFromId im aktuellen Protokoll steht. Spiegel-Einträge (BIM/Planprüfung)
    // werden nicht übernommen – ihr Status wird in der Datenquelle gepflegt.
    const already = new Set((protocol.actionItems ?? []).map(a => a.carriedFromId).filter(Boolean))
    const toCarry = (predecessor.actionItems ?? []).filter(
      a => a.status !== 'erledigt' && !a.bimIssueId && !a.planReviewId && !already.has(a.id)
    )
    if (toCarry.length === 0) return
    const carried = toCarry.map(a => ({ ...a, id: uid(), carriedFromId: a.id, completedAt: null }))
    // actionCarriedFrom persistiert, dass für diesen Vorgänger bereits automatisch
    // übernommen wurde → gelöschte Maßnahmen tauchen beim Wieder-Öffnen nicht erneut auf.
    change({ actionItems: [...(protocol.actionItems ?? []), ...carried], actionCarriedFrom: predecessor.id })
  }

  const handleItemCarryover = () => {
    if (!predecessor) return
    const already = new Set((protocol.agendaItems ?? []).map(i => i.carriedFromId).filter(Boolean))
    // Nur Hauptpunkte (Ebene 1) übernehmen – Unterpunkte werden neu erstellt.
    const toCarry = (predecessor.agendaItems ?? []).filter(it => {
      if ((it.level ?? 1) !== 1) return false
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

  // Auto-carry OFFENE MASSNAHMEN from predecessor – ohne Nachfrage, dopplungssicher.
  // Identisches Schutzmuster wie bei den Protokollpunkten:
  //   – persistenter Marker actionCarriedFrom (verhindert Wiederauftauchen gelöschter)
  //   – Ref-Guard (Strict Mode / schneller Vorgänger-Wechsel)
  //   – Legacy-Check für Bestandsprotokolle ohne Marker
  //   – handleActionCarryover dedupliziert zusätzlich über carriedFromId
  useEffect(() => {
    if (!predecessor?.id || isClosed) return
    if (protocol.actionCarriedFrom === predecessor.id) return
    if (actionCarriedForRef.current === predecessor.id) return
    const predActionIds  = new Set((predecessor.actionItems ?? []).map(a => a.id))
    const alreadyCarried = (protocol.actionItems ?? []).some(a => a.carriedFromId && predActionIds.has(a.carriedFromId))
    if (alreadyCarried) { actionCarriedForRef.current = predecessor.id; return }
    if (pendingActionCarryover.length === 0) return
    actionCarriedForRef.current = predecessor.id
    handleActionCarryover()
  }, [predecessor?.id, protocol.actionCarriedFrom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase inheritance: auto-inherit phase from predecessor when not already set
  useEffect(() => {
    if (!predecessor?.phase) return
    if (protocol.phase) return
    change({ phase: predecessor.phase })
  }, [predecessor?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Sammelt die AKTUELLE Druckansicht (DOM + zusammengefasstes CSS) ein und lässt
  // sie serverseitig via Chrome zu einem durchsuchbaren PDF rendern. Ergebnis ist
  // per Konstruktion identisch zu window.print() (gleiches DOM + CSS, Print-Media),
  // aber deterministisch. Gibt das PDF als base64 zurück – wird von Druck UND
  // Versand genutzt.
  const buildServerPdf = useCallback(async () => {
    // 1. Bild-Anlagen vorab laden → als data:-URL inline im Druck-DOM
    const imageItems = (protocol.agendaItems ?? []).filter(
      item => item.attachment?.id && item.attachment.mimeType?.startsWith('image/')
    )
    if (imageItems.length > 0) {
      const resolved = {}
      await Promise.allSettled(imageItems.map(async (item) => {
        try { const b64 = await attachmentStore.load(item.attachment.id); if (b64) resolved[item.attachment.id] = b64 } catch {}
      }))
      if (Object.keys(resolved).length > 0) flushSync(() => setPrintAttachmentData(resolved))
    }
    try {
      // 2. Gesamtes CSS + Body einsammeln (Skripte entfernen → nur statisches Rendern)
      const css = Array.from(document.styleSheets).map(s => {
        try { return Array.from(s.cssRules).map(r => r.cssText).join('\n') } catch { return '' }
      }).join('\n')
      const body = document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '')
      const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head><body class="${document.body.className}">${body}</body></html>`
      // 3. Serverseitig rendern (Chrome, Print-Media)
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
      const res = await fetch(`/api/protocols/${protocol.id}/render-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ html }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Fehler ${res.status}`) }
      const { pdfBase64 } = await res.json()
      return pdfBase64
    } finally {
      setPrintAttachmentData({})
    }
  }, [protocol.agendaItems, protocol.id])

  const [printing, setPrinting] = useState(false)
  const handlePrint = useCallback(async () => {
    setPrinting(true)
    try {
      const pdfBase64 = await buildServerPdf()
      const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const w = window.open(url, '_blank')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = `${(protocolNo || 'Protokoll').replace(/[/\\:*?"<>|]/g, '-')}.pdf`
        document.body.appendChild(a); a.click(); a.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) {
      alert('PDF konnte nicht erzeugt werden: ' + (e?.message || e))
    } finally {
      setPrinting(false)
    }
  }, [buildServerPdf, protocolNo])

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
        const { blob, filename } = await exportDocx(protocol, chainNo, logoDataUrl, true, clientLogoDataUrl)
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result.split(',')[1])
          reader.onerror = rej
          reader.readAsDataURL(blob)
        })
        const to = (protocol.participants ?? []).filter(p => p.email).map(p => p.email)
        const result = await window.electronAPI.graphSendProtocol({
          to,
          subject:          `Protokoll: ${protocolNo}${protocol.subtitle?.trim() ? ` – ${protocol.subtitle.trim()}` : ''}`,
          bodyText:         `Anbei das Protokoll zur ${protocol.meetingType}${protocol.subtitle?.trim() ? ` – ${protocol.subtitle.trim()}` : ''}${protocol.projectName ? ' – ' + protocol.projectName : ''} vom ${protocol.date ? new Date(protocol.date + 'T12:00:00').toLocaleDateString('de-DE') : ''}.`,
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

  // ── Shared print header (agenda page + cover page use same logo/title block)
  const PrintHeader = ({ subtitle }) => (
    <div className="mb-4">
      <div className="flex items-end justify-between pb-3 border-b border-black">
        <div className="flex-shrink-0 flex items-end gap-4">
          {logoDataUrl
            ? <img src={logoDataUrl} alt="Büro-Logo" className="h-12 max-w-[150px] object-contain" />
            : <div className="h-12 w-8" />
          }
          {clientLogoDataUrl && (
            <img src={clientLogoDataUrl} alt="Auftraggeber-Logo" className="h-12 max-w-[150px] object-contain" />
          )}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest">{subtitle}</div>
          <div className="text-xl font-bold">{protocol.meetingType}</div>
          {protocol.subtitle?.trim() && (
            <div className="text-sm font-semibold">{protocol.subtitle}</div>
          )}
          <div className="text-sm">{protocol.projectName}</div>
        </div>
      </div>
    </div>
  )

  return (
    // Bei offenem Seitenpanel (Notizen/Maßnahmen) wird rechts Platz freigehalten,
    // damit das Protokoll nicht verdeckt und weiterhin parallel bearbeitbar ist.
    <div className={`flex items-start gap-2 px-4 sm:px-6 lg:px-10 py-4 justify-center print:block transition-[padding] ${
      actionsOpen ? 'md:pr-[29rem] print:pr-0' : notesOpen ? 'md:pr-[25rem] print:pr-0' : ''}`}>
    {onCreateNote && (
      <ProtocolNotesPanel
        protocol={protocol}
        protocolRef={protocolNo}
        projectId={protocol.projectId}
        notes={notes}
        onCreateNote={onCreateNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
        open={notesOpen}
        onOpenChange={openNotes}
      />
    )}
    {/* Maßnahmen als rechtsseitiges Panel (Bildschirm-Editor); der Druck kommt
        aus der weiter unten eingebetteten, bildschirmseitig ausgeblendeten ActionItems. */}
    <ProtocolActionsPanel open={actionsOpen} onOpenChange={openActions} openCount={openActionCount}>
      <ActionItems
        items={protocol.actionItems ?? []}
        onChange={actionItems => change({ actionItems })}
        agendaItems={protocol.agendaItems ?? []}
        projectContacts={enrichedProjectContacts}
        protocolId={protocol.id}
        canManageRelease={canManageRelease}
        onOpenBimIssue={onOpenBimIssue}
      />
    </ProtocolActionsPanel>
    <div
      className="flex-1 min-w-0 max-w-[1400px] space-y-0"
      // Datei-Drops ÜBERALL im Protokoll annehmen → landen als Anlage.
      // Ohne preventDefault würde der Browser die Datei stattdessen öffnen.
      // Nur echte Datei-Drags behandeln; interne Agenda-DnD (text/plain) bleibt unberührt.
      onDragOver={!isClosed ? (e => {
        if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
          e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
          if (!attachDragOver) setAttachDragOver(true)
        }
      }) : undefined}
      onDragLeave={!isClosed ? (e => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAttachDragOver(false)
      }) : undefined}
      onDrop={!isClosed ? (e => {
        if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
          e.preventDefault(); setAttachDragOver(false)
          if (e.dataTransfer.files?.length) addProtocolAttachments(e.dataTransfer.files)
        }
      }) : undefined}
    >

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-4 no-print flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Zurück</button>
          <button className="btn-ghost p-2 text-gray-400" title="Daten aktualisieren" onClick={onRefresh}>
            <RotateCcw size={15} />
          </button>
          {onOpenBim && linkedProject?.bimMeta && (
            <button
              className="btn-secondary text-cyan-700 border-cyan-300 hover:border-cyan-400 hover:bg-cyan-50"
              onClick={onOpenBim}
              title="BIM-Modell & Issues öffnen"
            >
              <Box size={15} className="text-cyan-600" /> BIM-Modell
            </button>
          )}
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
          <button className="btn-secondary" onClick={() => exportDocx(protocol, chainNo, logoDataUrl, false, clientLogoDataUrl)}>
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
          {isServer && (
            <button className="btn-secondary" onClick={() => { setEmailMode('freigabe'); setShowProtocolEmail(true) }}
              title="Protokoll vorab zur Freigabe an die Projektbeteiligten senden – Rückmeldung erbeten">
              <ClipboardCheck size={14} /> Zur Freigabe
            </button>
          )}
          {isServer && (
            <button className="btn-secondary" onClick={() => { setEmailMode('send'); setShowProtocolEmail(true) }}
              title="Protokoll als PDF-Anhang an die Teilnehmer senden">
              <Send size={14} /> Per E-Mail
            </button>
          )}
          <button className="btn-secondary" onClick={handlePrint} disabled={printing} title="Erzeugt ein durchsuchbares PDF (serverseitig, immer identisch)">
            {printing ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />} Drucken / PDF
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
        if (protocol.hideAgenda) return null   // Agenda ausgeblendet → nur Protokoll drucken
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
                    ['Datum der Besprechung', formatDate(protocol.date)],
                    ['Ort',                  protocol.location || '–'],
                    ['Einladung',            protocol.preparedBy || '–'],
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
                ['Protokoll-Nr.',        protocolNo],
                ...(protocol.subtitle?.trim() ? [['Bezeichnung', protocol.subtitle]] : []),
                ['Datum der Besprechung', formatDate(protocol.date)],
                ['Erstellt am',          createdDate],
                ['Ort / Raum',           protocol.location || '–'],
                ['Erstellt von',         protocol.preparedBy || '–'],
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

          {/* Nur die als anwesend markierten Teilnehmer im Ausdruck */}
          {present.length > 0 && (
            <>
              <div className="font-bold mb-2 text-sm border-b border-black pb-1 uppercase tracking-wide">
                Teilnehmerliste ({present.length})
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-black text-xs uppercase">
                    <th className="text-left py-1 pr-4 w-6">#</th>
                    <th className="text-left py-1 pr-4">Name</th>
                    <th className="text-left py-1 pr-4">Firma</th>
                    <th className="text-left py-1 pr-4">Funktion</th>
                    <th className="text-left py-1 pr-4">E-Mail</th>
                  </tr>
                </thead>
                <tbody>
                  {present.map((p, i) => (
                    <tr key={p.id}>
                      <td className="py-1.5 pr-4 text-xs">{i + 1}</td>
                      <td className="py-1.5 pr-4 font-medium">{p.name || '–'}</td>
                      <td className="py-1.5 pr-4">{p.company || '–'}</td>
                      <td className="py-1.5 pr-4">{p.role || '–'}</td>
                      <td className="py-1.5 pr-4 text-xs">{p.email || '–'}</td>
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

      {/* Offene Maßnahmen aus dem Vorgänger werden automatisch übernommen (ohne
          Nachfrage, dopplungssicher). Kein manuelles Banner mehr nötig. */}

      {/* ════════════════════════════════════════
          SCREEN: flat protocol document
          ════════════════════════════════════════ */}
      <div className={`divide-y divide-gray-100 ${isClosed ? 'pointer-events-none select-none opacity-90' : ''}`}>

        {/* Meeting header */}
        <div className="py-4">
          <MeetingHeader
            protocol={protocol} protocols={protocols} projects={projects ?? []}
            logoDataUrl={logoDataUrl} clientLogoDataUrl={clientLogoDataUrl}
            onChange={change}
          />
        </div>

        {/* Participants — screen only; print version is on the cover page */}
        <div className="py-6 print:hidden">
          <div className="flex items-center justify-between mb-3 no-print">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <Users size={13} /> Teilnehmer ({(protocol.participants ?? []).length})
            </span>
            <button className="btn-ghost text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1" onClick={toggleParticipants}>
              {showParticipants ? <><EyeOff size={13} /> Ausblenden</> : <><Eye size={13} /> Einblenden</>}
            </button>
          </div>
          {showParticipants && (
            <ParticipantsList
              participants={protocol.participants ?? []}
              onChange={participants => change({ participants })}
              readOnly={isClosed}
              projectContacts={projectContacts ?? []}
              allContacts={allContacts}
            />
          )}
        </div>

        {/* Agenda draft + controls – screen only; print version is above as hidden print:block.
            Über "hideAgenda" aus-/einblendbar; ausgeblendet erscheint die Agenda auch NICHT im Druck. */}
        {!isClosed && (
          protocol.hideAgenda ? (
            <div className="my-4 no-print flex items-center justify-between gap-3 border border-dashed border-gray-200 px-4 py-2.5">
              <span className="text-sm text-gray-400 flex items-center gap-2">
                <EyeOff size={14} /> Agenda ausgeblendet – erscheint nicht im Ausdruck.
              </span>
              <button className="btn-ghost btn-sm text-gray-500 hover:text-gray-800"
                onClick={() => change({ hideAgenda: false })}>
                <Eye size={13} /> Agenda einblenden
              </button>
            </div>
          ) : (
          <div className="py-6 space-y-4 no-print">
            <div className="flex items-center justify-end">
              <button className="btn-ghost btn-sm text-gray-400 hover:text-gray-700"
                title="Agenda ausblenden – sie erscheint dann auch nicht im Ausdruck"
                onClick={() => change({ hideAgenda: true })}>
                <EyeOff size={13} /> Agenda ausblenden
              </button>
            </div>
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
          )
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

        {/* Maßnahmen – am Bildschirm über das rechte Panel bearbeitbar; hier nur
            für den DRUCK eingebettet (Bedienelemente sind ohnehin no-print). */}
        <div className="py-6 hidden print:block">
          <ActionItems
            items={protocol.actionItems ?? []}
            onChange={actionItems => change({ actionItems })}
            agendaItems={protocol.agendaItems ?? []}
            projectContacts={enrichedProjectContacts}
            protocolId={protocol.id}
            canManageRelease={canManageRelease}
            onOpenBimIssue={onOpenBimIssue}
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

        {/* Protokoll-Anlagen (Bildschirm) – werden dem E-Mail-Versand angehängt. */}
        <div className="py-6 no-print">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-200">
            <h2 className="section-title"><Paperclip size={16} /> Anlagen</h2>
          </div>

          {!isClosed && (
            <>
              <input ref={attachInputRef} type="file" className="hidden" multiple
                onChange={e => { addProtocolAttachments(e.target.files); e.target.value = '' }} />
              {/* Immer sichtbares Drop-Feld: klickbar (Dateiauswahl) UND Ablagefläche.
                  Bewusst ein <div> (kein <button>) – manche Browser lehnen Datei-Drops
                  auf Formular-Steuerelementen ab. stopPropagation verhindert, dass der
                  editorweite Drop-Handler dieselbe Datei ein zweites Mal hinzufügt. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => attachInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); attachInputRef.current?.click() } }}
                onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setAttachDragOver(true) }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; if (!attachDragOver) setAttachDragOver(true) }}
                onDragLeave={e => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget)) setAttachDragOver(false) }}
                onDrop={e => {
                  e.preventDefault(); e.stopPropagation(); setAttachDragOver(false)
                  if (e.dataTransfer?.files?.length) addProtocolAttachments(e.dataTransfer.files)
                }}
                className={`mt-3 w-full border-2 border-dashed px-4 py-6 flex flex-col items-center text-center cursor-pointer transition-colors ${
                  attachDragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}
              >
                {attachBusy
                  ? <Loader size={22} className="mb-2 text-brand-600 animate-spin" />
                  : <Upload size={22} className={`mb-2 ${attachDragOver ? 'text-brand-600' : 'text-gray-400'}`} />}
                <span className="text-sm font-medium text-gray-700">
                  {attachDragOver ? 'Datei hier ablegen…' : 'Datei hierher ziehen oder klicken zum Auswählen'}
                </span>
                <span className="text-xs text-gray-400 mt-1">
                  Beliebige Dateien, mehrere möglich, max. 25 MB je Datei – werden beim Versand
                  des Protokolls und zur Freigabe angehängt und im Anlagenverzeichnis gelistet.
                </span>
              </div>
            </>
          )}

          {(protocol.attachments ?? []).length === 0 ? (
            isClosed && <p className="text-sm text-gray-400 italic py-2">Keine Anlagen.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {(protocol.attachments ?? []).map((a, i) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 w-16 flex-shrink-0">Anlage {i + 1}</span>
                  <Paperclip size={13} className="text-brand-600 flex-shrink-0" />
                  <span className="flex-1 truncate text-gray-800">{a.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(a.size)}</span>
                  {!isClosed && (
                    <button className="btn-ghost p-1 text-red-400 hover:text-red-600 flex-shrink-0"
                      title="Anlage entfernen" onClick={() => removeProtocolAttachment(a.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Anlagenverzeichnis (Druck) – am Ende des Protokolls */}
        {(protocol.attachments ?? []).length > 0 && (
          <div className="hidden print:block py-4">
            <h2 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '0.5pt solid #000', paddingBottom: '2mm', marginBottom: '3mm', fontFamily: 'Arial, sans-serif' }}>
              Anlagenverzeichnis
            </h2>
            <table style={{ width: '100%', fontSize: '9pt', fontFamily: 'Arial, sans-serif', borderCollapse: 'collapse' }}>
              <tbody>
                {(protocol.attachments ?? []).map((a, i) => (
                  <tr key={a.id}>
                    <td style={{ padding: '1.5mm 2mm', width: '22mm', verticalAlign: 'top', whiteSpace: 'nowrap' }}>Anlage {i + 1}</td>
                    <td style={{ padding: '1.5mm 2mm', verticalAlign: 'top' }}>{a.name}</td>
                    <td style={{ padding: '1.5mm 2mm', width: '28mm', verticalAlign: 'top', color: '#555', whiteSpace: 'nowrap' }}>
                      {a.mimeType === 'application/pdf' ? 'PDF' : a.mimeType?.startsWith('image/') ? 'Bild' : 'Datei'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '8pt', color: '#555', marginTop: '3mm', fontFamily: 'Arial, sans-serif' }}>
              Die Anlagen sind der E-Mail zu diesem Protokoll als eigene Dateien beigefügt.
            </p>
          </div>
        )}
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
          clientLogoDataUrl={clientLogoDataUrl}
          onClose={() => setShowGesamtprotokoll(false)}
        />
      )}

      {showProtocolEmail && (
        <ProtocolEmailModal
          protocol={protocol}
          protocolNo={protocolNo}
          logoDataUrl={logoDataUrl}
          clientLogoDataUrl={clientLogoDataUrl}
          projectContacts={enrichedProjectContacts}
          distribution={distributionFor(linkedProject, emailMode === 'freigabe' ? 'freigabe' : 'protocol')}
          mode={emailMode}
          buildPdf={buildServerPdf}
          onSaveContact={linkedProject && onUpdateProject
            ? ({ email, name }) => onUpdateProject(linkedProject.id, {
                contacts: [...(linkedProject.contacts ?? []), { ...emptyContact(), name: name || '', email }],
              })
            : undefined}
          onClose={() => setShowProtocolEmail(false)}
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
