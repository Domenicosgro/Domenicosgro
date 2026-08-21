// Datenmodell der Kostenermittlung.
//
// Eine Kostenermittlung gehört zu einem Projekt. Je Projekt sind mehrere
// Kostenstände möglich (Kostenschätzung Vorplanung, Kostenberechnung Entwurf …).
//
// Grundprinzip (siehe Methodendokumentation):
//   • Kennwerte werden als BKI-Bruttowerte geführt und zu Nettokosten gerechnet.
//   • Jede Variante hat eine eigene, sichtbare Kennwert-Spalte – keine versteckten
//     Zuschläge.
//   • Wo BKI keinen passenden Kennwert liefert, wird ein gekennzeichneter
//     Projekt-/Marktansatz verwendet statt Scheingenauigkeit.

import { uid } from '../utils'

// ── Kostenermittlungsstufen nach DIN 276 ─────────────────────────────────────
export const STUFEN = [
  { value: 'kostenrahmen',      label: 'Kostenrahmen',      lph: 'LPH 1',  ebene: 1 },
  { value: 'kostenschaetzung',  label: 'Kostenschätzung',   lph: 'LPH 2',  ebene: 2 },
  { value: 'kostenberechnung',  label: 'Kostenberechnung',  lph: 'LPH 3',  ebene: 3 },
  { value: 'kostenanschlag',    label: 'Kostenanschlag',    lph: 'LPH 6/7', ebene: 3 },
  { value: 'kostenfeststellung',label: 'Kostenfeststellung',lph: 'LPH 8',  ebene: 3 },
]
export const stufeLabel = (v) => STUFEN.find(s => s.value === v)?.label ?? v

// ── Bearbeitungsstatus der gesamten Ermittlung ───────────────────────────────
export const DOC_STATUS = [
  { value: 'entwurf',      label: 'In Bearbeitung', badge: 'badge-yellow' },
  { value: 'freigegeben',  label: 'Freigegeben',    badge: 'badge-green' },
  { value: 'archiviert',   label: 'Archiviert',     badge: 'badge-gray' },
]
export const docStatusBadge = (v) => DOC_STATUS.find(s => s.value === v) ?? DOC_STATUS[0]

// ── Woher stammt der gewählte Kennwert? ──────────────────────────────────────
export const ANSATZ_TYPEN = [
  { value: 'bki-von',    label: 'BKI von',       kurz: 'BKI ▼', badge: 'badge-blue'   },
  { value: 'bki-mittel', label: 'BKI Mittel',    kurz: 'BKI ◆', badge: 'badge-blue'   },
  { value: 'bki-bis',    label: 'BKI bis',       kurz: 'BKI ▲', badge: 'badge-blue'   },
  { value: 'projekt',    label: 'Projektansatz', kurz: 'PRJ',   badge: 'badge-yellow' },
  { value: 'markt',      label: 'Marktansatz',   kurz: 'MKT',   badge: 'badge-yellow' },
  { value: 'fachplaner', label: 'Fachplaner',    kurz: 'FP',    badge: 'badge-green'  },
  { value: 'angebot',    label: 'Angebot',       kurz: 'ANG',   badge: 'badge-green'  },
]
export const ansatzBadge = (v) => ANSATZ_TYPEN.find(a => a.value === v) ?? null

// ── Reifegrad einer Position (welche Klärung steht noch aus?) ────────────────
export const POS_STATUS = [
  { value: 'bki',        label: 'BKI-basiert',              badge: 'badge-blue'   },
  { value: 'mengen',     label: 'Mengen prüfen',            badge: 'badge-yellow' },
  { value: 'markt',      label: 'Marktanfrage erforderlich',badge: 'badge-yellow' },
  { value: 'konzept',    label: 'Konzept offen',            badge: 'badge-red'    },
  { value: 'schadstoff', label: 'Schadstoffmengen offen',   badge: 'badge-red'    },
  { value: 'gesichert',  label: 'Gesichert',                badge: 'badge-green'  },
]
export const posStatusBadge = (v) => POS_STATUS.find(s => s.value === v) ?? null

// ── Rechenart einer Position ─────────────────────────────────────────────────
export const POS_MODES = [
  { value: 'unit',    label: 'Menge × Kennwert (brutto)', hint: 'Menge × Kennwert ÷ (1+USt) × Regionalfaktor × Preisindex' },
  { value: 'percent', label: 'Anteil an Bezugssumme',     hint: 'Prozentsatz auf eine bereits berechnete Nettosumme – für KG 700' },
  { value: 'netto',   label: 'Nettobetrag direkt',        hint: 'Bereits netto vorliegender Betrag, z. B. aus Angebot oder Fachplanung' },
]

// Bezugssummen für mode 'percent'
export const PERCENT_BASES = [
  { value: 'KG200_600', label: 'KG 200–600 netto' },
  { value: 'KG300_400', label: 'KG 300 + 400 netto' },
  { value: 'KG300',     label: 'KG 300 netto' },
  { value: 'KG200_700', label: 'KG 200–700 netto (ohne diese Position)' },
]

