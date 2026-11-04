'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Prueft den Assistenten des Protokolltools.
//
//   node pruefungen/pruefung-assistent.js
//
// Laeuft gegen einen echten Server mit einer eigenen, leeren Datenbank im
// Temp-Verzeichnis und gegen eine Attrappe des Dashboards. Nichts davon
// beruehrt die Betriebsdaten.
//
// Die Frage, auf die hier alles hinauslaeuft: **Sieht der Assistent mehr als
// die Person, die ihn fragt?** Das laesst sich nicht behaupten, nur messen --
// und zwar an der Stelle, an der der Systemkopf das Haus verlaesst. Deshalb
// schreibt die Attrappe jede Anfrage mit, und die Pruefungen lesen nach, was
// wirklich drinstand.
//
// Portblock: 3477 (Anwendung), 3478 (Attrappe des Dashboards).
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')

const WURZEL = path.dirname(__dirname)
const PORT_APP   = 3477
const PORT_STUB  = 3478
const SCHLUESSEL = 'f1e2d3c4b5a6978877665544332211009988776655443322'

let GRUEN = 0, ROT = 0

function pruefe(behauptung, bedingung, zusatz = '') {
  if (bedingung) { GRUEN++; console.log('  ok    ' + behauptung) }
  else { ROT++; console.log('  NICHT ' + behauptung + (zusatz ? ' ' + zusatz : '')) }
}

function abschnitt(titel) { console.log('\n== ' + titel + ' ==') }

const schlafen = (ms) => new Promise(r => setTimeout(r, ms))

// ── Die Attrappe des Dashboards ──────────────────────────────────────────────
// Sie spricht genau den einen Endpunkt, den server/ki.js aufruft, prueft den
// Schluessel wie das Dashboard und stroemt wortweise zurueck. Und sie merkt
// sich die letzte Anfrage -- das ist die Naht, an der sich nachsehen laesst,
// was der Assistent tatsaechlich herausgegeben hat.
const stub = { letzte: null, modus: 'brav', anfragen: 0 }

const stubServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/letzte') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(stub.letzte))
    return
  }
  if (req.method === 'POST' && req.url === '/modus') {
    let roh = ''
    req.on('data', c => { roh += c })
    req.on('end', () => {
      try { stub.modus = JSON.parse(roh).modus } catch { /* bleibt */ }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    return
  }
  if (req.method !== 'POST' || !req.url.startsWith('/api/ki/dienst/unterhalten')) {
    res.writeHead(404); res.end('{}'); return
  }

  let roh = ''
  req.on('data', c => { roh += c })
  req.on('end', () => {
    stub.anfragen++
    let daten = {}
    try { daten = JSON.parse(roh) } catch { /* leer */ }
    stub.letzte = { kopf: req.headers['x-ki-key'] || null, ...daten }

    if (stub.modus === 'abweisen' || req.headers['x-ki-key'] !== SCHLUESSEL) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ fehler: 'Kein gültiger Dienstschlüssel.' }))
      return
    }
    if (stub.modus === 'kaputt') {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ fehler: 'Es ist keine lokale KI eingerichtet.' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
                         'Cache-Control': 'no-cache' })
    const text = 'Antwort der Attrappe. Umlaute zur Prüfung: Größe, Öffnung, Maß.'
    const woerter = text.split(' ')
    let i = 0
    const takt = setInterval(() => {
      if (i >= woerter.length) {
        clearInterval(takt)
        res.write('event: fertig\ndata: ' + JSON.stringify({
          text, modell: 'attrappe/qwen3-14b', knoten: 'Attrappe', dauer_s: 0.3,
        }) + '\n\n')
        res.end()
        return
      }
      const stueck = (i === 0 ? '' : ' ') + woerter[i++]
      res.write('event: text\ndata: ' + JSON.stringify(stueck) + '\n\n')
    }, 10)
  })
})

// ── Kleine HTTP-Hilfen ───────────────────────────────────────────────────────

async function ruf(weg, { methode = 'GET', koerper = null, token = null,
                          apikey = null } = {}) {
  const kopf = { 'Content-Type': 'application/json' }
  if (token)  kopf.Authorization = 'Bearer ' + token
  if (apikey) kopf['x-api-key'] = apikey
  const antwort = await fetch('http://127.0.0.1:' + PORT_APP + weg, {
    method: methode, headers: kopf,
    body: koerper === null ? undefined : JSON.stringify(koerper),
  })
  const text = await antwort.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* kein JSON */ }
  return { status: antwort.status, json, text }
}

/** Eine Frage stellen und den ganzen Ereignisstrom einsammeln. */
async function fragen(chatId, frage, token, projektId = null) {
  const antwort = await fetch(
    'http://127.0.0.1:' + PORT_APP + '/api/assistent/chats/' + chatId + '/fragen',
    { method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 Authorization: 'Bearer ' + token },
      body: JSON.stringify({ frage, projektId }) })
  const roh = await antwort.text()
  const ereignisse = []
  for (const block of roh.split('\n\n')) {
    let art = null, inhalt = null
    for (const zeile of block.split('\n')) {
      if (zeile.startsWith('event: ')) art = zeile.slice(7).trim()
      else if (zeile.startsWith('data: ')) {
        try { inhalt = JSON.parse(zeile.slice(6)) } catch { inhalt = zeile.slice(6) }
      }
    }
    if (art) ereignisse.push({ art, inhalt })
  }
  const letzte = await (await fetch('http://127.0.0.1:' + PORT_STUB + '/letzte')).json()
  return { status: antwort.status, json: antwort.ok ? null : JSON.parse(roh || '{}'),
           ereignisse, gesendet: letzte,
           text: ereignisse.filter(e => e.art === 'text').map(e => e.inhalt).join(''),
           quellen: ereignisse.find(e => e.art === 'quellen')?.inhalt || null,
           fertig: ereignisse.find(e => e.art === 'fertig')?.inhalt || null,
           fehler: ereignisse.find(e => e.art === 'fehler')?.inhalt || null }
}

async function stubModus(modus) {
  await fetch('http://127.0.0.1:' + PORT_STUB + '/modus',
              { method: 'POST', body: JSON.stringify({ modus }) })
}

