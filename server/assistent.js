'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Der Assistent des Protokolltools.
//
// Beantwortet zwei Arten von Fragen: solche zu den Bauprojekten dieses Büros
// und solche zur Bedienung des Programms. Er liest nur — anlegen, speichern
// und versenden bleibt bei den Menschen.
//
// Die Rechtegrenze liegt hier, nicht im Dashboard. Der Grund steht in
// komplizen-dashboard/docs/ARCHITEKTUR_ASSISTENTEN.md: Der Dienstschlüssel,
// mit dem das Dashboard die Stammdaten liest, ist in canAccessProject ein
// Benutzer namens `__apikey__` und sieht damit jedes Projekt. Ein Assistent
// darauf hätte genau die Grenze aufgehoben, um die es geht. Also läuft jede
// Lesung hier durch dieselbe Funktion wie die Oberfläche.
//
//   server/kontext.js  — was zu einer Frage gehört (und was die Person darf)
//   server/ki.js       — der Weg zur Farm, über das Dashboard
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')
const rateLimit = require('express-rate-limit')

const ki = require('./ki')
const kontext = require('./kontext')
const neuigkeiten = require('./neuigkeiten')

// So viele Zeichen nimmt eine einzelne Frage höchstens an. Wer ein ganzes
// Protokoll einwirft, soll das können — aber nicht ein ganzes Buch.
const FRAGE_ZEICHEN = 8000
const TITEL_ZEICHEN = 60
// So viel Platz bekommt die Vorgeschichte, und so lang darf die Antwort
// werden. Beides zusammen mit dem Systemkopf muss in das Fenster des
// Modells passen — LM Studio lädt qwen3-14b derzeit mit 8192 Token.
//
// Hier stand 6000 und 1500. Nachgemessen am 04.11.2026:
//   Kopf 17000 + Verlauf 6000 + 1500 Token  ->  **0 Zeichen Antwort**
// Das war kein Fehler, den jemand gemeldet hätte — es kam einfach nichts.
// Genau das war der Abriss bei der zweiten Frage einer Unterhaltung: Die
// erste passte noch, die zweite nicht mehr, weil der Verlauf dazukam.
// Die Rechnung dazu steht in server/kontext.js.
const VERLAUF_ZEICHEN = 3000
const ANTWORT_TOKEN   = Number(process.env.KI_ANTWORT_TOKEN || 900)

function uid() {
  return crypto.randomUUID()
}

/** Eine SSE-Zeile, im selben Format wie das Dashboard sie schickt. */
function ereignis(art, daten) {
  return `event: ${art}\ndata: ${JSON.stringify(daten)}\n\n`
}

/**
 * Ein Titel aus der ersten Frage — ohne dafür das Modell zu bemühen.
 *
 * Ein zweiter KI-Aufruf nur für eine Überschrift kostet einen Platz auf einem
 * Rechner und ein paar Sekunden. Die ersten Worte der Frage sagen fast
 * genauso viel.
 */
function titelAus(frage) {
  const sauber = String(frage || '').split(/\s+/).filter(Boolean).join(' ')
  if (!sauber) return 'Neue Unterhaltung'
  if (sauber.length <= TITEL_ZEICHEN) return sauber
  let gekappt = sauber.slice(0, TITEL_ZEICHEN)
  const luecke = gekappt.lastIndexOf(' ')
  if (luecke > TITEL_ZEICHEN / 2) gekappt = gekappt.slice(0, luecke)
  return gekappt + '…'
}

/**
 * Die Vorgeschichte für das Modell: von vorn gekürzt, die jüngste Frage
 * bleibt. Fehlgeschlagene Antworten kommen nicht mit — sonst lernt das
 * Modell aus seinen eigenen Abbrüchen.
 */
function verlaufKuerzen(zeilen, grenze = VERLAUF_ZEICHEN) {
  const brauchbar = zeilen
    .filter(z => !z.error)
    .map(z => ({ role: z.role, content: z.content }))
  if (!brauchbar.length) return []
  const letzter = { ...brauchbar[brauchbar.length - 1] }
  if (letzter.content.length > grenze) {
    letzter.content = letzter.content.slice(0, grenze)
    return [letzter]
  }
  const heraus = [letzter]
  let summe = letzter.content.length
  for (let i = brauchbar.length - 2; i >= 0; i--) {
    const laenge = brauchbar[i].content.length
    if (summe + laenge > grenze) break
    heraus.unshift({ ...brauchbar[i] })
    summe += laenge
  }
  return heraus
}

