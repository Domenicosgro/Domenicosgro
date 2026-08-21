import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, TrendingUp, Target, ShieldAlert, Info, Database, Layers3, AlertTriangle, Check } from 'lucide-react'
import { fmtEur, fmtNum, fmtPct, maturity, budgetCheck } from '../../kosten/calc'
import { evaluate, toNumber } from '../../kosten/formula'
import { kg1Label, kg1Of } from '../../kosten/din276'
import { POS_STATUS } from '../../kosten/model'
import { tiefeCheck, ebeneLabel } from '../../kosten/tiefe'
import { ErrorList } from './cells'

// Blatt „Übersicht“ – das Abgabeblatt auf der 2. Ebene DIN 276.
// Varianten stehen nebeneinander, je Kostengruppe werden Minimum, Maximum und
// Spreizung ausgewiesen.

export default function UebersichtTab({ draft, result, lookup }) {
  const { vkeys, variants, totals, factors } = result
  const [open, setOpen] = useState(() => new Set([300, 400]))

  const toggle = (kg) => setOpen(prev => {
    const next = new Set(prev)
    next.has(kg) ? next.delete(kg) : next.add(kg)
    return next
  })

  const reife  = useMemo(() => maturity(draft), [draft])
  const budget = budgetCheck(draft, result, vkeys[0])

  // BKI-Plausibilisierung: Gesamtkennwert × Bezugsgröße gegen die Modellsumme
  const bkiCheck = useMemo(() => (draft.bkiRef ?? []).map(ref => {
    const bezug = evaluate(ref.bezug ? `=${ref.bezug}` : '', { lookup }).value
    const band  = ['von', 'mittel', 'bis'].map(k => {
      const kw = toNumber(ref[k])
      return kw !== null && bezug ? kw * bezug / (1 + factors.ust) : null
    })
    const ist = Object.fromEntries(vkeys.map(v => [v, totals.byVariant[v]?.kg1?.[ref.kg] ?? 0]))
    return { ...ref, bezug, von: band[0], mittel: band[1], bis: band[2], ist }
  }), [draft.bkiRef, lookup, factors.ust, totals, vkeys])

  const colCount = vkeys.length

  return (
    <div className="space-y-5">

      <ErrorList errors={result.errors} />

      {/* ── Kennzahlen ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp size={16} />}
          label={`Gesamtkosten netto · ${variants[0]?.name ?? vkeys[0]}`}
          value={fmtEur(totals.byVariant[vkeys[0]]?.sumNet)}
          sub={`${fmtEur(totals.byVariant[vkeys[0]]?.sumGross)} brutto`}
        />
        <StatCard
          icon={<Target size={16} />}
          label={`Kennzahl · ${draft.bezugKennzahl || 'Bezugsgröße'}`}
          value={totals.byVariant[vkeys[0]]?.kennzahl !== null
            ? `${fmtNum(totals.byVariant[vkeys[0]]?.kennzahl)} €/${draft.bezugKennzahlUnit || 'Einheit'}`
            : '–'}
          sub={totals.byVariant[vkeys[0]]?.bezug ? `Bezug ${fmtNum(totals.byVariant[vkeys[0]].bezug)}` : 'Bezugsgröße nicht gesetzt'}
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Spreizung über alle Varianten"
          value={fmtEur(totals.sumRow.spread)}
          sub={totals.sumRow.spreadPct !== null ? `${fmtPct(totals.sumRow.spreadPct)} zwischen günstigster und teuerster Variante` : ''}
        />
        <StatCard
          icon={<ShieldAlert size={16} />}
          label="Offene Positionen"
          value={`${reife.open} / ${reife.total}`}
          sub="Mengen, Markt, Konzept oder Schadstoffe noch offen"
          accent={reife.open > 0 ? 'border-l-amber-400' : 'border-l-green-500'}
        />
      </div>

      {/* ── Budgetabgleich ───────────────────────────────────────────────── */}
      {budget && (
        <div className={`card p-3 border-l-4 ${budget.delta > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold text-night">{draft.budgetLabel || 'Budget'}</span>
            <span className="text-gray-500">Vorgabe <b className="text-night">{fmtEur(budget.budget)}</b></span>
            <span className="text-gray-500">Modell KG {draft.budgetKg ?? 300} <b className="text-night">{fmtEur(budget.kg300)}</b></span>
            <span className={budget.delta > 0 ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>
              {budget.delta > 0 ? '+' : ''}{fmtEur(budget.delta)}
              {budget.pct !== null && ` (${budget.delta > 0 ? '+' : ''}${fmtPct(budget.pct)})`}
            </span>
          </div>
        </div>
      )}

      {/* ── Datenbasis und Kostentiefe ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card p-3">
          <h3 className="text-sm font-semibold text-night flex items-center gap-1.5">
            <Database size={14} className="text-brand-600" /> Datenbasis
          </h3>
          {(draft.datenquellen ?? []).length === 0 ? (
            <p className="text-xs text-gray-500 mt-1">
              {draft.bkiQuelle
                ? draft.bkiQuelle
                : 'Keine Kostendatenbank gebunden – die Vergleichswerte werden von Hand gepflegt.'}
            </p>
          ) : (
            <ul className="text-xs text-gray-600 mt-1 space-y-1">
              {draft.datenquellen.map(q => (
                <li key={q.id} className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-0.5">·</span>
                  <span>
                    <b className="text-night">{q.dbName}</b>
                    {q.versionLabel && <> · Kostenstand {q.versionLabel}</>}
                    {q.stand && <> ({q.stand})</>}
                    {q.gebiet && <> · {q.gebiet}</>}
                    {q.ustHinweis && <> · {q.ustHinweis}</>}
                    {q.primary && <span className="badge-blue ml-1.5">Leitquelle</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-3">
          <h3 className="text-sm font-semibold text-night flex items-center gap-1.5">
            <Layers3 size={14} className="text-brand-600" /> Kostentiefe
          </h3>
          <TiefeZusammenfassung draft={draft} />
        </div>
      </div>

      {/* ── Kostenübersicht 2. Ebene ─────────────────────────────────────── */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-concrete text-left">
              <th className="px-3 py-2 font-semibold text-night w-[34%]">Kostengruppe (DIN 276)</th>
              {variants.map(v => (
                <th key={v.key} className="px-3 py-2 font-semibold text-night text-right whitespace-nowrap" title={v.description}>
                  <div>{v.key}</div>
                  <div className="text-[10px] font-normal text-gray-500 truncate max-w-[150px]">{v.name}</div>
                </th>
              ))}
              <th className="px-3 py-2 font-semibold text-gray-500 text-right whitespace-nowrap">Minimum</th>
              <th className="px-3 py-2 font-semibold text-gray-500 text-right whitespace-nowrap">Maximum</th>
              <th className="px-3 py-2 font-semibold text-gray-500 text-right whitespace-nowrap">Spreizung</th>
            </tr>
          </thead>
          <tbody>
            {totals.kg1Rows.map(row => {
              const children = totals.kg2Rows.filter(c => c.kg1 === row.kg)
              const isOpen   = open.has(row.kg)
              return (
                <React.Fragment key={row.kg}>
                  <tr className="border-t border-concrete bg-white hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <button className="flex items-center gap-1.5 text-left font-semibold text-night" onClick={() => toggle(row.kg)}>
                        {children.length > 0
                          ? (isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />)
                          : <span className="w-3.5" />}
                        <span className="tabular-nums">KG {row.kg}</span>
                        <span className="font-normal text-gray-600">{row.label}</span>
                      </button>
                    </td>
                    {vkeys.map(vk => (
                      <td key={vk} className="px-3 py-2 text-right tabular-nums font-semibold text-night">{fmtEur(row.values[vk])}</td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtEur(row.min)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtEur(row.max)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${row.spread ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>{fmtEur(row.spread)}</td>
                  </tr>
                  {isOpen && children.map(c => (
                    <tr key={c.kg} className="border-t border-gray-100 bg-gray-50/60">
                      <td className="px-3 py-1.5 pl-10 text-gray-600">
                        <span className="tabular-nums text-gray-500 mr-2">KG {c.kg}</span>{c.label}
                      </td>
                      {vkeys.map(vk => (
                        <td key={vk} className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmtEur(c.values[vk])}</td>
                      ))}
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">{fmtEur(c.min)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">{fmtEur(c.max)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${c.spread ? 'text-amber-600' : 'text-gray-300'}`}>{fmtEur(c.spread)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}

            <tr className="border-t-2 border-night bg-white">
              <td className="px-3 py-2.5 font-bold text-night">Summe netto</td>
              {vkeys.map(vk => (
                <td key={vk} className="px-3 py-2.5 text-right tabular-nums font-bold text-night">{fmtEur(totals.sumRow.values[vk])}</td>
              ))}
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{fmtEur(totals.sumRow.min)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{fmtEur(totals.sumRow.max)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-amber-700 font-semibold">{fmtEur(totals.sumRow.spread)}</td>
            </tr>
            <tr className="border-t border-concrete bg-gray-50">
              <td className="px-3 py-2 text-gray-600">Umsatzsteuer {fmtPct(factors.ust)}</td>
              {vkeys.map(vk => (
                <td key={vk} className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {fmtEur((totals.byVariant[vk]?.sumGross ?? 0) - (totals.byVariant[vk]?.sumNet ?? 0))}
                </td>
              ))}
              <td colSpan={3} />
            </tr>
            <tr className="border-t border-concrete bg-brand-50">
              <td className="px-3 py-2.5 font-bold text-night">Summe brutto</td>
              {vkeys.map(vk => (
                <td key={vk} className="px-3 py-2.5 text-right tabular-nums font-bold text-night">{fmtEur(totals.byVariant[vk]?.sumGross)}</td>
              ))}
              <td colSpan={3} />
            </tr>
            <tr className="border-t border-concrete bg-white">
              <td className="px-3 py-2 text-gray-600">
                Kennzahl netto je {draft.bezugKennzahlUnit || 'Bezugsgröße'}
              </td>
              {vkeys.map(vk => (
                <td key={vk} className="px-3 py-2 text-right tabular-nums text-gray-700">
                  {totals.byVariant[vk]?.kennzahl !== null ? `${fmtNum(totals.byVariant[vk].kennzahl)} €` : '–'}
                </td>
              ))}
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── BKI-Plausibilisierung ────────────────────────────────────────── */}
      {bkiCheck.length > 0 && (
        <div className="card">
          <div className="px-3 py-2 border-b border-concrete flex items-start gap-2">
            <Info size={14} className="text-brand-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-night">Plausibilisierung gegen die BKI-Gesamtkennwerte</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                BKI-Kennwerte sind brutto und stammen aus unterschiedlichen Vergleichsobjekten. Die Summe der Unterwerte
                der 2./3. Ebene muss den Unterwert der übergeordneten Kostengruppe <b>nicht</b> treffen – die Bandbreite
                dient der Einordnung, nicht als Verteilungsrechnung.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[820px]">
              <thead>
                <tr className="bg-concrete text-left text-xs">
                  <th className="px-3 py-1.5 font-semibold text-night">Kostengruppe</th>
                  <th className="px-3 py-1.5 font-semibold text-gray-500 text-right">BKI von (netto)</th>
                  <th className="px-3 py-1.5 font-semibold text-gray-500 text-right">BKI Mittel</th>
                  <th className="px-3 py-1.5 font-semibold text-gray-500 text-right">BKI bis</th>
                  {vkeys.map(vk => <th key={vk} className="px-3 py-1.5 font-semibold text-night text-right">{vk} Modell</th>)}
                </tr>
              </thead>
              <tbody>
                {bkiCheck.map(ref => (
                  <tr key={ref.id} className="border-t border-concrete" title={ref.note}>
                    <td className="px-3 py-1.5">
                      <span className="tabular-nums font-medium text-night">KG {ref.kg}</span>
                      <span className="text-gray-500 ml-2">{kg1Label(ref.kg)}</span>
                      <div className="text-[10px] text-gray-400">{ref.unit} · Bezug {ref.bezug}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtEur(ref.von)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtEur(ref.mittel)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtEur(ref.bis)}</td>
                    {vkeys.map(vk => {
                      const v = ref.ist[vk]
                      const outside = ref.von !== null && ref.bis !== null && (v < ref.von || v > ref.bis)
                      return (
                        <td key={vk} className={`px-3 py-1.5 text-right tabular-nums font-medium ${outside ? 'text-amber-700' : 'text-night'}`}
                            title={outside ? 'Außerhalb der BKI-Bandbreite' : 'Innerhalb der BKI-Bandbreite'}>
                          {fmtEur(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Reifegrad ────────────────────────────────────────────────────── */}
      <div className="card p-3">
        <h3 className="text-sm font-semibold text-night mb-2">Reifegrad der Ansätze</h3>
        <div className="flex flex-wrap gap-2">
          {POS_STATUS.map(s => {
            const n = reife.byStatus[s.value] ?? 0
            if (!n) return null
            return <span key={s.value} className={s.badge}>{n}× {s.label}</span>
          })}
          {reife.total === 0 && <span className="text-xs text-gray-400">Noch keine Positionen erfasst.</span>}
        </div>
      </div>

      {draft.remark && (
        <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-concrete pl-3">{draft.remark}</p>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub, accent = 'border-l-brand-500' }) {
  return (
    <div className={`card p-3 border-l-4 ${accent}`}>
      <div className="flex items-center gap-1.5 text-gray-500 text-xs">{icon}<span className="truncate">{label}</span></div>
      <div className="text-lg font-bold text-night mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5 truncate" title={sub}>{sub}</div>}
    </div>
  )
}

/** Kompakte Tiefenauswertung für das Abgabeblatt. */
function TiefeZusammenfassung({ draft }) {
  const check = tiefeCheck(draft)
  const t     = draft.tiefe
  if (!check.rows.length) {
    return <p className="text-xs text-gray-400 mt-1">Noch keine Positionen erfasst.</p>
  }
  return (
    <div className="mt-1 space-y-1">
      <p className="text-xs text-gray-500">
        Zieltiefe {ebeneLabel(t?.ziel ?? 2)} · DIN-Mindesttiefe {ebeneLabel(t?.minDin ?? 1)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {check.rows.map(r => (
          <span
            key={r.kg1}
            className={r.unterDin ? 'badge-red' : r.unterZiel ? 'badge-yellow' : 'badge-green'}
            title={`Zieltiefe ${ebeneLabel(r.ziel)} · erfasst bis ${ebeneLabel(r.erreicht)}`}
          >
            KG {r.kg1}: {r.erreicht}. Eb.
          </span>
        ))}
      </div>
      {check.unterDin.length > 0 && (
        <p className="text-xs text-red-700 flex items-start gap-1.5">
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
          {check.unterDin.length} Kostengruppe(n) unterschreiten die DIN-Mindesttiefe.
        </p>
      )}
      {check.unterZiel.length > 0 && (
        <p className="text-xs text-amber-700 flex items-start gap-1.5">
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
          {check.unterZiel.map(r => `KG ${r.kg1}`).join(', ')} erreichen die Zieltiefe noch nicht.
        </p>
      )}
      {check.ok && (
        <p className="text-xs text-green-700 flex items-center gap-1.5">
          <Check size={11} /> Zieltiefe erreicht.
        </p>
      )}
    </div>
  )
}
