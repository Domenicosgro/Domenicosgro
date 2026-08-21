// Kostengruppen-Katalog nach DIN 276:2018-12.
//
// 1. Ebene  = Hauptgruppen 100–800
// 2. Ebene  = Kostengruppen x10–x90  (vollständig)
// 3. Ebene  = nur für KG 300 vorbelegt, weil dort die entwurfsabhängigen
//             Unterschiede liegen und dort tiefer gerechnet wird.
//
// Die 3. Ebene ist eine Auswahlhilfe, keine Beschränkung: In den Positionen
// lässt sich jede Kostengruppe der 3. Ebene auch frei eintragen.

export const KG1 = [
  { kg: 100, label: 'Grundstück' },
  { kg: 200, label: 'Vorbereitende Maßnahmen' },
  { kg: 300, label: 'Bauwerk – Baukonstruktionen' },
  { kg: 400, label: 'Bauwerk – Technische Anlagen' },
  { kg: 500, label: 'Außenanlagen und Freiflächen' },
  { kg: 600, label: 'Ausstattung und Kunstwerke' },
  { kg: 700, label: 'Baunebenkosten' },
  { kg: 800, label: 'Finanzierung' },
]

export const KG2 = [
  { kg: 110, kg1: 100, label: 'Grundstückswert' },
  { kg: 120, kg1: 100, label: 'Grundstücksnebenkosten' },
  { kg: 130, kg1: 100, label: 'Rechte Dritter' },
  { kg: 190, kg1: 100, label: 'Sonstiges zur KG 100' },

  { kg: 210, kg1: 200, label: 'Herrichten' },
  { kg: 220, kg1: 200, label: 'Öffentliche Erschließung' },
  { kg: 230, kg1: 200, label: 'Nichtöffentliche Erschließung' },
  { kg: 240, kg1: 200, label: 'Ausgleichsmaßnahmen und -abgaben' },
  { kg: 250, kg1: 200, label: 'Übergangsmaßnahmen' },
  { kg: 290, kg1: 200, label: 'Sonstiges zur KG 200' },

  { kg: 310, kg1: 300, label: 'Baugrube, Erdbau' },
  { kg: 320, kg1: 300, label: 'Gründung, Unterbau' },
  { kg: 330, kg1: 300, label: 'Außenwände / Vertikale Baukonstruktionen, außen' },
  { kg: 340, kg1: 300, label: 'Innenwände / Vertikale Baukonstruktionen, innen' },
  { kg: 350, kg1: 300, label: 'Decken / Horizontale Baukonstruktionen' },
  { kg: 360, kg1: 300, label: 'Dächer' },
  { kg: 370, kg1: 300, label: 'Infrastrukturanlagen' },
  { kg: 380, kg1: 300, label: 'Baukonstruktive Einbauten' },
  { kg: 390, kg1: 300, label: 'Sonstige Maßnahmen für Baukonstruktionen' },

  { kg: 410, kg1: 400, label: 'Abwasser-, Wasser-, Gasanlagen' },
  { kg: 420, kg1: 400, label: 'Wärmeversorgungsanlagen' },
  { kg: 430, kg1: 400, label: 'Raumlufttechnische Anlagen' },
  { kg: 440, kg1: 400, label: 'Elektrische Anlagen' },
  { kg: 450, kg1: 400, label: 'Kommunikations-, sicherheits- und informationstechnische Anlagen' },
  { kg: 460, kg1: 400, label: 'Förderanlagen' },
  { kg: 470, kg1: 400, label: 'Nutzungsspezifische und verfahrenstechnische Anlagen' },
  { kg: 480, kg1: 400, label: 'Gebäude- und Anlagenautomation' },
  { kg: 490, kg1: 400, label: 'Sonstige Maßnahmen für technische Anlagen' },

  { kg: 510, kg1: 500, label: 'Erdbau' },
  { kg: 520, kg1: 500, label: 'Gründung, Unterbau' },
  { kg: 530, kg1: 500, label: 'Oberbau, Deckschichten' },
  { kg: 540, kg1: 500, label: 'Baukonstruktionen' },
  { kg: 550, kg1: 500, label: 'Technische Anlagen' },
  { kg: 560, kg1: 500, label: 'Einbauten in Außenanlagen und Freiflächen' },
  { kg: 570, kg1: 500, label: 'Vegetationsflächen' },
  { kg: 580, kg1: 500, label: 'Wasserflächen' },
  { kg: 590, kg1: 500, label: 'Sonstige Maßnahmen für Außenanlagen und Freiflächen' },

  { kg: 610, kg1: 600, label: 'Allgemeine Ausstattung' },
  { kg: 620, kg1: 600, label: 'Besondere Ausstattung' },
  { kg: 630, kg1: 600, label: 'Informationstechnische Ausstattung' },
  { kg: 640, kg1: 600, label: 'Künstlerische Ausstattung' },
  { kg: 690, kg1: 600, label: 'Sonstige Ausstattung' },

  { kg: 710, kg1: 700, label: 'Bauherrenaufgaben' },
  { kg: 720, kg1: 700, label: 'Vorbereitung der Objektplanung' },
  { kg: 730, kg1: 700, label: 'Objektplanung' },
  { kg: 740, kg1: 700, label: 'Fachplanung' },
  { kg: 750, kg1: 700, label: 'Künstlerische Leistungen' },
  { kg: 760, kg1: 700, label: 'Allgemeine Baunebenkosten' },
  { kg: 790, kg1: 700, label: 'Sonstige Baunebenkosten' },

  { kg: 810, kg1: 800, label: 'Finanzierungsnebenkosten' },
  { kg: 820, kg1: 800, label: 'Fremdkapitalzinsen' },
  { kg: 830, kg1: 800, label: 'Eigenkapitalzinsen' },
  { kg: 840, kg1: 800, label: 'Bürgschaften' },
  { kg: 890, kg1: 800, label: 'Sonstige Finanzierungskosten' },
]

