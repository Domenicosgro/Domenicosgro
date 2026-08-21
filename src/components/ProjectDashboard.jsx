import React, { useState, useEffect } from 'react'
import { ArrowLeft, FileText, Users, HardHat, Pencil, NotebookPen, ChevronRight, BarChart2, UserCog, BookOpen, Box, AlertOctagon, HardDrive, Database, Calculator } from 'lucide-react'
import ProjectAdminPanel from './ProjectAdminPanel'
import { lphRange } from './ProjektdatenView'
import { liveActionItems } from '../utils'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

// Kompaktes Donut-Diagramm: erledigt (grün) vs. offen (amber) im Vergleich.
function DoneOpenDonut({ done, open }) {
  const total = done + open
  const size = 54, stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r
  const frac = total ? done / total : 0
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={total ? '#FCD34D' : '#E5E7EB'} strokeWidth={stroke} />
        {done > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16A34A" strokeWidth={stroke}
            strokeDasharray={`${c * frac} ${c}`} strokeLinecap={frac < 1 ? 'round' : 'butt'} />
        )}
      </svg>
      <div className="text-[10px] leading-tight">
        <div className="text-sm font-bold text-night leading-none">{total ? Math.round(frac * 100) : 0}%</div>
        <div className="flex items-center gap-1 text-green-700 mt-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block flex-shrink-0" /> {done} erledigt</div>
        <div className="flex items-center gap-1 text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-300 inline-block flex-shrink-0" /> {open} offen</div>
      </div>
    </div>
  )
}

