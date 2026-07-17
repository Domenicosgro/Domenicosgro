import React from 'react'
import { MEETING_TYPES, PHASES, formatDate, buildProtocolNo, getChainNo } from '../utils'
import { FolderOpen, Star } from 'lucide-react'
import ContactAutocomplete from './ContactAutocomplete'

export default function MeetingHeader({ protocol, protocols, projects, logoDataUrl, clientLogoDataUrl, onChange }) {
  const set = (field) => (e) => onChange({ [field]: e.target.value })

  const chainNo    = getChainNo(protocol, protocols ?? [])
  const protocolNo = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)

  // Predecessor dropdown: only protocols from starred (favorited) projects
  const starredIds = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('bb_project_favorites') || '[]')) }
    catch { return new Set() }
  })()
  const allOther = (protocols ?? []).filter(p => p.id !== protocol.id)
  const predecessorOptions = allOther
    .filter(p =>
      (protocol.projectId && p.projectId === protocol.projectId) ||
      (p.projectId && starredIds.has(p.projectId))
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  const hasUnstarredOnly = predecessorOptions.length === 0 && allOther.length > 0

  const handlePredecessorChange = (e) => {
    const predId = e.target.value || null
    const pred   = predId ? (protocols ?? []).find(p => p.id === predId) : null
    const patch  = { predecessorId: predId }
    if (pred) {
      if (!protocol.projectName.trim())  patch.projectName = pred.projectName
      if (!protocol.meetingType?.trim()) patch.meetingType = pred.meetingType
      if (pred.preparedBy?.trim())       patch.preparedBy  = pred.preparedBy
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
        {/* Logos (Bildschirm + Druck) – Verwaltung erfolgt im Projekt-Dashboard */}
        {(logoDataUrl || clientLogoDataUrl) && (
          <div className="flex items-center gap-4">
            {logoDataUrl && (
              <img src={logoDataUrl} alt="Büro-Logo" className="h-14 max-w-[180px] object-contain" />
            )}
            {clientLogoDataUrl && (
              <img src={clientLogoDataUrl} alt="Auftraggeber-Logo" className="h-14 max-w-[180px] object-contain" />
            )}
          </div>
        )}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Projektname</label>
            <input className="input font-semibold" placeholder="Projekt XY – Neubau Wohnanlage"
              value={protocol.projectName} onChange={set('projectName')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Besprechungsart</label>
            <input
              className="input"
              list="meeting-types-list"
              placeholder="Besprechungsart wählen oder eingeben…"
              value={protocol.meetingType}
              onChange={set('meetingType')}
            />
            <datalist id="meeting-types-list">
              {MEETING_TYPES.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* Untertitel = Protokollbezeichnung (Ausdruck + E-Mail) */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Untertitel / Protokollbezeichnung
          <span className="text-gray-400 font-normal ml-1">
            (optional – erscheint im Ausdruck und im E-Mail-Versand)
          </span>
        </label>
        <input className="input" placeholder="z. B. Abstimmung Rohbau – Freigabe Fassade"
          value={protocol.subtitle || ''} onChange={set('subtitle')} />
      </div>

      {/* Protocol number */}
      <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 px-4 py-2">
        <span className="text-xs font-medium text-brand-600 flex-shrink-0">Protokoll-Nr.</span>
        <span className="font-mono font-semibold text-brand-800 text-sm tracking-wide">{protocolNo}</span>
        <span className="text-xs text-brand-400 ml-auto hidden sm:inline">automatisch aus Projektname + Datum</span>
      </div>

      {/* Date / time / location / phase */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Datum der Besprechung</label>
          <input className="input" type="date" value={protocol.date} onChange={set('date')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Uhrzeit</label>
          <input className="input" type="time" value={protocol.time || ''} onChange={set('time')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Phase</label>
          <select
            className="input text-sm"
            value={protocol.phase || ''}
            onChange={e => onChange({ phase: e.target.value || null })}
          >
            <option value="">– keine Phase –</option>
            {PHASES.map(ph => <option key={ph.value} value={ph.value}>{ph.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ort / Raum</label>
          <input className="input" placeholder="Baubüro, Raum 2" value={protocol.location} onChange={set('location')} />
        </div>
      </div>

      {/* Author + next meeting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Erstellt von</label>
          <ContactAutocomplete
            className="input"
            placeholder="Max Mustermann"
            value={protocol.preparedBy}
            contacts={linkedProject?.contacts ?? []}
            onChange={v => onChange({ preparedBy: v })}
          />
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
            const pChainNo = getChainNo(p, protocols ?? [])
            const no = buildProtocolNo(p.projectName, p.date, pChainNo, p.meetingType)
            return (
              <option key={p.id} value={p.id}>
                {no}{p.location ? ` – ${p.location}` : ''}
              </option>
            )
          })}
        </select>
        {hasUnstarredOnly ? (
          <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
            <Star size={11} fill="currentColor" />
            Kein Projekt zugeordnet und keine ★-markierten Projekte. Projekt oben zuordnen.
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
            <Star size={11} fill="currentColor" className="text-amber-400" />
            Protokolle aus gleichem Projekt und ★-markierten Projekten.
          </p>
        )}
      </div>
    </div>
  )
}
