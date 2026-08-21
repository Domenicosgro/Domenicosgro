// Kostendatenbanken – büroweite, projektübergreifende Kennwertquellen.
//
// Eine Kostendatenbank bündelt Kostenkennwerte einer Herkunft (BKI, eigene
// abgeschlossene Projekte, externe Quellen). Sie besteht aus mehreren
// **Kostenständen** (Versionen). Ein Kostenstand ist der nachweisbare Zustand
// zu einem Datum: er trägt seine Kennwerte, seine Nachweisdokumente (PDF,
// Excel …) und den Vermerk, wer ihn wann eingespielt hat.
//
// Grundsatz: Kennwerte werden nie überschrieben. Ein neuer Preisstand wird als
// neuer Kostenstand angelegt; der alte bleibt bestehen und wird auf
// „abgelöst" gesetzt. So bleibt jede Kostenermittlung auch Jahre später
// nachvollziehbar – sie verweist auf genau den Kostenstand, mit dem sie
// gerechnet wurde.

import { uid } from '../utils'
import { kgLabel, kg1Of, kg2Of } from './din276'
import { toNumber } from './formula'

// ── Art der Datenbank ────────────────────────────────────────────────────────
export const DB_KINDS = [
  { value: 'bki',    label: 'BKI',                    badge: 'badge-blue',
    hint: 'Baukosteninformationszentrum – statistische Kennwerte aus Vergleichsobjekten.' },
  { value: 'eigen',  label: 'Eigene Kostenermittlungen', badge: 'badge-green',
    hint: 'Aus abgeschlossenen Projekten des Büros abgeleitete Kennwerte.' },
  { value: 'extern', label: 'Externe Quelle',         badge: 'badge-yellow',
    hint: 'Herstellerlisten, Fachplanerkennwerte, Förderrichtwerte, Marktberichte.' },
]
export const dbKind = (v) => DB_KINDS.find(k => k.value === v) ?? DB_KINDS[2]

// ── Status eines Kostenstands ────────────────────────────────────────────────
export const VERSION_STATUS = [
  { value: 'entwurf',     label: 'In Erfassung', badge: 'badge-yellow',
    hint: 'Noch nicht zur Verwendung freigegeben.' },
  { value: 'freigegeben', label: 'Freigegeben',  badge: 'badge-green',
    hint: 'Verbindlich – kann in Kostenermittlungen verwendet werden.' },
  { value: 'abgeloest',   label: 'Abgelöst',     badge: 'badge-gray',
    hint: 'Durch einen neueren Kostenstand ersetzt. Bleibt für bestehende Ermittlungen erhalten.' },
]
export const versionStatus = (v) => VERSION_STATUS.find(s => s.value === v) ?? VERSION_STATUS[0]

// ── Bezugsgrößen eines Kennwerts ─────────────────────────────────────────────
export const ENTRY_BEZUG = [
  { value: 'BGF',  label: 'je m² BGF',        unit: '€/m² BGF' },
  { value: 'NUF',  label: 'je m² NUF',        unit: '€/m² NUF' },
  { value: 'BRI',  label: 'je m³ BRI',        unit: '€/m³ BRI' },
  { value: 'GF',   label: 'je m² GF',         unit: '€/m² GF' },
  { value: 'AF',   label: 'je m² AF',         unit: '€/m² AF' },
  { value: 'm2',   label: 'je m² Bauteil',    unit: '€/m²' },
  { value: 'm3',   label: 'je m³',            unit: '€/m³' },
  { value: 'm',    label: 'je lfd. m',        unit: '€/m' },
  { value: 'St',   label: 'je Stück',         unit: '€/St' },
  { value: 'psch', label: 'pauschal',         unit: '€' },
  { value: 'pct',  label: 'Prozentsatz',      unit: '%' },
]
export const bezugUnit = (v) => ENTRY_BEZUG.find(b => b.value === v)?.unit ?? ''

// ── Dokumentarten, die einen Kostenstand belegen ─────────────────────────────
export const DOC_KINDS = ['Kennwerttabelle', 'Regionalfaktoren', 'Erläuterungen', 'Angebot',
                          'Schlussrechnung', 'Vergabeergebnis', 'Marktbericht', 'Sonstiges']

// ── Fabriken ─────────────────────────────────────────────────────────────────

