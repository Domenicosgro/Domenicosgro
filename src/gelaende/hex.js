// ─────────────────────────────────────────────────────────────────────────────
// Hex-Mathematik der Gelaende-Darstellung (Muster 2.1)
// Sechsecke kacheln lueckenlos, haben sechs gleichwertige Nachbarn und wirken
// organisch statt technisch. Koordinaten axial (q, r).
// ─────────────────────────────────────────────────────────────────────────────

export const HR = 1.72                                     // Radius einer Wabe (Weltmass)
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

export const key = (q, r) => `${q},${r}`
export const hexW = (q, r) => [HR * Math.sqrt(3) * (q + r / 2), HR * 1.5 * r]   // -> [x, z]
export const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2
export const dist = (a, b) => hexDist(a.q - b.q, a.r - b.r)

/** Alle Waben eines Rings um (q,r). */
export function ring(q, r, rad) {
  if (rad <= 0) return [{ q, r }]
  const out = []
  let cq = q + DIRS[4][0] * rad, cr = r + DIRS[4][1] * rad
  for (let d = 0; d < 6; d++) {
    for (let i = 0; i < rad; i++) {
      out.push({ q: cq, r: cr })
      cq += DIRS[d][0]; cr += DIRS[d][1]
    }
  }
  return out
}

/** Waben einer Scheibe (Zentrum + Ringe 1..rad). */
export function spiral(q, r, rad) {
  const out = []
  for (let k = 0; k <= rad; k++) out.push(...ring(q, r, k))
  return out
}

/**
 * Naechste freie Wabe ab einem Anker - Kern der Auto-Platzierung: ein neuer
 * Datensatz erscheint ohne jede Konfiguration auf der Karte (Muster 2.1).
 */
export function freeNear(aq, ar, used) {
  if (!used.has(key(aq, ar))) return { q: aq, r: ar }
  for (let rad = 1; rad < 12; rad++) {
    for (const h of ring(aq, ar, rad)) if (!used.has(key(h.q, h.r))) return h
  }
  return { q: aq, r: ar }
}

/** Kuerzester Weg ueber Nachbarwaben (BFS) - Figuren laufen, sie springen nicht. */
export function path(from, to, passable) {
  const start = key(from.q, from.r), goal = key(to.q, to.r)
  if (start === goal) return [from]
  const prev = new Map([[start, null]])
  let frontier = [from]
  for (let step = 0; step < 24 && frontier.length > 0; step++) {
    const next = []
    for (const cur of frontier) {
      for (const [dq, dr] of DIRS) {
        const n = { q: cur.q + dq, r: cur.r + dr }
        const k = key(n.q, n.r)
        if (prev.has(k) || !passable(n)) continue
        prev.set(k, cur)
        if (k === goal) {
          const out = [n]
          let p = cur
          while (p) { out.unshift(p); p = prev.get(key(p.q, p.r)) }
          return out
        }
        next.push(n)
      }
    }
    frontier = next
  }
  return [from, to]     // kein Weg gefunden: direkte Linie
}
