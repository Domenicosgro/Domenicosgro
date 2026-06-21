import React from 'react'
import { ArrowLeft, FileText, Users, HardHat, Pencil, NotebookPen, ChevronRight, Clock, CheckCircle2 } from 'lucide-react'

function DashboardTile({ icon, title, subtitle, accent, onClick, stat1, stat2 }) {
  return (
    <button
      onClick={onClick}
      className={`card w-full text-left flex items-stretch gap-0 hover:shadow-sm hover:border-brand-300 transition-all group ${accent ? 'border-l-4 ' + accent : ''}`}
    >
      <div className="flex-1 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-brand-600 group-hover:text-brand-700 transition-colors">{icon}</span>
          <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{title}</h3>
        </div>
        {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
        {(stat1 !== undefined || stat2 !== undefined) && (
          <div className="flex gap-4 mt-auto">
            {stat1 !== undefined && (
              <div>
                <div className="text-xl font-bold text-night">{stat1.value}</div>
                <div className="text-xs text-gray-400">{stat1.label}</div>
              </div>
            )}
            {stat2 !== undefined && (
              <div>
                <div className="text-xl font-bold text-night">{stat2.value}</div>
                <div className="text-xs text-gray-400">{stat2.label}</div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center px-3 text-gray-300 group-hover:text-brand-400 transition-colors">
        <ChevronRight size={18} />
      </div>
    </button>
  )
}

export default function ProjectDashboard({
  project, protocols, notes,
  onBack, onOpenProtocols, onOpenNotes, onManageContacts,
}) {
  const protos      = protocols.filter(p => p.projectId === project.id)
  const planungProtos = protos.filter(p => p.phase === 'planung')
  const bauProtos     = protos.filter(p => p.phase === 'bau')
  const unassigned    = protos.filter(p => !p.phase)
  const openPlanung   = planungProtos.filter(p => !p.isClosed).length
  const openBau       = bauProtos.filter(p => !p.isClosed).length
  const projectNotes  = (notes ?? []).filter(n => n.projectId === project.id)
  const contacts      = project.contacts ?? []

  return (
    <div className="app-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-stretch justify-between gap-4">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Projekte
          </button>
          <div>
            <h1 className="text-2xl font-bold text-night">{project.name || 'Unbenanntes Projekt'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
              {projectNotes.length > 0 && ` · ${projectNotes.length} Notiz${projectNotes.length !== 1 ? 'en' : ''}`}
              {contacts.length > 0 && ` · ${contacts.length} Kontakt${contacts.length !== 1 ? 'e' : ''}`}
            </p>
          </div>
        </div>
      </div>

      {/* 4 Kacheln (2 Spalten auf sm, 4 Spalten auf xl) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Planungsphase */}
        <DashboardTile
          icon={<Pencil size={20} />}
          title="Planungsphase"
          subtitle="Protokolle aus der Planungsphase (Vor- und Entwurfsplanung, Genehmigung)"
          accent="border-brand-500"
          onClick={() => onOpenProtocols('planung')}
          stat1={{ value: planungProtos.length, label: 'Protokolle' }}
          stat2={{ value: openPlanung,          label: 'offen' }}
        />

        {/* Bauphase */}
        <DashboardTile
          icon={<HardHat size={20} />}
          title="Bauphase"
          subtitle="Protokolle aus der Bauausführungsphase (Bauleitung, Abnahme)"
          accent="border-amber-400"
          onClick={() => onOpenProtocols('bau')}
          stat1={{ value: bauProtos.length, label: 'Protokolle' }}
          stat2={{ value: openBau,          label: 'offen' }}
        />

        {/* Projektkontakte */}
        <DashboardTile
          icon={<Users size={20} />}
          title="Projektkontakte"
          subtitle="Beteiligte, Gewerke und Ansprechpartner für dieses Projekt"
          accent="border-green-400"
          onClick={onManageContacts}
          stat1={{ value: contacts.length, label: 'Kontakte' }}
        />

        {/* Aktennotizen */}
        <DashboardTile
          icon={<NotebookPen size={20} />}
          title="Akten- und Telefonnotizen"
          subtitle="Gesprächsnotizen, Aktenvermerke und Besprechungsnotizen"
          accent="border-purple-400"
          onClick={onOpenNotes}
          stat1={{ value: projectNotes.length, label: 'Notizen' }}
        />
      </div>

      {/* Alle Protokolle (phasenübergreifend) */}
      {unassigned.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <FileText size={15} className="text-gray-400" />
                {unassigned.length} Protokoll{unassigned.length !== 1 ? 'e' : ''} ohne Phasenzuordnung
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Diese Protokolle wurden noch keiner Phase zugeordnet.
              </p>
            </div>
            <button className="btn-secondary text-sm" onClick={() => onOpenProtocols(null)}>
              Alle anzeigen <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
