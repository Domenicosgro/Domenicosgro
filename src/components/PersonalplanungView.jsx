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

// Verfügbare Tage je Mitarbeiter/Wochentag aus dem Arbeitszeitmodell (¼-Schritte, 8h = 1 Tag)
export const capDays = (member, dayKey) =>
  Math.round(((member?.dayHours?.[dayKey] || 0) / 8) * 4) / 4
const TAGE_OPTIONS = [
  { value: '',    label: '–' },
  { value: 0.25,  label: '¼' },
  { value: 0.5,   label: '½' },
  { value: 0.75,  label: '¾' },
  { value: 1,     label: '1' },
]
const fmtTage = (t) => ({ 0.25: '¼', 0.5: '½', 0.75: '¾', 1: '1' }[t] ?? String(t))
const ABSENCE = [
  { id: 'urlaub', name: 'Urlaub' }, { id: 'krank', name: 'Krank' }, { id: 'buero', name: 'Büro / intern' },
]

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function PersonalplanungView({ projects, onUpdateProject, serverUser, onBack }) {
  const [tab,     setTab]     = useState('plan')
  const [startMonday, setStartMonday] = useState(() => mondayOf(new Date()))
  const [plans,   setPlans]   = useState({})     // { [week]: assignments[] }
  const [addedRows, setAddedRows] = useState({}) // { [projectId]: [staffId] } – frisch hinzugefügt, noch ohne Werte
  const [staff,   setStaff]   = useState([])
  const [orgUsers, setOrgUsers] = useState([])   // eigene Organisation (Benutzerverzeichnis)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [pubUrl,  setPubUrl]  = useState(null)
  const [pubCopied, setPubCopied] = useState(false)
  const saveTimers = useRef({})

  // 4 Wochen ab Startmontag
  const weeks = useMemo(() => Array.from({ length: 4 }, (_, i) => {
    const mon = addDays(startMonday, i * 7)
    return { monday: mon, week: isoWeek(mon) }
  }), [startMonday])

  const activeStaff = staff.filter(s => s.active !== false)
  const activeProjects = (projects || []).filter(p => !p.isArchived)

  const loadStaff = useCallback(async () => {
    try { setStaff(await staffApi.list()) } catch (e) { setError(e.message) }
  }, [])

  const fetchWeek = async (week) => {
    if (isServer) {
      const res = await fetch(`/api/staff-plan/${week}`, { headers: authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      return (await res.json()).assignments || []
    }
    return JSON.parse(localStorage.getItem(`kp_staffplan2_${week}`) || '[]')
  }

  const loadPlans = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.all(weeks.map(w => fetchWeek(w.week)))
      const next = {}
      weeks.forEach((w, i) => { next[w.week] = results[i] })
      setPlans(next)
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`) }
    finally { setLoading(false) }
  }, [weeks])

  useEffect(() => { loadStaff() }, [loadStaff])
  useEffect(() => { loadPlans() }, [loadPlans])
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

  // Woche speichern (debounced je Woche)
  const persistWeek = useCallback((week, assignments) => {
    setPlans(prev => ({ ...prev, [week]: assignments }))
    if (saveTimers.current[week]) clearTimeout(saveTimers.current[week])
    saveTimers.current[week] = setTimeout(async () => {
      try {
        if (isServer) {
          setSaving(true)
          const res = await fetch(`/api/staff-plan/${week}`, {
            method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ assignments }),
          })
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        } else {
          localStorage.setItem(`kp_staffplan2_${week}`, JSON.stringify(assignments))
        }
      } catch (e) { setError(`Speichern fehlgeschlagen: ${e.message}`) }
      finally { setSaving(false) }
    }, 600)
  }, [])

  // Zuweisung in Tagen (¼-Schritte) setzen
  const getTage = (week, projectId, staffId, dayKey) =>
    (plans[week] || []).find(a => a.projectId === projectId && a.staffId === staffId)?.days?.[dayKey] ?? ''

  const setTage = (week, projectId, staffId, dayKey, value) => {
    const list = plans[week] || []
    const idx = list.findIndex(a => a.projectId === projectId && a.staffId === staffId)
    let next
    if (idx === -1) {
      if (!value) return
      next = [...list, { projectId, staffId, days: { [dayKey]: value } }]
    } else {
      const days = { ...list[idx].days }
      if (value) days[dayKey] = value
      else delete days[dayKey]
      next = Object.keys(days).length > 0
        ? list.map((a, i) => i === idx ? { ...a, days } : a)
        : list.filter((_, i) => i !== idx)
    }
    persistWeek(week, next)
  }

  // Mitarbeiter, die für ein Projekt eingeplant sind (über alle 4 Wochen) + frisch hinzugefügte
  const staffIdsFor = (projectId) => {
    const ids = new Set(addedRows[projectId] || [])
    for (const w of weeks) for (const a of (plans[w.week] || [])) {
      if (a.projectId === projectId) ids.add(a.staffId)
    }
    return activeStaff.filter(s => ids.has(s.id))
  }

  const addStaffRow = (projectId, staffId) => {
    if (!staffId) return
    setAddedRows(prev => ({ ...prev, [projectId]: [...(prev[projectId] || []), staffId] }))
  }

  const removeStaffRow = (projectId, staffId) => {
    for (const w of weeks) {
      const list = plans[w.week] || []
      const filtered = list.filter(a => !(a.projectId === projectId && a.staffId === staffId))
      if (filtered.length !== list.length) persistWeek(w.week, filtered)
    }
    setAddedRows(prev => ({ ...prev, [projectId]: (prev[projectId] || []).filter(id => id !== staffId) }))
  }

  // Auslastung: Summe je Mitarbeiter/Woche/Tag über alle Projekte + Abwesenheiten
  const sumFor = (week, staffId, dayKey) =>
    (plans[week] || []).reduce((s, a) => s + (a.staffId === staffId ? (a.days?.[dayKey] || 0) : 0), 0)

  // Vorwoche in die erste sichtbare Woche kopieren
  const copyPrevWeek = async () => {
    try {
      const prevWeek = isoWeek(addDays(startMonday, -7))
      const prev = await fetchWeek(prevWeek)
      if (prev.length === 0) { setError('Vorwoche ist leer.'); return }
      persistWeek(weeks[0].week, prev)
    } catch (e) { setError(e.message) }
  }

  const setGesellschaft = (project, value) =>
    onUpdateProject(project.id, { projectData: { ...(project.projectData || {}), gesellschaft: value } })

  // Projektdatenbank (Gesellschaft) dürfen nur System-/Projektadmins ändern
  const canEditGes = (project) => !isServer || serverUser?.role === 'admin'
    || project.projectAdminUser === serverUser?.username
    || project.projectAdmins?.includes(serverUser?.username)

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

  const projName = (pid) =>
    ABSENCE.find(a => a.id === pid)?.name
    || (projects || []).find(p => p.id === pid)?.name
    || ''

  // 4-Wochen-Plan als PDF herunterladen (z. B. zum Teilen in Teams)
  const [pdfBusy, setPdfBusy] = useState(false)
  const exportPdf = async () => {
    setPdfBusy(true)
    try {
      const base64 = await buildStaffPlanPdf({
        weeks: weeks.map(w => ({ week: w.week, monday: w.monday, assignments: plans[w.week] || [] })),
        staff: activeStaff, projName,
      })
      const kw = weeks[0].week.split('-W')[1]
      downloadPdfBase64(base64, `Personalplan_ab_KW${kw}_${weeks[0].week.slice(0, 4)}.pdf`)
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
          {/* Zeitraum-Navigation (4 Wochen) */}
          <div className="flex items-center gap-2 flex-wrap no-print">
            <button className="btn-secondary text-sm" onClick={() => setStartMonday(m => addDays(m, -7))}><ChevronLeft size={14} /> Woche</button>
            <button className="btn-secondary text-sm" onClick={() => setStartMonday(mondayOf(new Date()))}>Heute</button>
            <button className="btn-secondary text-sm" onClick={() => setStartMonday(m => addDays(m, 7))}>Woche <ChevronRight size={14} /></button>
            <span className="text-sm font-semibold text-gray-700 ml-2">
              KW {weeks[0].week.split('-W')[1]} – KW {weeks[3].week.split('-W')[1]}
              <span className="font-normal text-gray-400 ml-1">({fmtShort(weeks[0].monday)} – {fmtShort(addDays(weeks[3].monday, 4))})</span>
            </span>
            <div className="ml-auto flex gap-2">
              <button className="btn-secondary text-xs" title={`Vorwoche in KW ${weeks[0].week.split('-W')[1]} übernehmen`}
                onClick={copyPrevWeek}>Vorwoche übernehmen</button>
              <button className="btn-secondary text-xs" title="4-Wochen-Plan als PDF (z. B. für Teams)"
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
              <p className="text-xs mt-1">Lege sie im Bereich „Mitarbeiter" an (eigene Organisation).</p>
              <button className="btn-secondary mt-4 mx-auto" onClick={() => setTab('staff')}>Zu den Mitarbeitern</button>
            </div>
          ) : (
            <>
              {/* Gesamtübersicht: ein Block je Projekt (+ Abwesenheiten) */}
              {[...activeProjects, ...ABSENCE].map(project => {
                const isAbsence = !!ABSENCE.find(a => a.id === project.id)
                const rows = staffIdsFor(project.id)
                const ges  = project.projectData?.gesellschaft || ''
                return (
                  <div key={project.id} className={`card overflow-hidden ${isAbsence ? 'border-l-4 border-l-yellow-300' : ''}`}>
                    {/* Projektkopf */}
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex-wrap">
                      <span className="font-semibold text-sm text-night">{project.name || 'Unbenannt'}</span>
                      {!isAbsence && (canEditGes(project) ? (
                        <select
                          className={`select text-[11px] py-0.5 px-1.5 no-print ${ges ? (ges === 'GmbH' ? 'text-brand-700 border-brand-300' : 'text-violet-700 border-violet-300') : 'text-gray-400'}`}
                          value={ges}
                          onChange={e => setGesellschaft(project, e.target.value)}
                          title="Gesellschaft (Projektdatenbank)"
                        >
                          <option value="">Gesellschaft…</option>
                          <option value="GmbH">GmbH</option>
                          <option value="PartGmbB">PartGmbB</option>
                        </select>
                      ) : ges ? (
                        <span className={`badge text-[10px] ${ges === 'GmbH' ? 'bg-brand-100 text-brand-700 border border-brand-300' : 'bg-violet-100 text-violet-700 border border-violet-300'}`}>{ges}</span>
                      ) : null)}
                      {ges && <span className="hidden print:inline text-xs text-gray-500">({ges})</span>}
                      <div className="ml-auto no-print">
                        <select className="select text-xs py-0.5" value=""
                          onChange={e => { addStaffRow(project.id, e.target.value); e.target.value = '' }}>
                          <option value="">+ Mitarbeiter einplanen…</option>
                          {activeStaff.filter(s => !rows.find(r => r.id === s.id)).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {rows.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-gray-400">Noch niemand eingeplant.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="border-collapse text-xs min-w-[1080px] w-full">
                          <thead>
                            <tr className="bg-gray-50/60">
                              <th className="text-left px-3 py-1.5 font-semibold text-gray-500 uppercase tracking-wide w-40 border-b border-gray-200">Mitarbeiter</th>
                              {weeks.map(w => (
                                <th key={w.week} colSpan={5} className="px-1 py-1.5 text-center font-semibold text-gray-500 border-b border-l border-gray-200">
                                  KW {w.week.split('-W')[1]} <span className="font-normal text-gray-400">({fmtShort(w.monday)})</span>
                                </th>
                              ))}
                            </tr>
                            <tr className="bg-gray-50/40">
                              <th className="border-b border-gray-200" />
                              {weeks.map(w => DAYS.map((d, i) => (
                                <th key={`${w.week}-${d.key}`}
                                  className={`px-0.5 py-1 text-center font-medium text-gray-400 border-b border-gray-200 ${i === 0 ? 'border-l' : ''}`}>
                                  {d.label.slice(0, 2)}
                                </th>
                              )))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(member => (
                              <tr key={member.id} className="border-b border-gray-50">
                                <td className="px-3 py-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-gray-800 truncate">{member.name}</span>
                                    <button className="btn-ghost p-0.5 text-gray-300 hover:text-red-500 no-print" title="Aus diesem Projekt entfernen"
                                      onClick={() => removeStaffRow(project.id, member.id)}><X size={11} /></button>
                                  </div>
                                </td>
                                {weeks.map(w => DAYS.map((d, i) => {
                                  const val = getTage(w.week, project.id, member.id, d.key)
                                  const cap = capDays(member, d.key)
                                  const total = sumFor(w.week, member.id, d.key)
                                  const over  = total > cap
                                  return (
                                    <td key={`${w.week}-${d.key}`} className={`px-0.5 py-0.5 text-center ${i === 0 ? 'border-l border-gray-100' : ''} ${over && val ? 'bg-red-50' : ''}`}>
                                      <select
                                        className={`w-11 text-center text-xs py-0.5 border ${val ? (over ? 'border-red-300 text-red-700' : 'border-gray-200 text-gray-800') : 'border-transparent text-gray-300'} bg-transparent focus:border-brand-400 focus:outline-none`}
                                        value={val}
                                        title={cap === 0 ? 'Laut Arbeitszeitmodell frei' : `Verfügbar: ${fmtTage(cap)} Tag`}
                                        onChange={e => setTage(w.week, project.id, member.id, d.key, e.target.value === '' ? '' : parseFloat(e.target.value))}
                                      >
                                        {TAGE_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                                      </select>
                                    </td>
                                  )
                                }))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Auslastungsübersicht je Mitarbeiter */}
              <div className="card overflow-x-auto">
                <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200">
                  <span className="font-semibold text-sm text-night">Auslastung (Summe aller Projekte, in Tagen)</span>
                  <span className="text-xs text-gray-400 ml-2">rot = über Arbeitszeitmodell · grün = voll ausgelastet</span>
                </div>
                <table className="border-collapse text-xs min-w-[1080px] w-full">
                  <thead>
                    <tr className="bg-gray-50/60">
                      <th className="text-left px-3 py-1.5 font-semibold text-gray-500 uppercase tracking-wide w-40 border-b border-gray-200">Mitarbeiter</th>
                      {weeks.map(w => (
                        <th key={w.week} colSpan={5} className="px-1 py-1.5 text-center font-semibold text-gray-500 border-b border-l border-gray-200">
                          KW {w.week.split('-W')[1]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeStaff.map(member => (
                      <tr key={member.id} className="border-b border-gray-50">
                        <td className="px-3 py-1 font-medium text-gray-800">{member.name}</td>
                        {weeks.map(w => DAYS.map((d, i) => {
                          const total = sumFor(w.week, member.id, d.key)
                          const cap   = capDays(member, d.key)
                          const cls = total > cap ? 'bg-red-100 text-red-700 font-semibold'
                                    : total === cap && cap > 0 ? 'bg-green-50 text-green-700'
                                    : total > 0 ? 'bg-amber-50 text-amber-700'
                                    : 'text-gray-300'
                          return (
                            <td key={`${w.week}-${d.key}`} className={`px-0.5 py-1 text-center ${i === 0 ? 'border-l border-gray-100' : ''} ${cls}`}>
                              {total > 0 ? fmtTage(total) : '–'}
                            </td>
                          )
                        }))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
