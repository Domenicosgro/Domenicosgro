import React, { useState, useMemo, useEffect } from 'react'
import { ArrowLeft, AlertTriangle, CheckSquare, Filter, X, Lock, BarChart2,
         Mail, Send, Loader, ChevronDown, ChevronRight, Check, Box, Eye } from 'lucide-react'
import { ACTION_STATUSES, PRIORITIES, formatDate, buildProtocolNo, getChainNo,
         statusBadge, priorityBadge } from '../utils'
import FreimeldungBadge from './FreimeldungBadge'

const BIM_STATUS_CFG = {
  offen:       { label: 'Offen',       badge: 'bg-red-100 text-red-700 border-red-300' },
  in_arbeit:   { label: 'In Arbeit',   badge: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  erledigt:    { label: 'Erledigt',    badge: 'bg-green-100 text-green-700 border-green-300' },
  geschlossen: { label: 'Geschlossen', badge: 'bg-gray-100 text-gray-500 border-gray-300' },
}
const BIM_TYPE_CFG = {
  fehler:     'Fehler',
  anfrage:    'Anfrage',
  info:       'Info',
  sicherheit: 'Sicherheit',
}
const BIM_PRIORITY_CFG = {
  hoch:    { label: 'Hoch',    color: 'text-red-600' },
  mittel:  { label: 'Mittel',  color: 'text-yellow-600' },
  niedrig: { label: 'Niedrig', color: 'text-gray-400' },
}

const isServer   = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const isElectron = typeof window !== 'undefined' && !!window.electronAPI
const todayStr   = () => new Date().toISOString().slice(0, 10)

function calcOverdue(item) {
  return !!(item.deadline && item.status !== 'erledigt' && item.deadline < todayStr())
}

// ── E-Mail-Plaintext aufbauen (mailto-Fallback) ────────────────────────────────
function buildActionsText(responsible, projectName, items) {
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const STATUS = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }
  const lines = [
    `Ihre Aufgaben – ${projectName}`,
    `Stand: ${today}`, '',
    `Guten Tag, ${responsible},`,
    '',
    `nachfolgend finden Sie eine Übersicht Ihrer ${items.length} Aufgabe${items.length !== 1 ? 'n' : ''} aus dem Projekt ${projectName}.`,
    `Wir bitten Sie, die Aufgaben fristgerecht zu erfüllen.`,
    `Der Status wird in der folgenden Projektbesprechung entsprechend aktualisiert.`,
    '',
    ...items.map(item => {
      const dl = item.deadline
        ? new Date(item.deadline + 'T12:00:00').toLocaleDateString('de-DE') : '–'
      return `• ${item.description || '–'}\n  Protokoll: ${item._protocolNo || '–'} | Frist: ${dl} | Status: ${STATUS[item.status] || item.status}`
    }),
    '', 'GHBA',
  ]
  return lines.join('\n')
}

