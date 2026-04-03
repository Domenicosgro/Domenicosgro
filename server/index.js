/**
 * Komplizen Protokolle – Express/SQLite Backend
 *
 * Läuft auf Windows Server und Linux.
 * Startet mit: node server/index.js
 * Produktionsstart mit PM2: pm2 start server/pm2.config.js
 *
 * Umgebungsvariablen:
 *   PORT     – HTTP-Port (Standard: 3000)
 *   DB_PATH  – Verzeichnis für die SQLite-Datenbank (Standard: ./data)
 *   HOST     – Bind-Adresse (Standard: 0.0.0.0)
 */

const express = require('express')
const cors    = require('cors')
const helmet  = require('helmet')
const path    = require('path')
const db      = require('./db')

const app  = express()
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,   // React-App braucht inline-scripts
  crossOriginEmbedderPolicy: false,
}))
app.use(cors())
app.use(express.json({ limit: '200mb' }))   // groß wegen base64-Anlagen

// ── Static frontend (nach vite build) ────────────────────────────────────────
const distDir = path.join(__dirname, '../dist')
app.use(express.static(distDir))

// ── Hilfsfunktion ─────────────────────────────────────────────────────────────
function apiHandler(key) {
  return {
    get: (_req, res) => {
      try { res.json(db.get(key)) }
      catch (e) { res.status(500).json({ error: e.message }) }
    },
    put: (req, res) => {
      try {
        if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array erwartet' })
        db.set(key, req.body)
        res.json({ ok: true, count: req.body.length })
      } catch (e) {
        res.status(500).json({ error: e.message })
      }
    },
  }
}

// ── API-Routen ────────────────────────────────────────────────────────────────
const protocols = apiHandler('protocols')
const projects  = apiHandler('projects')

app.get ('/api/protocols', protocols.get)
app.put ('/api/protocols', protocols.put)

app.get ('/api/projects',  projects.get)
app.put ('/api/projects',  projects.put)

// Health-Check (für Windows-Dienst-Monitoring)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// ── SPA-Fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

// ── Server starten ────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`✓ Komplizen Protokolle läuft auf http://${HOST}:${PORT}`)
  console.log(`  Datenbank: ${process.env.DB_PATH || path.join(__dirname, '../data')}`)
})
