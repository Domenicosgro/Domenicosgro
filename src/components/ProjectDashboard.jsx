import React, { useState } from 'react'
import { ArrowLeft, FileText, Users, Plus, Trash2, ExternalLink, ChevronDown, X, FolderOpen } from 'lucide-react'
import { HOAI_LEISTUNGSBILDER, HOAI_PHASEN, emptyHoaiService, uid, formatDate } from '../utils'

export default function ProjectDashboard({ project, protocols, onBack, onOpenProtocols, onManageContacts, onUpdate }) {
  const [showAddService,  setShowAddService]  = useState(false)
  const [showFolderForm,  setShowFolderForm]  = useState(false)
  const [folderLabel,     setFolderLabel]     = useState('')
  const [folderUrl,       setFolderUrl]       = useState('')

  const services      = project.hoaiServices ?? []
  const linkedFolders = project.linkedFolders ?? []
  const protos        = protocols.filter(p => p.projectId === project.id)
  const openProtos    = protos.filter(p => !p.isClosed).length

  // ── HOAI handlers ─────────────────────────────────────────────────────────────

  const addService = (type) => {
    const already = services.some(s => s.type === type)
    if (already) return
    const next = [...services, emptyHoaiService(type)]
    onUpdate(project.id, { hoaiServices: next })
    setShowAddService(false)
  }

  const removeService = (id) => {
    onUpdate(project.id, { hoaiServices: services.filter(s => s.id !== id) })
  }

  const setPhase = (serviceId, lph, value) => {
    const next = services.map(s =>
      s.id !== serviceId ? s : {
        ...s,
        phases: { ...s.phases, [lph]: Number(value) },
      }
    )
    onUpdate(project.id, { hoaiServices: next })
  }

  const setActivePhase = (serviceId, lph) => {
    const next = services.map(s =>
      s.id !== serviceId ? s : { ...s, activePhase: lph }
    )
    onUpdate(project.id, { hoaiServices: next })
  }

  // ── Folder handlers ───────────────────────────────────────────────────────────

  const addFolder = () => {
    if (!folderLabel.trim() || !folderUrl.trim()) return
    const next = [...linkedFolders, { id: uid(), label: folderLabel.trim(), url: folderUrl.trim() }]
    onUpdate(project.id, { linkedFolders: next })
    setFolderLabel('')
    setFolderUrl('')
    setShowFolderForm(false)
  }

  const removeFolder = (id) => {
    onUpdate(project.id, { linkedFolders: linkedFolders.filter(f => f.id !== id) })
  }

  const availableToAdd = HOAI_LEISTUNGSBILDER.filter(lb => !services.some(s => s.type === lb.type))

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button className="btn-secondary mt-0.5" onClick={onBack}>
            <ArrowLeft size={16} /> Projekte
          </button>
          <div>
            <h1 className="text-2xl font-bold text-night">{project.name || 'Unbenanntes Projekt'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
              {openProtos > 0 && ` · ${openProtos} offen`}
              {(project.contacts ?? []).length > 0 && ` · ${(project.contacts ?? []).length} Kontakte`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 self-start flex-shrink-0">
          <button className="btn-secondary" onClick={onManageContacts}>
            <Users size={15} /> Kontakte
          </button>
          <button className="btn-primary" onClick={onOpenProtocols}>
            <FileText size={15} /> Protokolle
          </button>
        </div>
      </div>

      {/* ── HOAI Leistungsbilder ────────────────────────────────────────────── */}
      <section className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title">HOAI-Leistungsbilder</h2>
          {availableToAdd.length > 0 && (
            <div className="relative">
              <button
                className="btn-secondary text-xs"
                onClick={() => setShowAddService(v => !v)}
              >
                <Plus size={13} /> Leistungsbild
                <ChevronDown size={12} />
              </button>
              {showAddService && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-concrete rounded shadow-lg min-w-[220px]">
                  {availableToAdd.map(lb => (
                    <button
                      key={lb.type}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-concrete transition-colors"
                      onClick={() => addService(lb.type)}
                    >
                      {lb.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {services.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">Noch kein Leistungsbild hinterlegt.</p>
            <p className="text-xs mt-1">Füge ein HOAI-Leistungsbild hinzu, um den Planungsfortschritt zu erfassen.</p>
          </div>
        )}

        {services.map(svc => (
          <div key={svc.id} className="border border-concrete rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-concrete/60">
              <span className="font-semibold text-night text-sm">{svc.label}</span>
              <button
                className="btn-ghost p-1.5 text-gray-400 hover:text-red-500"
                title="Leistungsbild entfernen"
                onClick={() => removeService(svc.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div className="divide-y divide-concrete">
              {[1,2,3,4,5,6,7,8,9].map(lph => {
                const val        = svc.phases?.[lph] ?? 0
                const isActive   = svc.activePhase === lph
                return (
                  <div
                    key={lph}
                    className={`flex items-center gap-3 px-4 py-2 ${isActive ? 'bg-sky/10' : ''}`}
                  >
                    <button
                      className={`flex-shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${
                        isActive ? 'bg-sky border-sky' : 'border-concrete hover:border-sky'
                      }`}
                      title={isActive ? 'Aktive Phase' : 'Als aktive Phase markieren'}
                      onClick={() => setActivePhase(svc.id, lph)}
                    />
                    <span className={`text-xs w-28 flex-shrink-0 ${isActive ? 'font-semibold text-night' : 'text-gray-500'}`}>
                      LPH {lph} · {HOAI_PHASEN[lph]}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={val}
                      className="flex-1 h-1.5 accent-sky"
                      onChange={e => setPhase(svc.id, lph, e.target.value)}
                    />
                    <span className={`text-xs w-9 text-right flex-shrink-0 tabular-nums ${val === 100 ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>
                      {val}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ── Verknüpfte Ordner ───────────────────────────────────────────────── */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Verknüpfte Ordner</h2>
          {!showFolderForm && (
            <button className="btn-secondary text-xs" onClick={() => setShowFolderForm(true)}>
              <Plus size={13} /> Ordner verknüpfen
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Freigabe-Link aus Synology Drive / File Station kopieren (https://…). Der Link öffnet im Browser.
          Windows-Netzwerkpfade (\\server\...) werden vom Browser blockiert.
        </p>

        {linkedFolders.length === 0 && !showFolderForm && (
          <div className="text-center py-6 text-gray-400">
            <FolderOpen size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Noch keine Ordner verknüpft.</p>
          </div>
        )}

        {/* Folder list */}
        <div className="space-y-2">
          {linkedFolders.map(f => (
            <div key={f.id} className="flex items-center gap-3 p-2.5 bg-concrete/40 rounded">
              <FolderOpen size={14} className="text-sky flex-shrink-0" />
              <span className="text-sm font-medium text-night flex-1 truncate">{f.label}</span>
              <a
                href={f.url}
                target="_blank"
                rel="noopener"
                className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink size={11} /> Öffnen
              </a>
              <button
                className="btn-ghost p-1.5 text-gray-400 hover:text-red-500"
                onClick={() => removeFolder(f.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Add folder form */}
        {showFolderForm && (
          <div className="border border-concrete rounded-lg p-4 space-y-3 bg-concrete/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-night uppercase tracking-wide">Ordner verknüpfen</span>
              <button className="btn-ghost p-1" onClick={() => { setShowFolderForm(false); setFolderLabel(''); setFolderUrl('') }}>
                <X size={14} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bezeichnung</label>
              <input
                type="text"
                className="input"
                placeholder="z. B. Pläne, Ausschreibung, Fotos…"
                value={folderLabel}
                onChange={e => setFolderLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL / Link</label>
              <input
                type="url"
                className="input"
                placeholder="https://nas.../sharing/..."
                value={folderUrl}
                onChange={e => setFolderUrl(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-xs" onClick={() => { setShowFolderForm(false); setFolderLabel(''); setFolderUrl('') }}>
                Abbrechen
              </button>
              <button
                className="btn-primary text-xs"
                disabled={!folderLabel.trim() || !folderUrl.trim()}
                onClick={addFolder}
              >
                <Plus size={12} /> Hinzufügen
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