function DashboardTile({ icon, title, subtitle, accent, onClick, stat1, stat2, chart }) {
  return (
    <button
      onClick={onClick}
      className={`card w-full text-left flex flex-col min-h-[120px] p-4 hover:border-brand-300 hover:bg-gray-50 transition-colors group ${accent ? 'border-l-4 ' + accent : ''}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-brand-600 group-hover:text-brand-700 transition-colors flex-shrink-0">{icon}</span>
        <h3 className="font-semibold text-sm text-gray-900 group-hover:text-brand-700 transition-colors truncate">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-gray-500 line-clamp-3">{subtitle}</p>}
      {(stat1 !== undefined || stat2 !== undefined || chart) && (
        <div className="flex items-end gap-4 mt-auto pt-2">
          {stat1 !== undefined && (
            <div>
              <div className="text-lg font-bold text-night leading-none">{stat1.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{stat1.label}</div>
            </div>
          )}
          {stat2 !== undefined && (
            <div>
              <div className="text-lg font-bold text-night leading-none">{stat2.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{stat2.label}</div>
            </div>
          )}
          {chart && <div className="ml-auto">{chart}</div>}
        </div>
      )}
    </button>
  )
}

export default function ProjectDashboard({
  project, protocols, notes, serverUser, globalLogoDataUrl,
  onUpdateProject, onBack, onOpenProtocols, onOpenNotes, onManageContacts, onOpenMassnahmen, onOpenBim,
  onOpenBautagebuch, onOpenMaengel, onOpenDateiablage, onOpenProjektdaten, onOpenKosten, onSaved,
}) {
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [bimIssues,      setBimIssues]      = useState([])

  useEffect(() => {
    if (!project.bimMeta) return
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`/api/projects/${project.id}/bim-issues`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(setBimIssues)
      .catch(() => {})
  }, [project.id, project.bimMeta])

  // Darf der aktuelle Nutzer dieses Projekt administrieren? (Systemadmin oder Projektadmin)
  const canAdmin = isServer && serverUser && (
    serverUser.role === 'admin' ||
    project.projectAdminUser === serverUser.username ||
    project.projectAdmins?.includes(serverUser.username)
  )

  const protos        = protocols.filter(p => p.projectId === project.id)
  const planungProtos = protos.filter(p => p.phase === 'planung')
  const bauProtos     = protos.filter(p => p.phase === 'bau')
  const unassigned    = protos.filter(p => !p.phase)
  const openPlanung   = planungProtos.filter(p => !p.isClosed).length
  const openBau       = bauProtos.filter(p => !p.isClosed).length
  const projectNotes  = (notes ?? []).filter(n => n.projectId === project.id)
  const contacts      = project.contacts ?? []

  // Zählweise identisch zu Maßnahmenbereich, Protokoll und Projektkachel
  const allActions   = liveActionItems(protos, protocols)
  const openActions  = allActions.filter(a => a.status === 'offen' || a.status === 'in_arbeit').length
  const doneActions  = allActions.filter(a => a.status === 'erledigt').length
  const openBimIssues = bimIssues.filter(i => i.status === 'offen' || i.status === 'in_arbeit').length

  return (
    <div className="app-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-stretch justify-between gap-4">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Projekte
          </button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2 flex-wrap">
              {(project.name || 'Unbenanntes Projekt')} · Dashboard
              {project.isArchived && (
                <span className="badge-gray text-xs font-medium align-middle">Archiviert</span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
              {projectNotes.length > 0 && ` · ${projectNotes.length} Notiz${projectNotes.length !== 1 ? 'en' : ''}`}
              {contacts.length > 0 && ` · ${contacts.length} Kontakt${contacts.length !== 1 ? 'e' : ''}`}
            </p>
          </div>
        </div>
      </div>

      {/* 5 Kacheln – Format 16:9 (2 Spalten auf sm, 3 auf lg, 5 auf xl) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">

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

        {/* Notizen & Notizbuch */}
        <DashboardTile
          icon={<NotebookPen size={20} />}
          title="Notizen & Notizbuch"
          subtitle="Akten-/Telefonnotizen, Besprechungsnotizen und internes Projekt-Notizbuch"
          accent="border-purple-400"
          onClick={onOpenNotes}
          stat1={{ value: projectNotes.length, label: 'Notizen' }}
        />

        {/* Maßnahmen */}
        <DashboardTile
          icon={<BarChart2 size={20} />}
          title="Maßnahmen"
          subtitle="Aufgaben und Maßnahmen aus den Projektprotokollen"
          accent="border-amber-400"
          onClick={onOpenMassnahmen}
          stat1={{ value: allActions.length, label: 'Maßnahmen' }}
          chart={<DoneOpenDonut done={doneActions} open={allActions.length - doneActions} />}
        />


        {/* BIM-Modell */}
        <DashboardTile
          icon={<Box size={20} />}
          title="BIM-Modell"
          subtitle={project.bimMeta
            ? `${project.bimMeta.filename} · ${project.bimMeta.uploadedBy}`
            : 'IFC-Modell hochladen und im Browser betrachten'}
          accent="border-cyan-500"
          onClick={onOpenBim}
          stat1={project.bimMeta ? { value: openBimIssues, label: 'Issues offen' } : undefined}
          stat2={project.bimMeta && bimIssues.length > 0 ? { value: bimIssues.length, label: 'Issues gesamt' } : undefined}
        />

        {/* Projektdatenbank */}
        {onOpenProjektdaten && (
          <DashboardTile
            icon={<Database size={20} />}
            title="Projektdaten"
            subtitle={project.projectData?.vertrag
              ? `${project.projectData.vertrag}${project.projectData.isGeneralplanung ? ' · Generalplanung' : ''}`
              : 'Codierung, Leistungsphasen, Vertragsverhältnis, Generalplanung'}
            accent="border-brand-500"
            onClick={onOpenProjektdaten}
            stat1={lphRange(project.projectData?.lph)
              ? { value: lphRange(project.projectData?.lph), label: 'LPH beauftragt' }
              : undefined}
            stat2={project.projectData?.isGeneralplanung
              ? { value: (project.projectData.planungspartner || []).length, label: 'Planungspartner' }
              : undefined}
          />
        )}

        {/* Bautagebuch */}
        {onOpenBautagebuch && (
          <DashboardTile
            icon={<BookOpen size={20} />}
            title="Bautagebuch"
            subtitle="Tägliche Baustellendokumentation: Wetter, Personal, Leistungen, Fotos"
            accent="border-orange-400"
            onClick={onOpenBautagebuch}
          />
        )}

        {/* Mängelmanagement */}
        {onOpenMaengel && (
          <DashboardTile
            icon={<AlertOctagon size={20} />}
            title="Mängel"
            subtitle="Mängel mit Foto erfassen, verfolgen und als Mängelanzeige versenden"
            accent="border-red-400"
            onClick={onOpenMaengel}
          />
        )}

        {/* Dateiablage (Synology) – nur Server-Modus */}
        {onOpenDateiablage && (
          <DashboardTile
            icon={<HardDrive size={20} />}
            title="Dateiablage"
            subtitle={project.fsPath
              ? `NAS-Projektordner: ${project.fsPath}`
              : 'NAS-Projektordner durchsuchen und Dateien herunterladen'}
            accent="border-gray-400"
            onClick={onOpenDateiablage}
          />
        )}

        {/* Kostenermittlung */}
        {onOpenKosten && (
          <DashboardTile
            icon={<Calculator size={20} />}
            title="Kostenermittlung"
            subtitle="Kostenschätzung und -berechnung nach DIN 276 mit BKI-Kennwerten und Variantenvergleich"
            accent="border-indigo-400"
            onClick={onOpenKosten}
          />
        )}

        {/* Administration – nur für Projektadmins und Systemadmins */}
        {canAdmin && (
          <DashboardTile
            icon={<UserCog size={20} />}
            title="Administration"
            subtitle="Projektzugang, Administratoren und Freimelde-Links verwalten"
            accent="border-brand-600"
            onClick={() => setShowAdminPanel(true)}
          />
        )}
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

      {/* Projekt-Admin-Panel */}
      {showAdminPanel && (
        <ProjectAdminPanel
          project={project}
          serverUser={serverUser}
          onClose={() => setShowAdminPanel(false)}
          onSaved={onSaved}
          globalLogoDataUrl={globalLogoDataUrl}
          onUpdateProject={onUpdateProject}
        />
      )}

    </div>
  )
}
