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
    createProtocol, updateProtocol, deleteProtocol, duplicateProtocol, importProtocol,
  } = useProtocols()

  const {
    projects, loaded: projectsLoaded,
    createProject, updateProject, deleteProject,
  } = useProjects()

  const { logoDataUrl, updateLogo, clearLogo } = useLogo()

  const [view,              setView]              = useState('home')
  const [selectedProjectId, setSelectedProjectId] = useState(null)   // null = unassigned
  const [activeId,          setActiveId]          = useState(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

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

    window.electronAPI.onMenuPrint(() => window.print())

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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!loaded || !projectsLoaded) {
    return (
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

    return (
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
    )
  }

  // ── Protocol list for a project ───────────────────────────────────────────
  if (view === 'protocols') {
    const project  = projects.find(p => p.id === selectedProjectId) ?? null
    const filtered = protocols.filter(p =>
      selectedProjectId ? p.projectId === selectedProjectId : !p.projectId
    )

    return (
      <ProtocolList
        protocols={filtered}
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
    )
  }

  // ── Project contacts manager ──────────────────────────────────────────────
  if (view === 'project-contacts') {
    const project = projects.find(p => p.id === selectedProjectId)
    // Wrap ProjectManager to show only this one project
    return (
      <ProjectManager
        projects={project ? [project] : []}
        onCreate={createProject}
        onUpdate={updateProject}
        onDelete={deleteProject}
        onBack={() => setView('protocols')}
      />
    )
  }

  // ── Start: projects home ──────────────────────────────────────────────────
  return (
    <ProjectsHome
      projects={projects}
      protocols={protocols}
      onCreate={createProject}
      onUpdate={updateProject}
      onDelete={deleteProject}
      onOpenProject={openProject}
    />
  )
}
