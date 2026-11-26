'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Planvorschau: aus PDF-Seiten werden Bilder
//
// Mängel und Prüfvermerke werden auf dem Plan verortet – mit einem Pin an
// einer Stelle, die als Anteil der Plangröße gespeichert wird (0…1, deshalb
// maßstabsunabhängig). Dafür muss der Plan ein **Bild** sein. Pläne kommen
// aber als PDF, und genau daran hing es: im Planviewer stand
// `canPin = !isPdf`.
//
// Gerendert wird im Browser (pdfjs, nur dort geladen, wo es gebraucht wird),
// und das Ergebnis landet hier – einmal je Seite, als PNG neben der
// Plandatei. Jeder spätere Aufruf holt nur noch das Bild:
//
//   - Das Handy braucht kein pdfjs. Auf der Baustelle wird kein 400-kB-Paket
//     über Mobilfunk geladen, nur um einen Pin zu setzen.
//   - Der Server braucht keinen PDF-Renderer. Poppler oder Ghostscript im
//     Abbild wären eine Abhängigkeit, die bei jedem Umzug Arbeit macht.
//   - Die Vorschau ist für alle dieselbe, also sitzt der Pin für alle an
//     derselben Stelle.
//
// Wichtig bei einem neuen Planstand: Wird die Plandatei ersetzt, werden die
// Vorschauen gelöscht (siehe `vorschauWeg`) – aber die Pins bleiben an ihrem
// Anteil stehen. Ändert der neue Stand den Zuschnitt, sitzen sie falsch. Das
// ist kein Fehler, den eine Anwendung erkennen kann; der Hinweis dazu steht
// in der Oberfläche.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path')
const fs   = require('fs')

const MAX_SEITEN = 40                     // mehr Seiten hat kein Plansatz, den man bepinnt
const MAX_BYTES  = 24 * 1024 * 1024       // ein PNG einer A0-Seite bleibt deutlich darunter

const seiteVon = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= MAX_SEITEN ? n : null
}

/** Dateiname der Vorschau. Liegt neben der Plandatei (PLANS_DIR/<planId>). */
const vorschauPfad = (plansDir, planId, seite) => path.join(plansDir, `${planId}.s${seite}.png`)

/** Alle Vorschauen eines Plans entfernen – bei neuem Planstand oder Löschen. */
function vorschauWeg(plansDir, planId) {
  let weg = 0
  try {
    for (const name of fs.readdirSync(plansDir)) {
      if (name.startsWith(`${planId}.s`) && name.endsWith('.png')) {
        fs.unlinkSync(path.join(plansDir, name)); weg++
      }
    }
  } catch {}
  return weg
}

function registerPlanVorschau(app, deps) {
  const { db, express, requireAuth, writeLimiter, getAccessibleProject, canAccessProject,
          resolveToken, apiKey, logEvent, plansDir } = deps

  const plan = (req, res) => {
    const p = db.bimPlans.get(req.params.planId)
    if (!p || p.projectId !== req.params.id) {
      res.status(404).json({ error: 'Plan nicht gefunden.' })
      return null
    }
    return p
  }

  // ── Vorschau einer Seite ablegen ─────────────────────────────────────────
  // Rumpf = PNG-Rohdaten. Query: seite (1-basiert), seiten (Gesamtzahl).
  app.post('/api/projects/:id/plans/:planId/vorschau', requireAuth, writeLimiter,
    express.raw({ type: 'application/octet-stream', limit: '32mb' }),
    (req, res) => {
      try {
        if (!getAccessibleProject(req, res)) return
        const p = plan(req, res)
        if (!p) return
        const seite = seiteVon(req.query.seite)
        if (!seite) return res.status(400).json({ error: `„seite" zwischen 1 und ${MAX_SEITEN} erwartet.` })
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Leere Datei.' })
        if (req.body.length > MAX_BYTES) return res.status(413).json({ error: 'Vorschau zu groß.' })
        // Nur PNG – der Rumpf kommt als octet-stream, die Signatur sagt, was es ist.
        if (req.body.length < 8 || req.body.readUInt32BE(0) !== 0x89504e47) {
          return res.status(415).json({ error: 'PNG erwartet.' })
        }

        fs.writeFileSync(vorschauPfad(plansDir, p.id, seite), req.body)

        const seiten = seiteVon(req.query.seiten) || Math.max(seite, p.seiten || 1)
        const vorhanden = new Set(Array.isArray(p.vorschauSeiten) ? p.vorschauSeiten : [])
        vorhanden.add(seite)
        const { _version, _updatedAt, ...daten } = p
        db.bimPlans.update(p.id, {
          ...daten, seiten,
          vorschauSeiten: [...vorhanden].sort((a, b) => a - b),
          updatedAt: new Date().toISOString(),
        }, _version, req.user)

        logEvent('PLAN_VORSCHAU', req, `project=${req.params.id} plan=${p.id} seite=${seite} size=${req.body.length}`)
        res.status(201).json({ ok: true, seite, seiten })
      } catch (e) { res.status(500).json({ error: e.message }) }
    })

  // ── Vorschau ausliefern ──────────────────────────────────────────────────
  // Auth über Header ODER ?token=, damit ein <img> ohne Header auskommt –
  // wie bei der Plandatei selbst.
  app.get('/api/projects/:id/plans/:planId/vorschau', (req, res) => {
    try {
      const kopf  = req.headers['authorization']
      const token = (kopf && kopf.startsWith('Bearer ') ? kopf.slice(7) : null) || req.query.token
      const user  = (token && resolveToken(token))
        || (apiKey && req.headers['x-api-key'] === apiKey ? '__apikey__' : null)
        || (!db.users.hasAny() ? '__anonymous__' : null)
      if (!user) return res.status(401).json({ error: 'Nicht angemeldet.' })

      const projekt = db.projects.get(req.params.id)
      if (!projekt) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
      if (db.users.hasAny() && !canAccessProject(projekt, user)) {
        return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
      }
      const p = db.bimPlans.get(req.params.planId)
      if (!p || p.projectId !== req.params.id) return res.status(404).json({ error: 'Plan nicht gefunden.' })

      const seite = seiteVon(req.query.seite) || 1
      const datei = vorschauPfad(plansDir, p.id, seite)
      if (!fs.existsSync(datei)) return res.status(404).json({ error: 'Für diese Seite gibt es noch keine Vorschau.' })

      const stat = fs.statSync(datei)
      res.setHeader('Content-Type',   'image/png')
      res.setHeader('Content-Length', stat.size)
      // Die Vorschau einer Seite ändert sich nur mit einem neuen Planstand,
      // und dann wird sie gelöscht. Darf also lange im Gerät bleiben – das
      // zählt auf der Baustelle, wo jedes Byte über Mobilfunk geht.
      res.setHeader('Cache-Control',  'private, max-age=86400')
      fs.createReadStream(datei).pipe(res)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

module.exports = { registerPlanVorschau, vorschauPfad, vorschauWeg, MAX_SEITEN }
