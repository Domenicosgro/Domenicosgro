import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useProtocols } from './hooks/useProtocols'
import { useProjects }  from './hooks/useProjects'
import { useLogo }      from './hooks/useLogo'
import ProjectsHome          from './components/ProjectsHome'
import ProjectManager        from './components/ProjectManager'
import ProtocolList          from './components/ProtocolList'
import ProtocolEditor        from './components/ProtocolEditor'
import MassnahmenDashboard   from './components/MassnahmenDashboard'
import ProjectDashboard      from './components/ProjectDashboard'
import LoginScreen           from './components/LoginScreen'
import AdminPanel            from './components/AdminPanel'
import { hashPassword, uid } from './utils'
import { deriveKey, encryptJSON, decryptJSON, newSalt } from './crypto'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI
const isServer   = typeof window !== 'undefined' && !!window.__SERVER_MODE__

export default function App() {
  const {
    protocols, loaded,
    saveError: protocolSaveError, clearSaveError: clearProtocolError,
    createProtocol, updateProtocol, deleteProtocol, duplicateProtocol, importProtocol, syncProjectName,
    refetchProtocols,
  } = useProtocols()

  const {
    projects, loaded: projectsLoaded,
    saveError: projectSaveError, clearSaveError: clearProjectError,
    createProject, updateProject, deleteProject, importProject,
    refetchProjects,
  } = useProjects()

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchProtocols(), refetchProjects()])
  }, [refetchProtocols, refetchProjects])

  const { logoDataUrl, updateLogo, clearLogo, saveError: logoSaveError, clearSaveError: clearLogoError } = useLogo()

  const activeSaveError    = protocolSaveError || projectSaveError || logoSaveError
  const clearActiveSaveError = () => { clearProtocolError(); clearProjectError(); clearLogoError() }

  const [view,              setView]              = useState('home')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [contactsOrigin,    setContactsOrigin]    = useState('protocols')
  const [activeId,          setActiveId]          = useState(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  // ── Crypto state ──────────────────────────────────────────────────────────
  const [projectCryptoKeys, setProjectCryptoKeys] = useState({})
  const [decryptedContacts, setDecryptedContacts] = useState({})

  const projectsWithContacts = useMemo(() =>
    projects.map(p => ({
      ...p,
      contacts:   decryptedContacts[p.id] ?? p.contacts,
      isUnlocked: (!p.isEncrypted && !p.passwordHash) || !!projectCryptoKeys[p.id],
    })),
  [projects, decryptedContacts, projectCryptoKeys])

  // ── Server auth state ─────────────────────────────────────────────────────
  // serverAuthChecked starts as true in local/Electron mode (no auth needed).
  const [serverUser,        setServerUser]        = useState(null)
  const [serverAuthChecked, setServerAuthChecked] = useState(!isServer)
  const [showAdmin,         setShowAdmin]         = useState(false)

  useEffect(() => {
    if (!isServer) return
    const token = localStorage.getItem('kp_session_token')
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        if (r.status === 401) {
          localStorage.removeItem('kp_session_token')
          setServerUser(null)
          setServerAuthChecked(true)
          return null
        }
        return r.json()
      })
      .then(user => { if (user) { setServerUser(user); setServerAuthChecked(true) } })
      .catch(() => { setServerUser(null); setServerAuthChecked(true) })
  }, [])

  const handleLogin = (user) => {
    setServerUser(user)
    // Beim App-Start (ohne Token) liefen die Daten-Hooks ins 401 und blieben leer.
    // Jetzt liegt der Token vor → Projekte/Protokolle frisch nachladen.
    handleRefresh()
  }

  const handleLogout = async () => {
    const token = localStorage.getItem('kp_session_token')
    try {
      if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch {}
    localStorage.removeItem('kp_session_token')
    setServerUser(null)
    setShowAdmin(false)
  }

  // ── Web update check (Server-Modus): version.json pollen ──────────────────
  // __BUILD_ID__ wird beim Build ins Bundle eingebacken. version.json trägt
  // dieselbe ID. Weicht die per fetch geladene ID ab, läuft eine neuere Version
  // auf dem Server → Banner einblenden.
  const [webUpdateReady, setWebUpdateReady] = useState(false)

  useEffect(() => {
    if (!isServer) return
    const currentBuild = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null
    if (!currentBuild) return
    let stopped = false
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (buildId && buildId !== currentBuild && !stopped) setWebUpdateReady(true)
      } catch {}
    }
    check()
    const iv = setInterval(check, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopped = true; clearInterval(iv); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  // ── Auto-updater notifications ────────────────────────────────────────────
  const [updateAvailable,  setUpdateAvailable]  = useState(null)
  const [updateDownloaded, setUpdateDownloaded] = useState(null)

  useEffect(() => {
    if (!isElectron) return
    window.electronAPI.onUpdateAvailable(info  => setUpdateAvailable(info))
    window.electronAPI.onUpdateDownloaded(info => setUpdateDownloaded(info))
    return () => {
      window.electronAPI.removeAllListeners('update:available')
      window.electronAPI.removeAllListeners('update:downloaded')
    }
  }, [])

  // ── German spell check ────────────────────────────────────────────────────
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

  // ── Electron menu wiring ──────────────────────────────────────────────────
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
    window.electronAPI.onMenuSendAgenda(() => window.dispatchEvent(new CustomEvent('app:send-agenda')))

    return () => {
      ;['menu:import', 'menu:export-json', 'menu:print', 'menu:send-agenda'].forEach(
        ch => window.electronAPI.removeAllListeners(ch)
      )
    }
  }, [protocols, importProtocol])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleUpdateProject = async (projectId, patch) => {
    let finalPatch = { ...patch }
    if ('contacts' in patch) {
      const project = projects.find(p => p.id === projectId)
      const key     = projectCryptoKeys[projectId]
      if (project?.isEncrypted && key) {
        const { iv, ciphertext } = await encryptJSON(key, patch.contacts)
        setDecryptedContacts(prev => ({ ...prev, [projectId]: patch.contacts }))
        finalPatch = { ...finalPatch, contacts: [], encryptedContacts: ciphertext, cryptoIv: iv }
      }
    }
    updateProject(projectId, finalPatch)
    if ('name' in patch) syncProjectName(projectId, patch.name)
  }

  const handleUnlockProject = async (projectId, password) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) throw new Error('Projekt nicht gefunden.')
    if (project.passwordHash && !project.isEncrypted) {
      const hash = await hashPassword(password)
      if (hash !== project.passwordHash) throw new Error('Falsches Passwort.')
      const salt = newSalt()
      const key  = await deriveKey(password, salt)
      const { iv, ciphertext } = await encryptJSON(key, project.contacts)
      updateProject(projectId, { isEncrypted: true, encryptedContacts: ciphertext, cryptoSalt: salt, cryptoIv: iv, contacts: [], passwordHash: null })
      setProjectCryptoKeys(prev => ({ ...prev, [projectId]: key }))
      setDecryptedContacts(prev => ({ ...prev, [projectId]: project.contacts }))
      return
    }
    const key = await deriveKey(password, project.cryptoSalt)
    let contacts
    try { contacts = await decryptJSON(key, project.cryptoIv, project.encryptedContacts) }
    catch { throw new Error('Falsches Passwort – Entschlüsselung fehlgeschlagen.') }
    setProjectCryptoKeys(prev => ({ ...prev, [projectId]: key }))
    setDecryptedContacts(prev => ({ ...prev, [projectId]: contacts }))
  }

  const handleSetProjectPassword = async (projectId, password) => {
    const project  = projects.find(p => p.id === projectId)
    if (!project) throw new Error('Projekt nicht gefunden.')
    const contacts = decryptedContacts[projectId] ?? project.contacts
    const salt     = newSalt()
    const key      = await deriveKey(password, salt)
    const { iv, ciphertext } = await encryptJSON(key, contacts)
    updateProject(projectId, { isEncrypted: true, encryptedContacts: ciphertext, cryptoSalt: salt, cryptoIv: iv, contacts: [], passwordHash: null })
    setProjectCryptoKeys(prev => ({ ...prev, [projectId]: key }))
    setDecryptedContacts(prev => ({ ...prev, [projectId]: contacts }))
  }

  const handleRemoveProjectPassword = async (projectId, password) => {
    const project = projects.find(p => p.id === projectId)
    if (!project) throw new Error('Projekt nicht gefunden.')
    let contacts
    if (project.passwordHash && !project.isEncrypted) {
      const hash = await hashPassword(password)
      if (hash !== project.passwordHash) throw new Error('Falsches Passwort.')
      contacts = project.contacts
    } else {
      const key = await deriveKey(password, project.cryptoSalt)
      try { contacts = await decryptJSON(key, project.cryptoIv, project.encryptedContacts) }
      catch { throw new Error('Falsches Passwort – Entschlüsselung fehlgeschlagen.') }
    }
    updateProject(projectId, { isEncrypted: false, encryptedContacts: null, cryptoSalt: null, cryptoIv: null, contacts, passwordHash: null })
    setProjectCryptoKeys(prev => { const n = { ...prev }; delete n[projectId]; return n })
    setDecryptedContacts(prev => { const n = { ...prev }; delete n[projectId]; return n })
  }

  const handleImportProject = (data) => {
    if (!data || data.exportType !== 'project' || !data.project) return
    const newProjectId = uid()
    const idMap = new Map()
    const archiveProtocols = Array.isArray(data.protocols) ? data.protocols : []
    archiveProtocols.forEach(p => idMap.set(p.id, uid()))
    const { isUnlocked, ...rawProject } = data.project
    importProject({
      ...rawProject,
      id:               newProjectId,
      isEncrypted:      false,
      encryptedContacts: null,
      cryptoSalt:       null,
      cryptoIv:         null,
      passwordHash:     null,
      createdAt:        new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
    })
    archiveProtocols.forEach(p => {
      createProtocol({
        ...p,
        id:           idMap.get(p.id),
        projectId:    newProjectId,
        predecessorId: p.predecessorId ? (idMap.get(p.predecessorId) ?? null) : null,
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
      })
    })
    setSelectedProjectId(newProjectId)
    setView('protocols')
  }

  const openProject = (projectId) => { setSelectedProjectId(projectId); setView('protocols') }
  const openProjectDashboard = (projectId) => { setSelectedProjectId(projectId); setView('project-dashboard') }

  const handleCreateProtocol = () => {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    const id = createProtocol({ projectId: selectedProjectId ?? null, projectName: project?.name ?? '' })
    setActiveId(id)
    setView('editor')
  }

  const handleOpenProtocol       = (id) => { setActiveId(id); setView('editor') }
  const handleBackFromEditor     = ()   => { setActiveId(null); setView('protocols') }
  const handleBackFromProtocols  = ()   => { setSelectedProjectId(null); setView('home') }

  const openProtocolFromDashboard = (protocolId) => {
    const p = protocols.find(x => x.id === protocolId)
    if (p) setSelectedProjectId(p.projectId ?? null)
    setActiveId(protocolId)
    setView('editor')
  }

  // ── Banners ───────────────────────────────────────────────────────────────
  const UpdateBanner = () => {
    if (!isElectron) return null
    if (updateDownloaded) return (
      <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-green-700 text-white px-5 py-3 text-sm no-print">
        <span><strong>Update {updateDownloaded.version} heruntergeladen.</strong> Jetzt neu starten, um das Update zu installieren.</span>
        <button className="shrink-0 px-4 py-1.5 bg-white text-green-800 font-semibold hover:bg-green-100"
          onClick={() => window.electronAPI.installUpdate()}>Jetzt neu starten</button>
      </div>
    )
    if (updateAvailable) return (
      <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-brand-700 text-white px-5 py-3 text-sm no-print">
        <span><strong>Update {updateAvailable.version} verfügbar.</strong> Wird im Hintergrund heruntergeladen…</span>
        <button className="shrink-0 text-white/70 hover:text-white text-lg" onClick={() => setUpdateAvailable(null)}>×</button>
      </div>
    )
    return null
  }

  const SaveErrorBanner = () => {
    if (!activeSaveError) return null
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-red-700 text-white px-5 py-3 text-sm no-print">
        <span><strong>Speichern fehlgeschlagen.</strong> {activeSaveError}</span>
        <button className="shrink-0 text-white/70 hover:text-white text-lg" onClick={clearActiveSaveError}>×</button>
      </div>
    )
  }

  const WebUpdateBanner = () => {
    if (!webUpdateReady) return null
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-brand-700 text-white px-5 py-3 text-sm no-print">
        <span><strong>Neue Version verfügbar.</strong> Bitte Seite neu laden, um die Aktualisierung zu übernehmen.</span>
        <div className="flex items-center gap-2 shrink-0">
          <button className="px-4 py-1.5 bg-white text-brand-800 font-semibold hover:bg-brand-50"
            onClick={() => window.location.reload()}>Jetzt neu laden</button>
          <button className="text-white/70 hover:text-white text-lg" onClick={() => setWebUpdateReady(false)}>×</button>
        </div>
      </div>
    )
  }

  const handleUpdateProtocol = (id, patch) => {
    updateProtocol(id, serverUser
      ? { ...patch, updatedBy: serverUser.displayName || serverUser.username }
      : patch
    )
  }

  const wrap = (children) => (
    <>
      {children}
      {showAdmin && <AdminPanel serverUser={serverUser} onClose={() => setShowAdmin(false)} />}
      <WebUpdateBanner />
    </>
  )

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!serverAuthChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Verbindung wird hergestellt…</div>
      </div>
    )
  }

  if (isServer && !serverUser) {
    return <LoginScreen onLogin={handleLogin} />
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  if (!loaded || !projectsLoaded) {
    return wrap(
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Lade Daten…</div>
      </div>
    )
  }

  // ── Views ─────────────────────────────────────────────────────────────────
  if (view === 'editor') {
    const activeProtocol  = protocols.find(p => p.id === activeId)
    const linkedProject   = projectsWithContacts.find(p => p.id === activeProtocol?.projectId) ?? null
    if (!activeProtocol) { setView('protocols'); return null }
    return wrap(
      <>
        <ProtocolEditor
          protocol={activeProtocol}
          protocols={protocols}
          projects={projectsWithContacts}
          projectContacts={linkedProject?.contacts ?? []}
          logoDataUrl={logoDataUrl}
          onLogoUpdate={updateLogo}
          onLogoClear={clearLogo}
          onUpdate={handleUpdateProtocol}
          onUpdateProject={handleUpdateProject}
          onBack={handleBackFromEditor}
          onRefresh={handleRefresh}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'protocols') {
    const project  = projectsWithContacts.find(p => p.id === selectedProjectId) ?? null
    const filtered = protocols.filter(p => selectedProjectId ? p.projectId === selectedProjectId : !p.projectId)
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
          onManageContacts={() => { setContactsOrigin('protocols'); setView('project-contacts') }}
          onRefresh={handleRefresh}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'project-contacts') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    return wrap(
      <>
        <ProjectManager
          projects={project ? [project] : []}
          onCreate={createProject}
          onUpdate={handleUpdateProject}
          onDelete={deleteProject}
          onBack={() => setView(contactsOrigin)}
          logoDataUrl={logoDataUrl}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'dashboard') {
    return wrap(
      <>
        <MassnahmenDashboard
          protocols={protocols}
          projects={projectsWithContacts}
          onOpenProtocol={openProtocolFromDashboard}
          onBack={() => setView('home')}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'project-dashboard') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    if (!project) { setView('home'); return null }
    return wrap(
      <>
        <ProjectDashboard
          project={project}
          protocols={protocols}
          onBack={() => setView('home')}
          onOpenProtocols={() => openProject(selectedProjectId)}
          onManageContacts={() => { setContactsOrigin('project-dashboard'); setView('project-contacts') }}
          onUpdate={handleUpdateProject}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  return wrap(
    <>
      <ProjectsHome
        projects={projectsWithContacts}
        protocols={protocols}
        onCreate={createProject}
        onUpdate={handleUpdateProject}
        onDelete={deleteProject}
        onOpenProject={openProject}
        onOpenProjectDashboard={openProjectDashboard}
        onUnlock={handleUnlockProject}
        onSetPassword={handleSetProjectPassword}
        onRemovePassword={handleRemoveProjectPassword}
        onOpenDashboard={() => setView('dashboard')}
        onImportProject={handleImportProject}
        serverUser={serverUser}
        onLogout={isServer ? handleLogout : null}
        onOpenAdmin={isServer ? () => setShowAdmin(true) : null}
      />
      <UpdateBanner /><SaveErrorBanner />
    </>
  )
}
