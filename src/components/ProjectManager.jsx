import React, { useState } from 'react'
import { Plus, Trash2, ArrowLeft, Users, FolderOpen, ChevronRight, ChevronDown, Mail, Phone } from 'lucide-react'
import { emptyContact } from '../utils'

export default function ProjectManager({ projects, onCreate, onUpdate, onDelete, onBack }) {
  const [expandedId, setExpandedId] = useState(() => projects.length === 1 ? projects[0]?.id : null)

  const handleCreate = () => {
    const id = onCreate()
    setExpandedId(id)
  }

  const updateContacts = (projectId, contacts) =>
    onUpdate(projectId, { contacts })

  const addContact = (project) =>
    updateContacts(project.id, [...(project.contacts ?? []), emptyContact()])

  const updateContact = (project, contactId, field, value) =>
    updateContacts(project.id, (project.contacts ?? []).map(c =>
      c.id === contactId ? { ...c, [field]: value } : c
    ))

  const removeContact = (project, contactId) =>
    updateContacts(project.id, (project.contacts ?? []).filter(c => c.id !== contactId))

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Zurück</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontakte verwalten</h1>
          <p className="text-sm text-gray-500 mt-0.5">Beteiligte Firmen und Personen für die Protokoll-Zuweisung</p>
        </div>
      </div>

      {projects.length === 0 && (
        <div className="card p-12 text-center">
          <FolderOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Noch keine Projekte angelegt</p>
          <p className="text-sm text-gray-400 mt-1">Erstelle ein Projekt und pflege die Kontakte (Firmen, Personen).</p>
        </div>
      )}

      <div className="space-y-3">
        {projects.map(project => {
          const expanded = expandedId === project.id
          const contacts = project.contacts ?? []
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
                <div className="flex items-center gap-2 no-print" onClick={e => e.stopPropagation()}>
                  <button
                    className="btn-primary"
                    title="Kontakt hinzufügen"
                    onClick={() => { setExpandedId(project.id); addContact(project) }}
                  >
                    <Plus size={14} /> Kontakt hinzufügen
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
                    </h3>
                    <button className="btn-primary btn-sm" onClick={() => addContact(project)}>
                      <Plus size={13} /> Kontakt hinzufügen
                    </button>
                  </div>

                  {contacts.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Keine Kontakte erfasst. Beteiligte Firmen und Personen hier eintragen.</p>
                  )}

                  {contacts.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-500">
                            <th className="text-left pb-2 pr-3">Name</th>
                            <th className="text-left pb-2 pr-3">Firma</th>
                            <th className="text-left pb-2 pr-3">Funktion</th>
                            <th className="text-left pb-2 pr-3">
                              <span className="flex items-center gap-1"><Mail size={11} /> E-Mail</span>
                            </th>
                            <th className="text-left pb-2 pr-3">
                              <span className="flex items-center gap-1"><Phone size={11} /> Telefon</span>
                            </th>
                            <th className="pb-2 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {contacts.map(c => (
                            <tr key={c.id}>
                              <td className="py-2 pr-3">
                                <input className="input py-1" placeholder="Max Mustermann"
                                  value={c.name} onChange={e => updateContact(project, c.id, 'name', e.target.value)} />
                              </td>
                              <td className="py-2 pr-3">
                                <input className="input py-1" placeholder="Baufirma GmbH"
                                  value={c.company} onChange={e => updateContact(project, c.id, 'company', e.target.value)} />
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
                          ))}
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
    </div>
  )
}
