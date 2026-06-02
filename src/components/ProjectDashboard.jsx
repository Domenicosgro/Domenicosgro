import React from 'react'
import { ArrowLeft, FileText, Users } from 'lucide-react'

export default function ProjectDashboard({ project, protocols, onBack, onOpenProtocols, onManageContacts }) {
  const protos     = protocols.filter(p => p.projectId === project.id)
  const openProtos = protos.filter(p => !p.isClosed).length

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

    </div>
  )
}
