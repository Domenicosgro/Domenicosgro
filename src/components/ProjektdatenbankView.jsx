import React, { useState } from 'react'
import { ArrowLeft, Database, ChevronRight, Lock } from 'lucide-react'
import ProjektdatenView, { LPH } from './ProjektdatenView'

/**
 * Zentrale Projektdatenbank: Übersicht aller Projekte mit Codierung,
 * Gesellschaft, Vertrag, Leistungsphasen und Generalplanung.
 * Bearbeitung nur durch System-/Projektadmins (canEdit je Projekt).
 */
export default function ProjektdatenbankView({ projects, allContacts, canEdit, onUpdateProject, onBack }) {
  const [selectedId, setSelectedId] = useState(null)
  const selected = projects.find(p => p.id === selectedId)

  if (selected) {
    return (
      <ProjektdatenView
        project={selected}
        allContacts={allContacts}
        onUpdateProject={onUpdateProject}
        onBack={() => setSelectedId(null)}
        backLabel="Projektdatenbank"
        readOnly={!canEdit(selected)}
      />
    )
  }

  const active   = projects.filter(p => !p.isArchived)
  const archived = projects.filter(p => !!p.isArchived)

  const Row = ({ project }) => {
    const d = project.projectData || {}
    const lphCount = d.lph ? Object.values(d.lph).filter(l => l.beauftragt).length : 0
    const editable = canEdit(project)
    return (
      <button
        className="w-full grid grid-cols-[90px_70px_1fr_90px_150px_70px_110px_20px] gap-2 items-center px-4 py-2.5 text-left hover:bg-brand-50/60 transition-colors border-b border-gray-50"
        onClick={() => setSelectedId(project.id)}
      >
        <span className="font-mono text-sm text-gray-700">{d.nummer || '–'}</span>
        <span className="font-mono text-sm text-gray-700 uppercase">{d.kuerzel || '–'}</span>
        <span className="text-sm font-medium text-gray-900 truncate">
          {d.bezeichnung || project.name || 'Unbenannt'}
          {project.isArchived && <span className="badge-gray text-[10px] ml-2">Archiviert</span>}
        </span>
        <span className="text-xs">
          {d.gesellschaft
            ? <span className={`badge text-[10px] ${d.gesellschaft === 'GmbH' ? 'bg-brand-100 text-brand-700 border border-brand-300' : 'bg-violet-100 text-violet-700 border border-violet-300'}`}>{d.gesellschaft}</span>
            : <span className="text-gray-300">–</span>}
        </span>
        <span className="text-xs text-gray-500 truncate">{d.vertrag || '–'}</span>
        <span className="text-xs text-gray-500">{lphCount > 0 ? `${lphCount} LPH` : '–'}</span>
        <span className="text-xs text-gray-500">
          {d.isGeneralplanung ? `GP · ${(d.planungspartner || []).length} Partner` : '–'}
        </span>
        {editable
          ? <ChevronRight size={14} className="text-gray-300" />
          : <Lock size={12} className="text-gray-300" title="Nur Lesezugriff" />}
      </button>
    )
  }

  const Head = () => (
    <div className="grid grid-cols-[90px_70px_1fr_90px_150px_70px_110px_20px] gap-2 px-4 py-2 bg-gray-50/80 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
      <span>Nummer</span><span>Kürzel</span><span>Bezeichnung</span><span>Gesellsch.</span>
      <span>Vertrag</span><span>LPH</span><span>Generalpl.</span><span />
    </div>
  )

  return (
    <div className="app-page">
      <div className="flex items-end gap-3">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Start</button>
        <div>
          <h1 className="text-2xl font-bold text-night flex items-center gap-2">
            <Database size={22} className="text-brand-600" /> Projektdatenbank
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Zentrale Projektstammdaten · {projects.length} Projekt{projects.length !== 1 ? 'e' : ''} · Bearbeitung durch Administratoren
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="min-w-[860px]">
          <Head />
          {active.map(p => <Row key={p.id} project={p} />)}
          {active.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Keine aktiven Projekte.</p>
          )}
          {archived.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                Archiv
              </div>
              {archived.map(p => <Row key={p.id} project={p} />)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
