import React from 'react'
import { FileText } from 'lucide-react'

export default function NotesSection({ notes, onChange, readOnly }) {
  return (
    <div className="space-y-3">
      <h2 className="section-title"><FileText size={16} /> Allgemeine Bemerkungen / Verteiler</h2>
      {readOnly
        ? <p className="text-sm text-gray-700 whitespace-pre-line">{notes || '–'}</p>
        : <textarea
            className="textarea"
            rows={4}
            placeholder="Allgemeine Anmerkungen, Verteilliste, nächste Schritte..."
            value={notes}
            onChange={e => onChange(e.target.value)}
          />
      }
    </div>
  )
}
