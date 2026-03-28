import React from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { emptyParticipant, uid } from '../utils'

export default function ParticipantsList({ participants, onChange }) {
  const add = () => onChange([...participants, emptyParticipant()])

  const update = (id, field, value) =>
    onChange(participants.map(p => p.id === id ? { ...p, [field]: value } : p))

  const remove = (id) => onChange(participants.filter(p => p.id !== id))

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title"><Users size={16} /> Teilnehmer</h2>
        <button className="btn-primary no-print" onClick={add}><Plus size={14} /> Hinzufügen</button>
      </div>

      {participants.length === 0 && (
        <p className="text-sm text-gray-400 italic">Keine Teilnehmer erfasst.</p>
      )}

      {participants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500 w-8">#</th>
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">Firma</th>
                <th className="text-left pb-2 pr-3 text-xs font-medium text-gray-500">Funktion</th>
                <th className="text-center pb-2 pr-3 text-xs font-medium text-gray-500">Anwesend</th>
                <th className="pb-2 text-xs font-medium text-gray-500 no-print"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participants.map((p, i) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <input
                      className="input py-1"
                      placeholder="Max Mustermann"
                      value={p.name}
                      onChange={e => update(p.id, 'name', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="input py-1"
                      placeholder="Baufirma GmbH"
                      value={p.company}
                      onChange={e => update(p.id, 'company', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="input py-1"
                      placeholder="Bauleiter"
                      value={p.role}
                      onChange={e => update(p.id, 'role', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-brand-600 cursor-pointer"
                      checked={p.present}
                      onChange={e => update(p.id, 'present', e.target.checked)}
                    />
                  </td>
                  <td className="py-2 no-print">
                    <button
                      className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => remove(p.id)}
                      title="Entfernen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
