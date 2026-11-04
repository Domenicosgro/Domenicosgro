'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Der Rückgriff: Was gehört zu dieser Frage?
//
// Hier entsteht der Systemkopf, den der Assistent mitbekommt. Zwei Dinge sind
// daran wichtig, und beide sind Absicht:
//
// 1. **Gelesen wird nur, was die fragende Person auch sehen darf.** Die
//    Prüfung dafür wird von aussen hereingegeben (`darfProjekt`) -- es ist
//    dieselbe Funktion `canAccessProject`, die auch die Oberfläche benutzt.
//    Eine zweite, eigene Prüfung wäre die, die eines Tages von der ersten
//    abweicht, und dann sieht der Assistent mehr als das Programm zeigt.
//
// 2. **Was nicht in den Kopf passt, wird weggelassen, nicht abgeschnitten.**
//    Das Modell hat ein Zeichenbudget. Ein mitten im Satz gekappter
//    Protokollpunkt sieht für das Modell aus wie ein vollständiger -- und die
//    Antwort darauf ist falsch, ohne als unvollständig erkennbar zu sein.
//    Deshalb werden ganze Stücke aufgenommen oder gar keine, und am Ende
//    steht im Kopf, wie viele Treffer nicht mehr hineinpassten.
//
// Die Suche ist eine Stichwortsuche, keine Bedeutungssuche. Bei 66 Protokollen
// in 21 Projekten ist das nicht nur ausreichend, sondern auch nachprüfbar: Man
// kann sehen, warum etwas gefunden wurde. Der Preis ist, dass Synonyme nicht
// gefunden werden -- deshalb sagt der Systemkopf dem Modell ausdrücklich, es
// soll das Fehlen von Material benennen statt es zu überbrücken.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

// Zeichenbudget für den ganzen Systemkopf. Das Dashboard lehnt alles über
// KI_MAX_INPUT (24000) ab, und zwar mit einem Fehler statt mit einer
// gekappten Antwort. Hier wird deutlich darunter geblieben: Die Anweisungen,
// das Projektverzeichnis und der Verlauf kommen noch dazu.
const BUDGET_GESAMT   = 17000
const BUDGET_HANDBUCH = 4000
const BUDGET_STUECK   = 1800   // ein einzelnes Stück höchstens

// Wörter, die in jeder Frage vorkommen und nichts aussagen. Ohne diese Liste
// trifft "Was ist in dem Projekt noch offen?" auf jedes Protokoll, in dem
// "ist" steht -- also auf alle.
const FUELLWOERTER = new Set([
  'aber', 'alle', 'allen', 'aller', 'alles', 'als', 'also', 'auch', 'auf',
  'aus', 'bei', 'beim', 'bin', 'bis', 'dann', 'das', 'dass', 'dem', 'den',
  'der', 'des', 'die', 'dies', 'diese', 'diesem', 'diesen', 'dieser', 'doch',
  'dort', 'durch', 'ein', 'eine', 'einem', 'einen', 'einer', 'eines', 'für',
  'gab', 'ganz', 'geben', 'gibt', 'hab', 'habe', 'haben', 'hat', 'hatte',
  'hier', 'ich', 'ihm', 'ihn', 'ihr', 'ist', 'kann', 'kannst', 'könnte',
  'mal', 'man', 'mehr', 'mein', 'mich', 'mir', 'mit', 'muss', 'nach', 'nicht',
  'noch', 'nun', 'nur', 'ob', 'oder', 'ohne', 'schon', 'sein', 'seine', 'sich',
  'sie', 'sind', 'so', 'soll', 'sollen', 'über', 'um', 'und', 'uns', 'unser',
  'von', 'vom', 'vor', 'war', 'waren', 'was', 'weil', 'welche', 'welcher',
  'wenn', 'wer', 'werden', 'wie', 'wieder', 'wir', 'wird', 'wo', 'wurde',
  'würde', 'zu', 'zum', 'zur', 'zwar',
])

const ohneHtml = (s) => String(s || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim()

const datum = (d) => {
  if (!d) return 'ohne Datum'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d)
}

