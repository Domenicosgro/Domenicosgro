import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeft, Plus, Camera, Trash2, Pencil, X, Loader, AlertCircle, Printer,
         Sun, Cloud, CloudRain, Snowflake, BookOpen, CloudOff, RefreshCw, CloudSun,
         Building2, MapPin, Mail, Lock, Unlock, ChevronDown, ChevronRight, Send, CheckCircle2 } from 'lucide-react'
import { formatDate, uid, emptyContact, diaryConfigFor, distributionFor } from '../utils'
import { compressToBase64, savePhotoBase64, loadPhotoUrl, removePhoto } from '../photoUtils'
import { outboxAdd, outboxList, outboxRemove } from '../offlineStore'
import ContactAutocomplete from './ContactAutocomplete'
import RichTextEditor, { toHtml, stripHtml } from './RichTextEditor'
import PrintSheet from './PrintSheet'
import DiaryEmailModal from './DiaryEmailModal'
import { collectPrintHtml, MAIL_IMAGE_BUDGET } from '../printHtml'

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
const halfLabel    = (v) => (v === 'nachmittag' ? 'Nachmittag' : 'Vormittag')

// ── Firmen aus der Projektdatenbank ──────────────────────────────────────────
// Die Firmen werden aus den Projektkontakten abgeleitet (je Firma ein Eintrag).
// Ausführende Firmen stehen vorn – sie sind im Baustellenalltag die Regel.
const CAT_RANK = { ausfuehrend: 0, planer: 1, auftraggeber: 2, nutzer: 3 }

function firmsOfProject(project) {
  const map = new Map()
  for (const c of (project?.contacts ?? [])) {
    const company = (c.company || '').trim()
    if (!company) continue
    const key  = company.toLowerCase()
    const rank = CAT_RANK[c.category] ?? 9
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { id: c.id || key, name: '', company, gewerk: (c.gewerk || '').trim(), category: c.category || '', rank })
    } else {
      if (rank < prev.rank) { prev.rank = rank; prev.category = c.category || prev.category }
      if (!prev.gewerk && c.gewerk) prev.gewerk = c.gewerk.trim()
    }
  }
  return [...map.values()].sort((a, b) => a.rank - b.rank || a.company.localeCompare(b.company, 'de'))
}

const emptyFirmRow = () => ({ id: uid(), company: '', gewerk: '', workers: '', work: '' })

// Klartext-Fassung der Firmenzeilen – hält das bisherige Feld `firms` aktuell,
// damit Bestandsdaten, Ausdruck und Export unverändert weiterlaufen.
const firmsToText = (list) => (list || [])
  .filter(f => (f.company || '').trim())
  .map(f => {
    const meta = [f.gewerk, f.workers !== '' && f.workers != null ? `${f.workers} AK` : '']
      .filter(Boolean).join(', ')
    return `${f.company.trim()}${meta ? ` (${meta})` : ''}${f.work ? ` – ${f.work}` : ''}`
  })
  .join('\n')

// Fotos werden zweimal gebraucht (Miniatur im Eintrag + Tafel im Anhang) –
// der Anhang-Speicher wird deshalb nur einmal je Foto gelesen.
const photoUrlCache = new Map()
const cachedPhotoUrl = (id) => {
  if (!photoUrlCache.has(id)) photoUrlCache.set(id, loadPhotoUrl(id))
  return photoUrlCache.get(id)
}

// Foto-Miniatur (lädt asynchron aus dem Anhang-Speicher)
function PhotoThumb({ photoId, onRemove, no, size = 'w-20 h-20' }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { cachedPhotoUrl(photoId).then(setUrl) }, [photoId])
  return (
    <div className={`relative ${size} flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden group`}>
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => url && window.open(url, '_blank')} />
        : <Loader size={14} className="animate-spin text-gray-300 absolute inset-0 m-auto" />}
      {no != null && (
        <span className="absolute bottom-0 left-0 bg-black/60 text-white text-[9px] px-1 leading-4">{no}</span>
      )}
      {onRemove && (
        <button onClick={onRemove}
          className="absolute top-0 right-0 bg-black/50 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print">
          <X size={11} />
        </button>
      )}
    </div>
  )
}

