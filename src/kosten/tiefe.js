// Kostentiefe je Leistungsphase.
//
// DIN 276 gibt für jede Kostenermittlungsstufe eine **Mindesttiefe** vor. In
// der Praxis wird regelmäßig tiefer gerechnet, weil dort die entwurfsabhängigen
// Unterschiede liegen. Beides wird hier getrennt geführt:
//
//   minDin  – die Ebene, die DIN 276 mindestens verlangt (nicht unterschreitbar)
//   ziel    – die Ebene, die dieses Büro in diesem Projekt anstrebt
//
// Die Zieltiefe ist je Hauptkostengruppe einstellbar. So entsteht die
// „vertiefte Kostenschätzung": Abgabe auf der 2. Ebene, KG 300 und 400 aber
// bereits auf der 3. Ebene.

import { KG1 } from './din276'

export const EBENEN = [
  { value: 1, label: '1. Ebene', hint: 'Hauptgruppen KG 100–800' },
  { value: 2, label: '2. Ebene', hint: 'Kostengruppen x10–x90' },
  { value: 3, label: '3. Ebene', hint: 'Kostengruppen xx1–xx9' },
]
export const ebeneLabel = (n) => EBENEN.find(e => e.value === Number(n))?.label ?? `${n}. Ebene`

/**
 * Tiefenprofile. `stufe` verweist auf die Kostenermittlungsstufe aus model.js;
 * mehrere Profile dürfen sich dieselbe Stufe teilen – genau so entsteht die
 * vertiefte Kostenschätzung neben der regulären.
 */
export const TIEFENPROFILE = [
  {
    id: 'kostenrahmen', name: 'Kostenrahmen', stufe: 'kostenrahmen', lph: 'LPH 1',
    minDin: 1, ziel: 1, byKg1: {},
    hint: 'Bedarfsplanung. DIN 276 verlangt die 1. Ebene; gerechnet wird über wenige Bezugsgrößen.',
  },
  {
    id: 'kostenschaetzung', name: 'Kostenschätzung', stufe: 'kostenschaetzung', lph: 'LPH 2',
    minDin: 1, ziel: 2, byKg1: {},
    hint: 'Vorplanung. DIN-Mindesttiefe ist die 1. Ebene; abgegeben wird üblicherweise auf der 2. Ebene.',
  },
  {
    id: 'kostenschaetzung-vertieft', name: 'Vertiefte Kostenschätzung', stufe: 'kostenschaetzung', lph: 'LPH 2',
    minDin: 1, ziel: 2, byKg1: { 300: 3, 400: 3 },
    hint: 'Vorplanung mit vertiefter Betrachtung dort, wo die entwurfsabhängigen Unterschiede liegen: '
        + 'Abgabe auf der 2. Ebene, KG 300 und KG 400 auf der 3. Ebene.',
  },
  {
    id: 'kostenberechnung', name: 'Kostenberechnung', stufe: 'kostenberechnung', lph: 'LPH 3',
    minDin: 2, ziel: 3, byKg1: {},
    hint: 'Entwurfsplanung. DIN-Mindesttiefe ist die 2. Ebene; gerechnet wird auf der 3. Ebene.',
  },
  {
    id: 'kostenanschlag', name: 'Kostenanschlag', stufe: 'kostenanschlag', lph: 'LPH 6/7',
    minDin: 3, ziel: 3, byKg1: {},
    hint: 'Vorbereitung und Mitwirkung bei der Vergabe. 3. Ebene, ergänzt um Vergabeeinheiten.',
  },
  {
    id: 'kostenfeststellung', name: 'Kostenfeststellung', stufe: 'kostenfeststellung', lph: 'LPH 8',
    minDin: 3, ziel: 3, byKg1: {},
    hint: 'Objektüberwachung. 3. Ebene auf Grundlage der geprüften Schlussrechnungen.',
  },
]

export const profil = (id) => TIEFENPROFILE.find(p => p.id === id) ?? null

/** Tiefenkonfiguration aus einem Profil. Wird auf die Ermittlung kopiert und
 *  bleibt dort frei änderbar – das Profil ist Startwert, keine Fessel. */
export const tiefeFromProfil = (id) => {
  const p = profil(id) ?? TIEFENPROFILE[1]
  return { profil: p.id, minDin: p.minDin, ziel: p.ziel, byKg1: { ...p.byKg1 } }
}

/** Zieltiefe einer Hauptkostengruppe. */
export const zielEbene = (tiefe, kg1) => {
  if (!tiefe) return 2
  const eigen = tiefe.byKg1?.[kg1] ?? tiefe.byKg1?.[String(kg1)]
  return Number(eigen ?? tiefe.ziel ?? 2)
}

/** Tatsächliche Ebene einer Position: 335 → 3, 330 → 2, nur kg1 → 1. */
export const posEbene = (pos) => (pos.kg3 ? 3 : pos.kg2 ? 2 : 1)

/**
 * Prüft, ob die erfassten Positionen die vereinbarte Kostentiefe erreichen.
 * Meldet je Hauptkostengruppe:
 *   unterDin  – unterschreitet die DIN-Mindesttiefe (fachlicher Mangel)
 *   unterZiel – erreicht die Zieltiefe noch nicht (offene Arbeit)
 */
export function tiefeCheck(estimate) {
  const tiefe = estimate.tiefe
  const positions = estimate.positions ?? []
  const byKg1 = new Map()

  for (const pos of positions) {
    const kg1 = Math.floor(Number(pos.kg1 ?? pos.kg2 ?? 0) / 100) * 100
    if (!kg1) continue
    if (!byKg1.has(kg1)) byKg1.set(kg1, [])
    byKg1.get(kg1).push(pos)
  }

  const rows = [...byKg1.entries()].sort((a, b) => a[0] - b[0]).map(([kg1, list]) => {
    const ziel     = zielEbene(tiefe, kg1)
    const min      = Number(tiefe?.minDin ?? 1)
    const erreicht = Math.max(...list.map(posEbene))
    const flach    = list.filter(p => posEbene(p) < ziel)
    return {
      kg1,
      label: KG1.find(k => k.kg === kg1)?.label ?? '',
      anzahl: list.length,
      ziel, minDin: min, erreicht,
      unterDin:  erreicht < min,
      unterZiel: flach.length > 0,
      flach: flach.length,
    }
  })

  return {
    rows,
    unterDin:  rows.filter(r => r.unterDin),
    unterZiel: rows.filter(r => r.unterZiel && !r.unterDin),
    ok: rows.length > 0 && rows.every(r => !r.unterDin && !r.unterZiel),
  }
}

/** Auswahlliste der Hauptkostengruppen für die Tiefeneinstellung. */
export const TIEFE_KG1 = KG1.filter(k => k.kg >= 200 && k.kg <= 700)
