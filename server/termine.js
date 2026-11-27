'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Termine und Mitschriften
//
// Zwei Dinge, die zusammengehoeren, weil beide am selben Termin haengen:
//
//   Stufe 1  Die Termine aus dem Outlook-Kalender lesen und daraus ein
//            Protokoll VORBEREITEN -- Datum, Uhrzeit, Ort, Betreff und vor
//            allem die Teilnehmer. Die Eingeladenen werden gegen die
//            Kontaktdatenbank abgeglichen; wer dort steht, kommt mit Firma
//            und Rolle in die Anwesenheitsliste.
//
//   Stufe 2  Aus einem Transkript (Teams: "Transkript herunterladen" → .vtt)
//            Protokollpunkte VORSCHLAGEN. Immer nur Vorschlag, immer mit
//            Pruefschritt. Eine Besprechung besteht nicht aus dem, was
//            gesagt wurde, sondern aus dem, was gilt -- und das entscheidet
//            der Mensch, der das Protokoll zeichnet.
//
// ── Was diese Datei bewusst NICHT tut ───────────────────────────────────────
//
// Sie holt das Transkript nicht selbst bei Microsoft ab. Das koennte Graph
// (/onlineMeetings/{id}/transcripts, Berechtigung
// OnlineMeetingTranscript.Read.All), es haette aber drei Haken: Es greift nur,
// wenn in der Besprechung wirklich transkribiert wurde; Microsoft rechnet das
// Abholen der Inhalte ueber ein Azure-Abo nach Nutzung ab; und es geht nur fuer
// Besprechungen, deren Organisator im eigenen Tenant sitzt. Der Umweg ueber
// die heruntergeladene Datei kostet einen Handgriff, dafuer nichts weiter --
// und er funktioniert auch mit Transkripten aus Zoom oder Webex.
//
// Sie nimmt auch nichts auf. Der Mitschnitt einer Besprechung im Baucontainer
// waere der eigentliche Hebel, ist aber ohne Zustimmung JEDES Anwesenden eine
// Straftat (§ 201 StGB) -- kein Datenschutzverstoss, eine Straftat. Solange
// nicht geklaert ist, wie diese Zustimmung in der Praxis eingeholt und
// nachgewiesen wird, gehoert dafuer kein Knopf in die Oberflaeche.
//
// ── Welche Postfaecher gelesen werden ───────────────────────────────────────
//
// Anwendungsberechtigungen in Graph gelten tenantweit: mit Calendars.Read
// koennte diese Anwendung JEDEN Kalender im Haus lesen. Deshalb entscheidet
// nicht die Person, welches Postfach sie sehen will, sondern diese Datei:
//
//   * das EIGENE Postfach -- die Adresse aus der Benutzerverwaltung, die nur
//     ein Administrator setzen kann (/api/auth/users/:username/email)
//   * zusaetzlich die gemeinsamen Kalender aus TERMINE_KALENDER (Kommaliste,
//     z.B. ein Projektkalender) -- auch das eine Entscheidung des Betriebs,
//     nicht der Nutzung
//
// Ein Eingabefeld "fremdes Postfach" gibt es absichtlich nicht. Sonst liest
// der Erste, der es ausprobiert, den Kalender der Geschaeftsfuehrung. Zweite
// Mauer dazu: eine Application Access Policy in Exchange Online, die die App
// tenantseitig auf diese Postfaecher beschraenkt (siehe server/graph.js).
//
// Private Termine (sensitivity 'private') und abgesagte werden nie
// ausgeliefert. Ein Zahnarzttermin hat in einem Bautagebuch nichts zu suchen.
// ─────────────────────────────────────────────────────────────────────────────

const graph = require('./graph')
const ki    = require('./ki')

// Zeitzone fuer die Rueckgabe. Graph rechnet damit selbst um, dadurch muss
// hier nichts gerechnet werden -- und Sommerzeit ist kein Thema.
const ZEITZONE = process.env.TERMINE_ZEITZONE || 'W. Europe Standard Time'

const TAGE_VORAUS  = 21
const TAGE_ZURUECK = 14
const MAX_TERMINE  = 60

// ── Postfaecher ──────────────────────────────────────────────────────────────

const istAdresse = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())