// ── Aufbau ───────────────────────────────────────────────────────────────────

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-pruefung-'))
let server = null

async function warten(sekunden = 30) {
  const ende = Date.now() + sekunden * 1000
  for (;;) {
    try {
      const a = await fetch('http://127.0.0.1:' + PORT_APP + '/api/health')
      if (a.ok) return
    } catch { /* noch nicht da */ }
    if (Date.now() > ende) throw new Error('Der Server kam nicht hoch. Siehe ' + path.join(scratch, 'server.log'))
    await schlafen(250)
  }
}

async function aufbauen() {
  await new Promise(r => stubServer.listen(PORT_STUB, '127.0.0.1', r))

  const log = fs.openSync(path.join(scratch, 'server.log'), 'a')
  server = spawn(process.execPath, [path.join('server', 'index.js')], {
    cwd: WURZEL,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      PORT: String(PORT_APP),
      HOST: '127.0.0.1',
      DB_PATH: scratch,
      LOG_PATH: scratch,
      KI_DASHBOARD_URL: 'http://127.0.0.1:' + PORT_STUB,
      KI_DASHBOARD_KEY: SCHLUESSEL,
      // Ohne das würde die Anmeldung erst die NAS fragen.
      SYNOLOGY_URL: '',
      STAMMDATEN_KEY: '',
      API_KEY: 'pruef-api-schluessel',
      GRAPH_TENANT_ID: '', GRAPH_CLIENT_ID: '', GRAPH_CLIENT_SECRET: '',
    },
  })
  await warten()
}

function abbauen() {
  try { server?.kill() } catch { /* schon weg */ }
  try { stubServer.close() } catch { /* schon zu */ }
}

// ── Die Prüfungen ────────────────────────────────────────────────────────────

