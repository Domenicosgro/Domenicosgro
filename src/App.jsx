import React, { useState, useEffect, useRef } from 'react'
import { useProtocols } from './hooks/useProtocols'
import { useProjects }  from './hooks/useProjects'
import { useLogo }      from './hooks/useLogo'
import ProtocolList    from './components/ProtocolList'
import ProtocolEditor  from './components/ProtocolEditor'
import ProjectManager  from './components/ProjectManager'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

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

  // view: 'protocols' | 'projects'
  const [view,     setView]     = useState('protocols')
  const [activeId, setActiveId] = useState(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  // ── Electron menu wiring ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return

    window.electronAPI.onMenuImport(async () => {
      const data = await window.electronAPI.importJSON()
      if (data) {
        const id = importProtocol(data)
        if (id) { setView('protocols'); setActiveId(id) }
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

  const handleCreate = () => {
    const id = createProtocol()
    setActiveId(id)
  }

  const activeProtocol = protocols.find(p => p.id === activeId)

  if (!loaded || !projectsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Lade Daten…</div>
      </div>
    )
  }

  // ── Project manager view ──────────────────────────────────────────────────
  if (view === 'projects') {
    return (
      <ProjectManager
        projects={projects}
        onCreate={createProject}
        onUpdate={updateProject}
        onDelete={deleteProject}
        onBack={() => setView('protocols')}
      />
    )
  }

  // ── Protocol editor ───────────────────────────────────────────────────────
  if (activeId && activeProtocol) {
    // Find the project linked to this protocol
    const linkedProject = projects.find(p => p.id === activeProtocol.projectId) ?? null
    const projectContacts = linkedProject?.contacts ?? []

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
        onBack={() => setActiveId(null)}
      />
    )
  }

  // ── Protocol list ─────────────────────────────────────────────────────────
  return (
    <ProtocolList
      protocols={protocols}
      onCreate={handleCreate}
      onOpen={setActiveId}
      onDelete={deleteProtocol}
      onDuplicate={duplicateProtocol}
      onImport={importProtocol}
      onOpenImported={setActiveId}
      onOpenProjects={() => setView('projects')}
    />
  )
}