/**
 * Welche Postfaecher diese Person sehen darf.
 * `eigene` = Adresse aus der Benutzerverwaltung, `geteilt` aus TERMINE_KALENDER.
 */
function postfaecherFuer(eigeneAdresse, geteiltRoh = process.env.TERMINE_KALENDER) {
  const raus = []
  const gesehen = new Set()
  const dazu = (adresse, art) => {
    const a = String(adresse || '').trim().toLowerCase()
    if (!istAdresse(a) || gesehen.has(a)) return
    gesehen.add(a)
    raus.push({ adresse: a, art })
  }
  dazu(eigeneAdresse, 'eigener')
  for (const a of String(geteiltRoh || '').split(/[,;]/)) dazu(a, 'geteilt')
  return raus.slice(0, 6)
}

// ── Termine aus der Graph-Antwort ────────────────────────────────────────────

// Graph liefert '2026-11-27T09:00:00.0000000' (ohne Zone, dafuer in ZEITZONE).
const datumAus = (w) => String(w?.dateTime || '').slice(0, 10)
const zeitAus  = (w) => String(w?.dateTime || '').slice(11, 16)

/**
 * Die Rohantwort von /calendarView in das Format dieser Anwendung.
 * Abgesagte und als privat markierte Termine fallen weg.
 */
function termineAus(antwort, postfach = null) {
  const liste = Array.isArray(antwort?.value) ? antwort.value : []
  return liste
    .filter(t => !t.isCancelled && t.sensitivity !== 'private')
    .map(t => ({
      id:        String(t.id || ''),
      icalUid:   String(t.iCalUId || t.id || ''),
      betreff:   String(t.subject || '').trim(),
      datum:     datumAus(t.start),
      zeit:      t.isAllDay ? '' : zeitAus(t.start),
      endeZeit:  t.isAllDay ? '' : zeitAus(t.end),
      ganztags:  !!t.isAllDay,
      serie:     t.type === 'occurrence' || t.type === 'exception',
      ort:       String(t.location?.displayName || '').trim(),
      onlineUrl: String(t.onlineMeeting?.joinUrl || t.onlineMeetingUrl || '').trim(),
      online:    !!(t.isOnlineMeeting || t.onlineMeeting?.joinUrl),
      organisator: {
        name:  String(t.organizer?.emailAddress?.name || '').trim(),
        email: String(t.organizer?.emailAddress?.address || '').trim().toLowerCase(),
      },
      eingeladene: (Array.isArray(t.attendees) ? t.attendees : [])
        .filter(a => a?.emailAddress?.address || a?.emailAddress?.name)
        .map(a => ({
          name:    String(a.emailAddress?.name || '').trim(),
          email:   String(a.emailAddress?.address || '').trim().toLowerCase(),
          zusage:  String(a.status?.response || '').trim(),   // accepted|declined|...
          pflicht: a.type !== 'optional',
        }))
        .slice(0, 60),
      postfach,
    }))
    .filter(t => t.datum)
}

/** Ein Zeitfenster um heute, als ISO-Zeitpunkte fuer calendarView. */
function fenster(tageZurueck = TAGE_ZURUECK, tageVoraus = TAGE_VORAUS, jetzt = new Date()) {
  const tag = 24 * 60 * 60 * 1000
  const von = new Date(jetzt.getTime() - Math.max(0, tageZurueck) * tag)
  const bis = new Date(jetzt.getTime() + Math.max(1, tageVoraus)  * tag)
  const iso = (d) => d.toISOString().slice(0, 19)
  return { von: iso(von), bis: iso(bis) }
}

const FELDER = [
  'id', 'iCalUId', 'subject', 'start', 'end', 'location', 'isAllDay', 'isCancelled',
  'sensitivity', 'organizer', 'attendees', 'isOnlineMeeting', 'onlineMeeting',
  'onlineMeetingUrl', 'type',
].join(',')

/** Termine eines Postfachs holen. */
async function termineHolen(postfach, { tageZurueck, tageVoraus } = {}) {
  const { von, bis } = fenster(tageZurueck, tageVoraus)
  const pfad = `/users/${encodeURIComponent(postfach)}/calendarView`
             + `?startDateTime=${von}&endDateTime=${bis}`
             + `&$select=${FELDER}&$orderby=start/dateTime&$top=${MAX_TERMINE}`
  const antwort = await graph.graphFetch(pfad, {
    headers: { Prefer: `outlook.timezone="${ZEITZONE}"` },
  })
  return termineAus(antwort, postfach)
}