// ── E-Mail-Modal ──────────────────────────────────────────────────────────────
function EmailModal({ groups, onClose }) {
  const gk = (g) => `${g.responsible}||${g.projectId}`

  const [emails,   setEmails]   = useState(() => Object.fromEntries(groups.map(g => [gk(g), g.email])))
  const [expanded, setExpanded] = useState({})
  const [loading,  setLoading]  = useState({})
  const [done,     setDone]     = useState({})
  const [errors,   setErrors]   = useState({})

  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const sendOne = async (g) => {
    const key   = gk(g)
    const email = emails[key]?.trim()
    if (!email) return

    setLoading(p => ({ ...p, [key]: true }))
    setErrors(p => ({ ...p, [key]: '' }))
    try {
      if (isServer) {
        const token = localStorage.getItem('kp_session_token')
        const resp  = await fetch('/api/actions/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ to: email, responsible: g.responsible, projectName: g.projectName, projectId: g.projectId, items: g.items }),
        })
        if (!resp.ok) {
          const err = await resp.json()
          throw new Error(err.error || 'Fehler beim Senden')
        }
      } else {
        const body   = buildActionsText(g.responsible, g.projectName, g.items)
        const subj   = `Ihre Aufgaben – ${g.projectName} – Stand ${today}`
        const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`
        if (isElectron) await window.electronAPI.openExternal(mailto)
        else window.open(mailto, '_blank')
      }
      setDone(p => ({ ...p, [key]: true }))
    } catch (e) {
      setErrors(p => ({ ...p, [key]: e.message }))
    } finally {
      setLoading(p => ({ ...p, [key]: false }))
    }
  }

  const sendAll = async () => {
    for (const g of groups) {
      const key = gk(g)
      if (emails[key]?.trim() && !done[key]) await sendOne(g)
    }
  }

  const pendingCount = groups.filter(g => emails[gk(g)]?.trim() && !done[gk(g)]).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-concrete">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-night" />
            <h3 className="font-semibold text-night">Aufgaben per E-Mail versenden</h3>
          </div>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-gray-500">
            Jeder Verantwortliche erhält eine projektspezifische Übersicht seiner Aufgaben.
            {!isServer && ' (Kein SMTP – E-Mail-Client wird geöffnet)'}
          </p>

          {groups.map(g => {
            const key      = gk(g)
            const email    = emails[key] ?? ''
            const isExpand = expanded[key]
            const isSent   = done[key]
            const isLoad   = loading[key]
            const err      = errors[key]
            const canSend  = !!email.trim() && !isSent

            return (
              <div key={key}
                className={`border rounded-lg overflow-hidden ${isSent ? 'border-green-300 bg-green-50' : 'border-concrete'}`}>
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-concrete/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-night text-sm truncate">{g.responsible}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-sky font-medium truncate">{g.projectName}</span>
                      <span className="badge-gray text-xs">{g.items.length} Aufgabe{g.items.length !== 1 ? 'n' : ''}</span>
                      {isSent && <span className="text-green-600 text-xs flex items-center gap-0.5"><Check size={12} /> Gesendet</span>}
                    </div>
                    <input
                      type="email"
                      className="input mt-1.5 text-sm"
                      placeholder="E-Mail-Adresse…"
                      value={email}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setEmails(p => ({ ...p, [key]: e.target.value }))}
                      disabled={isSent}
                    />
                    {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      className="btn-ghost p-1.5 text-gray-400"
                      title={isExpand ? 'Einklappen' : 'Aufgaben anzeigen'}
                      onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
                    >
                      {isExpand ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button
                      className={`btn text-xs px-3 py-1.5 flex items-center gap-1 ${isSent ? 'btn-secondary text-green-600' : canSend ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}
                      disabled={!canSend || isLoad}
                      onClick={() => sendOne(g)}
                    >
                      {isLoad ? <Loader size={12} className="animate-spin" /> : isSent ? <Check size={12} /> : <Send size={12} />}
                      {isSent ? 'Gesendet' : 'Senden'}
                    </button>
                  </div>
                </div>

                {/* Expandable items */}
                {isExpand && (
                  <div className="divide-y divide-concrete/60">
                    {g.items.map(item => {
                      const ovr = calcOverdue(item)
                      const sb  = statusBadge(item.status)
                      return (
                        <div key={item.id} className={`px-4 py-2 text-xs flex items-start gap-3 ${ovr ? 'bg-red-50' : ''}`}>
                          <span className="font-mono text-gray-400 w-6 flex-shrink-0">{item.no}</span>
                          <span className={`flex-1 ${ovr ? 'text-red-700' : 'text-gray-700'}`}>{item.description}</span>
                          {item.deadline && (
                            <span className={`flex-shrink-0 ${ovr ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                              {formatDate(item.deadline)}
                            </span>
                          )}
                          <span className={`badge text-xs flex-shrink-0 ${sb.color}`}>{sb.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-concrete flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {groups.filter(g => done[gk(g)]).length} von {groups.length} versendet
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={onClose}>Schließen</button>
            {pendingCount > 1 && (
              <button className="btn-primary text-sm" onClick={sendAll}>
                <Send size={14} /> Alle senden ({pendingCount})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function MassnahmenDashboard({ protocols, projects, projectId, projectContacts, serverUser, onOpenProtocol, onUpdateProtocol, onBack, project, onOpenBim }) {
  const isScoped = !!projectId
  const scopedName = isScoped ? (projects.find(p => p.id === projectId)?.name || '') : ''

  // Darf der aktuelle Nutzer Freimeldungen genehmigen? (Systemadmin oder Projektadmin)
  const canManageRelease = (item) => {
    if (!serverUser) return false
    if (serverUser.role === 'admin') return true
    const proj = projects.find(p => p.id === item._projectId)
    return !!(proj && (proj.projectAdminUser === serverUser.username
      || proj.projectAdmins?.includes(serverUser.username)))
  }

  const [filterProject,     setFilterProject]     = useState('')
  const [filterStatus,      setFilterStatus]      = useState('')
  const [filterPriority,    setFilterPriority]    = useState('')
  const [filterResponsible, setFilterResponsible] = useState('')
  const [onlyOpen,          setOnlyOpen]          = useState(false)
  const [onlyOverdue,       setOnlyOverdue]       = useState(false)
  const [showEmailModal,    setShowEmailModal]    = useState(false)
  const [bimIssues,         setBimIssues]         = useState([])
  const [bimStatusFilter,   setBimStatusFilter]   = useState('alle')

  // BIM-Issues laden (nur wenn projektbezogen und BIM-Modell vorhanden)
  useEffect(() => {
    if (!isScoped || !project?.bimMeta) return
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`/api/projects/${projectId}/bim-issues`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(setBimIssues)
      .catch(() => {})
  }, [projectId, isScoped, project?.bimMeta])

  const handleBimStatusChange = async (issue, newStatus) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    setBimIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: newStatus } : i))
    try {
      const { _version, _updatedAt, ...data } = issue
      const res = await fetch(`/api/projects/${projectId}/bim-issues/${issue.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ data: { ...data, status: newStatus }, version: _version }),
      })
      if (!res.ok) setBimIssues(prev => prev.map(i => i.id === issue.id ? issue : i))
    } catch {
      setBimIssues(prev => prev.map(i => i.id === issue.id ? issue : i))
    }
  }

  // When scoped to a project, only include its protocols
  const scopedProtocols = useMemo(() =>
    isScoped ? protocols.filter(p => p.projectId === projectId) : protocols,
    [protocols, projectId, isScoped]
  )

  // Flat list: reguläre Maßnahmen (OHNE BIM-Issues) aus (scoped) Protokollen
  const allItems = useMemo(() => {
    const items = []
    for (const protocol of scopedProtocols) {
      const proj       = projects.find(p => p.id === protocol.projectId) ?? null
      const chainNo    = getChainNo(protocol, protocols)
      const protocolNo = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)
      for (const item of (protocol.actionItems ?? [])) {
        if (item.bimIssueId) continue  // BIM-Issues werden separat angezeigt
        items.push({
          ...item,
          _protocolId:    protocol.id,
          _protocolNo:    protocolNo,
          _protocolDate:  protocol.date,
          _projectId:     protocol.projectId,
          _projectName:   protocol.projectName,
          _projectLocked: proj !== null && !proj.isUnlocked,
        })
      }
    }
    items.sort((a, b) => {
      const ao = calcOverdue(a) ? 0 : 1
      const bo = calcOverdue(b) ? 0 : 1
      if (ao !== bo) return ao - bo
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (a.deadline)  return -1
      if (b.deadline)  return  1
      return (b._protocolDate ?? '').localeCompare(a._protocolDate ?? '')
    })
    return items
  }, [scopedProtocols, projects, protocols])

  // Filter-Optionen: eindeutige Projekte und Verantwortliche
  const projectOptions = useMemo(() => {
    const seen = new Set()
    const opts = []
    for (const item of allItems) {
      if (item._projectId && !seen.has(item._projectId)) {
        seen.add(item._projectId)
        opts.push({ id: item._projectId, name: item._projectName || 'Unbenannt' })
      }
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name))
  }, [allItems])

  const responsibleOptions = useMemo(() => {
    const seen = new Set()
    for (const item of allItems) {
      const r = (item.responsible || '').trim()
      if (r) seen.add(r)
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b))
  }, [allItems])

  // Filter anwenden
  const visible = useMemo(() => allItems.filter(item => {
    if (filterProject     && item._projectId !== filterProject)   return false
    if (filterStatus      && item.status !== filterStatus)         return false
    if (filterPriority    && item.priority !== filterPriority)     return false
    if (filterResponsible && item.responsible !== filterResponsible) return false
    if (onlyOpen    && item.status !== 'offen' && item.status !== 'in_arbeit') return false
    if (onlyOverdue && !calcOverdue(item))                         return false
    return true
  }), [allItems, filterProject, filterStatus, filterPriority, filterResponsible, onlyOpen, onlyOverdue])

  // E-Mail-Gruppen: sichtbare Aufgaben gruppiert nach Verantwortlichem + Projekt
  const emailGroups = useMemo(() => {
    const map = new Map()
    for (const item of visible) {
      const responsible = (item.responsible || '').trim() || '(kein Verantwortlicher)'
      const itemProjectId   = item._projectId   || ''
      const projectName = item._projectName || 'Unbekanntes Projekt'
      const key         = `${responsible}||${itemProjectId}`
      if (!map.has(key)) {
        const needle = responsible.toLowerCase()
        // Strip "(Firma)"-Suffix: Zuständige werden als "Name (Firma)" gespeichert,
        // der Kontakt hat aber nur den Namen im name-Feld → ohne Suffix suchen.
        const needleBase = needle.replace(/\s*\([^)]*\)\s*$/, '').trim()

        let foundEmail = ''
        // When scoped, look up email in project contacts only
        const contactSources = isScoped && projectContacts?.length > 0
          ? [{ contacts: projectContacts, isUnlocked: true }]
          : projects
        for (const project of contactSources) {
          if (!project.isUnlocked) continue
          // Search both regular contacts and admin contacts
          const allContactsInProject = [
            ...(project.contacts ?? []),
            ...(project.adminContacts ?? []),
          ]
          for (const c of allContactsInProject) {
            const cName = (c.name || '').toLowerCase().trim()
            const cFull = c.company
              ? `${cName} (${(c.company || '').toLowerCase().trim()})`
              : cName
            if ((cName === needle || cName === needleBase || cFull === needle) && c.email) {
              foundEmail = c.email
              break
            }
          }
          if (foundEmail) break
        }
        // Fallback: search protocol participants for a matching name
        if (!foundEmail) {
          outer: for (const proto of scopedProtocols) {
            for (const p of (proto.participants ?? [])) {
              const pName = (p.name || '').toLowerCase().trim()
              if ((pName === needle || pName === needleBase) && p.email) {
                foundEmail = p.email
                break outer
              }
            }
          }
        }
        map.set(key, { responsible, projectId: itemProjectId, projectName, email: foundEmail, items: [] })
      }
      map.get(key).items.push(item)
    }
    return Array.from(map.values()).sort((a, b) => {
      const pc = a.projectName.localeCompare(b.projectName)
      return pc !== 0 ? pc : a.responsible.localeCompare(b.responsible)
    })
  }, [visible, projects, isScoped, projectContacts, scopedProtocols])

  const totalOverdue  = allItems.filter(calcOverdue).length
  const totalOpen     = allItems.filter(i => i.status === 'offen' || i.status === 'in_arbeit').length
  const hasFilters    = filterProject || filterStatus || filterPriority || filterResponsible || onlyOpen || onlyOverdue

  const clearFilters = () => {
    setFilterProject(''); setFilterStatus(''); setFilterPriority('')
    setFilterResponsible(''); setOnlyOpen(false); setOnlyOverdue(false)
  }

  const handleStatusChange = (item, newStatus) => {
    if (!onUpdateProtocol) return
    const protocol = protocols.find(p => p.id === item._protocolId)
    if (!protocol) return
    const updatedActionItems = (protocol.actionItems ?? []).map(a =>
      a.id === item.id
        ? { ...a, status: newStatus, ...(newStatus === 'erledigt' ? { completedAt: todayStr() } : { completedAt: undefined }) }
        : a
    )
    onUpdateProtocol(item._protocolId, { actionItems: updatedActionItems })
  }

  return (
    <div className="app-page !space-y-5">

      {/* Header */}
      <div className="flex items-stretch justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button className="btn-ghost p-2" onClick={onBack} title="Zurück">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 size={20} className="text-brand-600" />
              {isScoped && scopedName ? `${scopedName} · Maßnahmen` : 'Maßnahmen'}
            </h1>
            <p className="text-xs text-gray-400">
              {isScoped ? 'Aufgaben und Maßnahmen aus diesem Projekt' : 'Alle Aufgaben projekt- und protokollübergreifend'}
            </p>
          </div>
        </div>
        {visible.length > 0 && (
          <button className="btn-primary text-sm" onClick={() => setShowEmailModal(true)}>
            <Mail size={15} /> E-Mail versenden
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="badge bg-gray-100 text-gray-700 text-xs">{allItems.length} Maßnahmen gesamt</span>
        {totalOpen    > 0 && <span className="badge-yellow text-xs">{totalOpen} offen</span>}
        {totalOverdue > 0 && <span className="badge-red text-xs">{totalOverdue} überfällig</span>}
        {hasFilters && <span className="badge-blue text-xs">{visible.length} gefiltert</span>}
      </div>

      {/* Filter */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
          <Filter size={13} /> Filter
        </div>
        <div className="flex flex-wrap gap-2 items-center">

          {/* Projekt – nur wenn nicht auf ein Projekt eingeschränkt */}
          {!isScoped && (
            <select className="select text-sm" style={{ maxWidth: '180px' }}
              value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">Alle Projekte</option>
              {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Verantwortlicher */}
          <select className="select text-sm" style={{ maxWidth: '180px' }}
            value={filterResponsible}
            onChange={e => setFilterResponsible(e.target.value)}>
            <option value="">Alle Zuständigen</option>
            {responsibleOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          {/* Status */}
          <select className="select text-sm" style={{ maxWidth: '150px' }}
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); if (e.target.value) setOnlyOpen(false) }}>
            <option value="">Alle Status</option>
            {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          {/* Priorität */}
          <select className="select text-sm" style={{ maxWidth: '140px' }}
            value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">Alle Prioritäten</option>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {/* Toggle: Nur offene */}
          <button
            className={`btn text-xs px-3 py-1.5 ${onlyOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setOnlyOpen(v => !v); if (!onlyOpen) setFilterStatus('') }}
          >
            <CheckSquare size={12} /> Nur offene
          </button>

          {/* Toggle: Nur überfällige */}
          <button
            className={`btn text-xs px-3 py-1.5 ${onlyOverdue ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => setOnlyOverdue(v => !v)}
          >
            <AlertTriangle size={12} /> Nur überfällige
          </button>

          {hasFilters && (
            <button className="btn-ghost text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              onClick={clearFilters}>
              <X size={12} /> Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Leer-Zustand */}
      {visible.length === 0 && (
        <div className="card p-12 text-center text-gray-400 text-sm">
          {allItems.length === 0
            ? 'Noch keine Maßnahmen in keinem Protokoll erfasst.'
            : 'Keine Maßnahmen entsprechen den gewählten Filtern.'
          }
        </div>
      )}

      {/* Tabelle */}
      {visible.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                {!isScoped && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Projekt</th>}
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Protokoll</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nr</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Beschreibung</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Zuständig</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Frist</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priorität</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item, idx) => {
                const ovr   = calcOverdue(item)
                const done  = item.status === 'erledigt'
                const sb    = statusBadge(item.status)
                const pb    = priorityBadge(item.priority)
                const rowBg = ovr  ? 'bg-red-50 hover:bg-red-100'
                            : done ? 'bg-green-50/60 hover:bg-green-100/60'
                            : idx % 2 === 0 ? 'bg-white hover:bg-sky/5'
                            : 'bg-gray-50/40 hover:bg-sky/5'

                return (
                  <tr key={`${item._protocolId}-${item.id}`}
                    className={`${rowBg} cursor-pointer border-b border-gray-100 transition-colors`}
                    onClick={() => onOpenProtocol(item._protocolId)}
                    title="Protokoll öffnen"
                  >
                    {!isScoped && (
                      <td className="px-4 py-2.5 text-xs max-w-[120px]">
                        {item._projectLocked
                          ? <span className="flex items-center gap-1 text-amber-600"><Lock size={10} /> Gesperrt</span>
                          : <span className="font-medium text-gray-700 truncate block">{item._projectName || '–'}</span>
                        }
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[150px]">
                      <span className="truncate block" title={item._protocolNo}>{item._protocolNo}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs font-bold text-brand-700">{item.no}</td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <span className={`block font-medium ${done ? 'line-through text-gray-400' : ovr ? 'text-red-700' : 'text-gray-800'}`}>
                        {item.description || <span className="italic text-gray-400">–</span>}
                      </span>
                      {item.remarks && (
                        <span className="block text-xs text-gray-400 truncate mt-0.5">{item.remarks}</span>
                      )}
                      {(item.releaseRequest || (item.releaseHistory?.length > 0)) && (
                        <span className="inline-block mt-1" onClick={e => e.stopPropagation()}>
                          <FreimeldungBadge item={item} protocolId={item._protocolId} canManage={canManageRelease(item)} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{item.responsible || '–'}</td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {item.deadline ? (
                        <span className={ovr ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                          {formatDate(item.deadline)}
                          {ovr && <AlertTriangle size={11} className="inline ml-1 text-red-500" />}
                        </span>
                      ) : <span className="text-gray-400">–</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`badge text-xs ${pb.color}`}>{pb.label}</span>
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      {onUpdateProtocol ? (
                        <select
                          className={`select text-xs py-0.5 px-1.5 font-medium border ${sb.color} bg-transparent`}
                          value={item.status}
                          onChange={e => handleStatusChange(item, e.target.value)}
                        >
                          {ACTION_STATUSES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`badge text-xs ${sb.color}`}>{sb.label}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50/50">
            {visible.length} von {allItems.length} Maßnahmen · Klick auf eine Zeile öffnet das Protokoll
          </div>
        </div>
      )}

      {/* BIM-Issues – separater Abschnitt (nur wenn Projekt BIM-Modell hat) */}
      {isScoped && project?.bimMeta && (
        <div className="card overflow-hidden">
          {/* BIM-Abschnitt-Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-cyan-50 border-b border-cyan-200">
            <div className="flex items-center gap-2">
              <Box size={16} className="text-cyan-600" />
              <span className="font-semibold text-sm text-gray-800">BIM-Issues</span>
              {bimIssues.filter(i => i.status === 'offen' || i.status === 'in_arbeit').length > 0 && (
                <span className="badge text-xs bg-cyan-100 text-cyan-700 border border-cyan-300">
                  {bimIssues.filter(i => i.status === 'offen' || i.status === 'in_arbeit').length} offen
                </span>
              )}
              <span className="text-xs text-gray-500">{bimIssues.length} gesamt</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Status-Filter */}
              <div className="flex gap-1">
                {[['alle', 'Alle'], ['offen', 'Offen'], ['in_arbeit', 'In Arbeit'], ['erledigt', 'Erledigt'], ['geschlossen', 'Geschlossen']].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setBimStatusFilter(v)}
                    className={`text-[10px] px-2 py-0.5 border transition-colors ${
                      bimStatusFilter === v
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {onOpenBim && (
                <button
                  onClick={onOpenBim}
                  className="btn-secondary text-xs flex items-center gap-1"
                  title="BIM-Viewer öffnen"
                >
                  <Eye size={12} /> BIM-Viewer
                </button>
              )}
            </div>
          </div>

          {bimIssues.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              Keine BIM-Issues erfasst.
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Typ</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Titel / Beschreibung</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Zuständig</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Frist</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priorität</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {bimIssues
                  .filter(i => bimStatusFilter === 'alle' || i.status === bimStatusFilter)
                  .map((issue, idx) => {
                    const sc  = BIM_STATUS_CFG[issue.status]   || BIM_STATUS_CFG.offen
                    const pc  = BIM_PRIORITY_CFG[issue.priority] || BIM_PRIORITY_CFG.mittel
                    const ovr = !!(issue.dueDate && (issue.status === 'offen' || issue.status === 'in_arbeit') && issue.dueDate < todayStr())
                    const rowBg = issue.status === 'erledigt' || issue.status === 'geschlossen'
                      ? 'bg-gray-50/60'
                      : ovr ? 'bg-red-50'
                      : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                    return (
                      <tr key={issue.id} className={`${rowBg} border-b border-gray-100 hover:bg-cyan-50/40 transition-colors`}>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {BIM_TYPE_CFG[issue.type] || issue.type}
                        </td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="badge text-[10px] bg-cyan-100 text-cyan-700 border border-cyan-300 flex items-center gap-0.5 flex-shrink-0">
                              <Box size={8} /> BIM
                            </span>
                            <span className={`font-medium ${issue.status === 'erledigt' || issue.status === 'geschlossen' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {issue.title}
                            </span>
                          </span>
                          {issue.description && (
                            <span className="block text-xs text-gray-400 truncate mt-0.5">{issue.description}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{issue.assignedTo || '–'}</td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                          {issue.dueDate ? (
                            <span className={ovr ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                              {formatDate(issue.dueDate)}
                              {ovr && <AlertTriangle size={11} className="inline ml-1 text-red-500" />}
                            </span>
                          ) : <span className="text-gray-400">–</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium ${pc.color}`}>{pc.label}</span>
                        </td>
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          <select
                            className={`select text-xs py-0.5 px-1.5 font-medium border ${sc.badge} bg-transparent`}
                            value={issue.status}
                            onChange={e => handleBimStatusChange(issue, e.target.value)}
                          >
                            {Object.entries(BIM_STATUS_CFG).map(([v, c]) => (
                              <option key={v} value={v}>{c.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showEmailModal && (
        <EmailModal
          groups={emailGroups}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  )
}