// ── Quellenarten ─────────────────────────────────────────────────────────────
export const QUELLEN_TYPEN = ['BKI', 'Projekt', 'Plan', 'Gutachten', 'Fachplaner', 'Norm', 'Recht', 'Angebot', 'Sonstiges']

// ── Fabriken ─────────────────────────────────────────────────────────────────

export const emptyVariant = (key = 'V1', name = 'Variante 1') => ({
  id: uid(),
  key,                    // Spaltenkürzel, z. B. "V1", "V2A"
  name,                   // "Grundriss 1 + Blechfassade"
  description: '',
  grundriss: '',          // fachliche Zuordnung: welcher Grundriss?
  fassade: '',            // welche Fassadenausführung?
  active: true,
})

export const emptyParameter = (group = '') => ({
  id: uid(),
  group,                  // "Geometrie", "Fassade", "Schadstoffe", …
  name: '',               // Klartext
  key: '',                // Formelname, z. B. BGF_GES
  definition: '',         // Definition / Annahme
  value: '',              // Zahl oder "=Formel"
  unit: '',
  source: '',             // Quelle / Status
})

export const emptyPosition = (kg1 = 300) => ({
  id: uid(),
  kg1,
  kg2: '',
  kg3: '',                // nur wo tiefer gerechnet wird
  label: '',              // Bezeichnung der Kostengruppe
  measure: '',            // Maßnahme / Abgrenzung
  mode: 'unit',
  qty: '',                // Menge: Zahl oder "=PARAMETER"
  qtyByVariant: {},       // optionale variantenspezifische Menge: { V1: '=…' }
  unit: 'm²',
  bkiVon: '', bkiMittel: '', bkiBis: '',   // €/Einheit brutto
  values: {},             // gewählter Kennwert je Variantenschlüssel (brutto)
  percentBase: 'KG200_600',
  ansatz: 'bki-von',
  status: 'bki',
  source: '',             // Quellen-/Herleitungshinweis
  note: '',
})

export const emptyAssumption = () => ({
  id: uid(),
  topic: '',              // Thema, z. B. "Schadstoffe"
  text: '',               // Annahme / offener Punkt
  impact: '',             // Kostenwirkung / betroffene Kostengruppen
  risk: 'mittel',         // 'niedrig' | 'mittel' | 'hoch'
  open: true,
})

export const RISIKO_STUFEN = [
  { value: 'niedrig', label: 'Niedrig', badge: 'badge-green'  },
  { value: 'mittel',  label: 'Mittel',  badge: 'badge-yellow' },
  { value: 'hoch',    label: 'Hoch',    badge: 'badge-red'    },
]
export const risikoBadge = (v) => RISIKO_STUFEN.find(r => r.value === v) ?? RISIKO_STUFEN[1]

export const emptySource = () => ({
  id: uid(),
  file: '',
  stand: '',
  usage: '',
  note: '',
  type: 'Projekt',
})

export const emptyPlannerState = () => ({
  id: uid(),
  discipline: '',         // Elektro, HLS/RLT, Schadstoffe, Brandschutz, Tragwerk
  stand: '',              // Datum des Planerstands
  file: '',
  findings: '',           // kostenrelevante Aussagen
  impact: '',             // Kostenfolge / betroffene KG
})

/** Neue, leere Kostenermittlung. Ohne Positionen – die kommen aus einer Vorlage. */
export const emptyKostenermittlung = (projectId = null, projectName = '') => ({
  id: uid(),
  projectId,
  name: 'Kostenschätzung Vorplanung',
  projectName,
  stufe: 'kostenschaetzung',
  status: 'entwurf',
  ebene: 2,                       // Abgabeebene der Übersicht (2 = 2. Ebene DIN 276)
  kostenstand: '',                // "Q2/2026"
  bkiQuelle: '',                  // "BKI Modernisierungen Sporthallen 2026"
  ust: '0,19',
  regionalfaktor: '1,0',
  preisindex: '1,0',
  budget: '',                     // Bauherrenbudget netto zum Abgleich
  budgetLabel: 'Ausgangsbudget',
  budgetKg: 300,                  // Kostengruppe, gegen die das Budget läuft
  bezugKennzahl: 'BGF_GES',       // Parameter für die €/m²-Kennzahl der Übersicht
  bezugKennzahlUnit: 'm² BGF',
  variants: [emptyVariant()],
  parameters: [],
  bkiRef: [],                     // BKI-Gesamtkennwerte zur Plausibilisierung
  positions: [],
  assumptions: [],
  planners: [],
  sources: [],
  remark: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

/** BKI-Gesamtkennwert einer Hauptgruppe – Grundlage der Plausibilisierung
 *  auf dem Übersichtsblatt (Kapitel „Methodischer Hinweis zu BKI-Spannen“:
 *  die Summe der Unterwerte muss den Gesamtunterwert nicht treffen). */
export const emptyBkiRef = (kg = 300) => ({
  id: uid(),
  kg,
  von: '', mittel: '', bis: '',
  bezug: 'BGF_GES',       // Parametername der Bezugsgröße
  unit: '€/m² BGF brutto',
  note: '',
})