// ── Eingeladene → Teilnehmerliste ───────────────────────────────────────────

/**
 * Aus den Eingeladenen eines Termins die Anwesenheitsliste des Protokolls.
 *
 * Wer in den Kontakten steht, kommt mit Firma und Rolle -- das ist der
 * eigentliche Gewinn der Kalenderanbindung: die Liste, die man sonst vor
 * jedem Jour fixe neu zusammensucht. Wer nicht, kommt mit dem Namen aus der
 * Einladung; eine Adresse ohne Namen bleibt die Adresse.
 *
 * `present` richtet sich nach der Zusage: wer abgelehnt hat, steht als
 * abwesend drin statt zu fehlen. Eine Einladung ist keine Anwesenheit,
 * deshalb ist das ein Vorschlag und am Ende hakt es jemand ab.
 */
function teilnehmerAus(termin, kontakte = []) {
  const nachEmail = new Map()
  for (const k of kontakte) {
    const e = String(k?.email || '').trim().toLowerCase()
    if (e && !nachEmail.has(e)) nachEmail.set(e, k)
  }

  const alle = [
    { ...(termin?.organisator || {}), zusage: 'organizer', pflicht: true },
    ...(termin?.eingeladene || []),
  ]
  const gesehen = new Set()
  const raus = []
  for (const p of alle) {
    const email = String(p.email || '').trim().toLowerCase()
    const name  = String(p.name  || '').trim()
    const key   = email || name.toLowerCase()
    if (!key || gesehen.has(key)) continue
    gesehen.add(key)
    const k = email ? nachEmail.get(email) : null
    raus.push({
      name:      k?.name || name || email,
      company:   k?.company || '',
      role:      k?.role || '',
      email:     email || k?.email || '',
      present:   p.zusage !== 'declined',
      contactId: k?.id || null,
      // Nur zur Anzeige im Vorschlag, nicht Teil des Protokollmodells.
      _bekannt:  !!k,
      _zusage:   p.zusage || '',
    })
  }
  return raus
}

// ── Transkript lesen (.vtt / Text) ──────────────────────────────────────────

// Eine Zeile, die nur eine Sprechernummer oder Block-ID ist.
const istKennung = (z) => /^\d+$/.test(z) || /^[0-9a-f-]{8,}(\/\d+-\d+)?$/i.test(z)

/**
 * Aus einer .vtt-Datei (oder beliebigem Text) die Rede: eine Liste
 * { sprecher, text }, aufeinanderfolgende Zeilen derselben Person
 * zusammengefasst.
 *
 * Warum nicht einfach alles an die KI geben: In einer .vtt steht zu jedem
 * halben Satz ein Zeitstempel. Das ist die Haelfte der Zeichen, kostet die
 * Haelfte der Rechenzeit und verwirrt das Modell -- es fing an, Uhrzeiten als
 * Fristen zu lesen.
 */
function redeAus(roh) {
  const zeilen = String(roh || '').replace(/\r/g, '').split('\n')
  const turns = []
  let ueberspringen = false

  for (const rohZeile of zeilen) {
    const z = rohZeile.trim()
    if (!z) { ueberspringen = false; continue }
    if (/^WEBVTT/i.test(z)) continue
    if (/^(NOTE|STYLE|REGION)\b/i.test(z)) { ueberspringen = true; continue }
    if (ueberspringen) continue
    if (z.includes('-->')) continue
    if (istKennung(z)) continue

    // <v Max Mustermann>Text</v>  – so schreibt Teams die Sprecher
    let sprecher = ''
    let text = z
    const m = /^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/i.exec(z)
    if (m) { sprecher = m[1].trim(); text = m[2] }
    else {
      // "Max Mustermann: Text" – so sehen abgetippte Mitschriften aus
      const m2 = /^([A-ZÄÖÜ][^:]{1,60}?):\s+(.*)$/.exec(z)
      if (m2) { sprecher = m2[1].trim(); text = m2[2] }
    }
    text = text.replace(/<[^>]*>/g, '').trim()
    if (!text) continue

    const letzte = turns[turns.length - 1]
    if (letzte && letzte.sprecher === sprecher) letzte.text += ' ' + text
    else turns.push({ sprecher, text })
  }
  return turns
}

