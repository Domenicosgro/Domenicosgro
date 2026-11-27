/**
 * Prueft die Kalenderanbindung und das Einlesen von Mitschriften
 * (server/termine.js).
 *
 * Geprueft wird vor allem, was NICHT passieren darf:
 *   - ein fremdes Postfach lesen, nur weil jemand die Adresse kennt
 *   - private oder abgesagte Termine im Bautagebuch
 *   - eine erfundene Frist, weil das Modell "nächste Woche" gesagt hat
 *   - ein Wortbeitrag, der an der Abschnittsgrenze zerschnitten wird
 *
 * Aufruf:  npm run pruefe:termine
 * Ergebnis: Rueckgabewert 1 bei Fehlern, sonst 0.
 */
'use strict'
const t = require('../server/termine')

let fehler = 0
const pruefe = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok ? '' : '  -> ' + extra))
  if (!ok) fehler++
}

// ── Postfaecher: wer darf welchen Kalender sehen ────────────────────────────
console.log('\nPostfaecher')
{
  const nur = t.postfaecherFuer('dp@example.de', '')
  pruefe('eigenes Postfach wird gelesen',
         nur.length === 1 && nur[0].adresse === 'dp@example.de' && nur[0].art === 'eigener',
         JSON.stringify(nur))

  const mit = t.postfaecherFuer('dp@example.de', 'projekte@example.de, bau@example.de')
  pruefe('gemeinsame Kalender kommen dazu', mit.length === 3, JSON.stringify(mit.map(x => x.adresse)))
  pruefe('gemeinsame sind als solche erkennbar',
         mit.filter(x => x.art === 'geteilt').length === 2)

  const doppelt = t.postfaecherFuer('DP@Example.de', 'dp@example.de')
  pruefe('dieselbe Adresse nur einmal (Gross/klein egal)', doppelt.length === 1, JSON.stringify(doppelt))

  pruefe('ohne eingetragene Adresse gar nichts', t.postfaecherFuer('', '').length === 0)
  pruefe('Unfug ist keine Adresse', t.postfaecherFuer('kein-postfach', 'auch@nicht').length === 0,
         JSON.stringify(t.postfaecherFuer('kein-postfach', 'auch@nicht')))

  // Der eigentliche Punkt: Die Liste entsteht aus Benutzerverwaltung und
  // Umgebung. Eine Adresse, die jemand irgendwo eintippt, ist nicht dabei --
  // sonst liest der Erste, der es probiert, den Kalender der Chefin.
  const fremd = t.postfaecherFuer('dp@example.de', 'projekte@example.de')
  pruefe('ein fremdes Postfach ist NICHT dabei',
         !fremd.some(x => x.adresse === 'chefin@example.de'))

  pruefe('Deckel bei sechs Postfaechern',
         t.postfaecherFuer('a@b.de', 'c@b.de,d@b.de,e@b.de,f@b.de,g@b.de,h@b.de,i@b.de').length === 6)
}

