import React, { useState, useEffect, useRef } from 'react'
import { useProtocols } from './hooks/useProtocols'
import { useProjects }  from './hooks/useProjects'
import { useLogo }      from './hooks/useLogo'
import ProjectsHome    from './components/ProjectsHome'
import ProjectManager  from './components/ProjectManager'
import ProtocolList    from './components/ProtocolList'
import ProtocolEditor  from './components/ProtocolEditor'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

// views:
//  'home'              → ProjectsHome (start)
//  'project-contacts'  → ProjectManager for one project
//  'protocols'         → ProtocolList for a project (or null = unassigned)
//  'editor'            → ProtocolEditor

export default function App() {
  const {
    protocols, loaded,
    saveError: protocolSaveError, clearSaveError: clearProtocolError,
    createProtocol, updateProtocol, deleteProtocol, duplicateProtocol, importProtocol, syncProjectName,
  } = useProtocols()

  const {
    projects, loaded: projectsLoaded,
    saveError: projectSaveError, clearSaveError: clearProjectError,
    createProject, updateProject, deleteProject,
  } = useProjects()

  const { logoDataUrl, updateLogo, clearLogo, saveError: logoSaveError, clearSaveError: clearLogoError } = useLogo()

  const activeSaveError = protocolSaveError || projectSaveError || logoSaveError
  const clearActiveSaveError = () => { clearProtocolError(); clearProjectError(); clearLogoError() }

  const [view,              setView]              = useState('home')
  const [selectedProjectId, setSelectedProjectId] = useState(null)   // null = unassigned
  const [activeId,          setActiveId]          = useState(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  // ── Auto-updater notifications ────────────────────────────────────────────
  const [updateAvailable,  setUpdateAvailable]  = useState(null)   // info object or null
  const [updateDownloaded, setUpdateDownloaded] = useState(null)   // info object or null

  useEffect(() => {
    if (!isElectron) return
    window.electronAPI.onUpdateAvailable(info  => setUpdateAvailable(info))
    window.electronAPI.onUpdateDownloaded(info => setUpdateDownloaded(info))
    return () => {
      window.electronAPI.removeAllListeners('update:available')
      window.electronAPI.removeAllListeners('update:downloaded')
    }
  }, [])

  // ── German spell check on all free-text inputs/textareas ────────────────
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach(el => {
        el.spellcheck = true
        el.lang = 'de'
      })
    }
    apply()
    const obs = new MutationObserver(apply)
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  // ── Electron menu wiring ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return

    window.electronAPI.onMenuImport(async () => {
      const data = await window.electronAPI.importJSON()
      if (data) {
        const id = importProtocol(data)
        if (id) { setView('editor'); setActiveId(id) }
      }
    })

    window.electronAPI.onMenuExportJSON(async () => {
      const id = activeIdRef.current
      if (!id) return
      const p = protocols.find(x => x.id === id)
      if (p) await window.electronAPI.exportJSON(p)
    })

    window.electronAPI.onMenuPrint(() => window.dispatchEvent(new CustomEvent('app:print')))

    window.electronAPI.onMenuSendAgenda(() => {
      window.dispatchEvent(new CustomEvent('app:send-agenda'))
    })

    return () => {
      ;['menu:import', 'menu:export-json', 'menu:print', 'menu:send-agenda'].forEach(
        ch => window.electronAPI.removeAllListeners(ch)
      )
    }
  }, [protocols, importProtocol])

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Wraps updateProject: when the name changes, sync it to all linked protocols.
  const handleUpdateProject = (projectId, patch) => {
    updateProject(projectId, patch)
    if ('name' in patch) syncProjectName(projectId, patch.name)
  }

  const openProject = (projectId) => {
    setSelectedProjectId(projectId)
    setView('protocols')
  }

  const handleCreateProtocol = () => {
    const project = projects.find(p => p.id === selectedProjectId)
    const id = createProtocol({
      projectId:   selectedProjectId ?? null,
      projectName: project?.name ?? '',
    })
    setActiveId(id)
    setView('editor')
  }

  const handleOpenProtocol = (id) => {
    setActiveId(id)
    setView('editor')
  }

  const handleBackFromEditor = () => {
    setActiveId(null)
    setView('protocols')
  }

  const handleBackFromProtocols = () => {
    setSelectedProjectId(null)
    setView('home')
  }

  // ── Update banner (Electron only) ────────────────────────────────────────
  const UpdateBanner = () => {
    if (!isElectron) return null
    if (updateDownloaded) {
      return (
        <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-green-700 text-white px-5 py-3 text-sm shadow-lg no-print">
          <span>
            <strong>Update {updateDownloaded.version} heruntergeladen.</strong>{' '}
            Jetzt neu starten, um das Update zu installieren.
          </span>
          <button
            className="shrink-0 px-4 py-1.5 rounded bg-white text-green-800 font-semibold hover:bg-green-100 transition"
            onClick={() => window.electronAPI.installUpdate()}
          >
            Jetzt neu starten
          </button>
        </div>
      )
    }
    if (updateAvailable) {
      return (
        <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-brand-700 text-white px-5 py-3 text-sm shadow-lg no-print">
          <span>
            <strong>Update {updateAvailable.version} verfügbar.</strong>{' '}
            Wird im Hintergrund heruntergeladen…
          </span>
          <button
            className="shrink-0 text-white/70 hover:text-white text-lg leading-none"
            onClick={() => setUpdateAvailable(null)}
            title="Schließen"
          >
            ×
          </button>
        </div>
      )
    }
    return null
  }

  // ── Speicherfehler-Banner ─────────────────────────────────────────────────
  const SaveErrorBanner = () => {
    if (!activeSaveError) return null
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-red-700 text-white px-5 py-3 text-sm no-print">
        <span>
          <strong>Speichern fehlgeschlagen.</strong>{' '}{activeSaveError}
        </span>
        <button
          className="shrink-0 text-white/70 hover:text-white text-lg leading-none"
          onClick={clearActiveSaveError}
          title="Schließen"
        >
          ×
        </button>
      </div>
    )
  }

  // ── Logo watermark helper ─────────────────────────────────────────────────
  const wrap = (children) => (
    <>{children}</>
  )

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!loaded || !projectsLoaded) {
    return wrap(
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Lade Daten…</div>
      </div>
    )
  }

  // ── Protocol editor ───────────────────────────────────────────────────────
  if (view === 'editor') {
    const activeProtocol    = protocols.find(p => p.id === activeId)
    const linkedProject     = projects.find(p => p.id === activeProtocol?.projectId) ?? null
    const projectContacts   = linkedProject?.contacts ?? []

    if (!activeProtocol) { setView('protocols'); return null }

    return wrap(
      <>
        <ProtocolEditor
          protocol={activeProtocol}
          protocols={protocols}
          projects={projects}
          projectContacts={projectContacts}
          logoDataUrl={logoDataUrl}
          onLogoUpdate={updateLogo}
          onLogoClear={clearLogo}
          onUpdate={updateProtocol}
          onBack={handleBackFromEditor}
        />
        <UpdateBanner />
        <SaveErrorBanner />
      </>
    )
  }

  // ── Protocol list for a project ───────────────────────────────────────────
  if (view === 'protocols') {
    const project  = projects.find(p => p.id === selectedProjectId) ?? null
    const filtered = protocols.filter(p =>
      selectedProjectId ? p.projectId === selectedProjectId : !p.projectId
    )

    return wrap(
      <>
        <ProtocolList
          protocols={filtered}
          allProtocols={protocols}
          project={project}
          onCreate={handleCreateProtocol}
          onOpen={handleOpenProtocol}
          onDelete={deleteProtocol}
          onDuplicate={duplicateProtocol}
          onImport={importProtocol}
          onOpenImported={(id) => { setActiveId(id); setView('editor') }}
          onBack={handleBackFromProtocols}
          onManageContacts={() => setView('project-contacts')}
        />
        <UpdateBanner />
        <SaveErrorBanner />
      </>
    )
  }

  // ── Project contacts manager ──────────────────────────────────────────────
  if (view === 'project-contacts') {
    const project = projects.find(p => p.id === selectedProjectId)
    return wrap(
      <>
        <ProjectManager
          projects={project ? [project] : []}
          onCreate={createProject}
          onUpdate={handleUpdateProject}
          onDelete={deleteProject}
          onBack={() => setView('protocols')}
          logoDataUrl={logoDataUrl}
        />
        <UpdateBanner />
        <SaveErrorBanner />
      </>
    )
  }

  // ── Start: projects home ──────────────────────────────────────────────────
  return wrap(
    <>
      <ProjectsHome
        projects={projects}
        protocols={protocols}
        onCreate={createProject}
        onUpdate={handleUpdateProject}
        onDelete={deleteProject}
        onOpenProject={openProject}
      />
      <UpdateBanner />
      <SaveErrorBanner />
    </>
  )
}
