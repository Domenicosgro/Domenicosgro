import React, { useState, useRef } from 'react'
import { Plus, Trash2, ArrowLeft, Users, FolderOpen, ChevronRight, ChevronDown,
         Mail, Phone, Upload, Download, X, CheckCircle2, List, GripVertical, ArrowUpDown } from 'lucide-react'
import { emptyContact, uid } from '../utils'
import BeteiligtenModal from './BeteiligtenModal'

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseLine(line, sep) {
  const cols = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === sep && !inQ) { cols.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  cols.push(cur.trim())
  return cols
}

function parseCSVContacts(text) {
  const firstLine = text.split('\n')[0] ?? ''
  const sep = firstLine.includes(';') ? ';' : ','
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return null

  const rawHeaders = parseLine(lines[0], sep)
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z]/g, ''))

  const find = (...keys) => headers.findIndex(h => keys.some(k => h.includes(k)))

  const map = {
    name:    find('name', 'person', 'vorname', 'nachname'),
    company: find('firma', 'company', 'organisation', 'unternehmen', 'gesellschaft'),
    gewerk:  find('gewerk', 'trade', 'gewerke'),
    role:    find('funktion', 'rolle', 'role', 'position', 'titel', 'beruf'),
    email:   find('email', 'mail'),
    phone:   find('telefon', 'phone', 'tel', 'mobil', 'handy', 'fax'),
  }

  const get = (cols, idx) => (idx >= 0 ? (cols[idx] ?? '').replace(/^"|"$/g, '').trim() : '')

  const contacts = lines.slice(1).map(line => {
    const cols = parseLine(line, sep)
    return {
      id:      uid(),
      name:    get(cols, map.name),
      company: get(cols, map.company),
      gewerk:  get(cols, map.gewerk),
      role:    get(cols, map.role),
      email:   get(cols, map.email),
      phone:   get(cols, map.phone),
    }
  }).filter(c => c.name || c.company)

  return { contacts, mappedHeaders: map, rawHeaders }
}

function exportContactsCSV(project) {
  const contacts = project.contacts ?? []
  const SEP  = ';'
  const wrap = (v) => {
    const s = String(v ?? '')
    return (s.includes(SEP) || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    ['Name', 'Firma', 'Gewerk', 'Funktion', 'E-Mail', 'Telefon'].map(wrap).join(SEP),
    ...contacts.map(c =>
      [c.name, c.company, c.gewerk, c.role, c.email, c.phone].map(wrap).join(SEP)
    ),
  ]
  const csv  = '﻿' + lines.join('\r\n')   // UTF-8 BOM for Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `Kontakte_${(project.name || 'Projekt').replace(/[^a-zA-Z0-9_\-]/g, '_')}.csv`,
  })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

