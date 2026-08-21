// Formel-Auswertung für die Kostenermittlung.
//
// Zellen (Parameterwerte, Mengen, Kennwerte) enthalten entweder eine Zahl
// ("166", "0,983") oder eine Formel, die – wie in Excel – mit "=" beginnt
// ("=PERIMETER*AF_STREIFEN", "=24+V1_ENTW_ZUSATZ_BRUTTO/BGF_GES").
//
// Bezeichner verweisen auf Parameternamen aus Blatt „Parameter“. Die Auflösung
// erfolgt rekursiv mit Zyklusschutz, damit sich Parameter gegenseitig
// referenzieren können, ohne die Anwendung aufzuhängen.

const FUNCS = {
  MIN:   (...a) => Math.min(...a),
  MAX:   (...a) => Math.max(...a),
  ABS:   (a)    => Math.abs(a),
  ROUND: (a, d = 0) => { const f = 10 ** d; return Math.round(a * f) / f },
  SUM:   (...a) => a.reduce((s, x) => s + x, 0),
  WENN:  (c, t, f = 0) => (c ? t : f),
  IF:    (c, t, f = 0) => (c ? t : f),
}

export class FormulaError extends Error {}

// ── Tokenizer ────────────────────────────────────────────────────────────────
const RE_NUM   = /^\d+(?:\.\d+)?/
const RE_IDENT = /^[A-Za-zÄÖÜäöü_][A-Za-z0-9ÄÖÜäöü_]*/

function tokenize(src) {
  const out = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue }
    const rest = src.slice(i)

    const num = RE_NUM.exec(rest)
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue }

    const id = RE_IDENT.exec(rest)
    if (id) { out.push({ t: 'ident', v: id[0] }); i += id[0].length; continue }

    if (rest.startsWith('<=') || rest.startsWith('>=') || rest.startsWith('<>')) {
      out.push({ t: 'op', v: rest.slice(0, 2) }); i += 2; continue
    }
    if ('+-*/^(),<>='.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue }

    throw new FormulaError(`Unerwartetes Zeichen „${ch}“`)
  }
  return out
}

// ── Parser (rekursiver Abstieg) ──────────────────────────────────────────────
// expr → vergleich → summe → produkt → potenz → unär → primär
function parser(tokens, resolve) {
  let pos = 0
  const peek = () => tokens[pos]
  const eat  = (v) => {
    const tk = tokens[pos]
    if (!tk || tk.v !== v) throw new FormulaError(`„${v}“ erwartet`)
    pos++
    return tk
  }
  const isOp = (...vals) => peek()?.t === 'op' && vals.includes(peek().v)

  function expr() { return comparison() }

  function comparison() {
    let left = additive()
    while (isOp('<', '>', '<=', '>=', '=', '<>')) {
      const op = tokens[pos++].v
      const right = additive()
      left = op === '<'  ? (left <  right ? 1 : 0)
           : op === '>'  ? (left >  right ? 1 : 0)
           : op === '<=' ? (left <= right ? 1 : 0)
           : op === '>=' ? (left >= right ? 1 : 0)
           : op === '='  ? (left === right ? 1 : 0)
           :               (left !== right ? 1 : 0)
    }
    return left
  }

  function additive() {
    let left = multiplicative()
    while (isOp('+', '-')) {
      const op = tokens[pos++].v
      const right = multiplicative()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function multiplicative() {
    let left = power()
    while (isOp('*', '/')) {
      const op = tokens[pos++].v
      const right = power()
      if (op === '/' && right === 0) throw new FormulaError('Division durch 0')
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  function power() {
    const base = unary()
    if (isOp('^')) { pos++; return base ** power() }
    return base
  }

  function unary() {
    if (isOp('-')) { pos++; return -unary() }
    if (isOp('+')) { pos++; return unary() }
    return primary()
  }

  function primary() {
    const tk = peek()
    if (!tk) throw new FormulaError('Formel unvollständig')

    if (tk.t === 'num') { pos++; return tk.v }

    if (tk.t === 'ident') {
      pos++
      const name = tk.v
      if (isOp('(')) {                       // Funktionsaufruf
        eat('(')
        const args = []
        if (!isOp(')')) {
          args.push(expr())
          while (isOp(',')) { pos++; args.push(expr()) }
        }
        eat(')')
        const fn = FUNCS[name.toUpperCase()]
        if (!fn) throw new FormulaError(`Unbekannte Funktion „${name}“`)
        return fn(...args)
      }
      return resolve(name)                   // Parameterverweis
    }

    if (isOp('(')) { eat('('); const v = expr(); eat(')'); return v }

    throw new FormulaError(`Unerwartet: „${tk.v}“`)
  }

  const value = expr()
  if (pos < tokens.length) throw new FormulaError(`Überzähliger Ausdruck ab „${tokens[pos].v}“`)
  return value
}

// ── Öffentliche API ──────────────────────────────────────────────────────────

/** Wandelt eine Eingabe in eine Zahl. Akzeptiert deutsche Dezimalkommata und
 *  Tausenderpunkte ("1.234,56"), leere Werte ergeben null. */
export function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw).trim()
  if (!s) return null
  // Tausenderpunkte nur entfernen, wenn zusätzlich ein Dezimalkomma vorhanden ist
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** true, wenn der Rohwert eine Formel ist. */
export const isFormula = (raw) => typeof raw === 'string' && raw.trim().startsWith('=')

/**
 * Wertet einen Rohwert aus.
 * @param raw    Zahl, Zahltext oder "=Formel"
 * @param ctx    { lookup(name) -> Rohwert|undefined, cache?: Map, stack?: Set }
 * @returns      { value: number|null, error: string|null }
 */
export function evaluate(raw, ctx = {}) {
  const { lookup = () => undefined, cache = new Map(), stack = new Set() } = ctx

  if (!isFormula(raw)) {
    const n = toNumber(raw)
    return { value: n, error: null }
  }

  const resolve = (name) => {
    const key = name.toUpperCase()
    if (stack.has(key)) throw new FormulaError(`Zirkelbezug bei „${name}“`)
    if (cache.has(key)) {
      const hit = cache.get(key)
      if (hit.error) throw new FormulaError(hit.error)
      return hit.value ?? 0
    }
    const ref = lookup(name)
    if (ref === undefined) throw new FormulaError(`Unbekannter Parameter „${name}“`)

    stack.add(key)
    let res
    try {
      res = evaluate(ref, { lookup, cache, stack })
    } finally {
      stack.delete(key)
    }
    cache.set(key, res)
    if (res.error) throw new FormulaError(res.error)
    return res.value ?? 0
  }

  try {
    const value = parser(tokenize(String(raw).trim().slice(1)), resolve)
    if (!Number.isFinite(value)) return { value: null, error: 'Ergebnis ist keine Zahl' }
    return { value, error: null }
  } catch (e) {
    return { value: null, error: e instanceof FormulaError ? e.message : String(e.message || e) }
  }
}

/** Namen aller in einer Formel referenzierten Parameter (für Abhängigkeitsanzeige). */
export function referencedNames(raw) {
  if (!isFormula(raw)) return []
  let tokens
  try { tokens = tokenize(String(raw).trim().slice(1)) } catch { return [] }
  const names = []
  tokens.forEach((tk, idx) => {
    if (tk.t !== 'ident') return
    const next = tokens[idx + 1]
    if (next && next.t === 'op' && next.v === '(') return   // Funktionsname
    if (!names.includes(tk.v)) names.push(tk.v)
  })
  return names
}
