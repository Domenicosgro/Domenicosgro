import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Plus, Camera, Trash2, Pencil, X, Loader, AlertCircle, Printer,
         Sun, Cloud, CloudRain, Snowflake, BookOpen, CloudOff, RefreshCw, CloudSun } from 'lucide-react'
import { formatDate, uid } from '../utils'
import { compressToBase64, savePhotoBase64, loadPhotoUrl, removePhoto } from '../photoUtils'
import { outboxAdd, outboxList, outboxRemove } from '../offlineStore'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

const WEATHER = [
  { value: 'sonnig',    label: 'Sonnig',    Icon: Sun },
  { value: 'bewoelkt',  label: 'Bewölkt',   Icon: Cloud },
  { value: 'regen',     label: 'Regen',     Icon: CloudRain },
  { value: 'schnee',    label: 'Schnee/Frost', Icon: Snowflake },
]
const weatherLabel = (v) => WEATHER.find(w => w.value === v)?.label || v || '–'

// Foto-Miniatur (lädt asynchron aus dem Anhang-Speicher)
function PhotoThumb({ photoId, onRemove, size = 'w-20 h-20' }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { loadPhotoUrl(photoId).then(setUrl) }, [photoId])
  return (
    <div className={`relative ${size} flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden group`}>
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => url && window.open(url, '_blank')} />
        : <Loader size={14} className="animate-spin text-gray-300 absolute inset-0 m-auto" />}
      {onRemove && (
        <button onClick={onRemove}
          className="absolute top-0 right-0 bg-black/50 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print">
          <X size={11} />
        </button>
      )}
    </div>
  )
}