function sortContacts(contacts, sort) {
  if (!sort) return contacts
  const { field, dir } = sort
  return [...contacts].sort((a, b) => {
    const av = (a[field] ?? '').toLowerCase()
    const bv = (b[field] ?? '').toLowerCase()
    const cmp = av.localeCompare(bv, 'de')
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortTh({ label, field, sort, onSort, children, className = '' }) {
  const active = sort?.field === field
  const dir    = active ? sort.dir : null
  return (
    <th
      className={`text-left pb-2 pr-3 cursor-pointer select-none group ${className}`}
      onClick={() => onSort(field)}
      title={`Nach ${label} sortieren`}
    >
      <span className="inline-flex items-center gap-1">
        {children ?? label}
        <ArrowUpDown
          size={11}
          className={`transition-colors ${active ? (dir === 'asc' ? 'text-brand-500' : 'text-brand-600') : 'text-gray-300 group-hover:text-gray-400'}`}
          style={active && dir === 'desc' ? { transform: 'scaleY(-1)' } : undefined}
        />
      </span>
    </th>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectManager({ projects, onCreate, onUpdate, onDelete, onBack, logoDataUrl }) {
  const [expandedId,       setExpandedId]       = useState(() => projects.length === 1 ? projects[0]?.id : null)
  const [importState,      setImportState]      = useState(null)
  const [importError,      setImportError]      = useState('')
  const [participantsFor,  setParticipantsFor]  = useState(null)
  const [sortBy,           setSortBy]           = useState({}) // { [projectId]: { field, dir } }
  const [dropTarget,       setDropTarget]       = useState(null) // { projectId, idx }
  const dragRef = useRef(null) // { projectId, contactId, fromIdx }
  const fileInputRef = useRef(null)

  const updateContacts = (projectId, contacts) => onUpdate(projectId, { contacts })

  const addContact = (project) =>
    updateContacts(project.id, [...(project.contacts ?? []), emptyContact()])

  const updateContact = (project, contactId, field, value) =>
    updateContacts(project.id, (project.contacts ?? []).map(c =>
      c.id === contactId ? { ...c, [field]: value } : c
    ))

  const removeContact = (project, contactId) =>
    updateContacts(project.id, (project.contacts ?? []).filter(c => c.id !== contactId))

  const handleSort = (projectId, field) => {
    setSortBy(prev => {
      const cur = prev[projectId]
      if (!cur || cur.field !== field) return { ...prev, [projectId]: { field, dir: 'asc' } }
      if (cur.dir === 'asc')          return { ...prev, [projectId]: { field, dir: 'desc' } }
      const next = { ...prev }; delete next[projectId]; return next
    })
  }

  const handleDragStart = (projectId, contactId, fromIdx) => {
    dragRef.current = { projectId, contactId, fromIdx }
  }

  const handleDragOver = (e, projectId, toIdx) => {
    e.preventDefault()
    setDropTarget({ projectId, idx: toIdx })
  }

  const handleDrop = (e, project, toIdx) => {
    e.preventDefault()
    const info = dragRef.current
    if (!info || info.projectId !== project.id) { setDropTarget(null); return }
    const contacts = [...(project.contacts ?? [])]
    const from = contacts.findIndex(c => c.id === info.contactId)
    if (from < 0 || from === toIdx) { setDropTarget(null); dragRef.current = null; return }
    const [item] = contacts.splice(from, 1)
    const insertAt = from < toIdx ? toIdx - 1 : toIdx
    contacts.splice(insertAt, 0, item)
    updateContacts(project.id, contacts)
    setDropTarget(null)
    dragRef.current = null
  }

  const handleDragEnd = () => {
    setDropTarget(null)
    dragRef.current = null
  }

  const handleImportFile = (projectId, file) => {
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const result = parseCSVContacts(text)
      if (!result || result.contacts.length === 0) {
        setImportError('Keine Kontakte erkannt. Bitte CSV mit Kopfzeile (Name, Firma, Gewerk, Funktion, E-Mail, Telefon) verwenden.')
        return
      }
      setImportState({ projectId, ...result })
    }
    reader.readAsText(file, 'UTF-8')
  }

  const confirmImport = () => {
    if (!importState) return
    const project = projects.find(p => p.id === importState.projectId)
    if (!project) return
    updateContacts(project.id, [...(project.contacts ?? []), ...importState.contacts])
    setImportState(null)
    setExpandedId(importState.projectId)
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={e => {
          const pid = fileInputRef.current?.dataset.projectId
          handleImportFile(pid, e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Zurück</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontakte verwalten</h1>
          <p className="text-sm text-gray-500 mt-0.5">Beteiligte Firmen und Personen für die Protokoll-Zuweisung</p>
        </div>
      </div>

      {importError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <X size={15} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Import fehlgeschlagen</p>
            <p className="text-xs mt-0.5">{importError}</p>
          </div>
          <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setImportError('')}><X size={13} /></button>
        </div>
      )}

      {projects.length === 0 && (
        <div className="card p-12 text-center">
          <FolderOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Noch keine Projekte angelegt</p>
          <p className="text-sm text-gray-400 mt-1">Erstelle ein Projekt und pflege die Kontakte (Firmen, Personen).</p>
        </div>
      )}

      <div className="space-y-3">
        {projects.map(project => {
          const expanded    = expandedId === project.id
          const contacts    = project.contacts ?? []
          const sort        = sortBy[project.id] ?? null
          const isSortActive = !!sort
          const displayContacts = sortContacts(contacts, sort)

          return (
            <div key={project.id} className="card">
              {/* Project row */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : project.id)}
              >
                <div className="w-2 h-10 rounded-full bg-brand-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <input
                    className="input font-semibold text-base w-full max-w-sm"
                    placeholder="Projektname…"
                    value={project.name}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onUpdate(project.id, { name: e.target.value })}
                  />
                  <div className="text-xs text-gray-400 mt-0.5 pl-1">
                    <Users size={11} className="inline mr-1" />
                    {contacts.length} Kontakt{contacts.length !== 1 ? 'e' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    className="btn-primary"
                    onClick={() => { setExpandedId(project.id); addContact(project) }}
                  >
                    <Plus size={14} /> Kontakt hinzufügen
                  </button>
                  <button
                    className="btn-secondary"
                    title="Kontakte aus CSV importieren"
                    onClick={() => {
                      fileInputRef.current.dataset.projectId = project.id
                      fileInputRef.current.click()
                    }}
                  >
                    <Upload size={14} /> Importieren
                  </button>
                  {contacts.length > 0 && (
                    <button
                      className="btn-secondary"
                      title="Kontakte als CSV exportieren"
                      onClick={() => exportContactsCSV(project)}
                    >
                      <Download size={14} /> CSV
                    </button>
                  )}
                  <button
                    className="btn-secondary"
                    title="Projektbeteiligtenliste erstellen"
                    onClick={() => setParticipantsFor(project.id)}
                  >
                    <List size={14} /> Beteiligtenliste
                  </button>
                  <button
                    className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                    title="Projekt löschen"
                    onClick={() => {
                      if (confirm(`Projekt "${project.name || 'Unbenannt'}" und alle Kontakte löschen?`)) onDelete(project.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-300" />}
              </div>

              {/* Contacts table */}
              {expanded && (
                <div className="border-t border-gray-100 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Users size={14} /> Kontakte
                      {isSortActive && (
                        <span className="text-xs font-normal text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                          Sortiert · Drag & Drop deaktiviert
                        </span>
                      )}
                    </h3>
                    <div className="flex gap-2">
                      <button className="btn-secondary btn-sm"
                        onClick={() => {
                          fileInputRef.current.dataset.projectId = project.id
                          fileInputRef.current.click()
                        }}
                      >
                        <Upload size={13} /> CSV importieren
                      </button>
                      {contacts.length > 0 && (
                        <button className="btn-secondary btn-sm" onClick={() => exportContactsCSV(project)}
                          title="Kontakte als CSV exportieren">
                          <Download size={13} /> CSV exportieren
                        </button>
                      )}
                      <button className="btn-primary btn-sm" onClick={() => addContact(project)}>
                        <Plus size={13} /> Kontakt hinzufügen
                      </button>
                    </div>
                  </div>

                  {contacts.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                      <Users size={28} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-400">Noch keine Kontakte. Manuell hinzufügen oder CSV importieren.</p>
                      <p className="text-xs text-gray-400 mt-1">CSV-Spalten: Name · Firma · Gewerk · Funktion · E-Mail · Telefon</p>
                    </div>
                  )}

                  {contacts.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[900px]">
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-500">
                            {!isSortActive && <th className="pb-2 pr-2 w-6" />}
                            <SortTh label="Name"     field="name"    sort={sort} onSort={f => handleSort(project.id, f)} />
                            <SortTh label="Firma"    field="company" sort={sort} onSort={f => handleSort(project.id, f)} />
                            <SortTh label="Gewerk"   field="gewerk"  sort={sort} onSort={f => handleSort(project.id, f)} />
                            <SortTh label="Funktion" field="role"    sort={sort} onSort={f => handleSort(project.id, f)} />
                            <SortTh label="E-Mail"   field="email"   sort={sort} onSort={f => handleSort(project.id, f)}>
                              <span className="flex items-center gap-1"><Mail size={11} /> E-Mail</span>
                            </SortTh>
                            <SortTh label="Telefon"  field="phone"   sort={sort} onSort={f => handleSort(project.id, f)}>
                              <span className="flex items-center gap-1"><Phone size={11} /> Telefon</span>
                            </SortTh>
                            <th className="pb-2 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {displayContacts.map((c, idx) => {
                            const isDropTarget = dropTarget?.projectId === project.id && dropTarget?.idx === idx
                            return (
                              <tr
                                key={c.id}
                                draggable={!isSortActive}
                                onDragStart={() => handleDragStart(project.id, c.id, idx)}
                                onDragOver={e => handleDragOver(e, project.id, idx)}
                                onDrop={e => handleDrop(e, project, idx)}
                                onDragEnd={handleDragEnd}
                                className={`transition-colors ${isDropTarget ? 'border-t-2 border-brand-400' : ''}`}
                              >
                                {!isSortActive && (
                                  <td className="py-2 pr-2 w-6">
                                    <span
                                      className="cursor-grab text-gray-300 hover:text-gray-500 flex items-center"
                                      title="Reihenfolge ändern"
                                    >
                                      <GripVertical size={14} />
                                    </span>
                                  </td>
                                )}
                                <td className="py-2 pr-3">
                                  <input className="input py-1" placeholder="Max Mustermann"
                                    value={c.name} onChange={e => updateContact(project, c.id, 'name', e.target.value)} />
                                </td>
                                <td className="py-2 pr-3">
                                  <input className="input py-1" placeholder="Baufirma GmbH"
                                    value={c.company} onChange={e => updateContact(project, c.id, 'company', e.target.value)} />
                                </td>
                                <td className="py-2 pr-3">
                                  <input className="input py-1" placeholder="Rohbau"
                                    value={c.gewerk ?? ''} onChange={e => updateContact(project, c.id, 'gewerk', e.target.value)} />
                                </td>
                                <td className="py-2 pr-3">
                                  <input className="input py-1" placeholder="Bauleiter"
                                    value={c.role} onChange={e => updateContact(project, c.id, 'role', e.target.value)} />
                                </td>
                                <td className="py-2 pr-3">
                                  <input className="input py-1" type="email" placeholder="max@firma.de"
                                    value={c.email} onChange={e => updateContact(project, c.id, 'email', e.target.value)} />
                                </td>
                                <td className="py-2 pr-3">
                                  <input className="input py-1" type="tel" placeholder="+49 …"
                                    value={c.phone} onChange={e => updateContact(project, c.id, 'phone', e.target.value)} />
                                </td>
                                <td className="py-2">
                                  <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => removeContact(project, c.id)}>
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Participants list modal */}
      {participantsFor && (() => {
        const proj = projects.find(p => p.id === participantsFor)
        return proj ? (
          <BeteiligtenModal
            project={proj}
            logoDataUrl={logoDataUrl}
            onClose={() => setParticipantsFor(null)}
          />
        ) : null
      })()}

      {/* Import preview modal */}
      {importState && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Kontakte importieren</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {importState.contacts.length} Kontakt{importState.contacts.length !== 1 ? 'e' : ''} erkannt – Vorschau vor dem Übernehmen
                </p>
              </div>
              <button className="btn-ghost p-2" onClick={() => setImportState(null)}><X size={18} /></button>
            </div>

            {/* Preview table */}
            <div className="overflow-auto flex-1 px-6 py-4">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="text-left pb-2 pr-3">Name</th>
                    <th className="text-left pb-2 pr-3">Firma</th>
                    <th className="text-left pb-2 pr-3">Gewerk</th>
                    <th className="text-left pb-2 pr-3">Funktion</th>
                    <th className="text-left pb-2 pr-3"><span className="flex items-center gap-1"><Mail size={11} /> E-Mail</span></th>
                    <th className="text-left pb-2"><span className="flex items-center gap-1"><Phone size={11} /> Telefon</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importState.contacts.map(c => (
                    <tr key={c.id} className="text-xs">
                      <td className="py-1.5 pr-3 text-gray-800">{c.name || <span className="text-gray-300">–</span>}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{c.company || <span className="text-gray-300">–</span>}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{c.gewerk || <span className="text-gray-300">–</span>}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{c.role || <span className="text-gray-300">–</span>}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{c.email || <span className="text-gray-300">–</span>}</td>
                      <td className="py-1.5 text-gray-500">{c.phone || <span className="text-gray-300">–</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* CSV hint */}
            <div className="px-6 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              Unterstützte CSV-Spalten (Reihenfolge beliebig): <span className="font-medium text-gray-500">Name · Firma · Gewerk · Funktion / Role · E-Mail · Telefon / Phone</span>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button className="btn-secondary" onClick={() => setImportState(null)}>Abbrechen</button>
              <button className="btn-primary" onClick={confirmImport}>
                <CheckCircle2 size={15} /> {importState.contacts.length} Kontakt{importState.contacts.length !== 1 ? 'e' : ''} übernehmen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
