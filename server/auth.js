'use strict'

const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const BCRYPT_ROUNDS = 12
const SESSION_HOURS = 8

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