export const emptyEntry = (kg = '') => ({
  id: uid(),
  kg,                     // 300 | 330 | 335 – Kostengruppe 1.–3. Ebene
  label: kg ? kgLabel(kg) : '',
  leistung: '',           // Abgrenzung, falls mehrere Kennwerte je Kostengruppe
  bezug: 'BGF',
  unit: '€/m² BGF',
  brutto: true,           // Kennwert brutto (BKI) oder netto?
  von: '', mittel: '', bis: '',
  quelle: '',             // Seitenangabe, Tabellennummer, Rechnungsnummer …
  note: '',
})

export const emptyDocument = () => ({
  id: uid(),
  name: '',
  kind: 'Kennwerttabelle',
  mimeType: '',
  size: 0,
  attachmentId: null,     // Datei liegt im /data/attachments-Volume
  uploadedAt: null,
  uploadedBy: '',
  note: '',
})

export const emptyVersion = (label = '') => ({
  id: uid(),
  label,                  // "Q2/2026", "Ausgabe 2026", "Stand 03/2026"
  stand: '',              // Kostenstand als Datum (YYYY-MM-DD)
  gueltigAb: '',          // ab wann im Büro zu verwenden
  status: 'entwurf',
  gebiet: '',             // "Bundesdurchschnitt", "Region Rheinhessen-Pfalz"
  ustHinweis: '',         // "inkl. 19 % MwSt."
  note: '',
  documents: [],
  entries: [],
  importedAt: new Date().toISOString(),
  importedBy: '',
})

