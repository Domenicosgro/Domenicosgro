import React from 'react'
import { Plus, Trash2, Eye, EyeOff, Layers } from 'lucide-react'
import { emptyVariant } from '../../kosten/model'
import { fmtEur, fmtNum, fmtPct } from '../../kosten/calc'
import { TextCell, AreaCell } from './cells'

// Blatt „Varianten“ – Verwaltung der Vergleichsspalten.
//
// Wichtig für die Methodik: Grundriss und Fassade sind getrennt zu benennen.
// V2A/V2B können denselben Grundriss teilen und sich nur in der Fassade
// unterscheiden. Varianten werden nicht über versteckte Zuschläge verglichen,
// sondern über eigene sichtbare Kennwerte und Mengen.

export default function VariantenTab({ draft, result, mutate }) {
  const variants = draft.variants ?? []

  const setVariant = (id, patch) =>
    mutate(prev => ({ ...prev, variants: prev.variants.map(v => (v.id === id ? { ...v, ...patch } : v)) }))

  const addVariant = () => {
    const n = variants.length + 1
    const key = `V${n}`
    mutate(prev => ({
      ...prev,
      variants: [...prev.variants, { ...emptyVariant(key, `Variante ${n}`) }],
      // Neue Spalte mit den Werten der ersten Variante vorbelegen – sonst müsste
      // jede Position von Hand nachgetragen werden.
      positions: prev.positions.map(p => ({
        ...p,
        values: { ...p.values, [key]: p.values?.[prev.variants[0]?.key] ?? '' },
      })),
    }))
  }

  const renameKey = (id, oldKey, newKeyRaw) => {
    const newKey = newKeyRaw.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '')
    if (!newKey || newKey === oldKey) return
    if (variants.some(v => v.key === newKey)) {
      window.alert(`Das Kürzel „${newKey}“ ist bereits vergeben.`)
      return
    }
    mutate(prev => ({
      ...prev,
      variants: prev.variants.map(v => (v.id === id ? { ...v, key: newKey } : v)),
      positions: prev.positions.map(p => {
        const values = { ...p.values }
        if (oldKey in values) { values[newKey] = values[oldKey]; delete values[oldKey] }
        const qbv = { ...(p.qtyByVariant ?? {}) }
        if (oldKey in qbv) { qbv[newKey] = qbv[oldKey]; delete qbv[oldKey] }
        return { ...p, values, qtyByVariant: qbv }
      }),
    }))
  }

  const removeVariant = (v) => {
    if (variants.length <= 1) { window.alert('Mindestens eine Variante muss bestehen bleiben.'); return }
    if (!window.confirm(`Variante „${v.name}“ mit allen zugehörigen Kennwerten löschen?`)) return
    mutate(prev => ({
      ...prev,
      variants: prev.variants.filter(x => x.id !== v.id),
      positions: prev.positions.map(p => {
        const values = { ...p.values }; delete values[v.key]
        const qbv = { ...(p.qtyByVariant ?? {}) }; delete qbv[v.key]
        return { ...p, values, qtyByVariant: qbv }
      }),
    }))
  }

  const cheapest = result.vkeys.reduce(
    (best, vk) => (best === null || result.totals.byVariant[vk].sumNet < result.totals.byVariant[best].sumNet ? vk : best),
    null
  )

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 max-w-3xl leading-relaxed">
          Grundriss und Fassade getrennt benennen: Varianten können denselben Grundriss teilen und sich nur in der
          Fassadenausführung unterscheiden. Kostenunterschiede werden direkt in den Kennwert- und Mengenspalten der
          Positionen gepflegt – nicht über pauschale Zu- oder Abschläge.
        </p>
        <button className="btn-secondary text-sm flex-shrink-0" onClick={addVariant}><Plus size={14} /> Variante</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {variants.map(v => {
          const t = result.totals.byVariant[v.key]
          const isCheapest = v.key === cheapest
          const deltaToCheapest = t && cheapest ? t.sumNet - result.totals.byVariant[cheapest].sumNet : null
          return (
            <div key={v.id} className={`card p-3 space-y-2 border-l-4 ${v.active === false ? 'border-l-gray-300 opacity-60' : isCheapest ? 'border-l-green-500' : 'border-l-brand-500'}`}>
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-brand-600 flex-shrink-0" />
                <input
                  className="w-16 px-1.5 py-1 text-sm font-bold text-night bg-sky/20 border border-transparent hover:border-sky focus:outline-none focus:ring-1 focus:ring-brand-500"
                  defaultValue={v.key}
                  onBlur={e => renameKey(v.id, v.key, e.target.value)}
                  title="Spaltenkürzel – wird in allen Tabellen verwendet"
                />
                <div className="flex-1"><TextCell value={v.name} onChange={x => setVariant(v.id, { name: x })} placeholder="Bezeichnung" /></div>
                <button
                  className="text-gray-300 hover:text-brand-600 p-0.5"
                  title={v.active === false ? 'Variante einblenden' : 'Variante ausblenden (bleibt erhalten)'}
                  onClick={() => setVariant(v.id, { active: v.active === false })}
                >{v.active === false ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button className="text-gray-300 hover:text-red-600 p-0.5" title="Variante löschen" onClick={() => removeVariant(v)}>
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Grundriss</span>
                  <TextCell value={v.grundriss} onChange={x => setVariant(v.id, { grundriss: x })} placeholder="Grundriss 1" />
                </label>
                <label className="block">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Fassade</span>
                  <TextCell value={v.fassade} onChange={x => setVariant(v.id, { fassade: x })} placeholder="Blech / Holz" />
                </label>
              </div>

              <label className="block">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Beschreibung / Abgrenzung</span>
                <AreaCell value={v.description} onChange={x => setVariant(v.id, { description: x })} rows={3}
                          placeholder="Was unterscheidet diese Variante technisch und kostenseitig?" />
              </label>

              {t && v.active !== false && (
                <div className="pt-2 border-t border-concrete text-xs space-y-0.5">
                  <div className="flex justify-between"><span className="text-gray-500">Summe netto</span>
                    <b className="tabular-nums text-night">{fmtEur(t.sumNet)}</b></div>
                  <div className="flex justify-between"><span className="text-gray-500">Summe brutto</span>
                    <span className="tabular-nums text-gray-600">{fmtEur(t.sumGross)}</span></div>
                  {t.kennzahl !== null && (
                    <div className="flex justify-between"><span className="text-gray-500">je {draft.bezugKennzahlUnit || 'Einheit'}</span>
                      <span className="tabular-nums text-gray-600">{fmtNum(t.kennzahl)} €</span></div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">gegenüber günstigster</span>
                    <span className={`tabular-nums ${deltaToCheapest ? 'text-amber-700' : 'text-green-700'}`}>
                      {deltaToCheapest ? `+${fmtEur(deltaToCheapest)}` : 'günstigste Variante'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Positionen mit echtem Variantenunterschied */}
      <VariantDiff draft={draft} result={result} />
    </div>
  )
}

/** Zeigt, wo die Varianten sich tatsächlich unterscheiden – der Kern des Vergleichs. */
function VariantDiff({ draft, result }) {
  const { vkeys } = result
  if (vkeys.length < 2) return null

  const diffs = result.rows
    .map(row => {
      const nums = vkeys.map(vk => row.byVariant[vk]?.netto ?? 0)
      const min = Math.min(...nums), max = Math.max(...nums)
      return { row, min, max, spread: max - min }
    })
    .filter(d => Math.abs(d.spread) > 0.5)
    .sort((a, b) => b.spread - a.spread)

  return (
    <div className="card">
      <div className="px-3 py-2 border-b border-concrete">
        <h3 className="text-sm font-semibold text-night">Wo unterscheiden sich die Varianten?</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {diffs.length === 0
            ? 'Aktuell rechnen alle Varianten mit identischen Mengen und Kennwerten – der Vergleich zeigt noch keine Unterschiede.'
            : `${diffs.length} Position${diffs.length !== 1 ? 'en' : ''} mit abweichenden Nettokosten, absteigend nach Spreizung.`}
        </p>
      </div>
      {diffs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-concrete text-left text-xs">
                <th className="px-3 py-1.5 font-semibold text-night">Position</th>
                {vkeys.map(vk => <th key={vk} className="px-3 py-1.5 font-semibold text-night text-right">{vk}</th>)}
                <th className="px-3 py-1.5 font-semibold text-amber-700 text-right">Spreizung</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map(({ row, spread }) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">
                    <span className="tabular-nums text-gray-500 mr-2">KG {row.pos.kg3 || row.pos.kg2}</span>
                    <span className="text-gray-700">{row.pos.measure || row.pos.label}</span>
                  </td>
                  {vkeys.map(vk => (
                    <td key={vk} className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmtEur(row.byVariant[vk]?.netto)}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-amber-700">{fmtEur(spread)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
