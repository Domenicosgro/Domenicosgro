import React, { useState } from 'react'
import { ArrowLeft, Database, ChevronRight, Lock, Plus } from 'lucide-react'
import ProjektdatenView, { lphRange, PRE_LEISTUNGEN } from './ProjektdatenView'

// Kurzbezeichnungen der beauftragten Vorleistungen, z. B. "MS · VS"
const preAbbrev = (pre) => PRE_LEISTUNGEN
  .filter(p => pre?.[p.key]?.beauftragt)
  .map(p => p.label.split(/[\s/]+/).map(w => w[0]).join('').toUpperCase())
  .join(' · ')
import NewProjectModal from './NewProjectModal'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

/**
 * Zentrale Projektdatenbank: Projekte werden hier angelegt und verwaltet
 * (Codierung, Gesellschaft, Vertrag, Leistungsphasen, Team, Generalplanung).
 * Bearbeitung nur durch System-/Projektadmins (canEdit je Projekt).
 */
export default function ProjektdatenbankView({ projects, allContacts, canEdit, serverUser, onCreate, onUpdateProject, onBack }) {
  const [selectedId, setSelectedId] = useState(null)
  const [showNew,    setShowNew]    = useState(false)
  const selected = projects.find(p => p.id === selectedId)

  // Neue Projekte dürfen System-Admins anlegen (bzw. lokal jeder)
  const canCreate = !isServer || serverUser?.role === 'admin'

  const createProject = ({ name, projectData }) => {
    const id = onCreate()
    // Neu angelegte Projekte sind zunächst NICHT auf dem Protokoll-Dashboard –
    // sie werden dort separat als Protokollgrundlage hinzugefügt.
    onUpdateProject(id, { name, projectData, onProtocolBoard: false })
    setShowNew(false)
    setSelectedId(id)   // direkt die Projektdaten öffnen
  }

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

  // Automatisch alle angelegten Projekte; archivierte fallen automatisch heraus
  // Numerisch nach Projektnummer sortieren (Projekte ohne Nummer ans Ende)
  const byNummer = (a, b) =>
    (parseInt(a.projectData?.nummer, 10) || Infinity) - (parseInt(b.projectData?.nummer, 10) || Infinity)
    || (a.name || '').localeCompare(b.name || '', 'de')
  const active = projects.filter(p => !p.isArchived).sort(byNummer)

  const Row = ({ project }) => {
    const d = project.projectData || {}
    const lph = lphRange(d.lph)
    const pre = preAbbrev(d.preLeistungen)
    const editable = canEdit(project)
    return (
      <button
        className="w-full grid grid-cols-[90px_70px_1fr_90px_150px_70px_110px_20px] gap-2 items-center px-4 py-2.5 text-left hover:bg-brand-50/60 transition-colors border-b border-gray-50"
        onClick={() => setSelectedId(project.id)}
      >
        <span className="font-mono text-sm text-gray-700">{d.nummer || '–'}</span>
        <span className="font-mono text-sm text-gray-700 uppercase">{d.kuerzel || '–'}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-900 truncate">
            {d.bezeichnung || project.name || 'Unbenannt'}
            {project.isArchived && <span className="badge-gray text-[10px] ml-2">Archiviert</span>}
          </span>
          {(project.team || []).some(m => m.role === 'Projektleitung') && (
            <span className="block text-[11px] text-gray-400 truncate">
              PL: {(project.team || []).filter(m => m.role === 'Projektleitung').map(m => m.name).join(', ')}
            </span>
          )}
        </span>
        <span className="text-xs">
          {d.gesellschaft
            ? <span className={`badge text-[10px] ${d.gesellschaft === 'GmbH' ? 'bg-brand-100 text-brand-700 border border-brand-300' : 'bg-violet-100 text-violet-700 border border-violet-300'}`}>{d.gesellschaft}</span>
            : <span className="text-gray-300">–</span>}
        </span>
        <span className="text-xs text-gray-500 truncate">{d.vertrag || '–'}</span>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {[pre, lph ? `LPH ${lph}` : ''].filter(Boolean).join(' · ') || '–'}
        </span>
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Start</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <Database size={22} className="text-brand-600" /> Projektdatenbank
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Projekte anlegen &amp; verwalten · {active.length} aktive{active.length === 1 ? 's' : ''} Projekt{active.length !== 1 ? 'e' : ''} · Bearbeitung durch Administratoren
            </p>
          </div>
        </div>
        {canCreate && onCreate && (
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Neues Projekt
          </button>
        )}
      </div>

      {showNew && <NewProjectModal onCreate={createProject} onClose={() => setShowNew(false)} />}

      <div className="card overflow-x-auto">
        <div className="min-w-[860px]">
          <Head />
          {active.map(p => <Row key={p.id} project={p} />)}
          {active.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Keine aktiven Projekte.</p>
          )}
        </div>
      </div>
    </div>
  )
}
