// Rechenkern der Kostenermittlung.
//
// Grundformel für mengenbezogene Positionen (BKI-Kennwerte sind brutto):
//
//   Nettokosten = Menge × Kennwert(brutto) ÷ (1 + USt) × Regionalfaktor × Preisindex
//
// Prozentpositionen (typisch KG 700) rechnen auf eine bereits ermittelte
// Nettosumme. Bezugsbasis sind dabei ausschließlich die nicht-prozentualen
// Positionen des jeweiligen Bereichs – so bleibt die Rechnung zirkelfrei und
// nachvollziehbar.

import { evaluate, toNumber } from './formula'
import { kg1Of, kg2Of, kg1Label, kg2Label, kgLabel } from './din276'

// ── Formatierung ─────────────────────────────────────────────────────────────
const nfEur = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const nfNum = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const nfPct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const fmtEur = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : nfEur.format(n) + ' €')
export const fmtNum = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : nfNum.format(n))
export const fmtPct = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : nfPct.format(n * 100) + ' %')

// ── Parameter-Auflösung ──────────────────────────────────────────────────────

/** Baut die Namenstabelle der Parameter (Groß-/Kleinschreibung egal). */
export function buildLookup(estimate) {
  const map = new Map()
  for (const p of estimate.parameters ?? []) {
    const key = String(p.key ?? '').trim()
    if (key) map.set(key.toUpperCase(), p.value)
  }
  return (name) => map.get(String(name).toUpperCase())
}

/** Wertet alle Parameter aus – für die Anzeige im Parameterblatt. */
export function evalParameters(estimate) {
  const lookup = buildLookup(estimate)
  const cache  = new Map()
  const out    = {}
  for (const p of estimate.parameters ?? []) {
    const res = evaluate(p.value, { lookup, cache })
    out[p.id] = res
    const key = String(p.key ?? '').trim().toUpperCase()
    if (key && !cache.has(key)) cache.set(key, res)
  }
  return out
}

// ── Kernrechnung ─────────────────────────────────────────────────────────────

const activeVariants = (estimate) => (estimate.variants ?? []).filter(v => v.active !== false)

function evalFactors(estimate, lookup, cache) {
  const ust = evaluate(estimate.ust,            { lookup, cache })
  const rf  = evaluate(estimate.regionalfaktor, { lookup, cache })
  const pi  = evaluate(estimate.preisindex,     { lookup, cache })
  return {
    ust: ust.value ?? 0,
    rf:  rf.value  ?? 1,
    pi:  pi.value  ?? 1,
    errors: [ust.error, rf.error, pi.error].filter(Boolean),
  }
}

/**
 * Rechnet die gesamte Kostenermittlung durch.
 * @returns {{
 *   variants, factors, rows, params,
 *   totals: { byVariant, kg1Rows, kg2Rows, sumRow, kennzahlRow },
 *   errors: string[]
 * }}
 */
