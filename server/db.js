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
  CREATE TABLE IF NOT EXISTS reset_requests (
    username   TEXT PRIMARY KEY,
    requested_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

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

// ── Migrations ────────────────────────────────────────────────────────────────
try { db.exec("ALTER TABLE users ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'") } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN password_note TEXT NOT NULL DEFAULT ''") } catch {}

// ── Users ─────────────────────────────────────────────────────────────────────
const _uHasAny      = db.prepare('SELECT 1 FROM users LIMIT 1')
const _uGet         = db.prepare('SELECT username, display_name, password_hash, role, settings, password_note, created_at, last_login FROM users WHERE username = ?')
const _uList        = db.prepare('SELECT username, display_name, role, password_note, created_at, last_login FROM users ORDER BY created_at ASC')
const _uInsert      = db.prepare('INSERT INTO users (username, display_name, password_hash, role, password_note) VALUES (@username, @displayName, @hash, @role, @passwordNote)')
const _uLastLogin   = db.prepare("UPDATE users SET last_login = datetime('now') WHERE username = ?")
const _uPassword    = db.prepare('UPDATE users SET password_hash = @hash WHERE username = @username')
const _uSettings    = db.prepare('UPDATE users SET settings = @settings WHERE username = @username')
const _uPwNote      = db.prepare('UPDATE users SET password_note = @note WHERE username = @username')
const _uDelete      = db.prepare('DELETE FROM users WHERE username = ?')
const _sDeleteUser  = db.prepare('DELETE FROM sessions WHERE username = ?')

const users = {
  hasAny()                          { return !!_uHasAny.get() },
  get(username)                     { return _uGet.get(username) || null },
  list()                            { return _uList.all() },
  create(username, displayName, hash, role = 'user', passwordNote = '') {
    _uInsert.run({ username, displayName, hash, role, passwordNote })
  },
  updateLastLogin(username)         { _uLastLogin.run(username) },
  updatePassword(username, hash)    { _uPassword.run({ hash, username }) },
  updateSettings(username, settings){ _uSettings.run({ settings: JSON.stringify(settings), username }) },
  updatePasswordNote(username, note){ _uPwNote.run({ note, username }) },
  getSettings(username) {
    const row = _uGet.get(username)
    if (!row) return {}
    try { return JSON.parse(row.settings || '{}') } catch { return {} }
  },
  delete(username)                  { _sDeleteUser.run(username); return _uDelete.run(username).changes > 0 },
}

// ── Sessions ──────────────────────────────────────────────────────────────────
const _sGet    = db.prepare("SELECT token, username, expires_at FROM sessions WHERE token = ? AND expires_at > datetime('now')")
const _sInsert = db.prepare('INSERT INTO sessions (token, username, expires_at) VALUES (@token, @username, @expiresAt)')
const _sDelete = db.prepare('DELETE FROM sessions WHERE token = ?')
const _sExpire = db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')")

const sessions = {
  get(token)                         { return _sGet.get(token) || null },
  create(token, username, expiresAt) { _sInsert.run({ token, username, expiresAt }) },
  delete(token)                      { _sDelete.run(token) },
  deleteExpired()                    { return _sExpire.run().changes },
}

// ── Password reset requests ───────────────────────────────────────────────────
const _rrUpsert = db.prepare("INSERT INTO reset_requests (username) VALUES (?) ON CONFLICT(username) DO UPDATE SET requested_at = datetime('now')")
const _rrList   = db.prepare('SELECT username, requested_at FROM reset_requests ORDER BY requested_at ASC')
const _rrDelete = db.prepare('DELETE FROM reset_requests WHERE username = ?')

const resetRequests = {
  upsert(username) { _rrUpsert.run(username) },
  list()           { return _rrList.all() },
  delete(username) { _rrDelete.run(username) },
}

module.exports = {
  protocols: makeStore('protocols'),
  projects:  makeStore('projects'),
  users,
  sessions,
  resetRequests,
}
