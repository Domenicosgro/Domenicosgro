import React from 'react'
import { FileText } from 'lucide-react'

export default function NotesSection({ notes, onChange }) {
  return (
    <div className="card p-6 space-y-3">
      <h2 className="section-title"><FileText size={16} /> Allgemeine Bemerkungen / Verteiler</h2>
      <textarea
        className="textarea"
        rows={4}
        placeholder="Allgemeine Anmerkungen, Verteilliste, nächste Schritte..."
        value={notes}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
