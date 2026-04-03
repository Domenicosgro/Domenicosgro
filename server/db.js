/**
 * SQLite key-value store via better-sqlite3.
 * Each "table" (protocols, projects) is stored as a single JSON row.
 * The data directory is configurable via DB_PATH env variable.
 */

const Database = require('better-sqlite3')
const path     = require('path')
const fs       = require('fs')

const dataDir = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(path.join(dataDir, 'komplizen.db'))

// Single WAL-mode for better concurrent read performance on Windows
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

const stmtGet    = db.prepare('SELECT value FROM store WHERE key = ?')
const stmtUpsert = db.prepare(`
  INSERT INTO store (key, value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE
    SET value      = excluded.value,
        updated_at = excluded.updated_at
`)

module.exports = {
  get(key) {
    const row = stmtGet.get(key)
    if (!row) return []
    try { return JSON.parse(row.value) } catch { return [] }
  },

  set(key, value) {
    stmtUpsert.run(key, JSON.stringify(value))
  },
}
