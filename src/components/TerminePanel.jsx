import React, { useEffect, useState, useMemo } from 'react'
import { CalendarClock, Video, MapPin, Users, ChevronDown, ChevronRight,
         RotateCcw, Link2, AlertTriangle } from 'lucide-react'
import { formatDate, MEETING_TYPES } from '../utils'

// ── Termine aus dem Kalender ─────────────────────────────────────────────────
//
// Der Bereich zeigt die Besprechungen aus dem eigenen Outlook-Kalender (und
// aus gemeinsamen Kalendern, die der Betrieb freigegeben hat) und macht aus
// einer davon ein vorbereitetes Protokoll.
//
// Der Gewinn ist nicht das Datum -- das tippt man in drei Sekunden -- sondern
// die TEILNEHMERLISTE. Die Eingeladenen werden gegen die Kontakte abgeglichen;
// wer dort steht, kommt mit Firma und Rolle. Das ist die Liste, die man sonst
// vor jedem Jour fixe neu zusammensucht.
//
// Zuordnung Termin → Projekt macht die Oberflaeche nicht automatisch. Betreff-
// zeilen sehen in jedem Buero anders aus; ein Rateversuch waere mal richtig
// und mal peinlich. Stattdessen ordnet man einmal zu, und das bleibt gemerkt
// (fuer alle, nicht nur fuer einen).

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = typeof window !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

const OFFEN_KEY = 'kp_termine_offen'

// Aus dem Betreff die Besprechungsart, wenn sie darin steht. Sonst leer --
// lieber kein Vorschlag als ein falscher, der mitgedruckt wird.
export function artAusBetreff(betreff) {
  const b = String(betreff || '').toLowerCase()
  for (const art of MEETING_TYPES) {
    if (b.includes(art.toLowerCase())) return art
  }
  if (/jour\s*fixe/.test(b))  return 'Jour Fixe'
  if (/baubespr/.test(b))     return 'Baubesprechung'
  return ''
}

/**
 * Aus den Eingeladenen die Anwesenheitsliste.
 *
 * Dieselbe Logik wie auf dem Server (server/termine.js teilnehmerAus) -- hier
 * noetig, weil das Protokoll im Browser entsteht und die Kontakte dort liegen.
 * Die Namensform folgt der Anwendung: Name, Firma, Rolle, E-Mail.
 */
export function teilnehmerAus(termin, kontakte = []) {
  const nachEmail = new Map()
  for (const k of kontakte) {
    const e = String(k?.email || '').trim().toLowerCase()
    if (e && !nachEmail.has(e)) nachEmail.set(e, k)
  }
  const alle = [
    { ...(termin?.organisator || {}), zusage: 'organizer' },
    ...(termin?.eingeladene || []),
  ]
  const gesehen = new Set()
  const raus = []
  for (const p of alle) {
    const email = String(p.email || '').trim().toLowerCase()
    const name  = String(p.name  || '').trim()
    const key   = email || name.toLowerCase()
    if (!key || gesehen.has(key)) continue
    gesehen.add(key)
    const k = email ? nachEmail.get(email) : null
    raus.push({
      name:      k?.name || name || email,
      company:   k?.company || '',
      role:      k?.role || '',
      email:     email || k?.email || '',
      present:   p.zusage !== 'declined',
      contactId: k?.id || null,
    })
  }
  return raus
}

/** Was aus einem Termin in das neue Protokoll uebernommen wird. */
export function vorlageAus(termin, kontakte = []) {
  const teilnehmer = teilnehmerAus(termin, kontakte)
  const ort = termin.ort || (termin.online ? 'Microsoft Teams' : '')
  return {
    date:        termin.datum,
    time:        termin.zeit || '',
    location:    ort,
    meetingType: artAusBetreff(termin.betreff),
    subtitle:    termin.betreff || '',
    participants: teilnehmer,
  }
}

