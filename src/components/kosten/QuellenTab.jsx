import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { emptySource, QUELLEN_TYPEN } from '../../kosten/model'
import { TextCell, AreaCell, SelectCell } from './cells'

// Blatt „Quellen“ – Quellenregister mit Datei, Stand, Verwendung und Hinweis.
// Ohne diese Liste ist eine Kostenermittlung technisch nutzbar, aber fachlich
// nicht nachvollziehbar.

export default function QuellenTab({ draft, mutate }) {
  const sources = draft.sources ?? []

  const set = (id, patch) => mutate(p => ({ ...p, sources: p.sources.map(s => (s.id === id ? { ...s, ...patch } : s)) }))
  const add = ()          => mutate(p => ({ ...p, sources: [...(p.sources ?? []), emptySource()] }))
  const del = (id)        => mutate(p => ({ ...p, sources: p.sources.filter(s => s.id !== id) }))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-night">Quellenregister</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {sources.length} Quelle{sources.length !== 1 ? 'n' : ''}. BKI-Quelldateien, Pläne, Gutachten und
            Fachplanerstände sollten gemeinsam mit dieser Kostenermittlung in der Projektablage erhalten bleiben.
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={add}><Plus size={14} /> Quelle</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-concrete text-left text-xs">
              <th className="px-2 py-2 font-semibold text-night w-[46px]">Nr.</th>
              <th className="px-2 py-2 font-semibold text-night w-[26%]">Quelle / Datei</th>
              <th className="px-2 py-2 font-semibold text-night w-[12%]">Stand</th>
              <th className="px-2 py-2 font-semibold text-night">Verwendung</th>
              <th className="px-2 py-2 font-semibold text-night w-[22%]">Hinweis</th>
              <th className="px-2 py-2 font-semibold text-night w-[110px]">Typ</th>
              <th className="px-2 py-2 w-[40px]" />
            </tr>
          </thead>
          <tbody>
            {sources.map((s, i) => (
              <tr key={s.id} className="border-t border-gray-100 align-top">
                <td className="px-2 py-1.5 text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-1 py-0.5"><TextCell value={s.file} onChange={v => set(s.id, { file: v })} placeholder="Dateiname oder Bezeichnung" /></td>
                <td className="px-1 py-0.5"><TextCell value={s.stand} onChange={v => set(s.id, { stand: v })} placeholder="Q2/2026" /></td>
                <td className="px-1 py-0.5"><AreaCell value={s.usage} onChange={v => set(s.id, { usage: v })} rows={2} placeholder="Wofür wurde die Quelle verwendet?" /></td>
                <td className="px-1 py-0.5"><AreaCell value={s.note} onChange={v => set(s.id, { note: v })} rows={2} /></td>
                <td className="px-1 py-0.5">
                  <SelectCell value={s.type} onChange={v => set(s.id, { type: v })} options={QUELLEN_TYPEN.map(t => ({ value: t, label: t }))} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button className="text-gray-300 hover:text-red-600" onClick={() => del(s.id)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">Noch keine Quellen erfasst.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
