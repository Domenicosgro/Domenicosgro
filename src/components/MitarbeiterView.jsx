import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Loader, AlertCircle, X, Users, UserPlus,
         CheckSquare, Pencil, Check } from 'lucide-react'
import { uid } from '../utils'
import { PROJECT_ROLES, TEAM_ANTEILE } from './ProjektTeamEditor'

// ── Mitarbeiter und Projektteams ────────────────────────────────────────────
// Was von der Personalplanung hier geblieben ist, nachdem sie ins Dashboard
// umgezogen ist (docs/UMZUG_PERSONALPLANUNG.md im Dashboard-Repo).
//
// Wochenplanung und Gelände-Ansicht liegen jetzt im Dashboard. Die Mitarbeiter
// bleiben hier, weil sie Stammdaten sind: 16 der 36 stammen nicht aus
// Kontakten, sondern wurden von Hand angelegt — sie brauchen eine Pflege, und
// Stammdaten werden dort gepflegt, wo sie liegen. Das Dashboard liest sie über
// die Stammdaten-Schnittstelle und ergänzt nur das Arbeitszeitmodell.

const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}
const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() })

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

// Wochentage des Arbeitszeitmodells. Samstag und Sonntag sind bewusst
// nicht dabei: geplant wird Mo-Fr.
const DAYS = [
  { key: 'mo', label: 'Montag' }, { key: 'di', label: 'Dienstag' }, { key: 'mi', label: 'Mittwoch' },
  { key: 'do', label: 'Donnerstag' }, { key: 'fr', label: 'Freitag' },
]

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
    if (u.source === 'contact') return false   // Kontakt-Mirrors sind bereits Mitarbeiter
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
                  {s.source === 'contact' && <span className="badge badge-gray text-[10px] ml-2" title="Automatisch aus einem Kontakt der Kategorie „Eigene Organisation“ übernommen">aus Kontakt</span>}
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
              {s.source === 'contact' ? (
                <span className="p-1.5 text-gray-300 flex-shrink-0" title="Wird automatisch aus der Kontaktdatenbank synchronisiert. Zum Entfernen die Kategorie des Kontakts ändern oder den Kontakt löschen."><Lock size={14} /></span>
              ) : (
                <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600"
                  onClick={async () => {
                    if (!confirm(`${s.name} wirklich entfernen?`)) return
                    try { await staffApi.remove(s.id); onChanged() } catch (e) { setError(e.message) }
                  }}><Trash2 size={14} /></button>
              )}
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

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function MitarbeiterView({ onBack }) {
  const [tab, setTab]           = useState('staff')
  const [staff, setStaff]       = useState([])
  const [teams, setTeams]       = useState([])
  const [orgUsers, setOrgUsers] = useState([])
  const [laedt, setLaedt]       = useState(true)
  const [error, setError]       = useState(null)

  const loadStaff = useCallback(async () => {
    try { setStaff(await staffApi.list()) } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => {
    let gestoppt = false
    const laden = async () => {
      await loadStaff()
      if (isServer) {
        try {
          const r = await fetch('/api/users', { headers: authHeaders() })
          const list = r.ok ? await r.json() : []
          if (!gestoppt) setOrgUsers(Array.isArray(list) ? list : [])
        } catch { /* ohne Benutzerverzeichnis geht es auch */ }
        try {
          const r = await fetch('/api/staff-plan-settings', { headers: authHeaders() })
          const s = r.ok ? await r.json() : {}
          if (!gestoppt) setTeams(s.teams || [])
        } catch { /* Team-Vorlagen sind optional */ }
      }
      if (!gestoppt) setLaedt(false)
    }
    laden()
    return () => { gestoppt = true }
  }, [loadStaff])

  // Team-Vorlagen liegen weiter in den Einstellungen des Protokolltools.
  const saveTeams = (next) => {
    setTeams(next)
    if (!isServer) return
    fetch('/api/staff-plan-settings', {
      method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ teams: next }),
    }).catch(() => setError('Team-Vorlagen konnten nicht gespeichert werden.'))
  }

  if (laedt) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-gray-400 text-sm">
        <Loader size={16} className="animate-spin mr-2" /> Mitarbeiter werden geladen …
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 min-w-0">
        <button className="btn-secondary no-print" onClick={onBack}><ArrowLeft size={16} /> Start</button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-night flex items-center gap-2">
            <Users size={20} className="text-brand-600" /> Mitarbeiter &amp; Projektteams
          </h1>
          <p className="text-xs text-gray-500">
            {staff.filter(s => s.active !== false).length} aktive Mitarbeiter · Eigene Organisation
          </p>
        </div>
      </div>

      {/* Die Wochenplanung ist umgezogen — wer sie sucht, soll sie finden. */}
      <p className="text-xs text-brand-800 bg-brand-50 border border-brand-100 px-3 py-2 no-print">
        Die <strong>Wochenplanung</strong> und die Gelände-Ansicht liegen jetzt im Dashboard:{' '}
        <a className="underline" href="http://192.168.178.250:5050/personalplanung"
           target="_blank" rel="noreferrer">Personalplanung öffnen</a>.
        Die Mitarbeiter werden weiter hier gepflegt.
      </p>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      <div className="flex gap-1 border-b border-gray-200 no-print">
        {[['staff', 'Mitarbeiter', <Users key="i" size={14} />],
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
        <TeamsTab staff={staff} teams={teams} onTeamsChange={saveTeams} />
      )}
    </div>
  )
}
