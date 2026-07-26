import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useProtocols } from './hooks/useProtocols'
import { useProjects }  from './hooks/useProjects'
import { useNotes }     from './hooks/useNotes'
import { useLogo }      from './hooks/useLogo'
import ProjectsHome          from './components/ProjectsHome'
import ProjectManager        from './components/ProjectManager'
import ProtocolList          from './components/ProtocolList'
import ProtocolEditor        from './components/ProtocolEditor'
import MassnahmenDashboard   from './components/MassnahmenDashboard'
import NotizbuchView         from './components/NotizbuchView'
import BimView               from './components/BimView'
import ProjectDashboard      from './components/ProjectDashboard'
import NotesList             from './components/NotesList'
import ContactDatabase       from './components/ContactDatabase'
import LoginScreen           from './components/LoginScreen'
import AdminPanel            from './components/AdminPanel'
import BimViewerPopup        from './components/BimViewerPopup'
import LearningPlatform      from './components/LearningPlatform'
import BautagebuchView       from './components/BautagebuchView'
import MaengelView           from './components/MaengelView'
import PersonalplanungView   from './components/PersonalplanungView'
import DateiablageView       from './components/DateiablageView'
import ProjektdatenView      from './components/ProjektdatenView'
import ProjektdatenbankView  from './components/ProjektdatenbankView'
import { hashPassword, uid } from './utils'
import { buildProjectArchivePdf, downloadPdfBase64 } from './archivePdf'
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

  const {
    notes, createNote, updateNote, deleteNote, refetchNotes,
  } = useNotes()

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchProtocols(), refetchProjects(), refetchNotes()])
  }, [refetchProtocols, refetchProjects, refetchNotes])

  const { logoDataUrl, updateLogo, clearLogo, saveError: logoSaveError, clearSaveError: clearLogoError } = useLogo()

  const activeSaveError    = protocolSaveError || projectSaveError || logoSaveError
  const clearActiveSaveError = () => { clearProtocolError(); clearProjectError(); clearLogoError() }

  const [view,              setView]              = useState('home')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedPhase,     setSelectedPhase]     = useState(null)   // 'planung' | 'bau' | null
  const [contactsOrigin,    setContactsOrigin]    = useState('protocols')
  const [bimReturnView,     setBimReturnView]     = useState('project-dashboard')
  const [bimPopup,          setBimPopup]          = useState(null)   // { project, viewpoint, title } | null
  const [notesTab,          setNotesTab]          = useState('notizen')  // 'notizen' | 'notizbuch'
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

  // Projektübergreifende Kontaktdatenbank (dedupliziert) – für Notiz-Teilnehmer/Verteiler
  const allContacts = useMemo(() => {
    const list = []
    const seen = new Set()
    for (const p of projectsWithContacts) {
      for (const c of (p.contacts ?? [])) {
        if (!c.name && !c.company && !c.email) continue
        const key = (c.email || '').trim().toLowerCase()
          || `${(c.name || '').trim().toLowerCase()}|${(c.company || '').trim().toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        list.push({
          id: c.id, name: c.name || '', company: c.company || '', email: c.email || '', phone: c.phone || '',
          mobile: c.mobile || '', street: c.street || '', zip: c.zip || '', city: c.city || '',
        })
      }
    }
    return list.sort((a, b) => (a.name || a.company).localeCompare(b.name || b.company, 'de'))
  }, [projectsWithContacts])

  // ── Server auth state ─────────────────────────────────────────────────────
  // serverAuthChecked starts as true in local/Electron mode (no auth needed).
  const [serverUser,        setServerUser]        = useState(null)
  const [serverAuthChecked, setServerAuthChecked] = useState(!isServer)
  const [showAdmin,         setShowAdmin]         = useState(false)

  // ── Vorschau als Anwender ─────────────────────────────────────────────────
  // Rein clientseitiger Modus: Ein Admin sieht die App wie ein einfacher Nutzer.
  // effectiveUser wird ÜBERALL statt serverUser durchgereicht → alle Rollen-Checks
  // zeigen automatisch die Anwender-Sicht. Serverrechte/Token bleiben unverändert;
  // Umschalter und Banner nutzen weiterhin die echte Rolle (serverUser).
  const [previewAsUser, setPreviewAsUser] = useState(false)
  const isRealAdmin = isServer && serverUser?.role === 'admin'
  const effectiveUser = useMemo(
    () => (previewAsUser && serverUser?.role === 'admin')
      ? { ...serverUser, role: 'user' }
      : serverUser,
    [previewAsUser, serverUser],
  )
  const startPreviewAsUser = () => { setShowAdmin(false); setPreviewAsUser(true) }

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
      .then(user => { if (user) { setServerUser(user); setServerAuthChecked(true); handleRefresh() } })
      .catch(() => { setServerUser(null); setServerAuthChecked(true) })
  }, [])

  const handleLogin = (user) => {
    setServerUser(user)
    // Beim App-Start (ohne Token) liefen die Daten-Hooks ins 401 und blieben leer.
    // Jetzt liegt der Token vor → Projekte/Protokolle frisch nachladen.
    handleRefresh()
  }

  // Kontakt-Nutzungshäufigkeit (Provider in main.jsx) nach Auth-Wechsel neu laden.
  useEffect(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('kp-auth-changed'))
  }, [serverUser?.username])

  const handleLogout = async () => {
    const token = localStorage.getItem('kp_session_token')
    try {
      if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch {}
    localStorage.removeItem('kp_session_token')
    setServerUser(null)
    setShowAdmin(false)
    setPreviewAsUser(false)
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
  const openProjectProtocols = (projectId, phase) => {
    setSelectedProjectId(projectId)
    setSelectedPhase(phase)
    setView('protocols')
  }

  const handleCreateProtocol = () => {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    const id = createProtocol({
      projectId:   selectedProjectId ?? null,
      projectName: project?.name ?? '',
      phase:       selectedPhase ?? null,
    })
    setActiveId(id)
    setView('editor')
  }

  const handleOpenProtocol       = (id) => { setActiveId(id); setView('editor') }
  const handleBackFromEditor     = ()   => { setActiveId(null); setView('protocols') }
  const handleBackFromProtocols  = ()   => {
    if (selectedProjectId) {
      setView('project-dashboard')
    } else {
      setSelectedProjectId(null)
      setView('home')
    }
    setSelectedPhase(null)
  }

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

  const handleCreateProject = useCallback(() => {
    const patch = isServer && serverUser ? { projectAdminUser: serverUser.username } : {}
    return createProject(patch)
  }, [createProject, serverUser])

  const handleRequestDeleteProject = useCallback(async (projectId) => {
    const token = localStorage.getItem('kp_session_token')
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`/api/projects/${projectId}/request-delete`, { method: 'POST', headers })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Fehler beim Senden der Anfrage.')
    }
    return res.json()
  }, [])

  const sessionToken = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null

  // ── Projekt archivieren: Gesamtprotokoll-PDF erzeugen und ablegen.
  // Server-Modus: System-Admin archiviert direkt; alle anderen stellen eine
  // Archivierungsanfrage, die der Software-Admin genehmigen muss.
  const handleArchiveProject = useCallback(async (projectId) => {
    const project = projectsWithContacts.find(p => p.id === projectId)
    if (!project) throw new Error('Projekt nicht gefunden.')
    const projectProtos = protocols.filter(p => p.projectId === projectId)

    let archivePdf = null
    if (projectProtos.length > 0) {
      const pdfBase64 = await buildProjectArchivePdf(
        project, projectProtos, protocols,
        project.logo || logoDataUrl, project.clientLogo || ''
      )
      if (pdfBase64) {
        if (isServer) {
          const headers = { 'Content-Type': 'application/json' }
          if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`
          const res = await fetch(`/api/projects/${projectId}/archive-pdf`, {
            method: 'POST', headers, body: JSON.stringify({ pdfBase64 }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error(d.error || 'Archiv-PDF konnte nicht abgelegt werden.')
          }
          const meta = await res.json()
          archivePdf = { size: meta.size, createdAt: meta.createdAt, protocolCount: projectProtos.length }
        } else {
          // Lokal-/Electron-Modus: PDF direkt herunterladen
          downloadPdfBase64(pdfBase64, `Gesamtprotokoll_${(project.name || 'Projekt').replace(/[/\\:*?"<>|]/g, '-')}.pdf`)
          archivePdf = { createdAt: new Date().toISOString(), protocolCount: projectProtos.length, local: true }
        }
      }
    }

    if (isServer && effectiveUser?.role !== 'admin') {
      // Zustimmung des Software-Admins erforderlich → Anfrage stellen
      const headers = { 'Content-Type': 'application/json' }
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`
      const res = await fetch(`/api/projects/${projectId}/request-archive`, { method: 'POST', headers })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Archivierungsanfrage konnte nicht gestellt werden.')
      }
      const data = await res.json()
      return { requested: true, alreadyPending: !!data.alreadyPending }
    }

    updateProject(projectId, { isArchived: true, archivedAt: new Date().toISOString(), archivePdf })
    return { archived: true }
  }, [projectsWithContacts, protocols, logoDataUrl, sessionToken, effectiveUser, updateProject])

  const handleUnarchiveProject = useCallback((projectId) => {
    updateProject(projectId, { isArchived: false, archivedAt: null })
  }, [updateProject])

  const wrap = (children) => (
    <>
      {children}
      {showAdmin && (
        <AdminPanel
          serverUser={effectiveUser}
          onClose={() => setShowAdmin(false)}
          onPreviewAsUser={isRealAdmin && !previewAsUser ? startPreviewAsUser : undefined}
        />
      )}
      {previewAsUser && (
        <div className="fixed bottom-0 inset-x-0 z-[60] no-print flex items-center justify-center gap-3 bg-night text-white text-sm px-4 py-2">
          <span className="font-medium">Vorschau als Anwender</span>
          <span className="text-white/60 hidden sm:inline">– so sieht ein einfacher Nutzer die App</span>
          <button
            className="bg-sky text-night px-3 py-1 font-medium hover:opacity-90 transition-opacity"
            onClick={() => setPreviewAsUser(false)}
          >
            Zurück zur Admin-Ansicht
          </button>
        </div>
      )}
      {bimPopup && (
        <BimViewerPopup
          project={bimPopup.project}
          token={sessionToken}
          viewpoint={bimPopup.viewpoint}
          title={bimPopup.title}
          onClose={() => setBimPopup(null)}
        />
      )}
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
          serverUser={effectiveUser}
          logoDataUrl={linkedProject?.logo || logoDataUrl}
          clientLogoDataUrl={linkedProject?.clientLogo || ''}
          onUpdate={handleUpdateProtocol}
          onUpdateProject={handleUpdateProject}
          onBack={handleBackFromEditor}
          onRefresh={handleRefresh}
          onOpenBim={linkedProject?.bimMeta ? () => { setBimReturnView('editor'); setView('project-bim') } : undefined}
          onOpenBimIssue={linkedProject?.bimMeta ? (viewpoint, title) => setBimPopup({ project: linkedProject, viewpoint, title }) : undefined}
          notes={notes}
          onCreateNote={activeProtocol.projectId ? (patch) => createNote(patch) : undefined}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
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
          phaseFilter={selectedPhase}
          onCreate={handleCreateProtocol}
          onOpen={handleOpenProtocol}
          onDelete={deleteProtocol}
          onDuplicate={duplicateProtocol}
          onImport={importProtocol}
          onOpenImported={(id) => { setActiveId(id); setView('editor') }}
          onBack={handleBackFromProtocols}
          onManageContacts={() => { setContactsOrigin('protocols'); setView('project-contacts') }}
          onRefresh={handleRefresh}
          onOpenBim={project?.bimMeta ? () => { setBimReturnView('protocols'); setView('project-bim') } : undefined}
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
          allProjects={projectsWithContacts}
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

  if (view === 'project-massnahmen') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId) ?? null
    const projectProtos = protocols.filter(p => p.projectId === selectedProjectId)
    return wrap(
      <>
        <MassnahmenDashboard
          protocols={projectProtos}
          projects={projectsWithContacts}
          projectId={selectedProjectId}
          projectContacts={[...(project?.contacts ?? []), ...(project?.adminContacts ?? [])]}
          serverUser={effectiveUser}
          onOpenProtocol={openProtocolFromDashboard}
          onUpdateProtocol={handleUpdateProtocol}
          onBack={() => setView('project-dashboard')}
          project={project}
          onOpenBim={project?.bimMeta ? () => { setBimReturnView('project-massnahmen'); setView('project-bim') } : undefined}
          onOpenBimIssue={project?.bimMeta ? (viewpoint, title) => setBimPopup({ project, viewpoint, title }) : undefined}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'project-bim') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    if (!project) { setView('home'); return null }
    const projectProtocols = protocols.filter(p => p.projectId === selectedProjectId)
    const handleAddBimIssueToProtocol = (protocolId, issue) => {
      const protocol = protocols.find(p => p.id === protocolId)
      if (!protocol) return
      const existing = protocol.actionItems || []
      const maxNo = existing.reduce((m, a) => Math.max(m, a.no || 0), 0)
      const newItem = {
        id: uid(),
        no: maxNo + 1,
        description: issue.description ? `${issue.title}\n${issue.description}` : issue.title,
        responsible: issue.assignedTo || '',
        deadline: issue.dueDate || '',
        status: 'offen',
        priority: issue.priority || 'mittel',
        remarks: '',
        bimIssueId: issue.id,
        bimViewpoint: issue.viewpoint || null,
        releaseHistory: [],
      }
      handleUpdateProtocol(protocolId, { actionItems: [...existing, newItem] })
    }
    const handleAddReviewToProtocol = (protocolId, review) => {
      const protocol = protocols.find(p => p.id === protocolId)
      if (!protocol) return
      const existing = protocol.actionItems || []
      const maxNo = existing.reduce((m, a) => Math.max(m, a.no || 0), 0)
      const planPrefix = review.planTitle ? `[${review.planTitle}] ` : ''
      const newItem = {
        id: uid(),
        no: maxNo + 1,
        description: `${planPrefix}${review.description ? `${review.title}\n${review.description}` : review.title}`,
        responsible: review.assignedTo || '',
        deadline: review.dueDate || '',
        status: 'offen',
        priority: review.priority || 'mittel',
        remarks: '',
        planReviewId: review.id,
        bimViewpoint: review.viewpoint || null,
        releaseHistory: [],
      }
      handleUpdateProtocol(protocolId, { actionItems: [...existing, newItem] })
    }
    return (
      <BimView
        project={project}
        serverUser={effectiveUser}
        token={typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null}
        onBack={() => setView(bimReturnView)}
        backLabel={
        bimReturnView === 'protocols'          ? 'Protokolle' :
        bimReturnView === 'editor'             ? 'Protokoll' :
        bimReturnView === 'project-massnahmen' ? 'Maßnahmen' :
        'Dashboard'
      }
        onProjectUpdated={handleRefresh}
        protocols={projectProtocols}
        onAddBimIssueToProtocol={handleAddBimIssueToProtocol}
        onAddReviewToProtocol={handleAddReviewToProtocol}
      />
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
          notes={notes}
          serverUser={effectiveUser}
          globalLogoDataUrl={logoDataUrl}
          onUpdateProject={handleUpdateProject}
          onBack={() => setView('home')}
          onOpenProtocols={(phase) => openProjectProtocols(selectedProjectId, phase)}
          onOpenNotes={() => { setNotesTab('notizen'); setView('notes') }}
          onManageContacts={() => { setContactsOrigin('project-dashboard'); setView('project-contacts') }}
          onOpenMassnahmen={() => setView('project-massnahmen')}
          onOpenBim={() => { setBimReturnView('project-dashboard'); setView('project-bim') }}
          onOpenBautagebuch={() => setView('project-bautagebuch')}
          onOpenMaengel={() => setView('project-maengel')}
          onOpenDateiablage={isServer ? () => setView('project-dateiablage') : undefined}
          onOpenProjektdaten={() => setView('project-daten')}
          onSaved={isServer ? handleRefresh : undefined}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'notes') {
    const project  = projectsWithContacts.find(p => p.id === selectedProjectId) ?? null
    const filtered = notes.filter(n => n.projectId === selectedProjectId)
    const tabBtn = (id, label) => (
      <button
        className={`px-3 py-1.5 text-sm font-medium border transition-colors ${
          notesTab === id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
        onClick={() => setNotesTab(id)}
      >{label}</button>
    )
    const tabs = (
      <div className="inline-flex self-end no-print">{tabBtn('notizen', 'Notizen')}{tabBtn('notizbuch', 'Notizbuch')}</div>
    )
    return wrap(
      <>
        {notesTab === 'notizbuch'
          ? <NotizbuchView
              project={project}
              serverUser={effectiveUser}
              onBack={() => setView('project-dashboard')}
              tabs={tabs}
            />
          : <NotesList
              notes={filtered}
              projectContacts={project?.contacts ?? []}
              allContacts={allContacts}
              projectName={project?.name || ''}
              logoDataUrl={project?.logo || logoDataUrl}
              clientLogoDataUrl={project?.clientLogo || ''}
              onCreate={(patch) => createNote({ ...patch, projectId: selectedProjectId })}
              onUpdate={updateNote}
              onDelete={deleteNote}
              onBack={() => setView('project-dashboard')}
              tabs={tabs}
            />}
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'contact-database') {
    return wrap(
      <>
        <ContactDatabase
          projects={projectsWithContacts}
          onUpdate={handleUpdateProject}
          onBack={() => setView('home')}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'learning') {
    return wrap(
      <>
        <LearningPlatform
          serverUser={effectiveUser}
          onBack={() => setView('home')}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'personalplanung') {
    // Personalplanung obliegt dem Software-Admin
    if (isServer && effectiveUser?.role !== 'admin') { setView('home'); return null }
    return wrap(
      <>
        <PersonalplanungView
          projects={projectsWithContacts}
          onUpdateProject={handleUpdateProject}
          serverUser={effectiveUser}
          onBack={() => setView('home')}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'project-bautagebuch') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    if (!project) { setView('home'); return null }
    return wrap(
      <>
        <BautagebuchView
          project={project}
          serverUser={effectiveUser}
          onBack={() => setView('project-dashboard')}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  // Projektdatenbank bearbeiten dürfen System- und Projektadmins
  const canEditProjektdaten = (project) => !isServer || effectiveUser?.role === 'admin'
    || project.projectAdminUser === serverUser?.username
    || project.projectAdmins?.includes(serverUser?.username)

  if (view === 'project-daten') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    if (!project) { setView('home'); return null }
    return wrap(
      <>
        <ProjektdatenView
          project={project}
          allContacts={allContacts}
          onUpdateProject={handleUpdateProject}
          onBack={() => setView('project-dashboard')}
          readOnly={!canEditProjektdaten(project)}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'projektdatenbank') {
    return wrap(
      <>
        <ProjektdatenbankView
          projects={projectsWithContacts}
          allContacts={allContacts}
          canEdit={canEditProjektdaten}
          serverUser={effectiveUser}
          onCreate={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onBack={() => setView('home')}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'project-dateiablage') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    if (!project) { setView('home'); return null }
    const canAdminFiles = !isServer || effectiveUser?.role === 'admin'
      || project.projectAdminUser === serverUser?.username
      || project.projectAdmins?.includes(serverUser?.username)
    return wrap(
      <>
        <DateiablageView
          project={project}
          serverUser={effectiveUser}
          canAdmin={canAdminFiles}
          onUpdateProject={handleUpdateProject}
          onBack={() => setView('project-dashboard')}
        />
        <UpdateBanner /><SaveErrorBanner />
      </>
    )
  }

  if (view === 'project-maengel') {
    const project = projectsWithContacts.find(p => p.id === selectedProjectId)
    if (!project) { setView('home'); return null }
    const projectProtos = protocols.filter(p => p.projectId === selectedProjectId)
    const handleAddDefectToProtocol = (protocolId, defect) => {
      const protocol = protocols.find(p => p.id === protocolId)
      if (!protocol) return
      const existing = protocol.actionItems || []
      const maxNo = existing.reduce((m, a) => Math.max(m, a.no || 0), 0)
      handleUpdateProtocol(protocolId, {
        actionItems: [...existing, {
          id: uid(),
          no: maxNo + 1,
          description: `[Mangel ${defect.no}] ${defect.title}${defect.location ? ` – ${defect.location}` : ''}`,
          responsible: defect.responsible || '',
          deadline: defect.dueDate || '',
          status: 'offen',
          priority: defect.priority || 'mittel',
          remarks: '',
          defectId: defect.id,
          releaseHistory: [],
        }],
      })
    }
    return wrap(
      <>
        <MaengelView
          project={project}
          protocols={projectProtos}
          serverUser={effectiveUser}
          onBack={() => setView('project-dashboard')}
          onAddToProtocol={handleAddDefectToProtocol}
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
        onCreate={handleCreateProject}
        onUpdate={handleUpdateProject}
        onDelete={deleteProject}
        onOpenProject={openProject}
        onOpenProjectDashboard={openProjectDashboard}
        onUnlock={handleUnlockProject}
        onSetPassword={handleSetProjectPassword}
        onRemovePassword={handleRemoveProjectPassword}
        onOpenContactDatabase={() => setView('contact-database')}
        onOpenLearning={() => setView('learning')}
        onOpenPersonalplanung={() => setView('personalplanung')}
        onOpenProjektdatenbank={() => setView('projektdatenbank')}
        onImportProject={handleImportProject}
        onArchiveProject={handleArchiveProject}
        onUnarchiveProject={handleUnarchiveProject}
        notes={notes}
        onOpenProtocol={openProtocolFromDashboard}
        onOpenProjectNotes={(projectId) => { setSelectedProjectId(projectId); setView('notes') }}
        serverUser={effectiveUser}
        onLogout={isServer ? handleLogout : null}
        onOpenAdmin={isServer ? () => setShowAdmin(true) : null}
        onRequestDeleteProject={isServer ? handleRequestDeleteProject : null}
        onRefresh={isServer ? handleRefresh : null}
      />
      <UpdateBanner /><SaveErrorBanner />
    </>
  )
}
