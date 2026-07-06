import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Loader, AlertCircle, X,
         CalendarClock, Printer, Users, UserPlus, Link2, Copy, CheckSquare, Pencil, Check, FileDown } from 'lucide-react'
import { uid, formatDate } from '../utils'
import { buildStaffPlanPdf } from '../staffPlanPdf'
import { downloadPdfBase64 } from '../archivePdf'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}
const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() })

const DAYS = [
  { key: 'mo', label: 'Montag' }, { key: 'di', label: 'Dienstag' }, { key: 'mi', label: 'Mittwoch' },
  { key: 'do', label: 'Donnerstag' }, { key: 'fr', label: 'Freitag' },
]
const SPECIAL = [
  { value: 'urlaub', label: 'Urlaub' }, { value: 'krank', label: 'Krank' }, { value: 'buero', label: 'Büro' },
]
const PROJECT_ROLES = [
  'Projektleitung', 'Stellv. Projektleitung', 'Bauleitung', 'Objektplanung',
  'Fachplanung', 'Ausschreibung / Vergabe', 'Assistenz',
]

// ISO-Kalenderwoche + Datumshelfer
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`
}
function mondayOf(date) { const d = new Date(date); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
const fmtShort = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

// ── Mitarbeiter-API (Server oder localStorage) ─────────────────────────────
const staffApi = {
  async list() {
    if (!isServer) return JSON.parse(localStorage.getItem('kp_staff') || '[]')
    const res = await fetch('/api/staff', { headers: authHeaders() })
    if (!res.ok) throw new Error('Mitarbeiter konnten nicht geladen werden.')
    return res.json()
  },
  async create(data) {
    if (!isServer) {
      const list = JSON.parse(localStorage.getItem('kp_staff') || '[]')
      const item = { ...data, id: uid(), active: true }
      localStorage.setItem('kp_staff', JSON.stringify([...list, item]))
      return item
    }
    const res = await fetch('/api/staff', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(data) })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Anlegen fehlgeschlagen.')
    return res.json()
  },
  async patch(member, patch) {
    if (!isServer) {
      const list = JSON.parse(localStorage.getItem('kp_staff') || '[]')
      localStorage.setItem('kp_staff', JSON.stringify(list.map(s => s.id === member.id ? { ...s, ...patch } : s)))
      return
    }
    const { _version, _updatedAt, ...data } = member
    const res = await fetch(`/api/staff/${member.id}`, {
      method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify({ data: { ...data, ...patch }, version: _version }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Speichern fehlgeschlagen.')
  },
  async remove(id) {
    if (!isServer) {
      const list = JSON.parse(localStorage.getItem('kp_staff') || '[]')
      localStorage.setItem('kp_staff', JSON.stringify(list.filter(s => s.id !== id)))
      return
    }
    const res = await fetch(`/api/staff/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (!res.ok) throw new Error('Löschen fehlgeschlagen.')
  },
}

