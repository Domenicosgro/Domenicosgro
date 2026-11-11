'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Vermittler zur KI-Farm des Dashboards.
//
// Einzige Stelle in dieser Anwendung, die weiss, wo die Sprachmodelle stehen --
// und sie weiss es nicht genau: Sie kennt nur das Dashboard. Dort entscheidet
// ki._reservieren, welche Karte eine Anfrage bekommt, und zwar nach Rang,
// gemeldeter GPU-Last und dem Schalter "nur leicht". Genau deshalb geht diese
// Anwendung nicht direkt an LM Studio: Eine eigene Leitung wuerde an dieser
// Auswahl vorbeilaufen und auf einer Karte rechnen, an der jemand sitzt.
//
// Gegenstueck: komplizen-dashboard/app/routes/ki.py (POST /api/ki/dienst/
// unterhalten) und docs/ARCHITEKTUR_ASSISTENTEN.md dort.
//
// Gegenrichtung derselben Bruecke: server/stammdaten.js gibt dem Dashboard
// Projekte und Mitarbeiter heraus. Dort ist der Schluessel X-Stammdaten-Key,
// hier X-KI-Key. Zwei Schluessel, zwei Richtungen, keiner oeffnet beides.
// ─────────────────────────────────────────────────────────────────────────────

const URL_DASHBOARD = (process.env.KI_DASHBOARD_URL || '').replace(/\/+$/, '')
const SCHLUESSEL    = process.env.KI_DASHBOARD_KEY || ''
// Wie lange eine ganze Antwort dauern darf. Das Dashboard bricht nach
// KI_TIMEOUT (dort 120 s) gegenueber dem Rechner ab; hier muss mehr Luft sein,
// sonst reisst die Leitung von dieser Seite, waehrend dort noch alles gut ist --
// und der Fehler sieht dann nach einem Problem der Farm aus.
const ZEITGRENZE_MS = Number(process.env.KI_TIMEOUT_MS || 180000)

function eingerichtet() {
  return Boolean(URL_DASHBOARD && SCHLUESSEL)
}

/**
 * Warum es nicht eingerichtet ist -- in Worten, die in der Oberflaeche
 * stehen duerfen. Null, wenn alles da ist.
 */
function warumNicht() {
  if (!URL_DASHBOARD && !SCHLUESSEL) return 'KI_DASHBOARD_URL und KI_DASHBOARD_KEY fehlen.'
  if (!URL_DASHBOARD) return 'KI_DASHBOARD_URL fehlt.'
  if (!SCHLUESSEL)    return 'KI_DASHBOARD_KEY fehlt.'
  return null
}

/**
 * Die Bloecke eines SSE-Stroms, sobald sie vollstaendig sind.
 *
 * Ein Netz-Brocken endet nicht an der Blockgrenze: "event: text\ndata: "Gr"
 * kann in einem Brocken stehen und der Rest im naechsten. Wer je Brocken
 * auswertet, verliert Zeichen -- und zwar unregelmaessig, also genau die Art
 * Fehler, die man einmal pro Woche sieht und nie nachstellen kann. Deshalb
 * wird gesammelt und nur bis zur letzten Leerzeile ausgewertet.
 */
async function* bloecke(leser) {
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
      if (block.trim()) yield block
    }
  }
  if (puffer.trim()) yield puffer
}

function auswerten(block) {
  let art = null, roh = null
  for (const zeile of block.split('\n')) {
    if (zeile.startsWith('event: ')) art = zeile.slice(7).trim()
    else if (zeile.startsWith('data: ')) roh = zeile.slice(6)
  }
  if (!art) return null
  let nutzlast = roh
  try { nutzlast = JSON.parse(roh) } catch { /* roher Text ist auch eine Antwort */ }
  return { art, nutzlast }
}

/**
 * Eine Unterhaltung ueber die Farm fuehren.
 *
 * Ergibt nacheinander { art, nutzlast }:
 *   art 'text'   -> ein Stueck der Antwort
 *   art 'fertig' -> { text, modell, knoten, dauer_s }
 *   art 'fehler' -> Klartext; danach ist Schluss
 *
 * Wirft nicht: Jeder Fehlschlag kommt als 'fehler'-Ereignis heraus. Der
 * Aufrufer stroemt zum Browser und kann dort nicht mehr auf eine Ausnahme
 * umschwenken, wenn die ersten Worte schon beim Leser sind.
 */
async function* unterhalten({ nachrichten, system, maxTokens = 1500,
                              temperature = 0.4, anwendung = 'protokolle',
                              modell = null }) {
  if (!eingerichtet()) {
    yield { art: 'fehler', nutzlast: 'Die Verbindung zur KI des Dashboards ist nicht eingerichtet (' + warumNicht() + ')' }
    return
  }

  const abbruch = AbortSignal.timeout(ZEITGRENZE_MS)
  let antwort
  try {
    antwort = await fetch(URL_DASHBOARD + '/api/ki/dienst/unterhalten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KI-Key': SCHLUESSEL },
      body: JSON.stringify({ nachrichten, system, max_tokens: maxTokens,
                             temperature, anwendung, modell }),
      signal: abbruch,
    })
  } catch (e) {
    // Bewusst ohne den Text der Ausnahme: Darin stehen Adresse, Port und
    // Wiederholungszaehler, und das Ganze landet am Ende in der Oberflaeche.
    console.error('[ki] Dashboard nicht erreichbar:', e?.message || e)
    yield { art: 'fehler', nutzlast: 'Das Dashboard ist nicht erreichbar. Der Assistent kann gerade nicht antworten.' }
    return
  }

  if (!antwort.ok) {
    let grund = 'Das Dashboard hat die Anfrage abgelehnt (HTTP ' + antwort.status + ').'
    try {
      const j = await antwort.json()
      if (j && j.fehler) grund = j.fehler
    } catch { /* keine JSON-Begruendung, dann bleibt die allgemeine */ }
    // 403 heisst hier fast immer: die beiden Schluessel stimmen nicht
    // ueberein. Das soll im Betriebsprotokoll stehen, nicht nur im Browser.
    if (antwort.status === 403 || antwort.status === 503) {
      console.error('[ki] Dienstzugang abgelehnt (%d): %s', antwort.status, grund)
    }
    yield { art: 'fehler', nutzlast: grund }
    return
  }

  if (!antwort.body) {
    yield { art: 'fehler', nutzlast: 'Das Dashboard hat nichts geschickt.' }
    return
  }

  const leser = antwort.body.getReader()
  try {
    for await (const block of bloecke(leser)) {
      const e = auswerten(block)
      if (e) yield e
    }
  } catch (e) {
    console.error('[ki] Strom abgerissen:', e?.message || e)
    yield { art: 'fehler', nutzlast: 'Die Antwort ist unterwegs abgerissen.' }
  } finally {
    try { await leser.cancel() } catch { /* schon zu */ }
  }
}

module.exports = { eingerichtet, warumNicht, unterhalten,
                   // nur fuer die Pruefungen
                   _auswerten: auswerten, _bloecke: bloecke }
