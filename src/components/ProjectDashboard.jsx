import React, { useState } from 'react'
import { ArrowLeft, FileText, Users, HardHat, Pencil, NotebookPen, ChevronRight, Clock, CheckCircle2, BarChart2, UserCog, BookOpen, Image as ImageIcon } from 'lucide-react'
import ProjectAdminPanel from './ProjectAdminPanel'
import LogoUpload from './LogoUpload'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function DashboardTile({ icon, title, subtitle, accent, onClick, stat1, stat2 }) {
  return (
    <button
      onClick={onClick}
      className={`card w-full text-left flex flex-col aspect-video p-4 hover:border-brand-300 hover:bg-gray-50 transition-colors group ${accent ? 'border-l-4 ' + accent : ''}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-brand-600 group-hover:text-brand-700 transition-colors flex-shrink-0">{icon}</span>
        <h3 className="font-semibold text-sm text-gray-900 group-hover:text-brand-700 transition-colors truncate">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-gray-500 line-clamp-3">{subtitle}</p>}
      {(stat1 !== undefined || stat2 !== undefined) && (
        <div className="flex gap-4 mt-auto pt-2">
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
        </div>
      )}
    </button>
  )
}

export default function ProjectDashboard({
  project, protocols, notes, serverUser, globalLogoDataUrl,
  onUpdateProject, onBack, onOpenProtocols, onOpenNotes, onManageContacts, onOpenMassnahmen, onOpenNotizbuch, onSaved,
}) {
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showLogos,      setShowLogos]      = useState(false)

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

  const allActions  = protos.flatMap(p => p.actionItems ?? [])
  const openActions = allActions.filter(a => a.status === 'offen' || a.status === 'in_arbeit').length

  return (
    <div className="app-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-stretch justify-between gap-4">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Projekte
          </button>
          <div>
            <h1 className="text-2xl font-bold text-night">{(project.name || 'Unbenanntes Projekt')} · Dashboard</h1>
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

        {/* Aktennotizen */}
        <DashboardTile
          icon={<NotebookPen size={20} />}
          title="Akten- und Telefonnotizen"
          subtitle="Gesprächsnotizen, Aktenvermerke und Besprechungsnotizen"
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
          stat2={{ value: openActions,       label: 'offen' }}
        />

        {/* Notizbuch */}
        <DashboardTile
          icon={<BookOpen size={20} />}
          title="Notizbuch"
          subtitle="Interne Notizen, Themen und Aufgaben für das Projektteam"
          accent="border-teal-500"
          onClick={onOpenNotizbuch}
        />

        {/* Logos – Büro- und Auftraggeber-Logo für dieses Projekt */}
        {onUpdateProject && (
          <DashboardTile
            icon={<ImageIcon size={20} />}
            title="Logos"
            subtitle="Büro- und Auftraggeber-Logo für Protokolle, Notizen, Druck und Export"
            accent="border-sky-400"
            onClick={() => setShowLogos(true)}
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
        />
      )}

      {/* Logo-Verwaltung */}
      {showLogos && onUpdateProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-lg bg-white p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-night flex items-center gap-2">
                <ImageIcon size={18} className="text-brand-600" /> Projekt-Logos
              </h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setShowLogos(false)}>✕</button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Büro-Logo (eigenes Logo)</label>
                <LogoUpload
                  label="Büro-Logo"
                  logoDataUrl={project.logo || ''}
                  onUpdate={(dataUrl) => onUpdateProject(project.id, { logo: dataUrl })}
                  onClear={() => onUpdateProject(project.id, { logo: '' })}
                />
                {!project.logo && globalLogoDataUrl && (
                  <p className="text-xs text-gray-400 mt-2">
                    Aktuell wird das globale Standard-Logo verwendet. Lade hier ein projektspezifisches Logo hoch, um es zu überschreiben.
                  </p>
                )}
              </div>

              <div className="h-px bg-gray-100" />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Auftraggeber-Logo</label>
                <LogoUpload
                  label="Auftraggeber-Logo"
                  logoDataUrl={project.clientLogo || ''}
                  onUpdate={(dataUrl) => onUpdateProject(project.id, { clientLogo: dataUrl })}
                  onClear={() => onUpdateProject(project.id, { clientLogo: '' })}
                />
                <p className="text-xs text-gray-400 mt-2">
                  Erscheint zusätzlich neben dem Büro-Logo in Protokollen, Notizen, beim Drucken sowie im PDF- und Word-Export.
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button className="btn-primary" onClick={() => setShowLogos(false)}>Fertig</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