function registerAssistent(app, db, requireAuth, canAccessProject, logEvent) {
  // Eine Frage belegt für Sekunden einen Platz auf einer Grafikkarte. Die
  // allgemeine Grenze (6000 je Viertelstunde) ist dafür viel zu weit: Ein
  // offener Browser-Tab, der bei jedem Fehler neu versucht, hätte die Farm
  // für alle anderen belegt, ohne dass jemand etwas davon merkt.
  const fragenLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const auth = req.headers['authorization']
      return auth?.startsWith('Bearer ') ? `u:${auth.slice(7, 71)}` : (req.ip || 'ip')
    },
    message: { error: 'Viele Fragen in kurzer Zeit — bitte einen Moment warten. '
                      + 'Die KI-Rechner werden auch von anderen gebraucht.' },
  })

  /**
   * Wer fragt — oder null, wenn niemand.
   *
   * `__apikey__` wird ausdrücklich abgelehnt. Das ist der Dienstschlüssel des
   * Dashboards; er gehört zu keinem Menschen und sieht in canAccessProject
   * jedes Projekt. Ein Chatbot darauf hätte keine Rechtegrenze mehr.
   */
  function wer(req) {
    if (!req.user || req.user === '__apikey__') return null
    return req.user
  }

  function nurMenschen(req, res, next) {
    if (!wer(req)) {
      return res.status(403).json({
        error: 'Der Assistent antwortet nur angemeldeten Personen. '
             + 'Mit einem Dienstschlüssel gibt es keine Projektfreigaben, '
             + 'an die er sich halten könnte.',
      })
    }
    next()
  }

  /** Die Prüfung, die auch die Oberfläche benutzt — gebunden an diese Person. */
  function darfFuer(benutzer) {
    return (projekt) => {
      try { return canAccessProject(projekt, benutzer) } catch { return false }
    }
  }

  // ── Ist überhaupt eine KI da? ──────────────────────────────────────────────
  // Die Oberfläche fragt das, bevor sie den Knopf zeigt. Ein Chatfenster, das
  // auf jede Frage mit einem Verbindungsfehler antwortet, ist schlimmer als
  // keines.
  app.get('/api/assistent/status', requireAuth, (req, res) => {
    const benutzer = wer(req)
    // Wie viele Projekte diese Person sehen darf. Die Zahl steht im Kopf des
    // Fensters, damit von Anfang an klar ist, worüber der Assistent redet --
    // und worüber nicht. Ohne sie stand dort „ freigegebene Projekte".
    let projekte = null
    if (benutzer) {
      try {
        projekte = db.projects.list().filter(darfFuer(benutzer)).length
      } catch { projekte = null }
    }
    res.json({
      eingerichtet: ki.eingerichtet(),
      grund: ki.warumNicht(),
      person: Boolean(benutzer),
      projekte,
      frageZeichen: FRAGE_ZEICHEN,
    })
  })

  // ── Neuigkeiten ───────────────────────────────────────────────────────────
  // Was (K)ompl(I)ze beim Anmelden zu sagen hat. Der Text kommt aus
  // server/neuigkeiten.md, nicht aus dem Modell -- erklärt wird er erst,
  // wenn jemand nachfragt.

  app.get('/api/assistent/neuigkeiten', requireAuth, nurMenschen, (req, res) => {
    const benutzer = wer(req)
    let seit = null
    // Nichts von vor der eigenen Anmeldung: Wer heute dazukommt, soll nicht
    // die Versionsgeschichte des letzten Jahres vorgesetzt bekommen.
    try { seit = db.users.get(benutzer)?.created_at || null } catch { /* egal */ }
    try {
      const offen = neuigkeiten.offenFuer(db, benutzer, seit)
      res.json({
        neuigkeiten: offen.map(e => ({
          kennung: e.kennung, titel: e.titel, datum: e.datum,
          text: e.text, bild: neuigkeiten.bild(e),
        })),
      })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Eine einzelne Neuigkeit, auch eine längst gesehene. Dient der
  // Oberfläche dazu, beim Wiederöffnen einer Unterhaltung das Bild
  // nachzuladen, dessen Kennung in der ersten Nachricht steht.
  app.get('/api/assistent/neuigkeiten/:kennung', requireAuth, nurMenschen, (req, res) => {
    const e = neuigkeiten.lesen().find(x => x.kennung === req.params.kennung)
    if (!e) return res.status(404).json({ error: 'Nicht gefunden.' })
    res.json({ kennung: e.kennung, titel: e.titel, datum: e.datum,
               text: e.text, bild: neuigkeiten.bild(e) })
  })

  app.post('/api/assistent/neuigkeiten/gesehen', requireAuth, nurMenschen, (req, res) => {
    const kennungen = Array.isArray(req.body?.kennungen) ? req.body.kennungen : []
    if (!kennungen.length) return res.status(400).json({ error: 'Keine Kennung übergeben.' })
    // Nur Kennungen, die es wirklich gibt: Sonst könnte ein beliebiger Wert
    // in der Tabelle landen und sie mit der Zeit vollschreiben.
    const echte = new Set(neuigkeiten.lesen().map(e => e.kennung))
    const gefiltert = kennungen.filter(k => echte.has(k))
    try {
      db.neuigkeiten.merkenViele(wer(req), gefiltert)
      res.json({ ok: true, gemerkt: gefiltert.length })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Die Unterhaltungen ────────────────────────────────────────────────────
  app.get('/api/assistent/chats', requireAuth, nurMenschen, (req, res) => {
    try {
      const liste = db.chats.listFor(wer(req))
      res.json(liste.map(c => ({ id: c.id, titel: c.title,
                                 projektId: c.project_id,
                                 geaendertAm: c.updated_at })))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.post('/api/assistent/chats', requireAuth, nurMenschen, (req, res) => {
    try {
      const projectId = req.body?.projektId || null
      const c = db.chats.create({ id: uid(), username: wer(req), projectId })

      // Aus einer Neuigkeit heraus geöffnet: Ihr Text wird als erste
      // Nachricht **gespeichert**, nicht nur angezeigt. Sonst stünde er auf
      // dem Bildschirm, aber nicht im Verlauf — und die erste Nachfrage
      // („wie meinst du das?") ginge ins Leere, weil das Modell den
      // Gegenstand gar nicht kennt.
      const kennung = String(req.body?.neuigkeit || '').trim()
      if (kennung) {
        const e = neuigkeiten.lesen().find(x => x.kennung === kennung)
        if (e) {
          db.chats.addMessage({
            chatId: c.id, role: 'assistant',
            content: e.titel + '\n\n' + e.text,
            // Die Herkunft steht in der Nachricht, nicht nur im Fenster.
            // Dadurch findet die Oberfläche beim nächsten Öffnen das Bild
            // wieder -- die data:-URL selbst gehört nicht in die Datenbank,
            // sie wäre dort um ein Vielfaches größer als der Text.
            sources: ['neuigkeit:' + e.kennung],
          })
          db.chats.rename(c.id, wer(req), e.titel.slice(0, TITEL_ZEICHEN))
          db.neuigkeiten.merken(wer(req), kennung)
        }
      }

      const frisch = db.chats.mine(c.id, wer(req))
      res.json({ id: c.id, titel: frisch?.title || c.title, projektId: c.project_id })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/assistent/chats/:id', requireAuth, nurMenschen, (req, res) => {
    try {
      const c = db.chats.mine(req.params.id, wer(req))
      // Bewusst 404 und nicht 403: Ein 403 würde bestätigen, dass es die
      // Unterhaltung gibt. Das geht niemanden etwas an außer ihrem Besitzer.
      if (!c) return res.status(404).json({ error: 'Nicht gefunden.' })
      res.json({
        id: c.id, titel: c.title, projektId: c.project_id,
        nachrichten: db.chats.messages(c.id).map(n => ({
          rolle: n.role, inhalt: n.content, modell: n.model, knoten: n.node,
          dauer: n.duration_s, fehler: n.error,
          quellen: n.sources ? JSON.parse(n.sources) : null,
          zeit: n.created_at,
        })),
      })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.post('/api/assistent/chats/:id/titel', requireAuth, nurMenschen, (req, res) => {
    const titel = String(req.body?.titel || '').trim()
    if (!titel) return res.status(400).json({ error: 'Kein Titel übergeben.' })
    const ok = db.chats.rename(req.params.id, wer(req), titel.slice(0, TITEL_ZEICHEN))
    if (!ok) return res.status(404).json({ error: 'Nicht gefunden.' })
    res.json({ ok: true, titel: titel.slice(0, TITEL_ZEICHEN) })
  })

  app.delete('/api/assistent/chats/:id', requireAuth, nurMenschen, (req, res) => {
    const ok = db.chats.remove(req.params.id, wer(req))
    if (!ok) return res.status(404).json({ error: 'Nicht gefunden.' })
    res.json({ ok: true })
  })

  // ── Die Antwort ───────────────────────────────────────────────────────────
  app.post('/api/assistent/chats/:id/fragen', requireAuth, nurMenschen,
           fragenLimiter, async (req, res) => {
    const benutzer = wer(req)
    const c = db.chats.mine(req.params.id, benutzer)
    if (!c) return res.status(404).json({ error: 'Nicht gefunden.' })

    const frage = String(req.body?.frage || '').trim().slice(0, FRAGE_ZEICHEN)
    if (!frage) return res.status(400).json({ error: 'Keine Frage übergeben.' })

    if (!ki.eingerichtet()) {
      return res.status(503).json({
        error: 'Die Verbindung zur KI des Dashboards ist nicht eingerichtet ('
             + ki.warumNicht() + ')',
      })
    }

    // Die Frage wird **vor** der Antwort gespeichert. Bricht die Antwort ab,
    // steht die Frage trotzdem im Verlauf — sonst wäre nach einem Fehlschlag
    // nicht mehr zu sehen, was gefragt wurde.
    db.chats.addMessage({ chatId: c.id, role: 'user', content: frage })
    if (c.title === 'Neue Unterhaltung') {
      db.chats.rename(c.id, benutzer, titelAus(frage))
    }

    // Das Projekt kommt aus der Anfrage, nicht aus dem gespeicherten Gespräch:
    // Die Person kann inzwischen in einem anderen stehen. Die Rechte werden
    // ohnehin jedes Mal neu geprüft, nie aus dem Gespräch übernommen.
    const projektId = req.body?.projektId || c.project_id || null

    // Für die Anrede der Anzeigename, nicht das Anmeldekürzel: „Domenico"
    // statt „ds". Das Kürzel sagt dem Modell nichts und liest sich in einer
    // Antwort wie ein Aktenzeichen.
    let anzeigename = null
    try { anzeigename = db.users.get(benutzer)?.display_name || null } catch { /* egal */ }

    let gebaut
    try {
      gebaut = kontext.bauen({
        db, frage, projektId, benutzer: anzeigename,
        darfProjekt: darfFuer(benutzer),
      })
    } catch (e) {
      console.error('[assistent] Kontext nicht baubar:', e?.message || e)
      return res.status(500).json({ error: 'Der Assistent konnte die '
                                          + 'Projektdaten nicht lesen.' })
    }

    const verlauf = verlaufKuerzen(db.chats.messages(c.id))

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',      // falls einmal ein Proxy davorsteht
    })
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    // Was gefunden wurde, geht gleich hinaus — dann sieht die Person schon
    // beim Warten, worauf die Antwort sich stützen wird. Und wenn gar nichts
    // gefunden wurde, weiß sie es, bevor das Modell es umschreibt.
    res.write(ereignis('quellen', {
      quellen: gebaut.quellen, fokus: gebaut.fokus,
      projekte: gebaut.projekte, uebrig: gebaut.uebrig,
      begriffe: gebaut.begriffe,
    }))

    const teile = []
    let abschluss = null
    let schiefgegangen = null
    try {
      for await (const e of ki.unterhalten({
        nachrichten: verlauf, system: gebaut.system, anwendung: 'protokolle',
        maxTokens: ANTWORT_TOKEN,
      })) {
        if (e.art === 'text') { teile.push(e.nutzlast); res.write(ereignis('text', e.nutzlast)) }
        else if (e.art === 'fertig') { abschluss = e.nutzlast; res.write(ereignis('fertig', e.nutzlast)) }
        else if (e.art === 'fehler') { schiefgegangen = String(e.nutzlast); res.write(ereignis('fehler', e.nutzlast)) }
      }
    } catch (e) {
      console.error('[assistent] Antwort gescheitert:', e?.message || e)
      schiefgegangen = 'Unerwarteter Fehler beim Antworten.'
      try { res.write(ereignis('fehler', schiefgegangen)) } catch { /* Leitung schon zu */ }
    } finally {
      // Auch eine halbe Antwort wird gesichert, auch eine kaputte. Eine halb
      // geschriebene Antwort, die beim nächsten Öffnen fehlt, wäre schlimmer
      // als eine halbe, die als solche dasteht.
      const text = teile.join('')
      if (text || schiefgegangen) {
        try {
          db.chats.addMessage({
            chatId: c.id, role: 'assistant',
            content: text || '(keine Antwort)',
            model: abschluss?.modell || null,
            node: abschluss?.knoten || null,
            durationS: abschluss?.dauer_s ?? null,
            sources: gebaut.quellen?.length ? gebaut.quellen : null,
            error: schiefgegangen,
          })
        } catch (e) {
          console.error('[assistent] Antwort nicht speicherbar:', e?.message || e)
        }
      }
      if (typeof logEvent === 'function') {
        logEvent('ASSISTENT_FRAGE', req,
                 `user=${benutzer} quellen=${gebaut.quellen.length}`
                 + ` knoten=${abschluss?.knoten || '-'}`
                 + (schiefgegangen ? ' fehler=ja' : ''))
      }
      res.end()
    }
  })
}

module.exports = {
  registerAssistent,
  // nur für die Prüfungen
  _titelAus: titelAus,
  _verlaufKuerzen: verlaufKuerzen,
  FRAGE_ZEICHEN,
}
