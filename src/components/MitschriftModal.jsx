import React, { useState, useRef } from 'react'
import { X, FileText, Upload, Sparkles, AlertTriangle, Check, ListChecks } from 'lucide-react'
import { formatDate } from '../utils'

// ── Aus einer Mitschrift werden Protokollpunkte ──────────────────────────────
//
// Die Datei kommt aus Teams: in der Besprechung "Transkript herunterladen",
// Format .vtt. Das geht auch mit Zoom, Webex oder einer abgetippten Mitschrift
// -- der Server liest Zeitstempel und Sprecher heraus (server/termine.js).
//
// Zwei Dinge sind an dieser Stelle Absicht:
//
// 1. Es ist ein VORSCHLAG, und er sieht auch so aus. Jeder Punkt wird
//    angehakt, nichts wird stillschweigend uebernommen. Eine Besprechung
//    besteht nicht aus dem, was gesagt wurde, sondern aus dem, was gilt --
//    und das entscheidet, wer das Protokoll zeichnet.
//
// 2. Die Mitschrift verlaesst das Haus nicht. Sie geht an die KI-Rechner im
//    Buero (ueber server/ki.js), nicht an einen Dienst im Netz. Bei einem
//    Wortprotokoll mit Nachunternehmern, Preisen und Namen ist das kein
//    Feinheitsunterschied.

