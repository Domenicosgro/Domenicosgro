import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Search, AlertCircle } from 'lucide-react'
import { emptyParameter } from '../../kosten/model'
import { evalParameters, fmtNum } from '../../kosten/calc'
import { referencedNames } from '../../kosten/formula'
import { ValueCell, TextCell } from './cells'

// Blatt „Parameter“ – zentrale Eingaben und Bezugsgrößen.
// Jeder Parameter hat einen Formelnamen, unter dem er in Mengen, Kennwerten und
// anderen Parametern referenziert werden kann.

export default function ParameterTab({ draft, mutate, lookup }) {
  const [filter, setFilter] = useState('')
  const values = useMemo(() => evalParameters(draft), [draft])

  const params = draft.parameters ?? []
  const groups = useMemo(() => {
    const seen = []
    for (const p of params) if (p.group && !seen.includes(p.group)) seen.push(p.group)
    return seen
  }, [params])

  // Welcher Parameter wird von wem verwendet? Zeigt, was ein Wert auslöst.
  const usage = useMemo(() => {
    const map = {}
    const note = (name, where) => {
      const key = String(name).toUpperCase()
      ;(map[key] ??= new Set()).add(where)
    }
    for (const p of params) referencedNames(p.value).forEach(n => note(n, `Parameter ${p.key || p.name}`))
    for (const pos of draft.positions ?? []) {
      const where = `KG ${pos.kg3 || pos.kg2}`
      referencedNames(pos.qty).forEach(n => note(n, where))
      Object.values(pos.qtyByVariant ?? {}).forEach(v => referencedNames(v).forEach(n => note(n, where)))
      Object.values(pos.values ?? {}).forEach(v => referencedNames(v).forEach(n => note(n, where)))
    }
    for (const key of ['ust', 'regionalfaktor', 'preisindex', 'budget']) {
      referencedNames(draft[key]).forEach(n => note(n, 'Kopfdaten'))
    }
    referencedNames(draft.bezugKennzahl ? `=${draft.bezugKennzahl}` : '').forEach(n => note(n, 'Kennzahl'))
    for (const ref of draft.bkiRef ?? []) {
      referencedNames(ref.bezug ? `=${ref.bezug}` : '').forEach(n => note(n, `BKI-Referenz KG ${ref.kg}`))
    }
    return map
  }, [params, draft])

  const q = filter.trim().toLowerCase()
  const visible = q
    ? params.filter(p => [p.name, p.key, p.group, p.definition, p.source].some(v => String(v ?? '').toLowerCase().includes(q)))
    : params

  const setParam = (id, patch) =>
    mutate(prev => ({ ...prev, parameters: prev.parameters.map(p => (p.id === id ? { ...p, ...patch } : p)) }))

  const addParam = (group = '') =>
    mutate(prev => ({ ...prev, parameters: [...prev.parameters, { ...emptyParameter(group) }] }))

  const removeParam = (id) =>
    mutate(prev => ({ ...prev, parameters: prev.parameters.filter(p => p.id !== id) }))

  // Doppelte Formelnamen würden stillschweigend den zuletzt gesetzten gewinnen lassen.
  const duplicates = useMemo(() => {
    const count = {}
    for (const p of params) {
      const k = String(p.key ?? '').trim().toUpperCase()
      if (k) count[k] = (count[k] ?? 0) + 1
    }
    return new Set(Object.entries(count).filter(([, n]) => n > 1).map(([k]) => k))
  }, [params])

  const rows = q ? [{ group: null, items: visible }] : groupBy(visible, groups)

  return (
    <div className="space-y-4">

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-7 w-64"
            placeholder="Parameter suchen …"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{params.length} Parameter</span>
          <button className="btn-secondary text-sm" onClick={() => addParam()}>
            <Plus size={14} /> Parameter
          </button>
        </div>
      </div>

      {duplicates.size > 0 && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 flex items-center gap-1.5">
          <AlertCircle size={12} /> Mehrfach vergebene Formelnamen: {[...duplicates].join(', ')} – Formeln lösen den zuletzt gefundenen Wert auf.
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-concrete text-left text-xs">
              <th className="px-2 py-2 font-semibold text-night w-[16%]">Parameter</th>
              <th className="px-2 py-2 font-semibold text-night w-[12%]">Formelname</th>
              <th className="px-2 py-2 font-semibold text-night w-[22%]">Definition / Annahme</th>
              <th className="px-2 py-2 font-semibold text-night w-[11%] text-right">Wert</th>
              <th className="px-2 py-2 font-semibold text-night w-[7%]">Einheit</th>
              <th className="px-2 py-2 font-semibold text-gray-500 w-[9%] text-right">Ergebnis</th>
              <th className="px-2 py-2 font-semibold text-night w-[18%]">Quelle / Status</th>
              <th className="px-2 py-2 w-[5%]" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ group, items }) => (
              <React.Fragment key={group ?? '_alle'}>
                {group && (
                  <tr className="bg-gray-50 border-t border-concrete">
                    <td colSpan={8} className="px-2 py-1.5 text-xs font-semibold text-brand-700 uppercase tracking-wide">
                      {group}
                      <button className="ml-2 text-gray-400 hover:text-brand-600 font-normal normal-case" onClick={() => addParam(group)}>
                        + Zeile
                      </button>
                    </td>
                  </tr>
                )}
                {items.map(p => {
                  const res  = values[p.id]
                  const used = usage[String(p.key ?? '').toUpperCase()]
                  return (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/60 align-top">
                      <td className="px-1 py-0.5"><TextCell value={p.name} onChange={v => setParam(p.id, { name: v })} placeholder="Bezeichnung" /></td>
                      <td className="px-1 py-0.5">
                        <TextCell
                          value={p.key}
                          onChange={v => setParam(p.id, { key: v.trim().toUpperCase().replace(/[^A-Z0-9_ÄÖÜ]/g, '_') })}
                          placeholder="BGF_GES"
                          title={used ? `Verwendet in: ${[...used].join(', ')}` : 'Noch nirgends verwendet'}
                        />
                        {used && <div className="text-[10px] text-gray-400 px-1.5 truncate" title={[...used].join(', ')}>{used.size}× verwendet</div>}
                      </td>
                      <td className="px-1 py-0.5"><TextCell value={p.definition} onChange={v => setParam(p.id, { definition: v })} /></td>
                      <td className="px-1 py-0.5"><ValueCell value={p.value} onChange={v => setParam(p.id, { value: v })} lookup={lookup} placeholder="Zahl oder =Formel" /></td>
                      <td className="px-1 py-0.5"><TextCell value={p.unit} onChange={v => setParam(p.id, { unit: v })} /></td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                        {res?.error
                          ? <span className="text-red-600 text-xs" title={res.error}>#FEHLER</span>
                          : fmtNum(res?.value)}
                      </td>
                      <td className="px-1 py-0.5"><TextCell value={p.source} onChange={v => setParam(p.id, { source: v })} /></td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          className="text-gray-300 hover:text-red-600"
                          title={used ? `Achtung: wird in ${used.size} Stelle(n) verwendet` : 'Parameter löschen'}
                          onClick={() => {
                            if (used && !window.confirm(`„${p.key}“ wird in ${used.size} Stelle(n) verwendet. Wirklich löschen?`)) return
                            removeParam(p.id)
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-400">
                {q ? 'Kein Parameter passt zur Suche.' : 'Noch keine Parameter erfasst.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Werte dürfen Formeln sein und beginnen dann mit <code className="bg-concrete px-1">=</code>, z. B.
        <code className="bg-concrete px-1 mx-1">=PERIMETER*AF_STREIFEN</code>. Verfügbar sind die Grundrechenarten,
        Klammern sowie <code className="bg-concrete px-1">MIN</code>, <code className="bg-concrete px-1">MAX</code>,
        <code className="bg-concrete px-1">ROUND</code>, <code className="bg-concrete px-1">SUM</code> und
        <code className="bg-concrete px-1">WENN</code>. Umsatzsteuer, Regionalfaktor und Preisindex stehen in den Kopfdaten.
      </p>
    </div>
  )
}

function groupBy(items, order) {
  const map = new Map()
  for (const it of items) {
    const g = it.group || 'Ohne Gruppe'
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(it)
  }
  const sorted = [...map.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return sorted.map(g => ({ group: g, items: map.get(g) }))
}
