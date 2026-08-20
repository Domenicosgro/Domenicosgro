'use strict'

const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const BCRYPT_ROUNDS = 12
// Sitzungsdauer bei INAKTIVITÄT. Durch die gleitende Verlängerung in
// resolveToken() bleibt man bei aktiver Nutzung dauerhaft angemeldet; die
// Sitzung verfällt erst, wenn das Programm so lange gar nicht benutzt wurde.
// 8 Stunden waren zu kurz: nach Feierabend war man am nächsten Morgen abgemeldet
// und lief mitten in der Arbeit in "Speichern fehlgeschlagen".
const SESSION_HOURS = 14 * 24   // 14 Tage Inaktivität

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

function generateInitialPassword() {
  return crypto.randomBytes(8).toString('base64url')
}

module.exports = { hashPassword, verifyPassword, generateToken, generateInitialPassword, SESSION_HOURS }
