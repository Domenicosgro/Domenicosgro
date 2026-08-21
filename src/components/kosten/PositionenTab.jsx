import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Copy, ChevronDown, ChevronRight, Search, Percent, Euro, Sigma, Database } from 'lucide-react'
import {
  emptyPosition, ANSATZ_TYPEN, POS_STATUS, POS_MODES, PERCENT_BASES,
  ansatzBadge, posStatusBadge,
} from '../../kosten/model'
import { fmtEur, fmtNum, fmtPct } from '../../kosten/calc'
import { KG2, kg2For, kg3For, kg2Label, kg3Label, kg1Of, kg2Of, UNITS } from '../../kosten/din276'
import { uid } from '../../utils'
import { ValueCell, TextCell, SelectCell, ResultCell } from './cells'
import { isFormula } from '../../kosten/formula'

// Blatt „Positionen“ – KG 300 auf der 3. Ebene, übrige Kostengruppen auf der
// 2. Ebene. Je Variante eine eigene, sichtbare Kennwert-Spalte.

const KG_FILTER = [
  { value: 'alle', label: 'Alle Kostengruppen' },
  { value: '200',  label: 'KG 200 · Vorbereitende Maßnahmen' },
  { value: '300',  label: 'KG 300 · Baukonstruktionen' },
  { value: '400',  label: 'KG 400 · Technische Anlagen' },
  { value: '500',  label: 'KG 500 · Außenanlagen' },
  { value: '600',  label: 'KG 600 · Ausstattung' },
  { value: '700',  label: 'KG 700 · Baunebenkosten' },
]

