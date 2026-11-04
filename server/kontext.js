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

// ── Das Zeichenbudget ────────────────────────────────────────────────────────
//
// Die erste Fassung hatte hier 17000 Zeichen stehen, gegriffen aus dem Limit
// des Dashboards (KI_MAX_INPUT = 24000). Das war der falsche Maßstab. Maßgeblich
// ist das **Fenster des Modells**, und LM Studio lädt qwen3-14b derzeit mit
// 8192 Token. Am 04.11.2026 nachgemessen:
//
//   Systemkopf 17000 + Verlauf 6000 + Antwort 1500 Token  ->  0 Zeichen Antwort
//   Systemkopf  9000 + Verlauf 3000 + Antwort  900 Token  ->  561 Zeichen, 3,2 s
//
// Der erste Fall ist genau der Abriss, den Domenico bei seiner zweiten Frage
// gesehen hat: Die erste Frage passte noch, die zweite nicht mehr, weil der
// Verlauf dazukam. Ein Fenster, das überläuft, meldet keinen Fehler — es
// kommt einfach nichts.
//
// Umrechnung Zeichen je Token, gemessen am Handbuch über usage.prompt_tokens:
// 3,47 / 3,43 / 3,38 / 3,40 — also stabil 3,4. Gerechnet wird mit 3,2, damit
// eine Tabelle voller Zahlen und Namen (die schlechter tokenisiert) nicht
// über die Kante kippt.
const FENSTER_TOKEN  = Number(process.env.KI_FENSTER_TOKEN || 8192)
const ANTWORT_TOKEN  = Number(process.env.KI_ANTWORT_TOKEN || 900)
const RESERVE_TOKEN  = 300        // Rollenmarker, Gerüst, Rundung
const ZEICHEN_JE_TOKEN = 3.2

// Die harte Obergrenze: Was darüber liegt, kommt nicht mehr an.
const PLATZ_GESAMT = Math.floor(
  (FENSTER_TOKEN - ANTWORT_TOKEN - RESERVE_TOKEN) * ZEICHEN_JE_TOKEN)

// Das weiche Ziel, und es liegt **weit** darunter. Mehr Zusammenhang ist
// nicht besser: Bei 44 eingesammelten Stellen steht die eine richtige
// zwischen 43 Beiläufigkeiten, und das Modell antwortet entsprechend
// unscharf. Lieber wenig und passend.
const BUDGET_GESAMT   = Math.min(9000, PLATZ_GESAMT)
const BUDGET_HANDBUCH = 3000
const BUDGET_STUECK   = 1400   // ein einzelnes Stück höchstens

// So viele Fundstellen höchstens. Darüber hinaus hilft keine mehr — sie
// verdrängt nur die besseren.
const STELLEN_HOECHSTENS = 10

// Eine Stelle muss mindestens so gut sein wie dieser Anteil der besten.
// Ohne diese Schranke kam jede Stelle mit, die irgendein Wort enthielt:
// „nochmal" holte 29 Stellen, ein „Hallo Test!" sogar 44.
const STELLEN_SCHWELLE = 0.35

// Ein Wort, das in mehr als diesem Anteil aller Stellen vorkommt, sagt
// nichts mehr aus. „Projekt" und „Protokoll" stehen in jedem Protokoll —
// wer danach sucht, findet alles, und das ist dasselbe wie nichts finden.
const ALLERWELT_AB = 0.4

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
 * Was ein Suchwort wert ist — gemessen daran, wie selten es vorkommt.
 *
 * Das ist die Lehre aus dem ersten Betriebstag: „Hallo Test!" holte 44
 * Fundstellen, „nochmal" 29, und die Frage nach dem Anlegen eines Projekts
 * holte 42 Protokollschnipsel statt des Handbuchabschnitts. Der Grund war
 * immer derselbe — Wörter wie „projekt", „protokoll" oder „test" stehen in
 * fast jedem Stück. Wer danach sucht, findet alles, und alles finden ist
 * dasselbe wie nichts finden.
 *
 * Also zählt nicht mehr, **ob** ein Wort vorkommt, sondern **wie selten**.
 * Ein Wort in jedem zweiten Stück wiegt fast nichts, ein Wort in dreien
 * wiegt viel. Wörter oberhalb von ALLERWELT_AB fliegen ganz heraus und
 * stehen danach auch nicht mehr in der Quellenangabe — sonst behauptete die
 * Oberfläche, danach sei gesucht worden.
 */
