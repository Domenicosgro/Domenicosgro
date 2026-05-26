'use strict'

const path = require('path')
const fs   = require('fs')

const dataDir   = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '../data')
const attachDir = path.join(dataDir, 'attachments')

if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true })

// Only alphanumeric, hyphens, underscores — prevents path traversal.
function safeId(id) {
  const s = String(id).replace(/[^a-zA-Z0-9_-]/g, '')
  if (!s) throw new Error('Ungültige Attachment-ID.')
  return s
}

function filePath(id) {
  return path.join(attachDir, safeId(id))
}

module.exports = {
  async save(id, base64) {
    await fs.promises.writeFile(filePath(id), Buffer.from(base64, 'base64'))
  },

  async load(id) {
    try {
      return (await fs.promises.readFile(filePath(id))).toString('base64')
    } catch (e) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  },

  async remove(id) {
    try { await fs.promises.unlink(filePath(id)) }
    catch (e) { if (e.code !== 'ENOENT') throw e }
  },

  async exists(id) {
    try { await fs.promises.access(filePath(id)); return true }
    catch { return false }
  },
}