/** Die Rede als Text, wie sie der KI vorgelegt wird. */
const redeText = (turns) =>
  turns.map(t => (t.sprecher ? `${t.sprecher}: ${t.text}` : t.text)).join('\n')

/**
 * Die Rede in Abschnitte teilen, die einzeln ans Modell gehen.
 *
 * Ein Wortbeitrag wird nie zerschnitten (ausser er ist allein zu lang) -- ein
 * halber Satz an der Abschnittsgrenze erzeugt sonst zwei halbe Protokollpunkte.
 */
function abschnitte(turns, maxZeichen = 6000, maxAbschnitte = 8) {
  const raus = []
  let jetzt = []
  let laenge = 0
  const schliessen = () => { if (jetzt.length) { raus.push(jetzt); jetzt = []; laenge = 0 } }

  for (const t of turns) {
    const zeile = (t.sprecher ? t.sprecher + ': ' : '') + t.text
    if (zeile.length > maxZeichen) {
      schliessen()
      for (let i = 0; i < zeile.length; i += maxZeichen) {
        raus.push([{ sprecher: t.sprecher, text: zeile.slice(i, i + maxZeichen) }])
      }
      continue
    }
    if (laenge + zeile.length > maxZeichen) schliessen()
    jetzt.push(t)
    laenge += zeile.length + 1
  }
  schliessen()

  return { teile: raus.slice(0, maxAbschnitte), gekuerzt: raus.length > maxAbschnitte }
}

// ── Antwort des Modells auswerten ───────────────────────────────────────────

/**
 * Das JSON aus einer Modellantwort. Modelle schreiben gern einen Satz davor,
 * einen Zaun drumherum oder beides.
 */
function jsonAus(text) {
  const s = String(text || '')
  const ohneZaun = s.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '')

  const versuche = []
  const a = ohneZaun.indexOf('{'); const b = ohneZaun.lastIndexOf('}')
  if (a !== -1 && b > a) versuche.push({ pos: a, text: ohneZaun.slice(a, b + 1) })
  const c = ohneZaun.indexOf('['); const d = ohneZaun.lastIndexOf(']')
  if (c !== -1 && d > c) versuche.push({ pos: c, text: ohneZaun.slice(c, d + 1) })

  // Nach der Position der OEFFNENDEN Klammer, nicht nach Vorliebe: Bei
  // '[{"thema":"A"}]' steht die geschweifte Klammer zwar auch drin, aber
  // innen. Wer sie zuerst nimmt, bekommt den ersten Punkt heraus und verliert
  // alle anderen -- und zwar still.
  versuche.sort((x, y) => x.pos - y.pos)
  for (const v of versuche) {
    try { return JSON.parse(v.text) } catch { /* der naechste Versuch */ }
  }
  return null
}

