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

module.exports = { registerSpiegel, pruefsumme, kanonisch }
