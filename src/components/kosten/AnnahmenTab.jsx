import React from 'react'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { emptyAssumption, emptyPlannerState, RISIKO_STUFEN, risikoBadge } from '../../kosten/model'
import { TextCell, AreaCell, SelectCell } from './cells'

// Blätter „Annahmen“ und „Planerstand“.
//
// Offene Punkte bleiben als offene Punkte sichtbar und werden nicht durch
// erfundene Genauigkeit verdeckt – das ist der Zweck dieser beiden Listen.

export default function AnnahmenTab({ draft, mutate }) {
  const assumptions = draft.assumptions ?? []
  const planners    = draft.planners ?? []

  const setA = (id, patch) => mutate(p => ({ ...p, assumptions: p.assumptions.map(a => (a.id === id ? { ...a, ...patch } : a)) }))
  const addA = ()          => mutate(p => ({ ...p, assumptions: [...(p.assumptions ?? []), emptyAssumption()] }))
  const delA = (id)        => mutate(p => ({ ...p, assumptions: p.assumptions.filter(a => a.id !== id) }))

  const setP = (id, patch) => mutate(p => ({ ...p, planners: p.planners.map(x => (x.id === id ? { ...x, ...patch } : x)) }))
  const addP = ()          => mutate(p => ({ ...p, planners: [...(p.planners ?? []), emptyPlannerState()] }))
  const delP = (id)        => mutate(p => ({ ...p, planners: p.planners.filter(x => x.id !== id) }))

  const offen = assumptions.filter(a => a.open).length

  return (
    <div className="space-y-6">

      {/* ── Annahmen und offene Punkte ───────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-night">Projektannahmen und offene Punkte</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {offen} von {assumptions.length} noch offen. Vor Abgabe als belastbare Kostenermittlung muss jeder Punkt
              geschlossen oder bewusst als offene Annahme ausgewiesen sein.
            </p>
          </div>
          <button className="btn-secondary text-sm" onClick={addA}><Plus size={14} /> Annahme</button>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-concrete text-left text-xs">
                <th className="px-2 py-2 font-semibold text-night w-[46px]">Offen</th>
                <th className="px-2 py-2 font-semibold text-night w-[16%]">Thema</th>
                <th className="px-2 py-2 font-semibold text-night">Annahme / offener Punkt</th>
                <th className="px-2 py-2 font-semibold text-night w-[20%]">Kostenwirkung</th>
                <th className="px-2 py-2 font-semibold text-night w-[110px]">Risiko</th>
                <th className="px-2 py-2 w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {assumptions.map(a => (
                <tr key={a.id} className={`border-t border-gray-100 align-top ${a.open ? '' : 'bg-gray-50/60 opacity-70'}`}>
                  <td className="px-2 py-1.5">
                    <button
                      className={a.open ? 'text-amber-500' : 'text-green-600'}
                      title={a.open ? 'Als geklärt markieren' : 'Wieder als offen markieren'}
                      onClick={() => setA(a.id, { open: !a.open })}
                    >{a.open ? <Circle size={15} /> : <CheckCircle2 size={15} />}</button>
                  </td>
                  <td className="px-1 py-0.5"><TextCell value={a.topic} onChange={v => setA(a.id, { topic: v })} placeholder="Thema" /></td>
                  <td className="px-1 py-0.5"><AreaCell value={a.text} onChange={v => setA(a.id, { text: v })} rows={2} placeholder="Was wird angenommen? Was ist noch offen?" /></td>
                  <td className="px-1 py-0.5"><TextCell value={a.impact} onChange={v => setA(a.id, { impact: v })} placeholder="Betroffene Kostengruppen" /></td>
                  <td className="px-1 py-0.5">
                    <SelectCell value={a.risk} onChange={v => setA(a.id, { risk: v })} options={RISIKO_STUFEN.map(r => ({ value: r.value, label: r.label }))} />
                    <div className="px-1 mt-0.5"><span className={`${risikoBadge(a.risk).badge} text-[10px]`}>{risikoBadge(a.risk).label}</span></div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button className="text-gray-300 hover:text-red-600" onClick={() => delA(a.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {assumptions.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">Noch keine Annahmen dokumentiert.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Planerstand ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-night">Planerstand</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Kostenrelevante Fachplanerinformationen mit Stand und abgeleiteter Kostenfolge.
            </p>
          </div>
          <button className="btn-secondary text-sm" onClick={addP}><Plus size={14} /> Planerstand</button>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-concrete text-left text-xs">
                <th className="px-2 py-2 font-semibold text-night w-[13%]">Fachbereich</th>
                <th className="px-2 py-2 font-semibold text-night w-[11%]">Stand</th>
                <th className="px-2 py-2 font-semibold text-night w-[19%]">Unterlage</th>
                <th className="px-2 py-2 font-semibold text-night">Kostenrelevante Aussage</th>
                <th className="px-2 py-2 font-semibold text-night w-[22%]">Kostenfolge</th>
                <th className="px-2 py-2 w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {planners.map(x => (
                <tr key={x.id} className="border-t border-gray-100 align-top">
                  <td className="px-1 py-0.5"><TextCell value={x.discipline} onChange={v => setP(x.id, { discipline: v })} placeholder="Elektro" /></td>
                  <td className="px-1 py-0.5"><TextCell value={x.stand} onChange={v => setP(x.id, { stand: v })} placeholder="19.08.2026" /></td>
                  <td className="px-1 py-0.5"><TextCell value={x.file} onChange={v => setP(x.id, { file: v })} placeholder="Dateiname" /></td>
                  <td className="px-1 py-0.5"><AreaCell value={x.findings} onChange={v => setP(x.id, { findings: v })} rows={2} /></td>
                  <td className="px-1 py-0.5"><AreaCell value={x.impact} onChange={v => setP(x.id, { impact: v })} rows={2} placeholder="Betroffene Kostengruppen" /></td>
                  <td className="px-2 py-1.5 text-right">
                    <button className="text-gray-300 hover:text-red-600" onClick={() => delP(x.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {planners.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">Noch kein Planerstand erfasst.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
