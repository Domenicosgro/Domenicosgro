import { useEffect } from 'react'

// Kleiner Fetch-Helfer der Prüfstation: Token anhängen, Fehler als Error werfen,
// abgelaufene Sitzung an das Overlay melden (gleiches Ereignis wie im Protokolltool).

export const tokenOf = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null)
export const authHeaders = () => {
  const t = tokenOf()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function handle(res) {
  if (res.status === 401) {
    window.dispatchEvent(new Event('kp-auth-expired'))
    throw new Error('Sitzung abgelaufen – bitte neu anmelden.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`)
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

export async function uploadFile(vorgangId, file, { kategorie, art, notiz } = {}) {
  const q = new URLSearchParams({ name: file.name, kategorie, art: art || '', notiz: notiz || '' })
  const res = await fetch(`/api/pruefstation/vorgaenge/${vorgangId}/dateien?${q}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  return handle(res)
}

export async function fetchBlob(vorgangId, rel) {
  const res = await fetch(`/api/pruefstation/vorgaenge/${vorgangId}/dateien/download?rel=${encodeURIComponent(rel)}`, { headers: authHeaders() })
  if (!res.ok) await handle(res)
  return res.blob()
}

export const ART_LABEL = {
  nachtrag:  'Nachtrag',
  rechnung:  'Abschlagsrechnung',
  sonstiges: 'Sonstige Prüfung',
}

export const STATUS = {
  eingang:       { label: 'Eingang',       badge: 'badge-gray'   },
  in_pruefung:   { label: 'In Prüfung',    badge: 'badge-blue'   },
  zur_freigabe:  { label: 'Zur Freigabe',  badge: 'badge-yellow' },
  abgeschlossen: { label: 'Abgeschlossen', badge: 'badge-green'  },
}

export const DATEI_ART = {
  einigung:          'Einigung',
  email:             'E-Mail-Verlauf',
  stellungnahme:     'Stellungnahme',
  protokoll:         'Protokoll',
  leistungsnachweis: 'Leistungsnachweis',
  vertrag:           'Vertragsunterlage',
  hinweis:           'Hinweis / Auftragszettel',
  sonstiges:         'Sonstiges',
}

export function formatBytes(bytes) {
  if (!bytes) return '–'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDateDe(iso) {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE')
}

// Kurzbezeichnung eines Vorgangs, z. B. „Nachtrag 008 Index 1 – Umzeichnung"
export function vorgangLabel(v) {
  const head = [v.nummer || ART_LABEL[v.art] || 'Prüfung', v.index ? `Index ${v.index}` : ''].filter(Boolean).join(' ')
  return v.titel ? `${head} – ${v.titel}` : head
}

// Name des Vorgangsordners – gleiche Regel wie server/pruefstation.js (ordnerName)
export function suggestFolderName(v) {
  if (v.art === 'nachtrag') {
    const m = /(\d+)/.exec(v.nummer || '')
    return `Nachtrag ${m ? m[1].padStart(3, '0') : (v.nummer || '0xx')}`
  }
  if (v.art === 'rechnung') return v.nummer || v.titel || 'Abschlagsrechnung'
  return v.titel || v.nummer || 'Prüfung'
}

// Dialog mit Escape schließen
export function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
