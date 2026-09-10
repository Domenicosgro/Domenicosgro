import React, { useMemo, useState } from 'react'
import { X, Mail, Send, Check, Loader, UserPlus, Users, FileText, Lock } from 'lucide-react'
import { formatDate } from '../utils'
import { useContactUsage } from '../contactUsage'

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('kp_session_token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ── Baudokumentation per E-Mail ──────────────────────────────────────────────
// Empfängerbasis ist die Projektdatenbank: die Kontakte des Projekts, ergänzt
// um den Projektverteiler (Kanal „Baudoku“), der die Vorauswahl bestimmt.
// Freie Adressen bleiben möglich und lassen sich als Projektkontakt sichern.
// Das PDF entsteht aus derselben Druckansicht wie beim Drucken.
// Auswahl der Berichte: entries = [{ id, date, daytime, closed, sentAt, photos, summary }],
// neueste zuerst. Vorausgewählt sind die noch nicht versendeten Berichte –
// so geht bei regelmäßigem Versand genau das raus, was seit dem letzten Mal
// dazugekommen ist. Sind alle bereits versendet, ist der neueste vorbelegt.
export default function DiaryEmailModal({
  project, entries = [],
  projectContacts = [], distribution = [], buildPdf, onSaveContact, onClose, onSent,
}) {
  const { scoreOf, record } = useContactUsage()

  const [selected, setSelected] = useState(() => {
    const unsent = entries.filter(e => !e.sentAt).map(e => e.id)
    return new Set(unsent.length ? unsent : entries.slice(0, 1).map(e => e.id))
  })
  const toggleEntry = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const chosen      = entries.filter(e => selected.has(e.id))
  // Reihenfolge wie in der Ansicht (neueste zuerst) → Zeitraum aus letztem/erstem
  const periodFrom  = chosen.length ? formatDate(chosen[chosen.length - 1].date) : ''
  const periodTo    = chosen.length ? formatDate(chosen[0].date) : ''
  const entryCount  = chosen.length
  const photoCount  = chosen.reduce((n, e) => n + (e.photos || 0), 0)

  const distEmailSet = useMemo(
    () => new Set((distribution ?? []).map(d => (d.email || '').toLowerCase()).filter(Boolean)),
    [distribution])

  // Projektkontakte mit E-Mail – meistgenutzte zuerst (wie in den übrigen Dialogen)
  const contactCandidates = useMemo(() => {
    const seen = new Set()
    return (projectContacts ?? [])
      .filter(c => {
        const e = (c.email || '').toLowerCase()
        if (!e || seen.has(e)) return false
        seen.add(e); return true
      })
      .sort((a, b) => scoreOf(b) - scoreOf(a)
        || (a.name || a.company || '').localeCompare(b.name || b.company || '', 'de'))
  }, [projectContacts, scoreOf])

  // Verteiler-Empfänger, die kein Projektkontakt sind
  const distOnly = useMemo(() => {
    const known = new Set(contactCandidates.map(c => (c.email || '').toLowerCase()))
    const seen = new Set()
    return (distribution ?? []).filter(d => {
      const e = (d.email || '').toLowerCase()
      if (!e || known.has(e) || seen.has(e)) return false
      seen.add(e); return true
    })
  }, [distribution, contactCandidates])

  // Vorauswahl: alle Empfänger des Verteilerkanals „Baudoku“
  const [recipients, setRecipients] = useState(() => [...new Set([
    ...contactCandidates.filter(c => distEmailSet.has((c.email || '').toLowerCase())).map(c => c.email),
    ...(distribution ?? []).map(d => d.email),
  ].filter(Boolean))])

  const [customEmail, setCustomEmail] = useState('')
  const [subject, setSubject] = useState(() => {
    const first = entries.filter(e => !e.sentAt)
    const to = (first.length ? first : entries.slice(0, 1))[0]
    return `Baudokumentation – ${project.name || 'Projekt'}${to ? ` – Stand ${formatDate(to.date)}` : ''}`
  })
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const toggle = (email) =>
    setRecipients(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])

  const addCustom = () => {
    const e = customEmail.trim()
    if (e && e.includes('@') && !recipients.includes(e)) {
      setRecipients(prev => [...prev, e])
      setCustomEmail('')
    }
  }

  const allTo = [...new Set(recipients)]

  // Gewählte Adressen, die noch kein Projektkontakt sind → zum Speichern anbieten
  const knownEmails = useMemo(
    () => new Set((projectContacts ?? []).filter(c => c.email).map(c => c.email.trim().toLowerCase())),
    [projectContacts])
  const [savedEmails, setSavedEmails] = useState(() => new Set())
  const unknownRecipients = allTo.filter(e =>
    !knownEmails.has(e.toLowerCase()) && !savedEmails.has(e.toLowerCase()))

  const saveAsContact = (email) => {
    onSaveContact?.({ email })
    setSavedEmails(prev => new Set(prev).add(email.toLowerCase()))
  }

  const handleSend = async () => {
    if (allTo.length === 0) { setError('Bitte mindestens einen Empfänger auswählen.'); return }
    if (chosen.length === 0) { setError('Bitte mindestens einen Bericht auswählen.'); return }
    setSending(true); setError('')
    try {
      const ids = chosen.map(e => e.id)
      const pdfBase64 = await buildPdf(ids)
      const pdfMB = (pdfBase64.length * 3 / 4 / 1048576).toFixed(1)
      const res = await fetch(`/api/projects/${project.id}/diary/send-email`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({
          to: allTo, subject, message: message.trim() || undefined,
          pdfBase64,
          // Leerzeichen vermeiden – sonst faltet der Mailversand den Dateinamen um
          pdfFilename: `Baudokumentation_${(project.name || 'Projekt').replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_')}.pdf`,
          entryCount, periodFrom, periodTo,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      // Nutzungshäufigkeit der gewählten Kontakte fortschreiben
      for (const c of contactCandidates) if (allTo.includes(c.email)) record(c)
      setSent(true)
      onSent?.(pdfMB, ids, allTo)
      setTimeout(onClose, 1200)
    } catch (e) {
      setError(e.message)
    } finally { setSending(false) }
  }

  const Row = ({ email, label, hint }) => (
    <label className="flex items-start gap-2 py-1 cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={recipients.includes(email)} onChange={() => toggle(email)} />
      <span className="min-w-0">
        <span className="block text-sm text-gray-900 truncate">{label}</span>
        <span className="block text-xs text-gray-400 truncate">{hint}</span>
      </span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print">
      <div className="card w-full max-w-lg bg-white flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-night flex items-center gap-2">
            <Mail size={17} className="text-brand-600" /> Baudokumentation senden
          </h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Welche Berichte gehen raus? */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
              <FileText size={12} /> Berichte
              <span className="text-gray-400 font-normal">· {chosen.length} von {entries.length} ausgewählt</span>
              <span className="ml-auto flex gap-2 font-normal">
                <button className="text-brand-600 hover:underline" onClick={() => setSelected(new Set(entries.map(e => e.id)))}>alle</button>
                <button className="text-brand-600 hover:underline" onClick={() => setSelected(new Set(entries.filter(e => !e.sentAt).map(e => e.id)))}>nur ungesendete</button>
              </span>
            </p>
            <div className="border border-gray-200 divide-y divide-gray-100 max-h-44 overflow-y-auto px-3">
              {entries.map(e => (
                <label key={e.id} className="flex items-start gap-2 py-1.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={selected.has(e.id)} onChange={() => toggleEntry(e.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-900">
                      {formatDate(e.date)}
                      <span className="text-gray-500 font-normal"> · {e.daytime === 'nachmittag' ? 'Nachmittag' : 'Vormittag'}</span>
                      {e.closed && <Lock size={10} className="inline ml-1.5 text-green-700 align-middle" />}
                      {e.sentAt && <span className="badge badge-gray ml-1.5 text-[10px] align-middle">gesendet {formatDate(e.sentAt.slice(0, 10))}</span>}
                    </span>
                    <span className="block text-xs text-gray-400 truncate">
                      {[e.summary, e.photos ? `${e.photos} Foto${e.photos === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || '–'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Betreff</label>
            <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nachricht (optional)</label>
            <textarea className="input resize-y" rows={2} value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Ergänzender Hinweis für die Empfänger…" />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
              <Users size={12} /> Empfänger aus der Projektdatenbank
              <span className="text-gray-400 font-normal">
                · {allTo.length} ausgewählt
              </span>
            </p>
            <div className="border border-gray-200 divide-y divide-gray-100 max-h-52 overflow-y-auto px-3">
              {contactCandidates.length === 0 && distOnly.length === 0 && (
                <p className="text-xs text-gray-400 py-3">
                  Keine Kontakte mit E-Mail-Adresse im Projekt hinterlegt.
                </p>
              )}
              {contactCandidates.map(c => (
                <Row key={c.id || c.email} email={c.email}
                  label={c.name || c.company || c.email}
                  hint={[c.company && c.name ? c.company : null, c.gewerk || c.role, c.email,
                         distEmailSet.has((c.email || '').toLowerCase()) ? 'im Verteiler' : null]
                        .filter(Boolean).join(' · ')} />
              ))}
              {distOnly.map(d => (
                <Row key={d.id || d.email} email={d.email}
                  label={d.name || d.email} hint={`${d.email} · Verteiler`} />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Weitere Adresse</label>
            <div className="flex gap-2">
              <input className="input" type="email" value={customEmail} placeholder="name@firma.de"
                onChange={e => setCustomEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
              <button className="btn-secondary flex-shrink-0" onClick={addCustom}>Hinzufügen</button>
            </div>
            {allTo.filter(e => !contactCandidates.some(c => c.email === e) && !distOnly.some(d => d.email === e)).map(e => (
              <span key={e} className="inline-flex items-center gap-1 mt-1.5 mr-1.5 text-xs bg-brand-50 border border-brand-200 px-2 py-0.5">
                {e}
                <button className="text-brand-400 hover:text-brand-700" onClick={() => toggle(e)}><X size={11} /></button>
              </span>
            ))}
          </div>

          {unknownRecipients.length > 0 && onSaveContact && (
            <div className="bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs text-amber-800 mb-1">
                Noch nicht in der Projektdatenbank:
              </p>
              {unknownRecipients.map(e => (
                <button key={e} className="text-xs text-brand-700 hover:text-brand-900 flex items-center gap-1"
                  onClick={() => saveAsContact(e)}>
                  <UserPlus size={11} /> „{e}“ als Projektkontakt speichern
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2">
            Die gewählten Berichte werden als eine PDF-Anlage versendet – identisch zum Ausdruck.
            {entryCount > 0 ? ` ${entryCount} Bericht${entryCount === 1 ? '' : 'e'}${periodFrom && periodFrom !== periodTo ? ` (${periodFrom} – ${periodTo})` : periodTo ? ` (${periodTo})` : ''}, ${photoCount} Foto${photoCount === 1 ? '' : 's'}.` : ''}
            {' '}Die Fotos werden für den Versand so verkleinert, dass der Anhang unter 3 MB bleibt.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending || sent || allTo.length === 0 || chosen.length === 0}>
            {sent ? <><Check size={15} /> Gesendet</>
              : sending ? <><Loader size={15} className="animate-spin" /> Wird gesendet…</>
              : <><Send size={15} /> Senden ({allTo.length})</>}
          </button>
        </div>
      </div>
    </div>
  )
}
