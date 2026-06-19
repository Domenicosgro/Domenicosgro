import React, { useMemo, useState, useEffect } from 'react'
import { X, Mail, Copy, Check, Send, Calendar, LogIn, LogOut, AlertCircle, Loader } from 'lucide-react'
import { buildAgendaEmailBody, buildProtocolNo } from '../utils'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI
const hasGraph   = isElectron && !!window.electronAPI?.graphGetStatus

export default function AgendaEmailModal({ protocol, onClose, onSent }) {
  const [copied,        setCopied]        = useState(false)
  const [graphStatus,   setGraphStatus]   = useState(null)    // { configured, account }
  const [graphOp,       setGraphOp]       = useState(null)    // 'agenda' | 'event' | null
  const [graphLoading,  setGraphLoading]  = useState(false)
  const [graphError,    setGraphError]    = useState(null)
  const [graphSuccess,  setGraphSuccess]  = useState(null)

  // ── Besprechungstermin (immer vor Versand bestätigen / eingeben) ──────────
  const [meetingDate,     setMeetingDate]     = useState(protocol.date     ?? '')
  const [meetingTime,     setMeetingTime]     = useState(protocol.time     ?? '')
  const [meetingLocation, setMeetingLocation] = useState(protocol.location ?? '')

  // Alle E-Mail-Inhalte basieren auf den eingegebenen Terminwerten
  const effectiveProtocol = useMemo(() => ({
    ...protocol,
    date:     meetingDate,
    time:     meetingTime,
    location: meetingLocation,
  }), [protocol, meetingDate, meetingTime, meetingLocation])

  const recipients = useMemo(
    () => protocol.participants.filter(p => p.email).map(p => p.email),
    [protocol.participants]
  )

  const subject = useMemo(() => {
    const dateLabel = meetingDate
      ? new Date(meetingDate + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : ''
    return `Agenda: ${protocol.meetingType}${protocol.projectName ? ' – ' + protocol.projectName : ''}${dateLabel ? ' – ' + dateLabel : ''}`
  }, [protocol.meetingType, protocol.projectName, meetingDate])

  const body = useMemo(() => buildAgendaEmailBody(effectiveProtocol), [effectiveProtocol])

  // Load Graph status on mount
  useEffect(() => {
    if (!hasGraph) return
    window.electronAPI.graphGetStatus().then(setGraphStatus).catch(() => {})
  }, [])

  const noDate = !meetingDate

  const handleSend = async () => {
    const mailto =
      `mailto:${recipients.join(',')}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`
    if (isElectron) await window.electronAPI.openExternal(mailto)
    else window.location.href = mailto
    onSent()
    onClose()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Graph: send agenda email ──────────────────────────────────────────────
  const handleGraphSendAgenda = async () => {
    if (graphOp === 'agenda') {
      // Confirmed — send
      setGraphOp(null)
      setGraphLoading(true)
      setGraphError(null)
      try {
        const res = await window.electronAPI.graphSendAgenda({ to: recipients, subject, bodyText: body })
        if (!res.ok) throw new Error(res.error)
        setGraphSuccess('Agenda erfolgreich über Outlook versendet.')
        onSent()
      } catch (err) {
        setGraphError(err.message || 'Versand fehlgeschlagen.')
      } finally {
        setGraphLoading(false)
      }
    } else {
      setGraphOp('agenda')
      setGraphError(null)
      setGraphSuccess(null)
    }
  }

  // ── Graph: create calendar event ─────────────────────────────────────────
  const handleGraphCreateEvent = async () => {
    if (!protocol.nextMeeting) {
      setGraphError('Kein Folgetermin eingetragen. Bitte „Nächste Besprechung" im Protokoll ausfüllen.')
      return
    }
    if (graphOp === 'event') {
      // Confirmed — create
      setGraphOp(null)
      setGraphLoading(true)
      setGraphError(null)
      try {
        const date  = protocol.nextMeeting
        const time  = protocol.nextMeetingTime || '09:00'
        const start = `${date}T${time}:00`
        const endMs = new Date(`${date}T${time}:00`).getTime() + 60 * 60 * 1000
        const end   = new Date(endMs).toISOString().slice(0, 19)
        const res = await window.electronAPI.graphCreateEvent({
          subject:       `${protocol.meetingType}${protocol.projectName ? ' – ' + protocol.projectName : ''}`,
          startDateTime: start,
          endDateTime:   end,
          location:      protocol.location || undefined,
          bodyText:      body,
          attendees:     recipients,
        })
        if (!res.ok) throw new Error(res.error)
        setGraphSuccess('Termin wurde im Outlook-Kalender angelegt.')
      } catch (err) {
        setGraphError(err.message || 'Termin-Anlage fehlgeschlagen.')
      } finally {
        setGraphLoading(false)
      }
    } else {
      setGraphOp('event')
      setGraphError(null)
      setGraphSuccess(null)
    }
  }

  const handleGraphLogin = async () => {
    setGraphLoading(true)
    setGraphError(null)
    try {
      const res = await window.electronAPI.graphLogin()
      if (!res.ok) throw new Error(res.error)
      setGraphStatus(prev => ({ ...prev, account: res.account }))
    } catch (err) {
      setGraphError(err.message || 'Anmeldung fehlgeschlagen.')
    } finally {
      setGraphLoading(false)
    }
  }

  const handleGraphLogout = async () => {
    await window.electronAPI.graphLogout()
    setGraphStatus(prev => ({ ...prev, account: null }))
    setGraphOp(null)
    setGraphSuccess(null)
  }

  const noRecipients = recipients.length === 0
  const noItems      = protocol.agenda.length === 0
  const graphReady   = graphStatus?.configured && graphStatus?.account

  return (
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

          {/* Besprechungstermin — immer vor Versand ausfüllen */}
          <div className="bg-brand-50 border border-brand-200 px-4 py-3 space-y-3">
            <p className="text-xs font-semibold text-brand-700 flex items-center gap-1.5">
              <Calendar size={13} /> Besprechungstermin (wird in E-Mail übernommen)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Datum <span className="text-red-400">*</span></label>
                <input
                  type="date"
                  className="input"
                  value={meetingDate}
                  onChange={e => setMeetingDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Uhrzeit</label>
                <input
                  type="time"
                  className="input"
                  value={meetingTime}
                  onChange={e => setMeetingTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ort</label>
              <input
                type="text"
                className="input"
                placeholder="Ort der Besprechung …"
                value={meetingLocation}
                onChange={e => setMeetingLocation(e.target.value)}
              />
            </div>
          </div>

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
                : recipients.map(r => <span key={r} className="badge-blue font-mono text-xs">{r}</span>)
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
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto max-h-48 select-all">
              {body}
            </pre>
          </div>

          {/* ── Graph integration (Electron only) ── */}
          {hasGraph && graphStatus && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Microsoft Outlook / Graph
                </p>
                {graphStatus.account ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{graphStatus.account.displayName}</span>
                    <button className="btn-ghost p-1 text-gray-400 hover:text-red-500 text-xs flex items-center gap-1"
                      onClick={handleGraphLogout} title="Abmelden">
                      <LogOut size={12} />
                    </button>
                  </div>
                ) : (
                  <button className="btn-secondary text-xs flex items-center gap-1" onClick={handleGraphLogin} disabled={graphLoading}>
                    {graphLoading ? <Loader size={12} className="animate-spin" /> : <LogIn size={12} />}
                    Mit Microsoft anmelden
                  </button>
                )}
              </div>

              {!graphStatus.configured && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
                  Graph nicht konfiguriert. Bitte <code>GRAPH_CLIENT_ID</code> einrichten (siehe README).
                </p>
              )}

              {graphStatus.configured && !graphStatus.account && !graphLoading && (
                <p className="text-xs text-gray-400">Anmelden, um Agenda direkt über Outlook zu senden oder Termine anzulegen.</p>
              )}

              {graphReady && (
                <div className="flex flex-wrap gap-2">
                  {/* Send agenda */}
                  {graphOp === 'agenda' ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-600">
                        Senden an: {recipients.length > 0 ? recipients.join(', ') : '(keine Empfänger)'}
                      </span>
                      <button className="btn-primary text-xs" onClick={handleGraphSendAgenda} disabled={graphLoading || noRecipients || noDate}>
                        {graphLoading ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
                        Jetzt senden
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => setGraphOp(null)}>Abbrechen</button>
                    </div>
                  ) : (
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={handleGraphSendAgenda}
                      disabled={graphLoading || noRecipients || noDate}>
                      <Send size={12} /> Via Outlook senden
                    </button>
                  )}

                  {/* Create calendar event */}
                  {graphOp === 'event' ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-600">
                        Termin: {protocol.nextMeeting} {protocol.nextMeetingTime}{protocol.location ? ` · ${protocol.location}` : ''}
                        {recipients.length > 0 && ` · ${recipients.length} Eingeladen`}
                      </span>
                      <button className="btn-primary text-xs" onClick={handleGraphCreateEvent} disabled={graphLoading}>
                        {graphLoading ? <Loader size={12} className="animate-spin" /> : <Calendar size={12} />}
                        Termin anlegen
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => setGraphOp(null)}>Abbrechen</button>
                    </div>
                  ) : (
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={handleGraphCreateEvent}
                      disabled={graphLoading || !protocol.nextMeeting}>
                      <Calendar size={12} /> Termin anlegen
                    </button>
                  )}
                </div>
              )}

              {graphError && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Fehler</p>
                    <p>{graphError}</p>
                    <button className="mt-1 underline text-red-600 hover:text-red-800" onClick={handleSend}>
                      Stattdessen E-Mail-Programm öffnen
                    </button>
                  </div>
                </div>
              )}

              {graphSuccess && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 flex items-center gap-2">
                  <Check size={13} /> {graphSuccess}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
          <button className="btn-secondary text-xs" onClick={handleCopy} disabled={noDate}>
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copied ? 'Kopiert!' : 'Text kopieren'}
          </button>
          <div className="flex items-center gap-3">
            {noDate && (
              <span className="text-xs text-red-500">Bitte Datum eintragen</span>
            )}
            <button className="btn-secondary" onClick={onClose}>Schließen</button>
            <button className="btn-primary" onClick={handleSend} disabled={noDate}>
              <Mail size={14} /> E-Mail-Programm öffnen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
