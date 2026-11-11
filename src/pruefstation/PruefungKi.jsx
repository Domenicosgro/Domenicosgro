import React, { useCallback, useEffect, useState } from 'react'
import { Sparkles, Play, Loader, AlertCircle, Download, Send, CheckCircle2, FolderInput, RotateCcw, FileText, User } from 'lucide-react'
import { api, authHeaders, formatBytes } from './api'

// ── Prüfung mit Claude (Stufe 2) ─────────────────────────────────────────────
// Startet den Lauf auf dem Server (Büro-Schlüssel – kein eigener Claude-Zugang
// nötig), zeigt Fortschritt, Antworten und Rückfragen, Ergebnisdateien als
// Entwurf und legt sie nach Freigabe im Vorgangsordner ab.

const PREIS = { input: 4 / 1e6, output: 20 / 1e6 }   // USD je Token, Claude Opus 5.5

export default function PruefungKi({ vorgang, project, onChange }) {
  const [ki,      setKi]      = useState(null)
  const [daten,   setDaten]   = useState(null)
  const [fehler,  setFehler]  = useState(null)
  const [antwort, setAntwort] = useState('')
  const [busy,    setBusy]    = useState(false)
  const [auswahl, setAuswahl] = useState(null)       // Set der freizugebenden Dateien
  const [jetzt,   setJetzt]   = useState(Date.now())

  const laden = useCallback(async () => {
    try { setDaten(await api(`/api/pruefstation/vorgaenge/${vorgang.id}/pruefung`)) }
    catch (e) { setFehler(e.message) }
  }, [vorgang.id])

  useEffect(() => { api('/api/pruefstation/ki-status').then(setKi).catch(() => setKi({ aktiv: false })) }, [])
  useEffect(() => { laden() }, [laden, vorgang.pruefung?.status, vorgang.pruefung?.schritt])

  const status = daten?.pruefung?.status
  const laeuft = status === 'laeuft'

  // Während eines Laufs regelmäßig nachsehen
  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => { laden(); setJetzt(Date.now()) }, 4000)
    return () => clearInterval(t)
  }, [laeuft, laden])

  useEffect(() => { setAuswahl(new Set((daten?.dateien || []).map(d => d.name))) }, [daten?.dateien?.length])  // eslint-disable-line react-hooks/exhaustive-deps

  const starten = async (nachricht) => {
    if (!nachricht && daten?.runden?.length && !window.confirm('Neue Prüfung starten? Der bisherige Entwurf und die Unterhaltung werden ersetzt.')) return
    setBusy(true); setFehler(null)
    try {
      await api(`/api/pruefstation/vorgaenge/${vorgang.id}/pruefung`, { method: 'POST', body: nachricht ? { nachricht } : {} })
      setAntwort('')
      await laden()
    } catch (e) { setFehler(e.message) }
    finally { setBusy(false) }
  }

  const herunterladen = async (name) => {
    try {
      const res = await fetch(`/api/pruefstation/vorgaenge/${vorgang.id}/pruefung/datei?name=${encodeURIComponent(name)}`, { headers: authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a'); a.href = url; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (e) { setFehler(e.message) }
  }

  const freigeben = async () => {
    const dateien = [...(auswahl || [])]
    if (!dateien.length) return
    if (!window.confirm(`${dateien.length} Datei(en) in den Projektordner ablegen?`)) return
    setBusy(true); setFehler(null)
    try {
      const r = await api(`/api/pruefstation/vorgaenge/${vorgang.id}/pruefung/freigeben`, { method: 'POST', body: { dateien } })
      await laden()
      try { onChange?.(await api(`/api/pruefstation/vorgaenge/${vorgang.id}`)) } catch {}
      window.alert(`Abgelegt in:\n${r.ordner}`)
    } catch (e) { setFehler(e.message) }
    finally { setBusy(false) }
  }

  if (!ki) return null
  if (!ki.aktiv) {
    return (
      <div className="card p-4 text-xs text-gray-500 space-y-1 border-dashed">
        <p className="section-title text-gray-500"><Sparkles size={15} /> Prüfung mit Claude</p>
        <p>Noch nicht eingerichtet: Auf der NAS fehlen <code>ANTHROPIC_API_KEY</code> und der Skill-Ordner (<code>PRUEF_SKILLS_PFAD</code>). Ein Administrator richtet das einmal ein, danach können alle mit Projektzugriff prüfen.</p>
      </div>
    )
  }

  const p = daten?.pruefung || {}
  const runden = daten?.runden || []
  const dateien = daten?.dateien || []
  const kosten = p.usage ? (p.usage.input * PREIS.input + p.usage.output * PREIS.output) : 0
  const dauer = p.gestartet ? Math.max(0, Math.round(((laeuft ? jetzt : Date.parse(p.beendet || p.gestartet)) - Date.parse(p.gestartet)) / 1000)) : 0
  const skill = vorgang.art === 'rechnung' ? 'Rechnungsprüfung LBIH' : vorgang.art === 'nachtrag' ? 'Nachtragsprüfung LBIH' : null

  return (
    <div className="card">
      <div className="px-4 pt-3 pb-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
        <p className="section-title flex-1"><Sparkles size={15} className="text-brand-600" /> Prüfung mit Claude
          {skill && <span className="text-xs font-normal text-gray-400">· Skill {skill}</span>}
        </p>
        {!laeuft && (
          <button className={runden.length ? 'btn-secondary' : 'btn-primary'} disabled={busy || !vorgang.folderPath} onClick={() => starten('')}>
            {runden.length ? <><RotateCcw size={14} /> Neu prüfen</> : <><Play size={14} /> Prüfung starten</>}
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {!runden.length && !laeuft && (
          <p className="text-xs text-gray-500">
            Claude liest die Prüfdokumente, die Anlagen und deine Hinweise und arbeitet nach dem Skill.
            Rückfragen erscheinen hier und lassen sich direkt beantworten. Ergebnisse sind zuerst ein Entwurf;
            in den Projektordner kommen sie erst nach Freigabe.
          </p>
        )}

        {(fehler || status === 'fehler') && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {fehler || p.fehler || 'Der Lauf wurde unterbrochen.'}
          </p>
        )}

        {/* Unterhaltung */}
        {runden.map((r, i) => (
          <div key={i} className="space-y-2">
            {r.nachricht && (
              <div className="ml-8 bg-sky/15 border border-sky/40 px-3 py-2 text-sm">
                <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-0.5"><User size={11} /> {r.von}</p>
                <p className="whitespace-pre-wrap">{r.nachricht}</p>
              </div>
            )}
            {r.antwort && (
              <div className="mr-8 bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
                <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-0.5"><Sparkles size={11} /> Claude</p>
                <p className="whitespace-pre-wrap">{r.antwort}</p>
              </div>
            )}
          </div>
        ))}

        {laeuft && (
          <p className="text-sm text-brand-700 flex items-center gap-2">
            <Loader size={14} className="animate-spin" /> {p.schritt || 'Läuft…'}
            <span className="text-xs text-gray-400">{Math.floor(dauer / 60)}:{String(dauer % 60).padStart(2, '0')} min · gestartet von {p.von}</span>
          </p>
        )}

        {/* Antworten / Rückfragen beantworten */}
        {!laeuft && runden.length > 0 && (
          <div className="flex gap-2 items-end">
            <textarea className="textarea flex-1 min-h-[70px] text-sm" value={antwort} onChange={e => setAntwort(e.target.value)}
              placeholder="Antwort auf Rückfragen oder Korrektur, z. B. „Pos. 3 Stand 60 %, 12.000 €“ oder „Einigung vom 28.10. berücksichtigen“" />
            <button className="btn-primary" disabled={!antwort.trim() || busy} onClick={() => starten(antwort.trim())}><Send size={14} /> Senden</button>
          </div>
        )}

        {/* Ergebnisdateien (Entwurf) */}
        {dateien.length > 0 && (
          <div className="border border-gray-200">
            <p className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 border-b border-gray-200">Ergebnisse (Entwurf – noch nicht im Projektordner)</p>
            <ul className="divide-y divide-gray-100">
              {dateien.map(d => (
                <li key={d.name} className="px-3 py-1.5 flex items-center gap-2 text-sm">
                  {project?.canManage && (
                    <input type="checkbox" checked={!!auswahl?.has(d.name)}
                      onChange={e => setAuswahl(s => { const n = new Set(s); e.target.checked ? n.add(d.name) : n.delete(d.name); return n })} />
                  )}
                  <FileText size={14} className="text-gray-400" />
                  <button className="flex-1 text-left truncate hover:underline" onClick={() => herunterladen(d.name)} title={d.name}>{d.name}</button>
                  <span className="text-xs text-gray-400">{formatBytes(d.size)}</span>
                  <button className="btn-ghost p-1" title="Herunterladen" onClick={() => herunterladen(d.name)}><Download size={14} /></button>
                </li>
              ))}
            </ul>
            <div className="px-3 py-2 border-t border-gray-200 flex flex-wrap items-center gap-2">
              {project?.canManage ? (
                <button className="btn-primary" disabled={busy || laeuft || !auswahl?.size} onClick={freigeben}>
                  <FolderInput size={14} /> Freigeben und ablegen
                </button>
              ) : (
                <span className="text-xs text-gray-500">Freigeben und ablegen können Projekt-Administratoren.</span>
              )}
              {p.freigegeben && (
                <span className="text-xs text-green-700 flex items-center gap-1">
                  <CheckCircle2 size={12} /> zuletzt freigegeben von {p.freigegeben.von} → {p.freigegeben.ordner.split('/').pop()}
                </span>
              )}
            </div>
          </div>
        )}

        {daten?.unterlagen?.length > 0 && (
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">Datengrundlage des letzten Laufs: {daten.unterlagen.length} Unterlagen</summary>
            <ul className="mt-1 space-y-0.5 max-h-60 overflow-y-auto">
              {daten.unterlagen.map((u, i) => <li key={i} className="truncate" title={u.rolle}><span className="text-night">{u.name}</span> · {u.rolle}</li>)}
            </ul>
          </details>
        )}

        {p.usage && (
          <p className="text-[11px] text-gray-400">
            {Math.round((p.usage.input + p.usage.output) / 1000)} Tsd. Token · ca. {kosten.toFixed(2).replace('.', ',')} USD
            {daten?.unterlagen?.length ? ` · ${daten.unterlagen.length} Unterlagen gelesen` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
