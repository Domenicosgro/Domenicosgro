// ─────────────────────────────────────────────────────────────────────────────
// Platzierung und Faerbung (Muster 2.1/2.2)
//
// Aus der flachen Liste des Servers entsteht hier die Landschaft: Regionen
// (Quartiere) je Gesellschaft, darin ein Objekt je Projekt, ringsum Deko.
// Nichts ist von Hand platziert - eine feste Wabe (project.hex) wird beachtet,
// fehlt sie, sucht die Ringsuche die naechste freie. Die Anordnung haengt nur
// von der Projektliste ab, nicht von der Woche: beim Wochenwechsel wandern die
// Figuren, die Gebaeude bleiben stehen.
// ─────────────────────────────────────────────────────────────────────────────

import { DIRS, key, ring, spiral, freeNear } from './hex'

// Farbfamilien: Grund-Hue je Quartier, Abstufung je Objekt darin (Muster 2.2)
const GROUP_HUE = [216, 150, 42, 272, 16, 190, 330]
const SPECIAL_HUE = { leistungen: 42, abwesend: 16 }

// Komma-Schreibweise: THREE.Color versteht die Leerzeichen-Syntax von CSS
// Color Level 4 nicht und laesst die Farbe sonst weiss.
export const hsl = (h, s, l) =>
  `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`

// Quartier eines Objekts: Gesellschaft aus den Projektdaten, sonst Sonderbereich
function groupOf(p) {
  if (p.kind === 'service') return { id: 'leistungen', name: 'Leistungen' }
  if (p.kind === 'absence') return { id: 'abwesend',  name: 'Abwesend' }
  const g = (p.gesellschaft || '').trim()
  return g ? { id: `ges:${g.toLowerCase()}`, name: g } : { id: 'buero', name: 'Büro' }
}

// Groesse einer Parzelle: wochenunabhaengig (Team/Sollbesetzung), damit die
// Karte beim Wochenwechsel ruhig bleibt.
function plotSize(p) {
  if (p.kind !== 'project') return p.id === 'buero' ? 3 : 2
  const n = Math.max(p.teamSize || 0, Math.round((p.sollDays || 0) / 2))
  return Math.max(1, Math.min(7, 1 + Math.ceil(n / 2)))
}

/** Belegt eine zusammenhaengende Parzelle: Zentrum + Nachbarn, wenn noetig. */
function takePlot(center, size, used, regionId) {
  const hexes = [center]
  used.set(key(center.q, center.r), regionId)
  for (let rad = 1; hexes.length < size && rad < 4; rad++) {
    for (const h of ring(center.q, center.r, rad)) {
      if (hexes.length >= size) break
      if (used.has(key(h.q, h.r))) continue
      used.set(key(h.q, h.r), regionId)
      hexes.push(h)
    }
  }
  return hexes
}

/**
 * Landschaft aus den Gelaende-Daten einer Woche.
 * @param {object} data  Antwort von /api/gelaende/…
 */
export function buildLayout(data) {
  const used = new Map()          // hexKey -> regionId ('__brunnen__' fuer den Platz)
  const regions = []

  // Der Brunnen in der Mitte ist Orientierungspunkt und Treffpunkt der
  // Unverplanten - erkennbar Landschaft, kein erfundenes Datenobjekt (Muster 4).
  const brunnen = { q: 0, r: 0 }
  used.set(key(0, 0), '__brunnen__')

  // Objekte nach Quartier gruppieren, Reihenfolge des Servers beibehalten
  const groups = new Map()
  for (const p of data.projects || []) {
    const g = groupOf(p)
    if (!groups.has(g.id)) groups.set(g.id, { ...g, items: [] })
    groups.get(g.id).items.push(p)
  }
  // Sonderbereiche nach aussen
  const order = [...groups.values()].sort((a, b) => {
    const rank = (x) => (x.id === 'leistungen' ? 1 : x.id === 'abwesend' ? 2 : 0)
    return rank(a) - rank(b)
  })

  // Quartiersanker auf einer Spirale, mit Mindestabstand zueinander - so bleibt
  // zwischen den Quartieren Platz fuer Landschaft.
  const anchors = spiral(0, 0, 11)
  const taken = []
  const hexDistOf = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q - b.q + a.r - b.r)) / 2
  const nextAnchor = (minFromCenter = 2) => {
    const found = anchors.find(h =>
      hexDistOf(h, { q: 0, r: 0 }) >= minFromCenter
      && !used.has(key(h.q, h.r))
      && taken.every(t => hexDistOf(h, t) >= 3))
    const a = found || freeNear(0, 0, used)
    taken.push(a)
    return a
  }

  order.forEach((group, gi) => {
    const hueBase = SPECIAL_HUE[group.id] ?? GROUP_HUE[gi % GROUP_HUE.length]
    // Abwesenheiten gehoeren an den Rand (Strand, Krankenbett), nicht in die Mitte
    const anchor  = nextAnchor(group.id === 'abwesend' ? 5 : group.id === 'leistungen' ? 3 : 2)
    const n = group.items.length
    group.items.forEach((p, i) => {
      const fixed  = p.hex && Number.isFinite(p.hex.q) ? p.hex : null
      const center = fixed && !used.has(key(p.hex.q, p.hex.r))
        ? { q: p.hex.q, r: p.hex.r }
        : freeNear(anchor.q, anchor.r, used)
      const hexes = takePlot(center, plotSize(p), used, p.id)
      const hue   = hueBase + (i - (n - 1) / 2) * (n > 5 ? 11 : 16)
      regions.push({
        ...p,
        group: group.name,
        groupId: group.id,
        hexes,
        center,
        hue,
        color: p.color || hsl(hue, 0.5, 0.42),
        colorLight: p.color || hsl(hue, 0.55, 0.62),
      })
    })
  })

  // Deko weicht Daten: erst jetzt, auf allem, was frei geblieben ist.
  const radius = Math.max(4, ...[...used.keys()].map(k => {
    const [q, r] = k.split(',').map(Number)
    return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2
  })) + 1
  const deco = []
  for (const h of spiral(0, 0, radius)) {
    const k = key(h.q, h.r)
    if (used.has(k)) continue
    const rnd = pseudo(h.q, h.r)
    const rim = (Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r)) / 2 > radius - 2
    deco.push({ ...h, type: rim && rnd > 0.5 ? 'wasser' : rnd > 0.88 ? 'teich' : rnd > 0.66 ? 'baum' : rnd > 0.52 ? 'busch' : rnd > 0.46 ? 'stein' : 'wiese' })
  }

  // Figuren: jede Person bekommt ihre Zielwaben dieser Woche
  const byId = new Map(regions.map(r => [r.id, r]))
  const people = (data.people || []).map((person, i) => {
    const targets = []
    for (const t of person.targets || []) {
      const reg = byId.get(t.projectId)
      if (!reg) continue
      const hex = reg.hexes[i % reg.hexes.length]
      targets.push({ ...t, hex, color: reg.color, regionName: reg.name })
    }
    const home = targets[0]?.hex || ring(brunnen.q, brunnen.r, 1)[i % 6]
    return { ...person, targets, home, atBrunnen: targets.length === 0 }
  })

  return { brunnen, regions, deco, people, radius, week: data.week, weekLabel: data.weekLabel, totals: data.totals }
}

// Stabiler Pseudozufall je Wabe: gleiche Landschaft bei jedem Aufbau
export function pseudo(q, r) {
  const s = Math.sin(q * 127.1 + r * 311.7) * 43758.5453
  return s - Math.floor(s)
}