// ── Termine aus der Graph-Antwort ───────────────────────────────────────────
console.log('\nTermine lesen')
{
  const antwort = { value: [
    { id: 'A1', iCalUId: 'uid-1', subject: 'Baubesprechung KW 48',
      start: { dateTime: '2026-11-27T09:00:00.0000000', timeZone: 'W. Europe Standard Time' },
      end:   { dateTime: '2026-11-27T10:30:00.0000000', timeZone: 'W. Europe Standard Time' },
      location: { displayName: 'Baubüro, Raum 2' }, isAllDay: false, isCancelled: false,
      sensitivity: 'normal', type: 'occurrence',
      organizer: { emailAddress: { name: 'Domenico Sgro', address: 'DP@example.de' } },
      isOnlineMeeting: true,
      onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/xyz' },
      attendees: [
        { type: 'required', emailAddress: { name: 'Peter Meier', address: 'meier@rohbau.de' },
          status: { response: 'accepted' } },
        { type: 'optional', emailAddress: { name: 'Sabine Schulz', address: 'schulz@elektro.de' },
          status: { response: 'declined' } },
      ] },
    { id: 'A2', iCalUId: 'uid-2', subject: 'Zahnarzt', sensitivity: 'private',
      start: { dateTime: '2026-11-28T08:00:00.0000000' }, end: { dateTime: '2026-11-28T09:00:00.0000000' } },
    { id: 'A3', iCalUId: 'uid-3', subject: 'Abgesagt', isCancelled: true,
      start: { dateTime: '2026-11-28T08:00:00.0000000' }, end: { dateTime: '2026-11-28T09:00:00.0000000' } },
    { id: 'A4', iCalUId: 'uid-4', subject: 'Richtfest', isAllDay: true,
      start: { dateTime: '2026-12-01T00:00:00.0000000' }, end: { dateTime: '2026-12-02T00:00:00.0000000' } },
  ] }

  const liste = t.termineAus(antwort, 'dp@example.de')
  pruefe('privater Termin bleibt draussen', !liste.some(x => x.betreff === 'Zahnarzt'),
         JSON.stringify(liste.map(x => x.betreff)))
  pruefe('abgesagter Termin bleibt draussen', !liste.some(x => x.betreff === 'Abgesagt'))
  pruefe('die anderen beiden sind da', liste.length === 2, String(liste.length))

  const b = liste[0]
  pruefe('Datum getrennt von der Uhrzeit', b.datum === '2026-11-27' && b.zeit === '09:00',
         `${b.datum} ${b.zeit}`)
  pruefe('Ende der Besprechung dabei', b.endeZeit === '10:30', b.endeZeit)
  pruefe('Ort uebernommen', b.ort === 'Baubüro, Raum 2', b.ort)
  pruefe('Teams-Link erkannt', b.online === true && b.onlineUrl.includes('teams.microsoft.com'))
  pruefe('Serientermin als solcher markiert', b.serie === true)
  pruefe('Organisator klein geschrieben', b.organisator.email === 'dp@example.de', b.organisator.email)
  pruefe('Eingeladene mit Zusagestand', b.eingeladene.length === 2
         && b.eingeladene[0].zusage === 'accepted' && b.eingeladene[1].zusage === 'declined')
  pruefe('optionale Teilnahme erkannt', b.eingeladene[1].pflicht === false)

  const ganz = liste[1]
  pruefe('ganztags ohne Uhrzeit', ganz.ganztags === true && ganz.zeit === '', ganz.zeit)

  pruefe('leere Antwort ergibt leere Liste', t.termineAus({}).length === 0)
  pruefe('Murks ergibt leere Liste', t.termineAus(null).length === 0)
  pruefe('Termin ohne Datum faellt weg',
         t.termineAus({ value: [{ id: 'x', subject: 'ohne' }] }).length === 0)
}

