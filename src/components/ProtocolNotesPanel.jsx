import React, { useState } from 'react'
import { StickyNote, X, Plus, Trash2, Check, ChevronRight } from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import { NOTE_TYPES, formatDate } from '../utils'

/**
 * Seitliches Notiz-Panel im Protokoll-Editor. Unabhängig vom Protokoll,
 * erstellt Notizen mit Bezug auf den Protokolltitel, die in der
 * Notizenkachel (Projekt-Notizen) gespeichert werden.
 */
export default function ProtocolNotesPanel({
  protocol, protocolRef, projectId, notes = [], onCreateNote, onDeleteNote,
}) {
  const [open,    setOpen]    = useState(false)
  const [type,    setType]    = useState('aktennotiz')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [saved,   setSaved]   = useState(false)

  // Notizen, die aus diesem Protokoll erstellt wurden
  const linked = notes
    .filter(n => n.protocolId === protocol.id)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  const save = () => {
    if (!onCreateNote) return
    if (!subject.trim() && !content.trim()) return
    onCreateNote({
      projectId: projectId ?? null,
      protocolId: protocol.id,
      protocolRef: protocolRef || '',
      type,
      subject: subject.trim() || (NOTE_TYPES.find(t => t.value === type)?.label || 'Notiz'),
      content,
    })
    setSubject(''); setContent('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!projectId) return null   // Notizen sind projektbezogen

  return (
    <>
      {/* Seitlicher Aufklapp-Reiter */}
      {!open && (
        <button
          className="fixed right-0 top-1/3 z-30 flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-2.5 py-3 rounded-l-lg shadow-lg no-print"
          style={{ writingMode: 'vertical-rl' }}
          onClick={() => setOpen(true)}
          title="Notizen zum Protokoll"
        >
          <StickyNote size={15} /> Notizen
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 no-print" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white border-l border-gray-200 shadow-2xl flex flex-col no-print">
            {/* Kopf */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                  <StickyNote size={16} className="text-brand-600" /> Notizen
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Bezug: <span className="font-medium text-gray-600">{protocolRef || protocol.meetingType || 'Protokoll'}</span>
                </p>
              </div>
              <button className="btn-ghost p-1" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Neue Notiz */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select className="select text-sm py-1" value={type} onChange={e => setType(e.target.value)}>
                    {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input className="input text-sm py-1 flex-1" placeholder="Betreff (optional)…"
                    value={subject} onChange={e => setSubject(e.target.value)} />
                </div>
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Notiz erfassen… (unabhängig vom Protokoll)"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">Wird in der Notizenkachel des Projekts gespeichert.</span>
                  <button className="btn-primary text-sm py-1" onClick={save} disabled={!subject.trim() && !content.trim()}>
                    {saved ? <Check size={14} /> : <Plus size={14} />} {saved ? 'Gespeichert' : 'Notiz speichern'}
                  </button>
                </div>
              </div>

              {/* Bereits erfasste Notizen zu diesem Protokoll */}
              {linked.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Aus diesem Protokoll ({linked.length})
                  </p>
                  <div className="space-y-2">
                    {linked.map(n => (
                      <div key={n.id} className="border border-gray-100 p-2.5 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {n.subject || (NOTE_TYPES.find(t => t.value === n.type)?.label || 'Notiz')}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {NOTE_TYPES.find(t => t.value === n.type)?.label || n.type}
                              {n.date ? ` · ${formatDate(n.date)}` : ''}
                            </p>
                          </div>
                          {onDeleteNote && (
                            <button className="btn-ghost p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Notiz löschen"
                              onClick={() => { if (confirm('Notiz löschen?')) onDeleteNote(n.id) }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                    <ChevronRight size={11} /> Vollständig sichtbar in der Notizenkachel des Projekts.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
