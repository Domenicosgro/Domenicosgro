import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, ChevronRight, Plus, Send, Trash2, X } from 'lucide-react'

/**
 * Der Assistent: ein Gespräch über die Projektdaten und über das Programm.
 *
 * Zwei Entscheidungen, die man an der Oberfläche sieht:
 *
 * 1. **Die Quellen stehen über der Antwort, nicht darunter.** Sie kommen auch
 *    zuerst an (der Server schickt sie, bevor das Modell das erste Wort
 *    geschrieben hat). Wer liest, worauf sich die Antwort stützt, bevor er die
 *    Antwort liest, glaubt ihr genau so weit, wie sie es verdient. Steht dort
 *    „keine Fundstellen", ist das die wichtigste Zeile auf dem Schirm.
 *
 * 2. **Ohne eingerichtete KI erscheint der Knopf nicht.** Ein Chatfenster, das
 *    auf jede Frage mit einem Verbindungsfehler antwortet, ist schlimmer als
 *    keines — es sieht nach einem kaputten Programm aus statt nach einer
 *    Funktion, die hier nicht eingeschaltet ist.
 */

const SPEICHER_OFFEN = 'kp_assistent_offen'

// Wie er heißt, wenn jemand ihn ansieht: **(K)ompl(I)ze**. Die Klammern
// greifen das (K)-Logo des Hauses auf, und die beiden eingeklammerten
// Buchstaben ergeben zusammen „KI" — das Wort steckt also im Namen, ohne
// dass es jemand hinschreiben müsste.
//
// Nur die Anzeige trägt diesen Namen. Die Routen heißen weiter
// /api/assistent/*, die Dateien ebenso: Ein Name, der sich nach außen
// ändern darf, sollte nicht an Pfaden hängen, die danach alle mitwandern.
const NAME_TEXT = '(K)ompl(I)ze'

function Name({ klasse = '' }) {
  return (
    <span className={klasse}>
      <span className="text-sky">(K)</span>ompl<span className="text-sky">(I)</span>ze
    </span>
  )
}

function token() {
  try { return localStorage.getItem('kp_session_token') } catch { return null }
}

function koepfe() {
  const h = { 'Content-Type': 'application/json' }
  const t = token()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

async function hole(weg, optionen = {}) {
  const res = await fetch(weg, { headers: koepfe(), ...optionen })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* kein JSON */ }
  if (!res.ok) throw new Error(json?.error || `Fehler ${res.status}`)
  return json
}

/** Tageszeit für die Begrüßung — ohne KI. Ein Satz, den ein `if` hinbekommt,
 *  soll keinen Platz auf einer Grafikkarte kosten. */
function gruss() {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 18) return 'Hallo'
  return 'Guten Abend'
}

/** Nur `**fett**` — mehr Auszeichnung braucht eine Neuigkeit nicht, und
 *  mehr würde bedeuten, fremden Text als HTML zu behandeln. */
function MitFett({ text }) {
  const teile = String(text || '').split(/\*\*(.+?)\*\*/gs)
  return (
    <>
      {teile.map((t, i) => (i % 2 ? <strong key={i}>{t}</strong> : <span key={i}>{t}</span>))}
    </>
  )
}

/** Eine Zeitangabe wie „vor 3 Minuten" — ohne Bibliothek. */
function vorWieLange(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z')).getTime()
  if (!Number.isFinite(ms)) return ''
  const min = Math.round(ms / 60000)
  if (min < 1)  return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const std = Math.round(min / 60)
  if (std < 24) return `vor ${std} Std.`
  const tage = Math.round(std / 24)
  return tage === 1 ? 'gestern' : `vor ${tage} Tagen`
}