// ── Eingeladene werden Teilnehmer ───────────────────────────────────────────
console.log('\nTeilnehmerliste')
{
  const kontakte = [
    { id: 'k1', name: 'Peter Meier', company: 'Rohbau GmbH', role: 'Bauleiter', email: 'MEIER@rohbau.de' },
    { id: 'k2', name: 'Andere Person', company: 'Woanders', email: 'andere@example.de' },
  ]
  const termin = {
    organisator: { name: 'Domenico Sgro', email: 'dp@example.de' },
    eingeladene: [
      { name: 'Peter Meier',  email: 'meier@rohbau.de',   zusage: 'accepted' },
      { name: 'Sabine Schulz', email: 'schulz@elektro.de', zusage: 'declined' },
      { name: '',             email: 'ohne.name@firma.de', zusage: 'none' },
      { name: 'Peter Meier',  email: 'meier@rohbau.de',   zusage: 'accepted' },
    ],
  }
  const liste = t.teilnehmerAus(termin, kontakte)

  pruefe('Organisator steht vorn', liste[0].name === 'Domenico Sgro', liste[0].name)
  pruefe('doppelte Einladung nur einmal', liste.length === 4, String(liste.length))

  const meier = liste.find(p => p.email === 'meier@rohbau.de')
  pruefe('bekannter Kontakt bringt Firma mit', meier.company === 'Rohbau GmbH', meier.company)
  pruefe('bekannter Kontakt bringt Rolle mit', meier.role === 'Bauleiter', meier.role)
  pruefe('Verknuepfung zum Kontakt gesetzt', meier.contactId === 'k1', String(meier.contactId))
  pruefe('Gross/klein beim Abgleich egal', meier._bekannt === true)

  const schulz = liste.find(p => p.email === 'schulz@elektro.de')
  pruefe('wer abgelehnt hat, steht als abwesend drin', schulz.present === false)
  pruefe('wer abgelehnt hat, fehlt aber nicht', !!schulz)

  const ohne = liste.find(p => p.email === 'ohne.name@firma.de')
  pruefe('Adresse ohne Namen bleibt die Adresse', ohne.name === 'ohne.name@firma.de', ohne.name)
  pruefe('unbekannter Kontakt ohne Firma', ohne.company === '' && ohne.contactId === null)

  pruefe('Kontakt, der nicht eingeladen war, kommt nicht dazu',
         !liste.some(p => p.email === 'andere@example.de'))
  pruefe('ohne Kontakte funktioniert es auch', t.teilnehmerAus(termin, []).length === 4)
  pruefe('ohne Termin kommt nichts', t.teilnehmerAus(null, kontakte).length === 0)
}

// ── Transkript lesen ────────────────────────────────────────────────────────
console.log('\nMitschrift lesen (.vtt)')
{
  const vtt = [
    'WEBVTT',
    '',
    '0cf0f6a1-3b4c-4f1e-9a2b-1/1-0',
    '00:00:01.120 --> 00:00:04.980',
    '<v Domenico Sgro>Guten Morgen, dann fangen wir an.</v>',
    '',
    '0cf0f6a1-3b4c-4f1e-9a2b-1/2-0',
    '00:00:05.000 --> 00:00:09.400',
    '<v Domenico Sgro>Erster Punkt ist die Fassade.</v>',
    '',
    '3',
    '00:00:09.500 --> 00:00:14.000',
    '<v Peter Meier>Die Fassade ist bis zum 15.12. fertig.</v>',
    '',
    'NOTE Dies ist eine Anmerkung',
    'die ueber zwei Zeilen geht',
    '',
    '4',
    '00:00:14.100 --> 00:00:18.000',
    '<v Peter Meier>Das Gerüst bleibt aber stehen.</v>',
  ].join('\n')

  const turns = t.redeAus(vtt)
  pruefe('Zeitstempel sind weg', !JSON.stringify(turns).includes('-->'))
  pruefe('Block-Kennungen sind weg', !JSON.stringify(turns).includes('0cf0f6a1'))
  pruefe('Anmerkung ist weg', !JSON.stringify(turns).includes('Anmerkung'))
  pruefe('Anmerkungs-Folgezeile auch', !JSON.stringify(turns).includes('zwei Zeilen'))
  pruefe('zwei Sprecher, zwei Beitraege', turns.length === 2, JSON.stringify(turns))
  pruefe('aufeinanderfolgende Saetze zusammengefasst',
         turns[0].text === 'Guten Morgen, dann fangen wir an. Erster Punkt ist die Fassade.', turns[0].text)
  pruefe('Sprecher erkannt', turns[0].sprecher === 'Domenico Sgro' && turns[1].sprecher === 'Peter Meier')
  pruefe('Datum im Text bleibt stehen', turns[1].text.includes('15.12.'))

  const text = t.redeText(turns)
  pruefe('Text mit Sprecher davor', text.startsWith('Domenico Sgro: Guten Morgen'), text.slice(0, 40))

  // Abgetippte Mitschrift ohne vtt
  const einfach = t.redeAus('Max Mustermann: Wir brauchen die Freigabe.\nFrau Schulz: Kommt morgen.')
  pruefe('"Name: Text" wird auch erkannt',
         einfach.length === 2 && einfach[0].sprecher === 'Max Mustermann', JSON.stringify(einfach))

  const ohneSprecher = t.redeAus('Einfach nur Text ohne alles.')
  pruefe('Text ohne Sprecher geht durch',
         ohneSprecher.length === 1 && ohneSprecher[0].sprecher === '', JSON.stringify(ohneSprecher))

  pruefe('leere Datei ergibt nichts', t.redeAus('').length === 0)
  pruefe('nur WEBVTT ergibt nichts', t.redeAus('WEBVTT\n\n').length === 0)
}

