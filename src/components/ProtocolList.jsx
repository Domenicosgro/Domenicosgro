import React, { useState } from 'react'
import { Plus, Trash2, Copy, FileText, Search, ChevronRight } from 'lucide-react'
import { formatDate } from '../utils'

export default function ProtocolList({ protocols, onCreate, onOpen, onDelete, onDuplicate }) {
  const [search, setSearch] = useState('')

  const filtered = protocols.filter(p => {
    const q = search.toLowerCase()
    return (
      p.projectName.toLowerCase().includes(q) ||
      p.meetingType.toLowerCase().includes(q) ||
      p.protocolNo.toLowerCase().includes(q)
    )
  })

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Besprechungs&shy;protokolle</h1>
          <p className="text-sm text-gray-500 mt-0.5">Baubesprechungen &amp; Jour Fixe</p>
        </div>
        <button className="btn-primary self-start sm:self-auto" onClick={onCreate}>
          <Plus size={16} /> Neues Protokoll
        </button>
      </div>

      {/* Search */}
      {protocols.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Protokolle durchsuchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Empty state */}
      {protocols.length === 0 && (
        <div className="card p-12 text-center">
          <FileText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Noch keine Protokolle vorhanden</p>
          <p className="text-sm text-gray-400 mt-1">Erstelle dein erstes Protokoll mit dem Button oben.</p>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {filtered.map(p => {
          const openActions = p.actionItems.filter(a => a.status === 'offen' || a.status === 'in_arbeit').length
          return (
            <div
              key={p.id}
              className="card p-4 flex items-center gap-4 hover:border-brand-500 cursor-pointer transition-colors group"
              onClick={() => onOpen(p.id)}
            >
              <div className="w-2 h-12 rounded-full bg-brand-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 truncate">
                    {p.projectName || 'Ohne Projektnamen'}
                  </span>
                  <span className="badge-blue">{p.meetingType}</span>
                  {p.protocolNo && <span className="text-xs text-gray-400">#{p.protocolNo}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{formatDate(p.date)}</span>
                  {p.location && <span>· {p.location}</span>}
                  {p.participants.length > 0 && (
                    <span>· {p.participants.filter(pt => pt.present).length} Teilnehmer</span>
                  )}
                  {openActions > 0 && (
                    <span className="badge-yellow">{openActions} offene Maßnahmen</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 no-print" onClick={e => e.stopPropagation()}>
                <button
                  className="btn-ghost p-2 text-gray-400"
                  title="Duplizieren"
                  onClick={() => onDuplicate(p.id)}
                >
                  <Copy size={14} />
                </button>
                <button
                  className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                  title="Löschen"
                  onClick={() => {
                    if (confirm('Protokoll wirklich löschen?')) onDelete(p.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors flex-shrink-0" />
            </div>
          )
        })}
        {filtered.length === 0 && protocols.length > 0 && (
          <p className="text-sm text-gray-400 text-center py-6">Keine Protokolle gefunden.</p>
        )}
      </div>
    </div>
  )
}
