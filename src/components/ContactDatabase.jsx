import React, { useState, useMemo, useCallback } from 'react'
import { ArrowLeft, Search, Users, Mail, Phone, Building2, Wrench, X, Plus, Pencil, Download } from 'lucide-react'
import { uid } from '../utils'

// ── Kategorien ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'auftraggeber', label: 'Auftraggeber',        badge: 'badge-blue'   },
  { value: 'planer',       label: 'Planer',              badge: 'badge-green'  },
  { value: 'ausfuehrend',  label: 'Ausführende Firma',   badge: 'badge-yellow' },
  { value: 'organisation', label: 'Eigene Organisation', badge: 'badge-gray'   },
  { value: 'nutzer',       label: 'Nutzer',              badge: 'badge-gray'   },
]

function categoryInfo(value) {
  return CATEGORIES.find(c => c.value === value) || null
}

function CategoryBadge({ value }) {
  const cat = categoryInfo(value)
  if (!cat) return null
  return <span className={`badge ${cat.badge} whitespace-nowrap`}>{cat.label}</span>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDedupKey(contact) {
  const emailKey = (contact.email || '').trim().toLowerCase()
  const nameKey  = `${(contact.name || '').trim().toLowerCase()}|||${(contact.company || '').trim().toLowerCase()}`
  return emailKey || nameKey || null
}

function findInProject(project, dedupKey) {
  if (!dedupKey) return null
  for (const c of (project.contacts || [])) {
    if (getDedupKey(c) === dedupKey) return c
  }
  return null
}

// ── Outlook-CSV-Export ────────────────────────────────────────────────────────
// Outlook.com erfordert exakt 16 Spalten mit deutschen Bezeichnungen und
// eine E-Mail-Adresse je Kontakt. Firma/Telefon/Kategorie kommen in Notizen.
const OUTLOOK_CHUNK = 40

// Exakt die 16 Spalten aus der offiziellen Outlook.com-Importvorlage:
const OUTLOOK_HEADERS = [
  'Kontaktperson', 'Vorname', 'Nachname', 'E-Mail', 'Unternehmen',
  'Telefon (geschäftlich)', 'Mobiltelefon', 'Faxnummer', 'Titel', 'Website',
  'Straße und Hausnummer', 'Straße und Hausnummer 2', 'Ort', 'Bundesland',
  'Postleitzahl', 'Land oder Region',
]

function exportOutlookCsv(contacts, baseFilename = 'Kontakte_Outlook') {
  const valid = contacts.filter(c => (c.email || '').trim())
  if (!valid.length) {
    alert('Keine Kontakte mit E-Mail-Adresse gefunden.\nOutlook.com erfordert eine E-Mail-Adresse pro Kontakt.')
    return 0
  }

  const wrap = v => {
    const s = String(v ?? '')
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s
  }

  const buildCsv = chunk => {
    const rows = chunk.map(c => {
      const parts     = (c.name || '').trim().split(/\s+/)
      const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '')
      const lastName  = parts.length > 1 ? parts[parts.length - 1] : ''
      const titel     = [c.role, c.gewerk].filter(Boolean).join(' · ')
      return [
        c.name || '',   // Kontaktperson (Anzeigename)
        firstName,      // Vorname
        lastName,       // Nachname
        c.email || '',  // E-Mail
        c.company || '', // Unternehmen
        c.phone || '',  // Telefon (geschäftlich)
        '', '',         // Mobiltelefon, Faxnummer
        titel,          // Titel (Funktion · Gewerk)
        '',             // Website
        '', '', '', '', '', '', // Adressfelder
      ].map(wrap).join(',')
    })
    return '﻿' + [OUTLOOK_HEADERS.join(','), ...rows].join('\r\n')
  }

  const chunks = []
  for (let i = 0; i < valid.length; i += OUTLOOK_CHUNK) chunks.push(valid.slice(i, i + OUTLOOK_CHUNK))
  const total = chunks.length

  chunks.forEach((chunk, idx) => {
    const filename = total > 1
      ? `${baseFilename}_Teil${idx + 1}_von_${total}.csv`
      : `${baseFilename}.csv`
    setTimeout(() => {
      const blob = new Blob([buildCsv(chunk)], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), { href: url, download: filename }).click()
      URL.revokeObjectURL(url)
    }, idx * 600)
  })
  return valid.length
}

// ── Contact modal (add + edit) ────────────────────────────────────────────────

