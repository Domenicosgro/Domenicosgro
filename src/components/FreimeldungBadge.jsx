import React, { useState } from 'react'
import { BadgeCheck, Clock, X, Check, XCircle, Paperclip, Download, History, Loader } from 'lucide-react'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function authHeaders() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function fmtDateTime(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

const EVENT_LABELS = {
  freimeldung_beantragt: 'Freimeldung beantragt',
  genehmigt:             'Genehmigt',
  abgelehnt:             'Abgelehnt',
}

// Lädt einen Anhang über die Attachment-API und stößt den Download an.
async function downloadAttachment(att) {
  try {
    const res = await fetch(`/api/attachments/${att.id}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Download fehlgeschlagen')
    const { data } = await res.json()
    const bin = atob(data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: att.mimeType || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = att.name || 'anhang'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { alert(e.message) }
}

function ReleaseModal({ item, protocolId, canManage, onClose }) {
  const req     = item.releaseRequest || null
  const history = Array.isArray(item.releaseHistory) ? item.releaseHistory : []
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [showReject, setShowReject] = useState(false)
  const [note,   setNote]   = useState('')

  const call = async (action, body = {}) => {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/actions/${protocolId}/${item.id}/${action}`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Fehler') }
      onClose()   // SSE aktualisiert den State
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <BadgeCheck size={18} className="text-amber-600" />
            <h3 className="font-semibold text-gray-900">Freimeldung</h3>
          </div>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Aufgabe</p>
            <p className="font-medium text-gray-800">{item.no ? `${item.no}. ` : ''}{item.description || '–'}</p>
          </div>

          {req && (
            <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 p-3 space-y-1.5">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">Antrag offen</p>
              <p className="text-gray-700"><span className="text-gray-500">Von:</span> {req.requestedBy}</p>
              <p className="text-gray-700"><span className="text-gray-500">Am:</span> {fmtDateTime(req.requestedAt)}</p>
              <p className="text-gray-700"><span className="text-gray-500">Begründung:</span> {req.basis || '–'}</p>
              {Array.isArray(req.attachments) && req.attachments.length > 0 && (
                <div className="pt-1">
                  <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Paperclip size={12} /> Anlagen</p>
                  <div className="space-y-1">
                    {req.attachments.map(att => (
                      <button key={att.id} onClick={() => downloadAttachment(att)}
                        className="flex items-center gap-1.5 text-brand-700 hover:text-brand-900 text-xs">
                        <Download size={12} /> {att.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Historie */}
          {history.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1"><History size={12} /> Verlauf</p>
              <ol className="space-y-2 border-l-2 border-gray-200 pl-3">
                {history.slice().reverse().map(h => (
                  <li key={h.id} className="relative">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge text-xs ${h.event === 'genehmigt' ? 'badge-green' : h.event === 'abgelehnt' ? 'badge-red' : 'badge-yellow'}`}>
                        {EVENT_LABELS[h.event] || h.event}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDateTime(h.at)}</span>
                      <span className="text-xs text-gray-500">· {h.actor}</span>
                    </div>
                    {h.note && <p className="text-xs text-gray-600 mt-0.5">{h.note}</p>}
                    {Array.isArray(h.attachments) && h.attachments.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {h.attachments.map(att => (
                          <button key={att.id} onClick={() => downloadAttachment(att)}
                            className="flex items-center gap-1 text-brand-700 hover:text-brand-900 text-xs">
                            <Download size={11} /> {att.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5">{error}</p>}

          {showReject && (
            <textarea
              className="input text-sm w-full"
              rows={2}
              placeholder="Grund der Ablehnung (optional)…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          )}
        </div>

        {canManage && req && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
            {!showReject ? (
              <>
                <button className="btn-secondary text-sm" disabled={busy} onClick={() => setShowReject(true)}>
                  <XCircle size={14} /> Ablehnen
                </button>
                <button className="btn-primary text-sm" disabled={busy} onClick={() => call('approve')}>
                  {busy ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Genehmigen
                </button>
              </>
            ) : (
              <>
                <button className="btn-ghost text-sm" disabled={busy} onClick={() => setShowReject(false)}>Zurück</button>
                <button className="btn-danger text-sm" disabled={busy} onClick={() => call('reject', { note })}>
                  {busy ? <Loader size={14} className="animate-spin" /> : <XCircle size={14} />} Ablehnung bestätigen
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Hinweis-Badge für eine Aufgabe. Zeigt nur etwas an, wenn eine Freimeldung
// aussteht oder bereits eine Historie existiert. Klick öffnet das Detail-Modal.
export default function FreimeldungBadge({ item, protocolId, canManage = false, className = '' }) {
  const [open, setOpen] = useState(false)
  if (!isServer || !item) return null

  const req     = item.releaseRequest || null
  const history = Array.isArray(item.releaseHistory) ? item.releaseHistory : []
  if (!req && history.length === 0) return null

  const lastEvent = history.length ? history[history.length - 1].event : null

  let label, color, Icon
  if (req) {
    label = 'Freimeldung angefordert'; color = 'bg-amber-100 text-amber-800 border border-amber-300'; Icon = Clock
  } else if (lastEvent === 'genehmigt') {
    label = 'Freigemeldet'; color = 'bg-green-100 text-green-700 border border-green-300'; Icon = BadgeCheck
  } else if (lastEvent === 'abgelehnt') {
    label = 'Freimeldung abgelehnt'; color = 'bg-gray-100 text-gray-600 border border-gray-300'; Icon = XCircle
  } else {
    label = 'Freimeldung'; color = 'bg-gray-100 text-gray-600 border border-gray-300'; Icon = History
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${color} ${className}`}
        title="Freimeldung anzeigen"
      >
        <Icon size={12} /> {label}
      </button>
      {open && (
        <ReleaseModal item={item} protocolId={protocolId} canManage={canManage} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