// ── Mitarbeiter-Verwaltung (Stammdaten + Arbeitszeitmodell) ─────────────────
// Quelle ist ausschließlich die eigene Organisation (App-Benutzerverzeichnis),
// nicht die projektübergreifende Kontaktdatenbank (dort stehen auch Externe).
function StaffTab({ staff, orgUsers, onChanged, setError }) {
  const [adding,   setAdding]   = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [contactPick, setContactPick] = useState('')

  const existingEmails = new Set(staff.map(s => (s.email || '').toLowerCase()).filter(Boolean))
  const existingNames  = new Set(staff.map(s => s.name))
  const availableUsers = orgUsers.filter(u => {
    const name  = u.display_name || u.username
    const email = (u.email || '').toLowerCase()
    return !existingNames.has(name) && (!email || !existingEmails.has(email))
  })

  const addFromContact = async () => {
    const u = availableUsers.find(x => x.username === contactPick)
    if (!u) return
    try {
      await staffApi.create({ name: u.display_name || u.username, email: u.email || '', funktion: '', weeklyHours: 40, dayHours: { mo: 8, di: 8, mi: 8, do: 8, fr: 8 } })
      setContactPick(''); onChanged()
    } catch (e) { setError(e.message) }
  }

  const StaffForm = ({ member }) => {
    const [form, setForm] = useState({
      name: member?.name || '', email: member?.email || '', funktion: member?.funktion || '',
      weeklyHours: member?.weeklyHours ?? 40,
      dayHours: { mo: 8, di: 8, mi: 8, do: 8, fr: 8, ...(member?.dayHours || {}) },
    })
    const setDay = (k, v) => setForm(f => ({ ...f, dayHours: { ...f.dayHours, [k]: v === '' ? 0 : parseFloat(v) } }))
    const submit = async () => {
      try {
        if (member) await staffApi.patch(member, form)
        else await staffApi.create(form)
        setEditing(null); setAdding(false); onChanged()
      } catch (e) { setError(e.message) }
    }
    return (
      <div className="border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="E-Mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input className="input" placeholder="Funktion (z. B. Architekt)" value={form.funktion} onChange={e => setForm(f => ({ ...f, funktion: e.target.value }))} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Arbeitszeitmodell (Stunden je Tag)</p>
          <div className="flex gap-2 flex-wrap items-end">
            {DAYS.map(d => (
              <div key={d.key}>
                <label className="block text-[10px] text-gray-400 uppercase">{d.label.slice(0, 2)}</label>
                <input type="number" min="0" max="12" step="0.5" className="input w-16 py-1 text-sm"
                  value={form.dayHours[d.key] ?? 0} onChange={e => setDay(d.key, e.target.value)} />
              </div>
            ))}
            <div className="text-xs text-gray-500 pb-2">
              = <strong>{DAYS.reduce((s, d) => s + (form.dayHours[d.key] || 0), 0)}</strong> Std./Woche
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary text-sm" onClick={() => { setEditing(null); setAdding(false) }}>Abbrechen</button>
          <button className="btn-primary text-sm" disabled={!form.name.trim()}
            onClick={() => submit()}>
            <Check size={14} /> Speichern
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Aus der eigenen Organisation übernehmen */}
      <div className="card p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">
          Mitarbeiter aus der eigenen Organisation übernehmen (Benutzerverzeichnis)
        </p>
        <div className="flex gap-2 flex-wrap">
          <select className="select flex-1 min-w-[220px]" value={contactPick} onChange={e => setContactPick(e.target.value)}>
            <option value="">– Mitarbeiter auswählen –</option>
            {availableUsers.map(u => (
              <option key={u.username} value={u.username}>
                {u.display_name || u.username}{u.email ? ` · ${u.email}` : ''}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={!contactPick} onClick={addFromContact}>
            <UserPlus size={14} /> Übernehmen
          </button>
          <button className="btn-secondary" onClick={() => { setAdding(true); setEditing(null) }}>
            <Plus size={14} /> Manuell anlegen
          </button>
        </div>
        {orgUsers.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">Kein Benutzerverzeichnis verfügbar – Mitarbeiter manuell anlegen.</p>
        )}
      </div>

      {adding && <StaffForm />}

      {/* Liste */}
      <div className="card divide-y divide-gray-100">
        {staff.length === 0 && !adding && (
          <p className="p-8 text-center text-sm text-gray-400">Noch keine Mitarbeiter angelegt. Übernimm sie oben aus der Kontaktdatenbank.</p>
        )}
        {staff.map(s => (
          editing?.id === s.id ? (
            <div key={s.id} className="p-3"><StaffForm member={s} /></div>
          ) : (
            <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${s.active === false ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{s.name}
                  {s.funktion && <span className="text-gray-400 font-normal"> · {s.funktion}</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {DAYS.reduce((sum, d) => sum + (s.dayHours?.[d.key] || 0), 0)} Std./Woche
                  {' ('}{DAYS.map(d => s.dayHours?.[d.key] ?? 0).join(' / ')}{')'}
                  {s.email ? ` · ${s.email}` : ''}
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer flex-shrink-0">
                <input type="checkbox" checked={s.active !== false}
                  onChange={async e => { try { await staffApi.patch(s, { active: e.target.checked }); onChanged() } catch (err) { setError(err.message) } }} />
                aktiv
              </label>
              <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600" onClick={() => { setEditing(s); setAdding(false) }}><Pencil size={14} /></button>
              <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600"
                onClick={async () => {
                  if (!confirm(`${s.name} wirklich entfernen?`)) return
                  try { await staffApi.remove(s.id); onChanged() } catch (e) { setError(e.message) }
                }}><Trash2 size={14} /></button>
            </div>
          )
        ))}
      </div>
    </div>
  )
}

// ── Projektteams mit Rollenvergabe (am Projekt gespeichert) ─────────────────
// Teammitglieder kommen aus der eigenen Organisation (Mitarbeiter-Stammdaten);
// externe Planungspartner werden in der Projektdatenbank gepflegt.
function TeamsTab({ projects, staff, onUpdateProject, setError }) {
  const activeProjects = projects.filter(p => !p.isArchived)
  const [projectId, setProjectId] = useState(activeProjects[0]?.id || '')
  const project = activeProjects.find(p => p.id === projectId)
  const team = project?.team || []

  const [memberPick, setMemberPick] = useState('')
  const [rolePick,   setRolePick]   = useState(PROJECT_ROLES[0])

  const candidates = useMemo(() => {
    const seen = new Set(team.map(t => t.name))
    return staff.filter(s => s.active !== false && !seen.has(s.name))
      .map(s => ({ key: `s:${s.id}`, name: s.name, email: s.email }))
  }, [staff, team])

  const addMember = () => {
    const cand = candidates.find(c => c.key === memberPick)
    if (!cand || !project) return
    onUpdateProject(project.id, { team: [...team, { id: uid(), name: cand.name, email: cand.email, role: rolePick }] })
    setMemberPick('')
  }
  const setRole = (memberId, role) =>
    onUpdateProject(project.id, { team: team.map(m => m.id === memberId ? { ...m, role } : m) })
  const removeMember = (memberId) =>
    onUpdateProject(project.id, { team: team.filter(m => m.id !== memberId) })

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Projekt</label>
          <select className="select w-full max-w-md" value={projectId} onChange={e => setProjectId(e.target.value)}>
            {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name || 'Unbenannt'}</option>)}
          </select>
        </div>
        {project && (
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">Teammitglied (eigene Organisation)</label>
              <select className="select w-full" value={memberPick} onChange={e => setMemberPick(e.target.value)}>
                <option value="">– auswählen –</option>
                {candidates.map(c => <option key={c.key} value={c.key}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rolle im Projektteam</label>
              <select className="select" value={rolePick} onChange={e => setRolePick(e.target.value)}>
                {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn-primary" disabled={!memberPick} onClick={addMember}>
              <UserPlus size={14} /> Zuordnen
            </button>
          </div>
        )}
      </div>

      {project && (
        <div className="card divide-y divide-gray-100">
          {team.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-400">Noch kein Projektteam für „{project.name}" zusammengestellt.</p>
          )}
          {team.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <Users size={15} className="text-brand-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                {m.email && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
              </div>
              <select className="select text-xs py-1" value={m.role}
                onChange={e => setRole(m.id, e.target.value)}>
                {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                {!PROJECT_ROLES.includes(m.role) && <option value={m.role}>{m.role}</option>}
              </select>
              <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600" onClick={() => removeMember(m.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function PersonalplanungView({ projects, onUpdateProject, serverUser, onBack }) {
  const [tab,     setTab]     = useState('plan')
  const [monday,  setMonday]  = useState(() => mondayOf(new Date()))
  const [rows,    setRows]    = useState([])
  const [staff,   setStaff]   = useState([])
  const [orgUsers, setOrgUsers] = useState([])   // eigene Organisation (Benutzerverzeichnis)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [pubUrl,  setPubUrl]  = useState(null)
  const [pubCopied, setPubCopied] = useState(false)
  const saveTimer = useRef(null)
  const week  = isoWeek(monday)
  const lsKey = `kp_staffplan_${week}`

  const activeStaff = staff.filter(s => s.active !== false)
  const activeProjects = (projects || []).filter(p => !p.isArchived)

  const loadStaff = useCallback(async () => {
    try { setStaff(await staffApi.list()) } catch (e) { setError(e.message) }
  }, [])

  const loadPlan = useCallback(async () => {
    setLoading(true)
    try {
      if (isServer) {
        const res = await fetch(`/api/staff-plan/${week}`, { headers: authHeaders() })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        setRows((await res.json()).rows || [])
      } else {
        setRows(JSON.parse(localStorage.getItem(lsKey) || '[]'))
      }
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`) }
    finally { setLoading(false) }
  }, [week])

  useEffect(() => { loadStaff() }, [loadStaff])
  useEffect(() => { loadPlan() }, [loadPlan])
  useEffect(() => {
    if (!isServer) return
    fetch('/api/users', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(list => setOrgUsers(Array.isArray(list) ? list : []))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!isServer) return
    fetch('/api/staff-plan-token', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : {})
      .then(d => setPubUrl(d.url || null))
      .catch(() => {})
  }, [])

  const persist = useCallback((nextRows) => {
    setRows(nextRows)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        if (isServer) {
          setSaving(true)
          const res = await fetch(`/api/staff-plan/${week}`, {
            method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ rows: nextRows }),
          })
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        } else {
          localStorage.setItem(lsKey, JSON.stringify(nextRows))
        }
      } catch (e) { setError(`Speichern fehlgeschlagen: ${e.message}`) }
      finally { setSaving(false) }
    }, 600)
  }, [week, lsKey])

  // Zelle setzen: Projekt (p) und Stunden (h)
  const rowFor = (staffId) => rows.find(r => r.staffId === staffId)
  const setCell = (member, dayKey, patch) => {
    const defH = member.dayHours?.[dayKey] ?? 8
    const next = (() => {
      const existing = rowFor(member.id)
      const cur = existing?.days?.[dayKey] || {}
      const cell = { ...cur, ...patch }
      if (patch.p !== undefined && patch.h === undefined) cell.h = cell.p ? (cur.h || defH) : undefined
      const days = { ...(existing?.days || {}), [dayKey]: cell.p ? cell : undefined }
      if (existing) return rows.map(r => r.staffId === member.id ? { ...r, days } : r)
      return [...rows, { staffId: member.id, days }]
    })()
    persist(next)
  }

  const copyPrevWeek = async () => {
    try {
      const prevWeek = isoWeek(addDays(monday, -7))
      let prevRows = []
      if (isServer) {
        const res = await fetch(`/api/staff-plan/${prevWeek}`, { headers: authHeaders() })
        if (res.ok) prevRows = (await res.json()).rows || []
      } else {
        prevRows = JSON.parse(localStorage.getItem(`kp_staffplan_${prevWeek}`) || '[]')
      }
      if (prevRows.length === 0) { setError('Vorwoche ist leer.'); return }
      persist(prevRows)
    } catch (e) { setError(e.message) }
  }

  const managePublish = async (action) => {
    if (action === 'revoke' && !confirm('Veröffentlichung wirklich beenden? Der Team-Link wird ungültig.')) return
    try {
      const res = await fetch('/api/staff-plan-token', {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`)
      setPubUrl(data.url || null)
    } catch (e) { setError(e.message) }
  }

  const projName = (pid) => {
    const sp = SPECIAL.find(s => s.value === pid)
    if (sp) return sp.label
    return activeProjects.find(p => p.id === pid)?.name || ''
  }

  // Wochenplan als PDF herunterladen (z. B. zum Teilen in Teams)
  const [pdfBusy, setPdfBusy] = useState(false)
  const exportPdf = async () => {
    setPdfBusy(true)
    try {
      const base64 = await buildStaffPlanPdf({ week, monday, staff: activeStaff, rows, projName })
      const kw = week.split('-W')[1]
      downloadPdfBase64(base64, `Personalplan_KW${kw}_${week.slice(0, 4)}.pdf`)
    } catch (e) {
      setError(`PDF konnte nicht erstellt werden: ${e.message}`)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button className="btn-secondary no-print" onClick={onBack}><ArrowLeft size={16} /> Start</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <CalendarClock size={22} className="text-brand-600" /> Personal- &amp; Ressourcenplanung
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {activeStaff.length} aktive Mitarbeiter · {activeProjects.length} Projekte
              {saving && <span className="ml-2 text-gray-400"><Loader size={11} className="inline animate-spin" /> speichert…</span>}
            </p>
          </div>
        </div>
        {/* Veröffentlichung */}
        {isServer && (
          <div className="flex items-center gap-2 no-print">
            {pubUrl ? (
              <>
                <button className="btn-secondary text-xs" title={pubUrl}
                  onClick={() => { navigator.clipboard?.writeText(pubUrl); setPubCopied(true); setTimeout(() => setPubCopied(false), 2000) }}>
                  {pubCopied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  {pubCopied ? 'Link kopiert' : 'Team-Link kopieren'}
                </button>
                <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Veröffentlichung beenden"
                  onClick={() => managePublish('revoke')}><Trash2 size={14} /></button>
              </>
            ) : (
              <button className="btn-secondary text-xs" title="Login-freien Link für das Team erzeugen"
                onClick={() => managePublish('create')}>
                <Link2 size={13} /> Für Team veröffentlichen
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      {/* Bereiche */}
      <div className="flex gap-1 border-b border-gray-200 no-print">
        {[['plan', 'Wochenplan', <CalendarClock key="i" size={14} />],
          ['staff', 'Mitarbeiter', <Users key="i" size={14} />],
          ['teams', 'Projektteams', <CheckSquare key="i" size={14} />]].map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'staff' && (
        <StaffTab staff={staff} orgUsers={orgUsers} onChanged={loadStaff} setError={setError} />
      )}

      {tab === 'teams' && (
        <TeamsTab projects={projects} staff={staff} onUpdateProject={onUpdateProject} setError={setError} />
      )}

      {tab === 'plan' && (
        <>
          {/* Wochennavigation */}
          <div className="flex items-center gap-2 flex-wrap no-print">
            <button className="btn-secondary text-sm" onClick={() => setMonday(m => addDays(m, -7))}><ChevronLeft size={14} /> Vorwoche</button>
            <button className="btn-secondary text-sm" onClick={() => setMonday(mondayOf(new Date()))}>Heute</button>
            <button className="btn-secondary text-sm" onClick={() => setMonday(m => addDays(m, 7))}>Folgewoche <ChevronRight size={14} /></button>
            <span className="text-sm font-semibold text-gray-700 ml-2">
              KW {week.split('-W')[1]} ({fmtShort(monday)} – {fmtShort(addDays(monday, 4))})
            </span>
            <div className="ml-auto flex gap-2">
              <button className="btn-secondary text-xs" onClick={copyPrevWeek}>Vorwoche übernehmen</button>
              <button className="btn-secondary text-xs" title="Wochenplan als PDF (z. B. für Teams)"
                onClick={exportPdf} disabled={pdfBusy || activeStaff.length === 0}>
                {pdfBusy ? <Loader size={13} className="animate-spin" /> : <FileDown size={13} />} PDF
              </button>
              <button className="btn-secondary text-xs" onClick={() => window.print()}><Printer size={13} /></button>
            </div>
          </div>

          {loading ? (
            <div className="card p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
          ) : activeStaff.length === 0 ? (
            <div className="card p-12 text-center text-gray-400">
              <Users size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">Noch keine Mitarbeiter angelegt.</p>
              <p className="text-xs mt-1">Lege sie im Bereich „Mitarbeiter" an – direkt aus der Kontaktdatenbank.</p>
              <button className="btn-secondary mt-4 mx-auto" onClick={() => setTab('staff')}>Zu den Mitarbeitern</button>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[860px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Mitarbeiter</th>
                    {DAYS.map((d, i) => (
                      <th key={d.key} className="text-left px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {d.label}<span className="block font-normal normal-case text-gray-400">{fmtShort(addDays(monday, i))}</span>
                      </th>
                    ))}
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Ist / Soll</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((member, idx) => {
                    const row  = rowFor(member.id)
                    const ist  = DAYS.reduce((sum, d) => sum + (row?.days?.[d.key]?.p ? (row.days[d.key].h || 0) : 0), 0)
                    const soll = DAYS.reduce((sum, d) => sum + (member.dayHours?.[d.key] || 0), 0)
                    const balColor = ist > soll ? 'text-red-600' : ist === soll && soll > 0 ? 'text-green-600' : 'text-amber-600'
                    return (
                      <tr key={member.id} className={`border-b border-gray-100 align-top ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-800 text-sm">{member.name}</p>
                          {member.funktion && <p className="text-[11px] text-gray-400">{member.funktion}</p>}
                        </td>
                        {DAYS.map(d => {
                          const cell = row?.days?.[d.key] || {}
                          const isSpecial = ['urlaub', 'krank'].includes(cell.p)
                          return (
                            <td key={d.key} className={`px-1.5 py-1.5 ${isSpecial ? 'bg-yellow-50' : ''}`}>
                              <select
                                className="select w-full py-1 text-xs mb-1"
                                value={cell.p || ''}
                                onChange={e => setCell(member, d.key, { p: e.target.value || undefined })}
                              >
                                <option value="">–</option>
                                {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name || 'Unbenannt'}</option>)}
                                {SPECIAL.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                              {cell.p && !isSpecial && (
                                <input type="number" min="0" max="12" step="0.5"
                                  className="input w-full py-0.5 text-xs text-center"
                                  value={cell.h ?? ''}
                                  onChange={e => setCell(member, d.key, { h: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                  title="Stunden"
                                />
                              )}
                            </td>
                          )
                        })}
                        <td className={`px-3 py-2 text-right text-sm font-semibold whitespace-nowrap ${balColor}`}>
                          {ist} / {soll}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                Stunden werden beim Zuweisen mit dem Arbeitszeitmodell vorbelegt · Ist/Soll: grün = ausgelastet, gelb = frei, rot = überbucht
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
