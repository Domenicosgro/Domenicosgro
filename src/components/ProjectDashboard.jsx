import React, { useState } from 'react'
import { ArrowLeft, FileText, Users, Plus, Trash2, ExternalLink, X, FolderOpen, BarChart2 } from 'lucide-react'
import { HOAI_PHASEN, emptyHoaiService, uid } from '../utils'

// ── Projektstatus-Modal ───────────────────────────────────────────────────────
function ProjektstatusModal({ service, onSetPhase, onSetActivePhase, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-concrete">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-sky" />
            <h3 className="font-semibold text-night">Projektstatus – Leistungsphasen</h3>
          </div>
          <button className="btn-ghost p-1" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="px-5 py-2 divide-y divide-concrete/60">
          {[1,2,3,4,5,6,7,8,9].map(lph => {
            const val      = service.phases?.[lph] ?? 0
            const isActive = service.activePhase === lph
            return (
              <div key={lph} className={`flex items-center gap-3 py-2.5 ${isActive ? 'bg-sky/5' : ''}`}>
                <button
                  className={`flex-shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${
                    isActive ? 'bg-sky border-sky' : 'border-gray-300 hover:border-sky'
                  }`}
                  title={isActive ? 'Aktive Phase' : 'Als aktive Phase markieren'}
                  onClick={() => onSetActivePhase(lph)}
                />
                <span
                  className={`text-xs flex-shrink-0 ${isActive ? 'font-semibold text-night' : 'text-gray-500'}`}
                  style={{ minWidth: '11rem' }}
                >
                  LPH {lph} · {HOAI_PHASEN[lph]}
                </span>
                <input
                  type="range" min={0} max={100} step={5} value={val}
                  className="flex-1 h-1.5 accent-sky"
                  onChange={e => onSetPhase(lph, Number(e.target.value))}
                />
                <span className={`text-xs w-9 text-right flex-shrink-0 tabular-nums font-semibold ${
                  val === 100 ? 'text-green-600' : isActive ? 'text-night' : 'text-gray-400'
                }`}>
                  {val}%
                </span>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-concrete flex justify-end">
          <button className="btn-primary text-sm" onClick={onClose}>Fertig</button>
        </div>
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function ProjectDashboard({ project, protocols, onBack, onOpenProtocols, onManageContacts, onUpdate }) {
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showFolderForm,  setShowFolderForm]  = useState(false)
  const [folderLabel,     setFolderLabel]     = useState('')
  const [folderUrl,       setFolderUrl]       = useState('')

  const services      = project.hoaiServices ?? []
  const linkedFolders = project.linkedFolders ?? []
  const protos        = protocols.filter(p => p.projectId === project.id)
  const openProtos    = protos.filter(p => !p.isClosed).length

  // Gebäude-Service – wird beim ersten Öffnen des Modals automatisch angelegt
  const gebaeude = services.find(s => s.type === 'gebaeude') ?? null

  const openStatusModal = () => {
    if (!gebaeude) {
      onUpdate(project.id, { hoaiServices: [...services, emptyHoaiService('gebaeude')] })
    }
    setShowStatusModal(true)
  }

  const setPhase = (lph, value) => {
    const svc  = (project.hoaiServices ?? []).find(s => s.type === 'gebaeude')
    if (!svc) return
    const next = (project.hoaiServices ?? []).map(s =>
      s.type !== 'gebaeude' ? s : { ...s, phases: { ...s.phases, [lph]: value } }
    )
    onUpdate(project.id, { hoaiServices: next })
  }

  const setActivePhase = (lph) => {
    const next = (project.hoaiServices ?? []).map(s =>
      s.type !== 'gebaeude' ? s : { ...s, activePhase: lph }
    )
    onUpdate(project.id, { hoaiServices: next })
  }

  // ── Folder handlers ───────────────────────────────────────────────────────
  const addFolder = () => {
    if (!folderLabel.trim() || !folderUrl.trim()) return
    const next = [...linkedFolders, { id: uid(), label: folderLabel.trim(), url: folderUrl.trim() }]
    onUpdate(project.id, { linkedFolders: next })
    setFolderLabel(''); setFolderUrl(''); setShowFolderForm(false)
  }

  const removeFolder = (id) => {
    onUpdate(project.id, { linkedFolders: linkedFolders.filter(f => f.id !== id) })
  }

  // Aktive LPH-Kurzinfo für den Button
  const activeLph      = gebaeude?.activePhase ?? null
  const activeProgress = activeLph ? (gebaeude?.phases?.[activeLph] ?? 0) : null

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
        <div className="flex gap-2 self-start flex-shrink-0 flex-wrap">
          <button className="btn-secondary" onClick={openStatusModal}>
            <BarChart2 size={15} />
            Projektstatus
            {activeLph && (
              <span className="text-sky font-semibold text-xs">
                LPH {activeLph} · {activeProgress}%
              </span>
            )}
          </button>
          <button className="btn-secondary" onClick={onManageContacts}>
            <Users size={15} /> Kontakte
          </button>
          <button className="btn-primary" onClick={onOpenProtocols}>
            <FileText size={15} /> Protokolle
          </button>
        </div>
      </div>

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
        </p>

        {linkedFolders.length === 0 && !showFolderForm && (
          <div className="text-center py-6 text-gray-400">
            <FolderOpen size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Noch keine Ordner verknüpft.</p>
          </div>
        )}

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
                type="text" className="input"
                placeholder="z. B. Pläne, Ausschreibung, Fotos…"
                value={folderLabel}
                onChange={e => setFolderLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL / Link</label>
              <input
                type="url" className="input"
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

      {/* Modal */}
      {showStatusModal && (
        <ProjektstatusModal
          service={
            (project.hoaiServices ?? []).find(s => s.type === 'gebaeude') ??
            emptyHoaiService('gebaeude')
          }
          onSetPhase={setPhase}
          onSetActivePhase={setActivePhase}
          onClose={() => setShowStatusModal(false)}
        />
      )}
    </div>
  )
}
