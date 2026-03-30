import React, { useMemo, useState } from 'react'
import { X, Mail, Copy, Check } from 'lucide-react'
import { buildAgendaEmailBody, buildProtocolNo } from '../utils'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export default function AgendaEmailModal({ protocol, onClose, onSent }) {
  const [copied, setCopied] = useState(false)

  const recipients = useMemo(
    () => protocol.participants.filter(p => p.email).map(p => p.email),
    [protocol.participants]
  )

  const subject = useMemo(
    () => `Agenda: ${protocol.meetingType}${protocol.projectName ? ' – ' + protocol.projectName : ''} – ${
      protocol.date
        ? new Date(protocol.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : ''
    }`,
    [protocol]
  )

  const body = useMemo(() => buildAgendaEmailBody(protocol), [protocol])

  const handleSend = async () => {
    const mailto =
      `mailto:${recipients.join(',')}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`

    if (isElectron) {
      await window.electronAPI.openExternal(mailto)
    } else {
      window.location.href = mailto
    }
    onSent()
    onClose()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const noRecipients = recipients.length === 0
  const noItems      = protocol.agenda.length === 0

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-brand-600" />
            <h2 className="font-semibold text-gray-900">Agenda versenden</h2>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Warnings */}
          {noItems && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
              Es sind noch keine Agendapunkte erfasst.
            </div>
          )}
          {noRecipients && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
              Kein Teilnehmer hat eine E-Mail-Adresse hinterlegt. Die E-Mail wird ohne Empfänger geöffnet.
            </div>
          )}

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Empfänger</label>
            <div className="flex flex-wrap gap-2">
              {recipients.length === 0
                ? <span className="text-sm text-gray-400 italic">–</span>
                : recipients.map(r => (
                    <span key={r} className="badge-blue font-mono text-xs">{r}</span>
                  ))
              }
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Betreff</label>
            <div className="input bg-gray-50 text-sm font-medium text-gray-700 select-all">{subject}</div>
          </div>

          {/* Body preview */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Nachrichtentext (Vorschau)</label>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto max-h-64 select-all">
              {body}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
          <button className="btn-secondary text-xs" onClick={handleCopy}>
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copied ? 'Kopiert!' : 'Text kopieren'}
          </button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
            <button className="btn-primary" onClick={handleSend}>
              <Mail size={14} /> E-Mail-Programm öffnen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
