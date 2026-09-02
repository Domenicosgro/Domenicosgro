import React, { useMemo, useState } from 'react'
import { Info, Search, X, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { formatDate } from '../utils'
import { stripHtml } from './RichTextEditor'

// ── Info-Liste eines Projekts ────────────────────────────────────────────────
// Zeigt die Protokollpunkte mit der Zuständigkeit "Info". Der Schwerpunkt liegt
// auf den freigemeldeten – die sind aus dem Protokoll herausgefallen und sonst
// nirgends mehr gebündelt zu finden. Die noch laufenden stehen darunter in
// einem ausklappbaren Abschnitt, damit nichts verloren geht.
//
// Dieselbe Komponente bedient das Panel im Protokoll-Editor und die Projekt-
// ansicht; im Ausdruck werden beide Abschnitte vollständig gedruckt.

const textOf = (row) => [
  row.item.topic,
  stripHtml(row.item.discussion || ''),
  stripHtml(row.item.result || ''),
  row.meetingType, row.subtitle,
].filter(Boolean).join(' ').toLowerCase()

function InfoRow({ row, onOpenProtocol }) {
  const { item } = row
  const discussion = stripHtml(item.discussion || '')
  const result     = stripHtml(item.result || '')
  return (
    <div className="border border-gray-200 bg-white px-3 py-2 break-inside-avoid">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900 text-sm">
          {item.no ? <span className="text-gray-400 mr-1.5">{item.no}</span> : null}
          {item.topic || '– ohne Thema –'}
        </p>
        <span className="text-[11px] text-gray-400 whitespace-nowrap flex items-center gap-1">
          {formatDate(row.date)}
          {onOpenProtocol && (
            <button className="btn-ghost p-0.5 text-gray-400 hover:text-brand-600 no-print"
              title="Protokoll öffnen" onClick={() => onOpenProtocol(row.protocolId)}>
              <ExternalLink size={12} />
            </button>
          )}
        </span>
      </div>
      {(discussion || result) && (
        <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
          {[discussion, result].filter(Boolean).join(' — ')}
        </p>
      )}
      <p className="text-[11px] text-gray-400 mt-1">
        {[row.meetingType, row.subtitle].filter(Boolean).join(' · ') || 'Protokoll'}
      </p>
    </div>
  )
}

export default function InfoItemsList({ rows = [], onOpenProtocol, compact = false }) {
  const [q, setQ]           = useState('')
  const [openLive, setOpen] = useState(false)

  const query = q.trim().toLowerCase()
  const filtered = useMemo(
    () => (query ? rows.filter(r => textOf(r).includes(query)) : rows),
    [rows, query])

  const closed = filtered.filter(r => r.closed)
  const live   = filtered.filter(r => !r.closed)

  return (
    <div className="space-y-3">
      {/* Suche */}
      <div className="relative no-print">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-8 pr-7" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Infos durchsuchen (Thema, Text, Besprechungsart)…" />
        {q && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setQ('')}><X size={13} /></button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className={`text-center text-gray-400 ${compact ? 'py-8' : 'py-12'}`}>
          <Info size={compact ? 24 : 32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm">Noch keine Punkte mit der Zuständigkeit „Info“.</p>
          <p className="text-xs mt-1">
            Punkte, die im Protokoll auf „Info“ gesetzt werden, sammeln sich hier – auch nach der Freimeldung.
          </p>
        </div>
      ) : (
        <>
          {/* Aus dem Protokoll entfallen (freigemeldet) – der eigentliche Zweck der Liste */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Freigemeldet – aus dem Protokoll entfallen ({closed.length})
            </p>
            {closed.length === 0 ? (
              <p className="text-xs text-gray-400 px-1">
                {query ? 'Keine Treffer.' : 'Noch keine freigemeldeten Info-Punkte.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {closed.map(r => <InfoRow key={r.item.id} row={r} onOpenProtocol={onOpenProtocol} />)}
              </div>
            )}
          </div>

          {/* Noch laufend – im Ausdruck immer sichtbar, am Bildschirm einklappbar */}
          {live.length > 0 && (
            <div>
              <button className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 no-print"
                onClick={() => setOpen(o => !o)}>
                {openLive ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Noch im Protokoll ({live.length})
              </button>
              <p className="hidden print:block text-xs font-semibold uppercase tracking-wide mb-1.5">
                Noch im Protokoll ({live.length})
              </p>
              <div className={`space-y-1.5 ${openLive ? '' : 'hidden print:block'}`}>
                {live.map(r => <InfoRow key={r.item.id} row={r} onOpenProtocol={onOpenProtocol} />)}
              </div>
            </div>
          )}

          {query && closed.length === 0 && live.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Keine Treffer für „{q}“.</p>
          )}
        </>
      )}
    </div>
  )
}