function gewichte(stuecke, worte) {
  const N = Math.max(stuecke.length, 1)
  const texte = stuecke.map(s => s.text.toLowerCase())
  const heraus = new Map()
  for (const w of worte) {
    let df = 0
    for (const t of texte) if (wortTreffer(t, w) > 0) df++
    // Ein Wort, das **nirgends** vorkommt, ist nicht nichtssagend, sondern
    // erfolglos: „Reykjavik" ist genau die Art Wort, nach der gesucht werden
    // soll, und die Person soll erfahren, dass danach gesucht wurde. Es
    // bekommt deshalb volles Gewicht — das kostet nichts, weil es ohnehin
    // nichts trifft. (Erste Fassung setzte hier 0 und warf das Wort damit
    // aus der Quellenangabe: Der Kopf sagte dann „keine Suchwörter" statt
    // „danach gesucht, nichts gefunden".)
    if (df === 0) { heraus.set(w, Math.log(N)); continue }
    if (df / N > ALLERWELT_AB) { heraus.set(w, 0); continue }
    // log(N/df): in einem von N Stücken -> viel, in jedem zweiten -> wenig.
    heraus.set(w, Math.log(N / df))
  }
  return heraus
}

/**
 * Wie oft ein Suchwort in einem Text steht — am **Wortanfang**, nicht
 * irgendwo mittendrin.
 *
 * Vorher wurde als Teilzeichenkette gesucht. Dann trifft „hin" das Wort
 * „Hinweis", „test" trifft „Testlauf" und „bau" trifft „Ausbau" — und zwar
 * so oft, dass die Seltenheitsrechnung davon verdorben wird.
 *
 * Der Wortanfang genügt, das Wortende wäre zu streng: Im Deutschen hängt an
 * jedem Wort etwas dran. „Projekt" soll „Projekte" und „Projektleiter"
 * treffen, und das tut es so.
 */
function wortTreffer(kleinText, wort) {
  let n = 0, ab = 0
  for (;;) {
    const i = kleinText.indexOf(wort, ab)
    if (i === -1) break
    const davor = i === 0 ? '' : kleinText[i - 1]
    // Wortanfang: am Textanfang oder hinter etwas, das kein Buchstabe und
    // keine Ziffer ist.
    if (!davor || !/[a-zäöüß0-9]/.test(davor)) n++
    ab = i + wort.length
  }
  return n
}

/**
 * Wie gut ein Text zu den Begriffen passt.
 *
 * Summe der Gewichte der getroffenen Wörter. Abdeckung zählt damit von
 * selbst mehr als Häufigkeit: Drei verschiedene seltene Wörter schlagen ein
 * Wort, das achtmal dasteht — sonst gewinnt immer der längste Text.
 *
 * Ohne `gew` (altes Verhalten, nur noch für das Handbuch gegen seine
 * eigenen Abschnitte) wiegt jedes Wort gleich.
 */
