import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ScanSearch, Loader, Plus, AlertCircle, X, Search, FolderOpen, HardDrive, ArrowLeft, Settings2, Link2, Check } from 'lucide-react'
import VorgangDetail from './VorgangDetail'
import FolderPicker from './FolderPicker'
import { api, ART_LABEL, STATUS, formatDateDe, vorgangLabel, useEscape, suggestFolderName } from './api'

// ── Prüfvorgänge: Liste + gewählter Vorgang ─────────────────────────────────
// Läuft an zwei Stellen:
//   standalone      eigene Seite /pruefstation (alle Projekte, Auswahl oben)
//   fixedProjectId  im Projekt-Dashboard des Protokolltools (nur dieses Projekt)
// Je Projekt lassen sich Prüfordner festlegen (Nachträge, Rechnungen, Sonstiges);
// neue Vorgänge bekommen darunter automatisch ihren Ordner („Nachtrag 008").

const LS_PROJECT = 'kp_pruef_project'
const readHash = () => new URLSearchParams(window.location.hash.slice(1)).get('v') || ''

export default function Pruefstation({ standalone = false, fixedProjectId = '', onBack }) {
  const [status,    setStatus]    = useState(null)
  const [projects,  setProjects]  = useState([])
  const [vorgaenge, setVorgaenge] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [projectIdSel, setProjectId] = useState(() => { if (fixedProjectId) return fixedProjectId; try { return localStorage.getItem(LS_PROJECT) || '' } catch { return '' } })
  const projectId = fixedProjectId || projectIdSel
  const [selected,  setSelected]  = useState(() => (standalone ? readHash() : ''))
  const [hinweis,   setHinweis]   = useState('')
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

  useEffect(() => { if (!fixedProjectId) try { localStorage.setItem(LS_PROJECT, projectIdSel) } catch {} }, [projectIdSel, fixedProjectId])
  // Nur die eigene Seite merkt sich den Vorgang in der Adresse (#v=…)
  useEffect(() => {
    if (!standalone) return
    const want = selected ? `#v=${selected}` : ''
    if (window.location.hash !== want) history.replaceState(null, '', window.location.pathname + want)
  }, [selected, standalone])
  useEffect(() => {
    if (!standalone) return
    const onHash = () => setSelected(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [standalone])

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
    const { _hinweis, ...v } = await api('/api/pruefstation/vorgaenge', { method: 'POST', body: data })
    setHinweis(_hinweis || '')
    setVorgaenge(vs => [v, ...vs])
    setSelected(v.id)
    setCreating(false)
  }

  if (loading) {
    return <div className="p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
  }

  const currentProject = projectId ? projectById.get(projectId) : null
  const updateProjectOrdner = (pid, pruefOrdner) =>
    setProjects(ps => ps.map(p => p.id === pid ? { ...p, pruefOrdner } : p))

  return (
    <div className="app-page">
      {!standalone && (
        <div className="flex flex-wrap items-end gap-3">
          {onBack && <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Dashboard</button>}
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2"><ScanSearch size={22} className="text-brand-600" /> Prüfstation</h1>
            <p className="text-sm text-gray-500 mt-0.5">{currentProject?.name || 'Projekt'} · Nachträge und Abschlagsrechnungen prüfen</p>
          </div>
          <a className="btn-ghost ml-auto text-xs" href="/pruefstation">Alle Projekte</a>
        </div>
      )}
      {hinweis && (
        <p className="text-sm text-brand-800 bg-sky/20 border border-sky px-4 py-2 flex items-center gap-2">
          <FolderOpen size={14} /> {hinweis}
          <button className="ml-auto text-gray-400" onClick={() => setHinweis('')}><X size={13} /></button>
        </p>
      )}
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
          {currentProject && (
            <ProjektOrdner project={currentProject}
              onSaved={(o) => updateProjectOrdner(currentProject.id, o)}
              onSavedWissen={(w) => setProjects(ps => ps.map(p => p.id === currentProject.id ? { ...p, pruefWissen: w } : p))} />
          )}
          <div className="flex gap-2">
            {fixedProjectId ? <div className="flex-1" /> :
            <select className="select flex-1" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">Alle Projekte</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>}
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
          fixed={!!fixedProjectId}
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}

function NeuerVorgang({ projects, defaultProjectId, fixed, onClose, onCreate }) {
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
        {!fixed && <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-0.5">Projekt</span>
          <select className="select" value={projectId} onChange={e => setProjectId(e.target.value)} required>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>}
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
        {(() => {
          const base = projects.find(p => p.id === projectId)?.pruefOrdner?.[art]
          return base
            ? <p className="text-xs text-gray-500">Ordner wird angelegt bzw. verknüpft: <span className="text-night">{base}/{suggestFolderName({ art, nummer, titel })}</span></p>
            : <p className="text-xs text-gray-500">Für diese Art ist im Projekt kein Prüfordner festgelegt – den NAS-Ordner verknüpfst du im nächsten Schritt.</p>
        })()}
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={!projectId || busy}>{busy ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Anlegen</button>
        </div>
      </form>
    </div>
  )
}

// Prüfordner des Projekts je Art – Basis für neue Vorgangsordner
const ORDNER_ARTEN = [
  ['nachtrag',  'Nachträge'],
  ['rechnung',  'Abschlagsrechnungen'],
  ['sonstiges', 'Sonstige Prüfungen'],
]

function ProjektOrdner({ project, onSaved, onSavedWissen }) {
  const ordner = project.pruefOrdner || {}
  const unset  = ORDNER_ARTEN.filter(([k]) => !ordner[k]).length
  const [open,   setOpen]   = useState(unset === ORDNER_ARTEN.length && project.canManage)
  const [picker, setPicker] = useState(null)    // Art, für die gewählt wird
  const [err,    setErr]    = useState(null)
  const [saved,  setSaved]  = useState(false)

  const wissen = project.pruefWissen || []
  const saveWissen = async (liste) => {
    setPicker(null); setErr(null)
    try {
      const r = await api(`/api/pruefstation/projects/${project.id}/wissen`, { method: 'PUT', body: { ordner: liste } })
      onSavedWissen?.(r.pruefWissen)
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } catch (e) { setErr(e.message) }
  }

  const save = async (art, path) => {
    setPicker(null); setErr(null)
    try {
      const r = await api(`/api/pruefstation/projects/${project.id}/ordner`, { method: 'PUT', body: { ...ordner, [art]: path } })
      onSaved(r.pruefOrdner)
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="card">
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setOpen(o => !o)}>
        <Settings2 size={14} className="text-brand-600" />
        <span className="font-medium text-night flex-1">Prüfordner des Projekts</span>
        {saved && <Check size={13} className="text-green-600" />}
        {unset > 0 && <span className="text-xs text-amber-600">{unset === ORDNER_ARTEN.length ? 'nicht festgelegt' : `${unset} offen`}</span>}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-500">Neue Vorgänge bekommen hier automatisch ihren Ordner (z. B. „Nachtrag 008"). Einzelne Vorgänge lassen sich weiterhin frei verknüpfen.</p>
          {ORDNER_ARTEN.map(([k, label]) => (
            <div key={k} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-600">{label}</span>
                {project.canManage && (
                  <span className="flex gap-1">
                    <button className="text-brand-600 hover:underline flex items-center gap-0.5" onClick={() => setPicker(k)}><Link2 size={11} /> {ordner[k] ? 'ändern' : 'festlegen'}</button>
                    {ordner[k] && <button className="text-gray-400 hover:text-red-600" title="Entfernen" onClick={() => save(k, '')}><X size={11} /></button>}
                  </span>
                )}
              </div>
              <p className={`truncate ${ordner[k] ? 'text-night' : 'text-gray-400 italic'}`} title={ordner[k] || ''}>{ordner[k] || 'nicht festgelegt'}</p>
            </div>
          ))}
          <div className="text-xs pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-600">Projektwissen für die Prüfung</span>
              {project.canManage && (
                <button className="text-brand-600 hover:underline flex items-center gap-0.5" onClick={() => setPicker('__wissen')}><Link2 size={11} /> Ordner hinzufügen</button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mb-1">LV, Schnittstellenliste, Bieterantworten, Klärungsliste, Schriftverkehr – geht bei jeder Prüfung mit (inkl. Unterordner). Protokolle und Notizen aus dem Protokolltool kommen automatisch dazu.</p>
            {wissen.length === 0 && <p className="text-gray-400 italic">noch kein Ordner</p>}
            {wissen.map(w => (
              <div key={w} className="flex items-center gap-1">
                <p className="truncate flex-1 text-night" title={w}>{w}</p>
                {project.canManage && <button className="text-gray-400 hover:text-red-600" title="Entfernen" onClick={() => saveWissen(wissen.filter(x => x !== w))}><X size={11} /></button>}
              </div>
            ))}
          </div>
          {!project.canManage && <p className="text-[11px] text-gray-400">Festlegen können Projekt-Administratoren.</p>}
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
      )}
      {picker && (
        <FolderPicker
          startPath={picker === '__wissen' ? (project.fsPath || '') : (ordner[picker] || ordner.nachtrag || '')}
          projectPath={project.fsPath}
          suggestedName=""
          onSelect={(p) => (picker === '__wissen' ? saveWissen([...wissen, p]) : save(picker, p))}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