export default function PositionenTab({ draft, result, mutate, lookup }) {
  const { vkeys, variants } = result
  const [kgFilter,   setKgFilter]   = useState('300')
  const [statusFlt,  setStatusFlt]  = useState('alle')
  const [search,     setSearch]     = useState('')
  const [showBki,    setShowBki]    = useState(true)
  const [showNetto,  setShowNetto]  = useState(true)
  const [collapsed,  setCollapsed]  = useState(() => new Set())

  const rowById = useMemo(
    () => Object.fromEntries(result.rows.map(r => [r.id, r])),
    [result.rows]
  )

  const positions = draft.positions ?? []
  const q = search.trim().toLowerCase()

  const visible = positions.filter(p => {
    if (kgFilter !== 'alle' && String(kg1Of(p.kg1 ?? p.kg2)) !== kgFilter) return false
    if (statusFlt !== 'alle' && p.status !== statusFlt) return false
    if (q && ![p.measure, p.label, p.source, p.note, p.kg2, p.kg3].some(v => String(v ?? '').toLowerCase().includes(q))) return false
    return true
  })

  // Gruppierung nach 2. Ebene mit Zwischensummen
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of visible) {
      const g = Number(p.kg2 || kg2Of(p.kg3) || 0)
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(p)
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([kg, items]) => ({
        kg,
        label: kg2Label(kg),
        items,
        sums: Object.fromEntries(vkeys.map(vk => [
          vk, items.reduce((s, p) => s + (rowById[p.id]?.byVariant?.[vk]?.netto ?? 0), 0),
        ])),
      }))
  }, [visible, vkeys, rowById])

  const setPos = (id, patch) =>
    mutate(prev => ({ ...prev, positions: prev.positions.map(p => (p.id === id ? { ...p, ...patch } : p)) }))

  const setPosValue = (id, vk, value) =>
    mutate(prev => ({
      ...prev,
      positions: prev.positions.map(p => (p.id === id ? { ...p, values: { ...p.values, [vk]: value } } : p)),
    }))

  const addPosition = (kg2) => {
    const kg1 = kgFilter === 'alle' ? 300 : Number(kgFilter)
    const pos = {
      ...emptyPosition(kg1),
      kg2: kg2 ?? (kg2For(kg1)[0]?.kg ?? ''),
      unit: kg1 === 700 ? '%' : 'm²',
      mode: kg1 === 700 ? 'percent' : 'unit',
      values: Object.fromEntries(vkeys.map(vk => [vk, ''])),
    }
    pos.label = kg2Label(pos.kg2)
    mutate(prev => ({ ...prev, positions: [...prev.positions, pos] }))
  }

  const duplicate = (p) =>
    mutate(prev => {
      const idx = prev.positions.findIndex(x => x.id === p.id)
      const copy = { ...structuredClone(p), id: uid() }
      const next = [...prev.positions]
      next.splice(idx + 1, 0, copy)
      return { ...prev, positions: next }
    })

  const removePosition = (id) =>
    mutate(prev => ({ ...prev, positions: prev.positions.filter(p => p.id !== id) }))

  /** BKI-Wert in alle Variantenspalten übernehmen. */
  const applyBki = (p, which) => {
    const value = p[which === 'von' ? 'bkiVon' : which === 'mittel' ? 'bkiMittel' : 'bkiBis']
    if (value === '' || value === null || value === undefined) return
    setPos(p.id, {
      values: Object.fromEntries(vkeys.map(vk => [vk, String(value)])),
      ansatz: `bki-${which}`,
    })
  }

  const toggleGroup = (kg) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(kg) ? next.delete(kg) : next.add(kg)
    return next
  })

  const colSpan = 4 + (showBki ? 3 : 0) + vkeys.length + (showNetto ? vkeys.length : 0) + 3

  return (
    <div className="space-y-4">

      {/* ── Filterleiste ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="select w-auto text-sm" value={kgFilter} onChange={e => setKgFilter(e.target.value)}>
          {KG_FILTER.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select className="select w-auto text-sm" value={statusFlt} onChange={e => setStatusFlt(e.target.value)}>
          <option value="alle">Jeder Reifegrad</option>
          {POS_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-7 w-56 text-sm" placeholder="Maßnahme suchen …" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showBki} onChange={e => setShowBki(e.target.checked)} /> BKI-Spalten
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showNetto} onChange={e => setShowNetto(e.target.checked)} /> Nettokosten
        </label>
        <span className="text-xs text-gray-400 ml-auto">{visible.length} von {positions.length} Positionen</span>
        <button className="btn-secondary text-sm" onClick={() => addPosition()}>
          <Plus size={14} /> Position
        </button>
      </div>

      {/* ── Tabelle ──────────────────────────────────────────────────────── */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 1250 + vkeys.length * 210 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-concrete text-left text-xs">
              <th className="px-2 py-2 font-semibold text-night w-[90px]">KG</th>
              <th className="px-2 py-2 font-semibold text-night min-w-[260px]">Maßnahme / Abgrenzung</th>
              <th className="px-2 py-2 font-semibold text-night w-[110px] text-right">Menge</th>
              <th className="px-2 py-2 font-semibold text-night w-[70px]">Einheit</th>
              {showBki && <>
                <th className="px-2 py-2 font-semibold text-gray-500 w-[80px] text-right">BKI von</th>
                <th className="px-2 py-2 font-semibold text-gray-500 w-[80px] text-right">BKI Mittel</th>
                <th className="px-2 py-2 font-semibold text-gray-500 w-[80px] text-right">BKI bis</th>
              </>}
              {variants.map(v => (
                <th key={v.key} className="px-2 py-2 font-semibold text-brand-700 w-[100px] text-right" title={`${v.name}\n${v.description ?? ''}`}>
                  Gewählt {v.key}
                </th>
              ))}
              {showNetto && variants.map(v => (
                <th key={v.key} className="px-2 py-2 font-semibold text-night w-[110px] text-right bg-gray-100" title={`Nettokosten ${v.name}`}>
                  Netto {v.key}
                </th>
              ))}
              <th className="px-2 py-2 font-semibold text-night w-[105px]">Ansatz</th>
              <th className="px-2 py-2 font-semibold text-night w-[130px]">Reifegrad</th>
              <th className="px-2 py-2 font-semibold text-night min-w-[200px]">Quelle / Herleitung</th>
              <th className="px-2 py-2 w-[54px]" />
            </tr>
          </thead>

          <tbody>
            {groups.map(g => {
              const isCollapsed = collapsed.has(g.kg)
              return (
                <React.Fragment key={g.kg}>
                  <tr className="bg-gray-50 border-t border-concrete">
                    <td colSpan={2} className="px-2 py-1.5">
                      <button className="flex items-center gap-1.5 text-xs font-semibold text-brand-700" onClick={() => toggleGroup(g.kg)}>
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        <span className="tabular-nums">KG {g.kg}</span>
                        <span className="font-normal text-gray-600 normal-case">{g.label}</span>
                        <span className="text-gray-400 font-normal">({g.items.length})</span>
                      </button>
                    </td>
                    <td colSpan={2 + (showBki ? 3 : 0) + vkeys.length} className="px-2 py-1.5 text-right text-xs text-gray-400">
                      Zwischensumme netto
                    </td>
                    {showNetto && vkeys.map(vk => (
                      <td key={vk} className="px-2 py-1.5 text-right text-xs font-semibold text-night tabular-nums bg-gray-100">
                        {fmtEur(g.sums[vk])}
                      </td>
                    ))}
                    <td colSpan={3} className="px-2 py-1.5 text-right">
                      <button className="text-xs text-gray-400 hover:text-brand-600" onClick={() => addPosition(g.kg)}>+ Zeile</button>
                    </td>
                  </tr>

                  {!isCollapsed && g.items.map(p => {
                    const row     = rowById[p.id]
                    const kg1     = kg1Of(p.kg1 ?? p.kg2)
                    const isPct   = p.mode === 'percent'
                    const deep    = kg1 === 300              // KG 300 wird auf der 3. Ebene geführt
                    return (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-sky/5 align-top">
                        {/* Kostengruppe */}
                        <td className="px-1 py-0.5">
                          <SelectCell
                            value={String(p.kg2 ?? '')}
                            onChange={v => setPos(p.id, { kg2: Number(v), kg3: '', label: kg2Label(Number(v)) })}
                            options={kg2For(kg1).map(e => ({ value: String(e.kg), label: String(e.kg) }))}
                          />
                          {deep && (
                            <SelectCell
                              className="mt-0.5"
                              value={String(p.kg3 ?? '')}
                              onChange={v => setPos(p.id, { kg3: v ? Number(v) : '', label: v ? kg3Label(Number(v)) : kg2Label(p.kg2) })}
                              options={[{ value: '', label: '– 3. Eb.' }, ...kg3For(p.kg2).map(e => ({ value: String(e.kg), label: String(e.kg) }))]}
                            />
                          )}
                        </td>

                        {/* Maßnahme */}
                        <td className="px-1 py-0.5">
                          <TextCell value={p.measure} onChange={v => setPos(p.id, { measure: v })} placeholder="Maßnahme / Abgrenzung" />
                          <div className="text-[10px] text-gray-400 px-1.5 truncate" title={p.label}>{p.label}</div>
                        </td>

                        {/* Menge */}
                        <td className="px-1 py-0.5">
                          {isPct
                            ? <div className="px-1.5 py-1 text-xs text-gray-400 text-right">Anteil</div>
                            : <ValueCell value={p.qty} onChange={v => setPos(p.id, { qty: v })} lookup={lookup} placeholder="Menge" />}
                          {/* Aufgelöste Menge nur zeigen, wenn die Zelle eine Formel enthält –
                              bei einer eingetippten Zahl wäre die Zeile darunter nur Dopplung. */}
                          {!isPct && row && isFormula(p.qty) && (
                            <div className="text-[10px] text-gray-400 px-1.5 text-right tabular-nums">
                              = {fmtNum(row.byVariant[vkeys[0]]?.qty)}
                            </div>
                          )}
                        </td>

                        {/* Einheit */}
                        <td className="px-1 py-0.5">
                          {isPct
                            ? <SelectCell
                                value={p.percentBase}
                                onChange={v => setPos(p.id, { percentBase: v })}
                                options={PERCENT_BASES.map(b => ({ value: b.value, label: b.label }))}
                              />
                            : <TextCell value={p.unit} onChange={v => setPos(p.id, { unit: v })} list="kosten-units" />}
                        </td>

                        {/* BKI von / Mittel / bis */}
                        {showBki && ['Von', 'Mittel', 'Bis'].map((k, i) => {
                          const field = `bki${k}`
                          const which = ['von', 'mittel', 'bis'][i]
                          return (
                            <td key={k} className="px-1 py-0.5">
                              <div className="flex items-center gap-0.5">
                                <ValueCell value={p[field]} onChange={v => setPos(p.id, { [field]: v })} lookup={lookup} />
                                <button
                                  className="text-[9px] text-gray-300 hover:text-brand-600 px-0.5 leading-none"
                                  title={`BKI ${which} in alle Variantenspalten übernehmen`}
                                  onClick={() => applyBki(p, which)}
                                >▸</button>
                              </div>
                            </td>
                          )
                        })}

                        {/* Gewählte Kennwerte je Variante */}
                        {vkeys.map(vk => (
                          <td key={vk} className="px-1 py-0.5">
                            <ValueCell
                              value={p.values?.[vk]}
                              onChange={v => setPosValue(p.id, vk, v)}
                              lookup={lookup}
                              placeholder={isPct ? '0,07' : 'Kennwert'}
                              title={isPct ? 'Anteil als Dezimalzahl, z. B. 0,07 für 7 %' : 'Kennwert brutto je Einheit'}
                            />
                            {isPct && (
                              <div className="text-[10px] text-gray-400 px-1.5 text-right">
                                {fmtPct(row?.byVariant?.[vk]?.kw)}
                              </div>
                            )}
                          </td>
                        ))}

                        {/* Nettokosten je Variante */}
                        {showNetto && vkeys.map(vk => {
                          const cell = row?.byVariant?.[vk]
                          const err  = cell?.qtyError || cell?.kwError
                          return (
                            <td key={vk} className="px-1 py-0.5 bg-gray-50">
                              <ResultCell
                                value={cell?.netto}
                                format={v => (err ? '#FEHLER' : fmtEur(v))}
                                className={err ? 'text-red-600' : ''}
                                strong
                              />
                            </td>
                          )
                        })}

                        {/* Ansatz / Reifegrad */}
                        <td className="px-1 py-0.5">
                          <SelectCell
                            value={p.ansatz}
                            onChange={v => setPos(p.id, { ansatz: v })}
                            options={ANSATZ_TYPEN.map(a => ({ value: a.value, label: a.label }))}
                          />
                          <div className="px-1 mt-0.5">
                            <span className={`${ansatzBadge(p.ansatz)?.badge ?? 'badge-gray'} text-[10px]`}>
                              {ansatzBadge(p.ansatz)?.kurz}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-0.5">
                          <SelectCell
                            value={p.status}
                            onChange={v => setPos(p.id, { status: v })}
                            options={POS_STATUS.map(s => ({ value: s.value, label: s.label }))}
                          />
                          <div className="px-1 mt-0.5">
                            <span className={`${posStatusBadge(p.status)?.badge ?? 'badge-gray'} text-[10px]`}>
                              {posStatusBadge(p.status)?.label}
                            </span>
                          </div>
                        </td>

                        {/* Quelle */}
                        <td className="px-1 py-0.5">
                          <TextCell value={p.source} onChange={v => setPos(p.id, { source: v })} placeholder="Quelle / Herleitung" />
                          {p.dbRef && (
                            <div className="text-[10px] text-brand-600 px-1.5 flex items-center gap-1" title="Vergleichswerte stammen aus einer gebundenen Kostendatenbank">
                              <Database size={9} className="flex-shrink-0" />
                              {dbLabel(draft, p.dbRef)}
                            </div>
                          )}
                          <SelectCell
                            className="mt-0.5"
                            value={p.mode}
                            onChange={v => setPos(p.id, { mode: v, unit: v === 'percent' ? '%' : p.unit })}
                            options={POS_MODES.map(m => ({ value: m.value, label: m.label }))}
                          />
                        </td>

                        <td className="px-1 py-1 whitespace-nowrap">
                          <button className="text-gray-300 hover:text-brand-600 p-0.5" title="Position duplizieren" onClick={() => duplicate(p)}>
                            <Copy size={12} />
                          </button>
                          <button className="text-gray-300 hover:text-red-600 p-0.5" title="Position löschen"
                                  onClick={() => window.confirm('Position wirklich löschen?') && removePosition(p.id)}>
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}

            {visible.length === 0 && (
              <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-gray-400">
                Keine Position in dieser Auswahl.
              </td></tr>
            )}
          </tbody>

          {visible.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-night bg-white">
                <td colSpan={4 + (showBki ? 3 : 0) + vkeys.length} className="px-2 py-2 font-bold text-night text-right">
                  Summe der angezeigten Positionen (netto)
                </td>
                {showNetto && vkeys.map(vk => (
                  <td key={vk} className="px-2 py-2 text-right tabular-nums font-bold text-night bg-gray-100">
                    {fmtEur(groups.reduce((s, g) => s + g.sums[vk], 0))}
                  </td>
                ))}
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <datalist id="kosten-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>

      <div className="text-xs text-gray-500 leading-relaxed space-y-1">
        <p className="flex items-start gap-1.5">
          <Euro size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
          Gewählte Kennwerte sind <b>Bruttowerte</b> wie in BKI. Die Nettokosten ergeben sich als
          Menge × Kennwert ÷ (1 + USt) × Regionalfaktor × Preisindex.
        </p>
        <p className="flex items-start gap-1.5">
          <Percent size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
          Prozentpositionen (typisch KG 700) rechnen auf die gewählte Bezugssumme. Basis sind dabei nur die
          nicht-prozentualen Positionen – so bleibt die Rechnung zirkelfrei.
        </p>
        <p className="flex items-start gap-1.5">
          <Sigma size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
          Das kleine ▸ neben einem BKI-Wert übernimmt ihn in alle Variantenspalten.
          Mengen und Kennwerte dürfen Formeln sein und beginnen dann mit <code className="bg-concrete px-1">=</code>.
        </p>
      </div>
    </div>
  )
}

/** Kurzvermerk, aus welchem Kostenstand die Vergleichswerte einer Position stammen. */
function dbLabel(draft, ref) {
  const q = (draft.datenquellen ?? []).find(x => x.dbId === ref.dbId)
  if (!q) return 'Kostendatenbank'
  return `${q.dbName}${q.versionLabel ? ' · ' + q.versionLabel : ''}`
}
