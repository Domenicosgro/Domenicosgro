import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

// ── Kontakt-Nutzungshäufigkeit (pro Nutzer) ───────────────────────────────────
// Zählt, wie oft ein Kontakt verwendet wird (als Teilnehmer, Zuständiger,
// Empfänger) und liefert daraus eine Sortier-Punktzahl: häufig + zuletzt genutzt
// stehen oben. Bewusst ein EIGENER Speicher (nicht die User-Settings), da deren
// Server-PUT das ganze Objekt ersetzt → hier keine Kollision mit den Favoriten.
//   Server-Modus: GET/PUT /api/contact-usage (je Nutzer, appState)
//   Lokal/Electron: localStorage 'bb_contact_usage'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const LS_KEY   = 'bb_contact_usage'
const MAX_KEYS = 500   // Deckel gegen unbegrenztes Wachstum

// Normierter Schlüssel: E-Mail bevorzugt (stabil), sonst Name. Klein/getrimmt.
export const usageKey = (c) => {
  if (!c) return ''
  if (typeof c === 'string') return c.trim().toLowerCase()
  return String(c.email || c.name || c.company || '').trim().toLowerCase()
}

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('kp_session_token')
    if (token) h['Authorization'] = `Bearer ${token}`
  }
  return h
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

const ContactUsageContext = createContext(null)

export function ContactUsageProvider({ children }) {
  // map: { [key]: { count, last } }  (last = ms-Zeitstempel)
  const [map, setMap] = useState(() => (isServer ? {} : loadLocal()))
  const saveTimer = useRef(null)
  const mapRef    = useRef(map)
  mapRef.current  = map

  // Beim Start und nach jedem Auth-Wechsel neu laden (Event von App bei Login).
  // Der Endpunkt leitet den Nutzer aus dem Token ab, daher genügt das Neuladen.
  useEffect(() => {
    if (!isServer) return
    let stopped = false
    const reload = () => {
      fetch('/api/contact-usage', { headers: apiHeaders() })
        .then(r => r.ok ? r.json() : {})
        .then(data => { if (!stopped && data && typeof data === 'object') setMap(data.usage || {}) })
        .catch(() => {})
    }
    reload()
    window.addEventListener('kp-auth-changed', reload)
    return () => { stopped = true; window.removeEventListener('kp-auth-changed', reload) }
  }, [])

  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (isServer) {
        fetch('/api/contact-usage', {
          method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ usage: next }),
        }).catch(() => {})
      } else {
        try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {}
      }
    }, 600)
  }, [])

  const record = useCallback((contact) => {
    const key = usageKey(contact)
    if (!key) return
    setMap(prev => {
      const cur = prev[key] || { count: 0, last: 0 }
      let next = { ...prev, [key]: { count: cur.count + 1, last: Date.now() } }
      // Deckel: bei Überschreitung die am längsten ungenutzten entfernen.
      const keys = Object.keys(next)
      if (keys.length > MAX_KEYS) {
        keys.sort((a, b) => (next[a].last || 0) - (next[b].last || 0))
        for (const k of keys.slice(0, keys.length - MAX_KEYS)) delete next[k]
      }
      persist(next)
      return next
    })
  }, [persist])

  // Punktzahl: primär Häufigkeit, sekundär Aktualität (leichter Bonus).
  const scoreOf = useCallback((contact) => {
    const e = mapRef.current[usageKey(contact)]
    if (!e) return 0
    const days = (Date.now() - (e.last || 0)) / 86400000
    const recency = days < 7 ? 2 : days < 30 ? 1 : 0
    return e.count * 10 + recency
  }, [])

  // Bequemer Vergleicher für Array.sort (höhere Punktzahl zuerst).
  const compare = useCallback((a, b) => scoreOf(b) - scoreOf(a), [scoreOf])

  const value = { record, scoreOf, compare, hasUsage: Object.keys(map).length > 0 }
  return <ContactUsageContext.Provider value={value}>{children}</ContactUsageContext.Provider>
}

// Sicher auch außerhalb des Providers nutzbar (No-op-Fallback).
const NOOP = { record: () => {}, scoreOf: () => 0, compare: () => 0, hasUsage: false }
export function useContactUsage() {
  return useContext(ContactUsageContext) || NOOP
}

// ── Einheitliche Kontaktauswahl ───────────────────────────────────────────────
// Jede Liste, aus der man einen Kontakt wählt, verhält sich gleich: dieselben
// durchsuchten Felder, dieselbe Treffergüte, dieselben Gruppenüberschriften.
// Wer eine neue Auswahl baut, nimmt diese Helfer und muss nichts nachbauen.

export const FREQUENT_LABEL = '★ Häufig genutzt'
export const REST_LABEL     = 'Weitere Kontakte'

// Durchsuchte Felder – überall identisch. Leerer Suchtext trifft alles.
export const matchesTerm = (c, term) => {
  if (!term) return true
  const t = term.toLowerCase()
  return ['name', 'company', 'email', 'role', 'gewerk']
    .some(f => (c?.[f] ?? '').toLowerCase().includes(t))
}

// Treffergüte: Präfix-Treffer (Name → Firma → E-Mail) vor Teiltreffern. Dadurch
// werden die Vorschläge mit jedem weiteren Buchstaben konkreter. Ohne Suchtext
// sind alle gleichrangig — dann entscheidet allein die Nutzungshäufigkeit.
export const matchRank = (c, term) => {
  if (!term) return 5
  const t    = term.toLowerCase()
  const name = (c?.name    ?? '').toLowerCase()
  const comp = (c?.company ?? '').toLowerCase()
  const mail = (c?.email   ?? '').toLowerCase()
  if (name.startsWith(t)) return 0
  if (comp.startsWith(t)) return 1
  if (mail.startsWith(t)) return 2
  if (name.includes(t))   return 3
  return 4
}

// Der gemeinsame Vergleicher: Treffergüte → Nutzung → Alphabet.
export const contactSorter = (term, score) => (a, b) =>
  (term ? matchRank(a, term) - matchRank(b, term) : 0)
  || score(b) - score(a)
  || (a.name || a.company || '').localeCompare(b.name || b.company || '', 'de')

// Vorschläge abtrennen: Was schon einmal genutzt wurde, steht oben unter
// „Häufig genutzt". Ohne Suchtext — bei einer Suche zählt nur die Treffergüte.
export const splitFrequent = (rows, score) => {
  const frequent = [], rest = []
  for (const r of rows) (score(r) > 0 ? frequent : rest).push(r)
  return { frequent, rest }
}

// Eingefrorene Punktzahl für offene Auswahllisten.
// Ohne das sortiert `record()` die Liste noch während der Auswahl um: Man klickt
// einen Kontakt an, er wandert nach oben, alles darunter rutscht — und man sucht
// seine Stelle neu. Der erste gelesene Wert je Kontakt gilt, solange die Liste
// offen ist; beim nächsten Öffnen zählt wieder die aktuelle Häufigkeit.
export function useStableScore() {
  const { scoreOf } = useContactUsage()
  const cache = useRef(null)
  if (!cache.current) cache.current = new Map()
  return useCallback((c) => {
    const k = usageKey(c)
    if (!cache.current.has(k)) cache.current.set(k, scoreOf(c))
    return cache.current.get(k)
  }, [scoreOf])
}
