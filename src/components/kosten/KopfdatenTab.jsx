import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { STUFEN, DOC_STATUS, emptyBkiRef } from '../../kosten/model'
import { KG1, kg1Label } from '../../kosten/din276'
import { fmtPct, fmtNum } from '../../kosten/calc'
import { evaluate } from '../../kosten/formula'
import { ValueCell, TextCell, AreaCell, SelectCell } from './cells'

// Blatt „Kopfdaten“ – Stufe, Kostenstand, Rechenfaktoren, Budget und die
// BKI-Gesamtkennwerte, gegen die das Modell plausibilisiert wird.

export default function KopfdatenTab({ draft, patch, mutate, lookup, result }) {
  const setRef = (id, p) => mutate(prev => ({ ...prev, bkiRef: prev.bkiRef.map(r => (r.id === id ? { ...r, ...p } : r)) }))
  const addRef = ()      => mutate(prev => ({ ...prev, bkiRef: [...(prev.bkiRef ?? []), emptyBkiRef(300)] }))
  const delRef = (id)    => mutate(prev => ({ ...prev, bkiRef: prev.bkiRef.filter(r => r.id !== id) }))

  const bezugValue = evaluate(draft.bezugKennzahl ? `=${draft.bezugKennzahl}` : '', { lookup })

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Identifikation ───────────────────────────────────────────────── */}
      <section className="card p-4 space-y-3">
        <h3 className="section-title">Kostenermittlung</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Bezeichnung">
            <input className="input" value={draft.name ?? ''} onChange={e => patch({ name: e.target.value })} />
          </Field>
          <Field label="Stufe nach DIN 276">
            <select className="select" value={draft.stufe} onChange={e => patch({ stufe: e.target.value })}>
              {STUFEN.map(s => <option key={s.value} value={s.value}>{s.label} · {s.lph}</option>)}
            </select>
          </Field>
          <Field label="Bearbeitungsstatus">
            <select className="select" value={draft.status} onChange={e => patch({ status: e.target.value })}>
              {DOC_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Kostenstand">
            <input className="input" value={draft.kostenstand ?? ''} placeholder="Q2/2026" onChange={e => patch({ kostenstand: e.target.value })} />
          </Field>
          <Field label="Bezugsgröße der Kennzahl" hint="Formelname eines Parameters">
            <input className="input" value={draft.bezugKennzahl ?? ''} placeholder="BGF_GES"
                   onChange={e => patch({ bezugKennzahl: e.target.value.trim().toUpperCase() })} />
            <p className="text-[11px] text-gray-400 mt-0.5">
              {bezugValue.error ? <span className="text-red-600">{bezugValue.error}</span> : `aktuell ${fmtNum(bezugValue.value)}`}
            </p>
          </Field>
          <Field label="Einheit der Kennzahl">
            <input className="input" value={draft.bezugKennzahlUnit ?? ''} placeholder="m² BGF"
                   onChange={e => patch({ bezugKennzahlUnit: e.target.value })} />
          </Field>
        </div>
        <Field label="Datenbasis / BKI-Quelle">
          <textarea className="textarea" rows={2} value={draft.bkiQuelle ?? ''}
                    placeholder="BKI Objektgruppe, Kostenstand, Gebietsstand, Brutto-/Nettoangabe"
                    onChange={e => patch({ bkiQuelle: e.target.value })} />
        </Field>
        <Field label="Methodischer Hinweis (erscheint auf der Übersicht)">
          <textarea className="textarea" rows={3} value={draft.remark ?? ''} onChange={e => patch({ remark: e.target.value })} />
        </Field>
      </section>

      {/* ── Rechenfaktoren ───────────────────────────────────────────────── */}
      <section className="card p-4 space-y-3">
        <h3 className="section-title">Rechenfaktoren</h3>
        <p className="text-xs text-gray-500 -mt-1">
          Gewählte Kennwerte sind Bruttowerte. Nettokosten = Menge × Kennwert ÷ (1 + USt) × Regionalfaktor × Preisindex.
          Aktueller Umrechnungsfaktor: <b className="text-night tabular-nums">{result.netFactor.toFixed(4)}</b>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Umsatzsteuer" hint={fmtPct(result.factors.ust)}>
            <ValueCell value={draft.ust} onChange={v => patch({ ust: v })} lookup={lookup} align="left" placeholder="0,19" />
          </Field>
          <Field label="Regionalfaktor" hint="BKI Regionalfaktoren, Landkreis des Projektstandorts">
            <ValueCell value={draft.regionalfaktor} onChange={v => patch({ regionalfaktor: v })} lookup={lookup} align="left" placeholder="1,0" />
          </Field>
          <Field label="Preisindex" hint="Fortschreibung gegenüber dem BKI-Kostenstand">
            <ValueCell value={draft.preisindex} onChange={v => patch({ preisindex: v })} lookup={lookup} align="left" placeholder="1,0" />
          </Field>
        </div>
      </section>

      {/* ── Budgetabgleich ───────────────────────────────────────────────── */}
      <section className="card p-4 space-y-3">
        <h3 className="section-title">Budgetabgleich</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Bezeichnung des Budgets">
            <input className="input" value={draft.budgetLabel ?? ''} onChange={e => patch({ budgetLabel: e.target.value })} />
          </Field>
          <Field label="Budget netto" hint="leer lassen, wenn kein Budget vorgegeben ist">
            <ValueCell value={draft.budget} onChange={v => patch({ budget: v })} lookup={lookup} align="left" placeholder="2100000" />
          </Field>
          <Field label="Verglichen wird">
            <select className="select" value={draft.budgetKg ?? 300} onChange={e => patch({ budgetKg: Number(e.target.value) })}>
              {KG1.map(k => <option key={k.kg} value={k.kg}>KG {k.kg} · {k.label}</option>)}
            </select>
          </Field>
        </div>
      </section>

      {/* ── BKI-Referenzwerte ────────────────────────────────────────────── */}
      <section className="card">
        <div className="px-4 py-3 border-b border-concrete flex items-start justify-between gap-3">
          <div>
            <h3 className="section-title">BKI-Gesamtkennwerte zur Plausibilisierung</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-3xl">
              Bruttokennwerte je Bezugsgröße, wie sie BKI für die Hauptgruppe ausweist. Sie dienen der Einordnung des
              Modells – nicht als Verteilungsrechnung auf die 2. oder 3. Ebene.
            </p>
          </div>
          <button className="btn-secondary text-sm flex-shrink-0" onClick={addRef}><Plus size={14} /> Zeile</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-concrete text-left text-xs">
                <th className="px-2 py-2 font-semibold text-night w-[22%]">Kostengruppe</th>
                <th className="px-2 py-2 font-semibold text-night w-[90px] text-right">von</th>
                <th className="px-2 py-2 font-semibold text-night w-[90px] text-right">Mittel</th>
                <th className="px-2 py-2 font-semibold text-night w-[90px] text-right">bis</th>
                <th className="px-2 py-2 font-semibold text-night w-[130px]">Bezug (Parameter)</th>
                <th className="px-2 py-2 font-semibold text-night w-[140px]">Einheit</th>
                <th className="px-2 py-2 font-semibold text-night">Hinweis</th>
                <th className="px-2 py-2 w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {(draft.bkiRef ?? []).map(r => (
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="px-1 py-0.5">
                    <SelectCell value={String(r.kg)} onChange={v => setRef(r.id, { kg: Number(v) })}
                                options={KG1.map(k => ({ value: String(k.kg), label: `KG ${k.kg} · ${k.label}` }))} />
                  </td>
                  <td className="px-1 py-0.5"><ValueCell value={r.von}    onChange={v => setRef(r.id, { von: v })}    lookup={lookup} /></td>
                  <td className="px-1 py-0.5"><ValueCell value={r.mittel} onChange={v => setRef(r.id, { mittel: v })} lookup={lookup} /></td>
                  <td className="px-1 py-0.5"><ValueCell value={r.bis}    onChange={v => setRef(r.id, { bis: v })}    lookup={lookup} /></td>
                  <td className="px-1 py-0.5"><TextCell value={r.bezug} onChange={v => setRef(r.id, { bezug: v.trim().toUpperCase() })} placeholder="BGF_GES" /></td>
                  <td className="px-1 py-0.5"><TextCell value={r.unit}  onChange={v => setRef(r.id, { unit: v })} placeholder="€/m² BGF brutto" /></td>
                  <td className="px-1 py-0.5"><AreaCell value={r.note}  onChange={v => setRef(r.id, { note: v })} rows={2} /></td>
                  <td className="px-2 py-1.5 text-right">
                    <button className="text-gray-300 hover:text-red-600" onClick={() => delRef(r.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {(draft.bkiRef ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-400">Keine Referenzwerte hinterlegt.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {hint && <span className="text-[11px] text-gray-400 ml-1.5">{hint}</span>}
      <div className="mt-0.5">{children}</div>
    </label>
  )
}