// ── Abschnitte ─────────────────────────────────────────────────────────────
console.log('\nAbschnitte')
{
  const turns = []
  for (let i = 0; i < 30; i++) turns.push({ sprecher: 'A', text: 'x'.repeat(100) })

  const { teile, gekuerzt } = t.abschnitte(turns, 500, 8)
  pruefe('wird aufgeteilt', teile.length > 1, String(teile.length))
  pruefe('kein Abschnitt ueber dem Mass',
         teile.every(a => a.reduce((s, x) => s + x.text.length + 3, 0) <= 500 + 110),
         JSON.stringify(teile.map(a => a.reduce((s, x) => s + x.text.length, 0))))
  pruefe('kein Wortbeitrag zerschnitten',
         teile.flat().every(x => x.text.length === 100))
  pruefe('alle Beitraege sind noch da', teile.flat().length === 30, String(teile.flat().length))
  pruefe('nicht gekuerzt, wenn es passt', gekuerzt === false)

  const viele = t.abschnitte(turns, 120, 3)
  pruefe('Deckel greift', viele.teile.length === 3, String(viele.teile.length))
  pruefe('und sagt es', viele.gekuerzt === true)

  const langer = t.abschnitte([{ sprecher: 'A', text: 'y'.repeat(1000) }], 300, 8)
  pruefe('ein zu langer Beitrag wird notfalls doch geteilt', langer.teile.length === 4,
         String(langer.teile.length))

  pruefe('nichts hinein, nichts heraus', t.abschnitte([], 500).teile.length === 0)
}

// ── JSON aus der Modellantwort ─────────────────────────────────────────────
console.log('\nAntwort auswerten')
{
  pruefe('reines JSON', t.jsonAus('{"punkte":[]}') !== null)
  pruefe('JSON im Zaun',
         t.jsonAus('```json\n{"punkte":[{"thema":"A"}]}\n```')?.punkte?.length === 1)
  pruefe('JSON mit Gerede davor',
         t.jsonAus('Gerne! Hier das Ergebnis:\n{"punkte":[{"thema":"A"}]}\nViel Erfolg!')?.punkte?.length === 1)
  pruefe('nur ein Array', Array.isArray(t.jsonAus('[{"thema":"A"}]')))
  pruefe('kaputtes JSON ergibt null', t.jsonAus('{"punkte": [') === null)
  pruefe('Prosa ergibt null', t.jsonAus('Ich habe leider keine Punkte gefunden.') === null)
  pruefe('leer ergibt null', t.jsonAus('') === null)
}