function TerminZeile({ termin, projekte, projektId, onZuordnen, onVorbereiten, kontakte }) {
  const [offen, setOffen] = useState(false)
  const teilnehmer = useMemo(() => teilnehmerAus(termin, kontakte), [termin, kontakte])
  const bekannt    = teilnehmer.filter(p => p.contactId).length
  const heute      = new Date().toISOString().slice(0, 10)
  const vorbei     = termin.datum < heute

  return (
    <div className={`border-b border-gray-100 last:border-0 ${vorbei ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3 py-2.5">
        <button className="btn-ghost p-0.5 text-gray-300 mt-0.5 shrink-0"
                onClick={() => setOffen(o => !o)}
                title={offen ? 'Teilnehmer ausblenden' : 'Teilnehmer anzeigen'}>
          {offen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="w-24 shrink-0 text-xs">
          <div className="font-semibold text-gray-800">{formatDate(termin.datum)}</div>
          <div className="text-gray-500">
            {termin.ganztags ? 'ganztägig'
              : termin.zeit + (termin.endeZeit ? `–${termin.endeZeit}` : '')}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {termin.betreff || '(ohne Betreff)'}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
            {termin.ort && (
              <span className="flex items-center gap-1 truncate max-w-[14rem]">
                <MapPin size={11} /> {termin.ort}
              </span>
            )}
            {termin.online && (
              <span className="flex items-center gap-1 text-brand-600"><Video size={11} /> Teams</span>
            )}
            <span className="flex items-center gap-1">
              <Users size={11} /> {teilnehmer.length}
              {bekannt > 0 && <span className="text-gray-400">· {bekannt} in den Kontakten</span>}
            </span>
            {termin.serie && <span className="text-gray-400">· Serie</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Zuordnung: einmal gesetzt, bleibt gemerkt */}
          <select className="input py-0.5 text-xs w-36"
                  value={projektId || ''}
                  title="Zu welchem Projekt gehört dieser Termin?"
                  onChange={e => onZuordnen(termin, e.target.value || null)}>
            <option value="">— kein Projekt —</option>
            {projekte.map(p => <option key={p.id} value={p.id}>{p.name || '(ohne Namen)'}</option>)}
          </select>
          <button className="btn-secondary text-xs py-1 px-2"
                  onClick={() => onVorbereiten(termin, teilnehmer)}
                  title="Protokoll mit Datum, Ort und Teilnehmern aus diesem Termin anlegen">
            Protokoll vorbereiten
          </button>
        </div>
      </div>

      {offen && (
        <div className="pl-[8.5rem] pb-3 -mt-0.5">
          {teilnehmer.length === 0
            ? <p className="text-xs text-gray-400">Keine Eingeladenen im Termin.</p>
            : (
              <ul className="text-xs text-gray-600 space-y-0.5">
                {teilnehmer.map((p, i) => (
                  <li key={p.email || p.name || i} className="flex items-center gap-2">
                    <span className={p.present ? '' : 'line-through text-gray-400'}>{p.name}</span>
                    {p.company && <span className="text-gray-400">· {p.company}</span>}
                    {p.contactId
                      ? <span className="text-[10px] px-1 bg-brand-50 text-brand-700 border border-brand-100">Kontakt</span>
                      : <span className="text-[10px] px-1 bg-concrete text-gray-500 border border-gray-200">neu</span>}
                    {!p.present && <span className="text-[10px] text-gray-400">abgelehnt</span>}
                  </li>
                ))}
              </ul>
            )}
          <p className="text-xs text-gray-400 mt-1.5">
            „neu" heißt: steht nicht in den Kontakten. Der Name kommt dann aus der Einladung.
          </p>
        </div>
      )}
    </div>
  )
}

export default function TerminePanel({ project, projekte = [], kontakte = [], onVorbereiten }) {
  const [status,  setStatus]  = useState(null)
  const [termine, setTermine] = useState([])
  const [probleme, setProbleme] = useState([])
  const [laedt,   setLaedt]   = useState(false)
  const [fehler,  setFehler]  = useState('')
  const [offen,   setOffen]   = useState(() => {
    try { return localStorage.getItem(OFFEN_KEY) !== '0' } catch { return true }
  })
  const [alleZeigen, setAlleZeigen] = useState(false)

  const umschalten = () => setOffen(o => {
    const n = !o
    try { localStorage.setItem(OFFEN_KEY, n ? '1' : '0') } catch {}
    return n
  })

  // Status zuerst: ohne eingerichtetes Graph zeigt der Bereich gar nichts.
  // Ein leerer Kasten mit "nicht eingerichtet" waere in jedem Projekt im Weg.
  useEffect(() => {
    if (!isServer) return
    let weg = false
    fetch('/api/termine/status', { headers: apiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (!weg) setStatus(s) })
      .catch(() => {})
    return () => { weg = true }
  }, [])

  const laden = () => {
    setLaedt(true); setFehler('')
    fetch('/api/termine', { headers: apiHeaders() })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Die Termine waren nicht abrufbar.')
        return d
      })
      .then(d => { setTermine(d.termine || []); setProbleme(d.probleme || []) })
      .catch(e => setFehler(e.message))
      .finally(() => setLaedt(false))
  }

  useEffect(() => {
    if (status?.eingerichtet && offen && !termine.length && !fehler) laden()
  }, [status?.eingerichtet, offen])

  const zuordnen = (termin, projektId) => {
    // Erst in der Anzeige, dann auf dem Server: Die Zuordnung ist eine
    // Kleinigkeit, und ein Ruckeln der Liste waere schlimmer als ein
    // Fehlschlag, der beim naechsten Laden sichtbar wird.
    setTermine(ts => ts.map(x => x.icalUid === termin.icalUid ? { ...x, projektId } : x))
    fetch('/api/termine/zuordnung', {
      method: 'PUT', headers: apiHeaders(),
      body: JSON.stringify({ icalUid: termin.icalUid, projektId }),
    }).catch(() => {})
  }

  const vorbereiten = (termin) => {
    // Wird ein Termin zum Protokoll gemacht, gehoert er offensichtlich zu
    // diesem Projekt -- das muss niemand zusaetzlich einstellen.
    if (project?.id && termin.projektId !== project.id) zuordnen(termin, project.id)
    onVorbereiten(vorlageAus(termin, kontakte))
  }

  if (!isServer || !status?.eingerichtet) return null

  // Im Projekt: die zugeordneten Termine zuerst, der Rest auf Wunsch. Ohne
  // Projekt (Gesamtliste) alles.
  const eigene = project?.id ? termine.filter(t => t.projektId === project.id) : termine
  const andere = project?.id ? termine.filter(t => t.projektId !== project.id) : []
  const zeigen = alleZeigen ? [...eigene, ...andere] : eigene

  return (
    <div className="card">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={umschalten}>
        <CalendarClock size={18} className="text-brand-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">Termine</span>
            <span className="text-xs text-gray-400">
              aus {status.postfaecher?.map(p => p.adresse).join(', ')}
            </span>
            {eigene.length > 0 && (
              <span className="badge-blue">{eigene.length} für dieses Projekt</span>
            )}
          </div>
        </div>
        <button className="btn-ghost p-1.5 text-gray-400" title="Termine neu laden"
                onClick={e => { e.stopPropagation(); laden() }}>
          <RotateCcw size={14} className={laedt ? 'animate-spin' : ''} />
        </button>
        {offen ? <ChevronDown size={16} className="text-gray-400" />
               : <ChevronRight size={16} className="text-gray-400" />}
      </div>

      {offen && (
        <div className="px-4 pb-3 border-t border-gray-100">
          {fehler && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 my-2">{fehler}</p>
          )}

          {probleme.map(p => (
            <p key={p.postfach}
               className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 my-2 flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span><span className="font-medium">{p.postfach}:</span> {p.grund}</span>
            </p>
          ))}

          {laedt && !termine.length && <p className="text-sm text-gray-400 py-3">Termine werden geladen…</p>}

          {!laedt && !termine.length && !fehler && (
            <p className="text-sm text-gray-400 py-3">Keine Termine im Zeitraum.</p>
          )}

          {zeigen.map(t => (
            <TerminZeile
              key={t.icalUid || t.id}
              termin={t}
              projekte={projekte}
              projektId={t.projektId}
              kontakte={kontakte}
              onZuordnen={zuordnen}
              onVorbereiten={vorbereiten}
            />
          ))}

          {!!andere.length && (
            <button className="text-xs text-brand-600 hover:underline mt-2 flex items-center gap-1"
                    onClick={() => setAlleZeigen(a => !a)}>
              <Link2 size={12} />
              {alleZeigen
                ? 'Nur die Termine dieses Projekts'
                : andere.length === 1
                  ? '1 weiteren Termin im Kalender zeigen und zuordnen'
                  : `${andere.length} weitere Termine im Kalender zeigen und zuordnen`}
            </button>
          )}

          {!eigene.length && !!andere.length && !alleZeigen && (
            <p className="text-xs text-gray-400 mt-1">
              Diesem Projekt ist noch kein Termin zugeordnet. Einmal zuordnen – dann bleibt es.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
