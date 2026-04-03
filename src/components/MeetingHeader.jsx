import React from 'react'
import { MEETING_TYPES, formatDate, buildProtocolNo } from '../utils'
import LogoUpload from './LogoUpload'
import { FolderOpen } from 'lucide-react'

export default function MeetingHeader({ protocol, protocols, projects, logoDataUrl, onLogoUpdate, onLogoClear, onChange }) {
  const set = (field) => (e) => onChange({ [field]: e.target.value })

  const protocolNo = buildProtocolNo(protocol.projectName, protocol.date)

  // Predecessor dropdown: show all other protocols (not just same project)
  // so the user can pick any predecessor regardless of project name
  const predecessorOptions = (protocols ?? [])
    .filter(p => p.id !== protocol.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const handlePredecessorChange = (e) => {
    const predId = e.target.value || null
    const pred   = predId ? (protocols ?? []).find(p => p.id === predId) : null
    const patch  = { predecessorId: predId }
    // Auto-fill project name from predecessor if current field is empty
    if (pred && !protocol.projectName.trim()) {
      patch.projectName = pred.projectName
    }
    onChange(patch)
  }

  const handleProjectChange = (e) => {
    const projectId = e.target.value || null
    const proj = projectId ? (projects ?? []).find(p => p.id === projectId) : null
    const patch = { projectId }
    // Auto-fill project name from project if current field is empty
    if (proj && !protocol.projectName.trim()) {
      patch.projectName = proj.name
    }
    onChange(patch)
  }

  const linkedProject = (projects ?? []).find(p => p.id === protocol.projectId)

  return (
    <div className="space-y-4">
      {/* Logo + project row */}
      <div className="flex items-start gap-4 flex-wrap">
        {/* Logo */}
        <div className="no-print">
          <LogoUpload logoDataUrl={logoDataUrl} onUpdate={onLogoUpdate} onClear={onLogoClear} />
        </div>
        {/* Logo in print */}
        {logoDataUrl && (
          <img src={logoDataUrl} alt="Logo" className="hidden print:block h-14 max-w-[180px] object-contain" />
        )}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Projektname</label>
            <input className="input font-semibold" placeholder="Projekt XY – Neubau Wohnanlage"
              value={protocol.projectName} onChange={set('projectName')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Besprechungsart</label>
            <select className="select" value={protocol.meetingType} onChange={set('meetingType')}>
              {MEETING_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Protocol number */}
      <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2">
        <span className="text-xs font-medium text-brand-600 flex-shrink-0">Protokoll-Nr.</span>
        <span className="font-mono font-semibold text-brand-800 text-sm tracking-wide">{protocolNo}</span>
        <span className="text-xs text-brand-400 ml-auto hidden sm:inline">automatisch aus Projektname + Datum</span>
      </div>

      {/* Date / location */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Datum</label>
          <input className="input" type="date" value={protocol.date} onChange={set('date')} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Ort / Raum</label>
          <input className="input" placeholder="Baubüro, Raum 2" value={protocol.location} onChange={set('location')} />
        </div>
      </div>

      {/* Author + next meeting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Erstellt von</label>
          <input className="input" placeholder="Max Mustermann" value={protocol.preparedBy} onChange={set('preparedBy')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nächste Besprechung</label>
          <input className="input" type="date" value={protocol.nextMeeting} onChange={set('nextMeeting')} />
        </div>
      </div>

      {/* Project database link */}
      {(projects ?? []).length > 0 && (
        <div className="pt-1 border-t border-gray-100 no-print">
          <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
            <FolderOpen size={12} /> Projekt-Datenbank
            {linkedProject && (
              <span className="ml-2 badge-blue">{linkedProject.contacts?.length ?? 0} Kontakte verfügbar</span>
            )}
          </label>
          <select className="select max-w-md" value={protocol.projectId ?? ''} onChange={handleProjectChange}>
            <option value="">– Kein Projekt zugeordnet –</option>
            {(projects ?? []).map(p => (
              <option key={p.id} value={p.id}>
                {p.name || 'Unbenanntes Projekt'} ({p.contacts?.length ?? 0} Kontakte)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Predecessor */}
      <div className="pt-1 border-t border-gray-100 no-print">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Vorgänger-Protokoll{' '}
          <span className="text-gray-400 font-normal">(Protokollpunkte + offene Maßnahmen werden übernommen; Projektname wird auto-befüllt)</span>
        </label>
        <select className="select max-w-md" value={protocol.predecessorId ?? ''} onChange={handlePredecessorChange}>
          <option value="">– Kein Vorgänger –</option>
          {predecessorOptions.map(p => {
            const no = buildProtocolNo(p.projectName, p.date)
            return (
              <option key={p.id} value={p.id}>
                {no}{p.location ? ` – ${p.location}` : ''}
              </option>
            )
          })}
        </select>
      </div>
    </div>
  )
}
