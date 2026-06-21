import React, { useState, useRef } from 'react'
import { Plus, Trash2, Copy, FileText, Search, ChevronRight, Upload, Lock, ArrowLeft, Users, RotateCcw, Download } from 'lucide-react'
import { formatDate, buildProtocolNo, getChainNo, phaseBadge, PHASES } from '../utils'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export default function ProtocolList({
  protocols, allProtocols, project, phaseFilter, onCreate, onOpen, onDelete, onDuplicate,
  onImport, onOpenImported, onBack, onManageContacts, onRefresh,
}) {
  const pool = allProtocols ?? protocols  // fall back to current list if not provided
  const fileInputRef = useRef(null)
  const [search,      setSearch]      = useState('')
  const [filterType,  setFilterType]  = useState('')
  const [importError, setImportError] = useState('')

  // Apply phase filter from parent (e.g. coming from ProjectDashboard tile)
  const phaseFiltered = phaseFilter !== undefined && phaseFilter !== null
    ? protocols.filter(p => p.phase === phaseFilter)
    : protocols

  const handleExportProject = () => {
    if (!project) return
    const { isUnlocked, ...projectData } = project
    const exportData = {
      exportVersion: 1,
      exportType: 'project',
      exportedAt: new Date().toISOString(),
      project: {
        ...projectData,
        isEncrypted: false,
        encryptedContacts: null,
        cryptoSalt: null,
        cryptoIv: null,
        passwordHash: null,
      },
      protocols,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${(project.name || 'projekt').replace(/[^a-zA-Z0-9_\-]/g, '_')}_export.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Unique meeting types present in this project's protocols
  const meetingTypes = [...new Set(protocols.map(p => p.meetingType).filter(Boolean))].sort()

  const handleImportClick = async () => {
    setImportError('')
    if (isElectron) {
      const data = await window.electronAPI.importJSON()
      if (!data) return
      const id = onImport(data)
      if (id) onOpenImported(id)
      else setImportError('Ungültige Protokolldatei.')
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        const id = onImport(data)
        if (id) onOpenImported(id)
        else setImportError('Ungültige Protokolldatei.')
      } catch { setImportError('Datei konnte nicht gelesen werden.') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const q = search.toLowerCase()
  const filtered = phaseFiltered.filter(p => {
    if (filterType && p.meetingType !== filterType) return false
    if (!q) return true
    const no = buildProtocolNo(p.projectName, p.date, getChainNo(p, pool), p.meetingType)
    return (
      p.projectName.toLowerCase().includes(q) ||
      p.meetingType.toLowerCase().includes(q) ||
      no.toLowerCase().includes(q)
    )
  })

  const phaseInfo = phaseFilter ? phaseBadge(phaseFilter) : null
  const title     = project ? project.name || 'Unbenanntes Projekt' : 'Protokolle ohne Projekt'
  const contacts  = project?.contacts ?? []

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-stretch justify-between gap-4">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> {project ? 'Projekt' : 'Projekte'}
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {title}
              {phaseInfo && (
                <span className={`text-sm font-medium px-2 py-0.5 border ${phaseInfo.color}`}>{phaseInfo.label}</span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {phaseFiltered.length} Protokoll{phaseFiltered.length !== 1 ? 'e' : ''}
              {contacts.length > 0 && ` · ${contacts.length} Kontakte`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-stretch">
          <button className="btn-ghost p-2 text-gray-400" title="Daten aktualisieren" onClick={onRefresh}>
            <RotateCcw size={15} />
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
          {project && contacts.length >= 0 && (
            <button className="btn-secondary" onClick={onManageContacts} title="Projektkontakte verwalten">
              <Users size={16} /> Kontakte
            </button>
          )}
          {project && (
            <button className="btn-secondary" onClick={handleExportProject} title="Gesamtes Projekt exportieren (JSON)">
              <Download size={16} /> Export
            </button>
          )}
          <button className="btn-secondary" onClick={handleImportClick} title="JSON-Protokoll importieren">
            <Upload size={16} /> Importieren
          </button>
          <button className="btn-primary" onClick={onCreate}>
            <Plus size={16} /> Neues Protokoll
          </button>
        </div>
      </div>

      {/* Import error */}
      {importError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{importError}</p>
      )}

      {/* Search + type filter */}
      {protocols.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Protokolle durchsuchen…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {meetingTypes.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 shrink-0">Besprechungsart:</span>
              {meetingTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(filterType === type ? '' : type)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filterType === type
                      ? 'bg-night text-light border-night'
                      : 'bg-white text-brand-600 border-concrete hover:border-sky hover:text-brand-600'
                  }`}
                >
                  {type}
                </button>
              ))}
              {filterType && (
                <button
                  onClick={() => setFilterType('')}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Alle anzeigen
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {protocols.length === 0 && (
        <div className="card p-12 text-center">
          <FileText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Noch keine Protokolle vorhanden</p>
          <p className="text-sm text-gray-400 mt-1">Erstelle das erste Protokoll für dieses Projekt.</p>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {filtered.map(p => {
          const openActions = (p.actionItems ?? []).filter(a => a.status === 'offen' || a.status === 'in_arbeit').length
          const no = buildProtocolNo(p.projectName, p.date, getChainNo(p, pool), p.meetingType)
          return (
            <div
              key={p.id}
              className="card p-4 flex items-center gap-4 hover:border-sky cursor-pointer transition-colors group"
              onClick={() => onOpen(p.id)}
            >
              <div className="w-2 h-12 rounded bg-night flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 truncate">{formatDate(p.date)}</span>
                  {p.meetingType && <span className="badge-blue">{p.meetingType}</span>}
                  {p.phase && (() => { const ph = phaseBadge(p.phase); return ph ? <span className={`text-xs px-1.5 py-0.5 border ${ph.color}`}>{ph.label}</span> : null })()}
                  {p.isClosed && (
                    <span className="badge-gray flex items-center gap-1"><Lock size={10} /> Abgeschlossen</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span className="font-mono text-gray-400">{no}</span>
                  {p.location && <span>· {p.location}</span>}
                  {(p.participants ?? []).length > 0 && (
                    <span>· {p.participants.filter(pt => pt.present).length} Teilnehmer</span>
                  )}
                  {openActions > 0 && (
                    <span className="badge-yellow">{openActions} offene Maßnahmen</span>
                  )}
                  {p.updatedBy && (
                    <span className="text-gray-400">· bearb. von <span className="font-medium text-gray-500">{p.updatedBy}</span></span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 no-print" onClick={e => e.stopPropagation()}>
                <button className="btn-ghost p-2 text-gray-400" title="Duplizieren" onClick={() => onDuplicate(p.id)}>
                  <Copy size={14} />
                </button>
                <button
                  className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                  title="Löschen"
                  onClick={() => { if (confirm('Protokoll wirklich löschen?')) onDelete(p.id) }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <ChevronRight size={16} className="text-concrete group-hover:text-sky transition-colors flex-shrink-0" />
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
