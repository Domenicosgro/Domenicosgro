import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Plus, Camera, Trash2, Pencil, X, Loader, AlertCircle, Mail,
         ArrowRight, MapPin, AlertOctagon } from 'lucide-react'
import { formatDate, uid } from '../utils'
import { savePhoto, loadPhotoUrl, removePhoto } from '../photoUtils'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

const STATUS = {
  offen:      { label: 'Offen',       badge: 'bg-red-100 text-red-700 border-red-300' },
  in_arbeit:  { label: 'In Arbeit',   badge: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  behoben:    { label: 'Behoben',     badge: 'bg-blue-100 text-blue-700 border-blue-300' },
  abgenommen: { label: 'Abgenommen',  badge: 'bg-green-100 text-green-700 border-green-300' },
}
const STATUS_ORDER = ['offen', 'in_arbeit', 'behoben', 'abgenommen']
const PRIO = {
  hoch: { label: 'Hoch', color: 'text-red-600' }, mittel: { label: 'Mittel', color: 'text-yellow-600' }, niedrig: { label: 'Niedrig', color: 'text-gray-400' },
}

function Thumb({ photoId, onRemove, size = 'w-16 h-16' }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { loadPhotoUrl(photoId).then(setUrl) }, [photoId])
  return (
    <div className={`relative ${size} flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden group`}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => window.open(url, '_blank')} />
           : <Loader size={12} className="animate-spin text-gray-300 absolute inset-0 m-auto" />}
      {onRemove && (
        <button onClick={onRemove} className="absolute top-0 right-0 bg-black/50 text-white p-0.5 opacity-0 group-hover:opacity-100 no-print">
          <X size={10} />
        </button>
      )}
    </div>
  )
}