function Quellen({ daten }) {
  const [offen, setOffen] = useState(false)
  if (!daten) return null
  const liste = daten.quellen || []

  if (!liste.length) {
    return (
      <div className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>Keine Fundstellen.</strong> Zu dieser Frage wurde in den
        freigegebenen Projekten nichts gefunden
        {daten.begriffe?.length ? <> (gesucht nach: {daten.begriffe.join(', ')})</> : null}.
        Die Antwort kann deshalb nur allgemein ausfallen.
      </div>
    )
  }

  return (
    <div className="border-l-2 border-sky bg-brand-50 px-3 py-2 text-xs text-brand-800">
      <button
        className="flex items-center gap-1 font-medium hover:underline"
        onClick={() => setOffen(o => !o)}
      >
        {offen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {liste.length} {liste.length === 1 ? 'Fundstelle' : 'Fundstellen'}
        {daten.fokus ? <span className="font-normal">· Schwerpunkt {daten.fokus}</span> : null}
        {daten.uebrig ? <span className="font-normal">· {daten.uebrig} weitere passten nicht mehr</span> : null}
      </button>
      {offen && (
        <ul className="mt-1.5 space-y-0.5 pl-4 list-disc">
          {liste.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      )}
    </div>
  )
}

function Nachricht({ n }) {
  if (n.rolle === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-night text-white px-3 py-2 text-sm whitespace-pre-wrap">
          {n.inhalt}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <Quellen daten={n.quellenDaten} />
      {n.inhalt ? (
        <div className="bg-white border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap text-gray-900">
          <MitFett text={n.inhalt} />
        </div>
      ) : null}
      {n.bild ? (
        // Als <img> mit data:-URL, nicht als eingebettetes SVG: In einem
        // <img> führt ein SVG keine Skripte aus. Die Dateien stammen zwar
        // aus dem eigenen Projekt — die Oberfläche soll aber nicht davon
        // abhängen, dass das so bleibt.
        <img src={n.bild} alt="" className="w-full border border-gray-200 bg-white" />
      ) : null}
      {n.fehler ? (
        <div className="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-800">
          {n.fehler}
        </div>
      ) : null}
      {(n.knoten || n.dauer) && !n.fehler ? (
        <div className="text-[11px] text-gray-400">
          {n.knoten ? `beantwortet von ${n.knoten}` : null}
          {n.dauer ? ` · ${Number(n.dauer).toFixed(1)} s` : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Die Sprechblase mit der Neuigkeit.
 *
 * Sie steht über dem Knopf und verschwindet erst, wenn man sie wegklickt
 * oder öffnet — nicht nach ein paar Sekunden von selbst. Eine Meldung, die
 * verschwindet, während man gerade woanders hinsieht, ist keine Meldung,
 * sondern ein Ärgernis.
 */
function Blase({ gruesse, neuigkeit, weitere, onOeffnen, onWeg }) {
  return (
    <div className="no-print fixed bottom-20 right-5 z-40 w-[22rem] max-w-[calc(100vw-2.5rem)] bg-white border border-gray-300 border-l-4 border-l-sky">
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-gray-500">{gruesse}</div>
          <div className="font-headline text-sm text-night leading-snug mt-0.5">
            {neuigkeit.titel}
          </div>
        </div>
        <button className="text-gray-400 hover:text-night shrink-0 -mt-0.5"
                title="Nicht mehr anzeigen" onClick={onWeg}>
          <X size={15} />
        </button>
      </div>
      {neuigkeit.bild ? (
        <img src={neuigkeit.bild} alt="" className="w-full mt-2 border-t border-gray-200" />
      ) : null}
      <div className="px-3 py-2 text-xs text-gray-600 line-clamp-3">
        {neuigkeit.text.split('\n').filter(Boolean)[0]}
      </div>
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <button className="btn-primary text-xs px-3 py-1.5" onClick={onOeffnen}>
          Mehr dazu
        </button>
        {weitere > 0 ? (
          <span className="text-[11px] text-gray-400">
            und {weitere} weitere{weitere === 1 ? '' : ''}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default function Assistent({ projektId = null, projektName = null,
                                    benutzerName = null }) {
  const [status,  setStatus]  = useState(null)      // null = noch nicht gefragt
  const [offen,   setOffen]   = useState(false)
  const [liste,   setListe]   = useState([])
  const [chatId,  setChatId]  = useState(null)
  const [nachrichten, setNachrichten] = useState([])
  const [frage,   setFrage]   = useState('')
  const [laeuft,  setLaeuft]  = useState(false)
  const [fehler,  setFehler]  = useState(null)
  const [verlaufOffen, setVerlaufOffen] = useState(false)
  const [news,    setNews]    = useState([])

  const ende = useRef(null)
  const feld = useRef(null)
  const abbruch = useRef(null)

  // Ist überhaupt eine KI eingerichtet? Einmal fragen, dann steht es fest.
  useEffect(() => {
    let weg = false
    hole('/api/assistent/status')
      .then(s => { if (!weg) setStatus(s) })
      .catch(() => { if (!weg) setStatus({ eingerichtet: false }) })
    return () => { weg = true }
  }, [])

  useEffect(() => {
    try { if (localStorage.getItem(SPEICHER_OFFEN) === '1') setOffen(true) } catch { /* egal */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(SPEICHER_OFFEN, offen ? '1' : '0') } catch { /* egal */ }
  }, [offen])

  useEffect(() => {
    if (offen) ende.current?.scrollIntoView({ block: 'end' })
  }, [nachrichten, offen])

  useEffect(() => {
    if (!offen) return
    const h = (e) => { if (e.key === 'Escape' && !laeuft) setOffen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [offen, laeuft])

  const ladeListe = useCallback(() => {
    hole('/api/assistent/chats').then(setListe).catch(() => setListe([]))
  }, [])

  useEffect(() => { if (offen) ladeListe() }, [offen, ladeListe])

  const neu = useCallback(async () => {
    setFehler(null)
    try {
      const c = await hole('/api/assistent/chats', {
        method: 'POST', body: JSON.stringify({ projektId }),
      })
      setChatId(c.id)
      setNachrichten([])
      setVerlaufOffen(false)
      ladeListe()
      feld.current?.focus()
      return c.id
    } catch (e) { setFehler(e.message); return null }
  }, [projektId, ladeListe])

  const oeffne = useCallback(async (id) => {
    setFehler(null)
    try {
      const c = await hole(`/api/assistent/chats/${id}`)
      setChatId(c.id)
      const nn = (c.nachrichten || []).map(n => ({
        ...n,
        quellenDaten: n.quellen && !n.quellen.some(q => q.startsWith('neuigkeit:'))
          ? { quellen: n.quellen } : null,
      }))
      setNachrichten(nn)
      setVerlaufOffen(false)

      // Stammt die erste Nachricht aus einer Neuigkeit, wird ihr Bild
      // nachgeladen. In der Datenbank steht nur die Kennung — die data:-URL
      // wäre dort um ein Vielfaches größer als der Text.
      const kennung = (c.nachrichten || [])
        .flatMap(n => n.quellen || [])
        .find(q => typeof q === 'string' && q.startsWith('neuigkeit:'))
      if (kennung) {
        try {
          const e = await hole('/api/assistent/neuigkeiten/'
                               + encodeURIComponent(kennung.slice('neuigkeit:'.length)))
          if (e?.bild) {
            setNachrichten(v => v.map((n, i) => (i === 0 ? { ...n, bild: e.bild } : n)))
          }
        } catch { /* ohne Bild ist die Neuigkeit immer noch lesbar */ }
      }
    } catch (e) { setFehler(e.message) }
  }, [])

  // ── Neuigkeiten ───────────────────────────────────────────────────────────
  const ladeNews = useCallback(() => {
    hole('/api/assistent/neuigkeiten')
      .then(d => setNews(d?.neuigkeiten || []))
      .catch(() => setNews([]))
  }, [])

  useEffect(() => {
    if (status?.eingerichtet && status?.person) ladeNews()
  }, [status, ladeNews])

  const newsWeg = useCallback(async (kennungen) => {
    setNews([])
    try {
      await hole('/api/assistent/neuigkeiten/gesehen', {
        method: 'POST', body: JSON.stringify({ kennungen }),
      })
    } catch { /* beim nächsten Anmelden eben noch einmal */ }
  }, [])

  const newsOeffnen = useCallback(async (n) => {
    setFehler(null)
    setNews([])
    setOffen(true)
    try {
      const c = await hole('/api/assistent/chats', {
        method: 'POST',
        body: JSON.stringify({ projektId, neuigkeit: n.kennung }),
      })
      await oeffne(c.id)
      ladeListe()
    } catch (e) { setFehler(e.message) }
  }, [projektId, oeffne, ladeListe])

  const loesche = useCallback(async (id) => {
    try {
      await hole(`/api/assistent/chats/${id}`, { method: 'DELETE' })
      if (id === chatId) { setChatId(null); setNachrichten([]) }
      ladeListe()
    } catch (e) { setFehler(e.message) }
  }, [chatId, ladeListe])

  /**
   * Fragen und die Antwort beim Schreiben zusehen.
   *
   * Die Stücke kommen als Server-Sent Events. Ein Netz-Brocken endet nicht an
   * der Blockgrenze, deshalb wird gepuffert und nur bis zur letzten Leerzeile
   * ausgewertet — sonst gehen unregelmäßig Zeichen verloren.
   */
  const senden = useCallback(async () => {
    const text = frage.trim()
    if (!text || laeuft) return

    let id = chatId
    if (!id) { id = await neu(); if (!id) return }

    setFrage('')
    setFehler(null)
    setLaeuft(true)
    setNachrichten(v => [...v, { rolle: 'user', inhalt: text },
                               { rolle: 'assistant', inhalt: '' }])

    const steuerung = new AbortController()
    abbruch.current = steuerung

    const setzeLetzte = (patch) => setNachrichten(v => {
      const kopie = [...v]
      const i = kopie.length - 1
      kopie[i] = typeof patch === 'function' ? patch(kopie[i]) : { ...kopie[i], ...patch }
      return kopie
    })

    try {
      const res = await fetch(`/api/assistent/chats/${id}/fragen`, {
        method: 'POST', headers: koepfe(), signal: steuerung.signal,
        body: JSON.stringify({ frage: text, projektId }),
      })

      if (!res.ok || !res.body) {
        let grund = `Fehler ${res.status}`
        try { grund = (await res.json()).error || grund } catch { /* kein JSON */ }
        setzeLetzte({ fehler: grund })
        return
      }

      const leser = res.body.getReader()
      const dekoder = new TextDecoder('utf-8')
      let puffer = ''
      for (;;) {
        const { value, done } = await leser.read()
        if (done) break
        puffer += dekoder.decode(value, { stream: true })
        let grenze
        while ((grenze = puffer.indexOf('\n\n')) !== -1) {
          const block = puffer.slice(0, grenze)
          puffer = puffer.slice(grenze + 2)
          let art = null, roh = null
          for (const zeile of block.split('\n')) {
            if (zeile.startsWith('event: ')) art = zeile.slice(7).trim()
            else if (zeile.startsWith('data: ')) roh = zeile.slice(6)
          }
          if (!art) continue
          let daten = roh
          try { daten = JSON.parse(roh) } catch { /* roher Text */ }

          if (art === 'quellen')     setzeLetzte({ quellenDaten: daten })
          else if (art === 'text')   setzeLetzte(n => ({ ...n, inhalt: (n.inhalt || '') + daten }))
          else if (art === 'fertig') setzeLetzte({ knoten: daten?.knoten, dauer: daten?.dauer_s })
          else if (art === 'fehler') setzeLetzte({ fehler: String(daten) })
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') setzeLetzte({ fehler: 'Abgebrochen.' })
      else setzeLetzte({ fehler: 'Die Verbindung ist abgerissen.' })
    } finally {
      setLaeuft(false)
      abbruch.current = null
      ladeListe()
    }
  }, [frage, laeuft, chatId, neu, projektId, ladeListe])

  // Vor der Antwort des Status: nichts. Danach entweder nichts (nicht
  // eingerichtet) oder der Knopf.
  if (!status?.eingerichtet || !status?.person) return null

  const einstiege = [
    projektName ? `Was ist in ${projektName} noch offen?` : 'Welche Aufgaben sind überfällig?',
    projektName ? `Fasse den letzten Besprechungsstand von ${projektName} zusammen.`
                : 'Welche Projekte haben offene Aufgaben?',
    'Wie lege ich ein neues Protokoll an?',
  ]

  if (!offen) {
    const anrede = benutzerName ? `${gruss()}, ${benutzerName.split(' ')[0]}` : gruss()
    return (
      <>
        {news.length > 0 && (
          <Blase
            gruesse={anrede}
            neuigkeit={news[0]}
            weitere={news.length - 1}
            onOeffnen={() => newsOeffnen(news[0])}
            onWeg={() => newsWeg(news.map(n => n.kennung))}
          />
        )}
        <button
          className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-night text-white px-4 py-3 shadow-none border border-night hover:bg-brand-500 transition-colors"
          onClick={() => setOffen(true)}
          title={NAME_TEXT + ' öffnen'}
        >
          <Bot size={18} />
          <Name klasse="text-sm font-medium hidden sm:inline" />
          {news.length > 0 && (
            <span className="bg-sky text-night text-[11px] font-bold px-1.5 leading-5">
              {news.length}
            </span>
          )}
        </button>
      </>
    )
  }

  return (
    <div className="no-print fixed inset-y-0 right-0 z-40 w-full sm:w-[30rem] bg-light border-l border-gray-300 flex flex-col">
      {/* Kopf */}
      <div className="flex items-center gap-2 bg-night text-white px-4 py-3 shrink-0">
        <Bot size={18} />
        <div className="flex-1 min-w-0">
          <Name klasse="font-headline text-sm leading-tight block" />
          <div className="text-[11px] text-white/60 truncate">
            {projektName
              ? `Schwerpunkt: ${projektName}`
              : (typeof status.projekte === 'number'
                  ? `${status.projekte} ${status.projekte === 1 ? 'freigegebenes Projekt' : 'freigegebene Projekte'}`
                  : 'Projekte und Bedienung')}
          </div>
        </div>
        <button className="text-white/70 hover:text-white p-1" title="Neue Unterhaltung"
                onClick={neu} disabled={laeuft}>
          <Plus size={18} />
        </button>
        <button className="text-white/70 hover:text-white p-1" title="Schließen"
                onClick={() => setOffen(false)}>
          <X size={18} />
        </button>
      </div>

      {/* Frühere Unterhaltungen */}
      <div className="shrink-0 border-b border-gray-200 bg-white">
        <button
          className="w-full flex items-center gap-1 px-4 py-2 text-xs text-gray-600 hover:bg-concrete"
          onClick={() => setVerlaufOffen(o => !o)}
        >
          {verlaufOffen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Frühere Unterhaltungen ({liste.length})
        </button>
        {verlaufOffen && (
          <ul className="max-h-48 overflow-y-auto border-t border-gray-100">
            {liste.length === 0 && (
              <li className="px-4 py-2 text-xs text-gray-400">Noch keine.</li>
            )}
            {liste.map(c => (
              <li key={c.id} className={`flex items-center gap-2 px-4 py-1.5 text-xs hover:bg-concrete ${c.id === chatId ? 'bg-brand-50' : ''}`}>
                <button className="flex-1 text-left truncate" onClick={() => oeffne(c.id)}>
                  {c.titel}
                  <span className="text-gray-400"> · {vorWieLange(c.geaendertAm)}</span>
                </button>
                <button className="text-gray-400 hover:text-red-600 shrink-0"
                        title="Unterhaltung löschen" onClick={() => loesche(c.id)}>
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Der Verlauf */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {fehler && (
          <div className="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-800">
            {fehler}
          </div>
        )}

        {nachrichten.length === 0 && (
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 px-3 py-2.5 text-sm text-gray-700">
              Ich beantworte Fragen zu den Projekten, die für dich freigegeben
              sind, und zur Bedienung des Programms. Ich nenne dabei immer, worauf
              sich meine Antwort stützt.
              <div className="mt-1.5 text-xs text-gray-500">
                Ändern kann ich nichts — kein Protokoll anlegen, keine Aufgabe
                speichern, keine E-Mail senden.
              </div>
            </div>
            <div className="space-y-1.5">
              {einstiege.map((e, i) => (
                <button key={i}
                  className="w-full text-left text-xs bg-white border border-gray-200 px-3 py-2 hover:border-sky hover:bg-brand-50"
                  onClick={() => { setFrage(e); feld.current?.focus() }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {nachrichten.map((n, i) => <Nachricht key={i} n={n} />)}

        {laeuft && (
          <div className="text-xs text-gray-400">
            {nachrichten[nachrichten.length - 1]?.inhalt
              ? 'schreibt…'
              : 'sucht in den Projektdaten…'}
          </div>
        )}
        <div ref={ende} />
      </div>

      {/* Die Frage */}
      <div className="shrink-0 border-t border-gray-300 bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={feld}
            className="input flex-1 resize-none text-sm"
            rows={2}
            maxLength={status.frageZeichen || 8000}
            placeholder="Frage zum Projekt oder zum Programm…"
            value={frage}
            onChange={e => setFrage(e.target.value)}
            onKeyDown={e => {
              // Eingabe schickt, Umschalt+Eingabe macht eine neue Zeile. Wer
              // einen Absatz einwirft, will ihn nicht zeilenweise abschicken.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden() }
            }}
          />
          {laeuft ? (
            <button className="btn-secondary shrink-0 px-3 py-2"
                    onClick={() => abbruch.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn-primary shrink-0 px-3 py-2 disabled:opacity-40"
                    disabled={!frage.trim()} onClick={senden} title="Senden (Eingabe)">
              <Send size={16} />
            </button>
          )}
        </div>
        <div className="mt-1 text-[11px] text-gray-400">
          Antworten können Fehler enthalten. Die genannten Fundstellen sind die
          Probe — im Zweifel dort nachsehen.
        </div>
      </div>
    </div>
  )
}
