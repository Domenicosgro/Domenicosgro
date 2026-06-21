import React, { useState, useMemo } from 'react'
import { ArrowLeft, Search, Users, Mail, Phone, Building2, Wrench, X } from 'lucide-react'

export default function ContactDatabase({ projects, onBack }) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDir,   setSortDir]   = useState('asc')
  const [filterProject, setFilterProject] = useState('')
  const [filterCompany, setFilterCompany] = useState('')

  // Flatten all contacts from all projects
  const allContacts = useMemo(() => {
    const list = []
    for (const project of projects) {
      for (const contact of (project.contacts ?? [])) {
        if (!contact.name && !contact.company && !contact.email) continue
        list.push({ ...contact, _projectId: project.id, _projectName: project.name || 'Unbenanntes Projekt' })
      }
    }
    return list
  }, [projects])

  // Filter-Optionen für Projekt und Firma
  const projectOptions = useMemo(() => {
    const m = new Map()
    for (const c of allContacts) if (c._projectId) m.set(c._projectId, c._projectName)
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [allContacts])

  const companyOptions = useMemo(() => {
    const s = new Set()
    for (const c of allContacts) { const v = (c.company || '').trim(); if (v) s.add(v) }
    return [...s].sort((a, b) => a.localeCompare(b, 'de'))
  }, [allContacts])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    let base = allContacts
    if (filterProject) base = base.filter(c => c._projectId === filterProject)
    if (filterCompany) base = base.filter(c => (c.company || '').trim() === filterCompany)
    if (q) base = base.filter(c =>
      (c.name    || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.email   || '').toLowerCase().includes(q) ||
      (c.gewerk  || '').toLowerCase().includes(q) ||
      (c.role    || '').toLowerCase().includes(q) ||
      (c._projectName || '').toLowerCase().includes(q)
    )

    return [...base].sort((a, b) => {
      const av = (a[sortField] || a._projectName || '').toLowerCase()
      const bv = (b[sortField] || b._projectName || '').toLowerCase()
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [allContacts, q, filterProject, filterCompany, sortField, sortDir])

  const hasFilters = filterProject || filterCompany || search.trim()
  const clearFilters = () => { setFilterProject(''); setFilterCompany(''); setSearch('') }

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

  // Unique project count
  const projectCount = new Set(allContacts.map(c => c._projectId)).size

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
        <select className="select text-sm" style={{ maxWidth: '220px' }}
          value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">Alle Projekte</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select text-sm" style={{ maxWidth: '220px' }}
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
          <p className="text-sm text-gray-400 mt-1">Füge Kontakte über die Projektverwaltung hinzu.</p>
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
                <th className="text-left px-4 py-2.5 hidden md:table-cell"><SortBtn field="company">Firma</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden lg:table-cell"><SortBtn field="gewerk">Gewerk</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden lg:table-cell"><SortBtn field="role">Funktion</SortBtn></th>
                <th className="text-left px-4 py-2.5 hidden sm:table-cell">E-Mail / Telefon</th>
                <th className="text-left px-4 py-2.5"><SortBtn field="_projectName">Projekt</SortBtn></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c, i) => (
                <tr key={`${c._projectId}-${c.id || i}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.name || <span className="text-gray-300">–</span>}</td>
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
                    <span className="inline-block text-xs px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200">
                      {c._projectName}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} von {allContacts.length} Kontakten
          </div>
        </div>
      )}
    </div>
  )
}