async function main() {
  // ── Was ohne Server geht: die kleinen Teile ───────────────────────────────
  abschnitt('Die Begriffe einer Frage')
  const k = require(path.join(WURZEL, 'server', 'kontext.js'))
  const a = require(path.join(WURZEL, 'server', 'assistent.js'))

  const b1 = k._begriffe('Was ist in dem Projekt noch offen?')
  pruefe('Füllwörter fallen weg', !b1.includes('ist') && !b1.includes('was')
         && !b1.includes('dem') && !b1.includes('noch'), '(blieb ' + b1.join(',') + ')')
  pruefe('die tragenden Wörter bleiben',
         b1.includes('projekt') && b1.includes('offen'), '(blieb ' + b1.join(',') + ')')
  pruefe('Projektnummern bleiben erhalten',
         k._begriffe('Was ist in 24-07 offen?').includes('24-07'),
         '(war ' + k._begriffe('Was ist in 24-07 offen?').join(',') + ')')
  pruefe('kurze Wörter ohne Zahl fallen weg',
         !k._begriffe('ob es da ok ist').includes('ok'))

  abschnitt('Abdeckung zählt mehr als Häufigkeit')
  const viele = k._treffer('Tor Tor Tor Tor Tor Tor Tor Tor', ['tor', 'brandschutz'])
  const breit = k._treffer('Das Tor und der Brandschutz', ['tor', 'brandschutz'])
  pruefe('zwei getroffene Begriffe schlagen einen vielfachen',
         breit.punkte > viele.punkte,
         '(' + breit.punkte + ' vs ' + viele.punkte + ')')
  pruefe('ohne Treffer null Punkte', k._treffer('nichts davon', ['tor']).punkte === 0)

  abschnitt('HTML wird abgeräumt')
  pruefe('Absätze werden zu Leerzeichen',
         k._ohneHtml('<p>Erstens</p><p>Zweitens</p>') === 'Erstens Zweitens',
         '(war ' + JSON.stringify(k._ohneHtml('<p>Erstens</p><p>Zweitens</p>')) + ')')
  pruefe('Entitäten werden aufgelöst',
         k._ohneHtml('Tor&nbsp;1 &amp; 2') === 'Tor 1 & 2',
         '(war ' + JSON.stringify(k._ohneHtml('Tor&nbsp;1 &amp; 2')) + ')')

  abschnitt('Das Handbuch liegt im Abbild und ist in Abschnitte zerlegt')
  const hb = k._handbuch()
  pruefe('es wurde gefunden', hb.length > 10, '(waren ' + hb.length + ' Abschnitte)')
  pruefe('ein Abschnitt heißt „Passwort ändern"',
         hb.some(x => /passwort ändern/i.test(x.titel)),
         '(Titel: ' + hb.slice(0, 5).map(x => x.titel).join(' | ') + ')')

  abschnitt('Titel und Verlauf')
  pruefe('ein kurzer Titel steht unverändert da',
         a._titelAus('Was ist offen?') === 'Was ist offen?')
  const lang = a._titelAus('Bitte nenne mir alle offenen Aufgaben im Projekt '
                           + 'Halle Nord samt Fristen und Zuständigen')
  pruefe('ein langer Titel wird an der Wortgrenze gekappt',
         lang.endsWith('…') && !lang.slice(0, -1).endsWith(' ') && lang.length <= 61,
         '(war ' + JSON.stringify(lang) + ')')
  const verl = a._verlaufKuerzen([
    { role: 'user', content: 'A'.repeat(100) },
    { role: 'assistant', content: 'B'.repeat(100), error: 'kaputt' },
    { role: 'user', content: 'C'.repeat(100) },
  ])
  pruefe('eine gescheiterte Antwort kommt nicht mit',
         verl.length === 2 && verl.every(z => !z.content.startsWith('B')),
         '(blieb ' + verl.map(z => z.content[0]).join(',') + ')')
  const eng = a._verlaufKuerzen([
    { role: 'user', content: 'A'.repeat(100) },
    { role: 'assistant', content: 'B'.repeat(100) },
    { role: 'user', content: 'C'.repeat(100) },
  ], 250)
  pruefe('bei knappem Platz fällt das Älteste weg',
         eng.map(z => z.content[0]).join('') === 'BC',
         '(blieb ' + eng.map(z => z.content[0]).join('') + ')')

  // ── Jetzt mit Server ──────────────────────────────────────────────────────
  await aufbauen()

  abschnitt('Aufbau: Benutzer und Projekte')
  // Solange niemand angelegt ist, ist das Tool offen (Ersteinrichtung).
  const chefAn = await ruf('/api/auth/users', { methode: 'POST', koerper: {
    username: 'chef', displayName: 'Charlotte Chef', password: 'Chef-Passwort-1',
    role: 'admin' } })
  pruefe('der erste Benutzer lässt sich im offenen Modus anlegen',
         chefAn.status === 200 || chefAn.status === 201,
         '(war ' + chefAn.status + ': ' + chefAn.text.slice(0, 120) + ')')

  const chefTok = (await ruf('/api/auth/login', { methode: 'POST', koerper: {
    username: 'chef', password: 'Chef-Passwort-1' } })).json?.token
  pruefe('und die Anmeldung gibt ein Token', Boolean(chefTok))
  if (!chefTok) throw new Error('Ohne Anmeldung geht es nicht weiter.')

  for (const [wer, name] of [['anna', 'Anna Architektin'], ['bert', 'Bert Bauleiter']]) {
    await ruf('/api/auth/users', { methode: 'POST', token: chefTok, koerper: {
      username: wer, displayName: name, password: wer + '-Passwort-1',
      role: 'user' } })
  }
  const annaTok = (await ruf('/api/auth/login', { methode: 'POST', koerper: {
    username: 'anna', password: 'anna-Passwort-1' } })).json?.token
  const bertTok = (await ruf('/api/auth/login', { methode: 'POST', koerper: {
    username: 'bert', password: 'bert-Passwort-1' } })).json?.token
  pruefe('Anna und Bert sind angemeldet', Boolean(annaTok && bertTok))

  // Ein offenes Projekt und ein zugangsbeschränktes, das nur Anna sehen darf.
  await ruf('/api/projects', { methode: 'POST', token: chefTok, koerper: {
    id: 'p-offen', name: 'Halle Nord', nummer: '24-07',
    projectAdminUser: 'chef', isAccessControlled: false,
    contacts: [
      { id: 'c1', name: 'Simon Statiker', company: 'Tragwerk GmbH',
        gewerk: 'Tragwerksplanung', role: 'Fachplaner',
        email: 'simon@tragwerk.example', phone: '0123-4567' },
    ] } })
  await ruf('/api/projects', { methode: 'POST', token: chefTok, koerper: {
    id: 'p-dicht', name: 'Villa Vertraulich', nummer: '25-01',
    projectAdminUser: 'chef', isAccessControlled: true,
    allowedUsers: ['anna'] } })

  await ruf('/api/protocols', { methode: 'POST', token: chefTok, koerper: {
    id: 'pr-offen', projectId: 'p-offen', projectName: 'Halle Nord',
    meetingType: 'Baubesprechung', date: '2026-09-14',
    agendaItems: [{ no: '2.1', topic: 'Hallentor Süd',
      discussion: '<p>Das <b>Sektionaltor</b> ist zu schmal für die Gabelstapler.</p>',
      result: 'Tor wird auf 5,00 m verbreitert.', status: 'offen',
      assignedTo: 'Simon Statiker' }],
    actionItems: [{ no: '1', description: 'Neues Tormaß in die Ausschreibung',
      responsible: 'Anna Architektin', deadline: '2026-10-01', status: 'offen' }],
    notes: 'Ortsbegehung bei Regen.' } })
  await ruf('/api/protocols', { methode: 'POST', token: chefTok, koerper: {
    id: 'pr-dicht', projectId: 'p-dicht', projectName: 'Villa Vertraulich',
    meetingType: 'Bauherrengespräch', date: '2026-09-20',
    agendaItems: [{ no: '1.1', topic: 'Geheimniskrämerei',
      discussion: 'Der Bauherr wünscht den Kennwortschutz des Weinkellers.',
      result: 'Zylinderschloss Sonderanfertigung.', status: 'offen' }],
    actionItems: [{ no: '1', description: 'Sonderschloss Weinkeller anfragen',
      responsible: 'Chef', deadline: '2026-10-15', status: 'offen' }] } })

  const annaSicht = await ruf('/api/projects', { token: annaTok })
  const bertSicht = await ruf('/api/projects', { token: bertTok })
  pruefe('Anna sieht beide Projekte', annaSicht.json?.length === 2,
         '(sah ' + annaSicht.json?.length + ')')
  pruefe('Bert sieht nur das offene', bertSicht.json?.length === 1
         && bertSicht.json[0].id === 'p-offen',
         '(sah ' + JSON.stringify(bertSicht.json?.map(p => p.id)) + ')')

  // ── Die Rechtegrenze im Systemkopf ────────────────────────────────────────
  abschnitt('Der Assistent sieht genau so viel wie die Person')
  const annaChat = (await ruf('/api/assistent/chats', { methode: 'POST',
    token: annaTok, koerper: {} })).json?.id
  const bertChat = (await ruf('/api/assistent/chats', { methode: 'POST',
    token: bertTok, koerper: {} })).json?.id
  pruefe('beide bekommen eine Unterhaltung', Boolean(annaChat && bertChat))

  const aFrage = await fragen(annaChat, 'Was ist beim Weinkeller der Villa Vertraulich vereinbart?', annaTok)
  const bFrage = await fragen(bertChat, 'Was ist beim Weinkeller der Villa Vertraulich vereinbart?', bertTok)

  pruefe('Annas Kopf enthält das vertrauliche Projekt',
         (aFrage.gesendet?.system || '').includes('Weinkeller'),
         '(Kopf ' + (aFrage.gesendet?.system || '').length + ' Zeichen)')
  pruefe('Berts Kopf enthält es NICHT',
         !(bFrage.gesendet?.system || '').includes('Weinkeller'),
         '(gefunden an Stelle ' + (bFrage.gesendet?.system || '').indexOf('Weinkeller') + ')')
  pruefe('und auch den Projektnamen nicht',
         !(bFrage.gesendet?.system || '').includes('Villa Vertraulich'))
  pruefe('und auch nicht die Aufgabe daraus',
         !(bFrage.gesendet?.system || '').includes('Sonderschloss'))
  pruefe('Annas Verzeichnis nennt zwei Projekte',
         /sehen darfst \(2\)/.test(aFrage.gesendet?.system || ''))
  pruefe('Berts Verzeichnis nennt eines',
         /sehen darfst \(1\)/.test(bFrage.gesendet?.system || ''))
  pruefe('Anna bekommt Quellen genannt', (aFrage.quellen?.quellen || []).length > 0,
         '(waren ' + JSON.stringify(aFrage.quellen?.quellen) + ')')
  pruefe('Bert bekommt keine Quelle aus dem fremden Projekt',
         !(aFrage.quellen ? JSON.stringify(bFrage.quellen?.quellen || []) : '')
           .includes('Villa'),
         '(waren ' + JSON.stringify(bFrage.quellen?.quellen) + ')')

  abschnitt('Ein Dienstschlüssel bekommt keinen Assistenten')
  const mitKey = await ruf('/api/assistent/chats', { methode: 'POST',
    apikey: 'pruef-api-schluessel', koerper: {} })
  pruefe('mit x-api-key: 403 statt einer Unterhaltung', mitKey.status === 403,
         '(war ' + mitKey.status + ')')
  pruefe('die Begründung nennt die fehlenden Projektfreigaben',
         /Projektfreigaben/.test(mitKey.json?.error || ''),
         '(war ' + JSON.stringify(mitKey.json?.error) + ')')

  // ── Was im Kopf steht, und was nicht ──────────────────────────────────────
  abschnitt('Der Rückgriff findet das Richtige')
  const tor = await fragen(annaChat, 'Wie breit wird das Hallentor Süd?', annaTok, 'p-offen')
  const kopf = tor.gesendet?.system || ''
  pruefe('der Protokollpunkt steht im Kopf', kopf.includes('5,00 m'))
  pruefe('mit Quellenangabe in eckigen Klammern',
         /\[Protokoll Halle Nord · Baubesprechung · 14\.09\.2026, Punkt 2\.1/.test(kopf),
         '(nicht gefunden)')
  pruefe('kein HTML im Kopf', !/<[a-z/]/i.test(kopf),
         '(gefunden: ' + (kopf.match(/<[a-z/][^>]*>/i) || [''])[0] + ')')
  pruefe('die offene Aufgabe steht mit Zuständiger und Frist da',
         kopf.includes('Anna Architektin') && kopf.includes('01.10.2026'))
  pruefe('die Projektmappe ist dabei',
         kopf.includes('## Projekt: Halle Nord'))
  pruefe('das Fachplanerbüro steht im Kopf',
         kopf.includes('Tragwerk GmbH'))
  pruefe('die E-Mail-Adresse des Fachplaners NICHT',
         !kopf.includes('simon@tragwerk.example'))
  pruefe('und seine Telefonnummer auch nicht',
         !kopf.includes('0123-4567'))
  pruefe('der Kopf bleibt unter der Grenze des Dashboards',
         kopf.length < 24000, '(waren ' + kopf.length + ')')
  pruefe('die Anweisung verbietet dem Modell das Erfinden',
         /Erfinde nichts/.test(kopf))
  // Mit \s+ statt Leerzeichen: Der Satz steht im Quelltext umgebrochen, und
  // ein fester Leerschritt hätte hier eine Lücke gemeldet, die es nicht gibt.
  pruefe('und sagt ihm, dass Fehlen nicht Nichtexistenz ist',
         /Behaupte\s+nie,\s+etwas\s+existiere\s+nicht/.test(kopf))
  pruefe('die Anrede nennt den Anzeigenamen, nicht das Kürzel',
         kopf.includes('Anna Architektin') && !/heisst anna\b/.test(kopf))

  abschnitt('Fragen zum Programm beantwortet das Handbuch')
  const hilfe = await fragen(annaChat, 'Wie kann ich mein Passwort ändern?', annaTok)
  const hkopf = hilfe.gesendet?.system || ''
  pruefe('ein Handbuchabschnitt ist im Kopf',
         hkopf.includes('# Aus dem Nutzerhandbuch'))
  pruefe('und zwar der zum Passwort',
         /Zahnrad|Passwort/.test(hkopf.split('# Aus dem Nutzerhandbuch')[1] || ''))
  pruefe('das Handbuch wird als Quelle genannt',
         (hilfe.quellen?.quellen || []).some(q => q.startsWith('Handbuch:')),
         '(waren ' + JSON.stringify(hilfe.quellen?.quellen) + ')')

  abschnitt('Findet er nichts, sagt der Kopf das ausdrücklich')
  const nichts = await fragen(annaChat, 'Wie steht es um den Zeppelinhangar in Reykjavik?', annaTok)
  const nkopf = nichts.gesendet?.system || ''
  pruefe('im Kopf steht „Keine" statt erfundener Treffer',
         /# Gefundene Stellen\n\nKeine\./.test(nkopf),
         '(Ausschnitt: ' + (nkopf.split('# Gefundene Stellen')[1] || '').slice(0, 60) + ')')
  pruefe('und wonach gesucht wurde',
         /Gesucht wurde nach:/.test(nkopf))

  // ── Der Strom ─────────────────────────────────────────────────────────────
  abschnitt('Die Antwort kommt stückweise und wird gesichert')
  pruefe('die Stücke kommen einzeln', tor.ereignisse.filter(e => e.art === 'text').length > 3,
         '(waren ' + tor.ereignisse.filter(e => e.art === 'text').length + ')')
  pruefe('die Quellen kommen vor dem ersten Textstück',
         tor.ereignisse[0]?.art === 'quellen',
         '(erstes war ' + tor.ereignisse[0]?.art + ')')
  pruefe('am Ende steht ein Abschluss mit Knoten',
         tor.fertig?.knoten === 'Attrappe', '(war ' + JSON.stringify(tor.fertig) + ')')
  pruefe('Umlaute kommen heil an',
         tor.text.includes('Größe') && !tor.text.includes('Ã'),
         '(kam: ' + tor.text.slice(0, 60) + ')')

  const gelesen = await ruf('/api/assistent/chats/' + annaChat, { token: annaTok })
  const nn = gelesen.json?.nachrichten || []
  pruefe('Frage und Antwort stehen im Verlauf', nn.length >= 2)
  pruefe('die erste Zeile ist die Frage', nn[0]?.rolle === 'user')
  pruefe('bei der Antwort steht der Knoten',
         nn[1]?.knoten === 'Attrappe', '(war ' + nn[1]?.knoten + ')')
  pruefe('und die Quellen, auf die sie sich stützte',
         Array.isArray(nn[1]?.quellen) && nn[1].quellen.length > 0)
  pruefe('die Unterhaltung heißt wie die erste Frage',
         /^Was ist beim Weinkeller/.test(gelesen.json?.titel || ''),
         '(hieß ' + JSON.stringify(gelesen.json?.titel) + ')')

  // ── Fremde Unterhaltungen ─────────────────────────────────────────────────
  abschnitt('Jede Person sieht nur ihre eigenen Unterhaltungen')
  const bertListe = await ruf('/api/assistent/chats', { token: bertTok })
  pruefe('Bert sieht nur seine eine',
         bertListe.json?.length === 1 && bertListe.json[0].id === bertChat,
         '(sah ' + JSON.stringify(bertListe.json?.map(c => c.id)) + ')')
  const fremd = await ruf('/api/assistent/chats/' + annaChat, { token: bertTok })
  pruefe('Annas Unterhaltung ist für ihn nicht da (404, nicht 403)',
         fremd.status === 404, '(war ' + fremd.status + ')')
  const fremdWeg = await ruf('/api/assistent/chats/' + annaChat,
                             { methode: 'DELETE', token: bertTok })
  const nochDa = await ruf('/api/assistent/chats/' + annaChat, { token: annaTok })
  pruefe('und er kann sie nicht löschen',
         fremdWeg.status === 404 && nochDa.status === 200,
         '(war ' + fremdWeg.status + '/' + nochDa.status + ')')
  const fremdUm = await ruf('/api/assistent/chats/' + annaChat + '/titel',
                            { methode: 'POST', token: bertTok,
                              koerper: { titel: 'Gekapert' } })
  pruefe('und nicht umbenennen', fremdUm.status === 404,
         '(war ' + fremdUm.status + ')')
  const fremdFragen = await ruf('/api/assistent/chats/' + annaChat + '/fragen',
                                { methode: 'POST', token: bertTok,
                                  koerper: { frage: 'Und jetzt?' } })
  pruefe('und darin auch nicht fragen', fremdFragen.status === 404,
         '(war ' + fremdFragen.status + ')')

  abschnitt('Löschen nimmt die Nachrichten mit')
  const weg = await ruf('/api/assistent/chats/' + bertChat,
                        { methode: 'DELETE', token: bertTok })
  pruefe('die eigene lässt sich löschen', weg.status === 200)
  const weglesen = await ruf('/api/assistent/chats/' + bertChat, { token: bertTok })
  pruefe('danach ist sie nicht mehr da', weglesen.status === 404)

  abschnitt('Ohne Anmeldung nichts')
  const ohne = await fetch('http://127.0.0.1:' + PORT_APP + '/api/assistent/chats')
  pruefe('401 statt einer Liste', ohne.status === 401, '(war ' + ohne.status + ')')

  abschnitt('Leere Frage')
  const leer = await ruf('/api/assistent/chats/' + annaChat + '/fragen',
                         { methode: 'POST', token: annaTok, koerper: { frage: '  ' } })
  pruefe('400 statt eines leeren KI-Aufrufs', leer.status === 400,
         '(war ' + leer.status + ')')

  // ── Wenn das Dashboard nicht mitspielt ────────────────────────────────────
  abschnitt('Fehler des Dashboards kommen als Fehler an, nicht als Absturz')
  await stubModus('abweisen')
  const abgewiesen = await fragen(annaChat, 'Was ist mit dem Tor?', annaTok, 'p-offen')
  pruefe('der Strom beginnt trotzdem (Quellen zuerst)',
         abgewiesen.ereignisse[0]?.art === 'quellen')
  pruefe('und endet mit einem Fehler im Klartext',
         typeof abgewiesen.fehler === 'string' && /Dienstschlüssel/.test(abgewiesen.fehler),
         '(war ' + JSON.stringify(abgewiesen.fehler) + ')')
  pruefe('der Fehler steht danach im Verlauf',
         (await ruf('/api/assistent/chats/' + annaChat, { token: annaTok }))
           .json.nachrichten.some(n => n.fehler))

  await stubModus('kaputt')
  const kaputt = await fragen(annaChat, 'Und jetzt?', annaTok)
  pruefe('auch eine 503 des Dashboards kommt als Klartext',
         typeof kaputt.fehler === 'string' && kaputt.fehler.length > 0,
         '(war ' + JSON.stringify(kaputt.fehler) + ')')

  await stubModus('brav')
  const wiederDa = await fragen(annaChat, 'Wie breit wird das Tor?', annaTok, 'p-offen')
  pruefe('danach geht es wieder', wiederDa.fertig?.knoten === 'Attrappe',
         '(war ' + JSON.stringify(wiederDa.fehler) + ')')

  // ── Der Rückgriff bei realistischer Menge ─────────────────────────────────
  // Bis hierher gab es zwei Protokolle. Das verdeckt genau den Fehler, der im
  // Betrieb auffiel: Erst wenn vieles dasteht, zeigt sich, dass „irgendein
  // Wort getroffen" kein Auswahlkriterium ist. Am ersten Tag holte ein
  // „Hallo Test!" 44 Fundstellen und ein „nochmal" 29 — die richtige Stelle
  // stand zwischen achtundzwanzig anderen.
  abschnitt('Vierzig weitere Protokolle: Allerweltswörter zählen nicht mehr')
  for (let i = 1; i <= 40; i++) {
    await ruf('/api/protocols', { methode: 'POST', token: chefTok, koerper: {
      id: 'pr-masse-' + i, projectId: 'p-offen', projectName: 'Halle Nord',
      meetingType: 'Jour fixe', date: '2026-0' + (1 + (i % 9)) + '-1' + (i % 10),
      agendaItems: [{ no: '1.' + i, topic: 'Besprechung im Projekt Nummer ' + i,
        discussion: 'Im Protokoll zu diesem Projekt wurde der Test der '
                  + 'Anlagen besprochen. Ein Protokoll je Projekt.',
        result: 'Ergebnis ' + i + ' festgehalten.', status: 'offen' }],
      actionItems: [{ no: '1', description: 'Aufgabe im Projekt ' + i,
        responsible: 'Anna Architektin', status: 'offen' }] } })
  }
  // Eine einzige Stelle mit einem seltenen Wort.
  await ruf('/api/protocols', { methode: 'POST', token: chefTok, koerper: {
    id: 'pr-selten', projectId: 'p-offen', projectName: 'Halle Nord',
    meetingType: 'Baubesprechung', date: '2026-10-02',
    agendaItems: [{ no: '4.2', topic: 'Sprinklerzentrale',
      discussion: 'Die Sprinklerzentrale muss in den Technikraum verlegt werden.',
      result: 'Verlegung in Raum 0.14 beschlossen.', status: 'offen' }] } })

  const gruss = await fragen(annaChat, 'Hallo Test!', annaTok)
  pruefe('ein Gruss holt keine einzige Fundstelle',
         (gruss.quellen?.quellen || []).length === 0,
         '(waren: ' + JSON.stringify(gruss.quellen?.quellen) + ')')
  pruefe('und der Kopf verweist auf die Unterhaltung statt auf Material',
         /# Gefundene Stellen\s+Keine\./.test(gruss.gesendet?.system || '')
         && /bisherige Unterhaltung/.test(gruss.gesendet?.system || ''))

  const nochmal = await fragen(annaChat, 'nochmal', annaTok)
  pruefe('ein blosses „nochmal" ebenfalls keine',
         (nochmal.quellen?.quellen || []).length === 0,
         '(waren ' + (nochmal.quellen?.quellen || []).length + ')')
  pruefe('und es wird auf die Unterhaltung verwiesen',
         /bisherige Unterhaltung/.test(nochmal.gesendet?.system || ''))
  pruefe('auch ein Wort, das es nirgends gibt, wird als gesucht benannt',
         /Gesucht wurde nach:[^\n]*reykjavik/.test(
           (await fragen(annaChat, 'Was ist mit dem Hangar in Reykjavik?', annaTok))
             .gesendet?.system || ''))

  const allerwelt = await fragen(annaChat, 'Was steht im Protokoll zum Projekt?', annaTok)
  pruefe('eine Frage nur aus Allerweltswörtern holt nichts',
         (allerwelt.quellen?.quellen || []).length === 0,
         '(waren: ' + JSON.stringify(allerwelt.quellen?.quellen) + ')')
  pruefe('„projekt" und „protokoll" stehen nicht mehr als Suchwort da',
         !(allerwelt.quellen?.begriffe || []).includes('projekt')
         && !(allerwelt.quellen?.begriffe || []).includes('protokoll'),
         '(waren ' + JSON.stringify(allerwelt.quellen?.begriffe) + ')')

  const selten = await fragen(annaChat, 'Wo soll die Sprinklerzentrale hin?', annaTok)
  const sq = selten.quellen?.quellen || []
  pruefe('ein seltenes Wort findet genau seine Stelle',
         sq.length >= 1 && sq.length <= 3, '(waren: ' + JSON.stringify(sq) + ')')
  pruefe('und keine Handbuchabschnitte nebenher',
         !sq.some(q => q.startsWith('Handbuch:')),
         '(waren: ' + JSON.stringify(sq) + ')')
  pruefe('und zwar die richtige',
         (selten.gesendet?.system || '').includes('Raum 0.14'))
  pruefe('die 40 Jour-fixe-Protokolle kommen nicht mit',
         !/Besprechung im Projekt Nummer/.test(selten.gesendet?.system || ''))

  const hilfe2 = await fragen(annaChat, 'Wie lege ich ein neues Projekt an?', annaTok)
  pruefe('eine Bedienfrage bringt das Handbuch, nicht vierzig Protokolle',
         (hilfe2.gesendet?.system || '').includes('# Aus dem Nutzerhandbuch')
         && !/Besprechung im Projekt Nummer/.test(hilfe2.gesendet?.system || ''),
         '(Quellen: ' + JSON.stringify(hilfe2.quellen?.quellen) + ')')

  abschnitt('Wie Menschen tippen, nicht wie es im Handbuch steht')
  // Alle drei Regeln stammen aus echten Fehlschlaegen am 04.11.2026, bei
  // denen der Bot mangels Fundstelle eine Oberflaeche erfunden hat.
  pruefe('ss trifft ß: „schliesse" findet „schließen"',
         k._treffer('Protokoll abschließen, schließen und sperren', ['schliesse']).punkte > 0)
  pruefe('ae trifft ä: „aendern" findet „ändern"',
         k._treffer('Eigenes Passwort ändern', ['aendern']).punkte > 0)
  pruefe('und die Frage wird genauso angeglichen',
         k._begriffe('Wie schliesse ich ab?').includes('schliesse'))

  // Zusammengesetzte Woerter, Rueckfallebene.
  const gew1 = (() => {
    const st = [{ text: 'Maßnahmen und Aufgaben anlegen' }, { text: 'Teilnehmer eintragen' }]
    return { st, g: k._gewichte(st, ['massnahmenpunkt']) }
  })()
  pruefe('ein Wort, das nirgends steht, bekommt die Rueckfallebene',
         gew1.g.ohneTreffer.has('massnahmenpunkt'))
  pruefe('und findet damit sein Grundwort',
         k._treffer(gew1.st[0].text, ['massnahmenpunkt'], gew1.g, gew1.g.ohneTreffer).punkte > 0)
  pruefe('aber nicht den unbeteiligten Abschnitt',
         k._treffer(gew1.st[1].text, ['massnahmenpunkt'], gew1.g, gew1.g.ohneTreffer).punkte === 0)

  // Und der Rueckschritt, den die erste Fassung der Regel verursacht hat.
  const gew2 = (() => {
    const st = [{ text: 'Was ist eine Protokollkette?' },
                { text: 'Neues Protokoll anlegen' },
                { text: 'Protokoll als PDF drucken' }]
    return { st, g: k._gewichte(st, ['protokollkette']) }
  })()
  pruefe('ein Wort, das es wirklich gibt, nimmt die Rueckfallebene NICHT',
         !gew2.g.ohneTreffer.has('protokollkette'))
  pruefe('es trifft nur seinen eigenen Abschnitt',
         k._treffer(gew2.st[0].text, ['protokollkette'], gew2.g, gew2.g.ohneTreffer).punkte > 0
         && k._treffer(gew2.st[1].text, ['protokollkette'], gew2.g, gew2.g.ohneTreffer).punkte === 0,
         '(sonst begruebe die Hilfsregel genau die richtige Stelle)')

  abschnitt('Das Handbuch beschreibt die Anwendung von heute')
  const hb2 = k._handbuch()
  const titel = hb2.map(a => a.titel).join(' | ')
  for (const [was, muss] of [['Projektdatenbank', true], ['Zugangsbeschränkung', true],
                             ['Freimeldung', true], ['Notizbuch', true],
                             ['Baudokumentation', true], ['Projekt-Dashboard', true]]) {
    pruefe('ein Abschnitt zu „' + was + '" ist da',
           titel.includes(was) === muss, '(Titel: ' + titel.slice(0, 80) + '…)')
  }
  const anlegen = hb2.find(a => a.titel === 'Neues Projekt anlegen')
  pruefe('„Neues Projekt anlegen" nennt die Projektdatenbank',
         Boolean(anlegen) && /Projektdatenbank/.test(anlegen.text))
  pruefe('und die drei Pflichtfelder',
         Boolean(anlegen) && /Nummer/.test(anlegen.text) && /Kürzel/.test(anlegen.text)
         && /Projektbezeichnung/.test(anlegen.text))
  pruefe('und dass es dort nur Admins duerfen',
         Boolean(anlegen) && /Administrator/.test(anlegen.text))
  pruefe('die alte, falsche Anleitung steht nicht mehr da',
         !/Startseite → „Neues Projekt"/.test(hb2.map(a => a.text).join('\n')))

  abschnitt('Das Feste steht vorn, das Wechselnde hinten')
  // Nicht Geschmack, sondern Tempo: LM Studio verwendet den gleichbleibenden
  // Anfang eines Systemkopfs wieder. Gemessen am 04.11.2026 auf der 4090,
  // 9000 Zeichen Kopf: derselbe Anfang 0,19 s bis zum ersten Zeichen, ein
  // anderer Anfang 3,43 s. Wer hier umsortiert, macht das wertlos -- ohne
  // dass etwas kaputtgeht. Es wird nur langsam, und niemand weiss warum.
  const ordnung = (kopf, was) => kopf.indexOf(was)
  const k2 = tor.gesendet?.system || ''
  const pVerzeichnis = ordnung(k2, '# Projekte, die du sehen darfst')
  const pMappe       = ordnung(k2, '## Projekt: Halle Nord')
  const pStellen     = ordnung(k2, '# Gefundene Stellen')
  pruefe('die Anweisung steht ganz vorn',
         k2.indexOf('Du bist der Assistent') === 0, '(bei %s)' .replace('%s', k2.indexOf('Du bist der Assistent')))
  pruefe('danach das Projektverzeichnis', pVerzeichnis > 0)
  pruefe('dann die Projektmappe', pMappe > pVerzeichnis,
         '(Verzeichnis ' + pVerzeichnis + ', Mappe ' + pMappe + ')')
  pruefe('und zuletzt die gefundenen Stellen', pStellen > pMappe,
         '(Mappe ' + pMappe + ', Stellen ' + pStellen + ')')
  const k3 = hilfe2.gesendet?.system || ''
  pruefe('das Handbuch steht hinter dem Projektverzeichnis',
         ordnung(k3, '# Aus dem Nutzerhandbuch')
         > ordnung(k3, '# Projekte, die du sehen darfst'),
         '(Verzeichnis ' + ordnung(k3, '# Projekte, die du sehen darfst')
         + ', Handbuch ' + ordnung(k3, '# Aus dem Nutzerhandbuch') + ')')

  abschnitt('Alles zusammen passt in das Fenster des Modells')
  // Der Fehler, der im Betrieb auffiel, war keine schlechte Antwort, sondern
  // gar keine: Kopf plus Verlauf plus Antwort lagen über 8192 Token, und ein
  // uebergelaufenes Fenster meldet nichts, es liefert nichts.
  const ZEICHEN_JE_TOKEN = 3.2        // gemessen: 3,38–3,47 bei deutschem Text
  const FENSTER = 8192
  const kopfZ = (hilfe2.gesendet?.system || '').length
  const verlaufZ = (hilfe2.gesendet?.nachrichten || [])
    .reduce((s, n) => s + (n.content || '').length, 0)
  const token = Math.ceil((kopfZ + verlaufZ) / ZEICHEN_JE_TOKEN)
             + (hilfe2.gesendet?.max_tokens || 0)
  pruefe('Kopf, Verlauf und Antwort bleiben unter 8192 Token',
         token < FENSTER,
         '(waren ~' + token + ': Kopf ' + kopfZ + ' Z, Verlauf ' + verlaufZ + ' Z, '
         + 'Antwort ' + (hilfe2.gesendet?.max_tokens) + ' Token)')
  pruefe('und zwar mit Abstand, nicht knapp',
         token < FENSTER * 0.8, '(waren ~' + token + ' von ' + FENSTER + ')')
  pruefe('die Antwortlaenge ist auf 900 Token gesetzt',
         hilfe2.gesendet?.max_tokens === 900,
         '(war ' + hilfe2.gesendet?.max_tokens + ')')

  // ── Neuigkeiten ───────────────────────────────────────────────────────────
  abschnitt('Die Neuigkeit kommt aus der Datei, nicht aus dem Modell')
  const nk = require(path.join(WURZEL, 'server', 'neuigkeiten.js'))
  const eintraege = nk.lesen({ frisch: true })
  pruefe('neuigkeiten.md wird gelesen', eintraege.length >= 1,
         '(waren ' + eintraege.length + ')')
  pruefe('das Beispiel aus der Anleitung zaehlt nicht mit',
         !eintraege.some(e => /So wird eine Neuigkeit/.test(e.titel))
         && eintraege.every(e => /^\d{4}-\d{2}-\d{2}/.test(e.kennung)),
         '(Kennungen: ' + eintraege.map(e => e.kennung).join(', ') + ')')
  pruefe('die Bildzeile steht nicht im Flaechentext',
         eintraege.every(e => !/!\[/.test(e.text)))

  abschnitt('Jede Person sieht jede Neuigkeit genau einmal')
  const holeNews = async (token) =>
    (await ruf('/api/assistent/neuigkeiten', { token })).json?.neuigkeiten || []

  const bertNews1 = await holeNews(bertTok)
  pruefe('beim ersten Mal ist etwas da', bertNews1.length >= 1,
         '(waren ' + bertNews1.length + ')')
  pruefe('mit Kennung, Titel und Text',
         Boolean(bertNews1[0]?.kennung && bertNews1[0]?.titel && bertNews1[0]?.text))
  pruefe('hoechstens drei auf einmal', bertNews1.length <= nk.HOECHSTENS)

  const weggeklickt = await ruf('/api/assistent/neuigkeiten/gesehen', {
    methode: 'POST', token: bertTok,
    koerper: { kennungen: bertNews1.map(n => n.kennung) } })
  pruefe('weggeklickt wird angenommen', weggeklickt.status === 200,
         '(war ' + weggeklickt.status + ')')
  pruefe('danach ist nichts mehr offen', (await holeNews(bertTok)).length === 0)
  pruefe('fuer Anna aber schon noch', (await holeNews(annaTok)).length >= 1)

  const erfunden = await ruf('/api/assistent/neuigkeiten/gesehen', {
    methode: 'POST', token: annaTok, koerper: { kennungen: ['gibt-es-nicht'] } })
  pruefe('eine erfundene Kennung wird nicht gemerkt',
         erfunden.json?.gemerkt === 0, '(gemerkt: ' + erfunden.json?.gemerkt + ')')
  pruefe('und aendert nichts am Offenen', (await holeNews(annaTok)).length >= 1)

  abschnitt('Aus der Neuigkeit heraus laesst sich nachfragen')
  const annaNews = await holeNews(annaTok)
  const ausNews = await ruf('/api/assistent/chats', {
    methode: 'POST', token: annaTok,
    koerper: { neuigkeit: annaNews[0].kennung } })
  pruefe('die Unterhaltung heisst wie die Neuigkeit',
         ausNews.json?.titel && annaNews[0].titel.startsWith(ausNews.json.titel.replace('…', '')),
         '(hiess ' + JSON.stringify(ausNews.json?.titel) + ')')

  const gelesen2 = await ruf('/api/assistent/chats/' + ausNews.json.id, { token: annaTok })
  const erste = gelesen2.json?.nachrichten?.[0]
  pruefe('der Text steht WIRKLICH im Verlauf, nicht nur auf dem Schirm',
         erste?.rolle === 'assistant' && erste.inhalt.includes(annaNews[0].titel),
         '(war ' + JSON.stringify(erste?.inhalt?.slice(0, 60)) + ')')
  pruefe('die Herkunft ist vermerkt',
         (erste?.quellen || []).some(q => q.startsWith('neuigkeit:')),
         '(waren ' + JSON.stringify(erste?.quellen) + ')')
  pruefe('das Oeffnen hat sie zugleich als gesehen gemerkt',
         !(await holeNews(annaTok)).some(n => n.kennung === annaNews[0].kennung))

  // Und jetzt der Punkt, auf den es ankommt: Die Nachfrage muss den
  // Gegenstand kennen. Ohne die gespeicherte erste Nachricht ginge sie ins
  // Leere -- das Modell wuesste nicht, wovon die Rede ist.
  const nachfrage = await fragen(ausNews.json.id, 'Wie meinst du das genau?', annaTok)
  const gesendet = nachfrage.gesendet?.nachrichten || []
  pruefe('die Neuigkeit geht als Vorgeschichte an das Modell mit',
         gesendet.some(n => n.role === 'assistant'
                            && n.content.includes(annaNews[0].titel)),
         '(Verlauf: ' + gesendet.length + ' Nachrichten)')

  abschnitt('Der Status sagt, ob eine KI da ist')
  const st = await ruf('/api/assistent/status', { token: annaTok })
  pruefe('eingerichtet ist true', st.json?.eingerichtet === true)
  pruefe('kein Grund genannt', st.json?.grund === null)
  pruefe('und eine Person erkannt', st.json?.person === true)
  pruefe('die Zahl der freigegebenen Projekte steht dabei',
         st.json?.projekte === 2, '(war ' + st.json?.projekte + ')')
  const stBert = await ruf('/api/assistent/status', { token: bertTok })
  pruefe('und sie ist fuer Bert eine kleinere',
         stBert.json?.projekte === 1, '(war ' + stBert.json?.projekte + ')')
}

// Mit --vorschau bleibt am Ende alles stehen: derselbe Server, dieselben
// Testdaten, dieselbe Attrappe. Dann laesst sich die Oberflaeche ansehen,
// ohne dafuer eine zweite Umgebung aufzubauen -- und ohne die Betriebsdaten
// anzufassen. Die Datenbank liegt im Temp-Verzeichnis und wird beim
// Beenden (Strg+C) nicht aufgeraeumt, damit man sie nachsehen kann.
const VORSCHAU = process.argv.includes('--vorschau')

main()
  .then(() => {
    if (VORSCHAU) {
      console.log('\n%d gruen, %d rot', GRUEN, ROT)
      console.log('\n── Vorschau laeuft ───────────────────────────────')
      console.log('  http://127.0.0.1:%d', PORT_APP)
      console.log('  Anmeldung: anna / anna-Passwort-1  (sieht beide Projekte)')
      console.log('             bert / bert-Passwort-1  (sieht nur Halle Nord)')
      console.log('  Datenbank: %s', scratch)
      console.log('  Beenden mit Strg+C.')
      return
    }
    abbauen()
    console.log('\n%d gruen, %d rot', GRUEN, ROT)
    try { fs.rmSync(scratch, { recursive: true, force: true }) } catch { /* egal */ }
    process.exit(ROT ? 1 : 0)
  })
  .catch((e) => {
    abbauen()
    console.error('\nAbgebrochen:', e?.stack || e)
    console.error('Serverprotokoll:', path.join(scratch, 'server.log'))
    console.log('\n%d gruen, %d rot (Lauf unvollstaendig)', GRUEN, ROT)
    process.exit(1)
  })
