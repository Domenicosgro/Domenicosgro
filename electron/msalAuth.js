// Microsoft Graph authentication — Electron main-process only.
// Auth Code + PKCE via custom protocol msprotokoll://auth

const EventEmitter = require('events')
const path = require('path')
const fs   = require('fs')

// Lazy-loaded so the app starts even when @azure/msal-node is not installed
let PublicClientApplication, CryptoProvider
try {
  const msal = require('@azure/msal-node')
  PublicClientApplication = msal.PublicClientApplication
  CryptoProvider          = msal.CryptoProvider
} catch { /* Graph features disabled */ }

const SCOPES           = ['Mail.Send', 'Calendars.ReadWrite', 'User.Read', 'offline_access']
const TOKEN_CACHE_FILE = 'graph_token.enc'
const authEmitter      = new EventEmitter()
authEmitter.setMaxListeners(3)

let _pca    = null
let _config = null

// ── Config ────────────────────────────────────────────────────────────────────
function loadConfig() {
  if (_config) return _config

  // 1. userData/graph.config.json (recommended for production / end-user)
  const { app } = require('electron')
  const cfgFile = path.join(app.getPath('userData'), 'graph.config.json')
  if (fs.existsSync(cfgFile)) {
    try {
      const c = JSON.parse(fs.readFileSync(cfgFile, 'utf8'))
      if (c.clientId) { _config = c; return _config }
    } catch {}
  }

  // 2. .env file in working directory (development)
  const envFile = path.join(process.cwd(), '.env')
  if (fs.existsSync(envFile)) {
    try {
      const env = {}
      fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#\r\n]+?)"?\s*$/)
        if (m) env[m[1]] = m[2]
      })
      if (env.GRAPH_CLIENT_ID) {
        _config = {
          clientId:    env.GRAPH_CLIENT_ID,
          tenantId:    env.GRAPH_TENANT_ID    || 'common',
          redirectUri: env.GRAPH_REDIRECT_URI || 'msprotokoll://auth',
        }
        return _config
      }
    } catch {}
  }

  // 3. Process environment variables
  if (process.env.GRAPH_CLIENT_ID) {
    _config = {
      clientId:    process.env.GRAPH_CLIENT_ID,
      tenantId:    process.env.GRAPH_TENANT_ID    || 'common',
      redirectUri: process.env.GRAPH_REDIRECT_URI || 'msprotokoll://auth',
    }
    return _config
  }

  return null
}

// ── Token cache (encrypted via Electron safeStorage) ─────────────────────────
function cachePath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), TOKEN_CACHE_FILE)
}

function loadCachedTokens() {
  try {
    const { safeStorage } = require('electron')
    const p = cachePath()
    if (!fs.existsSync(p)) return null
    return safeStorage.decryptString(fs.readFileSync(p))
  } catch { return null }
}

function saveCachedTokens(serialized) {
  try {
    const { safeStorage } = require('electron')
    if (!safeStorage.isEncryptionAvailable()) return
    fs.writeFileSync(cachePath(), safeStorage.encryptString(serialized))
  } catch {}
}

function deleteCachedTokens() {
  try { const p = cachePath(); if (fs.existsSync(p)) fs.unlinkSync(p) } catch {}
}

// ── PCA initialization ────────────────────────────────────────────────────────
function initPca() {
  if (_pca) return _pca
  if (!PublicClientApplication) return null

  const config = loadConfig()
  if (!config?.clientId) return null

  _pca = new PublicClientApplication({
    auth: {
      clientId:  config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId || 'common'}`,
    },
  })

  const cached = loadCachedTokens()
  if (cached) {
    try { _pca.getTokenCache().deserialize(cached) } catch {}
  }
  return _pca
}

// Called from main.js when the OS delivers the msprotokoll:// redirect URL
function handleProtocolUrl(url) {
  authEmitter.emit('auth-redirect', url)
}

// ── Token acquisition (silent first, then interactive Auth Code + PKCE) ───────
async function getAccessToken() {
  const pca = initPca()
  if (!pca) throw new Error(
    'Microsoft Graph nicht konfiguriert. Bitte GRAPH_CLIENT_ID einrichten (siehe README.md).'
  )

  const config      = loadConfig()
  const redirectUri = config.redirectUri || 'msprotokoll://auth'

  // 1. Silent
  const accounts = await pca.getAllAccounts()
  if (accounts.length > 0) {
    try {
      const result = await pca.acquireTokenSilent({ account: accounts[0], scopes: SCOPES })
      saveCachedTokens(pca.getTokenCache().serialize())
      return result.accessToken
    } catch { /* silent failed – fall through to interactive */ }
  }

  // 2. Interactive: Auth Code + PKCE
  const { verifier, challenge } = await new CryptoProvider().generatePkceCodes()

  const authUrl = await pca.getAuthCodeUrl({
    scopes:              SCOPES,
    redirectUri,
    codeChallenge:       challenge,
    codeChallengeMethod: 'S256',
    responseMode:        'query',
  })

  const { shell } = require('electron')
  await shell.openExternal(authUrl)

  // Wait up to 2 min for the protocol callback
  const redirectUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      authEmitter.removeAllListeners('auth-redirect')
      reject(new Error('Anmeldung abgebrochen – nach 2 Minuten kein Callback erhalten.'))
    }, 120_000)
    authEmitter.once('auth-redirect', url => { clearTimeout(timer); resolve(url) })
  })

  const params = new URL(redirectUrl).searchParams
  const code   = params.get('code')
  const error  = params.get('error')
  if (error) throw new Error(`Microsoft-Anmeldefehler: ${params.get('error_description') || error}`)
  if (!code) throw new Error('Kein Autorisierungs-Code im Callback erhalten.')

  const result = await pca.acquireTokenByCode({ code, scopes: SCOPES, redirectUri, codeVerifier: verifier })
  saveCachedTokens(pca.getTokenCache().serialize())
  return result.accessToken
}

// ── Account info ──────────────────────────────────────────────────────────────
async function getCurrentAccount() {
  const pca = initPca()
  if (!pca) return null
  const accounts = await pca.getAllAccounts()
  if (!accounts.length) return null
  return { displayName: accounts[0].name || accounts[0].username, username: accounts[0].username }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  const pca = initPca()
  if (pca) {
    const accounts = await pca.getAllAccounts()
    for (const acc of accounts) {
      try { await pca.getTokenCache().removeAccount(acc) } catch {}
    }
  }
  deleteCachedTokens()
  _pca    = null
  _config = null
}

module.exports = { loadConfig, getAccessToken, getCurrentAccount, logout, handleProtocolUrl }