// ── Punkte pruefen ─────────────────────────────────────────────────────────
console.log('\nPunkte pruefen')
{
  const jetzt = new Date('2026-11-27T12:00:00Z')
  const antwort = JSON.stringify({ punkte: [
    { thema: 'Fassade', besprochen: 'Zeitplan', ergebnis: 'fertig bis 15.12.',
      art: 'massnahme', zustaendig: 'Peter Meier', frist: '2026-12-15' },
    { thema: 'Gerüst', art: 'FESTSTELLUNG', frist: 'nächste Woche' },
    { thema: '', besprochen: 'ohne Thema' },
    { thema: 'Altlast', frist: '2019-01-01' },
    { thema: 'Ferne Zukunft', frist: '2099-01-01' },
    { thema: 'Unfugsdatum', frist: '2026-13-45' },
    { thema: 'Lang', besprochen: 'z'.repeat(5000) },
  ] })

  const p = t.punkteAus(antwort, jetzt)
  pruefe('Punkt ohne Thema faellt weg', !p.some(x => x.besprochen === 'ohne Thema'))
  pruefe('die anderen sechs bleiben', p.length === 6, String(p.length))

  pruefe('Massnahme erkannt', p[0].art === 'massnahme')
  pruefe('echte Frist uebernommen', p[0].frist === '2026-12-15', p[0].frist)
  pruefe('Zustaendiger uebernommen', p[0].zustaendig === 'Peter Meier')

  pruefe('Gross geschriebene Art geht auch', p[1].art === 'feststellung')
  pruefe('"nächste Woche" ist keine Frist', p[1].frist === '', p[1].frist)
  pruefe('Datum aus der Vergangenheit ist keine Frist',
         p.find(x => x.thema === 'Altlast').frist === '')
  pruefe('Datum in ferner Zukunft ist keine Frist',
         p.find(x => x.thema === 'Ferne Zukunft').frist === '')
  pruefe('Unfugsdatum ist keine Frist',
         p.find(x => x.thema === 'Unfugsdatum').frist === '')
  pruefe('langer Text wird gekappt',
         p.find(x => x.thema === 'Lang').besprochen.length === 1500,
         String(p.find(x => x.thema === 'Lang').besprochen.length))

  pruefe('ohne Antwort keine Punkte', t.punkteAus('').length === 0)
  pruefe('Prosa ergibt keine Punkte', t.punkteAus('Keine Punkte gefunden.').length === 0)
  pruefe('englische Feldnamen werden auch gelesen',
         t.punkteAus('{"punkte":[{"topic":"Fenster","responsible":"Meier"}]}')[0].thema === 'Fenster')
  pruefe('nacktes Array ergibt ALLE Punkte',
         t.punkteAus('[{"thema":"A"},{"thema":"B"},{"thema":"C"}]').length === 3,
         String(t.punkteAus('[{"thema":"A"},{"thema":"B"}]').length))
  pruefe('ein einzelner Punkt ohne Huelle wird gelesen',
         t.punkteAus('{"thema":"Einzeln"}').length === 1)

  // Direkt die Frist-Pruefung
  pruefe('fristAus nimmt nur ISO', t.fristAus('15.12.2026', jetzt) === '')
  pruefe('fristAus nimmt ISO', t.fristAus('2026-12-15', jetzt) === '2026-12-15')
}

// ── Doppelte ───────────────────────────────────────────────────────────────
console.log('\nDoppelte')
{
  const p = t.ohneDoppelte([
    { thema: 'Fassade' }, { thema: 'fassade' }, { thema: 'Fassade!' }, { thema: 'Dach' },
  ])
  pruefe('dasselbe Thema nur einmal', p.length === 2, JSON.stringify(p.map(x => x.thema)))
  pruefe('das erste bleibt stehen', p[0].thema === 'Fassade')

  const viele = Array.from({ length: 60 }, (_, i) => ({ thema: 'Punkt ' + i }))
  pruefe('Deckel bei 40 Punkten', t.ohneDoppelte(viele).length === 40)
}

// ── Zeitfenster ────────────────────────────────────────────────────────────
console.log('\nZeitfenster')
{
  const jetzt = new Date('2026-11-27T12:00:00Z')
  const f = t.fenster(14, 21, jetzt)
  pruefe('beginnt vor heute', f.von < '2026-11-27', f.von)
  pruefe('endet nach heute',  f.bis > '2026-11-27', f.bis)
  pruefe('14 Tage zurueck',   f.von.startsWith('2026-11-13'), f.von)
  pruefe('21 Tage voraus',    f.bis.startsWith('2026-12-18'), f.bis)
  pruefe('ohne Vergangenheit geht auch', t.fenster(0, 7, jetzt).von.startsWith('2026-11-27'))
}

console.log(fehler ? `\n${fehler} Fehler\n` : '\nAlles in Ordnung\n')
process.exit(fehler ? 1 : 0)
