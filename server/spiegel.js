'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Spiegel-Schnittstelle: vollstaendige Projektdokumente fuer den Umzug der
// Projektdatenbank ins Dashboard.
//
// Warum getrennt von server/stammdaten.js:
//   Die Stammdaten-Schnittstelle gibt eine SCHMALE Sicht heraus - Nummer,
//   Gesellschaft, Team. Genau das, was die Personalplanung braucht, und keine
//   Kontakte. Hier geht es um das Gegenteil: das Dokument VOLLSTAENDIG und
//   unveraendert, damit beim Umzug nichts verlorengeht.
//
// Am Projekt haengen mehr Felder, als in utils.js emptyProject() stehen -
// bimMeta, projectAdmins, fsPath, portalToken, archivePdf und weitere. Wer sie
// einzeln abbildet, uebersieht welche. Deshalb wird das Dokument als Ganzes
// uebertragen und die Zielseite legt es als Ganzes ab.
//
// ACHTUNG: Hier sind auch Kontakte und ggf. verschluesselte Felder enthalten.
// Der Schluessel ist derselbe wie bei den Stammdaten, der Zweck aber ein
// anderer - deshalb eigene Routen, die sich einzeln abschalten lassen.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')

// Kanonische Serialisierung: Schluessel sortiert, damit beide Seiten fuer
// dasselbe Dokument dieselbe Pruefsumme errechnen. Ohne das haengt die Summe
// von der Reihenfolge ab, in der Felder zufaellig gespeichert wurden.
function kanonisch(wert) {
  if (wert === null || typeof wert !== 'object') return JSON.stringify(wert) ?? 'null'
  if (Array.isArray(wert)) return '[' + wert.map(kanonisch).join(',') + ']'
  const schluessel = Object.keys(wert).filter(k => wert[k] !== undefined).sort()
  return '{' + schluessel.map(k => JSON.stringify(k) + ':' + kanonisch(wert[k])).join(',') + '}'
}

// Die Felder, die der Store selbst anhaengt, gehoeren nicht zum Dokument.
function ohneStoreFelder(p) {
  const { _version, _updatedAt, ...rest } = p
  return rest
}

function pruefsumme(p) {
  return crypto.createHash('sha256').update(kanonisch(ohneStoreFelder(p)), 'utf8').digest('hex')
}