function DefectForm({ defect, contacts, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:       defect?.title       || '',
    description: defect?.description || '',
    location:    defect?.location    || '',
    responsible: defect?.responsible || '',
    dueDate:     defect?.dueDate     || '',
    priority:    defect?.priority    || 'mittel',
    status:      defect?.status      || 'offen',
  })
  const [photos,    setPhotos]    = useState(defect?.photos || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const addPhotos = async (files) => {
    setUploading(true)
    try {
      for (const file of Array.from(files || [])) {
        const p = await savePhoto(file)
        setPhotos(prev => [...prev, p])
      }
    } finally { setUploading(false) }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-900">{defect ? `Mangel Nr. ${defect.no ?? ''} bearbeiten` : 'Neuer Mangel'}</h3>
        <button className="btn-ghost p-1" onClick={onCancel}><X size={15} /></button>
      </div>

      <input className="input" placeholder="Mangel-Bezeichnung *" value={form.title} onChange={set('title')} autoFocus />
      <textarea className="input resize-y" rows={2} placeholder="Beschreibung des Mangels" value={form.description} onChange={set('description')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ort / Bauteil</label>
          <input className="input" placeholder="z. B. EG, Achse B3, Fensteranschluss" value={form.location} onChange={set('location')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Verantwortliche Firma / Person</label>
          <select className="select w-full" value={form.responsible} onChange={set('responsible')}>
            <option value="">– auswählen –</option>
            {contacts.map(c => (
              <option key={c.id || c.name} value={c.name ? (c.company ? `${c.name} (${c.company})` : c.name) : c.company}>
                {c.name}{c.company ? ` (${c.company})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Frist zur Behebung</label>
          <input type="date" className="input" value={form.dueDate} onChange={set('dueDate')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priorität</label>
            <select className="select w-full" value={form.priority} onChange={set('priority')}>
              {Object.entries(PRIO).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
            </select>
          </div>
          {defect && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select className="select w-full" value={form.status} onChange={set('status')}>
                {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Fotos */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Foto-Dokumentation</label>
        <div className="flex gap-2 flex-wrap items-center">
          {photos.map((p, i) => (
            <Thumb key={p.id} photoId={p.id}
              onRemove={() => { removePhoto(p.id); setPhotos(prev => prev.filter((_, j) => j !== i)) }} />
          ))}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          <button className="w-16 h-16 border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-500 flex flex-col items-center justify-center gap-0.5"
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />}
            <span className="text-[9px]">Foto</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button className="btn-secondary" onClick={onCancel}>Abbrechen</button>
        <button className="btn-primary" disabled={!form.title.trim()} onClick={() => onSave({ ...form, photos })}>Speichern</button>
      </div>
    </div>
  )
}

export default function MaengelView({ project, protocols = [], serverUser, onBack, onAddToProtocol }) {
  const [defects, setDefects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [editing, setEditing] = useState(null)     // defect | 'new' | null
  const [filter,  setFilter]  = useState('alle')
  const [protoPick, setProtoPick] = useState(null) // defect-id für Protokoll-Auswahl
  const lsKey = `kp_defects_${project.id}`

  const contacts = project.contacts || []
  const todayISO = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isServer) {
        const res = await fetch(`/api/projects/${project.id}/defects`, { headers: authHeaders() })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        setDefects(await res.json())
      } else {
        setDefects(JSON.parse(localStorage.getItem(lsKey) || '[]'))
      }
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`) }
    finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { load() }, [load])

  const persistLocal = (next) => { localStorage.setItem(lsKey, JSON.stringify(next)); setDefects(next) }
  const nextNo = () => defects.reduce((m, d) => Math.max(m, d.no || 0), 0) + 1

  const save = async (form) => {
    setError(null)
    try {
      if (editing !== 'new' && editing) {
        if (isServer) {
          const { _version, _updatedAt, ...data } = editing
          const res = await fetch(`/api/projects/${project.id}/defects/${editing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ data: { ...data, ...form }, version: _version }),
          })
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        } else {
          persistLocal(defects.map(d => d.id === editing.id ? { ...d, ...form, updatedAt: new Date().toISOString() } : d))
        }
      } else {
        const payload = { ...form, no: nextNo() }
        if (isServer) {
          const res = await fetch(`/api/projects/${project.id}/defects`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        } else {
          persistLocal([{ ...payload, id: uid(), createdAt: new Date().toISOString() }, ...defects])
        }
      }
      setEditing(null)
      if (isServer) load()
    } catch (e) { setError(`Speichern fehlgeschlagen: ${e.message}`) }
  }

  const cycleStatus = async (defect) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(defect.status) + 1) % STATUS_ORDER.length]
    if (isServer) {
      const { _version, _updatedAt, ...data } = defect
      setDefects(prev => prev.map(d => d.id === defect.id ? { ...d, status: next, _version: (_version || 0) + 1 } : d))
      try {
        const res = await fetch(`/api/projects/${project.id}/defects/${defect.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ data: { ...data, status: next }, version: _version }),
        })
        if (!res.ok) load()
      } catch { load() }
    } else {
      persistLocal(defects.map(d => d.id === defect.id ? { ...d, status: next } : d))
    }
  }

  const remove = async (defect) => {
    if (!window.confirm(`Mangel „${defect.title}" wirklich löschen?`)) return
    try {
      for (const p of (defect.photos || [])) removePhoto(p.id)
      if (isServer) {
        const res = await fetch(`/api/projects/${project.id}/defects/${defect.id}`, { method: 'DELETE', headers: authHeaders() })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        load()
      } else {
        persistLocal(defects.filter(d => d.id !== defect.id))
      }
    } catch (e) { setError(`Löschen fehlgeschlagen: ${e.message}`) }
  }

  // Mängelanzeige per E-Mail (mailto – öffnet den Mail-Client mit Vorlage)
  const mailDefect = (defect) => {
    const contact = contacts.find(c => {
      const full = c.name ? (c.company ? `${c.name} (${c.company})` : c.name) : c.company
      return full === defect.responsible
    })
    const to = contact?.email || ''
    const subject = `Mängelanzeige Nr. ${defect.no} – ${project.name}`
    const body = [
      `Sehr geehrte Damen und Herren,`, '',
      `hiermit zeigen wir folgenden Mangel im Projekt ${project.name} an:`, '',
      `Mangel Nr. ${defect.no}: ${defect.title}`,
      defect.location ? `Ort/Bauteil: ${defect.location}` : '',
      defect.description ? `Beschreibung: ${defect.description}` : '',
      defect.dueDate ? `Frist zur Behebung: ${formatDate(defect.dueDate)}` : '',
      '', 'Wir bitten um fristgerechte Behebung und Rückmeldung.', '', 'GHBA',
    ].filter(l => l !== '').join('\n')
    window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
  }

  const filtered = filter === 'alle' ? defects : defects.filter(d => d.status === filter)
  const sorted   = [...filtered].sort((a, b) => (a.no || 0) - (b.no || 0))
  const openCnt  = defects.filter(d => d.status === 'offen' || d.status === 'in_arbeit').length

  return (
    <div className="app-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button className="btn-secondary no-print" onClick={onBack}><ArrowLeft size={16} /> Dashboard</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <AlertOctagon size={22} className="text-brand-600" /> Mängelmanagement
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {project.name} · {defects.length} M{defects.length === 1 ? 'angel' : 'ängel'}
              {openCnt > 0 && <span className="badge-yellow ml-2">{openCnt} offen</span>}
            </p>
          </div>
        </div>
        {!editing && (
          <button className="btn-primary no-print" onClick={() => setEditing('new')}><Plus size={15} /> Mangel erfassen</button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      {/* Statusfilter */}
      <div className="flex gap-1.5 flex-wrap no-print">
        {[['alle', 'Alle'], ...Object.entries(STATUS).map(([v, s]) => [v, s.label])].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`text-xs px-3 py-1.5 border transition-colors ${filter === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {l}{v !== 'alle' && <span className="ml-1 opacity-60">{defects.filter(d => d.status === v).length}</span>}
          </button>
        ))}
      </div>

      {editing && (
        <DefectForm defect={editing === 'new' ? null : editing} contacts={contacts} onSave={save} onCancel={() => setEditing(null)} />
      )}

      {loading ? (
        <div className="card p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
      ) : sorted.length === 0 && !editing ? (
        <div className="card p-12 text-center text-gray-400">
          <AlertOctagon size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">
            {filter === 'alle' ? 'Keine Mängel erfasst.' : `Keine Mängel mit Status „${STATUS[filter]?.label}".`}
          </p>
          <p className="text-xs mt-1">Mängel mit Foto direkt von der Baustelle erfassen – auch mobil.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(d => {
            const st  = STATUS[d.status] || STATUS.offen
            const pr  = PRIO[d.priority] || PRIO.mittel
            const ovr = d.dueDate && (d.status === 'offen' || d.status === 'in_arbeit') && d.dueDate < todayISO
            return (
              <div key={d.id} className={`card p-4 border-l-4 ${ovr ? 'border-l-red-500' : d.status === 'abgenommen' ? 'border-l-green-400' : 'border-l-amber-400'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-night">
                      <span className="text-gray-400 mr-1.5">Nr. {d.no}</span>{d.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
                      <button onClick={() => cycleStatus(d)} title="Status wechseln"
                        className={`px-2 py-0.5 border ${st.badge} cursor-pointer`}>{st.label}</button>
                      <span className={`font-medium ${pr.color}`}>{pr.label}</span>
                      {d.location && <span className="text-gray-500 flex items-center gap-0.5"><MapPin size={11} /> {d.location}</span>}
                      {d.responsible && <span className="text-gray-500">{d.responsible}</span>}
                      {d.dueDate && (
                        <span className={ovr ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                          Frist: {formatDate(d.dueDate)}{ovr && ' ⚠'}
                        </span>
                      )}
                    </div>
                    {d.description && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{d.description}</p>}
                    {(d.photos || []).length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {d.photos.map(p => <Thumb key={p.id} photoId={p.id} />)}
                      </div>
                    )}
                    {protoPick === d.id && (
                      <select autoFocus defaultValue="" onBlur={() => setProtoPick(null)}
                        onChange={e => {
                          if (e.target.value && onAddToProtocol) onAddToProtocol(e.target.value, d)
                          setProtoPick(null)
                        }}
                        className="select text-xs mt-2 max-w-xs">
                        <option value="" disabled>Protokoll auswählen…</option>
                        {protocols.map(p => (
                          <option key={p.id} value={p.id}>{p.date ? formatDate(p.date) : 'Ohne Datum'} – {p.meetingType || 'Protokoll'}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0 no-print">
                    {onAddToProtocol && protocols.length > 0 && (
                      <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600" title="Als Protokoll-Aufgabe übernehmen"
                        onClick={() => setProtoPick(protoPick === d.id ? null : d.id)}><ArrowRight size={14} /></button>
                    )}
                    <button className="btn-ghost p-1.5 text-gray-400 hover:text-green-600" title="Mängelanzeige per E-Mail"
                      onClick={() => mailDefect(d)}><Mail size={14} /></button>
                    <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600" title="Bearbeiten" onClick={() => setEditing(d)}><Pencil size={14} /></button>
                    <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600" title="Löschen" onClick={() => remove(d)}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
