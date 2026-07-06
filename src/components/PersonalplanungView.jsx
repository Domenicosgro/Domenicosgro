import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Trash2, Loader, AlertCircle, X,
         CalendarClock, Printer, Users, UserPlus, Link2, Copy, CheckSquare, Pencil, Check, FileDown, Briefcase, GripVertical, Eye, EyeOff } from 'lucide-react'
import { uid, formatDate } from '../utils'
import { buildStaffPlanPdf } from '../staffPlanPdf'
import { downloadPdfBase64 } from '../archivePdf'
import ProjektTeamEditor, { PROJECT_ROLES, TEAM_ANTEILE } from './ProjektTeamEditor'

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
          Alle Personen der eigenen Organisation werden automatisch übernommen –
          hier Arbeitszeitmodelle pflegen, Nachzügler manuell ergänzen
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

// ── Team-Vorlagen konfigurieren (global, wiederverwendbar) ───────────────────
function TeamTemplates({ staff, teams, onChange }) {
  const [newName, setNewName] = useState('')
  const activeStaff = staff.filter(s => s.active !== false)

  const addTemplate = () => {
    const name = newName.trim()
    if (!name) return
    onChange([...teams, { id: uid(), name, members: [] }])
    setNewName('')
  }
  const removeTemplate = (id) => {
    if (!confirm('Team-Vorlage wirklich löschen? (Bereits zugewiesene Projektteams bleiben unverändert.)')) return
    onChange(teams.filter(t => t.id !== id))
  }
  const addMember = (tplId, staffId, role, anteil) => {
    if (!staffId) return
    onChange(teams.map(t => t.id === tplId
      ? { ...t, members: [...(t.members || []), { staffId, role, anteil }] }
      : t))
  }
  const removeMember = (tplId, idx) =>
    onChange(teams.map(t => t.id === tplId
      ? { ...t, members: t.members.filter((_, i) => i !== idx) }
      : t))

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Users size={15} className="text-brand-600" /> Team-Vorlagen</p>
      <p className="text-xs text-gray-400 -mt-2">
        Wiederverwendbare Teams konfigurieren und Projekten mit einem Klick komplett zuweisen.
      </p>

      {teams.map(tpl => (
        <div key={tpl.id} className="border border-gray-100 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-800 flex-1">{tpl.name}</span>
            <button className="btn-ghost p-1 text-gray-300 hover:text-red-500" title="Vorlage löschen"
              onClick={() => removeTemplate(tpl.id)}><Trash2 size={13} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(tpl.members || []).map((m, i) => {
              const s = activeStaff.find(x => x.id === m.staffId)
              return (
                <span key={i} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-50 border border-gray-200">
                  {s?.name || '?'} <span className="text-gray-400">({m.role}{(m.anteil ?? 1) < 1 ? ` · ${Math.round((m.anteil ?? 1) * 100)} %` : ''})</span>
                  <button className="text-gray-300 hover:text-red-500" onClick={() => removeMember(tpl.id, i)}><X size={10} /></button>
                </span>
              )
            })}
            {(tpl.members || []).length === 0 && <span className="text-xs text-gray-400 italic">Noch keine Mitglieder</span>}
          </div>
          <TemplateMemberAdd
            staff={activeStaff.filter(s => !(tpl.members || []).some(m => m.staffId === s.id))}
            onAdd={(staffId, role) => addMember(tpl.id, staffId, role)}
          />
        </div>
      ))}

      <div className="flex gap-2">
        <input className="input text-sm flex-1" placeholder="Neue Team-Vorlage (z. B. Team Hochbau A)…"
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTemplate()} />
        <button className="btn-secondary text-sm" disabled={!newName.trim()} onClick={addTemplate}>
          <Plus size={14} /> Vorlage anlegen
        </button>
      </div>
    </div>
  )
}