function registerSpiegel(app, db, schutz) {
  // Uebersicht: je Projekt nur Kennung, Stand und Pruefsumme. Bewusst klein -
  // damit laesst sich haeufig abgleichen, ohne Logos und Kontakte zu uebertragen.
  app.get('/api/spiegel/projekte', schutz, (req, res) => {
    try {
      const zeilen = db.projects.list().map(p => ({
        id:        p.id,
        name:      p.name || '',
        updatedAt: p.updatedAt || p._updatedAt || null,
        version:   p._version ?? null,
        archiviert: !!p.isArchived,
        verschluesselt: !!p.isEncrypted,
        groesse:   Buffer.byteLength(kanonisch(ohneStoreFelder(p)), 'utf8'),
        pruefsumme: pruefsumme(p),
      }))
      res.json({
        erzeugt: new Date().toISOString(),
        anzahl: zeilen.length,
        projekte: zeilen,
      })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Das vollstaendige Dokument. Einzeln abrufbar, weil Logos als base64
  // darinstecken koennen - alle auf einmal waere je nach Bestand sehr gross.
  app.get('/api/spiegel/projekte/:id', schutz, (req, res) => {
    const p = db.projects.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    res.json({
      id: p.id,
      pruefsumme: pruefsumme(p),
      version: p._version ?? null,
      dokument: ohneStoreFelder(p),
    })
  })

  // Mehrere auf einmal - fuer den ersten Abgleich, wenn noch nichts da ist.
  // `ids` als Kommaliste, Deckel bei 25 Dokumenten je Aufruf.
  app.get('/api/spiegel/projekte-mehrere', schutz, (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return res.status(400).json({ error: 'Parameter "ids" fehlt.' })
    if (ids.length > 25) return res.status(400).json({ error: 'Höchstens 25 Projekte je Aufruf.' })
    const heraus = []
    for (const id of ids) {
      const p = db.projects.get(id)
      if (!p) continue
      heraus.push({ id: p.id, pruefsumme: pruefsumme(p), version: p._version ?? null,
                    dokument: ohneStoreFelder(p) })
    }
    res.json({ projekte: heraus })
  })
}

// ── Schreiben (Stufe 2) ──────────────────────────────────────────────────────
// Das Dashboard bekommt die Oberflaeche, die Wahrheit bleibt hier. Damit dabei
// nichts verlorengeht, gelten drei Regeln:
//
//   1. NUR die drei Felder, die die Projektdaten-Ansicht kennt, werden
//      angefasst: name, projectData, team. Alles andere am Projekt bleibt
//      unberuehrt - auch Felder, die niemand auf dem Schirm hat.
//   2. Der Aufrufer schickt die Pruefsumme mit, auf der er gearbeitet hat.
//      Stimmt sie nicht mehr, wird abgelehnt statt ueberschrieben. Ohne das
//      koennte ein veralteter Stand aus dem Dashboard eine neuere Aenderung
//      aus dem Protokolltool ausloeschen.
//   3. Projektnummern werden nicht doppelt vergeben.

const SCHREIBBARE_FELDER = ['name', 'projectData', 'team']

// Nummer aus einem Projekt lesen - fuer die Doppelpruefung.
const nummerVon = (p) => String(p?.projectData?.nummer || '').trim()

function registerSpiegelSchreiben(app, db, schutz, writeLimiter) {
  const limiter = writeLimiter || ((req, res, next) => next())

  // Naechste freie Projektnummer vorschlagen. Das Regelwerk sagt: Nummer und
  // Kuerzel vergibt der Mensch - die Schnittstelle schlaegt nur vor und
  // verhindert Doppelvergabe.
  app.get('/api/spiegel/naechste-nummer', schutz, (req, res) => {
    const belegt = new Set(db.projects.list().map(nummerVon).filter(Boolean))
    const zahlen = [...belegt].map(n => parseInt(n, 10)).filter(Number.isFinite)
    const hoechste = zahlen.length ? Math.max(...zahlen) : 0
    let vorschlag = hoechste + 1
    while (belegt.has(String(vorschlag))) vorschlag++
    res.json({
      vorschlag: String(vorschlag),
      belegt: [...belegt].sort(),
      hinweis: 'Vorschlag. Die Vergabe bleibt beim Menschen.',
    })
  })

  // Aendern. Erwartet { basis, aenderung }.
  app.patch('/api/spiegel/projekte/:id', schutz, limiter, (req, res) => {
    const p = db.projects.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Projekt nicht gefunden.' })

    const aktuelle = pruefsumme(p)
    const basis = req.body?.basis
    if (!basis) {
      return res.status(400).json({ error: 'Feld "basis" (Pruefsumme) fehlt.' })
    }
    if (basis !== aktuelle) {
      // Kein Ueberschreiben: der Aufrufer hat auf einem alten Stand gearbeitet.
      return res.status(409).json({
        error: 'Das Projekt wurde zwischenzeitlich geändert.',
        konflikt: true,
        pruefsumme: aktuelle,
        dokument: ohneStoreFelder(p),
      })
    }

    const aenderung = req.body?.aenderung
    if (!aenderung || typeof aenderung !== 'object') {
      return res.status(400).json({ error: 'Feld "aenderung" fehlt.' })
    }
    const fremd = Object.keys(aenderung).filter(k => !SCHREIBBARE_FELDER.includes(k))
    if (fremd.length > 0) {
      return res.status(400).json({
        error: 'Diese Felder lassen sich über die Projektdatenbank nicht ändern: ' + fremd.join(', '),
      })
    }

    // Doppelte Projektnummer verhindern.
    if (aenderung.projectData) {
      const neueNummer = String(aenderung.projectData.nummer || '').trim()
      if (neueNummer) {
        const kollision = db.projects.list()
          .find(x => x.id !== p.id && nummerVon(x) === neueNummer)
        if (kollision) {
          return res.status(409).json({
            error: `Die Projektnummer ${neueNummer} ist bereits vergeben (${kollision.name}).`,
          })
        }
      }
    }

    // Nur die erlaubten Felder ersetzen - der Rest des Dokuments bleibt.
    const neu = { ...p }
    for (const feld of SCHREIBBARE_FELDER) {
      if (feld in aenderung) neu[feld] = aenderung[feld]
    }
    neu.updatedAt = new Date().toISOString()

    const r = db.projects.update(p.id, neu, p._version, req.user || '__dashboard__')
    if (r.notFound) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (r.conflict) {
      return res.status(409).json({ error: 'Das Projekt wurde zwischenzeitlich geändert.',
                                    konflikt: true, pruefsumme: pruefsumme(r.serverData),
                                    dokument: ohneStoreFelder(r.serverData) })
    }
    const frisch = db.projects.get(p.id)
    res.json({ id: p.id, pruefsumme: pruefsumme(frisch), version: frisch._version,
               dokument: ohneStoreFelder(frisch) })
  })

  // Anlegen. Bewusst schmal: ein neues Projekt entsteht mit Codierung und
  // Bezeichnung, alles Weitere wird danach gepflegt.
  app.post('/api/spiegel/projekte', schutz, limiter, (req, res) => {
    const d = req.body || {}
    const nummer = String(d.nummer || '').trim()
    const kuerzel = String(d.kuerzel || '').trim()
    const bezeichnung = String(d.bezeichnung || '').trim()

    if (!/^\d{3,4}$/.test(nummer)) {
      return res.status(400).json({ error: 'Die Projektnummer muss 3 oder 4 Ziffern haben.' })
    }
    if (!d.kuerzelAusnahme && !/^[A-Za-z0-9ÄÖÜäöüß]{3,4}$/.test(kuerzel)) {
      return res.status(400).json({ error: 'Das Kürzel muss 3 oder 4 Zeichen haben.' })
    }
    if (!bezeichnung) {
      return res.status(400).json({ error: 'Die Bezeichnung fehlt.' })
    }
    const kollision = db.projects.list().find(x => nummerVon(x) === nummer)
    if (kollision) {
      return res.status(409).json({
        error: `Die Projektnummer ${nummer} ist bereits vergeben (${kollision.name}).`,
      })
    }

    const id = crypto.randomUUID()
    const jetzt = new Date().toISOString()
    const projekt = {
      id,
      name: [nummer, kuerzel, bezeichnung].filter(Boolean).join(' ').trim(),
      contacts: [],
      distribution: { recipients: [] },
      passwordHash: null, isEncrypted: false, encryptedContacts: null,
      cryptoSalt: null, cryptoIv: null,
      hoaiServices: [], linkedFolders: [], tiles: [],
      logo: '', clientLogo: '',
      team: [],
      projectData: {
        nummer, kuerzel, bezeichnung,
        kuerzelAusnahme: !!d.kuerzelAusnahme,
        gesellschaft: String(d.gesellschaft || ''),
        vertrag: String(d.vertrag || ''),
        lph: {}, preLeistungen: {}, planungspartner: [],
        bauherr: { company: '', person: '', street: '', zip: '', city: '', phone: '', email: '' },
      },
      createdAt: jetzt, updatedAt: jetzt,
    }
    db.projects.create(projekt, req.user || '__dashboard__')
    const frisch = db.projects.get(id)
    res.status(201).json({ id, pruefsumme: pruefsumme(frisch),
                           version: frisch._version, dokument: ohneStoreFelder(frisch) })
  })
}

module.exports = { registerSpiegel, registerSpiegelSchreiben, pruefsumme, kanonisch }