function EntryForm({ entry, onSave, onCancel, projectId }) {
  const [form, setForm] = useState({
    date:        entry?.date        || new Date().toISOString().slice(0, 10),
    // Tageshälfte: bestimmt auch den Zeitraum der automatischen Wetterabfrage
    daytime:     entry?.daytime     || (new Date().getHours() < 12 ? 'vormittag' : 'nachmittag'),
    weather:     entry?.weather     || 'sonnig',
    tempMin:     entry?.tempMin     ?? '',
    tempMax:     entry?.tempMax     ?? '',
    firms:       entry?.firms       || '',
    workDone:    entry?.workDone    || '',
    remarks:     entry?.remarks     || '',
  })
  const [wxBusy, setWxBusy] = useState(false)
  const [wxInfo, setWxInfo] = useState(null)

  // Wetter vom Projektstandort (Anschrift aus den Projektdaten) für Datum + Tageshälfte
  const fetchWeather = async () => {
    if (!isServer || !projectId) { setWxInfo({ err: 'Wetterabruf nur im Server-Modus verfügbar.' }); return }
    setWxBusy(true); setWxInfo(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/weather?date=${form.date}&half=${form.daytime}`,
        { headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setWxInfo({ err: data.error || `Fehler ${res.status}` }); return }
      setForm(f => ({ ...f, weather: data.weather, tempMin: data.tempMin, tempMax: data.tempMax }))
      setWxInfo({ ok: `Übernommen für ${data.location} (${data.half === 'vormittag' ? 'Vormittag' : 'Nachmittag'})` })
    } catch (e) {
      setWxInfo({ err: `Nicht abrufbar: ${e.message}` })
    } finally { setWxBusy(false) }
  }
  const [photos,    setPhotos]    = useState(entry?.photos || [])   // bereits abgelegte Fotos {id,name}
  const [newPhotos, setNewPhotos] = useState([])                    // frisch aufgenommene {base64,name} – Ablage erst beim Speichern
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState(null)
  const fileRef = useRef(null)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const addPhotos = async (files) => {
    setUploading(true)
    try {
      for (const file of Array.from(files || [])) {
        const base64 = await compressToBase64(file)
        setNewPhotos(prev => [...prev, { base64, name: file.name || 'foto.jpg' }])
      }
    } catch (e) { setError(`Foto konnte nicht verarbeitet werden: ${e.message}`) }
    finally { setUploading(false) }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-900">{entry ? 'Eintrag bearbeiten' : 'Neuer Tagebucheintrag'}</h3>
        <button className="btn-ghost p-1" onClick={onCancel}><X size={15} /></button>
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Datum</label>
          <input type="date" className="input" value={form.date} onChange={set('date')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tageszeit</label>
          <select className="select w-full" value={form.daytime} onChange={set('daytime')}>
            <option value="vormittag">Vormittag</option>
            <option value="nachmittag">Nachmittag</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Wetter</label>
          <select className="select w-full" value={form.weather} onChange={set('weather')}>
            {WEATHER.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Temp. min (°C)</label>
          <input type="number" className="input" value={form.tempMin} onChange={set('tempMin')} placeholder="z. B. 5" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Temp. max (°C)</label>
          <input type="number" className="input" value={form.tempMax} onChange={set('tempMax')} placeholder="z. B. 18" />
        </div>
      </div>

      {/* Wetter automatisch vom Projektstandort übernehmen */}
      <div className="flex items-center gap-3 flex-wrap -mt-1">
        <button className="btn-secondary btn-sm" onClick={fetchWeather} disabled={wxBusy}>
          {wxBusy ? <Loader size={13} className="animate-spin" /> : <CloudSun size={13} />}
          {wxBusy ? 'Wird abgerufen…' : 'Wetter vom Standort übernehmen'}
        </button>
        {wxInfo?.ok  && <span className="text-xs text-green-700">{wxInfo.ok}</span>}
        {wxInfo?.err && <span className="text-xs text-amber-700">{wxInfo.err}</span>}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Anwesende Firmen / Personal</label>
        <textarea className="input resize-y" rows={2} value={form.firms} onChange={set('firms')}
          placeholder="z. B. Rohbau Müller GmbH (4 AK), Elektro Schmidt (2 AK)…" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Ausgeführte Arbeiten</label>
        <textarea className="input resize-y" rows={3} value={form.workDone} onChange={set('workDone')}
          placeholder="Welche Leistungen wurden heute erbracht?" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Besondere Vorkommnisse / Bemerkungen</label>
        <textarea className="input resize-y" rows={2} value={form.remarks} onChange={set('remarks')}
          placeholder="Behinderungen, Anordnungen, Besucher… (optional)" />
      </div>

      {/* Fotos */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Fotos</label>
        <div className="flex gap-2 flex-wrap items-center">
          {photos.map((p, i) => (
            <PhotoThumb key={p.id} photoId={p.id}
              onRemove={() => { removePhoto(p.id); setPhotos(prev => prev.filter((_, j) => j !== i)) }} />
          ))}
          {newPhotos.map((p, i) => (
            <div key={i} className="relative w-20 h-20 flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden group">
              <img src={`data:image/jpeg;base64,${p.base64}`} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setNewPhotos(prev => prev.filter((_, j) => j !== i))}
                className="absolute top-0 right-0 bg-black/50 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={11} />
              </button>
            </div>
          ))}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          <button className="w-20 h-20 border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors flex flex-col items-center justify-center gap-1"
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader size={16} className="animate-spin" /> : <Camera size={16} />}
            <span className="text-[10px]">Foto</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button className="btn-secondary" onClick={onCancel}>Abbrechen</button>
        <button className="btn-primary" onClick={() => onSave({ ...form, photos }, newPhotos)}>Speichern</button>
      </div>
    </div>
  )
}

export default function BautagebuchView({ project, serverUser, logoDataUrl, clientLogoDataUrl, onBack }) {
  const [entries, setEntries] = useState([])
  const [pending, setPending] = useState([])    // Offline-Warteschlange
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [notice,  setNotice]  = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [editing, setEditing] = useState(null)   // entry | 'new' | null
  const lsKey = `kp_diary_${project.id}`

  const loadPending = useCallback(async () => {
    try { setPending(await outboxList('diary', project.id)) } catch {}
  }, [project.id])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isServer) {
        const res = await fetch(`/api/projects/${project.id}/diary`, { headers: authHeaders() })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        setEntries(await res.json())
      } else {
        setEntries(JSON.parse(localStorage.getItem(lsKey) || '[]'))
      }
    } catch (e) {
      // Offline: Service Worker liefert i.d.R. den letzten Stand aus dem Cache;
      // schlägt auch das fehl, bleibt die Liste leer – Erfassen geht trotzdem.
      setNotice('Offline – letzter bekannter Stand. Neue Einträge werden zwischengespeichert.')
    }
    finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { load(); loadPending() }, [load, loadPending])

  // Automatischer Sync-Versuch, sobald der Browser wieder online meldet
  useEffect(() => {
    const h = () => syncOutbox()
    window.addEventListener('online', h)
    return () => window.removeEventListener('online', h)
  })

  const persistLocal = (next) => { localStorage.setItem(lsKey, JSON.stringify(next)); setEntries(next) }

  // Warteschlange an den Server übertragen (Fotos ablegen → Eintrag POSTen)
  const syncOutbox = useCallback(async () => {
    if (!isServer || syncing) return
    const items = await outboxList('diary', project.id)
    if (items.length === 0) return
    setSyncing(true)
    setError(null)
    let synced = 0
    try {
      for (const item of items) {
        const photos = []
        for (const p of (item.pendingPhotos || [])) {
          photos.push(await savePhotoBase64(p.base64, p.name))
        }
        const res = await fetch(`/api/projects/${project.id}/diary`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ ...item.form, photos }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        await outboxRemove(item.id)
        synced++
      }
      setNotice(`${synced} Eintr${synced === 1 ? 'ag' : 'äge'} synchronisiert.`)
      load()
    } catch (e) {
      setError(synced > 0
        ? `${synced} synchronisiert, dann abgebrochen: ${e.message}`
        : `Synchronisierung nicht möglich: ${e.message}`)
    } finally {
      setSyncing(false)
      loadPending()
    }
  }, [project.id, syncing, load, loadPending])

  // Beim Öffnen automatisch versuchen, Wartendes zu übertragen
  useEffect(() => {
    if (isServer && navigator.onLine) {
      outboxList('diary', project.id).then(items => { if (items.length > 0) syncOutbox() }).catch(() => {})
    }
  }, [project.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const queueOffline = async (form, newPhotos) => {
    await outboxAdd({
      id: uid(), kind: 'diary', projectId: project.id,
      form, pendingPhotos: newPhotos,
      queuedAt: new Date().toISOString(),
    })
    setNotice('Offline gespeichert – wird synchronisiert, sobald der Server wieder erreichbar ist.')
    loadPending()
  }

  const save = async (form, newPhotos = []) => {
    setError(null)
    try {
      if (editing !== 'new' && editing) {
        // Bearbeiten (nur online)
        const savedNew = []
        for (const p of newPhotos) savedNew.push(await savePhotoBase64(p.base64, p.name))
        const merged = { ...form, photos: [...(form.photos || []), ...savedNew] }
        if (isServer) {
          const { _version, _updatedAt, ...data } = editing
          const res = await fetch(`/api/projects/${project.id}/diary/${editing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ data: { ...data, ...merged }, version: _version }),
          })
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        } else {
          persistLocal(entries.map(e => e.id === editing.id ? { ...e, ...merged, updatedAt: new Date().toISOString() } : e))
        }
      } else {
        // Neu
        if (isServer) {
          if (!navigator.onLine) { await queueOffline(form, newPhotos); setEditing(null); return }
          try {
            const savedNew = []
            for (const p of newPhotos) savedNew.push(await savePhotoBase64(p.base64, p.name))
            const res = await fetch(`/api/projects/${project.id}/diary`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ ...form, photos: [...(form.photos || []), ...savedNew] }),
            })
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
          } catch (e) {
            // Netzwerkfehler (Server nicht erreichbar) → in die Warteschlange
            if (e instanceof TypeError || /fetch|network/i.test(e.message)) {
              await queueOffline(form, newPhotos); setEditing(null); return
            }
            throw e
          }
        } else {
          const savedNew = []
          for (const p of newPhotos) savedNew.push(await savePhotoBase64(p.base64, p.name))
          persistLocal([{ ...form, photos: [...(form.photos || []), ...savedNew], id: uid(), createdAt: new Date().toISOString() }, ...entries])
        }
      }
      setEditing(null)
      if (isServer) load()
    } catch (e) { setError(`Speichern fehlgeschlagen: ${e.message}`) }
  }

  const remove = async (entry) => {
    if (!window.confirm(`Eintrag vom ${formatDate(entry.date)} wirklich löschen?`)) return
    try {
      for (const p of (entry.photos || [])) removePhoto(p.id)
      if (isServer) {
        const res = await fetch(`/api/projects/${project.id}/diary/${entry.id}`, { method: 'DELETE', headers: authHeaders() })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        load()
      } else {
        persistLocal(entries.filter(e => e.id !== entry.id))
      }
    } catch (e) { setError(`Löschen fehlgeschlagen: ${e.message}`) }
  }

  const sorted = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return (
    <div className="app-page">
      {/* ── Druckkopf: identisch zum Protokoll (Logos links, Titel rechts) ──
          Logos kommen aus dem Projekt (Projekt-Admin-Panel) mit Rückfall auf das
          globale Büro-Logo – dieselbe Quelle wie beim Protokoll. */}
      <div className="hidden print:block mb-4">
        <div className="flex items-end justify-between pb-3 border-b border-black">
          <div className="flex-shrink-0 flex items-end gap-4">
            {logoDataUrl
              ? <img src={logoDataUrl} alt="Büro-Logo" className="h-12 max-w-[150px] object-contain" />
              : <div className="h-12 w-8" />}
            {clientLogoDataUrl && (
              <img src={clientLogoDataUrl} alt="Auftraggeber-Logo" className="h-12 max-w-[150px] object-contain" />
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest">Baudokumentation</div>
            <div className="text-xl font-bold">{project.name}</div>
            {(project.projectData?.bauherr?.city || project.projectData?.bauherr?.street) && (
              <div className="text-sm">
                {[project.projectData?.bauherr?.street,
                  [project.projectData?.bauherr?.zip, project.projectData?.bauherr?.city].filter(Boolean).join(' ')]
                  .filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="text-xs">{entries.length} Eintr{entries.length === 1 ? 'ag' : 'äge'} · Stand {formatDate(new Date().toISOString().slice(0, 10))}</div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 no-print">
        <div className="flex items-end gap-3">
          <button className="btn-secondary no-print" onClick={onBack}><ArrowLeft size={16} /> Dashboard</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <BookOpen size={22} className="text-brand-600" /> Baudokumentation
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{project.name} · {entries.length} Eintr{entries.length === 1 ? 'ag' : 'äge'}</p>
          </div>
        </div>
        <div className="flex gap-2 no-print">
          {sorted.length > 0 && (
            <button className="btn-secondary" onClick={() => window.print()}><Printer size={15} /> Drucken</button>
          )}
          {!editing && (
            <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> Eintrag</button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}
      {notice && (
        <p className="text-sm text-brand-700 bg-brand-50 border border-brand-200 px-4 py-2 flex items-center gap-2">
          <CloudOff size={14} /> {notice}
          <button className="ml-auto text-brand-400" onClick={() => setNotice(null)}><X size={13} /></button>
        </p>
      )}

      {/* Offline-Warteschlange */}
      {pending.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 px-4 py-2.5 no-print">
          <CloudOff size={15} className="text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 flex-1">
            {pending.length} Eintr{pending.length === 1 ? 'ag wartet' : 'äge warten'} auf Synchronisierung mit dem Server.
          </span>
          <button className="btn-secondary text-xs" onClick={syncOutbox} disabled={syncing}>
            {syncing ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {syncing ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
          </button>
        </div>
      )}

      {editing && (
        <EntryForm entry={editing === 'new' ? null : editing} projectId={project.id}
          onSave={save} onCancel={() => setEditing(null)} />
      )}

      {/* Wartende (offline erfasste) Einträge */}
      {pending.map(item => (
        <div key={item.id} className="card p-4 border-l-4 border-l-amber-400 bg-amber-50/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-night flex items-center gap-2">
                {formatDate(item.form.date)}
                <span className="badge text-[10px] bg-amber-100 text-amber-700 border border-amber-300 flex items-center gap-1">
                  <CloudOff size={9} /> wartet auf Synchronisierung
                </span>
              </p>
              {item.form.workDone && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.form.workDone}</p>}
              {(item.pendingPhotos || []).length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {item.pendingPhotos.map((p, i) => (
                    <img key={i} src={`data:image/jpeg;base64,${p.base64}`} alt="" className="w-16 h-16 object-cover border border-gray-200" />
                  ))}
                </div>
              )}
            </div>
            <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600 no-print" title="Wartenden Eintrag verwerfen"
              onClick={async () => {
                if (confirm('Diesen noch nicht synchronisierten Eintrag verwerfen?')) { await outboxRemove(item.id); loadPending() }
              }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {loading ? (
        <div className="card p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
      ) : sorted.length === 0 && pending.length === 0 && !editing ? (
        <div className="card p-12 text-center text-gray-400">
          <BookOpen size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">Noch keine Tagebucheinträge.</p>
          <p className="text-xs mt-1">Dokumentiere Wetter, Personal und Baufortschritt – auch mobil mit Foto direkt von der Baustelle.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(entry => (
            <div key={entry.id} className="card p-4 protocol-item">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-night">
                    {formatDate(entry.date)}
                    {entry.daytime && (
                      <span className="text-xs font-normal text-gray-500 ml-2">
                        {entry.daytime === 'nachmittag' ? 'Nachmittag' : 'Vormittag'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {weatherLabel(entry.weather)}
                    {(entry.tempMin !== '' && entry.tempMin != null) || (entry.tempMax !== '' && entry.tempMax != null)
                      ? ` · ${entry.tempMin ?? '–'}° bis ${entry.tempMax ?? '–'}°C` : ''}
                    {entry.createdBy ? ` · erstellt von ${entry.createdBy}` : ''}
                  </p>
                </div>
                <div className="flex gap-1 no-print">
                  <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600" title="Bearbeiten" onClick={() => setEditing(entry)}><Pencil size={14} /></button>
                  <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600" title="Löschen" onClick={() => remove(entry)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
                {entry.firms && (
                  <div><p className="text-xs font-medium text-gray-400 uppercase">Firmen / Personal</p><p className="text-gray-700 whitespace-pre-wrap">{entry.firms}</p></div>
                )}
                {entry.workDone && (
                  <div><p className="text-xs font-medium text-gray-400 uppercase">Ausgeführte Arbeiten</p><p className="text-gray-700 whitespace-pre-wrap">{entry.workDone}</p></div>
                )}
                {entry.remarks && (
                  <div className="sm:col-span-2"><p className="text-xs font-medium text-gray-400 uppercase">Bemerkungen</p><p className="text-gray-700 whitespace-pre-wrap">{entry.remarks}</p></div>
                )}
              </div>
              {(entry.photos || []).length > 0 && (
                <div className="flex gap-2 flex-wrap mt-3">
                  {entry.photos.map(p => <PhotoThumb key={p.id} photoId={p.id} size="w-24 h-24" />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