function TemplateMemberAdd({ staff, onAdd }) {
  const [staffId, setStaffId] = useState('')
  const [role,    setRole]    = useState(PROJECT_ROLES[0])
  const [anteil,  setAnteil]  = useState(1)
  return (
    <div className="flex gap-2 flex-wrap">
      <select className="select text-xs py-1 flex-1 min-w-[160px]" value={staffId} onChange={e => setStaffId(e.target.value)}>
        <option value="">+ Mitglied…</option>
        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className="select text-xs py-1" value={role} onChange={e => setRole(e.target.value)}>
        {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <select className="select text-xs py-1" value={anteil} title="Einsatzanteil"
        onChange={e => setAnteil(parseFloat(e.target.value))}>
        {TEAM_ANTEILE.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      <button className="btn-secondary text-xs" disabled={!staffId}
        onClick={() => { onAdd(staffId, role, anteil); setStaffId(''); setAnteil(1) }}>
        <UserPlus size={12} />
      </button>
    </div>
  )
}

// ── Projektteams-Bereich: nur Team-Vorlagen konfigurieren.
// Die Zuweisung an ein Projekt erfolgt in der Projektdatenbank
// (Karte "Projektteam & Projektleitung" – dort auch als ganze Vorlage).
function TeamsTab({ staff, teams, onTeamsChange }) {
  return (
    <div className="space-y-4">
      <TeamTemplates staff={staff} teams={teams} onChange={onTeamsChange} />
      <p className="text-xs text-gray-400 px-1">
        Die Zuweisung eines Teams an ein Projekt erfolgt in der <strong>Projektdatenbank</strong> (Projektteam &amp; Projektleitung) – dort per Klick als ganze Vorlage.
      </p>
    </div>
  )
}

// Verfügbare Tage je Mitarbeiter/Wochentag aus dem Arbeitszeitmodell (¼-Schritte, 8h = 1 Tag)
export const capDays = (member, dayKey) =>
  Math.round(((member?.dayHours?.[dayKey] || 0) / 8) * 4) / 4
const TAGE_OPTIONS = [
  { value: '',    label: '–' },
  { value: 0.25,  label: '0,25' },
  { value: 0.5,   label: '0,5' },
  { value: 0.75,  label: '0,75' },
  { value: 1,     label: '1,0' },
]
const fmtTage = (t) => (t === '' || t == null) ? '' : String(t).replace('.', ',')
const ABSENCE = [
  { id: 'urlaub', name: 'Urlaub' }, { id: 'krank', name: 'Krank' }, { id: 'buero', name: 'Büro / intern' },
]

// ── Zellen-Editor: Mitarbeiter je Projekt × Kalendertag hinterlegen ──────────
function CellEditor({ cell, staff, teamIds, getTage, setTage, setTageBulk, sumFor, onClose }) {
  const { project, week, monday, dayKey, dayIdx } = cell
  const date = addDays(monday, dayIdx)
  const dayLabel = DAYS.find(d => d.key === dayKey)?.label || ''

  // Ganzes Projektteam einplanen: je Mitglied Einsatzanteil × Tageskapazität,
  // begrenzt auf die Restkapazität (bereits anderweitig Verplantes), ¼-gerundet
  const fillTeam = () => {
    const entries = []
    for (const member of staff) {
      if (!teamIds.has(member.id)) continue
      const anteil = teamIds.get?.(member.id) ?? 1
      const cap    = capDays(member, dayKey)
      const own    = getTage(week, project.id, member.id, dayKey) || 0
      const others = sumFor(week, member.id, dayKey) - own
      const wunsch = Math.floor(cap * anteil * 4) / 4
      const value  = Math.max(0, Math.min(wunsch, Math.floor((cap - others) * 4) / 4))
      if (value > 0) entries.push({ staffId: member.id, value })
    }
    if (entries.length > 0) setTageBulk(week, project.id, dayKey, entries)
  }

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const sorted = [...staff].sort((a, b) =>
    (teamIds.has(a.id) ? 0 : 1) - (teamIds.has(b.id) ? 0 : 1)
    || a.name.localeCompare(b.name, 'de'))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md max-h-[80vh] flex flex-col border border-gray-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{project.name}</p>
            <p className="text-xs text-gray-400">{dayLabel}, {date.toLocaleDateString('de-DE')} · KW {week.split('-W')[1]} · ¼-Tagesschritte, beliebig viele Mitarbeiter</p>
          </div>
          <button className="btn-ghost p-1" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {sorted.map(member => {
            const val   = getTage(week, project.id, member.id, dayKey)
            const cap   = capDays(member, dayKey)
            const total = sumFor(week, member.id, dayKey)
            const over  = total > cap
            return (
              <div key={member.id} className={`flex items-center gap-3 px-4 py-2 ${val ? 'bg-brand-50/40' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {member.name}
                    {teamIds.has(member.id) && (
                      <span className="badge text-[9px] bg-brand-50 text-brand-600 border border-brand-200 ml-1.5">
                        Team{(teamIds.get?.(member.id) ?? 1) < 1 ? ` ${Math.round((teamIds.get(member.id)) * 100)} %` : ''}
                      </span>
                    )}
                  </p>
                  <p className={`text-[10px] ${over ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                    Tag gesamt: {fmtTage(total) || '0'} / {fmtTage(cap) || '0'}{over ? ' – überbucht!' : ''}
                  </p>
                </div>
                <select
                  className={`select text-sm py-1 w-16 text-center ${val ? 'border-brand-400 font-semibold' : ''}`}
                  value={val}
                  onChange={e => setTage(week, project.id, member.id, dayKey, e.target.value === '' ? '' : parseFloat(e.target.value))}
                >
                  {TAGE_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-200 flex items-center justify-between gap-2">
          {teamIds.size > 0 ? (
            <button className="btn-secondary text-xs" title="Alle Teammitglieder mit ihrer Restkapazität dieses Tages einplanen"
              onClick={fillTeam}>
              <Users size={13} /> Projektteam einplanen
            </button>
          ) : <span />}
          <button className="btn-primary text-sm" onClick={onClose}><Check size={14} /> Fertig</button>
        </div>
      </div>
    </div>
  )
}

// ── Mitarbeiter-Monitoring: komplette Einsatzübersicht einer Person ─────────
function StaffDetail({ member, weeks, plans, projName, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const capWeek = DAYS.reduce((s, d) => s + capDays(member, d.key), 0)
  let plannedTotal = 0, capTotal = 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={16} className="text-brand-600" /> {member.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {member.funktion ? `${member.funktion} · ` : ''}Arbeitszeitmodell: {DAYS.map(d => fmtTage(capDays(member, d.key)) || '0').join(' / ')} Tage (Mo–Fr)
            </p>
          </div>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {weeks.map(w => {
            const weekPlanned = (plans[w.week] || []).reduce((s, a) =>
              s + (a.staffId === member.id ? DAYS.reduce((x, d) => x + (a.days?.[d.key] || 0), 0) : 0), 0)
            plannedTotal += weekPlanned; capTotal += capWeek
            const pct = capWeek > 0 ? Math.round(weekPlanned / capWeek * 100) : 0
            return (
              <div key={w.week}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-gray-800">KW {w.week.split('-W')[1]}</span>
                  <span className="text-xs text-gray-400">({fmtShort(w.monday)} – {fmtShort(addDays(w.monday, 4))})</span>
                  <span className={`ml-auto text-xs font-semibold ${pct > 100 ? 'text-red-600' : pct >= 90 ? 'text-green-600' : 'text-amber-600'}`}>
                    {fmtTage(weekPlanned)} / {fmtTage(capWeek)} Tage · {pct} %
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {DAYS.map((d, i) => {
                    const items = (plans[w.week] || [])
                      .filter(a => a.staffId === member.id && a.days?.[d.key] > 0)
                      .map(a => ({ name: projName(a.projectId) || '?', v: a.days[d.key], pid: a.projectId }))
                    const cap = capDays(member, d.key)
                    const total = items.reduce((s, x) => s + x.v, 0)
                    return (
                      <div key={d.key} className={`border p-1.5 min-h-[54px] ${total > cap ? 'border-red-300 bg-red-50' : total > 0 ? 'border-gray-200' : 'border-gray-100 bg-gray-50/50'}`}>
                        <p className="text-[10px] text-gray-400 mb-0.5">{d.label.slice(0, 2)} {fmtShort(addDays(w.monday, i))}</p>
                        {items.length === 0
                          ? <p className="text-[10px] text-gray-300">–</p>
                          : items.map((x, j) => (
                            <p key={j} className={`text-[10px] leading-tight truncate ${['urlaub', 'krank'].includes(x.pid) ? 'text-amber-700' : 'text-gray-700'}`} title={x.name}>
                              {x.name} <strong>{fmtTage(x.v)}</strong>
                            </p>
                          ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">Gesamt (4 Wochen)</span>
            <span className={`text-sm font-bold ${plannedTotal > capTotal ? 'text-red-600' : plannedTotal >= capTotal * 0.9 ? 'text-green-600' : 'text-amber-600'}`}>
              {fmtTage(plannedTotal)} / {fmtTage(capTotal)} Tage · {capTotal > 0 ? Math.round(plannedTotal / capTotal * 100) : 0} % Auslastung
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Auswertung: Parameter wählen, speichern und drucken ─────────────────────
function ReportModal({ presets, onSavePreset, onDeletePreset, onPrint, onClose }) {
  const [params, setParams] = useState({
    showProjekte: true, showAuslastung: true, sort: 'reihenfolge', nurBelegte: true,
  })
  const [presetName, setPresetName] = useState('')
  const set = (patch) => setParams(p => ({ ...p, ...patch }))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md border border-gray-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Printer size={16} className="text-brand-600" /> Auswertung</h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Gespeicherte Parameter */}
          {presets.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Gespeicherte Auswertungen</p>
              <div className="space-y-1">
                {presets.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <button className="flex-1 text-left text-sm px-3 py-1.5 border border-gray-200 hover:border-brand-300 hover:bg-brand-50/50 transition-colors"
                      onClick={() => setParams(p.params)}>{p.name}</button>
                    <button className="btn-ghost p-1 text-gray-300 hover:text-red-500" onClick={() => onDeletePreset(p.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Inhalte</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={params.showProjekte} onChange={e => set({ showProjekte: e.target.checked })} />
              Projektübersicht (Tage je Projekt und Woche, mit Mitarbeitern)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
              <input type="checkbox" checked={params.showAuslastung} onChange={e => set({ showAuslastung: e.target.checked })} />
              Personalauslastung (verplant / Kapazität je Woche, Auslastung %)
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Sortierung der Projekte</p>
              <select className="select w-full text-sm" value={params.sort} onChange={e => set({ sort: e.target.value })}>
                <option value="reihenfolge">Wie in der Planung</option>
                <option value="nummer">Nach Projektnummer</option>
                <option value="name">Alphabetisch</option>
              </select>
            </div>
            <div className="pt-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={params.nurBelegte} onChange={e => set({ nurBelegte: e.target.checked })} />
                Nur belegte Projekte
              </label>
            </div>
          </div>

          {/* Parameter speichern */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <input className="input text-sm flex-1" placeholder="Als Vorlage speichern unter…"
              value={presetName} onChange={e => setPresetName(e.target.value)} />
            <button className="btn-secondary text-sm" disabled={!presetName.trim()}
              onClick={() => { onSavePreset(presetName.trim(), params); setPresetName('') }}>
              Speichern
            </button>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={!params.showProjekte && !params.showAuslastung}
            onClick={() => onPrint(params)}>
            <Printer size={14} /> Drucken
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function PersonalplanungView({ projects, onUpdateProject, serverUser, onBack }) {
  const [tab,     setTab]     = useState('plan')
  const [startMonday, setStartMonday] = useState(() => mondayOf(new Date()))
  const [plans,   setPlans]   = useState({})     // { [week]: assignments[] }
  const [addedRows, setAddedRows] = useState({}) // { [projectId]: [staffId] } – frisch hinzugefügt, noch ohne Werte
  const [staff,   setStaff]   = useState([])
  const [staffReady, setStaffReady] = useState(false)
  const [orgUsers, setOrgUsers] = useState([])   // eigene Organisation (Benutzerverzeichnis)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [pubUrl,  setPubUrl]  = useState(null)
  const [pubCopied, setPubCopied] = useState(false)
  const [planSettings, setPlanSettings] = useState({ projectOrder: [], services: [] })
  const [newService, setNewService] = useState('')
  const saveTimers = useRef({})

  // Einstellungen (Reihenfolge + Zusatz-Leistungen) laden/speichern
  useEffect(() => {
    if (isServer) {
      fetch('/api/staff-plan-settings', { headers: authHeaders() })
        .then(r => r.ok ? r.json() : {})
        .then(s => setPlanSettings({ projectOrder: s.projectOrder || [], services: s.services || [] }))
        .catch(() => {})
    } else {
      try { setPlanSettings(JSON.parse(localStorage.getItem('kp_staffplan_settings') || '{"projectOrder":[],"services":[]}')) } catch {}
    }
  }, [])

  const savePlanSettings = (next) => {
    setPlanSettings(next)
    if (isServer) {
      fetch('/api/staff-plan-settings', {
        method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(next),
      }).catch(() => {})
    } else {
      localStorage.setItem('kp_staffplan_settings', JSON.stringify(next))
    }
  }

  // 4 Wochen ab Startmontag
  const weeks = useMemo(() => Array.from({ length: 4 }, (_, i) => {
    const mon = addDays(startMonday, i * 7)
    return { monday: mon, week: isoWeek(mon) }
  }), [startMonday])

  const activeStaff = staff.filter(s => s.active !== false)
  const activeProjects = (projects || []).filter(p => !p.isArchived)

  const loadStaff = useCallback(async () => {
    try { setStaff(await staffApi.list()); setStaffReady(true) } catch (e) { setError(e.message) }
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

  // Mehrere Mitarbeiter auf einmal setzen (Team-Einplanung) – ein Schreibvorgang
  const setTageBulk = (week, projectId, dayKey, entries) => {
    let list = (plans[week] || []).map(a => ({ ...a, days: { ...a.days } }))
    for (const { staffId, value } of entries) {
      let a = list.find(x => x.projectId === projectId && x.staffId === staffId)
      if (!a) { a = { projectId, staffId, days: {} }; list.push(a) }
      if (value) a.days[dayKey] = value
      else delete a.days[dayKey]
    }
    persistWeek(week, list.filter(a => Object.values(a.days || {}).some(v => v > 0)))
  }

  // Projektteam (aus der Projektdatenbank) → Mitarbeiter-Stammdaten zuordnen.
  // Das Team ist die Basis: seine Mitglieder erscheinen automatisch als Zeilen.
  const teamStaffIds = (project) => {
    const team = project?.team || []
    return new Set(activeStaff
      .filter(s => team.some(m => m.name === s.name
        || (m.email && s.email && m.email.toLowerCase() === s.email.toLowerCase())))
      .map(s => s.id))
  }

  // Einsatzanteile des Projektteams (staffId → Anteil 0,25–1)
  const teamShares = (project) => {
    const map = new Map()
    const team = project?.team || []
    for (const s of activeStaff) {
      const m = team.find(x => x.name === s.name
        || (x.email && s.email && x.email.toLowerCase() === s.email.toLowerCase()))
      if (m) map.set(s.id, m.anteil ?? 1)
    }
    return map
  }

  // Mitarbeiter je Projekt: Projektteam + bereits verplante + frisch hinzugefügte
  const staffIdsFor = (project) => {
    const ids = new Set([...teamStaffIds(project), ...(addedRows[project.id] || [])])
    for (const w of weeks) for (const a of (plans[w.week] || [])) {
      if (a.projectId === project.id) ids.add(a.staffId)
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
    || planSettings.services.find(s => s.id === pid)?.name
    || (projects || []).find(p => p.id === pid)?.name
    || ''

  // Projektreihenfolge: manuell (planSettings.projectOrder), sonst nach Nummer
  const sortedProjects = useMemo(() => {
    const idx = new Map(planSettings.projectOrder.map((id, i) => [id, i]))
    return [...activeProjects].sort((a, b) => {
      const ia = idx.has(a.id) ? idx.get(a.id) : Infinity
      const ib = idx.has(b.id) ? idx.get(b.id) : Infinity
      if (ia !== ib) return ia - ib
      return (parseInt(a.projectData?.nummer, 10) || 99999) - (parseInt(b.projectData?.nummer, 10) || 99999)
        || (a.name || '').localeCompare(b.name || '', 'de')
    })
  }, [activeProjects, planSettings.projectOrder])

  const moveProject = (projectId, dir) => {
    const ids = sortedProjects.map(p => p.id)
    const i = ids.indexOf(projectId)
    const j = i + dir
    if (i === -1 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    savePlanSettings({ ...planSettings, projectOrder: ids })
  }

  // Zusatz-Leistungen (nicht projektgebunden), z. B. Kaufmännische Assistenz
  const addService = () => {
    const name = newService.trim()
    if (!name) return
    savePlanSettings({ ...planSettings, services: [...planSettings.services, { id: `svc_${uid()}`, name }] })
    setNewService('')
  }

  const removeService = (svc) => {
    if (!confirm(`Leistung „${svc.name}" entfernen? Zugehörige Einplanungen der angezeigten Wochen werden gelöscht.`)) return
    for (const w of weeks) {
      const list = plans[w.week] || []
      const filtered = list.filter(a => a.projectId !== svc.id)
      if (filtered.length !== list.length) persistWeek(w.week, filtered)
    }
    savePlanSettings({ ...planSettings, services: planSettings.services.filter(s => s.id !== svc.id) })
  }

  // Projekte ausblenden (planSettings.hiddenProjects)
  const hiddenIds = planSettings.hiddenProjects || []
  const hideProject   = (id) => savePlanSettings({ ...planSettings, hiddenProjects: [...hiddenIds, id] })
  const unhideProject = (id) => savePlanSettings({ ...planSettings, hiddenProjects: hiddenIds.filter(x => x !== id) })
  const hiddenProjects = activeProjects.filter(p => hiddenIds.includes(p.id))

  // Kompakte Beschriftung: Nummer + Kürzel genügen, wenn die Codierung eingehalten ist
  const shortLabel = (p) => {
    const d = p.projectData || {}
    return (d.nummer && d.kuerzel) ? `${d.nummer} ${d.kuerzel}` : (p.name || 'Unbenannt')
  }

  // Zeilen der Matrix: Projekte (sortiert, ohne ausgeblendete) + Zusatz-Leistungen + Abwesenheiten
  const matrixBlocks = useMemo(() => [
    ...sortedProjects.filter(p => !hiddenIds.includes(p.id)),
    ...planSettings.services.map(s => ({ ...s, _service: true })),
    ...ABSENCE,
  ], [sortedProjects, planSettings.services, planSettings.hiddenProjects])

  // Zellen-Editor (Mitarbeiter je Projekt × Tag hinterlegen)
  const [cellEdit, setCellEdit] = useState(null)   // { project, week, monday, dayKey, dayIdx }
  // Mitarbeiter-Monitoring (Einsatzübersicht einer Person)
  const [staffDetail, setStaffDetail] = useState(null)

  // Drag & Drop zum Verschieben der Projektzeilen
  const [dragId,      setDragId]      = useState(null)
  const [dragArmedId, setDragArmedId] = useState(null)   // Drag nur über den Griff starten

  // Zellen per Ziehen kopieren (wie Excel-Ausfüllen, innerhalb der Projektzeile)
  const [fill, setFill] = useState(null)   // { project, srcCol, curCol }  col = wocheIdx*5 + tagIdx
  const colWeekDay = (col) => ({ week: weeks[Math.floor(col / 5)].week, dayKey: DAYS[col % 5].key })

  const applyFill = useCallback((f) => {
    const { project, srcCol, curCol } = f
    const lo = Math.min(srcCol, curCol), hi = Math.max(srcCol, curCol)
    const src = colWeekDay(srcCol)
    const srcVals = (plans[src.week] || [])
      .filter(a => a.projectId === project.id && a.days?.[src.dayKey] > 0)
      .map(a => ({ staffId: a.staffId, v: a.days[src.dayKey] }))

    const nextByWeek = {}
    const listFor = (wk) => nextByWeek[wk] ?? (nextByWeek[wk] = (plans[wk] || []).map(a => ({ ...a, days: { ...a.days } })))
    for (let c = lo; c <= hi; c++) {
      if (c === srcCol) continue
      const { week: wk, dayKey: dk } = colWeekDay(c)
      const list = listFor(wk)
      // Vorhandene Werte dieses Projekts am Zieltag ersetzen
      for (const a of list) if (a.projectId === project.id && a.days) delete a.days[dk]
      for (const { staffId, v } of srcVals) {
        let a = list.find(x => x.projectId === project.id && x.staffId === staffId)
        if (!a) { a = { projectId: project.id, staffId, days: {} }; list.push(a) }
        a.days[dk] = v
      }
    }
    for (const wk of Object.keys(nextByWeek)) {
      persistWeek(wk, nextByWeek[wk].filter(a => Object.values(a.days || {}).some(v => v > 0)))
    }
  }, [plans, weeks, persistWeek])

  useEffect(() => {
    if (!fill) return
    const up = () => {
      if (fill.curCol !== fill.srcCol) applyFill(fill)
      setFill(null)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [fill, applyFill])
  const handleDropOn = (targetId) => {
    if (!dragId || dragId === targetId) return
    const ids = sortedProjects.map(p => p.id).filter(id => id !== dragId)
    const ti = ids.indexOf(targetId)
    if (ti === -1) return
    ids.splice(ti, 0, dragId)
    savePlanSettings({ ...planSettings, projectOrder: ids })
    setDragId(null)
  }

  // ── Auswertung (Parameter + Druck) ─────────────────────────────────────────
  const [showReport, setShowReport] = useState(false)

  const savePreset = (name, params) =>
    savePlanSettings({ ...planSettings, reportPresets: [...(planSettings.reportPresets || []), { id: uid(), name, params }] })
  const deletePreset = (id) =>
    savePlanSettings({ ...planSettings, reportPresets: (planSettings.reportPresets || []).filter(p => p.id !== id) })

  const buildReportHtml = (params) => {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const kwLabel = (w) => `KW ${w.week.split('-W')[1]}`
    const range = `KW ${weeks[0].week.split('-W')[1]} – KW ${weeks[3].week.split('-W')[1]} (${fmtShort(weeks[0].monday)} – ${fmtShort(addDays(weeks[3].monday, 4))})`

    // Projektblöcke (ohne Abwesenheiten), sortiert nach Parameter
    let blocks = matrixBlocks.filter(b => !ABSENCE.find(a => a.id === b.id))
    const weekSum = (b, w) => (plans[w.week] || []).reduce((s, a) =>
      s + (a.projectId === b.id ? DAYS.reduce((x, d) => x + (a.days?.[d.key] || 0), 0) : 0), 0)
    const totalOf = (b) => weeks.reduce((s, w) => s + weekSum(b, w), 0)
    if (params.nurBelegte) blocks = blocks.filter(b => totalOf(b) > 0)
    if (params.sort === 'nummer') blocks = [...blocks].sort((a, b) =>
      (parseInt(a.projectData?.nummer, 10) || 99999) - (parseInt(b.projectData?.nummer, 10) || 99999))
    if (params.sort === 'name') blocks = [...blocks].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))

    const fmtNum = (n) => n % 1 === 0 ? String(n) : String(n).replace('.', ',')

    let projSection = ''
    if (params.showProjekte) {
      const rows = blocks.map(b => {
        const staffTotals = new Map()
        for (const w of weeks) for (const a of (plans[w.week] || [])) {
          if (a.projectId !== b.id) continue
          const t = DAYS.reduce((x, d) => x + (a.days?.[d.key] || 0), 0)
          if (t > 0) staffTotals.set(a.staffId, (staffTotals.get(a.staffId) || 0) + t)
        }
        const staffStr = [...staffTotals.entries()]
          .sort((x, y) => y[1] - x[1])
          .map(([id, t]) => `${esc(activeStaff.find(s => s.id === id)?.name || '?')} (${fmtNum(t)})`)
          .join(', ')
        return `<tr>
          <td style="padding:5px 8px;border:0.5pt solid #d1d5db;"><strong>${esc(b.name)}</strong>${b.projectData?.gesellschaft ? ` <span style="color:#6b7280;font-size:8pt;">(${esc(b.projectData.gesellschaft)})</span>` : ''}
            ${staffStr ? `<br><span style="color:#6b7280;font-size:8pt;">${staffStr}</span>` : ''}</td>
          ${weeks.map(w => `<td style="padding:5px 8px;border:0.5pt solid #d1d5db;text-align:center;">${weekSum(b, w) > 0 ? fmtNum(weekSum(b, w)) : '–'}</td>`).join('')}
          <td style="padding:5px 8px;border:0.5pt solid #d1d5db;text-align:center;font-weight:bold;">${fmtNum(totalOf(b))}</td>
        </tr>`
      }).join('')
      projSection = `
        <h2 style="font-size:12pt;margin:16px 0 6px 0;">Projektübersicht (Tage)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:9pt;">
          <thead><tr style="background:#000040;color:#8FBEFF;">
            <th style="padding:5px 8px;text-align:left;border:0.5pt solid #000040;">Projekt / Leistung · Mitarbeiter</th>
            ${weeks.map(w => `<th style="padding:5px 8px;border:0.5pt solid #000040;">${kwLabel(w)}</th>`).join('')}
            <th style="padding:5px 8px;border:0.5pt solid #000040;">Gesamt</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="padding:8px;color:#9ca3af;">Keine Einplanungen.</td></tr>'}</tbody>
        </table>`
    }

    let ausSection = ''
    if (params.showAuslastung) {
      const rows = activeStaff.map(m => {
        const capWeek = DAYS.reduce((s, d) => s + capDays(m, d.key), 0)
        let planned = 0, capacity = 0
        const cells = weeks.map(w => {
          const p = (plans[w.week] || []).reduce((s, a) =>
            s + (a.staffId === m.id ? DAYS.reduce((x, d) => x + (a.days?.[d.key] || 0), 0) : 0), 0)
          planned += p; capacity += capWeek
          const over = p > capWeek
          return `<td style="padding:5px 8px;border:0.5pt solid #d1d5db;text-align:center;${over ? 'color:#dc2626;font-weight:bold;' : ''}">${fmtNum(p)} / ${fmtNum(capWeek)}</td>`
        }).join('')
        const pct = capacity > 0 ? Math.round(planned / capacity * 100) : 0
        return `<tr>
          <td style="padding:5px 8px;border:0.5pt solid #d1d5db;"><strong>${esc(m.name)}</strong>${m.funktion ? ` <span style="color:#6b7280;font-size:8pt;">${esc(m.funktion)}</span>` : ''}</td>
          ${cells}
          <td style="padding:5px 8px;border:0.5pt solid #d1d5db;text-align:center;font-weight:bold;${pct > 100 ? 'color:#dc2626;' : pct >= 90 ? 'color:#16a34a;' : 'color:#d97706;'}">${pct} %</td>
        </tr>`
      }).join('')
      ausSection = `
        <h2 style="font-size:12pt;margin:16px 0 6px 0;">Personalauslastung (verplant / Kapazität in Tagen)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:9pt;">
          <thead><tr style="background:#000040;color:#8FBEFF;">
            <th style="padding:5px 8px;text-align:left;border:0.5pt solid #000040;">Mitarbeiter</th>
            ${weeks.map(w => `<th style="padding:5px 8px;border:0.5pt solid #000040;">${kwLabel(w)}</th>`).join('')}
            <th style="padding:5px 8px;border:0.5pt solid #000040;">Auslastung</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`
    }

    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Personalplanung – Auswertung</title>
      <style>@page { size: A4; margin: 14mm; } body { font-family: Arial, sans-serif; color: #000; margin: 0; }</style>
      </head><body>
      <div style="border-bottom:1pt solid #000;padding-bottom:6px;margin-bottom:4px;">
        <div style="font-size:8pt;letter-spacing:2px;color:#555;">GHBA</div>
        <div style="font-size:15pt;font-weight:bold;">Personalplanung – Auswertung</div>
        <div style="font-size:9pt;color:#555;">${range} · Stand ${new Date().toLocaleDateString('de-DE')}</div>
      </div>
      ${projSection}${ausSection}
      </body></html>`
  }

  const printReport = (params) => {
    const html = buildReportHtml(params)
    const iframe = document.createElement('iframe')
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 250)
  }

  // Alle Personen der eigenen Organisation automatisch als Mitarbeiter anlegen
  const syncedRef = useRef(false)
  useEffect(() => {
    if (!isServer || syncedRef.current || !staffReady || orgUsers.length === 0) return
    syncedRef.current = true
    const names  = new Set(staff.map(s => s.name))
    const emails = new Set(staff.map(s => (s.email || '').toLowerCase()).filter(Boolean))
    const missing = orgUsers.filter(u => {
      const name  = u.display_name || u.username
      const email = (u.email || '').toLowerCase()
      return !names.has(name) && (!email || !emails.has(email))
    })
    if (missing.length === 0) return
    ;(async () => {
      for (const u of missing) {
        try {
          await staffApi.create({
            name: u.display_name || u.username, email: u.email || '', funktion: '',
            weeklyHours: 40, dayHours: { mo: 8, di: 8, mi: 8, do: 8, fr: 8 },
          })
        } catch {}
      }
      loadStaff()
    })()
  }, [staffReady, orgUsers])  // eslint-disable-line react-hooks/exhaustive-deps

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
        <TeamsTab
          staff={staff}
          teams={planSettings.teams || []}
          onTeamsChange={(teams) => savePlanSettings({ ...planSettings, teams })}
        />
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
              <button className="btn-secondary text-xs" title="Auswertung mit einstellbaren Parametern drucken"
                onClick={() => setShowReport(true)} disabled={activeStaff.length === 0}>
                <Printer size={13} /> Auswertung
              </button>
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
              {/* Matrix: Projekte links · Kalenderskala rechts (KW-Ebene + Wochentage) */}
              <div className="card overflow-x-auto">
                <table className="border-collapse text-xs min-w-[1150px] w-full">
                  <thead>
                    <tr className="bg-night text-white">
                      <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide w-56 sticky left-0 bg-night z-10">Projekt</th>
                      {weeks.map(w => (
                        <th key={w.week} colSpan={5} className="px-1 py-2 text-center font-semibold border-l border-white/20">
                          KW {w.week.split('-W')[1]}
                          <span className="block font-normal text-[10px] text-sky">
                            {fmtShort(w.monday)} – {fmtShort(addDays(w.monday, 4))}
                          </span>
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-gray-50/80">
                      <th className="border-b border-gray-200 sticky left-0 bg-gray-50 z-10" />
                      {weeks.map(w => DAYS.map((d, i) => (
                        <th key={`${w.week}-${d.key}`}
                          className={`px-0.5 py-1 text-center font-medium text-gray-400 border-b border-gray-200 ${i === 0 ? 'border-l border-gray-200' : ''}`}>
                          {d.label.slice(0, 2)}
                        </th>
                      )))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixBlocks.map(project => {
                      const isAbsence = !!ABSENCE.find(a => a.id === project.id)
                      const isService = !!project._service
                      const isExtra   = isAbsence || isService
                      const ges = project.projectData?.gesellschaft || ''
                      const pl  = isExtra ? [] : (project.team || []).filter(m => m.role === 'Projektleitung').map(m => m.name)
                      const projIdx = sortedProjects.findIndex(p => p.id === project.id)
                      return (
                        <tr
                          key={project.id}
                          className={`border-b border-gray-100 ${isAbsence ? 'bg-yellow-50/40' : isService ? 'bg-gray-50/40' : ''} ${dragId === project.id ? 'opacity-40' : ''}`}
                          draggable={dragArmedId === project.id}
                          onDragStart={() => setDragId(project.id)}
                          onDragEnd={() => { setDragId(null); setDragArmedId(null) }}
                          onDragOver={e => { if (dragId && !isExtra) e.preventDefault() }}
                          onDrop={() => !isExtra && handleDropOn(project.id)}
                        >
                          {/* Projektspalte */}
                          <td className={`px-2 py-1.5 sticky left-0 z-10 ${isAbsence ? 'bg-yellow-50' : isService ? 'bg-gray-50' : 'bg-white'}`}>
                            <div className="flex items-center gap-1">
                              {!isExtra && (
                                <span
                                  className="no-print flex-shrink-0 cursor-grab text-gray-300 hover:text-brand-600"
                                  title="Ziehen zum Verschieben"
                                  onMouseDown={() => setDragArmedId(project.id)}
                                  onMouseUp={() => setDragArmedId(null)}
                                >
                                  <GripVertical size={13} />
                                </span>
                              )}
                              {!isExtra && (
                                <span className="flex flex-col no-print flex-shrink-0">
                                  <button className="text-gray-300 hover:text-brand-600 disabled:opacity-20 leading-none" title="Nach oben"
                                    disabled={projIdx <= 0} onClick={() => moveProject(project.id, -1)}><ChevronUp size={11} /></button>
                                  <button className="text-gray-300 hover:text-brand-600 disabled:opacity-20 leading-none" title="Nach unten"
                                    disabled={projIdx === sortedProjects.length - 1} onClick={() => moveProject(project.id, 1)}><ChevronDown size={11} /></button>
                                </span>
                              )}
                              {isService && <Briefcase size={12} className="text-gray-400 flex-shrink-0" />}
                              <span className="min-w-0">
                                <span className="block font-semibold text-gray-800 truncate"
                                  title={`${project.name || 'Unbenannt'}${pl.length ? ` · PL: ${pl.join(', ')}` : ''}`}>
                                  {isExtra ? (project.name || 'Unbenannt') : shortLabel(project)}
                                </span>
                                {(ges || pl.length > 0) && (
                                  <span className="block text-[10px] text-gray-400 truncate">
                                    {ges}{ges && pl.length > 0 ? ' · ' : ''}{pl.length > 0 ? `PL: ${pl.join(', ')}` : ''}
                                  </span>
                                )}
                              </span>
                              {!isExtra && (
                                <button className="btn-ghost p-0.5 text-gray-300 hover:text-gray-600 no-print ml-auto flex-shrink-0" title="Projekt ausblenden"
                                  onClick={() => hideProject(project.id)}><EyeOff size={11} /></button>
                              )}
                              {isService && (
                                <button className="btn-ghost p-0.5 text-gray-300 hover:text-red-500 no-print ml-auto flex-shrink-0" title="Leistung entfernen"
                                  onClick={() => removeService(project)}><Trash2 size={11} /></button>
                              )}
                            </div>
                          </td>
                          {/* Schnittstellen Projekt × Kalendertag: Summe der ¼-Tage, Klick = Mitarbeiter hinterlegen, Ziehen = Kopieren */}
                          {weeks.map((w, wi) => DAYS.map((d, i) => {
                            const total = (plans[w.week] || []).reduce((s, a) =>
                              s + (a.projectId === project.id ? (a.days?.[d.key] || 0) : 0), 0)
                            const nStaff = (plans[w.week] || []).filter(a => a.projectId === project.id && a.days?.[d.key] > 0).length
                            const col = wi * 5 + i
                            const inFill = fill && fill.project.id === project.id
                              && col >= Math.min(fill.srcCol, fill.curCol) && col <= Math.max(fill.srcCol, fill.curCol)
                            return (
                              <td key={`${w.week}-${d.key}`} className={`p-0 text-center ${i === 0 ? 'border-l border-gray-200' : 'border-l border-gray-50'}`}>
                                <button
                                  className={`w-full h-8 text-xs transition-colors ${
                                    inFill ? 'bg-brand-200 text-brand-900 ring-1 ring-inset ring-brand-400'
                                    : total > 0
                                      ? 'font-semibold text-brand-800 bg-brand-50 hover:bg-brand-100'
                                      : 'text-gray-200 hover:bg-gray-50 hover:text-gray-400'}`}
                                  style={{ cursor: fill ? 'crosshair' : 'pointer' }}
                                  title={total > 0
                                    ? `${fmtTage(total)} Tag(e) · ${nStaff} Mitarbeiter – klicken zum Bearbeiten, ziehen zum Kopieren`
                                    : 'Klicken: Mitarbeiter einplanen · Ziehen: Zelle kopieren'}
                                  onMouseDown={e => { e.preventDefault(); setFill({ project, srcCol: col, curCol: col }) }}
                                  onMouseEnter={() => fill && fill.project.id === project.id && setFill(f => ({ ...f, curCol: col }))}
                                  onClick={() => setCellEdit({ project, week: w.week, monday: w.monday, dayKey: d.key, dayIdx: i })}
                                >
                                  {total > 0 ? (
                                    <>
                                      {fmtTage(total)}
                                      {nStaff > 1 && <sup className="text-[8px] text-brand-500 ml-px">{nStaff}</sup>}
                                    </>
                                  ) : '·'}
                                </button>
                              </td>
                            )
                          }))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                  <span>Zelle anklicken = Mitarbeiter hinterlegen (0,25er-Schritte) · Zelle ziehen = kopieren · Zahl = Summe der Tage</span>
                  {hiddenProjects.length > 0 && (
                    <span className="flex items-center gap-1.5 flex-wrap no-print ml-auto">
                      <span className="text-gray-500">Ausgeblendet:</span>
                      {hiddenProjects.map(p => (
                        <button key={p.id}
                          className="flex items-center gap-1 px-2 py-0.5 border border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-700 transition-colors"
                          title={`${p.name} wieder einblenden`}
                          onClick={() => unhideProject(p.id)}>
                          <Eye size={10} /> {shortLabel(p)}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              </div>

              {/* Weitere Leistung ergänzen (z. B. Kaufmännische Assistenz) */}
              <div className="card p-3 flex gap-2 items-center flex-wrap no-print">
                <Briefcase size={15} className="text-gray-400" />
                <input
                  className="input py-1.5 text-sm flex-1 min-w-[220px]"
                  placeholder="Weitere Leistung ergänzen (z. B. Kaufmännische Assistenz, Buchhaltung, Akquise)…"
                  value={newService}
                  onChange={e => setNewService(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addService()}
                />
                <button className="btn-secondary text-sm" disabled={!newService.trim()} onClick={addService}>
                  <Plus size={14} /> Leistung hinzufügen
                </button>
              </div>

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
                        <td className="px-3 py-1">
                          <button className="font-medium text-gray-800 hover:text-brand-700 hover:underline text-left"
                            title="Einsatzübersicht öffnen (Monitoring)"
                            onClick={() => setStaffDetail(member)}>
                            {member.name}
                          </button>
                        </td>
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

          {/* Zellen-Editor */}
          {cellEdit && (
            <CellEditor
              cell={cellEdit}
              staff={activeStaff}
              teamIds={(cellEdit.project._service || ABSENCE.find(a => a.id === cellEdit.project.id))
                ? new Map() : teamShares(cellEdit.project)}
              getTage={getTage}
              setTage={setTage}
              setTageBulk={setTageBulk}
              sumFor={sumFor}
              onClose={() => setCellEdit(null)}
            />
          )}

          {/* Mitarbeiter-Monitoring */}
          {staffDetail && (
            <StaffDetail
              member={staffDetail}
              weeks={weeks}
              plans={plans}
              projName={projName}
              onClose={() => setStaffDetail(null)}
            />
          )}

          {/* Auswertung */}
          {showReport && (
            <ReportModal
              presets={planSettings.reportPresets || []}
              onSavePreset={savePreset}
              onDeletePreset={deletePreset}
              onPrint={(params) => { printReport(params); setShowReport(false) }}
              onClose={() => setShowReport(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
