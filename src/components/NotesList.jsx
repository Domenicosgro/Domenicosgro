import React, { useState, useCallback, useMemo } from 'react'
import { ArrowLeft, Plus, Trash2, Send, Mail, Phone, ChevronDown,
         FileText, Phone as PhoneIcon, Users, Search, X, Check, Loader } from 'lucide-react'
import { formatDate, NOTE_TYPES, NOTE_TEMPLATES, emptyNote } from '../utils'
import RichTextEditor from './RichTextEditor'

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

const TYPE_ICONS = {
  aktennotiz:   <FileText size={13} />,
  telefonnotiz: <PhoneIcon size={13} />,
  besprochen:   <Users size={13} />,
}

// ── Email Modal ───────────────────────────────────────────────────────────────
function NoteEmailModal({ note, contacts, onClose }) {
  const [recipients,   setRecipients]   = useState([])
  const [customEmail,  setCustomEmail]  = useState('')
  const [subject,      setSubject]      = useState(`${NOTE_TYPES.find(t => t.value === note.type)?.label || 'Notiz'} – ${note.subject || 'Ohne Betreff'}`)
  const [sending,      setSending]      = useState(false)
  const [sent,         setSent]         = useState(false)
  const [error,        setError]        = useState('')

  const contactsWithEmail = contacts.filter(c => c.email)

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
        const res = await fetch(`/api/notes/${note.id}/send-email`, {
          method: 'POST', headers: apiHeaders(),
          body: JSON.stringify({ to: allTo.join(', '), subject }),
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
function NoteEditor({ note, contacts, onUpdate, onDelete, onSendEmail }) {
  const set = (field) => (val) => onUpdate(note.id, { [field]: typeof val === 'object' && val?.target ? val.target.value : val })

  const linkedContact = contacts.find(c => c.id === note.linkedContactId)
  const typeInfo = NOTE_TYPES.find(t => t.value === note.type) ?? NOTE_TYPES[0]

  return (
    <div className="flex flex-col gap-4">
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

      {/* Content */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Inhalt</label>
        <div className="border border-gray-200 min-h-52">
          <RichTextEditor
            value={note.content || ''}
            onChange={val => onUpdate(note.id, { content: val })}
            placeholder="Notizinhalt…"
          />
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-1 text-sm"
            onClick={onSendEmail}
            title="Notiz per E-Mail senden"
          >
            <Mail size={14} /> Per E-Mail senden
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
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotesList({ notes, projectContacts, projectName, onCreate, onUpdate, onDelete, onBack }) {
  const [activeId,       setActiveId]       = useState(null)
  const [search,         setSearch]         = useState('')
  const [filterType,     setFilterType]     = useState('')
  const [showTplMenu,    setShowTplMenu]    = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)

  const activeNote = notes.find(n => n.id === activeId)

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
    const id = onCreate({
      type:    tpl.type,
      subject: tpl.subject,
      content: tpl.content,
    })
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
            <h1 className="text-2xl font-bold text-gray-900">Notizen</h1>
            <p className="text-sm text-gray-500 mt-0.5">{projectName || 'Projekt'} · {notes.length} Notiz{notes.length !== 1 ? 'en' : ''}</p>
          </div>
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
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 shadow-lg w-52">
              {NOTE_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => handleCreate(tpl)}
                >
                  {TYPE_ICONS[tpl.type]}
                  {tpl.label}
                </button>
              ))}
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
              onUpdate={onUpdate}
              onDelete={handleDelete}
              onSendEmail={() => setShowEmailModal(true)}
            />
          </div>
        )}
      </div>

      {showEmailModal && activeNote && (
        <NoteEmailModal
          note={activeNote}
          contacts={contacts}
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