const kurz = (w, max) => String(w ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Ein Datum nur dann, wenn es eines ist und in der Naehe liegt. */
function fristAus(wert, jetzt = new Date()) {
  const s = kurz(wert, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(s + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  const jahr = 365 * 24 * 60 * 60 * 1000
  if (d < new Date(jetzt.getTime() - jahr) || d > new Date(jetzt.getTime() + 3 * jahr)) return ''
  return s
}

/**
 * Die Punkte aus einer Modellantwort -- geprueft, gekuerzt, ohne Leerzeug.
 * Was kein Thema hat, ist kein Protokollpunkt.
 */
function punkteAus(text, jetzt = new Date()) {
  const j = jsonAus(text)
  // Drei Formen kommen vor: die erbetene {punkte:[...]}, ein nacktes Array,
  // und -- bei genau einem Punkt -- der Punkt selbst.
  const liste = Array.isArray(j) ? j
              : Array.isArray(j?.punkte) ? j.punkte
              : (j && (j.thema || j.topic)) ? [j]
              : []
  const raus = []
  for (const p of liste) {
    const thema = kurz(p?.thema || p?.topic, 180)
    if (!thema) continue
    const art = String(p?.art || '').toLowerCase() === 'massnahme' ? 'massnahme' : 'feststellung'
    raus.push({
      thema,
      besprochen: kurz(p?.besprochen || p?.discussion, 1500),
      ergebnis:   kurz(p?.ergebnis   || p?.result,     800),
      art,
      zustaendig: kurz(p?.zustaendig || p?.responsible, 120),
      frist:      fristAus(p?.frist || p?.deadline, jetzt),
    })
  }
  return raus
}

/** Zwei Vorschlaege zum selben Thema sind einer. */
function ohneDoppelte(punkte, max = 40) {
  const gesehen = new Set()
  const raus = []
  for (const p of punkte) {
    const k = p.thema.toLowerCase().replace(/[^a-zäöüß0-9]/g, '')
    if (!k || gesehen.has(k)) continue
    gesehen.add(k)
    raus.push(p)
    if (raus.length >= max) break
  }
  return raus
}

// ── Der Auftrag an das Modell ───────────────────────────────────────────────

const SYSTEM = `Du bist Protokollführer in einem Architekturbüro und arbeitest die Mitschrift einer Besprechung in Protokollpunkte um.

Regeln:
- Nur was GESAGT wurde. Nichts ergänzen, nichts ausschmücken, nichts annehmen.
- Ein Punkt je Sachthema, nicht je Wortbeitrag. Geplauder, Begrüßung und Verabschiedung sind keine Punkte.
- "art": "massnahme", wenn jemand etwas TUN soll; sonst "feststellung".
- "zustaendig": nur ein Name, der wirklich genannt wurde. Sonst leer lassen.
- "frist": nur als Datum JJJJ-MM-TT, wenn ein Datum genannt wurde. "nächste Woche" ist kein Datum – dann leer lassen.
- Sachlich, knapp, im Perfekt oder Präsens. Keine wörtliche Rede.
- Deutsch.

Antworte AUSSCHLIESSLICH mit JSON in dieser Form, ohne Text davor oder danach:
{"punkte":[{"thema":"","besprochen":"","ergebnis":"","art":"feststellung","zustaendig":"","frist":""}]}`

function auftrag({ text, projektName, betreff, teil, von, hinweis }) {
  const kopf = [
    projektName ? `Projekt: ${projektName}` : null,
    betreff     ? `Besprechung: ${betreff}` : null,
    von > 1     ? `Abschnitt ${teil} von ${von} der Mitschrift.` : null,
    hinweis     ? `Hinweis des Protokollführers: ${kurz(hinweis, 300)}` : null,
  ].filter(Boolean).join('\n')

  return (kopf ? kopf + '\n\n' : '') + 'Mitschrift:\n' + text
}

/** Einen Abschnitt durch die KI schicken und die Punkte zurueckgeben. */
async function abschnittFragen(nachricht, maxTokens = 1800) {
  const teile = []
  let abschluss = null
  let fehler = null
  for await (const e of ki.unterhalten({
    nachrichten: [{ role: 'user', content: nachricht }],
    system: SYSTEM, anwendung: 'protokolle', maxTokens, temperature: 0.2,
  })) {
    if (e.art === 'text')        teile.push(e.nutzlast)
    else if (e.art === 'fertig') abschluss = e.nutzlast
    else if (e.art === 'fehler') fehler = String(e.nutzlast)
  }
  return { text: teile.join(''), abschluss, fehler }
}

// ── Routen ──────────────────────────────────────────────────────────────────

const ZUORDNUNG_KEY = 'termine_zuordnung'
const ZUORDNUNG_MAX = 2000

function registerTermine(app, { db, requireAuth, writeLimiter, canAccessProject, logEvent }) {

  const eigeneAdresse = (benutzer) => {
    if (!benutzer || benutzer.startsWith('__')) return ''
    try { return String(db.users.get(benutzer)?.email || '').trim() } catch { return '' }
  }

  const zuordnungLesen = () => {
    try { return JSON.parse(db.appState.get(ZUORDNUNG_KEY) || '{}') } catch { return {} }
  }
  const zuordnungSchreiben = (map) => {
    // Beim Deckel die aeltesten Eintraege fallen lassen -- ein Termin von
    // vorletztem Jahr muss nicht ewig zugeordnet bleiben.
    const paare = Object.entries(map)
    if (paare.length > ZUORDNUNG_MAX) {
      paare.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0))
      map = Object.fromEntries(paare.slice(0, ZUORDNUNG_MAX))
    }
    db.appState.set(ZUORDNUNG_KEY, JSON.stringify(map))
  }

  // Was die Oberflaeche wissen muss, um zu entscheiden, ob sie den Bereich
  // ueberhaupt zeigt -- und was fehlt, wenn nicht.
  app.get('/api/termine/status', requireAuth, (req, res) => {
    const auth   = graph.graphAuth()
    const eigene = eigeneAdresse(req.user)
    const faecher = auth ? postfaecherFuer(eigene) : []
    res.json({
      eingerichtet: !!auth && faecher.length > 0,
      graph:        !!auth,
      grund: !auth ? ('Microsoft Graph ist nicht eingerichtet (' + graph.warumNicht() + ')')
           : !faecher.length ? 'Für Ihren Zugang ist keine E-Mail-Adresse eingetragen. '
                             + 'Ein Administrator kann sie in der Benutzerverwaltung ergänzen.'
           : null,
      postfaecher: faecher,
      ki:          ki.eingerichtet(),
      kiGrund:     ki.warumNicht(),
    })
  })

  // Die Termine der eigenen (und der freigegebenen gemeinsamen) Kalender.
  app.get('/api/termine', requireAuth, async (req, res) => {
    try {
      const auth = graph.graphAuth()
      if (!auth) return res.status(503).json({ error: 'Microsoft Graph ist nicht eingerichtet (' + graph.warumNicht() + ')' })

      const faecher = postfaecherFuer(eigeneAdresse(req.user))
      if (!faecher.length) {
        return res.status(409).json({ error: 'Für diesen Zugang ist keine E-Mail-Adresse eingetragen.' })
      }

      const tageVoraus  = Math.min(90, Math.max(1, parseInt(req.query.voraus  || TAGE_VORAUS,  10) || TAGE_VORAUS))
      const tageZurueck = Math.min(90, Math.max(0, parseInt(req.query.zurueck || TAGE_ZURUECK, 10) || TAGE_ZURUECK))

      const termine = []
      const probleme = []
      for (const f of faecher) {
        try {
          termine.push(...await termineHolen(f.adresse, { tageVoraus, tageZurueck }))
        } catch (e) {
          // Ein Postfach, das nicht geht, darf die anderen nicht mitnehmen.
          // Haeufigster Fall: 403, weil die Zugriffsrichtlinie dieses Postfach
          // ausschliesst oder Calendars.Read noch nicht erteilt ist.
          console.error('[termine] %s: %s', f.adresse, e?.message || e)
          probleme.push({
            postfach: f.adresse,
            grund: e?.status === 403
              ? 'Die App darf diesen Kalender nicht lesen (Calendars.Read fehlt oder die Zugriffsrichtlinie schließt ihn aus).'
              : e?.status === 404 ? 'Postfach nicht gefunden.'
              : 'Der Kalender war nicht lesbar.',
          })
        }
      }

      // Doppelte (derselbe Termin in zwei gelesenen Kalendern) fallen weg.
      const gesehen = new Set()
      const einmal = termine.filter(t => {
        const k = t.icalUid || t.id
        if (gesehen.has(k)) return false
        gesehen.add(k); return true
      }).sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit))

      const zuordnung = zuordnungLesen()
      res.json({
        termine: einmal.map(t => ({ ...t, projektId: zuordnung[t.icalUid]?.projektId ?? null })),
        probleme,
      })
    } catch (e) {
      console.error('[termine] Abruf gescheitert:', e?.message || e)
      res.status(502).json({ error: 'Die Termine waren nicht abrufbar.' })
    }
  })

  // Welcher Termin zu welchem Projekt gehoert. Geteilt, nicht persoenlich:
  // ordnet einer den Jour fixe dem Projekt zu, sehen es die anderen auch.
  app.put('/api/termine/zuordnung', requireAuth, writeLimiter, (req, res) => {
    try {
      const icalUid  = kurz(req.body?.icalUid, 300)
      const projektId = req.body?.projektId ? kurz(req.body.projektId, 80) : null
      if (!icalUid) return res.status(400).json({ error: '"icalUid" fehlt.' })

      if (projektId) {
        const projekt = db.projects.get(projektId)
        if (!projekt) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
        if (!canAccessProject(projekt, req.user)) {
          return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
        }
      }

      const map = zuordnungLesen()
      if (projektId) map[icalUid] = { projektId, ts: Date.now() }
      else delete map[icalUid]
      zuordnungSchreiben(map)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // Stufe 2: Transkript → Vorschlag fuer Protokollpunkte.
  app.post('/api/termine/mitschrift', requireAuth, writeLimiter, async (req, res) => {
    const t0 = Date.now()
    try {
      if (!ki.eingerichtet()) {
        return res.status(503).json({ error: 'Die Verbindung zur KI ist nicht eingerichtet (' + ki.warumNicht() + ')' })
      }

      const roh = String(req.body?.text || '')
      if (roh.trim().length < 80) {
        return res.status(400).json({ error: 'Die Mitschrift ist zu kurz, um daraus Punkte zu machen.' })
      }
      if (roh.length > 2_000_000) {
        return res.status(413).json({ error: 'Die Mitschrift ist zu groß.' })
      }

      let projektName = ''
      if (req.body?.projektId) {
        const projekt = db.projects.get(String(req.body.projektId))
        if (!projekt) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
        if (!canAccessProject(projekt, req.user)) {
          return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
        }
        projektName = projekt.name || ''
      }

      const turns = redeAus(roh)
      if (!turns.length) {
        return res.status(400).json({ error: 'In der Datei war kein gesprochener Text zu finden. '
                                          + 'Aus Teams passt das Format .vtt; .docx kann hier nicht gelesen werden.' })
      }

      const { teile, gekuerzt } = abschnitte(turns)
      const alle = []
      let modell = null
      let fehler = null

      // Nacheinander, nicht gleichzeitig: Die KI-Farm gibt je Anfrage eine
      // Karte frei. Fuenf Abschnitte parallel wuerden fuenf Karten belegen,
      // auch die, an denen jemand sitzt.
      for (let i = 0; i < teile.length; i++) {
        const nachricht = auftrag({
          text: redeText(teile[i]),
          projektName,
          betreff: kurz(req.body?.betreff, 200),
          hinweis: req.body?.hinweis,
          teil: i + 1, von: teile.length,
        })
        const { text, abschluss, fehler: f } = await abschnittFragen(nachricht)
        if (f) { fehler = f; break }
        if (abschluss?.modell) modell = abschluss.modell
        const punkte = punkteAus(text)
        // Eine Antwort ohne brauchbares JSON ist kein Grund, alles
        // wegzuwerfen -- die anderen Abschnitte koennen gut sein.
        if (!punkte.length && !text.trim()) fehler = 'Die KI hat zu einem Abschnitt nichts geantwortet.'
        alle.push(...punkte)
      }

      if (!alle.length) {
        return res.status(502).json({ error: fehler || 'Die KI konnte aus der Mitschrift keine Punkte ableiten.' })
      }

      const punkte = ohneDoppelte(alle)
      if (typeof logEvent === 'function') {
        logEvent('MITSCHRIFT', req, `zeichen=${roh.length} abschnitte=${teile.length} punkte=${punkte.length}`)
      }
      res.json({
        punkte,
        abschnitte: teile.length,
        gekuerzt,
        wortbeitraege: turns.length,
        modell,
        dauerS: Math.round((Date.now() - t0) / 100) / 10,
        // Auch bei Teilerfolg gesagt bekommen, dass etwas schieflief.
        hinweis: fehler || null,
      })
    } catch (e) {
      console.error('[termine] Mitschrift gescheitert:', e?.message || e)
      res.status(500).json({ error: 'Die Mitschrift konnte nicht ausgewertet werden.' })
    }
  })
}

module.exports = {
  registerTermine,
  // nur fuer die Pruefungen
  postfaecherFuer, termineAus, teilnehmerAus, redeAus, redeText, abschnitte,
  jsonAus, punkteAus, ohneDoppelte, fristAus, fenster,
}