export function calcEstimate(estimate) {
  const lookup   = buildLookup(estimate)
  const cache    = new Map()
  const variants = activeVariants(estimate)
  const vkeys    = variants.map(v => v.key)
  const factors  = evalFactors(estimate, lookup, cache)
  const errors   = [...factors.errors]

  const positions = estimate.positions ?? []
  const netFactor = (1 + factors.ust) === 0 ? 1 : factors.rf * factors.pi / (1 + factors.ust)

  // ── Durchgang 1: alle nicht-prozentualen Positionen ────────────────────────
  const rows = positions.map(pos => {
    const byVariant = {}
    for (const vk of vkeys) {
      const rawQty = pos.qtyByVariant?.[vk] ?? pos.qty
      const rawVal = pos.values?.[vk]

      const q = evaluate(rawQty, { lookup, cache })
      const k = evaluate(rawVal, { lookup, cache })

      const cell = {
        qty:      q.value,
        qtyError: q.error,
        kw:       k.value,
        kwError:  k.error,
        netto:    null,
        pending:  pos.mode === 'percent',
      }

      if (pos.mode !== 'percent') {
        if (q.value !== null && k.value !== null) {
          cell.netto = pos.mode === 'netto'
            ? q.value * k.value
            : q.value * k.value * netFactor
        } else if (q.value === null && k.value === null) {
          cell.netto = 0                       // beide leer → Position (noch) ohne Ansatz
        } else {
          cell.netto = 0
        }
      }
      if (q.error) errors.push(`${posRef(pos)}: Menge – ${q.error}`)
      if (k.error) errors.push(`${posRef(pos)}: Kennwert – ${k.error}`)
      byVariant[vk] = cell
    }
    return { id: pos.id, pos, byVariant }
  })

  // ── Bezugssummen für Prozentpositionen (nur nicht-prozentuale Positionen) ──
  const baseSums = {}
  for (const vk of vkeys) {
    const inRange = (kg1, from, to) => kg1 !== null && kg1 >= from && kg1 <= to
    let kg200_600 = 0, kg300_400 = 0, kg300 = 0, kg200_700 = 0
    for (const row of rows) {
      if (row.pos.mode === 'percent') continue
      const n = row.byVariant[vk]?.netto ?? 0
      const g1 = kg1Of(row.pos.kg1 ?? row.pos.kg2)
      if (inRange(g1, 200, 600)) kg200_600 += n
      if (g1 === 300 || g1 === 400) kg300_400 += n
      if (g1 === 300) kg300 += n
      if (inRange(g1, 200, 700)) kg200_700 += n
    }
    baseSums[vk] = { KG200_600: kg200_600, KG300_400: kg300_400, KG300: kg300, KG200_700: kg200_700 }
  }

  // ── Durchgang 2: Prozentpositionen auflösen ───────────────────────────────
  for (const row of rows) {
    if (row.pos.mode !== 'percent') continue
    for (const vk of vkeys) {
      const cell = row.byVariant[vk]
      const base = baseSums[vk]?.[row.pos.percentBase ?? 'KG200_600'] ?? 0
      cell.base    = base
      cell.netto   = cell.kw === null ? 0 : base * cell.kw
      cell.pending = false
    }
  }

  // ── Summen je Variante ────────────────────────────────────────────────────
  const bezugsParam = evaluate(
    estimate.bezugKennzahl ? `=${estimate.bezugKennzahl}` : '',
    { lookup, cache }
  )

  const byVariant = {}
  for (const vk of vkeys) {
    const kg1Sums = {}, kg2Sums = {}
    let sumNet = 0
    for (const row of rows) {
      const n  = row.byVariant[vk]?.netto ?? 0
      const g1 = kg1Of(row.pos.kg1 ?? row.pos.kg2)
      const g2 = row.pos.kg2 ? Number(row.pos.kg2) : (row.pos.kg3 ? kg2Of(row.pos.kg3) : null)
      if (g1 !== null) kg1Sums[g1] = (kg1Sums[g1] ?? 0) + n
      if (g2 !== null) kg2Sums[g2] = (kg2Sums[g2] ?? 0) + n
      sumNet += n
    }
    const bezug = bezugsParam.value
    byVariant[vk] = {
      kg1: kg1Sums,
      kg2: kg2Sums,
      sumNet,
      sumGross: sumNet * (1 + factors.ust),
      kennzahl: bezug ? sumNet / bezug : null,
      bezug,
    }
  }

  // ── Zeilen für das Übersichtsblatt ────────────────────────────────────────
  const spread = (values) => {
    const nums = vkeys.map(vk => values[vk]).filter(n => Number.isFinite(n))
    if (!nums.length) return { min: null, max: null, spread: null, spreadPct: null }
    const min = Math.min(...nums), max = Math.max(...nums)
    return { min, max, spread: max - min, spreadPct: min ? (max - min) / min : null }
  }

  const usedKg1 = [...new Set(rows.map(r => kg1Of(r.pos.kg1 ?? r.pos.kg2)).filter(v => v !== null))].sort((a, b) => a - b)
  const kg1Rows = usedKg1.map(kg => {
    const values = Object.fromEntries(vkeys.map(vk => [vk, byVariant[vk].kg1[kg] ?? 0]))
    return { kg, label: kg1Label(kg), values, ...spread(values) }
  })

  const usedKg2 = [...new Set(rows
    .map(r => (r.pos.kg2 ? Number(r.pos.kg2) : (r.pos.kg3 ? kg2Of(r.pos.kg3) : null)))
    .filter(v => v !== null))].sort((a, b) => a - b)
  const kg2Rows = usedKg2.map(kg => {
    const values = Object.fromEntries(vkeys.map(vk => [vk, byVariant[vk].kg2[kg] ?? 0]))
    return { kg, kg1: kg1Of(kg), label: kg2Label(kg) || kgLabel(kg), values, ...spread(values) }
  })

  const sumValues = Object.fromEntries(vkeys.map(vk => [vk, byVariant[vk].sumNet]))
  const sumRow    = { values: sumValues, ...spread(sumValues) }

  const kzValues     = Object.fromEntries(vkeys.map(vk => [vk, byVariant[vk].kennzahl]))
  const kennzahlRow  = { values: kzValues, ...spread(kzValues) }

  return {
    variants, vkeys, factors, netFactor, rows, baseSums,
    totals: { byVariant, kg1Rows, kg2Rows, sumRow, kennzahlRow },
    errors: [...new Set(errors)],
  }
}

const posRef = (pos) => `KG ${pos.kg3 || pos.kg2 || pos.kg1}${pos.measure ? ' · ' + String(pos.measure).slice(0, 40) : ''}`

// ── Auswertungen für Übersicht und Prüfung ───────────────────────────────────

/** Wie viele Positionen sind noch offen? Grundlage der Reifegrad-Anzeige. */
export function maturity(estimate) {
  const pos = estimate.positions ?? []
  const open = pos.filter(p => ['mengen', 'markt', 'konzept', 'schadstoff'].includes(p.status))
  return {
    total:      pos.length,
    open:       open.length,
    gesichert:  pos.filter(p => p.status === 'gesichert').length,
    bki:        pos.filter(p => p.status === 'bki').length,
    byStatus:   pos.reduce((acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc }, {}),
  }
}

/** Abgleich gegen ein vorgegebenes Budget (netto). */
export function budgetCheck(estimate, result, vkey) {
  const budget = toNumber(estimate.budget)
  if (!budget) return null
  const kg300 = result.totals.byVariant[vkey]?.kg1?.[300] ?? 0
  return { budget, kg300, delta: kg300 - budget, pct: budget ? (kg300 - budget) / budget : null }
}
