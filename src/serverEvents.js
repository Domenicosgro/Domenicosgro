// Shared SSE connection for server mode.
// Both useProtocols and useProjects subscribe here to avoid multiple connections.

const handlers  = new Set()
let es          = null
let retryDelay  = 1000
let retryTimer  = null

function buildUrl() {
  const token = localStorage.getItem('kp_session_token')
  return token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events'
}

function connect() {
  if (es) return
  try {
    es = new EventSource(buildUrl())
  } catch {
    scheduleRetry()
    return
  }

  es.addEventListener('connected', () => {
    retryDelay = 1000   // reset backoff after successful connect
  })

  es.addEventListener('change', (e) => {
    let data
    try { data = JSON.parse(e.data) } catch { return }
    for (const h of handlers) {
      try { h(data) } catch (err) { console.error('[SSE] Handler-Fehler:', err) }
    }
  })

  es.onerror = () => {
    es.close()
    es = null
    scheduleRetry()
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    retryDelay = Math.min(retryDelay * 2, 30_000)
    connect()
  }, retryDelay)
}

function disconnect() {
  clearTimeout(retryTimer)
  if (es) { es.close(); es = null }
}

export function subscribeToServerEvents(handler) {
  handlers.add(handler)
  if (handlers.size === 1) connect()
  return () => {
    handlers.delete(handler)
    if (handlers.size === 0) disconnect()
  }
}
