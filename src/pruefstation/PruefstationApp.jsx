import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ScanSearch, LogOut, ExternalLink, Loader, Plus, AlertCircle, X, Search, FolderOpen, HardDrive } from 'lucide-react'
import LoginScreen from '../components/LoginScreen'
import SessionExpiredModal from '../components/SessionExpiredModal'
import VorgangDetail from './VorgangDetail'
import { api, tokenOf, ART_LABEL, STATUS, formatDateDe, vorgangLabel, useEscape } from './api'

// ── Prüfstation ──────────────────────────────────────────────────────────────
// Eigenständige Oberfläche unter /pruefstation. Links die Prüfvorgänge (nach
// Projekt gefiltert), rechts der gewählte Vorgang mit seinem NAS-Ordner.
// Gleiche Sitzung (kp_session_token) und gleiche Projekte wie das Protokolltool.

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const LS_PROJECT = 'kp_pruef_project'

const readHash = () => new URLSearchParams(window.location.hash.slice(1)).get('v') || ''

export default function PruefstationApp() {
  const [user,        setUser]        = useState(null)
  const [authChecked, setAuthChecked] = useState(!isServer)
  const [expired,     setExpired]     = useState(false)

  useEffect(() => {
    if (!isServer) return
    const token = tokenOf()
    fetch('/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (r.status === 401) { localStorage.removeItem('kp_session_token'); return null }
        return r.json()
      })
      .then(u => { setUser(u || null); setAuthChecked(true) })
      .catch(() => { setUser(null); setAuthChecked(true) })
  }, [])

  useEffect(() => {
    const onExpired = () => setExpired(true)
    window.addEventListener('kp-auth-expired', onExpired)
    return () => window.removeEventListener('kp-auth-expired', onExpired)
  }, [])

  const handleLogout = async () => {
    const token = tokenOf()
    try { if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
    localStorage.removeItem('kp_session_token')
    setUser(null)
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        <Loader size={18} className="animate-spin mr-2" /> Anmeldung wird geprüft…
      </div>
    )
  }
  if (!isServer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-gray-500">
        Die Prüfstation läuft nur im Server-Modus (NAS), weil sie auf die Projektordner der NAS zugreift.
      </div>
    )
  }
  if (!user) return <LoginScreen onLogin={setUser} title="Komplizen Prüfstation" />

  return (
    <>
      <header className="no-print sticky top-0 z-30 bg-night text-light px-4 sm:px-6 lg:px-10 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ScanSearch size={18} className="text-sky flex-shrink-0" />
          <span className="font-semibold truncate">Komplizen Prüfstation</span>
          <span className="hidden sm:inline text-xs text-light/60 truncate">· Nachträge und Rechnungen prüfen</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline text-xs text-light/70">{user.display_name || user.displayName || user.username}</span>
          <a className="btn btn-ghost text-light hover:bg-white/10 hover:text-light" href="/" title="Zum Protokolltool wechseln">
            <ExternalLink size={14} /> Protokolltool
          </a>
          <button className="btn btn-ghost text-light hover:bg-white/10 hover:text-light" onClick={handleLogout} title="Abmelden">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <Pruefstation key={user.username} />

      {expired && (
        <SessionExpiredModal
          username={user?.username}
          onSuccess={(u) => { setExpired(false); if (u) setUser(u) }}
        />
      )}
    </>
  )
}