function treffer(text, worte, gew = null) {
  if (!text) return { punkte: 0, getroffen: [] }
  const klein = text.toLowerCase()
  let punkte = 0, haeufigkeit = 0
  const getroffen = []
  for (const w of worte) {
    const gewicht = gew ? (gew.get(w) || 0) : 1
    if (gewicht <= 0) continue
    const n = wortTreffer(klein, w)
    if (n > 0) {
      punkte += gewicht * 10
      haeufigkeit += n
      getroffen.push(w)
    }
  }
  // Mehrfaches Vorkommen hilft ein wenig, entscheidet aber nie.
  return { punkte: punkte + Math.min(haeufigkeit, 5) * 0.2, getroffen }
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
  const abschnitte = handbuch()
  if (!abschnitte.length) return []

  // Dieselbe Seltenheitsrechnung wie bei den Projektdaten, nur gegen die
  // Abschnitte des Handbuchs. Auch hier steht "Protokoll" fast überall --
  // und auch hier führte das dazu, dass jeder Abschnitt ein Treffer war.
  const gew = gewichte(abschnitte.map(a => ({ text: a.titel + '\n' + a.text })),
                       worte)

  const bewertet = abschnitte
    .map(a => {
      const im_text  = treffer(a.titel + '\n' + a.text, worte, gew)
      // Der Titel wiegt mehr: "Passwort ändern" trifft die Frage nach dem
      // Passwort genauer als ein Abschnitt, in dem das Wort nebenbei fällt.
      const im_titel = treffer(a.titel, worte, gew)
      return { ...a, punkte: im_text.punkte + im_titel.punkte * 2,
               getroffen: im_text.getroffen, imTitel: im_titel.getroffen.length }
    })
    // **Zwei** tragende Wörter, oder eines in der Überschrift. Das Handbuch
    // ist die Nebenquelle: Bei einer Frage zu einem Bauteil soll es nicht
    // mitkommen, nur weil dort zufällig dasselbe Wort einmal vorkommt. Ein
    // einzelnes beiläufiges Wort ist kein Thema.
    //
    // Gemessen an echten Fragen: „Hallo Test!" holte den Abschnitt „Tab:
    // E-Mail" (wegen „E-Mail-Test"), und „Wo soll die Sprinklerzentrale
    // hin?" holte drei Abschnitte, in denen irgendwo „hin" vorkam.
    .filter(a => a.punkte > 0 && (a.getroffen.length >= 2 || a.imTitel >= 1))
    .sort((a, b) => b.punkte - a.punkte)

  if (!bewertet.length) return []
  const schwelle = bewertet[0].punkte * STELLEN_SCHWELLE

  const heraus = []
  let platz = BUDGET_HANDBUCH
  for (const a of bewertet) {
    if (a.punkte < schwelle) break
    const stueck = `### ${a.titel}\n${a.text}`
    if (stueck.length > platz) continue
    heraus.push({ titel: a.titel, text: stueck, punkte: a.punkte })
    platz -= stueck.length
    if (heraus.length >= 3) break
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

Du redest wie ein erfahrener Kollege im Büro: direkt, in ganzen Sätzen,
ohne Floskeln und ohne Entschuldigungen. Keine Einleitung wie „Gerne!" oder
„Basierend auf den vorliegenden Informationen" — fang mit der Antwort an.

So antwortest du:
- **Antworte wirklich.** Nenne das Ergebnis zuerst, dann die Begründung.
  Eine Aufzählung, wenn es mehrere Punkte sind; sonst zwei, drei Sätze.
- **Denke mit.** Du darfst aus dem Material schließen, zusammenfassen,
  einordnen, Widersprüche und offene Enden benennen und sagen, was als
  Nächstes zu tun wäre. Das ist kein Erfinden, solange du dich auf das
  Material stützt und kenntlich machst, was dein Schluss ist.
- **Erfinde nichts.** Keine Namen, Fristen, Beschlüsse, Zahlen oder
  Protokollnummern, die nicht im Material stehen.
- **Nenne deine Quelle** in Klammern, zum Beispiel „(Protokoll Halle Nord ·
  Baubesprechung · 14.09.2026, Punkt 2.1)". Die Angaben in eckigen Klammern
  über jedem Abschnitt sind dafür gedacht.
- **Steht die Antwort nicht im Material**, sag das in einem Satz und nenne,
  was du stattdessen gefunden hast oder wonach sich zu suchen lohnt. Rate
  nicht — aber antworte auch nicht nur mit „weiß ich nicht".
- Aufgaben gibst du als „Wer — Was — Bis wann" aus.
- Keine Rechtsauskunft, keine Honorarberatung.

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
  const gew = gewichte(stuecke, worte)
  // Nur die Wörter, nach denen wirklich gesucht wurde. Die Allerwelts-
  // wörter stehen hier nicht mehr drin, und damit auch nicht mehr in der
  // Oberfläche: „gesucht nach: projekt, protokoll" war eine Unwahrheit,
  // weil nach ihnen gerade nicht gesucht wurde.
  const tragend = worte.filter(w => (gew.get(w) || 0) > 0)

  const roh = stuecke
    .map(s => ({ ...s, ...treffer(s.text, worte, gew) }))
    .filter(s => s.punkte > 0)
    .map(s => ({
      ...s,
      // Das Projekt im Mittelpunkt zuerst: Wer in einem Projekt steht und
      // "noch offen?" fragt, meint dieses. Ein Zuschlag, kein Freifahrt-
      // schein -- er verschiebt die Reihenfolge, hebt aber die Schwelle
      // unten nicht auf.
      punkte: s.punkte * (fokus && s.projektId === fokus.id ? 1.5 : 1),
    }))
    .sort((a, b) => b.punkte - a.punkte)

  // Abstand zur besten Stelle: Was deutlich schlechter passt, gehört nicht
  // dazu. Vorher kam alles mit, was irgendein Wort enthielt -- ein „nochmal"
  // brachte so 29 Stellen mit, und die richtige stand zwischen 28 anderen.
  const beste = roh.length ? roh[0].punkte : 0
  const bewertet = roh
    .filter(s => s.punkte >= beste * STELLEN_SCHWELLE)
    .slice(0, STELLEN_HOECHSTENS)

  // 4. Zusammensetzen, bis das Budget voll ist.
  //
  // **Die Reihenfolge ist nicht Geschmack, sie ist Tempo.** LM Studio
  // verwendet den gleichbleibenden *Anfang* eines Systemkopfs wieder,
  // statt ihn erneut einzulesen. Am 04.11.2026 auf der 4090 gemessen,
  // 9000 Zeichen Kopf:
  //
  //     derselbe Kopf, neue Frage      0,19 s bis zum ersten Zeichen
  //     anderer Anfang, gleicher Rest  3,43 s
  //
  // Achtzehnfach. Wiederverwendet wird aber nur, was **vorn** steht und
  // sich nicht ändert -- ab dem ersten abweichenden Zeichen wird alles
  // Weitere neu gelesen. Deshalb von fest nach lose:
  //
  //   1. Anweisung          ändert sich nie
  //   2. Projektverzeichnis ändert sich je Person, nicht je Frage
  //   3. Projektmappe       ändert sich je Projekt, nicht je Frage
  //   4. Handbuch           ändert sich je Frage
  //   5. Gefundene Stellen  ändert sich je Frage
  //
  // Wer hier umsortiert und das Veränderliche nach vorn nimmt, macht den
  // Zwischenspeicher wertlos -- ohne dass irgendetwas kaputtgeht. Es wird
  // nur langsamer, und niemand weiß warum. Die Reihenfolge wird deshalb
  // geprüft (pruefungen/pruefung-assistent.js).
  const abschnitte = []
  const quellen = []
  let platz = BUDGET_GESAMT

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

  const hb = handbuchTeile(worte)
  if (hb.length) {
    const text = '# Aus dem Nutzerhandbuch\n\n' + hb.map(a => a.text).join('\n\n')
    if (text.length <= platz) {
      abschnitte.push(text)
      platz -= text.length
      for (const a of hb) quellen.push('Handbuch: ' + a.titel)
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
  } else {
    // Nichts gefunden -- aus zwei Gründen, die sich **nicht** auseinander-
    // halten lassen: Entweder stand in der Frage kein Wort, das etwas
    // bezeichnet („Hallo Test!", „nochmal"), oder es stand eines da, das es
    // in den Daten nicht gibt („Reykjavik"). Beide sehen gleich aus — ein
    // Wort ohne Fundstelle ist ein Wort ohne Fundstelle. Eine erste Fassung
    // hat hier unterschieden und dabei geraten; der Unterschied ist für die
    // Antwort auch gar nicht wichtig.
    //
    // In beiden Fällen gilt dasselbe: nichts erfinden, sagen was gesucht
    // wurde, und sich an die Unterhaltung halten statt an zufälliges
    // Material. Früher holte so etwas 29 bis 44 Stellen -- eine Schüttung,
    // in der nichts zur Frage gehörte.
    abschnitte.push('# Gefundene Stellen\n\nKeine.'
      + (tragend.length ? ' Gesucht wurde nach: ' + tragend.join(', ') + '.' : '')
      + '\nBeziehe dich auf die bisherige Unterhaltung. Ist auch die leer, '
      + 'frage kurz nach, worum es gehen soll, oder biete an, wobei du '
      + 'helfen kannst. Erfinde keine Projektinhalte.')
  }

  const anrede = benutzer ? `\n\nDie fragende Person heisst ${benutzer}.` : ''
  const system = ANWEISUNG + anrede + '\n\n---\n\n' + abschnitte.join('\n\n---\n\n')

  return { system, quellen, projekte: erlaubt.length, uebrig,
           fokus: fokus ? (fokus.name || fokus.id) : null,
           begriffe: tragend, geprueft: stuecke.length }
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