// Foto-Tafel im Anhang: großes Bild mit Bildunterschrift (nur im Ausdruck/PDF).
// Eigene Bildunterschrift geht vor; ohne sie beschriftet der Anhang automatisch.
function PhotoPlate({ photo, no, entry }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { cachedPhotoUrl(photo.id).then(setUrl) }, [photo.id])
  const caption = (photo.caption || '').trim()
    || (entry.workDone ? stripHtml(toHtml(entry.workDone)).split('\n')[0].trim().slice(0, 90) : '')
  return (
    <figure className="diary-plate">
      {url
        ? <img src={url} alt="" className="w-full object-contain border border-gray-300" style={{ maxHeight: '78mm' }} />
        : <div className="w-full border border-gray-300" style={{ height: '40mm' }} />}
      <figcaption className="diary-caption mt-1">
        <span className="font-semibold">Foto {no}</span>
        {' · '}{formatDate(entry.date)}{entry.daytime ? `, ${halfLabel(entry.daytime)}` : ''}
        {caption ? ` · ${caption}` : ''}
      </figcaption>
    </figure>
  )
}

// Eine Berichtszeile: Beschriftung links, Inhalt rechts. Leere Angaben werden
// mit "–" ausgewiesen, damit im Bericht erkennbar bleibt, dass zu diesem Punkt
// nichts zu vermerken war (und nicht etwa die Eintragung vergessen wurde).
// Textangaben sind formatiert (RichText wie im Protokoll); Bestandsdaten in
// Klartext werden beim Anzeigen in Absätze überführt.
function DiaryField({ label, note, children }) {
  const isText = typeof children === 'string'
  const empty = children == null || children === false
    || (isText && !stripHtml(toHtml(children)).trim())
  return (
    <tr>
      <th className="diary-label">
        {label}
        {note ? <span className="diary-note"> ({note})</span> : null}:
      </th>
      <td className="diary-value">
        {empty
          ? <span className="text-gray-400">–</span>
          : (isText
              ? <div className="rich-text" dangerouslySetInnerHTML={{ __html: toHtml(children) }} />
              : children)}
      </td>
    </tr>
  )
}