// 3. Ebene KG 300. Für KG 370 gibt DIN 276 projektabhängige Untergruppen vor;
// dort wird die 3. Ebene bewusst frei eingetragen.
export const KG3 = [
  { kg: 311, kg2: 310, label: 'Herstellung' },
  { kg: 312, kg2: 310, label: 'Umschließung' },
  { kg: 313, kg2: 310, label: 'Wasserhaltung' },
  { kg: 319, kg2: 310, label: 'Sonstiges zur KG 310' },

  { kg: 321, kg2: 320, label: 'Baugrundverbesserung' },
  { kg: 322, kg2: 320, label: 'Flachgründungen und Bodenplatten' },
  { kg: 323, kg2: 320, label: 'Tiefgründungen' },
  { kg: 324, kg2: 320, label: 'Gründungsbeläge' },
  { kg: 325, kg2: 320, label: 'Abdichtungen und Bekleidungen' },
  { kg: 326, kg2: 320, label: 'Dränagen' },
  { kg: 329, kg2: 320, label: 'Sonstiges zur KG 320' },

  { kg: 331, kg2: 330, label: 'Tragende Außenwände' },
  { kg: 332, kg2: 330, label: 'Nichttragende Außenwände' },
  { kg: 333, kg2: 330, label: 'Außenstützen' },
  { kg: 334, kg2: 330, label: 'Außenwandöffnungen' },
  { kg: 335, kg2: 330, label: 'Außenwandbekleidungen, außen' },
  { kg: 336, kg2: 330, label: 'Außenwandbekleidungen, innen' },
  { kg: 337, kg2: 330, label: 'Elementierte Außenwandkonstruktionen' },
  { kg: 338, kg2: 330, label: 'Lichtschutz zur KG 330' },
  { kg: 339, kg2: 330, label: 'Sonstiges zur KG 330' },

  { kg: 341, kg2: 340, label: 'Tragende Innenwände' },
  { kg: 342, kg2: 340, label: 'Nichttragende Innenwände' },
  { kg: 343, kg2: 340, label: 'Innenstützen' },
  { kg: 344, kg2: 340, label: 'Innenwandöffnungen' },
  { kg: 345, kg2: 340, label: 'Innenwandbekleidungen' },
  { kg: 346, kg2: 340, label: 'Elementierte Innenwandkonstruktionen' },
  { kg: 347, kg2: 340, label: 'Lichtschutz zur KG 340' },
  { kg: 349, kg2: 340, label: 'Sonstiges zur KG 340' },

  { kg: 351, kg2: 350, label: 'Deckenkonstruktionen' },
  { kg: 352, kg2: 350, label: 'Deckenöffnungen' },
  { kg: 353, kg2: 350, label: 'Deckenbeläge' },
  { kg: 354, kg2: 350, label: 'Deckenbekleidungen' },
  { kg: 355, kg2: 350, label: 'Elementierte Deckenkonstruktionen' },
  { kg: 359, kg2: 350, label: 'Sonstiges zur KG 350' },

  { kg: 361, kg2: 360, label: 'Dachkonstruktionen' },
  { kg: 362, kg2: 360, label: 'Dachöffnungen' },
  { kg: 363, kg2: 360, label: 'Dachbeläge' },
  { kg: 364, kg2: 360, label: 'Dachbekleidungen' },
  { kg: 365, kg2: 360, label: 'Elementierte Dachkonstruktionen' },
  { kg: 366, kg2: 360, label: 'Lichtschutz zur KG 360' },
  { kg: 369, kg2: 360, label: 'Sonstiges zur KG 360' },

  { kg: 379, kg2: 370, label: 'Sonstiges zur KG 370' },

  { kg: 381, kg2: 380, label: 'Allgemeine Einbauten' },
  { kg: 382, kg2: 380, label: 'Besondere Einbauten' },
  { kg: 386, kg2: 380, label: 'Orientierungs- und Informationssysteme' },
  { kg: 387, kg2: 380, label: 'Schutzeinbauten' },
  { kg: 389, kg2: 380, label: 'Sonstiges zur KG 380' },

  { kg: 391, kg2: 390, label: 'Baustelleneinrichtung' },
  { kg: 392, kg2: 390, label: 'Gerüste' },
  { kg: 393, kg2: 390, label: 'Sicherungsmaßnahmen' },
  { kg: 394, kg2: 390, label: 'Abbruchmaßnahmen' },
  { kg: 395, kg2: 390, label: 'Instandsetzungen' },
  { kg: 396, kg2: 390, label: 'Materialentsorgung' },
  { kg: 397, kg2: 390, label: 'Zusätzliche Maßnahmen' },
  { kg: 398, kg2: 390, label: 'Provisorische Baukonstruktionen' },
  { kg: 399, kg2: 390, label: 'Sonstiges zur KG 390' },
]