function ContactModal({ contact, isNew, allProjects, suggestions, onSave, onClose }) {
  const [form, setForm] = useState({
    name:     contact.name     || '',
    company:  contact.company  || '',
    gewerk:   contact.gewerk   || '',
    role:     contact.role     || '',
    email:    contact.email    || '',
    phone:    contact.phone    || '',
    category: contact.category || '',
  })
  const [selProjects, setSelProjects] = useState(
    () => new Set((contact._projects || []).map(p => p.id))
  )

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }))

  const toggle = (id) => setSelProjects(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const hasProject = selProjects.size > 0
  const canSave    = (form.name.trim() || form.company.trim() || form.email.trim()) && hasProject

  const handleSave = () => {
    const oldKey = isNew ? null : getDedupKey(contact)
    onSave({ ...form }, [...selProjects], oldKey)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-2xl bg-white flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="font-semibold text-night">{isNew ? 'Neuer Kontakt' : 'Kontakt bearbeiten'}</h2>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input className="input w-full" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Vor- und Nachname" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Firma</label>
            <input className="input w-full" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Unternehmensname" list="cdb-companies" autoComplete="off" />
            <datalist id="cdb-companies">
              {(suggestions?.companies || []).map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kategorie</label>
            <select className="select w-full" value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="">– keine Angabe –</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Funktion</label>
            <input className="input w-full" value={form.role} onChange={e => set('role', e.target.value)} placeholder="z.B. Bauleiter, Planer" list="cdb-roles" autoComplete="off" />
            <datalist id="cdb-roles">
              {(suggestions?.roles || []).map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Gewerk</label>
            <input className="input w-full" value={form.gewerk} onChange={e => set('gewerk', e.target.value)} placeholder="z.B. Elektro, Rohbau, HVLS" list="cdb-gewerke" autoComplete="off" />
            <datalist id="cdb-gewerke">
              {(suggestions?.gewerke || []).map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">E-Mail</label>
            <input className="input w-full" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="kontakt@firma.de" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Telefon</label>
            <input className="input w-full" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+49 …" />
          </div>

          {/* Project assignment */}
          <div className="col-span-full">
            <label className="block text-xs text-gray-500 mb-2">
              Projektzuordnung <span className="text-gray-400">(mindestens 1)</span>
            </label>
            <div className="border border-gray-200 divide-y divide-gray-100 max-h-44 overflow-y-auto">
              {allProjects.length === 0 && (
                <p className="text-xs text-gray-400 p-3">Keine Projekte vorhanden.</p>
              )}
              {allProjects.map(p => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-brand-600 flex-shrink-0"
                    checked={selProjects.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="text-sm text-gray-700 truncate">{p.name || 'Unbenanntes Projekt'}</span>
                </label>
              ))}
            </div>
            {!hasProject && (
              <p className="text-xs text-amber-600 mt-1">Bitte mindestens ein Projekt auswählen.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-200">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {isNew ? 'Kontakt anlegen' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContactDatabase({ projects, onUpdate, onBack }) {
  const [search,          setSearch]          = useState('')
  const [sortField,       setSortField]       = useState('name')
  const [sortDir,         setSortDir]         = useState('asc')
  const [filterProject,   setFilterProject]   = useState('')
  const [filterCompany,   setFilterCompany]   = useState('')
  const [filterCategory,  setFilterCategory]  = useState('')
  const [editContact,     setEditContact]     = useState(null)
  const [showNew,         setShowNew]         = useState(false)

  // Flatten + deduplicate contacts from all projects
  const allContacts = useMemo(() => {
    const list = []
    const seen = new Map()
    for (const project of projects) {
      for (const contact of (project.contacts ?? [])) {
        if (!contact.name && !contact.company && !contact.email) continue
        const key  = getDedupKey(contact)
        const proj = { id: project.id, name: project.name || 'Unbenanntes Projekt' }
        if (key && seen.has(key)) {
          list[seen.get(key)]._projects.push(proj)
        } else {
          const entry = { ...contact, _projectId: project.id, _projectName: project.name || 'Unbenanntes Projekt', _projects: [proj] }
          if (key) seen.set(key, list.length)
          list.push(entry)
        }
      }
    }
    return list
  }, [projects])

  const projectOptions = useMemo(() => {
    const m = new Map()
    for (const c of allContacts) for (const p of c._projects) if (p.id) m.set(p.id, p.name)
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [allContacts])

  const companyOptions = useMemo(() => {
    const s = new Set()
    for (const c of allContacts) { const v = (c.company || '').trim(); if (v) s.add(v) }
    return [...s].sort((a, b) => a.localeCompare(b, 'de'))
  }, [allContacts])

  const suggestions = useMemo(() => {
    const collect = (field) => {
      const s = new Set()
      for (const c of allContacts) { const v = (c[field] || '').trim(); if (v) s.add(v) }
      return [...s].sort((a, b) => a.localeCompare(b, 'de'))
    }
    return { companies: companyOptions, gewerke: collect('gewerk'), roles: collect('role') }
  }, [allContacts, companyOptions])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    let base = allContacts
    if (filterProject)  base = base.filter(c => c._projects.some(p => p.id === filterProject))
    if (filterCompany)  base = base.filter(c => (c.company || '').trim() === filterCompany)
    if (filterCategory) base = base.filter(c => (c.category || '') === filterCategory)
    if (q) base = base.filter(c =>
      (c.name     || '').toLowerCase().includes(q) ||
      (c.company  || '').toLowerCase().includes(q) ||
      (c.email    || '').toLowerCase().includes(q) ||
      (c.gewerk   || '').toLowerCase().includes(q) ||
      (c.role     || '').toLowerCase().includes(q) ||
      (c.category ? (categoryInfo(c.category)?.label || '').toLowerCase().includes(q) : false) ||
      (c._projectName || '').toLowerCase().includes(q)
    )
    return [...base].sort((a, b) => {
      const av = (a[sortField] || a._projectName || '').toLowerCase()
      const bv = (b[sortField] || b._projectName || '').toLowerCase()
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [allContacts, q, filterProject, filterCompany, filterCategory, sortField, sortDir])

  const hasFilters   = filterProject || filterCompany || filterCategory || search.trim()
  const clearFilters = () => { setFilterProject(''); setFilterCompany(''); setFilterCategory(''); setSearch('') }

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortBtn = ({ field, children }) => (
    <button
      className="flex items-center gap-1 font-medium hover:text-brand-600 transition-colors"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && <span className="text-brand-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )

  // ── Save handler (add + edit) ─────────────────────────────────────────────
  const handleSave = useCallback((fields, nextProjectIds, oldKey) => {
    if (!onUpdate) return
    const nextSet = new Set(nextProjectIds)

    for (const project of projects) {
      const wasIn    = oldKey ? !!findInProject(project, oldKey) : false
      const willBeIn = nextSet.has(project.id)

      if (!wasIn && !willBeIn) continue

      const contacts = [...(project.contacts || [])]

      if (wasIn && willBeIn) {
        const updated = contacts.map(c =>
          getDedupKey(c) === oldKey ? { ...c, ...fields } : c
        )
        onUpdate(project.id, { contacts: updated })
      } else if (!wasIn && willBeIn) {
        onUpdate(project.id, { contacts: [...contacts, { id: uid(), ...fields }] })
      } else {
        onUpdate(project.id, { contacts: contacts.filter(c => getDedupKey(c) !== oldKey) })
      }
    }
  }, [projects, onUpdate])

  // Kategorie direkt in der Tabelle ändern – aktualisiert den Kontakt in allen zugeordneten Projekten
  const handleCategoryChange = useCallback((contact, newCategory) => {
    if (!onUpdate) return
    const key = getDedupKey(contact)
    for (const project of projects) {
      const contacts = project.contacts || []
      const idx = key ? contacts.findIndex(c => getDedupKey(c) === key) : -1
      if (idx === -1) continue
      const updated = contacts.map((c, i) => i === idx ? { ...c, category: newCategory } : c)
      onUpdate(project.id, { contacts: updated })
    }
  }, [projects, onUpdate])

  const projectCount = new Set(allContacts.flatMap(c => c._projects.map(p => p.id))).size

  const emptyEntry = { name: '', company: '', gewerk: '', role: '', email: '', phone: '', category: '', _projects: [] }

  return (
    <div className="app-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-stretch justify-between gap-4">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Dashboard
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users size={22} className="text-brand-600" /> Kontaktdatenbank
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {allContacts.length} Kontakt{allContacts.length !== 1 ? 'e' : ''} aus {projectCount} Projekt{projectCount !== 1 ? 'en' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          {filtered.length > 0 && (
            <button className="btn-secondary" title="Aktuelle Auswahl als Outlook-kompatible CSV exportieren"
              onClick={() => {
                const suffix = hasFilters ? '_gefiltert' : '_alle'
                exportOutlookCsv(filtered, `Kontakte${suffix}_Outlook`)
              }}>
              <Download size={15} />
              {(() => {
                const validCount = filtered.filter(c => (c.email || '').trim()).length
                const skipped    = filtered.length - validCount
                const files      = Math.ceil(validCount / OUTLOOK_CHUNK)
                let label = hasFilters ? `${validCount} exportieren (gefiltert)` : `Alle ${validCount} exportieren`
                if (skipped > 0) label += ` · ${skipped} ohne E-Mail`
                if (files > 1)   label += ` · ${files} Dateien`
                return label
              })()}
            </button>
          )}
          {onUpdate && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={15} /> Neuer Kontakt
            </button>
          )}
        </div>
      </div>

      {/* Suche + Filter */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Kontakte durchsuchen (Name, Firma, E-Mail, Gewerk, Projekt…)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select text-sm" style={{ maxWidth: '200px' }}
          value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="select text-sm" style={{ maxWidth: '200px' }}
          value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">Alle Projekte</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select text-sm" style={{ maxWidth: '200px' }}
          value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">Alle Firmen</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasFilters && (
          <button className="btn-ghost text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            onClick={clearFilters}>
            <X size={12} /> Zurücksetzen
          </button>
        )}
      </div>

      {/* Table */}
      {allContacts.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Keine Kontakte vorhanden</p>
          <p className="text-sm text-gray-400 mt-1">
            {onUpdate
              ? 'Lege den ersten Kontakt mit „Neuer Kontakt" an oder füge Kontakte über die Projektverwaltung hinzu.'
              : 'Füge Kontakte über die Projektverwaltung hinzu.'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400">
            {search.trim() ? `Keine Kontakte gefunden für „${search}"` : 'Keine Kontakte entsprechen den gewählten Filtern.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <th className="text-left px-4 py-2.5"><SortBtn field="name">Name</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden sm:table-cell"><SortBtn field="category">Kategorie</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell"><SortBtn field="company">Firma</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden lg:table-cell"><SortBtn field="gewerk">Gewerk</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden lg:table-cell"><SortBtn field="role">Funktion</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden sm:table-cell">E-Mail / Telefon</th>
                <th className="text-left px-4 py-2.5"><SortBtn field="_projectName">Projekt</SortBtn></th>
                {onUpdate && <th className="w-10 px-2 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c, i) => (
                <tr key={`${c._projectId}-${c.id || i}`} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.name || <span className="text-gray-300">–</span>}</td>
                  <td className="px-3 py-1.5 hidden sm:table-cell">
                    {onUpdate ? (
                      <select
                        className="select text-xs py-1 px-2"
                        value={c.category || ''}
                        onChange={e => handleCategoryChange(c, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">–</option>
                        {CATEGORIES.map(cat => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                    ) : (
                      c.category ? <CategoryBadge value={c.category} /> : <span className="text-gray-300">–</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 hidden md:table-cell">
                    {c.company ? <span className="flex items-center gap-1"><Building2 size={11} className="text-gray-400" />{c.company}</span> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 hidden lg:table-cell">
                    {c.gewerk ? <span className="flex items-center gap-1"><Wrench size={11} className="text-gray-400" />{c.gewerk}</span> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden lg:table-cell">{c.role || <span className="text-gray-300">–</span>}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <div className="space-y-0.5">
                      {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-brand-600 hover:underline text-xs"><Mail size={11} />{c.email}</a>}
                      {c.phone && <span className="flex items-center gap-1 text-gray-500 text-xs"><Phone size={11} />{c.phone}</span>}
                      {!c.email && !c.phone && <span className="text-gray-300">–</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c._projects.map(p => (
                        <span key={p.id} className="inline-block text-xs px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  {onUpdate && (
                    <td className="px-2 py-2.5">
                      <button
                        className="p-1 text-gray-300 hover:text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Kontakt bearbeiten"
                        onClick={() => setEditContact(c)}
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} von {allContacts.length} Kontakten
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editContact && (
        <ContactModal
          contact={editContact}
          isNew={false}
          allProjects={projects}
          suggestions={suggestions}
          onSave={handleSave}
          onClose={() => setEditContact(null)}
        />
      )}

      {/* New contact modal */}
      {showNew && (
        <ContactModal
          contact={emptyEntry}
          isNew={true}
          allProjects={projects}
          suggestions={suggestions}
          onSave={handleSave}
          onClose={() => setShowNew(false)}
        />
      )}

    </div>
  )
}
