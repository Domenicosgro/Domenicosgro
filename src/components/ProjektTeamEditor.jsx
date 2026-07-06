import React, { useState, useEffect, useMemo } from 'react'
import { Users, UserPlus, Trash2, AlertCircle } from 'lucide-react'
import { uid } from '../utils'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// Rollen im Projektteam (Struktur: i. d. R. 2 × Projektleitung + Team)
export const PROJECT_ROLES = [
  'Projektleitung', 'Architekt/in', 'Techn. Mitarbeiter/in', 'Student/in', 'Bauleitung', 'Assistenz',
]

// Einsatzanteil eines Mitglieds im Projektteam (steuert u. a. die automatische Team-Einplanung)
export const TEAM_ANTEILE = [
  { value: 1,    label: '100 %' },
  { value: 0.75, label: '75 %' },
  { value: 0.5,  label: '50 %' },
  { value: 0.25, label: '25 %' },
]

/**
 * Projektteam-Zusammenstellung (Mitarbeiter + Rolle), gespeichert am Projekt
 * (project.team). Wird in der Personalplanung UND in der Projektdatenbank
 * genutzt. Mitarbeiter kommen aus den Stammdaten der eigenen Organisation.
 */
export default function ProjektTeamEditor({ project, staff: staffProp, onUpdateProject, teamTemplates: tplProp }) {
  const [staffLoaded, setStaffLoaded] = useState(staffProp || null)
  const [tplLoaded,   setTplLoaded]   = useState(null)
  const staff = staffProp || staffLoaded || []
  const teamTemplates = tplProp ?? tplLoaded ?? []
  const team  = project?.team || []

  // Team-Vorlagen selbst laden, wenn nicht übergeben (Projektdatenbank-Kontext)
  useEffect(() => {
    if (tplProp !== undefined) return
    if (isServer) {
      fetch('/api/staff-plan-settings', { headers: authHeaders() })
        .then(r => r.ok ? r.json() : {})
        .then(s => setTplLoaded(s.teams || []))
        .catch(() => setTplLoaded([]))
    } else {
      try { setTplLoaded(JSON.parse(localStorage.getItem('kp_staffplan_settings') || '{}').teams || []) }
      catch { setTplLoaded([]) }
    }
  }, [tplProp])

  const [memberPick, setMemberPick] = useState('')
  const [rolePick,   setRolePick]   = useState(PROJECT_ROLES[0])
  const [anteilPick, setAnteilPick] = useState(1)
  const [templatePick,   setTemplatePick]   = useState('')
  const [templateAnteil, setTemplateAnteil] = useState(1)

  // Ganze Team-Vorlage zuweisen (Mitglieder + Rollen; ohne Duplikate mergen).
  // Der Team-Anteil (0,25er-Schritte) wird mit dem Mitglieder-Anteil aus der
  // Vorlage verrechnet: effektiver Anteil = Mitglied × Team, ¼-gerundet.
  const assignTemplate = () => {
    const tpl = teamTemplates.find(t => t.id === templatePick)
    if (!tpl || !project) return
    const existing = new Set(team.map(m => m.name))
    const added = (tpl.members || [])
      .map(m => {
        const s = staff.find(x => x.id === m.staffId)
        if (!s || existing.has(s.name)) return null
        const eff = Math.max(0.25, Math.round((m.anteil ?? 1) * templateAnteil * 4) / 4)
        return { id: uid(), name: s.name, email: s.email || '', role: m.role || PROJECT_ROLES[0], anteil: eff }
      })
      .filter(Boolean)
    if (added.length > 0) onUpdateProject(project.id, { team: [...team, ...added] })
    setTemplatePick('')
    setTemplateAnteil(1)
  }

  // Mitarbeiter selbst laden, wenn nicht übergeben (Projektdatenbank-Kontext)
  useEffect(() => {
    if (staffProp) return
    if (isServer) {
      fetch('/api/staff', { headers: authHeaders() })
        .then(r => r.ok ? r.json() : [])
        .then(setStaffLoaded)
        .catch(() => setStaffLoaded([]))
    } else {
      setStaffLoaded(JSON.parse(localStorage.getItem('kp_staff') || '[]'))
    }
  }, [staffProp])

  const candidates = useMemo(() => {
    const seen = new Set(team.map(t => t.name))
    return staff.filter(s => s.active !== false && !seen.has(s.name))
  }, [staff, team])

  const plCount = team.filter(m => m.role === 'Projektleitung').length

  const addMember = () => {
    const cand = candidates.find(c => c.id === memberPick)
    if (!cand || !project) return
    onUpdateProject(project.id, { team: [...team, { id: uid(), name: cand.name, email: cand.email || '', role: rolePick, anteil: anteilPick }] })
    setMemberPick('')
    setAnteilPick(1)
  }
  const setRole = (memberId, role) =>
    onUpdateProject(project.id, { team: team.map(m => m.id === memberId ? { ...m, role } : m) })
  const setAnteil = (memberId, anteil) =>
    onUpdateProject(project.id, { team: team.map(m => m.id === memberId ? { ...m, anteil } : m) })
  const removeMember = (memberId) =>
    onUpdateProject(project.id, { team: team.filter(m => m.id !== memberId) })

  return (
    <div className="space-y-3">
      {/* Ganzes Team zuweisen (konfigurierte Vorlagen) */}
      {teamTemplates.length > 0 && (
        <div className="flex gap-2 flex-wrap items-end bg-brand-50/50 border border-brand-100 p-2.5">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Ganzes Team zuweisen (Vorlage)</label>
            <select className="select w-full" value={templatePick} onChange={e => setTemplatePick(e.target.value)}>
              <option value="">– Team-Vorlage wählen –</option>
              {teamTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({(t.members || []).length} Mitglieder)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Team-Anteil</label>
            <select className="select" value={templateAnteil}
              title="Anteil, mit dem das Team diesem Projekt zugeordnet wird (wird mit den Mitglieder-Anteilen verrechnet)"
              onChange={e => setTemplateAnteil(parseFloat(e.target.value))}>
              {TEAM_ANTEILE.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <button className="btn-primary" disabled={!templatePick} onClick={assignTemplate}>
            <Users size={14} /> Team zuweisen
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Teammitglied (eigene Organisation)</label>
          <select className="select w-full" value={memberPick} onChange={e => setMemberPick(e.target.value)}>
            <option value="">– auswählen –</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Rolle</label>
          <select className="select" value={rolePick} onChange={e => setRolePick(e.target.value)}>
            {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Anteil</label>
          <select className="select" value={anteilPick} onChange={e => setAnteilPick(parseFloat(e.target.value))}
            title="Einsatzanteil im Projektteam">
            {TEAM_ANTEILE.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={!memberPick} onClick={addMember}>
          <UserPlus size={14} /> Zuordnen
        </button>
      </div>

      {staff.length === 0 && (
        <p className="text-xs text-gray-400">
          Noch keine Mitarbeiter angelegt – Stammdaten unter Personalplanung → Mitarbeiter pflegen.
        </p>
      )}

      {/* Regel-Hinweis: 2 Projektleiter */}
      {team.length > 0 && plCount < 2 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 flex items-center gap-1.5">
          <AlertCircle size={12} />
          {plCount === 0 ? 'Noch keine Projektleitung zugewiesen' : 'Nur eine Projektleitung zugewiesen'} – in der Regel hat ein Projektteam 2 Projektleiter.
        </p>
      )}

      {team.length === 0 ? (
        <p className="text-sm text-gray-400 border border-gray-100 px-4 py-4 text-center">
          Noch kein Projektteam zusammengestellt.
        </p>
      ) : (
        <div className="border border-gray-100 divide-y divide-gray-50">
          {[...team].sort((a, b) =>
            (a.role === 'Projektleitung' ? 0 : 1) - (b.role === 'Projektleitung' ? 0 : 1)
            || a.name.localeCompare(b.name, 'de')
          ).map(m => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2">
              <Users size={15} className={m.role === 'Projektleitung' ? 'text-brand-600' : 'text-gray-400'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {m.name}
                  {m.role === 'Projektleitung' && <span className="badge text-[10px] bg-brand-100 text-brand-700 border border-brand-300 ml-2">PL</span>}
                </p>
                {m.email && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
              </div>
              <select className="select text-xs py-1" value={m.role} onChange={e => setRole(m.id, e.target.value)}>
                {PROJECT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                {!PROJECT_ROLES.includes(m.role) && <option value={m.role}>{m.role}</option>}
              </select>
              <select className={`select text-xs py-1 ${(m.anteil ?? 1) < 1 ? 'text-amber-700 border-amber-300' : ''}`}
                value={m.anteil ?? 1} title="Einsatzanteil im Projektteam"
                onChange={e => setAnteil(m.id, parseFloat(e.target.value))}>
                {TEAM_ANTEILE.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600" onClick={() => removeMember(m.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
