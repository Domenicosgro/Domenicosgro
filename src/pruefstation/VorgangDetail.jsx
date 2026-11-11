import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FolderOpen, Link2, RefreshCw, Upload, FileText, Download, Eye, Trash2, Loader, AlertCircle,
         X, Mail, Paperclip, ClipboardList, Folder, Sparkles, Check } from 'lucide-react'
import FolderPicker from './FolderPicker'
import PruefungKi from './PruefungKi'
import { api, uploadFile, fetchBlob, ART_LABEL, STATUS, DATEI_ART, formatBytes, formatDateDe, suggestFolderName, useEscape } from './api'

const PREVIEW_TYPES = /\.(pdf|png|jpe?g|gif|webp|txt)$/i

// ── Ein Prüfvorgang: Stammdaten, verknüpfter NAS-Ordner, Dateien ─────────────
export default function VorgangDetail({ vorgang, project, onChange, onDelete }) {
  const [draft,      setDraft]      = useState(vorgang)
  const [saveState,  setSaveState]  = useState('')       // '' | 'saving' | 'saved'
  const [error,      setError]      = useState(null)
  const [picker,     setPicker]     = useState(false)
  const [files,      setFiles]      = useState(null)     // { folderPath, files, ordner }
  const [filesErr,   setFilesErr]   = useState(null)
  const [loadingF,   setLoadingF]   = useState(false)
  const [uploads,    setUploads]    = useState([])       // { key, name, state, error }
  const [anlageArt,  setAnlageArt]  = useState('sonstiges')
  const [textModal,  setTextModal]  = useState(false)
  const timer   = useRef(null)
  const pending = useRef({})

  // Wechsel des Vorgangs → Entwurf neu setzen
  useEffect(() => { setDraft(vorgang); setSaveState(''); setError(null) }, [vorgang.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Felder mit kurzer Verzögerung speichern (wie Auto-Save im Protokolltool)
  const flush = useCallback(async () => {
    const changes = pending.current
    pending.current = {}
    if (!Object.keys(changes).length) return
    setSaveState('saving')
    try {
      const saved = await api(`/api/pruefstation/vorgaenge/${vorgang.id}`, { method: 'PATCH', body: changes })
      onChange(saved)
      setSaveState('saved')
    } catch (e) { setError(e.message); setSaveState('') ; pending.current = { ...changes, ...pending.current } }
  }, [vorgang.id, onChange])

  const setField = (key, value) => {
    setDraft(d => ({ ...d, [key]: value }))
    pending.current[key] = value
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 900)
  }
  useEffect(() => () => { clearTimeout(timer.current); flush() }, [flush])

  // ── Dateien ────────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!vorgang.folderPath) { setFiles(null); return }
    setLoadingF(true); setFilesErr(null)
    try { setFiles(await api(`/api/pruefstation/vorgaenge/${vorgang.id}/dateien`)) }
    catch (e) { setFilesErr(e.message); setFiles(null) }
    finally { setLoadingF(false) }
  }, [vorgang.id, vorgang.folderPath])

  useEffect(() => { loadFiles() }, [loadFiles])

  const linkFolder = async (path) => {
    setPicker(false)
    try {
      const saved = await api(`/api/pruefstation/vorgaenge/${vorgang.id}`, { method: 'PATCH', body: { folderPath: path } })
      setDraft(d => ({ ...d, folderPath: saved.folderPath }))
      onChange(saved)
    } catch (e) { setError(e.message) }
  }

  const doUpload = async (fileList, kategorie) => {
    const list = Array.from(fileList || [])
    if (!list.length) return
    const art = kategorie === 'anlage' ? anlageArt : ''
    const items = list.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, state: 'laden', file: f }))
    setUploads(u => [...u, ...items])
    for (const it of items) {
      try {
        await uploadFile(vorgang.id, it.file, { kategorie, art })
        setUploads(u => u.map(x => x.key === it.key ? { ...x, state: 'ok' } : x))
      } catch (e) {
        setUploads(u => u.map(x => x.key === it.key ? { ...x, state: 'fehler', error: e.message } : x))
      }
    }
    await loadFiles()
    try { onChange(await api(`/api/pruefstation/vorgaenge/${vorgang.id}`)) } catch {}
    setTimeout(() => setUploads(u => u.filter(x => x.state === 'fehler')), 2500)
  }

  const openFile = async (f, download) => {
    // Fenster sofort öffnen (sonst blockiert der Browser das Pop-up nach dem await)
    const win = !download && PREVIEW_TYPES.test(f.name) ? window.open('', '_blank') : null
    try {
      const blob = await fetchBlob(vorgang.id, f.rel)
      const typed = /\.pdf$/i.test(f.name) ? new Blob([blob], { type: 'application/pdf' })
                  : /\.txt$/i.test(f.name) ? new Blob([blob], { type: 'text/plain;charset=utf-8' }) : blob
      const url = URL.createObjectURL(typed)
      if (win) win.location.href = url
      else {
        const a = document.createElement('a')
        a.href = url; a.download = f.name
        document.body.appendChild(a); a.click(); a.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { win?.close(); setError(e.message) }
  }

  const updateMeta = async (f, changes) => {
    try {
      const saved = await api(`/api/pruefstation/vorgaenge/${vorgang.id}/dateien`, { method: 'PATCH', body: { rel: f.rel, ...changes } })
      onChange(saved)
      setFiles(fs => fs && ({ ...fs, files: fs.files.map(x => x.rel === f.rel ? { ...x, ...changes } : x) }))
    } catch (e) { setError(e.message) }
  }

  const removeFile = async (f) => {
    if (!window.confirm(`„${f.name}" auf der NAS löschen?`)) return
    try {
      await api(`/api/pruefstation/vorgaenge/${vorgang.id}/dateien?rel=${encodeURIComponent(f.rel)}`, { method: 'DELETE' })
      await loadFiles()
    } catch (e) { setError(e.message) }
  }

  const pruefdokumente = (files?.files || []).filter(f => f.kategorie === 'pruefdokument')
  const anlagen        = (files?.files || []).filter(f => f.kategorie === 'anlage')

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{project?.name || 'Projekt'} · {ART_LABEL[draft.art]}</p>
          <h1 className="text-xl font-bold text-night truncate">
            {[draft.nummer || ART_LABEL[draft.art], draft.index ? `Index ${draft.index}` : ''].filter(Boolean).join(' ')}
            {draft.titel ? <span className="font-normal text-gray-600"> – {draft.titel}</span> : null}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {saveState === 'saving' && <><Loader size={12} className="animate-spin" /> speichert…</>}
          {saveState === 'saved'  && <><Check size={12} className="text-green-600" /> gespeichert</>}
          <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={onDelete} title="Vorgang löschen (Dateien auf der NAS bleiben erhalten)">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      {/* NAS-Ordner */}
      <div className={`card p-4 ${draft.folderPath ? '' : 'border-l-4 border-l-amber-400'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <FolderOpen size={20} className="text-brand-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500">Verknüpfter NAS-Ordner</p>
            {draft.folderPath
              ? <p className="text-sm text-night truncate" title={draft.folderPath}>{draft.folderPath}</p>
              : <p className="text-sm text-amber-700">Noch kein Ordner verknüpft – wähle den Projektordner, in dem die Prüfunterlagen liegen sollen.</p>}
          </div>
          <button className={draft.folderPath ? 'btn-secondary' : 'btn-primary'} onClick={() => setPicker(true)}>
            <Link2 size={14} /> {draft.folderPath ? 'Ordner ändern' : 'Ordner verknüpfen'}
          </button>
          {draft.folderPath && (
            <button className="btn-ghost" onClick={loadFiles} title="Ordnerinhalt neu laden"><RefreshCw size={14} className={loadingF ? 'animate-spin' : ''} /></button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
        {/* Dateien */}
        <div className="space-y-4 min-w-0">
          {filesErr && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2"><AlertCircle size={14} /> {filesErr}</p>
          )}

          <DateiBereich
            title="Prüfdokumente" icon={<FileText size={15} />}
            hint="Das zu prüfende Dokument im Original: Nachtragsschreiben, Kostenaufstellung, Abschlagsrechnung mit Zahlungsplan."
            target={draft.folderPath ? 'im verknüpften Ordner' : null}
            files={pruefdokumente} loading={loadingF && !files}
            onDrop={fl => doUpload(fl, 'pruefdokument')}
            onOpen={openFile} onRemove={removeFile} onMeta={updateMeta}
            disabled={!draft.folderPath}
          />

          <DateiBereich
            title="Anlagen zur Prüfung" icon={<Paperclip size={15} />}
            hint="Einigungen, E-Mail-Verläufe, Stellungnahmen, Protokolle, Leistungsnachweise. E-Mails als .msg/.eml oder als Text einfügen."
            target={draft.folderPath ? 'Unterordner „Anlagen zur Prüfung"' : null}
            files={anlagen} loading={loadingF && !files} showArt
            onDrop={fl => doUpload(fl, 'anlage')}
            onOpen={openFile} onRemove={removeFile} onMeta={updateMeta}
            disabled={!draft.folderPath}
            extra={(
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-500">Neue Dateien als</label>
                <select className="select w-auto py-1 text-xs" value={anlageArt} onChange={e => setAnlageArt(e.target.value)}>
                  {Object.entries(DATEI_ART).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button className="btn-secondary text-xs py-1" disabled={!draft.folderPath} onClick={() => setTextModal(true)}>
                  <Mail size={13} /> E-Mail-Text einfügen
                </button>
              </div>
            )}
          />

          {files?.ordner?.length > 0 && (
            <div className="card p-4">
              <p className="section-title mb-2"><Folder size={15} /> Weitere Ordner im Vorgangsordner</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {files.ordner.map(o => <li key={o.path} className="flex items-center gap-2"><Folder size={13} className="text-amber-500" /> {o.name}</li>)}
              </ul>
            </div>
          )}

          {uploads.length > 0 && (
            <div className="card p-3 space-y-1">
              {uploads.map(u => (
                <p key={u.key} className="text-xs flex items-center gap-2">
                  {u.state === 'laden' && <Loader size={12} className="animate-spin text-brand-600" />}
                  {u.state === 'ok' && <Check size={12} className="text-green-600" />}
                  {u.state === 'fehler' && <AlertCircle size={12} className="text-red-600" />}
                  <span className="truncate">{u.name}</span>
                  {u.error && <span className="text-red-600">– {u.error}</span>}
                  {u.state === 'fehler' && <button className="ml-auto text-gray-400" onClick={() => setUploads(x => x.filter(y => y.key !== u.key))}><X size={12} /></button>}
                </p>
              ))}
            </div>
          )}
          <PruefungKi vorgang={vorgang} project={project} onChange={onChange} />
        </div>

        {/* Stammdaten */}
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <p className="section-title"><ClipboardList size={15} /> Angaben zum Vorgang</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Art">
                <select className="select" value={draft.art} onChange={e => setField('art', e.target.value)}>
                  {Object.entries(ART_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="select" value={draft.status} onChange={e => setField('status', e.target.value)}>
                  {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </Field>
              <Field label={draft.art === 'rechnung' ? 'Nummer (z. B. 3. AR Bau)' : 'Nummer (z. B. NA 008)'}>
                <input className="input" value={draft.nummer || ''} onChange={e => setField('nummer', e.target.value)} />
              </Field>
              <Field label="Index">
                <input className="input" value={draft.index || ''} onChange={e => setField('index', e.target.value)} />
              </Field>
            </div>
            <Field label="Titel / Gegenstand">
              <input className="input" value={draft.titel || ''} onChange={e => setField('titel', e.target.value)} />
            </Field>
            <Field label="Auftragnehmer">
              <input className="input" value={draft.auftragnehmer || ''} onChange={e => setField('auftragnehmer', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Eingang">
                <input type="date" className="input" value={draft.eingangAm || ''} onChange={e => setField('eingangAm', e.target.value)} />
              </Field>
              <Field label="Prüffrist">
                <input type="date" className="input" value={draft.frist || ''} onChange={e => setField('frist', e.target.value)} />
              </Field>
              {draft.art === 'nachtrag' && (
                <Field label="Einigung vom">
                  <input type="date" className="input" value={draft.einigungAm || ''} onChange={e => setField('einigungAm', e.target.value)} />
                </Field>
              )}
              <Field label={draft.art === 'rechnung' ? 'Rechnungsbetrag netto (€)' : 'Angebot netto (€)'}>
                <input type="number" step="0.01" className="input text-right" value={draft.betragNetto ?? ''}
                  onChange={e => setField('betragNetto', e.target.value === '' ? null : e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <p className="section-title"><ClipboardList size={15} /> Hinweise des Bearbeiters</p>
            <p className="text-xs text-gray-500">
              Auftragszettel: Stand der Einigung, Leistungsstand auf der Baustelle, worauf zu achten ist.
              Gilt für diesen Vorgang vorrangig, ändert aber den Projekt-Standard nicht.
            </p>
            <textarea className="textarea min-h-[160px]" value={draft.hinweise || ''} onChange={e => setField('hinweise', e.target.value)} />
          </div>

          <p className="text-[11px] text-gray-400">
            Angelegt {formatDateDe(vorgang.createdAt)} von {vorgang.createdByName || vorgang.createdBy}
            {vorgang.updatedByName ? ` · zuletzt bearbeitet von ${vorgang.updatedByName}` : ''}
          </p>
        </div>
      </div>

      {picker && (
        <FolderPicker
          startPath={draft.folderPath || project?.pruefOrdner?.[draft.art] || ''}
          projectPath={project?.fsPath}
          suggestedName={suggestFolderName(draft)}
          onSelect={linkFolder}
          onClose={() => setPicker(false)}
        />
      )}
      {textModal && (
        <TextModal
          onClose={() => setTextModal(false)}
          onSave={async ({ titel, art, text }) => {
            await api(`/api/pruefstation/vorgaenge/${vorgang.id}/text`, { method: 'POST', body: { titel, art, text } })
            setTextModal(false)
            await loadFiles()
            try { onChange(await api(`/api/pruefstation/vorgaenge/${vorgang.id}`)) } catch {}
          }}
        />
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-0.5">{label}</span>
      {children}
    </label>
  )
}

// Ablagebereich mit Drag & Drop und Dateiliste
function DateiBereich({ title, icon, hint, target, files, loading, showArt, onDrop, onOpen, onRemove, onMeta, disabled, extra }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)

  return (
    <div className="card">
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="section-title">{icon} {title} <span className="text-xs font-normal text-gray-400">({files.length})</span></p>
          {extra}
        </div>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>

      <div
        className={`mx-4 mb-3 border-2 border-dashed px-4 py-4 text-center text-sm transition-colors ${
          disabled ? 'border-gray-200 text-gray-300' : over ? 'border-sky bg-sky/10 text-brand-700' : 'border-concrete text-gray-500 hover:border-sky cursor-pointer'}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={e => { if (disabled) return; e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) onDrop(e.dataTransfer.files) }}
      >
        <Upload size={16} className="inline mr-1.5 -mt-0.5" />
        {disabled ? 'Erst einen NAS-Ordner verknüpfen' : <>Dateien hierher ziehen oder <span className="underline">auswählen</span>{target ? <span className="text-xs text-gray-400"> · Ablage {target}</span> : null}</>}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { onDrop(e.target.files); e.target.value = '' }} />
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-400"><Loader size={18} className="animate-spin mx-auto" /></div>
      ) : files.length > 0 && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {files.map(f => (
            <li key={f.rel} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <FileText size={15} className="text-gray-400 flex-shrink-0" />
              <button className="font-medium text-night hover:text-brand-700 hover:underline truncate min-w-0 flex-1 text-left" onClick={() => onOpen(f, false)} title={f.name}>
                {f.name}
              </button>
              {showArt && (
                <select className="select w-auto py-0.5 text-xs" value={f.art || 'sonstiges'} onChange={e => onMeta(f, { art: e.target.value })}>
                  {Object.entries(DATEI_ART).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              )}
              <span className="text-xs text-gray-400 w-16 text-right">{formatBytes(f.size)}</span>
              <span className="text-xs text-gray-400 w-20 hidden sm:inline">{f.mtime ? new Date(f.mtime * 1000).toLocaleDateString('de-DE') : ''}</span>
              <span className="flex items-center gap-0.5">
                {PREVIEW_TYPES.test(f.name) && <button className="btn-ghost p-1" title="Ansehen" onClick={() => onOpen(f, false)}><Eye size={14} /></button>}
                <button className="btn-ghost p-1" title="Herunterladen" onClick={() => onOpen(f, true)}><Download size={14} /></button>
                {f.viaApp && <button className="btn-ghost p-1 text-red-500 hover:bg-red-50" title="Löschen (nur über die Prüfstation hochgeladene Dateien)" onClick={() => onRemove(f)}><Trash2 size={14} /></button>}
              </span>
              {f.uploadedBy && <span className="basis-full pl-7 text-[11px] text-gray-400">hochgeladen von {f.uploadedBy} · {formatDateDe(f.uploadedAt)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// E-Mail-Verlauf oder Hinweis als Text einfügen → .txt im Anlagen-Ordner
function TextModal({ onClose, onSave }) {
  const [titel, setTitel] = useState('E-Mail-Verlauf')
  const [art,   setArt]   = useState('email')
  const [text,  setText]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState(null)
  useEscape(onClose)

  const save = async () => {
    setBusy(true); setErr(null)
    try { await onSave({ titel, art, text }) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-night/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="card w-full max-w-2xl p-4 space-y-3" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-night flex items-center gap-2"><Mail size={16} className="text-brand-600" /> Text als Anlage ablegen</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="grid grid-cols-[1fr_200px] gap-2">
          <input className="input" value={titel} onChange={e => setTitel(e.target.value)} placeholder="Bezeichnung, z. B. Einigung Bintz 28.10." />
          <select className="select" value={art} onChange={e => setArt(e.target.value)}>
            {Object.entries(DATEI_ART).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <textarea className="textarea min-h-[280px] font-mono text-xs" autoFocus value={text} onChange={e => setText(e.target.value)}
          placeholder="E-Mail-Verlauf aus Outlook hier einfügen (Strg+V) – mit Absender, Datum und Betreff." />
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={!text.trim() || busy} onClick={save}>
            {busy ? <Loader size={14} className="animate-spin" /> : <Paperclip size={14} />} Als Anlage speichern
          </button>
        </div>
      </div>
    </div>
  )
}