const byKg = (arr) => Object.fromEntries(arr.map(e => [e.kg, e]))
const MAP1 = byKg(KG1)
const MAP2 = byKg(KG2)
const MAP3 = byKg(KG3)

export const kg1Label = (kg) => MAP1[Number(kg)]?.label ?? ''
export const kg2Label = (kg) => MAP2[Number(kg)]?.label ?? ''
export const kg3Label = (kg) => MAP3[Number(kg)]?.label ?? ''

/** Bezeichnung zu einer beliebigen Kostengruppe (1.–3. Ebene). */
export const kgLabel = (kg) => {
  const n = Number(kg)
  return MAP3[n]?.label ?? MAP2[n]?.label ?? MAP1[n]?.label ?? ''
}

/** Zu welcher Hauptgruppe gehört eine Kostengruppe? 335 → 300, 410 → 400 */
export const kg1Of = (kg) => {
  const n = Number(kg)
  if (!Number.isFinite(n) || n < 100) return null
  return Math.floor(n / 100) * 100
}

/** Zu welcher 2. Ebene gehört eine Kostengruppe der 3. Ebene? 335 → 330 */
export const kg2Of = (kg) => {
  const n = Number(kg)
  if (!Number.isFinite(n)) return null
  return Math.floor(n / 10) * 10
}

/** 2.-Ebene-Gruppen einer Hauptgruppe. */
export const kg2For = (kg1) => KG2.filter(e => e.kg1 === Number(kg1))

/** 3.-Ebene-Gruppen einer 2.-Ebene-Gruppe. */
export const kg3For = (kg2) => KG3.filter(e => e.kg2 === Number(kg2))

/** Gebräuchliche Mengeneinheiten in der Kostenermittlung. */
export const UNITS = ['m²', 'm³', 'm', 'St', 'psch', 'Platz', 'kg', 't', 'h', '%']

/** Bezugsgrößen nach DIN 277 / BKI. */
export const BEZUGSGROESSEN = [
  { value: 'BGF', label: 'BGF – Brutto-Grundfläche', unit: 'm² BGF' },
  { value: 'NUF', label: 'NUF – Nutzungsfläche',     unit: 'm² NUF' },
  { value: 'BRI', label: 'BRI – Brutto-Rauminhalt',  unit: 'm³ BRI' },
  { value: 'GF',  label: 'GF – Grundstücksfläche',   unit: 'm² GF' },
  { value: 'AF',  label: 'AF – Außenanlagenfläche',  unit: 'm² AF' },
]
