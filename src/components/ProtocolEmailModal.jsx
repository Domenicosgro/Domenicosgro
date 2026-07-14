import React, { useState, useMemo } from 'react'
import { X, Mail, Send, Check, Loader, Calendar, Paperclip, Info, ClipboardCheck } from 'lucide-react'
import { formatDate } from '../utils'
import { buildProtocolPdf } from '../protocolPdf'

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('kp_session_token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// Versendet das Protokoll als PDF-Anhang (Server-Modus).
// mode='send'     → reguläres Protokoll (nächster Termin, Aufgabenhinweis)
// mode='freigabe' → Protokoll vorab zur Freigabe, Rückmeldung erbeten
// Der E-Mail-Text wird serverseitig aus den Protokolldaten + Vorlage erzeugt.
export default function ProtocolEmailModal({ protocol, protocolNo, logoDataUrl, clientLogoDataUrl, projectContacts = [], mode = 'send', buildPdf, onClose, onSent }) {
  const isReview = mode === 'freigabe'

  // Teilnehmer der Besprechung – bei Freigabe immer im Verteiler vorbelegt
  const recipientCandidates = useMemo(
    () => (protocol.participants ?? []).filter(p => p.email),
    [protocol.participants]
  )
  // Weitere wählbare Empfänger aus den Projektkontakten (nicht schon Teilnehmer)
  const contactCandidates = useMemo(() => {
    const known = new Set(recipientCandidates.map(p => (p.email || '').toLowerCase()))
    return (projectContacts ?? [])
      .filter(c => c.email && !known.has(c.email.toLowerCase()))
  }, [projectContacts, recipientCandidates])

  const participantsWithoutEmail = (protocol.participants ?? []).filter(p => !p.email)

  // Vorauswahl: Freigabe → nur Anwesende (Teilnehmer der Besprechung);
  //             Versand   → alle Eingeladenen mit E-Mail.
  const [recipients,  setRecipients]  = useState(() =>
    recipientCandidates.filter(p => (isReview ? p.present : true)).map(p => p.email))
  const [customEmail, setCustomEmail] = useState('')
  const [subject,     setSubject]     = useState(
    isReview ? `Protokoll zur Freigabe: ${protocolNo}` : `Protokoll: ${protocolNo}`)
  const [deadline,    setDeadline]    = useState('')
  const [sending,     setSending]     = useState(false)
  const [sent,        setSent]        = useState(false)
  const [error,       setError]       = useState('')

  const toggle = (email) =>
    setRecipients(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])

  const addCustom = () => {
    const e = customEmail.trim()
    if (e && e.includes('@') && !recipients.includes(e)) {
      setRecipients(prev => [...prev, e])
      setCustomEmail('')
    }
  }

  const allTo      = [...new Set(recipients)]
  const hasActions = (protocol.actionItems ?? []).length > 0

  const handleSend = async () => {
    if (allTo.length === 0) { setError('Bitte mindestens einen Empfänger angeben.'); return }
    setSending(true); setError('')
    try {
      const pdfBase64   = buildPdf
        ? await buildPdf()   // serverseitiges Chrome-PDF – identisch zum Druck
        : await buildProtocolPdf(protocol, protocolNo, logoDataUrl, clientLogoDataUrl)
      const pdfFilename = `${protocolNo.replace(/[/\\:*?"<>|]/g, '-')}.pdf`

      const res = await fetch(`/api/protocols/${protocol.id}/send-email`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ to: allTo.join(', '), subject, pdfBase64, pdfFilename, mode, deadline: deadline || undefined }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Fehler beim Senden.'); return }
      setSent(true)
      onSent?.()
      setTimeout(onClose, 1500)
    } catch (e) {
      setError('Versand fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print">
      <div className="bg-white w-full max-w-lg border border-gray-200 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            {isReview
              ? <><ClipboardCheck size={16} className="text-brand-600" /> Protokoll zur Freigabe versenden</>
              : <><Mail size={16} className="text-brand-600" /> Protokoll versenden</>}
          </h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Hinweis: was passiert */}
          {isReview ? (
            <div className="bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 space-y-1.5">
              <p className="flex items-center gap-1.5"><ClipboardCheck size={12} /> Das Protokoll wird <strong>vorab zur Freigabe</strong> als PDF-Anhang versendet.</p>
              <p className="flex items-center gap-1.5"><Info size={12} /> Die Empfänger werden um <strong>Rückmeldung / Anmerkungen per E-Mail-Antwort</strong> gebeten.</p>
              <p className="flex items-center gap-1.5"><Paperclip size={12} /> Antworten gehen an Ihre E-Mail-Adresse (Reply-To).</p>
            </div>
          ) : (
            <div className="bg-brand-50 border border-brand-100 px-3 py-2.5 text-xs text-brand-800 space-y-1.5">
              <p className="flex items-center gap-1.5"><Paperclip size={12} /> Das Protokoll wird als <strong>PDF-Anhang</strong> versendet.</p>
              {protocol.nextMeeting && (
                <p className="flex items-center gap-1.5">
                  <Calendar size={12} /> Nächste Besprechung: <strong>{formatDate(protocol.nextMeeting)}{protocol.nextMeetingTime ? `, ${protocol.nextMeetingTime} Uhr` : ''}</strong> wird im Text genannt.
                </p>
              )}
              {hasActions && (
                <p className="flex items-center gap-1.5"><Info size={12} /> Hinweis: Die resultierenden Aufgaben werden separat versendet.</p>
              )}
            </div>
          )}

          {/* Betreff + optionale Frist (nur Freigabe) */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-gray-700 block mb-1">Betreff</label>
              <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            {isReview && (
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Rückmeldung bis (optional)</label>
                <input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} />
              </div>
            )}
          </div>

          {/* Teilnehmer mit E-Mail */}
          {recipientCandidates.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">
                Empfänger (Teilnehmer der Besprechung)
                <span className="text-amber-600 font-normal ml-1">
                  – {isReview ? 'Anwesende vorausgewählt' : 'alle Eingeladenen vorausgewählt'}
                </span>
              </p>
              <div className="border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {recipientCandidates.map(p => (
                  <label key={p.id || p.email} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-brand-600 flex-shrink-0"
                      checked={recipients.includes(p.email)}
                      onChange={() => toggle(p.email)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900">{p.name || p.company || p.email}</span>
                      {!p.present && <span className="badge-gray text-[10px] ml-1.5">entschuldigt</span>}
                      <span className="text-xs text-gray-400 ml-1.5">{p.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {participantsWithoutEmail.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5">
              Ohne E-Mail-Adresse (nicht erreichbar): {participantsWithoutEmail.map(p => p.name || p.company).filter(Boolean).join(', ')}
            </p>
          )}

          {/* Weitere Empfänger aus den Projektkontakten */}
          {contactCandidates.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Weitere Projektkontakte</p>
              <div className="border border-gray-200 divide-y divide-gray-100 max-h-36 overflow-y-auto">
                {contactCandidates.map(c => (
                  <label key={c.id || c.email} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-brand-600 flex-shrink-0"
                      checked={recipients.includes(c.email)}
                      onChange={() => toggle(c.email)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900">{c.name || c.company || c.email}</span>
                      {c.company && c.name && <span className="text-xs text-gray-400 ml-1.5">{c.company}</span>}
                      <span className="text-xs text-gray-400 ml-1.5">{c.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Weitere Empfänger (frei) */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Weitere Empfänger</p>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                placeholder="E-Mail-Adresse"
                value={customEmail}
                onChange={e => setCustomEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
              />
              <button className="btn-secondary text-xs px-3" onClick={addCustom}>Hinzufügen</button>
            </div>
          </div>

          {allTo.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700">
              <strong>An:</strong> {allTo.join(', ')}
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
          {sent  && <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 flex items-center gap-1"><Check size={13} /> Gesendet!</p>}
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-200">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex items-center gap-2" onClick={handleSend} disabled={sending || sent}>
            {sending ? <Loader size={14} className="animate-spin" /> : isReview ? <ClipboardCheck size={14} /> : <Send size={14} />}
            {isReview ? 'Zur Freigabe senden' : 'Senden'}
          </button>
        </div>
      </div>
    </div>
  )
}