/** Die tragenden Wörter einer Frage. Zahlen und Kürzel bleiben erhalten. */
function begriffe(frage) {
  const roh = String(frage || '').toLowerCase()
  const gefunden = roh.match(/[a-zäöüß0-9][a-zäöüß0-9\-/.]*/g) || []
  const heraus = new Set()
  for (const w of gefunden) {
    const sauber = w.replace(/^[-/.]+|[-/.]+$/g, '')
    if (!sauber || FUELLWOERTER.has(sauber)) continue
    // Projekt- und Protokollnummern wie "24-07" oder "2.1" sind kurz und
    // tragen viel. Alles andere unter drei Zeichen ist Rauschen.
    if (sauber.length < 3 && !/\d/.test(sauber)) continue
    heraus.add(sauber)
  }
  return [...heraus]
}

/**
 * Wie gut ein Text zu den Begriffen passt.
 *
 * Abdeckung zählt mehr als Häufigkeit: Ein Punkt, in dem drei der vier
 * gesuchten Wörter vorkommen, gehört vor einen, in dem ein Wort achtmal
 * steht. Sonst gewinnt immer der längste Text.
 */
function treffer(text, worte) {
  if (!text) return { punkte: 0, getroffen: [] }
  const klein = text.toLowerCase()
  let abdeckung = 0, haeufigkeit = 0
  const getroffen = []
  for (const w of worte) {
    let ab = 0, n = 0
    for (;;) {
      const i = klein.indexOf(w, ab)
      if (i === -1) break
      n++; ab = i + w.length
    }
    if (n > 0) { abdeckung++; haeufigkeit += n; getroffen.push(w) }
  }
  return { punkte: abdeckung * 10 + Math.min(haeufigkeit, 10), getroffen }
}

// ── Das Handbuch ─────────────────────────────────────────────────────────────

let _handbuch = null

/**
 * Das Nutzerhandbuch in Abschnitte, einmal gelesen und dann behalten.
 *
 * Es liegt unter server/, nicht im Projektstamm: Das Produktionsabbild kopiert
 * nur server/ und dist/. Vorher lag es oben -- dort wäre es im Behälter nicht
 * vorhanden gewesen, und der Assistent hätte zu jeder Bedienfrage gesagt, er
 * wisse es nicht.
 */
