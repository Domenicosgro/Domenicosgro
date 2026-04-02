import React, { useState } from 'react'
import { Plus, Trash2, Search, ChevronRight, FileText, Users, FolderOpen, Calendar } from 'lucide-react'
import { formatDate } from '../utils'

export default function ProjectsHome({ projects, protocols, onCreate, onUpdate, onDelete, onOpenProject }) {
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()

  const filtered = projects.filter(p =>
    !q || (p.name || '').toLowerCase().includes(q)
  )

  // Protocols not assigned to any project
  const unassigned = protocols.filter(p => !p.projectId)

  const protocolsFor = (projectId) => protocols.filter(p => p.projectId === projectId)

  const lastDate = (protos) => {
    if (!protos.length) return null
    return protos.map(p => p.date).sort().reverse()[0]
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Komplizen Protokolle</h1>
          <p className="text-sm text-gray-500 mt-0.5">Projekte &amp; Besprechungsprotokolle</p>
        </div>
        <button className="btn-primary self-start sm:self-auto" onClick={onCreate}>
          <Plus size={16} /> Neues Projekt
        </button>
      </div>

      {/* Search */}
      {projects.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Projekte durchsuchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Empty state */}
      {projects.length === 0 && unassigned.length === 0 && (
        <div className="card p-16 text-center">
          <FolderOpen size={44} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium text-lg">Noch keine Projekte vorhanden</p>
          <p className="text-sm text-gray-400 mt-1">Lege ein Projekt an – danach kannst du Protokolle erstellen und zuordnen.</p>
          <button className="btn-primary mt-5" onClick={onCreate}>
            <Plus size={15} /> Erstes Projekt anlegen
          </button>
        </div>
      )}

      {/* Project cards */}
      <div className="space-y-3">
        {filtered.map(project => {
          const protos  = protocolsFor(project.id)
          const last    = lastDate(protos)
          const open    = protos.filter(p => !p.isClosed).length
          const closed  = protos.filter(p => p.isClosed).length

          return (
            <div
              key={project.id}
              className="card p-0 overflow-hidden hover:border-brand-400 transition-colors cursor-pointer group"
              onClick={() => onOpenProject(project.id)}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Color bar */}
                <div className="w-1.5 self-stretch rounded-full bg-brand-500 flex-shrink-0" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* Editable project name */}
                  <input
                    className="font-semibold text-base text-gray-900 bg-transparent border-none outline-none w-full focus:bg-white focus:border focus:border-brand-300 focus:rounded px-1 -ml-1"
                    value={project.name}
                    placeholder="Projektname…"
                    onClick={e => e.stopPropagation()}
                    onChange={e => onUpdate(project.id, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <FileText size={11} />
                      {protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
                      {open > 0 && <span className="badge-yellow ml-1">{open} offen</span>}
                      {closed > 0 && <span className="badge-gray ml-1">{closed} abgeschlossen</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={11} />
                      {(project.contacts ?? []).length} Kontakt{(project.contacts ?? []).length !== 1 ? 'e' : ''}
                    </span>
                    {last && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        Zuletzt: {formatDate(last)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 no-print" onClick={e => e.stopPropagation()}>
                  <button
                    className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                    title="Projekt löschen"
                    onClick={() => {
                      const n = protos.length
                      const msg = n > 0
                        ? `Projekt "${project.name || 'Unbenannt'}" löschen?\n${n} Protokoll${n !== 1 ? 'e werden' : ' wird'} nicht gelöscht, aber dem Projekt abgelegt.`
                        : `Projekt "${project.name || 'Unbenannt'}" löschen?`
                      if (confirm(msg)) onDelete(project.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors flex-shrink-0" />
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && projects.length > 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Kein Projekt gefunden.</p>
        )}
      </div>

      {/* Unassigned protocols */}
      {unassigned.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Protokolle ohne Projekt ({unassigned.length})
          </h2>
          <div
            className="card p-4 flex items-center gap-3 hover:border-brand-400 cursor-pointer transition-colors group"
            onClick={() => onOpenProject(null)}
          >
            <div className="w-1.5 self-stretch rounded-full bg-gray-300 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-gray-700">Nicht zugeordnete Protokolle</p>
              <p className="text-xs text-gray-400 mt-0.5">{unassigned.length} Protokoll{unassigned.length !== 1 ? 'e' : ''}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors" />
          </div>
        </div>
      )}
    </div>
  )
}