export const emptyDatabase = (kind = 'extern') => ({
  id: uid(),
  name: '',
  kind,
  publisher: '',
  objektart: '',          // "Objektgruppe 023 – Modernisierung Sporthallen"
  description: '',
  versions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

// ── Auswertung ───────────────────────────────────────────────────────────────

/** Der zuletzt freigegebene Kostenstand – der, mit dem neu gerechnet werden soll. */
export function currentVersion(database) {
  const freigegeben = (database?.versions ?? []).filter(v => v.status === 'freigegeben')
  if (!freigegeben.length) return null
  return freigegeben.slice().sort(byStandDesc)[0]
}

/** Kostenstände, neueste zuerst. */
export const sortedVersions = (database) => (database?.versions ?? []).slice().sort(byStandDesc)

const byStandDesc = (a, b) => {
  const ka = a.stand || a.importedAt || ''
  const kb = b.stand || b.importedAt || ''
  return kb.localeCompare(ka)
}

export const findVersion = (database, versionId) =>
  (database?.versions ?? []).find(v => v.id === versionId) ?? null

/**
 * Kennwerte eines Kostenstands zu einer Kostengruppe.
 * Sucht zuerst exakt, dann auf der nächsthöheren Ebene (335 → 330 → 300),
 * damit auch grob gepflegte Datenbanken einen Vergleichswert liefern.
 */
export function lookupEntries(version, kg) {
  const entries = version?.entries ?? []
  const n = Number(kg)
  if (!Number.isFinite(n)) return []
  const exact = entries.filter(e => Number(e.kg) === n)
  if (exact.length) return exact
  const parent2 = entries.filter(e => Number(e.kg) === kg2Of(n))
  if (parent2.length) return parent2
  return entries.filter(e => Number(e.kg) === kg1Of(n))
}

/** Anzahl der Kennwerte über alle Kostenstände. */
export const entryCount = (database) =>
  (database?.versions ?? []).reduce((s, v) => s + (v.entries?.length ?? 0), 0)

/** Anzahl der hinterlegten Nachweisdokumente. */
export const documentCount = (database) =>
  (database?.versions ?? []).reduce((s, v) => s + (v.documents?.length ?? 0), 0)

// ── Eigene Kostenermittlungen: Referenzobjekt ableiten ───────────────────────

/**
 * Baut die Standard-Bezugsgrößen für die Referenzableitung.
 *
 * Kostengruppen beziehen sich nicht alle auf dieselbe Größe: KG 500 rechnet
 * gegen die Außenanlagenfläche, KG 200 gegen die Grundstücksfläche. Wird alles
 * gegen die BGF gerechnet, entstehen Kennwerte, die mit keiner Quelle
 * vergleichbar sind. Die Zuordnung ist deshalb je Hauptkostengruppe getrennt
 * und im Formular überschreibbar.
 *
 * @param evalParam  (parameterName) => Zahl|null
 */
export function defaultBezuege(estimate, evalParam) {
  const haupt = String(estimate.bezugKennzahl || 'BGF_GES').toUpperCase()
  const keys  = (estimate.parameters ?? []).map(p => String(p.key ?? '').toUpperCase()).filter(Boolean)
  const finde = (...kandidaten) => kandidaten.find(k => keys.includes(k)) ?? null

  const eintrag = (key, art) => {
    if (!key) return null
    const wert = evalParam(key)
    return wert ? { key, art, wert } : null
  }

  const standard = eintrag(haupt, guessArt(estimate.bezugKennzahlUnit, 'BGF'))
  const af  = eintrag(finde('AF_SCOPE', 'AF', 'AUSSENFLAECHE'), 'AF')
  const gf  = eintrag(finde('GF_BKI_SCOPE', 'GF', 'GRUNDSTUECKSFLAECHE'), 'GF')

  const map = { default: standard }
  if (af) map[500] = af
  if (gf) map[200] = gf
  return map
}

const guessArt = (unitText, fallback) => {
  const u = String(unitText ?? '').toUpperCase()
  for (const art of ['BRI', 'NUF', 'BGF', 'AF', 'GF']) if (u.includes(art)) return art
  return fallback
}

/** Bezugsgröße einer Kostengruppe aus der Zuordnung. */
export const bezugFor = (bezuege, kg) => {
  const kg1 = kg1Of(kg)
  return bezuege?.[kg1] ?? bezuege?.[String(kg1)] ?? bezuege?.default ?? null
}

/**
 * Leitet aus einer abgeschlossenen Kostenermittlung einen Satz Kennwerte ab und
 * gibt ihn als Kostenstand zurück – die Grundlage der Datenbank „Eigene
 * Kostenermittlungen".
 *
 * Je Kostengruppe wird gerechnet:  Nettokosten der Variante ÷ Bezugsgröße,
 * anschließend auf brutto hochgerechnet, damit die Werte mit BKI-Kennwerten
 * vergleichbar bleiben. Kostengruppen ohne hinterlegte Bezugsgröße werden
 * übersprungen statt gegen eine unpassende Größe gerechnet.
 *
 * @param estimate  die Kostenermittlung
 * @param result    Ergebnis aus calcEstimate(estimate)
 * @param opts      { vkey, ebene, bezuege, label, stand, note, by }
 */
export function referenzKostenstand(estimate, result, opts = {}) {
  const vkey    = opts.vkey ?? result.vkeys[0]
  const ebene   = opts.ebene ?? 2
  const ust     = result.factors.ust ?? 0
  const totals  = result.totals.byVariant[vkey]
  const bezuege = opts.bezuege ?? {}
  if (!totals) return null

  const sums = ebene === 1 ? totals.kg1 : totals.kg2
  const entries = []
  const ohneBezug = []

  for (const [kg, netto] of Object.entries(sums).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (Math.abs(netto) < 0.5) continue
    const bezug = bezugFor(bezuege, kg)
    if (!bezug?.wert) { ohneBezug.push(Number(kg)); continue }
    entries.push({
      ...emptyEntry(Number(kg)),
      leistung: `Referenzobjekt · ${estimate.projectName || estimate.name}`,
      bezug: bezug.art,
      unit:  bezugUnit(bezug.art) + ' brutto',
      brutto: true,
      // Ein Referenzobjekt liefert genau einen Wert, keine Spanne.
      von: '', mittel: round2(netto / bezug.wert * (1 + ust)), bis: '',
      quelle: `${estimate.name}${estimate.kostenstand ? ' · Kostenstand ' + estimate.kostenstand : ''}`,
      note: `Abgeleitet aus Variante ${vkey}; ${bezug.key} = ${bezug.wert}.`,
    })
  }

  if (!entries.length) return null

  return {
    ...emptyVersion(opts.label ?? (estimate.projectName || estimate.name)),
    stand:      opts.stand ?? new Date().toISOString().slice(0, 10),
    status:     'entwurf',
    ustHinweis: `inkl. ${Math.round(ust * 100)} % MwSt.`,
    importedBy: opts.by ?? '',
    ohneBezug,
    note: opts.note ?? `Automatisch abgeleitet aus der Kostenermittlung „${estimate.name}". `
        + `Variante ${vkey}, ${ebene}. Ebene DIN 276. Bruttokennwerte; vor Verwendung fachlich zu prüfen.`
        + (ohneBezug.length ? ` Ohne hinterlegte Bezugsgröße übersprungen: KG ${ohneBezug.join(', ')}.` : ''),
    entries,
  }
}

const round2 = (n) => String(Math.round(n * 100) / 100).replace('.', ',')

// ── Anwendung auf eine Kostenermittlung ──────────────────────────────────────

/**
 * Füllt die Vergleichsspalten (von/Mittel/bis) der Positionen aus einem
 * Kostenstand und vermerkt die Herkunft in `dbRef`.
 *
 * Passt kein Kennwert zur Kostengruppe, bleibt die Position unangetastet – es
 * wird bewusst nichts erfunden. Bereits gefüllte Spalten werden nur mit
 * `overwrite` überschrieben, damit von Hand gepflegte Werte nicht verloren gehen.
 *
 * @returns { positions, gefuellt, uebersprungen, ohneTreffer }
 */
export function fillFromVersion(positions, database, version, { overwrite = false } = {}) {
  let gefuellt = 0, uebersprungen = 0, ohneTreffer = 0

  const next = positions.map(pos => {
    const kg = pos.kg3 || pos.kg2
    if (!kg) { ohneTreffer++; return pos }

    const hits = lookupEntries(version, kg)
    if (!hits.length) { ohneTreffer++; return pos }

    // Bei mehreren Kennwerten je Kostengruppe den nehmen, dessen Leistungstext
    // am ehesten zur Maßnahme passt; sonst den ersten.
    const entry = bestMatch(hits, pos.measure)

    const hatWerte = [pos.bkiVon, pos.bkiMittel, pos.bkiBis].some(v => v !== '' && v != null)
    if (hatWerte && !overwrite) { uebersprungen++; return pos }

    gefuellt++
    return {
      ...pos,
      bkiVon:    entry.von    ?? '',
      bkiMittel: entry.mittel ?? '',
      bkiBis:    entry.bis    ?? '',
      dbRef: { dbId: database.id, versionId: version.id, entryId: entry.id },
      source: pos.source || [database.name, version.label, entry.quelle].filter(Boolean).join(' · '),
    }
  })

  return { positions: next, gefuellt, uebersprungen, ohneTreffer }
}

/** Grobe Textähnlichkeit über gemeinsame Wortanfänge – reicht, um „Herstellen"
 *  von „Abbrechen" zu unterscheiden, ohne eine Volltextsuche aufzubauen. */
function bestMatch(entries, text) {
  if (entries.length === 1 || !text) return entries[0]
  const words = String(text).toLowerCase().split(/[^a-zäöüß]+/).filter(w => w.length > 3)
  let best = entries[0], bestScore = -1
  for (const e of entries) {
    const hay = `${e.leistung ?? ''} ${e.label ?? ''}`.toLowerCase()
    const score = words.reduce((s, w) => s + (hay.includes(w.slice(0, 5)) ? 1 : 0), 0)
    if (score > bestScore) { best = e; bestScore = score }
  }
  return best
}

/**
 * Prüft die gebundenen Datenquellen einer Kostenermittlung gegen den aktuellen
 * Stand der Datenbanken. Meldet, wo ein neuerer freigegebener Kostenstand
 * bereitsteht – die Grundlage der Aktualisierungshinweise im Editor.
 */
export function pruefeAktualitaet(datenquellen = [], databases = []) {
  return datenquellen.map(q => {
    const db = databases.find(d => d.id === q.dbId)
    if (!db) return { ...q, fehlt: true }
    const gebunden = findVersion(db, q.versionId)
    const aktuell  = currentVersion(db)
    const neuer    = aktuell && aktuell.id !== q.versionId
      && (aktuell.stand || '') > (gebunden?.stand || '')
    return {
      ...q,
      fehlt: false,
      database: db,
      gebundenerStand: gebunden,
      aktuellerStand:  aktuell,
      veraltet: !!neuer,
      abgeloest: gebunden?.status === 'abgeloest',
    }
  })
}