function EntryForm({ entry, onSave, onCancel, projectId, firmOptions = [], onAddFirmToProject,
                     lastProgress = '', cfg = {}, contacts = [] }) {
  const [form, setForm] = useState({
    // Gesamt-Baufortschritt in % – neue Einträge starten beim zuletzt erfassten Wert
    progress:    entry?.progress    ?? lastProgress,
    // Bausteine je Projekt (Projekt-Admin): Behinderungen, Abnahmen/Prüfungen
    obstrFrom:   entry?.obstrFrom   || '',
    obstrTo:     entry?.obstrTo     || '',
    obstructions: toHtml(entry?.obstructions || ''),
    inspections: toHtml(entry?.inspections || ''),
    inspectedBy: entry?.inspectedBy || '',
    date:        entry?.date        || new Date().toISOString().slice(0, 10),
    // Tageshälfte: bestimmt auch den Zeitraum der automatischen Wetterabfrage
    daytime:     entry?.daytime     || (new Date().getHours() < 12 ? 'vormittag' : 'nachmittag'),
    weather:     entry?.weather     || 'sonnig',
    tempMin:     entry?.tempMin     ?? '',
    tempMax:     entry?.tempMax     ?? '',
    // Datum/Ort, für die die Wetterwerte gelten – hält die Werte am Begehungstag fest
    weatherDate:     entry?.weatherDate     || '',
    weatherLocation: entry?.weatherLocation || '',
    workDone:    toHtml(entry?.workDone    || ''),
    remarks:     toHtml(entry?.remarks     || ''),
    special:     toHtml(entry?.special     || ''),
  })
  const [wxBusy, setWxBusy] = useState(false)
  const [wxInfo, setWxInfo] = useState(null)

  // ── Firmen (aus der Projektdatenbank oder als Freitext) ───────────────────
  const [firmList, setFirmList] = useState(() => {
    if (Array.isArray(entry?.firmList) && entry.firmList.length) return entry.firmList
    // Bestandsdaten: bisheriges Textfeld zeilenweise in Zeilen überführen
    return (entry?.firms || '').split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => ({ ...emptyFirmRow(), company: l }))
  })
  const knownFirm = useCallback(
    (name) => firmOptions.find(f => f.company.toLowerCase() === (name || '').trim().toLowerCase()) || null,
    [firmOptions])

  const setFirm = (id, patch) => setFirmList(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r))
  const pickFirm = (id, value) => {
    const hit = knownFirm(value)
    setFirm(id, hit ? { company: hit.company, gewerk: hit.gewerk || '' } : { company: value })
  }

  // Wetter vom Projektstandort (Anschrift aus den Projektdaten) für Datum + Tageshälfte
  const fetchWeather = useCallback(async ({ auto = false } = {}) => {
    if (!isServer || !projectId) {
      if (!auto) setWxInfo({ err: 'Wetterabruf nur im Server-Modus verfügbar.' })
      return
    }
    setWxBusy(true); setWxInfo(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/weather?date=${form.date}&half=${form.daytime}`,
        { headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setWxInfo({ err: data.error || `Fehler ${res.status}` }); return }
      setForm(f => ({
        ...f,
        weather: data.weather, tempMin: data.tempMin, tempMax: data.tempMax,
        weatherDate: data.date || f.date, weatherLocation: data.location || '',
      }))
      setWxInfo({ ok: `${formatDate(data.date || form.date)}, ${halfLabel(data.half)} · ${data.location}` })
    } catch (e) {
      setWxInfo({ err: `Nicht abrufbar: ${e.message}` })
    } finally { setWxBusy(false) }
  }, [projectId, form.date, form.daytime])

  // Das Wetter gehört zum Datum der Begehung: bei jeder Änderung von Datum oder
  // Tageszeit wird es neu abgerufen. Bestehende Einträge behalten beim Öffnen
  // ihre gespeicherten Werte – erst eine Änderung löst den Abruf aus.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      if (entry) return
    }
    const t = setTimeout(() => fetchWeather({ auto: true }), 350)
    return () => clearTimeout(t)
  }, [form.date, form.daytime])   // eslint-disable-line react-hooks/exhaustive-deps
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
        setNewPhotos(prev => [...prev, { base64, name: file.name || 'foto.jpg', caption: '' }])
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

      {/* Wetter: gilt für Datum + Tageszeit der Begehung, wird bei deren
          Änderung automatisch neu geholt; Button für den erneuten Abruf. */}
      <div className="flex items-center gap-3 flex-wrap -mt-1">
        <button className="btn-secondary btn-sm" onClick={() => fetchWeather()} disabled={wxBusy}>
          {wxBusy ? <Loader size={13} className="animate-spin" /> : <CloudSun size={13} />}
          {wxBusy ? 'Wird abgerufen…' : 'Wetter erneut abrufen'}
        </button>
        {wxInfo?.ok  && <span className="text-xs text-green-700 flex items-center gap-1"><MapPin size={11} /> {wxInfo.ok}</span>}
        {wxInfo?.err && <span className="text-xs text-amber-700">{wxInfo.err}</span>}
        {!wxInfo && form.weatherDate && (
          <span className={`text-xs flex items-center gap-1 ${form.weatherDate === form.date ? 'text-gray-500' : 'text-amber-700'}`}>
            <MapPin size={11} />
            Werte vom {formatDate(form.weatherDate)}{form.weatherLocation ? `, ${form.weatherLocation}` : ''}
          </span>
        )}
      </div>

      {/* Firmen: Auswahl aus der Projektdatenbank (Projektkontakte), Freitext bleibt möglich */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Building2 size={12} /> Anwesende Firmen / Personal
          </label>
          <span className="text-[11px] text-gray-400">
            {firmOptions.length > 0
              ? `${firmOptions.length} Firm${firmOptions.length === 1 ? 'a' : 'en'} aus der Projektdatenbank`
              : 'Keine Firmen in der Projektdatenbank hinterlegt'}
          </span>
        </div>
        <div className="space-y-1.5">
          {firmList.map(row => {
            const isNew = (row.company || '').trim() && !knownFirm(row.company)
            return (
              <div key={row.id} className="grid grid-cols-[1fr_130px_70px_1fr_auto] gap-1.5 items-start">
                <div>
                  <ContactAutocomplete
                    value={row.company}
                    onChange={v => pickFirm(row.id, v)}
                    contacts={firmOptions}
                    placeholder="Firma – aus Projektdatenbank wählen oder eintippen"
                  />
                  {isNew && onAddFirmToProject && (
                    <button type="button"
                      className="mt-0.5 text-[11px] text-brand-600 hover:text-brand-800 flex items-center gap-1"
                      onClick={() => onAddFirmToProject({ company: row.company.trim(), gewerk: row.gewerk })}>
                      <Plus size={10} /> „{row.company.trim()}“ in die Projektdatenbank übernehmen
                    </button>
                  )}
                </div>
                <input className="input" value={row.gewerk} placeholder="Gewerk"
                  onChange={e => setFirm(row.id, { gewerk: e.target.value })} />
                <input type="number" min="0" className="input" value={row.workers} placeholder="AK"
                  title="Anzahl Arbeitskräfte"
                  onChange={e => setFirm(row.id, { workers: e.target.value })} />
                <input className="input" value={row.work} placeholder="Tätigkeit (optional)"
                  onChange={e => setFirm(row.id, { work: e.target.value })} />
                <button type="button" className="btn-ghost p-1.5 text-gray-400 hover:text-red-600 mt-0.5"
                  title="Zeile entfernen" onClick={() => setFirmList(rows => rows.filter(r => r.id !== row.id))}>
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
        <button type="button" className="btn-secondary btn-sm mt-1.5"
          onClick={() => setFirmList(rows => [...rows, emptyFirmRow()])}>
          <Plus size={13} /> Firma hinzufügen
        </button>
      </div>
      {/* Gesamt-Baufortschritt: bezieht sich auf das Bauvorhaben insgesamt,
          nicht auf die Tagesleistung – er wandert in den Berichtskopf. */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-40">
          <label className="block text-xs font-medium text-gray-500 mb-1">Baufortschritt gesamt (%)</label>
          <input type="number" min="0" max="100" className="input" value={form.progress}
            onChange={set('progress')} placeholder="z. B. 35" />
        </div>
        {lastProgress !== '' && lastProgress != null && (
          <span className="text-xs text-gray-400 pb-2">zuletzt erfasst: {lastProgress} %</span>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Ausgeführte Arbeiten</label>
        <RichTextEditor value={form.workDone} onChange={html => setForm(f => ({ ...f, workDone: html }))}
          placeholder="Welche Leistungen wurden heute erbracht? (- oder 1. für Listen, Strg+B für Fett)" />
      </div>
      {/* Behinderungen: eigener Block, weil er im Streitfall die Bauzeit trägt */}
      {cfg.obstructions && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Behinderungen / Stillstände</label>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs text-gray-400">von</span>
            <input type="time" className="input w-28" value={form.obstrFrom} onChange={set('obstrFrom')} />
            <span className="text-xs text-gray-400">bis</span>
            <input type="time" className="input w-28" value={form.obstrTo} onChange={set('obstrTo')} />
          </div>
          <RichTextEditor value={form.obstructions} onChange={html => setForm(f => ({ ...f, obstructions: html }))}
            placeholder="Ursache und Auswirkung, z. B. „Betonage entfallen – Dauerregen“, „keine Freigabe Bewehrung“" />
        </div>
      )}

      {/* Abnahmen & Prüfungen */}
      {cfg.inspections && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Abnahmen &amp; Prüfungen</label>
            <RichTextEditor value={form.inspections} onChange={html => setForm(f => ({ ...f, inspections: html }))}
              placeholder="z. B. „Bewehrungsabnahme Decke 2. OG – ohne Beanstandung“" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prüfer</label>
            <ContactAutocomplete value={form.inspectedBy} onChange={v => setForm(f => ({ ...f, inspectedBy: v }))}
              contacts={contacts} placeholder="Name oder Firma" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Bemerkungen</label>
          <RichTextEditor value={form.remarks} onChange={html => setForm(f => ({ ...f, remarks: html }))}
            placeholder="Allgemeine Anmerkungen zum Tag… (optional)" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Besonderheiten</label>
          <RichTextEditor value={form.special} onChange={html => setForm(f => ({ ...f, special: html }))}
            placeholder="Besondere Vorkommnisse, Anordnungen, Besucher… (optional)" />
        </div>
      </div>

      {/* Fotos – je Foto eine eigene Bildunterschrift für den Fotoanhang.
          Bleibt sie leer, beschriftet der Anhang das Foto automatisch mit
          Datum, Tageszeit und der ersten Zeile der ausgeführten Arbeiten. */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Fotos <span className="font-normal text-gray-400">· Bildunterschrift optional (z. B. „Achse C, 2. OG, Blick nach Norden“)</span>
        </label>
        <div className="flex gap-3 flex-wrap items-start">
          {photos.map((p, i) => (
            <div key={p.id} className="w-36">
              <PhotoThumb photoId={p.id} size="w-36 h-24"
                onRemove={() => { removePhoto(p.id); photoUrlCache.delete(p.id); setPhotos(prev => prev.filter((_, j) => j !== i)) }} />
              <input className="input text-xs mt-1" value={p.caption || ''} placeholder="Bildunterschrift"
                onChange={e => setPhotos(prev => prev.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))} />
            </div>
          ))}
          {newPhotos.map((p, i) => (
            <div key={i} className="w-36">
              <div className="relative w-36 h-24 bg-gray-100 border border-gray-200 overflow-hidden group">
                <img src={`data:image/jpeg;base64,${p.base64}`} alt="" className="w-full h-full object-cover" />
                <button onClick={() => setNewPhotos(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-0 right-0 bg-black/50 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={11} />
                </button>
              </div>
              <input className="input text-xs mt-1" value={p.caption || ''} placeholder="Bildunterschrift"
                onChange={e => setNewPhotos(prev => prev.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))} />
            </div>
          ))}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          <button className="w-36 h-24 border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors flex flex-col items-center justify-center gap-1"
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader size={16} className="animate-spin" /> : <Camera size={16} />}
            <span className="text-[10px]">Foto</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button className="btn-secondary" onClick={onCancel}>Abbrechen</button>
        <button className="btn-primary" onClick={() => onSave({
          ...form,
          firmList: firmList.filter(f => (f.company || '').trim()),
          firms:    firmsToText(firmList),
          photos,
        }, newPhotos)}>Speichern</button>
      </div>
    </div>
  )
}

export default function BautagebuchView({ project, serverUser, logoDataUrl, clientLogoDataUrl, onUpdateProject, onBack }) {
  const [entries, setEntries] = useState([])
  const [pending, setPending] = useState([])    // Offline-Warteschlange
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [notice,  setNotice]  = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [editing, setEditing] = useState(null)   // entry | 'new' | null
  const lsKey = `kp_diary_${project.id}`

  // Berichtsbausteine des Projekts (Projekt-Admin, Voreinstellung nach Leistungsbild)
  const cfg = useMemo(() => diaryConfigFor(project), [project])
  const [emailOpen, setEmailOpen] = useState(false)

  // Abgeschlossene Berichte werden als Kachel gezeigt (Kopf + Kurzinfo);
  // aufgeklappte merken wir uns je Sitzung.
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleExpand = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const isCollapsed  = (entry) => !!entry.closed && !expanded.has(entry.id)

  // Für den Versand: nur die gewählten Berichte werden gerendert (Kopfzeile,
  // Fotonummern und Anhang beziehen sich dann auf diese Auswahl).
  const [printIds, setPrintIds] = useState(null)

  // Teilfelder eines gespeicherten Eintrags ändern (Server: optimistisch versioniert)
  const patchEntry = useCallback(async (entry, patch) => {
    if (isServer) {
      const { _version, _updatedAt, ...data } = entry
      const res = await fetch(`/api/projects/${project.id}/diary/${entry.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ data: { ...data, ...patch }, version: _version }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
    } else {
      persistLocal(entries.map(e => e.id === entry.id ? { ...e, ...patch } : e))
    }
  }, [project.id, entries])  // eslint-disable-line react-hooks/exhaustive-deps

  const setClosed = async (entry, closed) => {
    if (!closed && !window.confirm('Bericht wieder öffnen? Er kann danach geändert werden.')) return
    try {
      await patchEntry(entry, { closed, closedAt: closed ? new Date().toISOString() : null })
      if (isServer) load()
    } catch (e) { setError(`Speichern fehlgeschlagen: ${e.message}`) }
  }

  // PDF aus der Druckansicht – serverseitiges Chrome, damit der Anhang exakt
  // dem Ausdruck entspricht (gleiches Vorgehen wie beim Protokoll).
  // Die Fotos werden dabei auf ein gemeinsames Budget verkleinert, damit der
  // Anhang unter der 3-MB-Grenze des Mailversands bleibt – auch bei Bestands-
  // fotos aus größeren Ablagen.
  const buildPdf = useCallback(async (ids) => {
    // Ansicht auf die gewählten Berichte einschränken, HTML einsammeln, zurück
    if (ids?.length) flushSync(() => setPrintIds(new Set(ids)))
    let html
    try {
      ({ html } = await collectPrintHtml({ imageBudget: MAIL_IMAGE_BUDGET, imageSelector: '.diary-plate img' }))
    } finally {
      if (ids?.length) setPrintIds(null)
    }
    const res = await fetch(`/api/projects/${project.id}/render-pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ html }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
    return (await res.json()).pdfBase64
  }, [project.id])

  // Firmen aus der Projektdatenbank (Projektkontakte) – Auswahl im Eintrag
  const firmOptions = useMemo(() => firmsOfProject(project), [project])
  const canEditContacts = !!onUpdateProject && project.isUnlocked !== false

  // Neue Firma direkt aus der Baudokumentation in die Projektdatenbank übernehmen
  const addFirmToProject = useCallback(({ company, gewerk }) => {
    const name = (company || '').trim()
    if (!name) return
    const exists = (project.contacts || []).some(c => (c.company || '').trim().toLowerCase() === name.toLowerCase())
    if (exists) { setNotice(`„${name}“ ist bereits in der Projektdatenbank.`); return }
    onUpdateProject(project.id, {
      contacts: [...(project.contacts || []),
        { ...emptyContact(), company: name, gewerk: (gewerk || '').trim(), category: 'ausfuehrend' }],
    })
    setNotice(`„${name}“ wurde als ausführende Firma in die Projektdatenbank übernommen.`)
  }, [project.id, project.contacts, onUpdateProject])

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
          photos.push(await savePhotoBase64(p.base64, p.name).then(saved => ({ ...saved, caption: p.caption || "" })))
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
        for (const p of newPhotos) savedNew.push(await savePhotoBase64(p.base64, p.name).then(saved => ({ ...saved, caption: p.caption || "" })))
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
            for (const p of newPhotos) savedNew.push(await savePhotoBase64(p.base64, p.name).then(saved => ({ ...saved, caption: p.caption || "" })))
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
          for (const p of newPhotos) savedNew.push(await savePhotoBase64(p.base64, p.name).then(saved => ({ ...saved, caption: p.caption || "" })))
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
      for (const p of (entry.photos || [])) { removePhoto(p.id); photoUrlCache.delete(p.id) }
      if (isServer) {
        const res = await fetch(`/api/projects/${project.id}/diary/${entry.id}`, { method: 'DELETE', headers: authHeaders() })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        load()
      } else {
        persistLocal(entries.filter(e => e.id !== entry.id))
      }
    } catch (e) { setError(`Löschen fehlgeschlagen: ${e.message}`) }
  }

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [entries])

  // Durchlaufende Fotonummern über alle Einträge – gleiche Nummer am Eintrag
  // und im Fotoanhang, damit die Zuordnung im PDF eindeutig bleibt.
  const numbered = useMemo(() => {
    let no = 0
    return sorted.filter(e => !printIds || printIds.has(e.id)).map(entry => ({
      entry,
      photos: (entry.photos || []).map(p => ({ ...p, no: ++no })),
    }))
  }, [sorted, printIds])
  const photoPlates = useMemo(
    () => numbered.flatMap(({ entry, photos }) => photos.map(p => ({ p, entry }))),
    [numbered])

  // Gesamt-Baufortschritt: der zuletzt erfasste Wert (neuester Eintrag mit Angabe)
  const progressEntry = useMemo(
    () => sorted.find(e => e.progress !== '' && e.progress != null) || null,
    [sorted])
  const lastProgress = progressEntry?.progress ?? ''

  return (
    <div className="app-page diary-report">
    <PrintSheet>
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
            {/* Eine Zeile wie bisher – der Gesamtfortschritt hängt sich an,
                statt den Kopf um eine weitere Zeile wachsen zu lassen. */}
            <div className="text-xs">
              {numbered.length} Eintr{numbered.length === 1 ? 'ag' : 'äge'} · Stand {formatDate(new Date().toISOString().slice(0, 10))}
              {lastProgress !== '' ? ` · Baufortschritt ${lastProgress} %` : ''}
            </div>
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
        <div className="flex gap-2 items-center no-print">
          {sorted.length > 0 && (
            <button className="btn-secondary" onClick={() => window.print()}><Printer size={15} /> Drucken</button>
          )}
          {sorted.length > 0 && isServer && (
            <button className="btn-secondary" onClick={() => setEmailOpen(true)}><Mail size={15} /> Per E-Mail</button>
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
          firmOptions={firmOptions} lastProgress={lastProgress}
          cfg={cfg} contacts={project.contacts || []}
          onAddFirmToProject={canEditContacts ? addFirmToProject : null}
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
          {numbered.map(({ entry, photos }) => (
            <div key={entry.id} data-entry-id={entry.id}
              className={`card p-4 diary-entry ${entry.closed ? 'border-l-4 border-l-green-600' : ''}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap diary-head">
                <div>
                  <p className="font-semibold text-night diary-date">
                    {/* Abgeschlossene Berichte sind Kacheln: Kopf sichtbar, Inhalt aufklappbar */}
                    {entry.closed && (
                      <button className="btn-ghost p-0.5 mr-1 align-middle no-print" title={isCollapsed(entry) ? 'Bericht aufklappen' : 'Bericht zuklappen'}
                        onClick={() => toggleExpand(entry.id)}>
                        {isCollapsed(entry) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                    {formatDate(entry.date)}
                    {entry.daytime && (
                      <span className="text-xs font-normal text-gray-500 ml-2">
                        {halfLabel(entry.daytime)}
                      </span>
                    )}
                    {entry.progress !== '' && entry.progress != null && (
                      <span className="badge badge-blue ml-2 align-middle">Baufortschritt {entry.progress} %</span>
                    )}
                    {entry.closed && (
                      <span className="badge badge-green ml-2 align-middle inline-flex items-center gap-1"><Lock size={10} /> Abgeschlossen</span>
                    )}
                    {entry.sentAt && (
                      <span className="badge badge-gray ml-2 align-middle inline-flex items-center gap-1" title={(entry.sentTo || []).join(', ')}>
                        <Send size={10} /> gesendet {formatDate(entry.sentAt.slice(0, 10))}
                        {entry.sentTo?.length ? ` an ${entry.sentTo.length}` : ''}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {weatherLabel(entry.weather)}
                    {(entry.tempMin !== '' && entry.tempMin != null) || (entry.tempMax !== '' && entry.tempMax != null)
                      ? ` · ${entry.tempMin ?? '–'}° bis ${entry.tempMax ?? '–'}°C` : ''}
                    {/* Wetter gehört zum Begehungstag – Herkunft mit ausweisen */}
                    {entry.weatherDate && entry.weatherDate === entry.date
                      ? ` · gemessen am ${formatDate(entry.weatherDate)}${entry.weatherLocation ? `, ${entry.weatherLocation}` : ''}`
                      : ''}
                    {entry.createdBy ? ` · erstellt von ${entry.createdBy}` : ''}
                  </p>
                  {entry.weatherDate && entry.weatherDate !== entry.date && (
                    <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                      <AlertCircle size={11} /> Wetterwerte stammen vom {formatDate(entry.weatherDate)} – Eintrag bearbeiten, um sie für den Begehungstag zu holen.
                    </p>
                  )}
                </div>
                <div className="flex gap-1 items-center no-print">
                  {entry.closed ? (
                    <button className="btn-ghost text-xs text-amber-700" title="Bericht wieder öffnen" onClick={() => setClosed(entry, false)}>
                      <Unlock size={13} /> Öffnen
                    </button>
                  ) : (
                    <>
                      <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600" title="Bearbeiten" onClick={() => setEditing(entry)}><Pencil size={14} /></button>
                      <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600" title="Löschen" onClick={() => remove(entry)}><Trash2 size={14} /></button>
                      <button className="btn-ghost text-xs text-green-700" title="Bericht abschließen – danach nicht mehr änderbar"
                        onClick={() => setClosed(entry, true)}>
                        <Lock size={13} /> Abschließen
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Kachel-Kurzinfo bei zugeklapptem Bericht (nur Bildschirm) */}
              {isCollapsed(entry) && (
                <p className="text-xs text-gray-500 mt-2 no-print">
                  {[entry.firmList?.length ? entry.firmList.map(f => f.company).join(', ') : entry.firms,
                    stripHtml(toHtml(entry.workDone || '')).split('\n')[0].trim().slice(0, 100),
                    photos.length ? `${photos.length} Foto${photos.length === 1 ? '' : 's'}` : null]
                    .filter(Boolean).join(' · ')}
                </p>
              )}
              <div className={isCollapsed(entry) ? 'hidden print:block' : ''}>
              {/* Berichtsformat: je Angabe eine Zeile mit Beschriftung links.
                  Untereinander statt nebeneinander – das liest sich im Ausdruck
                  wie ein Bericht und nicht wie ein gedrängtes Formular. */}
              <table className="diary-fields">
                <tbody>
                  <DiaryField label="Firmen">
                    {entry.firmList?.length > 0 ? (
                      <ul className="space-y-0.5">
                        {entry.firmList.map(f => (
                          <li key={f.id}>
                            <span className="font-medium">{f.company}</span>
                            {[f.gewerk, (f.workers !== '' && f.workers != null) ? `${f.workers} AK` : '']
                              .filter(Boolean).length > 0 && (
                              <span className="text-gray-500">
                                {' '}({[f.gewerk, (f.workers !== '' && f.workers != null) ? `${f.workers} AK` : ''].filter(Boolean).join(', ')})
                              </span>
                            )}
                            {f.work && <span className="text-gray-600"> – {f.work}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : entry.firms || null}
                  </DiaryField>

                  <DiaryField label="Ausgeführte Arbeiten">{entry.workDone}</DiaryField>

                  {cfg.obstructions && (
                    <DiaryField
                      label="Behinderungen"
                      note={(entry.obstrFrom || entry.obstrTo)
                        ? `${entry.obstrFrom || '–'} bis ${entry.obstrTo || '–'} Uhr` : null}>
                      {entry.obstructions}
                    </DiaryField>
                  )}

                  {cfg.inspections && (
                    <DiaryField label="Abnahmen & Prüfungen" note={entry.inspectedBy ? `Prüfer: ${entry.inspectedBy}` : null}>
                      {entry.inspections}
                    </DiaryField>
                  )}

                  <DiaryField label="Bemerkungen">{entry.remarks}</DiaryField>
                  <DiaryField label="Besonderheiten">{entry.special}</DiaryField>

                  <DiaryField label="Fotoanlage">
                    {photos.length > 0
                      ? `${photos.length} Foto${photos.length === 1 ? '' : 's'} (Nr. ${photos[0].no}${photos.length > 1 ? `–${photos[photos.length - 1].no}` : ''})`
                      : null}
                  </DiaryField>
                </tbody>
              </table>

              {/* Bildschirm: Miniaturen mit Nummer. Im Ausdruck stehen die
                  Fotos großformatig im Fotoanhang. */}
              {photos.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-3 no-print">
                  {photos.map(p => (
                    <div key={p.id} className="w-24">
                      <PhotoThumb photoId={p.id} no={p.no} size="w-24 h-24" />
                      {p.caption && <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{p.caption}</p>}
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Fotoanhang: nur im Ausdruck/PDF, auf eigener Seite ───────────────
          Die Fotos gehören zum Bericht, sollen ihn aber nicht zerreißen –
          deshalb großformatig hinten, über die laufende Nummer zugeordnet. */}
      {photoPlates.length > 0 && (
        <div className="hidden print:block diary-appendix">
          <h2 className="text-base font-bold border-b border-black pb-1 mb-3">
            Fotoanhang · {photoPlates.length} Foto{photoPlates.length === 1 ? '' : 's'}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {photoPlates.map(({ p, entry }) => (
              <PhotoPlate key={p.id} photo={p} no={p.no} entry={entry} />
            ))}
          </div>
        </div>
      )}

    </PrintSheet>

      {emailOpen && (
        <DiaryEmailModal
          project={project}
          entries={sorted.map(e => ({
            id: e.id, date: e.date, daytime: e.daytime, closed: !!e.closed, sentAt: e.sentAt || null,
            photos: (e.photos || []).length,
            summary: stripHtml(toHtml(e.workDone || '')).split('\n')[0].trim().slice(0, 80),
          }))}
          projectContacts={project.contacts || []}
          distribution={distributionFor(project, 'diary')}
          buildPdf={buildPdf}
          onSaveContact={canEditContacts ? (({ email }) => onUpdateProject(project.id, {
            contacts: [...(project.contacts || []), { ...emptyContact(), email }],
          })) : null}
          onSent={async (mb, ids, recipients) => {
            setNotice(`Baudokumentation wurde versendet${mb ? ` (PDF ${mb} MB)` : ''}.`)
            // Versand am Bericht festhalten – danach ist er in der Übersicht als
            // gesendet erkennbar und beim nächsten Versand nicht mehr vorausgewählt.
            const now = new Date().toISOString()
            for (const id of ids) {
              const e = entries.find(x => x.id === id)
              if (e) { try { await patchEntry(e, { sentAt: now, sentTo: recipients }) } catch {} }
            }
            if (isServer) load()
          }}
          onClose={() => setEmailOpen(false)}
        />
      )}

      {/* ── Fußzeile auf jeder Druckseite (wie im Protokoll) ────────────────
          Seitenzahlen kann der HTML-Druck nicht selbst setzen – dafür die
          Kopf-/Fußzeilen-Option im Druckdialog des Browsers nutzen. */}
      <div className="print-footer hidden print:flex">
        <span className="font-bold">Baudokumentation · {project.name}</span>
        <span>Stand {formatDate(new Date().toISOString().slice(0, 10))}</span>
      </div>
    </div>
  )
}