function Pruefstation() {
  const [status,    setStatus]    = useState(null)
  const [projects,  setProjects]  = useState([])
  const [vorgaenge, setVorgaenge] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [projectId, setProjectId] = useState(() => { try { return localStorage.getItem(LS_PROJECT) || '' } catch { return '' } })
  const [selected,  setSelected]  = useState(readHash)
  const [query,     setQuery]     = useState('')
  const [showDone,  setShowDone]  = useState(false)
  const [creating,  setCreating]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, p, v] = await Promise.all([
        api('/api/pruefstation/status'),
        api('/api/pruefstation/projects'),
        api('/api/pruefstation/vorgaenge'),
      ])
      setStatus(s); setProjects(p); setVorgaenge(v)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => { try { localStorage.setItem(LS_PROJECT, projectId) } catch {} }, [projectId])
  useEffect(() => {
    const want = selected ? `#v=${selected}` : ''
    if (window.location.hash !== want) history.replaceState(null, '', window.location.pathname + want)
  }, [selected])
  useEffect(() => {
    const onHash = () => setSelected(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order = { eingang: 0, in_pruefung: 1, zur_freigabe: 2, abgeschlossen: 3 }
    return vorgaenge
      .filter(v => !projectId || v.projectId === projectId)
      .filter(v => showDone || v.status !== 'abgeschlossen' || v.id === selected)
      .filter(v => !q || `${vorgangLabel(v)} ${v.auftragnehmer} ${projectById.get(v.projectId)?.name || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (order[a.status] - order[b.status]) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }, [vorgaenge, projectId, showDone, query, selected, projectById])

  const current = vorgaenge.find(v => v.id === selected) || null
  const doneCount = vorgaenge.filter(v => (!projectId || v.projectId === projectId) && v.status === 'abgeschlossen').length

  const handleChange = useCallback((saved) => {
    setVorgaenge(vs => vs.map(v => v.id === saved.id ? saved : v))
  }, [])

  const handleDelete = async () => {
    if (!current) return
    if (!window.confirm(`Prüfvorgang „${vorgangLabel(current)}" löschen?\n\nDie Dateien im NAS-Ordner bleiben erhalten.`)) return
    try {
      await api(`/api/pruefstation/vorgaenge/${current.id}`, { method: 'DELETE' })
      setVorgaenge(vs => vs.filter(v => v.id !== current.id))
      setSelected('')
    } catch (e) { setError(e.message) }
  }

  const handleCreate = async (data) => {
    const v = await api('/api/pruefstation/vorgaenge', { method: 'POST', body: data })
    setVorgaenge(vs => [v, ...vs])
    setSelected(v.id)
    setCreating(false)
  }

  if (loading) {
    return <div className="p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
  }

  return (
    <div className="app-page">
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}
      {status && !status.nasConfigured && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-4 py-2 flex items-center gap-2">
          <HardDrive size={14} /> Die NAS-Anbindung ist noch nicht eingerichtet. In der docker-compose.yml auf der NAS
          SYNOLOGY_FS_USER und SYNOLOGY_FS_PASS (Service-Konto mit Schreibrecht auf die Projektordner) setzen und den Container neu erstellen.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
        {/* Liste */}
        <aside className="space-y-3 lg:sticky lg:top-16">
          <div className="flex gap-2">
            <select className="select flex-1" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">Alle Projekte</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn-primary" onClick={() => setCreating(true)} title="Neuen Prüfvorgang anlegen"><Plus size={14} /> Neu</button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-8" value={query} onChange={e => setQuery(e.target.value)} placeholder="Vorgang suchen…" />
          </div>

          <div className="card divide-y divide-gray-100">
            {list.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-400">
                Noch keine Prüfvorgänge{projectId ? ' in diesem Projekt' : ''}.<br />
                <button className="text-brand-600 hover:underline mt-1" onClick={() => setCreating(true)}>Ersten Vorgang anlegen</button>
              </p>
            )}
            {list.map(v => (
              <button key={v.id} onClick={() => setSelected(v.id)}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 border-l-4 ${v.id === selected ? 'border-l-brand-600 bg-sky/10' : 'border-l-transparent'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-night truncate">{vorgangLabel(v)}</span>
                  <span className={`${STATUS[v.status]?.badge || 'badge-gray'} flex-shrink-0`}>{STATUS[v.status]?.label}</span>
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                  {!projectId && <span className="truncate">{projectById.get(v.projectId)?.name || '–'}</span>}
                  {v.frist && <span className={`flex-shrink-0 ${v.status !== 'abgeschlossen' && v.frist < new Date().toISOString().slice(0, 10) ? 'text-red-600 font-medium' : ''}`}>Frist {formatDateDe(v.frist)}</span>}
                  {!v.folderPath && <span className="text-amber-600 flex-shrink-0 flex items-center gap-0.5"><FolderOpen size={11} /> kein Ordner</span>}
                </div>
              </button>
            ))}
          </div>
          {doneCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
              Abgeschlossene anzeigen ({doneCount})
            </label>
          )}
        </aside>

        {/* Detail */}
        <main className="min-w-0">
          {current ? (
            <VorgangDetail
              key={current.id}
              vorgang={current}
              project={projectById.get(current.projectId)}
              onChange={handleChange}
              onDelete={handleDelete}
            />
          ) : (
            <div className="card p-12 text-center text-gray-400">
              <ScanSearch size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">Prüfvorgang auswählen oder neu anlegen.</p>
              <p className="text-xs mt-1 max-w-md mx-auto">
                Jeder Vorgang wird mit einem Ordner auf der NAS verknüpft. Dort liegen das zu prüfende Dokument und die
                Anlagen zur Prüfung: Einigungen, E-Mail-Verläufe, Stellungnahmen.
              </p>
            </div>
          )}
        </main>
      </div>

      {creating && (
        <NeuerVorgang
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}

function NeuerVorgang({ projects, defaultProjectId, onClose, onCreate }) {
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '')
  const [art,       setArt]       = useState('nachtrag')
  const [nummer,    setNummer]    = useState('')
  const [index,     setIndex]     = useState('')
  const [titel,     setTitel]     = useState('')
  const [busy,      setBusy]      = useState(false)
  const [err,       setErr]       = useState(null)
  useEscape(onClose)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await onCreate({ projectId, art, nummer, index, titel }) }
    catch (e2) { setErr(e2.message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-night/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <form className="card w-full max-w-lg p-5 space-y-3" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-night">Neuer Prüfvorgang</h2>
          <button type="button" className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-0.5">Projekt</span>
          <select className="select" value={projectId} onChange={e => setProjectId(e.target.value)} required>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(ART_LABEL).map(([k, l]) => (
            <button type="button" key={k} onClick={() => setArt(k)}
              className={`px-2 py-2 text-sm border ${art === k ? 'border-brand-600 bg-sky/10 text-brand-700 font-medium' : 'border-concrete text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-0.5">{art === 'rechnung' ? 'Nummer (z. B. 3. AR Bau)' : art === 'nachtrag' ? 'Nummer (z. B. NA 008)' : 'Nummer'}</span>
            <input className="input" value={nummer} onChange={e => setNummer(e.target.value)} autoFocus />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-0.5">Index</span>
            <input className="input" value={index} onChange={e => setIndex(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-0.5">Titel / Gegenstand</span>
          <input className="input" value={titel} onChange={e => setTitel(e.target.value)} />
        </label>
        <p className="text-xs text-gray-500">Im nächsten Schritt verknüpfst du den NAS-Ordner für diesen Vorgang.</p>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={!projectId || busy}>{busy ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Anlegen</button>
        </div>
      </form>
    </div>
  )
}
