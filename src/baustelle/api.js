// ── Zugriff der Baustellen-Oberfläche ────────────────────────────────────────
// Alles läuft über /api/baustelle/* – die schmale Fassade (server/baustelle.js).
// Bewusst keine andere Route: wenn diese Oberfläche eines Tages von außen
// erreichbar sein soll, ist genau das die Fläche, die dann offen steht.

export const tokenOf = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null)

export const authHeaders = () => {
  const t = tokenOf()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

/** Pfadanfang aller Projektrouten der Fassade. */
export const B = (projectId) => `/api/baustelle/projekte/${encodeURIComponent(projectId)}`

/** Wohin die Originalfotos gehen – wird an originaleSenden() übergeben. */
export const fotoPfad = (projectId, satz) =>
  `${B(projectId)}/berichte/${encodeURIComponent(satz.entryId)}/fotos`

async function handle(res) {
  if (res.status === 401) {
    window.dispatchEvent(new Event('kp-auth-expired'))
    throw new Error('Sitzung abgelaufen – bitte neu anmelden.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(data.error || `Fehler ${res.status}`)
    e.status = res.status
    e.grund  = data.grund || null
    throw e
  }
  return data
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { ...authHeaders(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handle(res)
}

export const projekteLaden = () => api('/api/baustelle/projekte')

export const berichteLaden = (projectId, tage = 14) =>
  api(`${B(projectId)}/berichte?tage=${encodeURIComponent(tage)}`)

export const berichtAnlegen = (projectId, daten) =>
  api(`${B(projectId)}/berichte`, { method: 'POST', body: daten })

export const berichtAendern = (projectId, entryId, daten) =>
  api(`${B(projectId)}/berichte/${encodeURIComponent(entryId)}`, { method: 'PATCH', body: daten })

/** Kleine Fassung eines Fotos ablegen (base64, ohne Präfix). */
export const anhangSpeichern = (projectId, id, data) =>
  api(`${B(projectId)}/anhang`, { method: 'POST', body: { id, data } })

/** Kleine Fassung eines Fotos holen – für die Miniaturen älterer Berichte. */
export async function anhangLaden(projectId, id) {
  try {
    const d = await api(`${B(projectId)}/anhang/${encodeURIComponent(id)}`)
    return d?.data ? `data:image/jpeg;base64,${d.data}` : null
  } catch { return null }
}

export const wetterHolen = (projectId, date, half) =>
  api(`${B(projectId)}/wetter?date=${encodeURIComponent(date)}&half=${encodeURIComponent(half)}`)

// ── Beschriftungen ──────────────────────────────────────────────────────────
// Dieselben vier Werte wie im Protokolltool (WEATHER in BautagebuchView.jsx)
// und wie die automatische Abfrage sie liefert (wmoToWeather im Server). Hier
// noch einmal, damit die Oberfläche nichts aus dem großen Bündel nachlädt –
// aber NICHT erweitern, sonst steht im Büro ein Wert, den der Ausdruck nicht
// kennt.
export const WETTER = [
  { value: 'sonnig',   label: 'Sonnig'        },
  { value: 'bewoelkt', label: 'Bewölkt'       },
  { value: 'regen',    label: 'Regen'         },
  { value: 'schnee',   label: 'Schnee/Frost'  },
]

export const GRUND_TEXT = {
  fremd:      'Von jemand anderem angelegt – Änderungen im Büro.',
  alt:        'Älter als 30 Tage – Änderungen im Büro.',
  formatiert: 'Im Büro formatiert – Änderungen am Rechner, sonst wäre die Formatierung weg.',
}
