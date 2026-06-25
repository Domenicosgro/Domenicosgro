import React from 'react'
import { FileText } from 'lucide-react'
import RichTextEditor, { stripHtml } from './RichTextEditor'

export default function NotesSection({ notes, onChange, readOnly }) {
  return (
    <div className="space-y-3">
      <h2 className="section-title"><FileText size={16} /> Allgemeine Bemerkungen / Verteiler</h2>
      {readOnly
        ? <div
            className="text-sm text-gray-700 rich-text"
            dangerouslySetInnerHTML={{ __html: notes || '' }}
          />
        : <RichTextEditor
            value={notes}
            placeholder="Allgemeine Anmerkungen, Verteilliste, nächste Schritte…"
            onChange={onChange}
            allowImages
          />
      }
    </div>
  )
}
