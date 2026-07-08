import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowLeft, Plus, Trash2, ChevronRight, ChevronDown,
  BookOpen, Printer, Mail, X, CheckSquare, Square, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useNotebook } from '../hooks/useNotebook'
import { uid } from '../utils'
import RichTextEditor from './RichTextEditor'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    if (window.__API_KEY__) h['X-API-Key'] = window.__API_KEY__
    const t = localStorage.getItem('kp_session_token')
    if (t) h['Authorization'] = `Bearer ${t}`
  }
  return h
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function TopicItem({ topic, selectedNoteId, onSelectNote, onAddNote, onDeleteTopic, onRenameStart, onRename, editingTopicId, topicDraft, setTopicDraft }) {
  const [expanded, setExpanded] = useState(true)
  const isEditing = editingTopicId === topic.id
  const inputRef  = useRef(null)

  useEffect(() => { if (isEditing && inputRef.current) inputRef.current.focus() }, [isEditing])

  return (
    <div>
      <div className="flex items-center gap-1 px-2 py-1.5 group hover:bg-gray-50 cursor-pointer select-none">
        <button
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-0.5"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {isEditing ? (
          <input
            ref={inputRef}
            className="input text-xs flex-1 py-0.5 px-1"
            value={topicDraft}
            onChange={e => setTopicDraft(e.target.value)}
            onBlur={() => onRename(topic.id, topicDraft)}
            onKeyDown={e => {
              if (e.key === 'Enter') onRename(topic.id, topicDraft)
              if (e.key === 'Escape') onRename(topic.id, null)
            }}
          />
        ) : (
          <span
            className="flex-1 text-xs font-semibold text-gray-700 truncate"
            onDoubleClick={() => onRenameStart(topic.id, topic.title)}
          >
            {topic.title}
          </span>
        )}

        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-0.5 text-gray-400 hover:text-brand-600" title="Neue Notiz" onClick={() => { onAddNote(topic.id); setExpanded(true) }}>
            <Plus size={12} />
          </button>
          <button className="p-0.5 text-gray-400 hover:text-red-500" title="Thema löschen" onClick={() => onDeleteTopic(topic.id)}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ml-3">
          {(topic.notes || []).length === 0 && (
            <p className="text-xs text-gray-400 px-3 py-1 italic">Keine Notizen</p>
          )}
          {(topic.notes || []).map(note => (
            <div
              key={note.id}
              className={`flex items-center gap-1 px-3 py-1.5 cursor-pointer group hover:bg-gray-50 border-l-2 transition-colors
                ${selectedNoteId === note.id ? 'border-brand-500 bg-brand-50' : 'border-transparent'}`}
              onClick={() => onSelectNote(topic.id, note.id)}
            >
              <span className={`flex-1 text-xs truncate ${selectedNoteId === note.id ? 'text-brand-700 font-medium' : 'text-gray-600'}`}>
                {note.title || 'Ohne Titel'}
              </span>
              <button
                className="flex-shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                onClick={e => { e.stopPropagation(); onSelectNote(topic.id, note.id, true) }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <button
            className="flex items-center gap-1 px-3 py-1 text-xs text-gray-400 hover:text-brand-600 w-full"
            onClick={() => onAddNote(topic.id)}
          >
            <Plus size={11} /> Neue Notiz
          </button>
        </div>
      )}
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, contacts, onChange, onDelete }) {
  return (
    <div className="flex items-start gap-2 group py-1">
      <button
        className="flex-shrink-0 mt-0.5"
        onClick={() => onChange({ done: !task.done })}
      >
        {task.done
          ? <CheckSquare size={15} className="text-green-600" />
          : <Square size={15} className="text-gray-400 hover:text-brand-500" />
        }
      </button>
      <input
        className={`flex-1 text-sm border-none outline-none bg-transparent min-w-0 ${task.done ? 'line-through text-gray-400' : 'text-gray-700'}`}
        value={task.text}
        placeholder="Aufgabe…"
        onChange={e => onChange({ text: e.target.value })}
      />
      <input
        className="input text-xs w-28 py-0.5 shrink-0"
        placeholder="Zuständig"
        value={task.assignedTo || ''}
        onChange={e => onChange({ assignedTo: e.target.value })}
        list={`nb-c-${task.id}`}
      />
      <datalist id={`nb-c-${task.id}`}>
        {contacts.map(c => <option key={c.id} value={c.name} />)}
      </datalist>
      <input
        type="date"
        className="input text-xs w-34 py-0.5 shrink-0"
        value={task.dueDate || ''}
        onChange={e => onChange({ dueDate: e.target.value })}
      />
      <button
        className="flex-shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
        onClick={onDelete}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ── Email modal ───────────────────────────────────────────────────────────────

function EmailModal({ project, selNote, selTopic, onClose }) {
  const [to,      setTo]      = useState('')
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState(null)

  const buildBodyHtml = () => {
    if (selNote) {
      let html = `<h2 style="font-size:16px;margin:0 0 8px;">${selNote.title || 'Notiz'}</h2>`
      if (selNote.content) html += selNote.content
      if (selNote.tasks?.length > 0) {
        html += `<h3 style="font-size:13px;margin:16px 0 8px;">Aufgaben</h3><ul style="margin:0;padding-left:20px;">`
        for (const t of selNote.tasks) {
          const due  = t.dueDate ? ` – bis ${new Date(t.dueDate).toLocaleDateString('de-DE')}` : ''
          const who  = t.assignedTo ? ` (${t.assignedTo})` : ''
          html += `<li style="margin-bottom:4px;">${t.done ? '☑' : '☐'} ${t.text}${who}${due}</li>`
        }
        html += '</ul>'
      }
      return html
    }
    if (selTopic) {
      let html = `<h2 style="font-size:16px;margin:0 0 16px;">${selTopic.title}</h2>`
      for (const note of selTopic.notes || []) {
        html += `<h3 style="font-size:13px;margin:16px 0 8px;">${note.title}</h3>`
        if (note.content) html += note.content
      }
      return html
    }
    return ''
  }

  const handleSend = async () => {
    if (!to.trim()) return
    setSending(true); setError(null)
    try {
      const res = await fetch(`/api/notebooks/${project.id}/send-email`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ to: to.trim(), subject: subject || undefined, html: buildBodyHtml() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Fehler.') }
      onClose()
    } catch (e) { setError(e.message) }
    finally     { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6 bg-white">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-night">Notizbuch per E-Mail senden</h2>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Empfänger *</label>
            <input className="input w-full" type="email" placeholder="empfaenger@beispiel.de" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Betreff</label>
            <input className="input w-full" placeholder={`Notizbuch – ${project.name || 'Projekt'}`} value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 p-2 border border-gray-200">
            {selNote
              ? <>Notiz <strong>{selNote.title}</strong> wird gesendet.</>
              : selTopic
                ? <>Alle Notizen in <strong>{selTopic.title}</strong> werden gesendet.</>
                : 'Bitte zuerst eine Notiz oder ein Thema auswählen.'}
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSend} disabled={!to.trim() || sending || (!selNote && !selTopic)}>
            {sending ? 'Senden…' : 'Senden'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotizbuchView({ project, serverUser, onBack, tabs }) {
  const { notebook, loaded, saving, addTopic, updateTopic, deleteTopic, addNote, updateNote, deleteNote } = useNotebook(project.id)

  const [selectedTopicId, setSelectedTopicId] = useState(null)
  const [selectedNoteId,  setSelectedNoteId]  = useState(null)
  const [editingTopicId,  setEditingTopicId]  = useState(null)
  const [topicDraft,      setTopicDraft]      = useState('')
  const [newTaskText,     setNewTaskText]      = useState('')
  const [showEmailModal,  setShowEmailModal]  = useState(false)
  const [sidebarOpen,     setSidebarOpen]     = useState(true)

  const topics   = notebook?.topics || []
  const selTopic = topics.find(t => t.id === selectedTopicId) ?? null
  const selNote  = selTopic?.notes?.find(n => n.id === selectedNoteId) ?? null
  const contacts = project.contacts || []

  // Auto-select first topic/note on load
  useEffect(() => {
    if (!loaded || !notebook) return
    const tps = notebook.topics || []
    if (tps.length > 0 && !selectedTopicId) {
      const first = tps[0]
      setSelectedTopicId(first.id)
      if (first.notes?.length > 0) setSelectedNoteId(first.notes[0].id)
    }
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddTopic = () => {
    const id = addTopic('Neues Thema')
    setSelectedTopicId(id)
    setSelectedNoteId(null)
    setEditingTopicId(id)
    setTopicDraft('Neues Thema')
  }

  const handleRenameStart = (topicId, currentTitle) => {
    setEditingTopicId(topicId)
    setTopicDraft(currentTitle)
  }

  const handleRename = (topicId, draft) => {
    if (draft !== null && draft.trim()) updateTopic(topicId, { title: draft.trim() })
    setEditingTopicId(null)
  }

  const handleDeleteTopic = (topicId) => {
    if (!window.confirm('Hauptthema und alle zugehörigen Notizen löschen?')) return
    deleteTopic(topicId)
    if (selectedTopicId === topicId) { setSelectedTopicId(null); setSelectedNoteId(null) }
  }

  const handleAddNote = (topicId) => {
    const id = addNote(topicId, { title: 'Neue Notiz' })
    setSelectedTopicId(topicId)
    setSelectedNoteId(id)
  }

  // 3rd param `doDelete` = true when clicking the delete icon inside TopicItem
  const handleSelectNote = (topicId, noteId, doDelete = false) => {
    if (doDelete) {
      if (!window.confirm('Notiz löschen?')) return
      deleteNote(topicId, noteId)
      if (selectedNoteId === noteId) {
        const topic = topics.find(t => t.id === topicId)
        const rest  = topic?.notes?.filter(n => n.id !== noteId) || []
        setSelectedNoteId(rest.length > 0 ? rest[0].id : null)
      }
      return
    }
    setSelectedTopicId(topicId)
    setSelectedNoteId(noteId)
  }

  const handleAddTask = () => {
    if (!selNote || !newTaskText.trim()) return
    const tasks = [...(selNote.tasks || []), { id: uid(), text: newTaskText.trim(), done: false, assignedTo: '', dueDate: '' }]
    updateNote(selectedTopicId, selectedNoteId, { tasks })
    setNewTaskText('')
  }

  const handleChangeTask = (taskId, patch) => {
    if (!selNote) return
    updateNote(selectedTopicId, selectedNoteId, { tasks: selNote.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) })
  }

  const handleDeleteTask = (taskId) => {
    if (!selNote) return
    updateNote(selectedTopicId, selectedNoteId, { tasks: selNote.tasks.filter(t => t.id !== taskId) })
  }

  const handlePrint = () => window.print()

  if (!loaded) {
    return (
      <div className="app-page flex items-center justify-center">
        <span className="text-gray-400 text-sm">Notizbuch wird geladen…</span>
      </div>
    )
  }

  return (
    <div className="app-page print:p-0 print:m-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 no-print mb-4">
        <div className="flex items-center gap-3">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Projekt
          </button>
          <div>
            <h1 className="text-xl font-bold text-night flex items-center gap-2">
              <BookOpen size={18} className="text-brand-600" />
              Notizbuch
              {saving && <span className="text-xs font-normal text-gray-400 ml-1">Speichert…</span>}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">{project.name}</p>
          </div>
          {tabs}
        </div>
        <div className="flex items-center gap-2">
          {isServer && (
            <button className="btn-secondary text-sm" onClick={() => setShowEmailModal(true)}>
              <Mail size={14} /> E-Mail
            </button>
          )}
          <button className="btn-secondary text-sm" onClick={handlePrint}>
            <Printer size={14} /> Drucken
          </button>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex border border-gray-200 bg-white no-print" style={{ minHeight: 'calc(100vh - 180px)' }}>

        {/* Sidebar toggle on mobile */}
        <button
          className="absolute top-2 left-2 z-10 sm:hidden p-1 bg-white border border-gray-200 text-gray-500"
          onClick={() => setSidebarOpen(v => !v)}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 lg:w-64 flex-shrink-0 border-r border-gray-200 flex flex-col">
            <div className="p-2 border-b border-gray-100">
              <button className="btn-primary w-full text-xs py-1.5" onClick={handleAddTopic}>
                <Plus size={13} /> Hauptthema
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {topics.length === 0 && (
                <p className="text-xs text-gray-400 p-4 text-center">Noch kein Thema.<br />Oben hinzufügen.</p>
              )}
              {topics.map(topic => (
                <TopicItem
                  key={topic.id}
                  topic={topic}
                  selectedNoteId={selectedNoteId}
                  onSelectNote={handleSelectNote}
                  onAddNote={handleAddNote}
                  onDeleteTopic={handleDeleteTopic}
                  onRenameStart={handleRenameStart}
                  onRename={handleRename}
                  editingTopicId={editingTopicId}
                  topicDraft={topicDraft}
                  setTopicDraft={setTopicDraft}
                />
              ))}
            </div>
          </div>
        )}

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

          {/* Empty state */}
          {!selNote && !selTopic && (
            <div className="flex-1 flex items-center justify-center text-gray-300 p-8">
              <div className="text-center">
                <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Ein Hauptthema auswählen oder erstellen</p>
              </div>
            </div>
          )}

          {/* Topic selected, no note */}
          {selTopic && !selNote && (
            <div className="p-8">
              <h2 className="text-lg font-bold text-night mb-2">{selTopic.title}</h2>
              <p className="text-sm text-gray-500 mb-5">
                {(selTopic.notes || []).length} Notiz{selTopic.notes?.length !== 1 ? 'en' : ''}
              </p>
              <button className="btn-primary text-sm" onClick={() => handleAddNote(selTopic.id)}>
                <Plus size={14} /> Erste Notiz anlegen
              </button>
            </div>
          )}

          {/* Note editor */}
          {selNote && (
            <div className="flex flex-col p-6 gap-5 flex-1">

              {/* Note title */}
              <input
                className="text-xl font-bold text-night border-none outline-none bg-transparent w-full placeholder-gray-300"
                value={selNote.title || ''}
                placeholder="Notiz-Titel"
                onChange={e => updateNote(selectedTopicId, selectedNoteId, { title: e.target.value })}
              />

              <div className="h-px bg-gray-100" />

              {/* Note content */}
              <div className="min-h-48">
                <RichTextEditor
                  value={selNote.content || ''}
                  onChange={v => updateNote(selectedTopicId, selectedNoteId, { content: v })}
                  placeholder="Inhalt eingeben…"
                  allowImages
                />
              </div>

              {/* Tasks */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckSquare size={14} className="text-brand-600" />
                  <span className="text-sm font-semibold text-gray-700">Aufgaben</span>
                  {(selNote.tasks || []).length > 0 && (
                    <span className="text-xs text-gray-400">
                      {selNote.tasks.filter(t => t.done).length}/{selNote.tasks.length} erledigt
                    </span>
                  )}
                </div>

                <div className="space-y-0.5 mb-3">
                  {(selNote.tasks || []).map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      contacts={contacts}
                      onChange={patch => handleChangeTask(task.id, patch)}
                      onDelete={() => handleDeleteTask(task.id)}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    className="input text-sm flex-1"
                    placeholder="Neue Aufgabe hinzufügen…"
                    value={newTaskText}
                    onChange={e => setNewTaskText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  />
                  <button className="btn-secondary text-sm" onClick={handleAddTask} disabled={!newTaskText.trim()}>
                    <Plus size={13} /> Aufgabe
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Print view (screen: hidden, print: visible) ── */}
      <div className="hidden print:block text-black font-sans text-sm">
        <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>Notizbuch</h1>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>{project.name}</p>
        {topics.map(topic => (
          <div key={topic.id} style={{ marginBottom: '28px', pageBreakInside: 'avoid' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '12px' }}>
              {topic.title}
            </h2>
            {(topic.notes || []).map(note => (
              <div key={note.id} style={{ marginBottom: '16px', paddingLeft: '12px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '5px' }}>{note.title}</h3>
                {note.content && (
                  <div style={{ fontSize: '11px', lineHeight: '1.5', marginBottom: '6px' }}
                    dangerouslySetInnerHTML={{ __html: note.content }} />
                )}
                {(note.tasks || []).length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <p style={{ fontSize: '10px', fontWeight: '600', color: '#666', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Aufgaben
                    </p>
                    {note.tasks.map(task => {
                      const due = task.dueDate ? ` · bis ${new Date(task.dueDate).toLocaleDateString('de-DE')}` : ''
                      const who = task.assignedTo ? ` · ${task.assignedTo}` : ''
                      return (
                        <p key={task.id} style={{ fontSize: '11px', marginBottom: '2px' }}>
                          {task.done ? '☑' : '☐'} {task.text}{who}{due}
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Email modal ── */}
      {showEmailModal && (
        <EmailModal
          project={project}
          selNote={selNote}
          selTopic={selTopic}
          onClose={() => setShowEmailModal(false)}
        />
      )}

    </div>
  )
}
