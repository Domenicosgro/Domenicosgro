'use strict'

const Database = require('better-sqlite3')
const path     = require('path')
const fs       = require('fs')

const dataDir = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../data')

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'komplizen.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS protocols (
    id         TEXT    PRIMARY KEY,
    project_id TEXT,
    data       TEXT    NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT    PRIMARY KEY,
    project_id TEXT,
    data       TEXT    NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    username      TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// ── Migration from legacy key-value store ─────────────────────────────────────
function migrateFromStore() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM protocols').get().c
  if (existing > 0) return   // already migrated

  const getStoreRow = db.prepare('SELECT value FROM store WHERE key = ?')

  const migrate = db.transaction((tableName, storeKey) => {
    const row = getStoreRow.get(storeKey)
    if (!row) return 0
    let arr
    try { arr = JSON.parse(row.value) } catch { return 0 }
    if (!Array.isArray(arr) || arr.length === 0) return 0

    const ins = db.prepare(`
      INSERT OR IGNORE INTO ${tableName}
        (id, project_id, data, version, updated_at)
      VALUES (@id, @pid, @data, 1, @ts)
    `)
    let n = 0
    for (const item of arr) {
      if (!item?.id) continue
      ins.run({
        id:   item.id,
        pid:  item.projectId ?? null,
        data: JSON.stringify(item),
        ts:   item.updatedAt || new Date().toISOString(),
      })
      n++
    }
    return n
  })

  const np = migrate('protocols', 'protocols')
  const nj = migrate('projects',  'projects')
  if (np > 0 || nj > 0) {
    console.log(`[db] Legacy migration: ${np} Protokolle, ${nj} Projekte`)
  }
}

migrateFromStore()

// ── Row-level store factory ───────────────────────────────────────────────────
function makeStore(tableName) {
  const listStmt = db.prepare(
    `SELECT id, data, version, updated_at FROM ${tableName} ORDER BY updated_at DESC`
  )
  const getStmt = db.prepare(
    `SELECT id, data, version, updated_at FROM ${tableName} WHERE id = ?`
  )
  const insertStmt = db.prepare(`
    INSERT INTO ${tableName} (id, project_id, data, version, updated_at, updated_by)
    VALUES (@id, @pid, @data, 1, @ts, @by)
  `)
  const updateStmt = db.prepare(`
    UPDATE ${tableName}
       SET data = @data, version = version + 1, updated_at = @ts, updated_by = @by
     WHERE id = @id AND version = @ver
  `)
  const deleteStmt    = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`)
  const deleteAllStmt = db.prepare(`DELETE FROM ${tableName}`)
  const upsertStmt    = db.prepare(`
    INSERT INTO ${tableName} (id, project_id, data, version, updated_at, updated_by)
    VALUES (@id, @pid, @data, 1, @ts, @by)
    ON CONFLICT(id) DO UPDATE
      SET data       = excluded.data,
          project_id = excluded.project_id,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
  `)

  function parseRow(row) {
    if (!row) return null
    try {
      return { ...JSON.parse(row.data), _version: row.version, _updatedAt: row.updated_at }
    } catch { return null }
  }

  return {
    list() {
      return listStmt.all().map(parseRow).filter(Boolean)
    },

    get(id) {
      return parseRow(getStmt.get(id))
    },

    create(data, by = null) {
      const ts = data.updatedAt || new Date().toISOString()
      insertStmt.run({ id: data.id, pid: data.projectId ?? null, data: JSON.stringify(data), ts, by })
      return { id: data.id, version: 1 }
    },

    update(id, data, clientVersion, by = null) {
      const row = getStmt.get(id)
      if (!row) return { notFound: true }
      if (row.version !== clientVersion) {
        return { conflict: true, serverVersion: row.version, serverData: parseRow(row) }
      }
      const ts   = data.updatedAt || new Date().toISOString()
      const info = updateStmt.run({ data: JSON.stringify(data), ts, by, id, ver: clientVersion })
      if (info.changes === 0) {
        const fresh = getStmt.get(id)
        return { conflict: true, serverVersion: fresh.version, serverData: parseRow(fresh) }
      }
      return { id, version: clientVersion + 1 }
    },

    delete(id) {
      return deleteStmt.run(id).changes > 0
    },

    replaceAll(arr, by = null) {
      db.transaction(() => {
        deleteAllStmt.run()
        const ts = new Date().toISOString()
        for (const item of arr) {
          if (!item?.id) continue
          upsertStmt.run({
            id:   item.id,
            pid:  item.projectId ?? null,
            data: JSON.stringify(item),
            ts:   item.updatedAt || ts,
            by,
          })
        }
      })()
    },
  }
}

module.exports = {
  protocols: makeStore('protocols'),
  projects:  makeStore('projects'),
}