function handbuch() {
  if (_handbuch) return _handbuch
  let roh = ''
  try {
    roh = fs.readFileSync(path.join(__dirname, 'handbuch.md'), 'utf8')
  } catch (e) {
    console.error('[kontext] handbuch.md nicht lesbar:', e?.message || e)
    _handbuch = []
    return _handbuch
  }
  const abschnitte = []
  let titel = 'Einleitung', zeilen = []
  const schliessen = () => {
    const text = zeilen.join('\n').trim()
    if (text) abschnitte.push({ titel, text })
  }
  for (const zeile of roh.split(/\r?\n/)) {
    const k = zeile.match(/^(#{2,3})\s+(.*)$/)
    if (k) { schliessen(); titel = k[2].trim(); zeilen = []; continue }
    zeilen.push(zeile)
  }
  schliessen()
  _handbuch = abschnitte
  return _handbuch
}

function handbuchTeile(worte) {
  if (!worte.length) return []
  const bewertet = handbuch()
    .map(a => ({ ...a, ...treffer(a.titel + '\n' + a.text, worte) }))
    // Der Titel wiegt mehr: "Passwort ändern" trifft die Frage nach dem
    // Passwort genauer als ein Abschnitt, in dem das Wort nebenbei fällt.
    .map(a => ({ ...a, punkte: a.punkte + treffer(a.titel, worte).punkte * 2 }))
    .filter(a => a.punkte > 0)
    .sort((a, b) => b.punkte - a.punkte)

  const heraus = []
  let platz = BUDGET_HANDBUCH
  for (const a of bewertet) {
    const stueck = `### ${a.titel}\n${a.text}`
    if (stueck.length > platz) continue
    heraus.push({ titel: a.titel, text: stueck, punkte: a.punkte })
    platz -= stueck.length
    if (heraus.length >= 4) break
  }
  return heraus
}

// ── Die Projektdaten ─────────────────────────────────────────────────────────

/** Kurzzeile je Projekt, damit das Modell Namen und Nummern zuordnen kann. */
function projektZeile(p) {
  const teile = [p.name || '(ohne Namen)']
  if (p.nummer)      teile.push('Nr. ' + p.nummer)
  if (p.kuerzel)     teile.push(p.kuerzel)
  if (p.bezeichnung) teile.push(p.bezeichnung)
  return '- ' + teile.join(' · ')
}

/**
 * Die Mappe eines Projekts: Stammdaten, Beteiligte, offene Aufgaben.
 *
 * Bei den Beteiligten stehen Name, Firma, Gewerk und Rolle -- **keine
 * E-Mail-Adressen und keine Telefonnummern**. Für "wer macht die Statik?"
 * braucht das Modell sie nicht, und was nicht im Kopf steht, kann auch nicht
 * in einer Antwort auftauchen, die jemand weiterschickt. Verschlüsselte
 * Kontakte bleiben ohnehin draussen: Der Schlüssel liegt im Browser.
 */
function projektMappe(p, aufgaben) {
  const zeilen = [`## Projekt: ${p.name || '(ohne Namen)'}`]
  if (p.nummer)      zeilen.push(`Nummer: ${p.nummer}`)
  if (p.kuerzel)     zeilen.push(`Kürzel: ${p.kuerzel}`)
  if (p.bezeichnung) zeilen.push(`Bezeichnung: ${p.bezeichnung}`)
  if (p.gesellschaft) zeilen.push(`Gesellschaft: ${p.gesellschaft}`)
  if (p.vertrag)     zeilen.push(`Vertrag: ${p.vertrag}`)

  const kontakte = Array.isArray(p.contacts) ? p.contacts : []
  if (p.isEncrypted) {
    zeilen.push('Beteiligte: verschlüsselt hinterlegt, hier nicht lesbar.')
  } else if (kontakte.length) {
    zeilen.push('Beteiligte:')
    for (const k of kontakte.slice(0, 40)) {
      const t = [k.name, k.company, k.gewerk, k.role].filter(Boolean).join(' · ')
      if (t) zeilen.push(`  - ${t}`)
    }
  }

  const offen = aufgaben.filter(a => a.status !== 'erledigt')
  if (offen.length) {
    zeilen.push(`Offene Aufgaben (${offen.length}):`)
    for (const a of offen.slice(0, 40)) {
      const t = [
        a.no ? `${a.no}.` : null,
        ohneHtml(a.description).slice(0, 180),
        a.responsible ? `– ${a.responsible}` : null,
        a.deadline ? `(bis ${datum(a.deadline)})` : null,
        a.status && a.status !== 'offen' ? `[${a.status}]` : null,
      ].filter(Boolean).join(' ')
      zeilen.push(`  - ${t}`)
    }
  } else {
    zeilen.push('Offene Aufgaben: keine.')
  }
  return zeilen.join('\n')
}

/** Alle Stücke, die als Treffer in Frage kommen. */
function stueckeSammeln(protokolle, notizen, projektNamen) {
  const stuecke = []

  for (const pr of protokolle) {
    const wo = projektNamen.get(pr.projectId) || pr.projectName || 'ohne Projekt'
    const kopf = `${wo} · ${pr.meetingType || 'Besprechung'} · ${datum(pr.date)}`

    for (const it of (Array.isArray(pr.agendaItems) ? pr.agendaItems : [])) {
      const text = [ohneHtml(it.topic), ohneHtml(it.discussion),
                    ohneHtml(it.result)].filter(Boolean).join(' — ')
      if (!text) continue
      stuecke.push({
        quelle: `Protokoll ${kopf}, Punkt ${it.no || '?'}`,
        projektId: pr.projectId || null,
        text: `[Protokoll ${kopf}, Punkt ${it.no || '?'}` +
              `${it.status ? ', ' + it.status : ''}` +
              `${it.assignedTo ? ', zuständig ' + it.assignedTo : ''}]\n${text}`,
      })
    }

    for (const a of (Array.isArray(pr.actionItems) ? pr.actionItems : [])) {
      const text = [ohneHtml(a.description), ohneHtml(a.remarks)]
        .filter(Boolean).join(' — ')
      if (!text) continue
      stuecke.push({
        quelle: `Aufgabe ${a.no || '?'} aus Protokoll ${kopf}`,
        projektId: pr.projectId || null,
        text: `[Aufgabe ${a.no || '?'} aus Protokoll ${kopf}` +
              `, Status ${a.status || 'offen'}` +
              `${a.responsible ? ', zuständig ' + a.responsible : ''}` +
              `${a.deadline ? ', Frist ' + datum(a.deadline) : ''}]\n${text}`,
      })
    }

    const bem = ohneHtml(pr.notes)
    if (bem) {
      stuecke.push({
        quelle: `Bemerkungen im Protokoll ${kopf}`,
        projektId: pr.projectId || null,
        text: `[Allgemeine Bemerkungen, Protokoll ${kopf}]\n${bem}`,
      })
    }
  }

  for (const n of notizen) {
    const wo = projektNamen.get(n.projectId) || 'ohne Projekt'
    const text = [ohneHtml(n.subject || n.title), ohneHtml(n.content || n.text),
                  ohneHtml(n.result)].filter(Boolean).join(' — ')
    if (!text) continue
    stuecke.push({
      quelle: `Notiz „${ohneHtml(n.subject || n.title) || 'ohne Titel'}" (${wo}, ${datum(n.date || n._updatedAt)})`,
      projektId: n.projectId || null,
      text: `[Notiz, ${wo}, ${datum(n.date || n._updatedAt)}]\n${text}`,
    })
  }

  return stuecke
}

// ── Der Systemkopf ───────────────────────────────────────────────────────────

const ANWEISUNG = `Du bist der Assistent im Programm „Komplizen Protokolle" des Büros
Komplizen Industrieplanung und Architektur. Du hilfst bei zwei Dingen:
Fragen zu den Bauprojekten dieses Büros und Fragen zur Bedienung des
Programms.

So antwortest du:
- Nur aus dem Material unten. Du erfindest nichts — keine Namen, keine
  Fristen, keine Beschlüsse, keine Protokollnummern.
- Steht die Antwort nicht im Material, sagst du genau das: dass du dazu
  nichts findest. Du nennst dann, wonach du gesucht hast, damit die Frage
  anders gestellt werden kann. Rate nicht.
- Du nennst deine Quelle. Die Angaben in eckigen Klammern über jedem
  Abschnitt sind dafür gedacht, zum Beispiel: „(Protokoll Halle Nord ·
  Baubesprechung · 14.09.2026, Punkt 2.1)".
- Deutsch, sachlich, kurz. Aufgaben als „Wer — Was — Bis wann".
- Du gibst keine Rechtsauskunft und keine Honorarberatung.

Was du nicht kannst: Du kannst nichts im Programm ändern — kein Protokoll
anlegen, keine Aufgabe speichern, keine E-Mail senden. Wer dich darum
bittet, erfährt von dir, wo es in der Oberfläche geht.

Wichtig zum Material: Es enthält nur, was die fragende Person auch selbst
im Programm sehen darf. Findest du etwas nicht, kann es auch daran liegen,
dass es zu einem Projekt ohne Freigabe gehört. Behaupte nie, etwas
existiere nicht — sage, dass du es nicht findest.`

/**
 * Den Systemkopf für eine Frage bauen.
 *
 * @param {object}   o
 * @param {object}   o.db            die Datenhaltung (server/db.js)
 * @param {string}   o.frage         die aktuelle Frage
 * @param {function} o.darfProjekt   (projekt) => boolean, von aussen
 * @param {string}   [o.projektId]   das gerade geöffnete Projekt
 * @param {string}   [o.benutzer]    Anzeigename, nur für die Anrede
 * @returns {{system: string, quellen: string[], projekte: number, uebrig: number}}
 */
function bauen({ db, frage, darfProjekt, projektId = null, benutzer = null }) {
  const worte = begriffe(frage)

  // 1. Was darf diese Person überhaupt sehen?
  const erlaubt = db.projects.list().filter(p => darfProjekt(p))
  const erlaubteIds = new Set(erlaubt.map(p => p.id))
  const namen = new Map(erlaubt.map(p => [p.id, p.name || '(ohne Namen)']))

  // Ein Protokoll ohne Projektbezug gehört niemandem und ist damit für alle
  // sichtbar -- genauso hält es GET /api/protocols.
  const protokolle = db.protocols.list()
    .filter(p => !p.projectId || erlaubteIds.has(p.projectId))
  const notizen = db.notes.list()
    .filter(n => !n.projectId || erlaubteIds.has(n.projectId))

  // 2. Welches Projekt steht im Mittelpunkt?
  let fokus = projektId && erlaubteIds.has(projektId)
    ? erlaubt.find(p => p.id === projektId)
    : null
  if (!fokus && worte.length) {
    // In der Frage genannt? Nur bei genau einem Treffer -- bei zwei wäre die
    // Wahl geraten, und eine geratene Mappe verdrängt echte Treffer.
    const genannt = erlaubt.filter(p => {
      const t = [p.name, p.nummer, p.kuerzel, p.bezeichnung]
        .filter(Boolean).join(' ').toLowerCase()
      return worte.some(w => w.length >= 3 && t.includes(w))
    })
    if (genannt.length === 1) fokus = genannt[0]
  }

  // 3. Die Stücke bewerten.
  const stuecke = stueckeSammeln(protokolle, notizen, namen)
  const bewertet = stuecke
    .map(s => ({ ...s, ...treffer(s.text, worte) }))
    .filter(s => s.punkte > 0)
    .map(s => ({
      ...s,
      // Das Projekt im Mittelpunkt zuerst: Wer in einem Projekt steht und
      // "noch offen?" fragt, meint dieses.
      punkte: s.punkte + (fokus && s.projektId === fokus.id ? 15 : 0),
    }))
    .sort((a, b) => b.punkte - a.punkte)

  // 4. Zusammensetzen, bis das Budget voll ist.
  const abschnitte = []
  const quellen = []
  let platz = BUDGET_GESAMT

  const hb = handbuchTeile(worte)
  if (hb.length) {
    const text = '# Aus dem Nutzerhandbuch\n\n' + hb.map(a => a.text).join('\n\n')
    abschnitte.push(text)
    platz -= text.length
    for (const a of hb) quellen.push('Handbuch: ' + a.titel)
  }

  const verzeichnis = '# Projekte, die du sehen darfst (' + erlaubt.length + ')\n'
    + erlaubt.map(projektZeile).join('\n')
  if (verzeichnis.length <= platz) {
    abschnitte.push(verzeichnis)
    platz -= verzeichnis.length
  }

  if (fokus) {
    const aufgaben = []
    for (const pr of protokolle) {
      if (pr.projectId !== fokus.id) continue
      for (const a of (Array.isArray(pr.actionItems) ? pr.actionItems : [])) {
        aufgaben.push(a)
      }
    }
    const mappe = projektMappe(fokus, aufgaben)
    if (mappe.length <= platz) {
      abschnitte.push(mappe)
      platz -= mappe.length
      quellen.push('Projektmappe: ' + (fokus.name || fokus.id))
    }
  }

  const gefunden = []
  let uebrig = 0
  for (const s of bewertet) {
    if (s.text.length > BUDGET_STUECK) {
      // Ein einzelnes übergrosses Stück würde allein das halbe Budget
      // fressen. Der Anfang genügt, um es zu finden -- und dass gekürzt
      // wurde, steht dabei.
      const kurz = s.text.slice(0, BUDGET_STUECK) + ' […gekürzt]'
      if (kurz.length + 2 > platz) { uebrig++; continue }
      gefunden.push(kurz); platz -= kurz.length + 2; quellen.push(s.quelle)
      continue
    }
    if (s.text.length + 2 > platz) { uebrig++; continue }
    gefunden.push(s.text); platz -= s.text.length + 2; quellen.push(s.quelle)
  }

  if (gefunden.length) {
    abschnitte.push('# Gefundene Stellen (' + gefunden.length +
                    (uebrig ? ', ' + uebrig + ' weitere passten nicht mehr dazu' : '') +
                    ')\n\n' + gefunden.join('\n\n'))
  } else if (worte.length) {
    abschnitte.push('# Gefundene Stellen\n\nKeine. Gesucht wurde nach: '
                    + worte.join(', ') + '.')
  }

  const anrede = benutzer ? `\n\nDie fragende Person heisst ${benutzer}.` : ''
  const system = ANWEISUNG + anrede + '\n\n---\n\n' + abschnitte.join('\n\n---\n\n')

  return { system, quellen, projekte: erlaubt.length, uebrig,
           fokus: fokus ? (fokus.name || fokus.id) : null,
           begriffe: worte }
}

module.exports = {
  bauen,
  BUDGET_GESAMT,
  // nur für die Prüfungen
  _begriffe: begriffe,
  _treffer: treffer,
  _ohneHtml: ohneHtml,
  _handbuch: handbuch,
}