const MAX_MB = 8

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = typeof window !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export default function MitschriftModal({ projektId, projektName, betreff, onApply, onClose }) {
  const [text,    setText]    = useState('')
  const [dateiName, setDateiName] = useState('')
  const [hinweis, setHinweis] = useState('')
  const [laeuft,  setLaeuft]  = useState(false)
  const [fehler,  setFehler]  = useState('')
  const [ergebnis, setErgebnis] = useState(null)   // { punkte, abschnitte, gekuerzt, ... }
  const [gewaehlt, setGewaehlt] = useState(new Set())
  const [massnahmen, setMassnahmen] = useState(new Set())
  const [ueberZiehen, setUeberZiehen] = useState(false)
  const dateiRef = useRef(null)

  const dateiLesen = (datei) => {
    if (!datei) return
    setFehler('')
    if (datei.size > MAX_MB * 1024 * 1024) {
      setFehler(`Die Datei ist größer als ${MAX_MB} MB. Das ist für eine Mitschrift ungewöhnlich – bitte prüfen, ob es wirklich das Transkript ist.`)
      return
    }
    if (/\.docx?$/i.test(datei.name)) {
      setFehler('Word-Dateien kann das Tool nicht lesen. In Teams gibt es neben .docx auch .vtt – bitte das nehmen.')
      return
    }
    const leser = new FileReader()
    leser.onload = () => { setText(String(leser.result || '')); setDateiName(datei.name) }
    leser.onerror = () => setFehler('Die Datei war nicht lesbar.')
    leser.readAsText(datei, 'utf-8')
  }

  const vorschlagen = () => {
    setLaeuft(true); setFehler(''); setErgebnis(null)
    fetch('/api/termine/mitschrift', {
      method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({ text, projektId: projektId || null, betreff: betreff || '', hinweis }),
    })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Die Mitschrift konnte nicht ausgewertet werden.')
        return d
      })
      .then(d => {
        setErgebnis(d)
        // Vorangehakt ist alles -- wer durchliest, nimmt weg, was nicht stimmt.
        // Das ist weniger Arbeit als 20 Haken zu setzen, und es verfuehrt
        // nicht dazu, blind zu uebernehmen: die Liste muss man ohnehin lesen.
        setGewaehlt(new Set((d.punkte || []).map((_, i) => i)))
        setMassnahmen(new Set((d.punkte || [])
          .map((p, i) => p.art === 'massnahme' ? i : -1).filter(i => i >= 0)))
      })
      .catch(e => setFehler(e.message))
      .finally(() => setLaeuft(false))
  }

  const umschalten = (i) => setGewaehlt(s => {
    const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n
  })
  const massnahmeUmschalten = (i) => setMassnahmen(s => {
    const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n
  })

  const uebernehmen = () => {
    const punkte = (ergebnis?.punkte || [])
      .map((p, i) => ({ ...p, _massnahme: massnahmen.has(i) }))
      .filter((_, i) => gewaehlt.has(i))
    if (!punkte.length) return
    onApply(punkte)
  }

  const zeichen = text.trim().length
  const bereit  = zeichen >= 80 && !laeuft

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print">
      <div className="bg-white w-full max-w-3xl border border-gray-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ListChecks size={16} className="text-brand-600" /> Mitschrift einlesen
          </h3>
          <button className="btn-ghost p-1.5 text-gray-400" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {!ergebnis && (
            <>
              <p className="text-sm text-gray-600">
                In Teams in der Besprechung <span className="font-medium">Transkript herunterladen</span> wählen
                und die <span className="font-mono text-xs">.vtt</span>-Datei hier ablegen. Eine abgetippte
                Mitschrift geht genauso – einfach einfügen.
              </p>

              <div
                className={`border-2 border-dashed p-6 text-center transition-colors ${
                  ueberZiehen ? 'border-brand-400 bg-brand-50' : 'border-gray-200'}`}
                onDragOver={e => { e.preventDefault(); setUeberZiehen(true) }}
                onDragLeave={() => setUeberZiehen(false)}
                onDrop={e => {
                  e.preventDefault(); setUeberZiehen(false)
                  dateiLesen(e.dataTransfer.files?.[0])
                }}
              >
                <Upload size={20} className="mx-auto text-gray-300 mb-2" />
                <button className="btn-secondary text-sm" onClick={() => dateiRef.current?.click()}>
                  Datei wählen
                </button>
                <input ref={dateiRef} type="file" accept=".vtt,.txt,.srt,text/plain"
                       className="hidden"
                       onChange={e => dateiLesen(e.target.files?.[0])} />
                <p className="text-xs text-gray-400 mt-2">
                  .vtt, .srt oder .txt – oder die Datei hierher ziehen
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Mitschrift {dateiName && <span className="text-gray-400 normal-case">· {dateiName}</span>}
                </label>
                <textarea
                  className="input font-mono text-xs h-40"
                  placeholder="…oder hier einfügen"
                  value={text}
                  onChange={e => { setText(e.target.value); setDateiName('') }}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {zeichen.toLocaleString('de-DE')} Zeichen
                  {zeichen > 48000 && ' – sehr lang, es wird in Abschnitten ausgewertet'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Hinweis an die Auswertung (optional)
                </label>
                <input className="input text-sm"
                       placeholder="z. B. „Nur die Punkte zum Rohbau, der Rest kommt ins Planungsprotokoll“"
                       value={hinweis} onChange={e => setHinweis(e.target.value)} />
              </div>

              <p className="text-xs text-gray-500 bg-concrete border border-gray-200 px-3 py-2">
                Die Mitschrift geht an die KI-Rechner im Büro, nicht an einen Dienst im Netz.
                {projektName && <> Projekt <span className="font-medium">{projektName}</span> wird als Zusammenhang mitgegeben.</>}
              </p>
            </>
          )}

          {fehler && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">{fehler}</p>
          )}

          {laeuft && (
            <div className="py-8 text-center">
              <Sparkles size={22} className="mx-auto text-brand-400 animate-pulse mb-2" />
              <p className="text-sm text-gray-600">Die Mitschrift wird gelesen…</p>
              <p className="text-xs text-gray-400 mt-1">
                Bei einer langen Besprechung dauert das ein paar Minuten. Das Fenster offen lassen.
              </p>
            </div>
          )}

          {ergebnis && (
            <>
              <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium">Vorschlag – bitte gegenlesen.</span> Zusagen, Fristen und
                  Zuständigkeiten stehen im Protokoll als verbindlich. Die Auswertung hört keinen Ton
                  zwischen den Zeilen.
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {ergebnis.punkte.length} Punkte aus {ergebnis.wortbeitraege} Wortbeiträgen
                  {ergebnis.abschnitte > 1 && ` · ${ergebnis.abschnitte} Abschnitte`}
                  {ergebnis.modell && ` · ${ergebnis.modell}`}
                  {ergebnis.dauerS != null && ` · ${ergebnis.dauerS} s`}
                </span>
                <span className="flex gap-2">
                  <button className="hover:underline"
                          onClick={() => setGewaehlt(new Set(ergebnis.punkte.map((_, i) => i)))}>
                    alle
                  </button>
                  <button className="hover:underline" onClick={() => setGewaehlt(new Set())}>keinen</button>
                </span>
              </div>

              {ergebnis.gekuerzt && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
                  Die Mitschrift war länger als auf einmal auswertbar – der Schluss wurde nicht
                  ausgewertet. Für den Rest die Datei kürzen und noch einmal einlesen.
                </p>
              )}

              {ergebnis.hinweis && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
                  {ergebnis.hinweis}
                </p>
              )}

              <div className="space-y-2">
                {ergebnis.punkte.map((p, i) => {
                  const an = gewaehlt.has(i)
                  return (
                    <div key={i}
                         className={`border px-3 py-2 ${an ? 'border-brand-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
                      <div className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1 shrink-0" checked={an}
                               onChange={() => umschalten(i)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-900">{p.thema}</span>
                            {p.art === 'massnahme'
                              ? <span className="badge-yellow">Maßnahme</span>
                              : <span className="badge-gray">Feststellung</span>}
                            {p.zustaendig && <span className="text-xs text-gray-500">{p.zustaendig}</span>}
                            {p.frist && <span className="text-xs text-gray-500">bis {formatDate(p.frist)}</span>}
                          </div>
                          {p.besprochen && (
                            <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{p.besprochen}</p>
                          )}
                          {p.ergebnis && (
                            <p className="text-xs text-gray-800 mt-1">
                              <span className="font-medium">Ergebnis:</span> {p.ergebnis}
                            </p>
                          )}
                          {an && (
                            <label className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
                              <input type="checkbox" checked={massnahmen.has(i)}
                                     onChange={() => massnahmeUmschalten(i)} />
                              zusätzlich als Maßnahme mit Zuständigem und Frist anlegen
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200">
          <div className="text-xs text-gray-400 flex items-center gap-1.5">
            <FileText size={12} />
            {ergebnis
              ? `${gewaehlt.size} von ${ergebnis.punkte.length} ausgewählt`
              : 'Die Punkte werden an das Ende des Protokolls angehängt.'}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
            {!ergebnis
              ? (
                <button className="btn-primary" disabled={!bereit} onClick={vorschlagen}>
                  <Sparkles size={14} /> Punkte vorschlagen
                </button>
              ) : (
                <button className="btn-primary" disabled={!gewaehlt.size} onClick={uebernehmen}>
                  <Check size={14} /> {gewaehlt.size} Punkte übernehmen
                </button>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}
