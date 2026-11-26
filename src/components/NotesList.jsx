import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowLeft, Plus, Trash2, Send, Mail, Phone, ChevronDown, Printer,
         FileText, Phone as PhoneIcon, Users, Search, X, Check, Loader,
         LayoutTemplate, Save, AlertCircle } from 'lucide-react'
import { formatDate, NOTE_TYPES, NOTE_TEMPLATES, emptyNote, uid,
         applyNoteTemplate, noteToTemplate } from '../utils'
import RichTextEditor from './RichTextEditor'
import NoteTasks from './NoteTasks'
import { buildNotePdf } from '../notePdf'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('kp_session_token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Notiz-Druck (Design wie Protokoll) ──────────────────────────────────────────
function buildNotePrintHtml(note, contact, projectName, logoDataUrl, clientLogoDataUrl) {
  const typeInfo = NOTE_TYPES.find(t => t.value === note.type) ?? NOTE_TYPES[0]
  const today    = new Date().toISOString().slice(0, 10)

  const officeImg = logoDataUrl
    ? `<img src="${logoDataUrl}" style="height:40px;max-width:120px;object-fit:contain;display:block;">`
    : ''
  const clientImg = clientLogoDataUrl
    ? `<img src="${clientLogoDataUrl}" style="height:40px;max-width:120px;object-fit:contain;display:block;">`
    : ''
  const logoHtml = (officeImg || clientImg)
    ? `<div style="display:flex;align-items:flex-end;gap:14px;">${officeImg}${clientImg}</div>`
    : '<div style="height:40px"></div>'

  // Metadaten-Zeilen (nur befüllte anzeigen)
  const metaRows = []
  metaRows.push(['Datum', `${formatDate(note.date)}${note.time ? `, ${esc(note.time)} Uhr` : ''}`])
  if (projectName)      metaRows.push(['Projekt', esc(projectName)])
  if (contact) {
    const label = note.type === 'telefonnotiz' ? 'Gesprächspartner' : 'Kontakt'
    const parts = [contact.name, contact.company].filter(Boolean).map(esc).join(' · ')
    metaRows.push([label, parts || '–'])
    if (contact.phone) metaRows.push(['Telefon', esc(contact.phone)])
    if (contact.email) metaRows.push(['E-Mail', esc(contact.email)])
  }
  const participants = note.participants ?? []
  if (participants.length > 0) {
    const names = participants.map(p => {
      const base = [p.name, p.company].filter(Boolean).map(esc).join(', ')
      return base || esc(p.email || '')
    }).filter(Boolean).join(' · ')
    metaRows.push(['Teilnehmer', names])
  }

  const metaHtml = metaRows.map(([k, v]) => `
    <tr>
      <td style="padding:1mm 6mm 1mm 0;font-size:7pt;text-transform:uppercase;letter-spacing:.05em;color:#777;white-space:nowrap;vertical-align:top;width:30mm;">${k}</td>
      <td style="padding:1mm 0;font-size:9pt;color:#000;vertical-align:top;">${v}</td>
    </tr>`).join('')

  // Notizinhalt ist bereits HTML (RichTextEditor) → direkt einbetten
  const contentHtml = note.content && stripHtml(note.content)
    ? note.content
    : '<p style="color:#aaa;font-style:italic;">Kein Inhalt.</p>'

  // Aufgaben: im Ausdruck eine Tabelle wie im Protokoll. Ohne Aufgaben fehlt
  // der Abschnitt ganz – eine leere Tabelle sagt nichts.
  const STATUS_TEXT = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }
  const tasks = (note.actionItems ?? []).filter(a => (a.description || '').trim())
  const tasksHtml = tasks.length === 0 ? '' : `
    <div style="margin-top:6mm;">
      <p style="font-size:7pt;text-transform:uppercase;letter-spacing:.05em;color:#777;margin:0 0 2mm;">Aufgaben</p>
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        <tr>
          <th style="text-align:left;padding:1.5mm 2mm 1.5mm 0;border-bottom:1px solid #000;width:8mm;">Nr.</th>
          <th style="text-align:left;padding:1.5mm 2mm;border-bottom:1px solid #000;">Aufgabe</th>
          <th style="text-align:left;padding:1.5mm 2mm;border-bottom:1px solid #000;width:38mm;">Zuständig</th>
          <th style="text-align:left;padding:1.5mm 2mm;border-bottom:1px solid #000;width:22mm;">Frist</th>
          <th style="text-align:left;padding:1.5mm 0 1.5mm 2mm;border-bottom:1px solid #000;width:22mm;">Status</th>
        </tr>
        ${tasks.map(a => `
        <tr>
          <td style="padding:1.5mm 2mm 1.5mm 0;border-bottom:1px solid #e5e5e5;vertical-align:top;color:#777;">${esc(String(a.no || ''))}</td>
          <td style="padding:1.5mm 2mm;border-bottom:1px solid #e5e5e5;vertical-align:top;">${esc(a.description)}</td>
          <td style="padding:1.5mm 2mm;border-bottom:1px solid #e5e5e5;vertical-align:top;">${esc(a.responsible || '–')}</td>
          <td style="padding:1.5mm 2mm;border-bottom:1px solid #e5e5e5;vertical-align:top;">${a.deadline ? formatDate(a.deadline) : '–'}</td>
          <td style="padding:1.5mm 0 1.5mm 2mm;border-bottom:1px solid #e5e5e5;vertical-align:top;">${esc(STATUS_TEXT[a.status] || a.status || '')}</td>
        </tr>`).join('')}
      </table>
    </div>`

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<title>${esc(typeInfo.label)} – ${esc(note.subject || projectName || '')}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; background: #fff; line-height: 1.5; }
  p { margin: 0 0 2mm; }
  ul, ol { margin: 0 0 2mm; padding-left: 6mm; }
  strong { font-weight: bold; }
</style></head><body>
<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1pt solid #000;padding-bottom:4mm;margin-bottom:6mm;">
  <div>${logoHtml}</div>
  <div style="text-align:right;line-height:1.4;">
    <div style="font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:#555;">${esc(typeInfo.label)}</div>
    <div style="font-size:15pt;font-weight:bold;">${esc(note.subject || typeInfo.label)}</div>
    <div style="font-size:7pt;color:#555;">${esc(projectName || '')}${projectName ? ' · ' : ''}Stand: ${formatDate(today)}</div>
  </div>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:6mm;">${metaHtml}</table>

<div style="border-top:0.5pt solid #ccc;padding-top:4mm;">
  <div style="font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;color:#777;margin-bottom:2mm;">Inhalt</div>
  ${contentHtml}
</div>
${tasksHtml}
</body></html>`
}

function printNote(note, contact, projectName, logoDataUrl, clientLogoDataUrl) {
  const html   = buildNotePrintHtml(note, contact, projectName, logoDataUrl, clientLogoDataUrl)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open(); doc.write(html); doc.close()

  const doPrint = () => {
    iframe.style.visibility = 'visible'
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe)
    }, 2000)
  }

  const img = doc.querySelector('img')
  if (img && !img.complete) { img.onload = doPrint; img.onerror = doPrint }
  else { setTimeout(doPrint, 150) }
}

const TYPE_ICONS = {
  aktennotiz:   <FileText size={13} />,
  telefonnotiz: <PhoneIcon size={13} />,
  besprochen:   <Users size={13} />,
}

// ── Email Modal ───────────────────────────────────────────────────────────────
function NoteEmailModal({ note, contacts, allContacts, projectName, logoDataUrl, clientLogoDataUrl, onClose }) {
  // Teilnehmer mit E-Mail vorab auswählen
  const participantEmails = (note.participants ?? []).map(p => p.email).filter(Boolean)
  const [recipients,   setRecipients]   = useState(() => [...new Set(participantEmails)])
  const [customEmail,  setCustomEmail]  = useState('')
  const [dbSearch,     setDbSearch]     = useState('')
  const [subject,      setSubject]      = useState(`${NOTE_TYPES.find(t => t.value === note.type)?.label || 'Notiz'} – ${note.subject || 'Ohne Betreff'}`)
  const [sending,      setSending]      = useState(false)
  const [sent,         setSent]         = useState(false)
  const [error,        setError]        = useState('')

  const contactsWithEmail = contacts.filter(c => c.email)
  const linkedContact     = contacts.find(c => c.id === note.linkedContactId) ?? null

  // Kontaktdatenbank (projektübergreifend) – nur mit E-Mail, gefiltert per Suche
  const dbContacts = useMemo(() => {
    const q = dbSearch.trim().toLowerCase()
    const projectEmails = new Set(contactsWithEmail.map(c => (c.email || '').toLowerCase()))
    return (allContacts ?? [])
      .filter(c => c.email && !projectEmails.has(c.email.toLowerCase()))
      .filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [allContacts, contactsWithEmail, dbSearch])

  const toggleContact = (email) =>
    setRecipients(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])

  const addCustom = () => {
    const e = customEmail.trim()
    if (e && e.includes('@') && !recipients.includes(e)) {
      setRecipients(prev => [...prev, e])
      setCustomEmail('')
    }
  }

  const allTo = [...new Set(recipients)]

  const handleSend = async () => {
    if (allTo.length === 0) { setError('Bitte mindestens einen Empfänger angeben.'); return }
    setSending(true); setError('')

    if (isServer) {
      try {
        let pdfBase64 = null
        let pdfFilename = null
        try {
          pdfBase64  = await buildNotePdf(note, linkedContact, projectName, logoDataUrl, clientLogoDataUrl)
          const typeLabel = NOTE_TYPES.find(t => t.value === note.type)?.label || 'Notiz'
          const safeName  = (note.subject || typeLabel).replace(/[^a-zA-Z0-9äöüÄÖÜß _\-]/g, '').trim().slice(0, 60)
          pdfFilename = `${typeLabel}_${safeName || 'Notiz'}${note.date ? '_' + note.date : ''}.pdf`
        } catch {}

        const res = await fetch(`/api/notes/${note.id}/send-email`, {
          method: 'POST', headers: apiHeaders(),
          body: JSON.stringify({ to: allTo.join(', '), subject, pdfBase64, pdfFilename }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error || 'Fehler beim Senden.'); return }
        setSent(true)
        setTimeout(onClose, 1500)
      } catch { setError('Netzwerkfehler.') }
      finally { setSending(false) }
    } else {
      // Local mode: open mailto
      const body = stripHtml(note.content)
      const mailto = `mailto:${allTo.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      window.open(mailto)
      setSending(false)
      setSent(true)
      setTimeout(onClose, 1000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-md border border-gray-200 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Mail size={16} className="text-brand-600" /> Notiz per E-Mail senden
          </h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Betreff */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Betreff</label>
            <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          {/* Kontakte mit E-Mail */}
          {contactsWithEmail.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Empfänger (Projektkontakte)</p>
              <div className="border border-gray-200 divide-y divide-gray-100 max-h-44 overflow-y-auto">
                {contactsWithEmail.map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-brand-600 flex-shrink-0"
                      checked={recipients.includes(c.email)}
                      onChange={() => toggleContact(c.email)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900">{c.name || c.company || c.email}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{c.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Aus Kontaktdatenbank (projektübergreifend) */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Aus Kontaktdatenbank ergänzen</p>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-8 text-sm"
                placeholder="Kontakt suchen (Name, Firma, E-Mail)…"
                value={dbSearch}
                onChange={e => setDbSearch(e.target.value)}
              />
            </div>
            {dbSearch.trim() && (
              dbContacts.length > 0 ? (
                <div className="border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {dbContacts.map(c => (
                    <label key={c.id || c.email} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-brand-600 flex-shrink-0"
                        checked={recipients.includes(c.email)}
                        onChange={() => toggleContact(c.email)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900">{c.name || c.company || c.email}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{c.email}</span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 px-1">Keine Kontakte gefunden.</p>
              )
            )}
          </div>

          {/* Eigene Adresse */}
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

          {/* Selected */}
          {allTo.length > 0 && (
            <div className="bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800">
              <strong>An:</strong> {allTo.join(', ')}
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
          {sent  && <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 flex items-center gap-1"><Check size={13} /> Gesendet!</p>}
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-200">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex items-center gap-2" onClick={handleSend} disabled={sending || sent}>
            {sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
            {isServer ? 'Senden' : 'E-Mail öffnen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Note Editor ───────────────────────────────────────────────────────────────
const contactKey = (c) => (c.email || '').trim().toLowerCase()
  || `${(c.name || '').trim().toLowerCase()}|${(c.company || '').trim().toLowerCase()}`

// ── Vorlage auf eine bestehende Notiz anwenden ───────────────────────────────
//
// Bisher gab es Vorlagen nur beim Anlegen. Das ist die Hälfte: oft merkt man
// erst beim Schreiben, dass aus dem Anruf eine Entscheidungsvorlage wird.
// Deshalb anwenden, ohne zu zerstören – anhängen ist die Vorgabe, ersetzen
// muss man wählen, und ein geschriebener Betreff wird nie überschrieben.
function VorlagenDialog({ note, vorlagen, onAnwenden, onSpeichern, onLoeschen, onClose }) {
  const [wahl,     setWahl]     = useState(vorlagen[0]?.id || '')
  const [inhalt,   setInhalt]   = useState('anhaengen')
  const [mitArt,   setMitArt]   = useState(false)
  const [mitAufg,  setMitAufg]  = useState(true)
  const [name,     setName]     = useState('')
  const [busy,     setBusy]     = useState(false)
  const [fehler,   setFehler]   = useState(null)
  const [gemerkt,  setGemerkt]  = useState(null)

  const tpl = vorlagen.find(v => v.id === wahl) || null
  const hatInhalt = !!String(note.content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()

  const anwenden = () => {
    if (!tpl) return
    if (inhalt === 'ersetzen' && hatInhalt
        && !window.confirm('Der bisherige Inhalt dieser Notiz wird ersetzt. Fortfahren?')) return
    onAnwenden(tpl, { inhalt, betreff: true, art: mitArt, aufgaben: mitAufg })
    onClose()
  }

  const speichern = async () => {
    setBusy(true); setFehler(null)
    try {
      const gespeichert = await onSpeichern(name.trim())
      setGemerkt(gespeichert?.label || name.trim())
      setName('')
    } catch (e) { setFehler(e.message || 'Konnte nicht gespeichert werden.') }
    finally { setBusy(false) }
  }

  const eigene   = vorlagen.filter(v => v.eigen)
  const geliefert = vorlagen.filter(v => !v.eigen)

  const zeile = (v) => (
    <label key={v.id}
           className={`flex items-start gap-2 px-3 py-2 border cursor-pointer ${
             wahl === v.id ? 'border-brand-500 bg-sky/10' : 'border-gray-200 hover:bg-gray-50'}`}>
      <input type="radio" name="kp-vorlage" className="mt-1" checked={wahl === v.id}
             onChange={() => setWahl(v.id)} />
      <span className="min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-900 block">{v.label}</span>
        {v.zweck && <span className="text-xs text-gray-500 block">{v.zweck}</span>}
        {(v.tasks || []).length > 0 && (
          <span className="text-xs text-gray-400 block">
            bringt {v.tasks.length} {v.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} mit
          </span>
        )}
      </span>
      {v.eigen && onLoeschen && (
        <button className="btn-ghost p-1 text-gray-300 hover:text-red-600 flex-shrink-0"
                title="Eigene Vorlage löschen"
                onClick={(e) => { e.preventDefault(); e.stopPropagation()
                  if (window.confirm(`Vorlage „${v.label}" löschen?`)) onLoeschen(v.id) }}>
          <Trash2 size={13} />
        </button>
      )}
    </label>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-xl border border-gray-200 shadow-2xl max-h-[90vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <LayoutTemplate size={16} className="text-brand-600" /> Vorlage verwenden
          </h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500">Vorlagen</p>
            {geliefert.map(zeile)}
            {eigene.length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-500 pt-2">Eigene Vorlagen des Büros</p>
                {eigene.map(zeile)}
              </>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Inhalt</p>
            <div className="grid grid-cols-3 gap-1">
              {[['anhaengen', 'Anhängen'], ['ersetzen', 'Ersetzen'], ['nichts', 'Nur Aufgaben']].map(([v, l]) => (
                <button key={v} onClick={() => setInhalt(v)}
                  className={`text-xs px-2 py-2 border ${inhalt === v
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>{l}</button>
              ))}
            </div>
            {inhalt === 'ersetzen' && hatInhalt && (
              <p className="text-xs text-amber-700 mt-1">Der bisherige Inhalt dieser Notiz wird überschrieben.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={mitAufg} onChange={e => setMitAufg(e.target.checked)} />
              Aufgaben der Vorlage ergänzen
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={mitArt} onChange={e => setMitArt(e.target.checked)} />
              Art der Notiz übernehmen{tpl ? ` (${(NOTE_TYPES.find(x => x.value === tpl.type) || {}).label || tpl.type})` : ''}
            </label>
            <p className="text-xs text-gray-400">
              Ein bereits geschriebener Betreff bleibt stehen – die Vorlage schlägt ihn nur vor, wenn er leer ist.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Diese Notiz als Vorlage speichern</p>
            <p className="text-xs text-gray-400 mb-2">
              Übernommen werden Art, Betreff, das Gerüst des Inhalts und die Aufgaben – ohne
              Zuständige, und die Fristen als Abstand in Tagen.
            </p>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder='Name der Vorlage, z. B. „Jour fixe Bauherr“'
                     value={name} onChange={e => setName(e.target.value)} />
              <button className="btn-secondary flex items-center gap-1.5" disabled={busy || !name.trim()}
                      onClick={speichern}>
                {busy ? <Loader size={14} className="animate-spin" /> : <Save size={14} />} Speichern
              </button>
            </div>
            {gemerkt && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                <Check size={12} /> „{gemerkt}" steht jetzt im Vorlagenmenü.
              </p>
            )}
            {fehler && (
              <p className="text-xs text-red-700 mt-1 flex items-start gap-1">
                <AlertCircle size={12} className="mt-0.5" /> {fehler}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Schließen</button>
          <button className="btn-primary" onClick={anwenden} disabled={!tpl}>Vorlage anwenden</button>
        </div>
      </div>
    </div>
  )
}

function NoteEditor({ note, contacts, allContacts, projectName, logoDataUrl, clientLogoDataUrl, onUpdate, onDelete, onSendEmail, protocols = [], onAddToProtocol = null, vorlagen = [], onVorlageSpeichern = null, onVorlageLoeschen = null }) {
  const set = (field) => (val) => onUpdate(note.id, { [field]: typeof val === 'object' && val?.target ? val.target.value : val })

  const linkedContact = contacts.find(c => c.id === note.linkedContactId)
  const typeInfo = NOTE_TYPES.find(t => t.value === note.type) ?? NOTE_TYPES[0]

  // Teilnehmer aus Kontakten (Projektkontakte + Kontaktdatenbank, dedupliziert)
  const [vorlagenOffen, setVorlagenOffen] = useState(false)
  const participants = note.participants ?? []
  const participantKeys = new Set(participants.map(contactKey))

  const contactPool = useMemo(() => {
    const map = new Map()
    for (const c of [...(contacts ?? []), ...(allContacts ?? [])]) {
      if (!c.name && !c.company && !c.email) continue
      const k = contactKey(c)
      if (!map.has(k)) map.set(k, c)
    }
    return [...map.values()].sort((a, b) => (a.name || a.company).localeCompare(b.name || b.company, 'de'))
  }, [contacts, allContacts])

  const availableContacts = contactPool.filter(c => !participantKeys.has(contactKey(c)))

  const addParticipant = (key) => {
    const c = contactPool.find(x => contactKey(x) === key)
    if (!c) return
    const entry = { id: c.id || uid(), name: c.name || '', company: c.company || '', email: c.email || '' }
    onUpdate(note.id, { participants: [...participants, entry] })
  }

  const removeParticipant = (key) => {
    onUpdate(note.id, { participants: participants.filter(p => contactKey(p) !== key) })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Protokollbezug */}
      {note.protocolRef && (
        <span className="self-start inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-brand-50 border border-brand-200 text-brand-700">
          <FileText size={11} /> aus Protokoll: {note.protocolRef}
        </span>
      )}
      {/* Type + Date row */}
      <div className="flex flex-wrap gap-3 items-start">
        <div className="flex-1 min-w-40">
          <label className="text-xs font-medium text-gray-500 block mb-1">Art</label>
          <select
            className="input text-sm"
            value={note.type}
            onChange={e => onUpdate(note.id, { type: e.target.value })}
          >
            {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Datum</label>
          <input className="input text-sm" type="date" value={note.date || ''} onChange={set('date')} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Uhrzeit</label>
          <input className="input text-sm w-28" type="time" value={note.time || ''} onChange={set('time')} />
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Betreff</label>
        <input className="input text-sm" placeholder="Betreff / Thema" value={note.subject || ''} onChange={set('subject')} />
      </div>

      {/* Linked contact */}
      {contacts.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">
            {note.type === 'telefonnotiz' ? 'Gesprächspartner (Kontakt)' : 'Verknüpfter Kontakt'}
          </label>
          <select
            className="input text-sm"
            value={note.linkedContactId || ''}
            onChange={e => onUpdate(note.id, { linkedContactId: e.target.value || null })}
          >
            <option value="">– kein Kontakt –</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
            ))}
          </select>
          {linkedContact?.phone && (
            <a href={`tel:${linkedContact.phone}`} className="inline-flex items-center gap-1 mt-1 text-xs text-gray-500 hover:text-brand-600">
              <Phone size={11} /> {linkedContact.phone}
            </a>
          )}
        </div>
      )}

      {/* Teilnehmer aus Kontakten */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1 flex items-center gap-1.5">
          <Users size={12} /> Teilnehmer (aus Kontakten)
        </label>
        {participants.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {participants.map(p => (
              <span key={contactKey(p)} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-brand-50 border border-brand-100 text-brand-800">
                {p.name || p.company || p.email}
                {p.email && <span className="text-brand-400">·{p.email}</span>}
                <button className="ml-0.5 text-brand-400 hover:text-red-500" onClick={() => removeParticipant(contactKey(p))} title="Entfernen">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <select
          className="input text-sm"
          value=""
          onChange={e => { if (e.target.value) addParticipant(e.target.value) }}
        >
          <option value="">＋ Teilnehmer aus Kontakten hinzufügen…</option>
          {availableContacts.map(c => (
            <option key={contactKey(c)} value={contactKey(c)}>
              {c.name || c.company}{c.company && c.name ? ` (${c.company})` : ''}{c.email ? ` · ${c.email}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Inhalt</label>
        <div className="border border-gray-200 min-h-52">
          <RichTextEditor
            value={note.content || ''}
            onChange={val => onUpdate(note.id, { content: val })}
            placeholder="Notizinhalt…"
            allowImages
          />
        </div>
      </div>

      {/* Aufgaben mit Zuständigem und Frist */}
      <NoteTasks
        note={note}
        contacts={allContacts && allContacts.length ? allContacts : contacts}
        protocols={protocols}
        onUpdate={onUpdate}
        onAddToProtocol={onAddToProtocol} />

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-1 text-sm"
            onClick={() => setVorlagenOffen(true)}
            title="Vorlage auf diese Notiz anwenden oder die Notiz als Vorlage speichern"
          >
            <LayoutTemplate size={14} /> Vorlage
          </button>
          <button
            className="btn-secondary flex items-center gap-1 text-sm"
            onClick={onSendEmail}
            title="Notiz per E-Mail senden"
          >
            <Mail size={14} /> Per E-Mail senden
          </button>
          <button
            className="btn-secondary flex items-center gap-1 text-sm"
            onClick={() => printNote(note, linkedContact, projectName, logoDataUrl, clientLogoDataUrl)}
            title="Notiz drucken / als PDF speichern"
          >
            <Printer size={14} /> Drucken / PDF
          </button>
        </div>
        <button
          className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50"
          title="Notiz löschen"
          onClick={() => { if (confirm('Notiz löschen?')) onDelete(note.id) }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {vorlagenOffen && (
        <VorlagenDialog
          note={note}
          vorlagen={vorlagen}
          onAnwenden={(tpl, wie) => onUpdate(note.id, applyNoteTemplate(note, tpl, wie))}
          onSpeichern={(name) => onVorlageSpeichern(note, name)}
          onLoeschen={onVorlageLoeschen}
          onClose={() => setVorlagenOffen(false)} />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotesList({ notes, projectContacts, allContacts, projectName, logoDataUrl, clientLogoDataUrl, onCreate, onUpdate, onDelete, onBack, tabs, protocols = [], onAddToProtocol = null }) {
  const [activeId,       setActiveId]       = useState(null)
  const [search,         setSearch]         = useState('')
  const [filterType,     setFilterType]     = useState('')
  const [showTplMenu,    setShowTplMenu]    = useState(false)
  // Eigene Vorlagen des Büros. Im Server-Betrieb aus der Datenbank, lokal
  // (Electron/Browser ohne Server) aus dem Gerätespeicher – damit die
  // Oberfläche überall dieselbe ist.
  const [eigene,         setEigene]         = useState([])
  const [showEmailModal, setShowEmailModal] = useState(false)

  const activeNote = notes.find(n => n.id === activeId)

  const LS_KEY = 'kp_note_templates'

  const ladeEigene = useCallback(async () => {
    if (!isServer) {
      try { setEigene(JSON.parse(localStorage.getItem(LS_KEY) || '[]')) } catch { setEigene([]) }
      return
    }
    try {
      const res = await fetch('/api/note-templates', { headers: apiHeaders() })
      if (res.ok) setEigene(await res.json())
    } catch { /* ohne eigene Vorlagen geht alles andere weiter */ }
  }, [])

  useEffect(() => { ladeEigene() }, [ladeEigene])

  const vorlagen = useMemo(() => [...NOTE_TEMPLATES, ...eigene], [eigene])

  const vorlageSpeichern = useCallback(async (note, name) => {
    const tpl = noteToTemplate(note, name)
    if (!isServer) {
      const liste = [...eigene.filter(v => v.id !== tpl.id), tpl]
        .sort((a, b) => String(a.label).localeCompare(String(b.label), 'de'))
      localStorage.setItem(LS_KEY, JSON.stringify(liste))
      setEigene(liste)
      return tpl
    }
    const res = await fetch('/api/note-templates', {
      method: 'POST', headers: apiHeaders(), body: JSON.stringify(tpl),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
    const gespeichert = await res.json()
    await ladeEigene()
    return gespeichert
  }, [eigene, ladeEigene])

  const vorlageLoeschen = useCallback(async (id) => {
    if (!isServer) {
      const liste = eigene.filter(v => v.id !== id)
      localStorage.setItem(LS_KEY, JSON.stringify(liste))
      setEigene(liste)
      return
    }
    try {
      await fetch(`/api/note-templates/${encodeURIComponent(id)}`, { method: 'DELETE', headers: apiHeaders() })
      await ladeEigene()
    } catch { /* bleibt stehen, dann eben beim nächsten Versuch */ }
  }, [eigene, ladeEigene])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => notes.filter(n => {
    if (filterType && n.type !== filterType) return false
    if (!q) return true
    return (
      (n.subject || '').toLowerCase().includes(q) ||
      stripHtml(n.content).toLowerCase().includes(q)
    )
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '')), [notes, q, filterType])

  const handleCreate = (tpl) => {
    // Die Aufgaben der Vorlage kommen mit – mit den Fristen, die die Vorlage
    // vorsieht (fristTage ab heute). Deshalb über applyNoteTemplate und nicht
    // über drei Felder von Hand.
    const geruest = applyNoteTemplate(
      { content: '', subject: '', actionItems: [] },
      tpl,
      { inhalt: 'ersetzen', betreff: true, art: true, aufgaben: true })
    const id = onCreate({ type: tpl.type, subject: tpl.subject, content: tpl.content, ...geruest })
    setActiveId(id)
    setShowTplMenu(false)
  }

  const handleDelete = (id) => {
    onDelete(id)
    if (activeId === id) setActiveId(null)
  }

  const contacts = projectContacts ?? []

  return (
    <div className="app-page !space-y-0">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-stretch justify-between gap-4 mb-6">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Projekt
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notizen &amp; Notizbuch</h1>
            <p className="text-sm text-gray-500 mt-0.5">{projectName || 'Projekt'} · {notes.length} Notiz{notes.length !== 1 ? 'en' : ''}</p>
          </div>
          {tabs}
        </div>

        <div className="flex gap-2 items-stretch relative">
          {/* Template menu */}
          <button
            className="btn-primary flex items-center gap-1"
            onClick={() => setShowTplMenu(v => !v)}
          >
            <Plus size={16} /> Neue Notiz <ChevronDown size={13} className={`transition-transform ${showTplMenu ? 'rotate-180' : ''}`} />
          </button>
          {showTplMenu && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 shadow-lg w-80 max-h-[70vh] overflow-auto">
              {NOTE_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-start gap-2"
                  onClick={() => handleCreate(tpl)}
                >
                  <span className="mt-0.5 flex-shrink-0">{TYPE_ICONS[tpl.type]}</span>
                  <span className="min-w-0">
                    <span className="block">{tpl.label}</span>
                    {tpl.zweck && <span className="block text-xs text-gray-500">{tpl.zweck}</span>}
                  </span>
                </button>
              ))}
              {eigene.length > 0 && (
                <>
                  <div className="border-t border-gray-100" />
                  <p className="px-4 pt-2 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">Eigene Vorlagen</p>
                  {eigene.map(tpl => (
                    <button
                      key={tpl.id}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-start gap-2"
                      onClick={() => handleCreate(tpl)}
                    >
                      <span className="mt-0.5 flex-shrink-0">{TYPE_ICONS[tpl.type]}</span>
                      <span className="min-w-0">
                        <span className="block">{tpl.label}</span>
                        {(tpl.tasks || []).length > 0 && (
                          <span className="block text-xs text-gray-500">
                            mit {tpl.tasks.length} {tpl.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </>
              )}
              <div className="border-t border-gray-100" />
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-500"
                onClick={() => handleCreate({ type: 'aktennotiz', subject: '', content: '' })}
              >
                <Plus size={13} /> Leere Notiz
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-start">

        {/* Left: List */}
        <div className={`flex flex-col gap-3 ${activeNote ? 'hidden sm:flex sm:w-72 flex-shrink-0' : 'w-full'}`}>

          {/* Search */}
          {notes.length > 0 && (
            <div className="space-y-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-8 text-sm" placeholder="Notizen suchen…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {NOTE_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setFilterType(filterType === t.value ? '' : t.value)}
                    className={`text-xs px-2.5 py-1 border transition-colors ${
                      filterType === t.value ? 'bg-night text-light border-night' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                {filterType && <button className="text-xs text-gray-400 underline" onClick={() => setFilterType('')}>Alle</button>}
              </div>
            </div>
          )}

          {/* Empty state */}
          {notes.length === 0 && (
            <div className="card p-10 text-center">
              <FileText size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Noch keine Notizen</p>
              <p className="text-sm text-gray-400 mt-1">Erstelle eine Akten- oder Telefonnotiz.</p>
            </div>
          )}

          {/* Note cards */}
          <div className="space-y-2">
            {filtered.map(n => {
              const typeInfo = NOTE_TYPES.find(t => t.value === n.type) ?? NOTE_TYPES[0]
              const preview  = stripHtml(n.content).slice(0, 100)
              const isActive = n.id === activeId
              return (
                <button
                  key={n.id}
                  className={`w-full text-left card px-4 py-3 hover:border-brand-300 transition-colors ${isActive ? 'border-brand-400 bg-brand-50' : ''}`}
                  onClick={() => setActiveId(isActive ? null : n.id)}
                >
                  <div className="flex items-start gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 border ${typeInfo.color} flex-shrink-0`}>
                      {TYPE_ICONS[n.type]}{typeInfo.label}
                    </span>
                    {n.sentAt && <span className="text-xs text-green-600 flex items-center gap-0.5"><Check size={10} /> Gesendet</span>}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{n.subject || '(Kein Betreff)'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{formatDate(n.date)}{n.time ? ', ' + n.time + ' Uhr' : ''}</span>
                  </div>
                  {preview && <p className="text-xs text-gray-400 mt-1 truncate">{preview}</p>}
                </button>
              )
            })}
            {filtered.length === 0 && notes.length > 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Keine Notizen gefunden.</p>
            )}
          </div>
        </div>

        {/* Right: Editor */}
        {activeNote && (
          <div className="flex-1 min-w-0 card p-5">
            {/* Back on mobile */}
            <button className="sm:hidden btn-ghost text-sm mb-4 -ml-1" onClick={() => setActiveId(null)}>
              <ArrowLeft size={14} /> Zurück zur Liste
            </button>

            <NoteEditor
              note={activeNote}
              contacts={contacts}
              allContacts={allContacts}
              projectName={projectName}
              logoDataUrl={logoDataUrl}
              clientLogoDataUrl={clientLogoDataUrl}
              onUpdate={onUpdate}
              onDelete={handleDelete}
              onSendEmail={() => setShowEmailModal(true)}
              protocols={protocols}
              onAddToProtocol={onAddToProtocol}
              vorlagen={vorlagen}
              onVorlageSpeichern={vorlageSpeichern}
              onVorlageLoeschen={vorlageLoeschen}
            />
          </div>
        )}
      </div>

      {showEmailModal && activeNote && (
        <NoteEmailModal
          note={activeNote}
          contacts={contacts}
          allContacts={allContacts}
          projectName={projectName}
          logoDataUrl={logoDataUrl}
          clientLogoDataUrl={clientLogoDataUrl}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {/* Close template menu on outside click */}
      {showTplMenu && (
        <div className="fixed inset-0 z-20" onClick={() => setShowTplMenu(false)} />
      )}
    </div>
  )
}
