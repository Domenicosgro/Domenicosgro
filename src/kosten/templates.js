// Vorlagen für neue Kostenermittlungen.
//
// „leer“        – reine DIN-276-Struktur auf der 2. Ebene, alle Werte offen.
// „sporthalle“  – vollständig vorbelegtes Modell nach der dokumentierten
//                 Methodik (BKI Modernisierungen Sporthallen, Q2/2026).
//                 Die Werte sind Startwerte eines konkreten Projekts und
//                 müssen für ein neues Projekt ersetzt werden.

import { uid } from '../utils'
import { KG2, kg2Label, kg3Label, kg2Of } from './din276'
import {
  emptyKostenermittlung, emptyVariant, emptyParameter, emptyPosition,
  emptyAssumption, emptySource, emptyPlannerState, emptyBkiRef,
} from './model'

// ── Hilfsfabriken ────────────────────────────────────────────────────────────

const param = (group, name, key, definition, value, unit, source) =>
  ({ ...emptyParameter(group), name, key, definition, value, unit, source })

/** Position der 3. Ebene (KG 300). */
const p3 = (kg3, measure, qty, unit, bki, values, ansatz, status, source) => ({
  ...emptyPosition(300),
  kg2: kg2Of(kg3), kg3,
  label: kg3Label(kg3),
  measure, qty, unit,
  bkiVon: bki[0] === undefined ? '' : de(bki[0]), bkiMittel: bki[1] === undefined ? '' : de(bki[1]), bkiBis: bki[2] === undefined ? '' : de(bki[2]),
  values, ansatz, status, source,
})

/** Position der 2. Ebene (KG 200/400/500/600). */
const p2 = (kg2, qty, unit, bki, values, ansatz, status, source, measure = '') => ({
  ...emptyPosition(Math.floor(kg2 / 100) * 100),
  kg2, kg3: '',
  label: kg2Label(kg2),
  measure, qty, unit,
  bkiVon: bki[0] === undefined ? '' : de(bki[0]), bkiMittel: bki[1] === undefined ? '' : de(bki[1]), bkiBis: bki[2] === undefined ? '' : de(bki[2]),
  values, ansatz, status, source,
})

/** Prozentposition (KG 700). */
const pPct = (kg2, values, source, base = 'KG200_600') => ({
  ...emptyPosition(700),
  kg2, kg3: '',
  label: kg2Label(kg2),
  mode: 'percent', percentBase: base,
  qty: '1', unit: '%',
  values, ansatz: 'projekt', status: 'konzept', source,
})

/** Zahl als deutscher Eingabetext: 261.8 -> "261,8". Eingabezellen zeigen den
 *  Rohwert, deshalb sollen Vorlagenwerte bereits deutsch formatiert sein. */
const de = (v) => String(v).replace('.', ',')

/** Gleiche Werte in allen vier Varianten. */
const all4 = (v) => ({ V1: de(v), V2A: de(v), V2B: de(v), V3: de(v) })

// ── Vorlage „leer“ ───────────────────────────────────────────────────────────

function buildLeer(projectId, projectName) {
  const est = emptyKostenermittlung(projectId, projectName)
  est.variants = [{ ...emptyVariant('V1', 'Variante 1') }]
  est.parameters = [
    param('Geometrie', 'BGF gesamt',        'BGF_GES',   'Brutto-Grundfläche nach DIN 277', '', 'm²',    'Planstand eintragen'),
    param('Geometrie', 'NUF',               'NUF',       'Nutzungsfläche nach DIN 277',     '', 'm²',    'Planstand eintragen'),
    param('Geometrie', 'BRI',               'BRI',       'Brutto-Rauminhalt nach DIN 277',  '', 'm³',    'Planstand eintragen'),
    param('Bezug',     'Grundstücksfläche', 'GF',        'Bezugsgröße KG 200',              '', 'm²',    'Katasterauszug'),
    param('Bezug',     'Außenanlagenfläche','AF_SCOPE',  'Bezugsgröße KG 500',              '', 'm²',    'aus Freianlagenplanung'),
  ]
  // KG 200–700 auf der 2. Ebene, ohne Werte
  const groups = [200, 300, 400, 500, 600, 700]
  est.positions = KG2
    .filter(e => groups.includes(e.kg1))
    .map(e => e.kg1 === 700
      ? pPct(e.kg, { V1: '' }, 'Projektansatz – Prozentsatz eintragen')
      : p2(e.kg, e.kg1 === 200 ? '=GF' : e.kg1 === 500 ? '=AF_SCOPE' : '=BGF_GES',
           e.kg1 === 200 ? 'm² GF' : e.kg1 === 500 ? 'm² AF' : 'm² BGF',
           [], { V1: '' }, 'bki-von', 'mengen', ''))
  est.bkiRef = [300, 400, 500, 600].map(kg => ({ ...emptyBkiRef(kg) }))
  return est
}

// ── Vorlage „Sporthalle – Modernisierung“ ────────────────────────────────────

function buildSporthalle(projectId, projectName) {
  const est = emptyKostenermittlung(projectId, projectName)
  est.name        = 'Kostenschätzung Vorplanung'
  est.stufe       = 'kostenschaetzung'
  est.kostenstand = 'Q2/2026'
  est.bkiQuelle   = 'BKI Modernisierungen Sporthallen 2026 (Objektgruppe 023), Kostenstand Q2/2026, Bundesdurchschnitt, inkl. 19 % MwSt.'
  est.ust             = '0,19'
  est.regionalfaktor  = '0,983'
  est.preisindex      = '1,0'
  est.budget          = '2100000'
  est.budgetLabel     = 'Ausgangsbudget KG 300 (Leistungsbeschreibung)'
  est.budgetKg        = 300
  est.bezugKennzahl   = 'BGF_GES'
  est.bezugKennzahlUnit = 'm² BGF'
  est.remark = 'Erstbefüllung der wählbaren Kennwerte mit dem niedrigsten direkt anwendbaren BKI-Wert. '
             + 'Der untere BKI-Wert ist kein empfohlener Endwert, sondern die reproduzierbare Erstbefüllungsregel. '
             + 'Wo BKI keinen passenden Kennwert liefert, steht ein gekennzeichneter Projekt-/Marktansatz.'

  est.variants = [
    { ...emptyVariant('V1',  'Grundriss 1 · Blech + Holz'),   grundriss: 'Grundriss 1', fassade: 'Blech (Halle) + horizontale Holzverschalung (Nebenbau)', description: 'Pultdach Nebenbau eingekürzt, Holzfassade hochgezogen (Quaderwirkung), neue Dachränder/Anschlüsse, Dachentwässerung Nebenbau neu.' },
    { ...emptyVariant('V2A', 'Grundriss 2 · BEMO Sonderfarbe'), grundriss: 'Grundriss 2', fassade: 'BEMO-Metallfassade ringsum, Sonderfarbe', description: 'Sonderfarbe derzeit ohne gesonderten Farbzuschlag vorbefüllt – Marktpreis erforderlich.' },
    { ...emptyVariant('V2B', 'Grundriss 2 · BEMO natur'),      grundriss: 'Grundriss 2', fassade: 'BEMO-Metallfassade ringsum, Blech natur', description: 'Identischer Grundriss wie V2A, nur andere Oberfläche.' },
    { ...emptyVariant('V3',  'Grundriss 3 · Streckmetall'),    grundriss: 'Grundriss 3', fassade: 'Streckmetallfassade ringsum', description: 'Unterkonstruktion, Hinterlegung und Lochbild offen – Marktpreis zwingend nachzuführen.' },
  ]

  est.parameters = [
    // Projekt- und Mengengerüst
    param('Geometrie',     'BGF gesamt',                  'BGF_GES',           'Brutto-Grundfläche Bestand',                                   '2418',    'm²',    'Plan 1.10 / Planstand 31.07.2026'),
    param('Geometrie',     'BGF Halle',                   'BGF_HALLE',         'Hohe Hallenzone',                                              '1318',    'm²',    'Plan 1.11'),
    param('Geometrie',     'BGF Kopfbau',                 'BGF_KOPF',          'Seitlicher Kopfbau',                                           '411',     'm²',    'Plan 1.11'),
    param('Geometrie',     'BGF Nebenräume',              'BGF_NEBEN',         'Umkleiden, Sanitär, Nebenräume',                               '688',     'm²',    'Plan 1.11'),
    param('Bodenplatte',   'Bodenplattenfläche neu',      'BP_SCOPE',          'Kopfbau + Nebenräume vollständig rückbauen und neu herstellen','=BGF_KOPF+BGF_NEBEN', 'm²', 'Nutzerangabe; 411 + 688 m²; prüfen'),
    param('Sporthalle',    'Sportbodenfläche',            'SPORTFL',           'Raumfläche Sporthalle',                                        '1302,41', 'm²',    'Bestandsgrundriss'),
    param('Nebenbereiche', 'Boden-/Deckenfläche',         'NEBENFL',           'Summe Räume außerhalb Sporthalle',                             '1007,87', 'm²',    'Raumflächenmodell'),
    param('Fassade',       'VHF-/Bekleidungsfläche',      'FASS_VHF',          'Opake Fassadenfläche inkl. Dämmung und Unterkonstruktion',     '1150',    'm²',    'Arbeitsmenge aus Ansichten/Modell; Aufmaß erforderlich'),
    param('Fassade',       'Fenster-/Glasfläche',         'FENSTER_A',         'Alle Fenster und verglasten Außenöffnungen',                   '180',     'm²',    'Arbeitsmenge; Aufmaß erforderlich'),
    param('Fassade',       'Gebäudeumfang',               'PERIMETER',         'Sockel-/Anschlusslänge; ca. 2 × (55,37 + 43,64)',              '198',     'm',     'Ansichten/Bestandsplan'),
    param('Fassade',       'Außentüren',                  'AUSSENTUER_COUNT',  'Flucht-, Eingangs- und Servicetüren',                          '12',      'St',    'Arbeitszählung; Türkataster offen'),
    param('Fassade',       'Außentore / Großöffnungen',   'AUSSENTOR_COUNT',   'Große äußere Tor-/Öffnungselemente',                           '4',       'St',    'Arbeitszählung; prüfen'),
    param('RLT',           'Außengeräte / Fundamente',    'RLT_COUNT',         'Planungsannahme: vier Lüftungsgeräte vor Nordfassade',         '4',       'St',    'Nutzerangabe: 3–4 Geräte; Basis = 4'),
    param('Rohbau',        'Erdarbeiten Bodenplatte',     'ERDBAU_M3',         'Aushub/Planum für Nebenbereiche und lokale Fundamente',        '400',     'm³',    'Arbeitsmenge; Baugrund/Schichten prüfen'),
    param('Innenausbau',   'Neue/angepasste Trennwände',  'TRENNWAND_A',       'Leichte Grundrissänderungen; zusätzliche Technikraumtrennungen','300',    'm²',    'Planerstand ELT/HLS 19.08.2026; Aufmaß offen'),
    param('Innenausbau',   'Innentüren Standard',         'INNENTUER_STD',     'Komplette Erneuerung Standardtüren',                           '48',      'St',    'inkl. zusätzliche Technikraumtüren; Türkataster offen'),
    param('Innenausbau',   'Brand-/Sondertüren innen',    'INNENTUER_BRAND',   'Brandschutz- und Rettungswegtüren',                            '10',      'St',    'Brandschutzkonzept in Bearbeitung'),
    param('Innenausbau',   'Wandfliesen Nassräume',       'FLIESEN_WAND_A',    'Umkleiden, Duschen, WCs komplett neu',                         '650',     'm²',    'Arbeitsmenge'),
    param('Innenausbau',   'Putz-/Anstrich-/Wandflächen', 'INNENWAND_A',       'Neue Oberflächen nach Entkernung',                             '1800',    'm²',    'Arbeitsmenge; Schadstoffschnittstelle'),
    param('Sporthalle',    'Prallwandfläche',             'PRALLWAND_A',       'Ballwurfsichere Prallwände Handball',                          '550',     'm²',    'Arbeitsmenge; Herstellerplanung erforderlich'),
    param('Sporthalle',    'Akustik-/Schutzwand oben',    'AKUSTIKWAND_A',     'Akustische/ballwurfsichere Wandbekleidung',                    '250',     'm²',    'Arbeitsmenge'),
    param('Nutzung',       'Lehrerkabinen',               'LEHRER_COUNT',      'Drei Lehrerkabinen im Nebenbereich',                           '3',       'St',    'Nutzeranforderung'),
    param('Sporthalle',    'Trennvorhänge',               'TRENNVORH_COUNT',   'Zwei neue Trennvorhangsysteme',                                '2',       'St',    'Nutzeranforderung'),
    param('Sporthalle',    'Geräteraumtore',              'GERAETETOR_COUNT',  'Neue ballwurfsichere Geräteraumtore',                          '4',       'St',    'Bestandsplan / Nutzerangabe'),
    param('Tribüne',       'Zuschauerplätze',             'TRIBUENE_PLAETZE',  'Neue teleskopierbare/fahrbare Tribüne',                        '400',     'Platz', 'Nutzeranforderung'),
    param('Schadstoffe',   'Asbestbelastete Wandflächen', 'ASBEST_WAND_A',     'Spachtel/Putz/Fliesenkleber – vorläufige Äquivalentfläche',    '2000',    'm²',    'Orientierende Untersuchung; Detailerkundung erforderlich'),
    param('Schadstoffe',   'Alte KMF – Äquivalentfläche', 'KMF_A',             'Decken, Leichtbau, Dämmungen/Isolierungen',                    '1200',    'm²',    'Orientierende Untersuchung; Detailerkundung erforderlich'),

    // Ergänzende Bezugsgrößen
    param('Bezug KG 200',  'Bezugsfläche GF',             'GF_BKI_SCOPE',      'Vorläufige Bezugsfläche für BKI-KG-200-Kennwert; Grundstücksfläche nachtragen', '=BGF_GES', 'm² GF', 'Arbeitswert = BGF, bis Grundstücksfläche feststeht'),
    param('Bezug KG 500',  'Streifenbreite Außenfläche',  'AF_STREIFEN',       'Direkter Perimeter um die Halle für Fassaden-/Sockelarbeiten', '2',       'm',     'Nutzerangabe: nur direkter Perimeter; editierbar'),
    param('Bezug KG 500',  'Bearbeitete Außenfläche AF',  'AF_SCOPE',          'Perimeter × Streifenbreite',                                   '=PERIMETER*AF_STREIFEN', 'm² AF', 'Formel aus Perimeter und Arbeitsbreite'),
    param('Fassade',       'Fassadenfläche Halle',        'FASS_HALLE_A',      'Anteil der opaken VHF-Fläche an der hohen Hallenzone',         '850',     'm²',    'Arbeitsaufteilung; Aufmaß nach Variantenplanung erforderlich'),
    param('Fassade',       'Fassadenfläche Nebenbau',     'FASS_NEBEN_A',      'Rest der opaken VHF-Fläche',                                   '=FASS_VHF-FASS_HALLE_A', 'm²', 'Formel; Summe entspricht FASS_VHF'),

    // Varianten-Startwerte
    param('Variantenwerte','BKI-Basis VHF',               'FASS_BASIS_KW',     'BKI-Unterwert KG 335 als Vergleichsbasis',                     '166',     '€/m² brutto', 'BKI S. 420, KG 335; Referenz'),
    param('Variantenwerte','V1 Blechfassade Sporthalle',  'V1_FASS_HALLE_KW',  'Startwert Variante 1, Hallenzone',                             '166',     '€/m² brutto', 'Erstbefüllung = BKI von'),
    param('Variantenwerte','V1 Holzverschalung Nebenbau', 'V1_FASS_NEBEN_KW',  'Startwert Variante 1, Nebenbau',                               '166',     '€/m² brutto', 'Erstbefüllung = BKI von; Holzpreis noch offen'),
    param('Variantenwerte','V2A BEMO Sonderfarbe',        'V2A_FASS_KW',       'Startwert Variante 2A, ringsum',                               '166',     '€/m² brutto', 'Erstbefüllung = BKI von; Sonderfarbe noch ohne Zuschlag'),
    param('Variantenwerte','V2B BEMO Blech natur',        'V2B_FASS_KW',       'Startwert Variante 2B, ringsum',                               '166',     '€/m² brutto', 'Erstbefüllung = BKI von'),
    param('Variantenwerte','V3 Streckmetall',             'V3_FASS_KW',        'Startwert Variante 3, ringsum',                                '166',     '€/m² brutto', 'Erstbefüllung = BKI von; Marktpreis offen'),
    param('Variantenwerte','V1 Dach einkürzen',           'V1_DACH_ZUSATZ_BRUTTO', 'Zusatzansatz KG 360 nur in Variante 1',                    '25000',   '€ brutto',    'Projektannahme bis Detail/Aufmaß'),
    param('Variantenwerte','V1 Dachentwässerung neu',     'V1_ENTW_ZUSATZ_BRUTTO', 'Zusatzansatz KG 410 nur in Variante 1',                    '15000',   '€ brutto',    'Projektannahme; Schnittstelle HLS/Objektplanung'),
  ]

  est.bkiRef = [
    { ...emptyBkiRef(200), von: '',  mittel: '2',    bis: '5',    bezug: 'GF_BKI_SCOPE', unit: '€/m² GF brutto',  note: 'BKI weist als Unterwert nur „< 1“ aus – bewusst kein Zahlenwert hinterlegt, um keine Scheingenauigkeit zu erzeugen. Keine belastbare Aufteilung auf die 2. Ebene.' },
    { ...emptyBkiRef(300), von: '631', mittel: '1099', bis: '1761', bezug: 'BGF_GES',    unit: '€/m² BGF brutto', note: 'BKI S. 419. KG 300 wird im Modell tiefer betrachtet.' },
    { ...emptyBkiRef(400), von: '122', mittel: '399',  bis: '651',  bezug: 'BGF_GES',    unit: '€/m² BGF brutto', note: 'BKI S. 419; 2. Ebene in BKI vorhanden.' },
    { ...emptyBkiRef(500), von: '26',  mittel: '105',  bis: '284',  bezug: 'AF_SCOPE',   unit: '€/m² AF brutto',  note: 'Nur Gesamt-KG als Referenz; Verteilung auf 2. Ebene ist Projektannahme.' },
    { ...emptyBkiRef(600), von: '4',   mittel: '19',   bis: '51',   bezug: 'BGF_GES',    unit: '€/m² BGF brutto', note: 'Nur Gesamt-KG als Referenz; Verteilung auf 2. Ebene ist Projektannahme.' },
    { ...emptyBkiRef(700), von: '',    mittel: '',     bis: '',     bezug: 'BGF_GES',    unit: '–',               note: 'BKI Modernisierung Sporthallen weist keinen KG-700-Kennwert aus.' },
  ]

  // ── KG 300 · 3. Ebene ─────────────────────────────────────────────────────
  const S = 'BKI Modernisierungen Sporthallen 2026'
  est.positions = [
    p3(311, 'Erdarbeiten für Rückbau/Neuaufbau der Bodenplatte: Aushub, Planum, Arbeitsraum', '=ERDBAU_M3', 'm³', [77, 144, 211], all4(77), 'bki-von', 'mengen', `${S}, S. 420, KG 311; Menge aus Arbeitsansatz`),
    p3(311, 'Lokale Erdarbeiten/Anschlüsse an den Außenfundamenten der RLT-Geräte', '1', 'psch', [], all4(9520), 'projekt', 'konzept', 'Projektansatz; RLT- und Freianlagenschnittstelle'),
    p3(322, 'Rückbau Betonbodenplatte in Kopfbau/Nebenräumen; schadstoffhaltige Ausbaupakete separat in KG 390', '=BP_SCOPE', 'm²', [98, 229, 807], all4(98), 'bki-von', 'bki', `${S}, S. 420, KG 322 Abbrechen; Abgrenzung ohne Schadstoffausbau`),
    p3(322, 'Neue Bodenplatte inkl. Unterbau, Bewehrung, Dämmung und Abdichtung', '=BP_SCOPE', 'm²', [114, 214, 465], all4(114), 'bki-von', 'mengen', `${S}, S. 420, KG 322 Herstellen; projektspezifischer Vollaufbau`),
    p3(322, 'Fundamente/Sockel für vier Außen-RLT-Geräte inkl. Anschlüsse', '=RLT_COUNT', 'St', [], all4(14875), 'projekt', 'konzept', 'Projektansatz; Geräteabmessungen/Lasten offen'),
    p3(325, 'Rand-, Fugen- und Anschlussdetails der neuen Bodenplatte', '1', 'psch', [58, 135, 207], all4(23800), 'projekt', 'mengen', `${S}, S. 420, KG 325; pauschale Ergänzung`),

    p3(335, 'VHF Sporthallenzone inkl. Dämmung, Unterkonstruktion und Bekleidung', '=FASS_HALLE_A', 'm²', [166, 271, 564],
       { V1: '=V1_FASS_HALLE_KW', V2A: '=V2A_FASS_KW', V2B: '=V2B_FASS_KW', V3: '=V3_FASS_KW' },
       'bki-von', 'mengen', `${S}, S. 420, KG 335. V1 = Blech Halle; V2A/V2B = BEMO; V3 = Streckmetall. Erstbefüllung aller Varianten = BKI von.`),
    p3(335, 'VHF Nebenbau inkl. Dämmung, Unterkonstruktion und Bekleidung', '=FASS_NEBEN_A', 'm²', [166, 271, 564],
       { V1: '=V1_FASS_NEBEN_KW', V2A: '=V2A_FASS_KW', V2B: '=V2B_FASS_KW', V3: '=V3_FASS_KW' },
       'bki-von', 'markt', `${S}, S. 420, KG 335. V1 = horizontale Holzverschalung (Holzsystem preislich noch nicht marktverifiziert); V2A/V2B/V3 = Fassade ringsum.`),
    p3(334, 'Alle Fenster und verglasten Außenöffnungen neu', '=FENSTER_A', 'm²', [993, 1352, 2032], all4(993), 'bki-von', 'mengen', `${S}, S. 420, KG 334 Herstellen; Fläche aus Arbeitsmodell`),
    p3(334, 'Außentüren, Flucht-/Rettungsweg- und Servicetüren inkl. Beschläge', '=AUSSENTUER_COUNT', 'St', [], all4(7140), 'projekt', 'mengen', 'Projekt-/Marktansatz; Türkataster und Brandschutzkonzept offen'),
    p3(334, 'Große Außentore/Serviceöffnungen komplett neu', '=AUSSENTOR_COUNT', 'St', [], all4(11900), 'projekt', 'mengen', 'Projekt-/Marktansatz'),
    p3(338, 'Außenliegender Sonnenschutz für neue Fenster-/Glasflächen', '=FENSTER_A', 'm²', [108, 306, 531], all4(108), 'bki-von', 'bki', `${S}, S. 420, KG 338 Herstellen`),
    p3(335, 'Sockelabdichtung, Sockeldämmung und robuste Sockelbekleidung', '=PERIMETER', 'm', [], all4(261.8), 'projekt', 'mengen', 'Projektansatz; Bestandsaufbau/Außenanlagenanschluss prüfen'),
    p3(331, 'Seitliche Wanddurchführungen, Einfassungen und lokale Rohbauanpassungen für RLT', '=RLT_COUNT', 'St', [], all4(9520), 'projekt', 'konzept', 'Projektansatz; keine Dachdurchführungen angenommen'),
    p3(339, 'Lokale Beton-/Fassadenreparaturen, Verankerungen, Kleinleistungen', '1', 'psch', [], all4(23800), 'projekt', 'mengen', 'Projektansatz'),

    p3(342, 'Neue/angepasste Trennwände bei leichten Grundrissänderungen', '=TRENNWAND_A', 'm²', [163, 264, 440], all4(163), 'bki-von', 'mengen', `${S}, S. 421, KG 342 Herstellen`),
    p3(344, 'Standard-Innentüren komplett neu inkl. Zargen/Beschläge', '=INNENTUER_STD', 'St', [116, 734, 1351], all4(2618), 'projekt', 'mengen', `${S}, S. 421, KG 344; Projektansatz je Türelement; Türkataster offen`),
    p3(344, 'Brand-, Rauchschutz-, Fluchtweg- und Sondertüren innen', '=INNENTUER_BRAND', 'St', [116, 734, 1351], all4(6545), 'projekt', 'konzept', `${S}, S. 421, KG 344; erhöhter Projektansatz; Brandschutzkonzept offen`),
    p3(345, 'Wandfliesen und Abdichtungen in Duschen/WCs/Nassräumen', '=FLIESEN_WAND_A', 'm²', [47, 112, 364], all4(47), 'bki-von', 'mengen', `${S}, S. 421, KG 345; Abdichtungen im EP berücksichtigt`),
    p3(345, 'Putz, Spachtel, Anstrich und sonstige Wandoberflächen nach Entkernung', '=INNENWAND_A', 'm²', [47, 112, 364], all4(47), 'bki-von', 'mengen', `${S}, S. 421, KG 345; schadstoffhaltiger Rückbau separat KG 390`),
    p3(345, 'Neue ballwurfsichere Prallwände für Handball', '=PRALLWAND_A', 'm²', [47, 112, 364], all4(47), 'bki-von', 'markt', 'Projekt-/Herstelleransatz; DIN-Schnittstelle Sporthalle'),
    p3(345, 'Akustische/ballwurfsichere Hallenwandbekleidungen oberhalb Prallwand', '=AKUSTIKWAND_A', 'm²', [47, 112, 364], all4(47), 'bki-von', 'mengen', 'Projektansatz'),
    p3(346, 'Sanitärtrennwände und systemgebundene Einbauten', '1', 'psch', [221, 358, 533], all4(23800), 'projekt', 'mengen', `${S}, S. 421, KG 346; pauschaler Projektansatz`),
    p3(342, 'Ausbau-/Oberflächenanpassungen für drei Lehrerkabinen', '=LEHRER_COUNT', 'St', [], all4(9520), 'projekt', 'konzept', 'Nutzeranforderung; genaue Ausstattung offen'),
    p3(349, 'Untergeordnete neue Öffnungen, Schließungen, Technikraum-Anpassungen und Kleinleistungen', '1', 'psch', [], all4(17850), 'projekt', 'mengen', 'Projektansatz; ergänzt um ELT/HLS-Technikraumkoordination Stand 19.08.2026'),

    p3(353, 'Neuer Sportboden einschließlich Unterkonstruktion und Linien', '=SPORTFL', 'm²', [193, 228, 288], all4(193), 'bki-von', 'markt', `${S}, S. 421, KG 353; erhöhter Sportbodenansatz`),
    p3(353, 'Neue Bodenaufbauten und Bodenbeläge in Nebenräumen', '=NEBENFL', 'm²', [193, 228, 288], all4(193), 'bki-von', 'mengen', `${S}, S. 421, KG 353; Bodenplatte separat KG 320`),
    p3(354, 'Neue ballwurfsichere Akustikdecke Sporthalle', '=SPORTFL', 'm²', [40, 86, 120], all4(40), 'bki-von', 'markt', `${S}, S. 421, KG 354; ballwurfsichere Systemdecke`),
    p3(354, 'Neue abgehängte Decken in Nebenräumen', '=NEBENFL', 'm²', [40, 86, 120], all4(40), 'bki-von', 'mengen', `${S}, S. 421, KG 354`),
    p3(359, 'Lokale Reparaturen, Öffnungen/Schließungen und Kleinleistungen', '1', 'psch', [], all4(23800), 'projekt', 'mengen', 'Projektansatz'),

    p3(369, 'Lokale Dachrand-/Fassadenanschlüsse; Dachabdichtung und alte Dachlagen grundsätzlich Bestand', '1', 'psch', [], all4(35700), 'projekt', 'mengen', 'Abgrenzung Nutzer: keine Dachsanierung; keine neuen Dachdurchführungen'),
    p3(369, 'Variante 1: Nebenbaudach einkürzen, Holzfassade hochziehen (Quaderwirkung), neue/angepasste Dachränder', '1', 'psch', [],
       { V1: '=V1_DACH_ZUSATZ_BRUTTO', V2A: '0', V2B: '0', V3: '0' },
       'projekt', 'konzept', 'Nutzerangabe 20.08.2026; nur Variante 1. Sichtbare Variantendifferenz statt verstecktem Zuschlag.'),

    p3(382, 'Neue teleskopierbare/fahrbare Tribüne für ca. 400 Zuschauer inkl. Sitze, Antriebe, Geländer und Abnahmen', '=TRIBUENE_PLAETZE', 'Platz', [], all4(1666), 'projekt', 'markt', 'Projekt-/Marktansatz; BKI-Vergleichsobjekt 5100-0122 mit 392 Plätzen'),
    p3(382, 'Zwei neue Trennvorhangsysteme inkl. Antrieb/Steuerung und Anschlüsse', '=TRENNVORH_COUNT', 'St', [], all4(95200), 'projekt', 'markt', 'Projekt-/Herstelleransatz'),
    p3(382, 'Vier neue ballwurfsichere Geräteraumtore', '=GERAETETOR_COUNT', 'St', [], all4(15470), 'projekt', 'markt', 'Projekt-/Herstelleransatz'),
    p3(382, 'Fest eingebaute Sportgeräte und Halleneinbauten', '1', 'psch', [], all4(142800), 'projekt', 'konzept', 'Nur fest mit dem Bauwerk verbundene Ausstattung; lose Geräte KG 600'),
    p3(382, 'Ballfangnetze, Schutznetze und ergänzende Schutzkonstruktionen', '1', 'psch', [], all4(41650), 'projekt', 'mengen', 'Projektansatz'),
    p3(381, 'Fest eingebaute Kiosktheke / Ausgabe; Geräte und lose Ausstattung nicht enthalten', '1', 'psch', [], all4(23800), 'projekt', 'konzept', 'Projektansatz; TGA-/KG-600-Anteile separat'),
    p3(381, 'Festes Klappgarderoben-/Aufhängesystem für ca. 400 Personen', '1', 'psch', [], all4(23800), 'projekt', 'markt', 'Nutzeranforderung; genaue Systemwahl offen'),
    p3(386, 'Bauliches Leit-, Beschilderungs- und Fluchtwegesystem', '1', 'psch', [], all4(11900), 'projekt', 'konzept', 'Projektansatz; ELT-Anteile KG 400; Brandschutzkonzept offen'),
    p3(387, 'Geländer, Abschrankungen und barrierefreie Tribünenschnittstellen', '1', 'psch', [], all4(35700), 'projekt', 'konzept', 'Projektansatz'),

    p3(391, 'Baustelleneinrichtung für die Baukonstruktionen', '1', 'psch', [6, 24, 38], all4(95200), 'projekt', 'mengen', `${S}, S. 422, KG 391; tiefe Bestandssanierung`),
    p3(392, 'Fassaden-, Innen- und Arbeitsgerüste / Zugänge', '1', 'psch', [17, 31, 49], all4(95200), 'projekt', 'mengen', `${S}, S. 422, KG 392; genaue Gerüstflächen offen`),
    p3(393, 'Schutz, Abschottungen, Staub-/Schadstoffbereiche und temporäre Zugänge', '1', 'psch', [], all4(59500), 'projekt', 'schadstoff', 'Projektansatz'),
    p3(394, 'Reguläre Entkernung der Ausbaukonstruktionen bis weitgehend Rohbau; TGA-Rückbau nicht in KG 300', '=BGF_GES', 'm² BGF', [], all4(59.5), 'projekt', 'mengen', 'Projektansatz; TGA-Rückbau der KG 490 zuordnen'),
    p3(394, 'Asbestsanierung PVC-Hallenboden einschließlich Schutzmaßnahmen; Entsorgung separat', '=SPORTFL', 'm²', [], all4(53.55), 'projekt', 'schadstoff', 'Schadstoffbericht: PVC 1–5 % Chrysotilasbest; Kleber asbestfrei'),
    p3(394, 'Asbestsanierung Spachtelmassen, Strukturputz und Fliesenkleber – Arbeitsmenge', '=ASBEST_WAND_A', 'm²', [], all4(59.5), 'projekt', 'schadstoff', 'Orientierende Untersuchung; VDI-Detailerkundung/Massenaufnahme offen'),
    p3(394, 'Rückbau alter KMF in Decken, Wänden und Dämmungen – Äquivalentmenge', '=KMF_A', 'm²', [], all4(29.75), 'projekt', 'schadstoff', 'Orientierende Untersuchung; Mengen offen'),
    p3(396, 'Gefährliche/getrennte Entsorgung, RC-3-Estrich, Altholz, belastete Baustoffe', '1', 'psch', [1, 7, 19], all4(119000), 'projekt', 'schadstoff', `${S}, S. 422, KG 396; projektbezogener Mehransatz`),
    p3(397, 'Detailproben, Freimessungen, Feinreinigung und Dokumentation', '1', 'psch', [4, 12, 25], all4(53550), 'projekt', 'schadstoff', `${S}, S. 422, KG 397; Schadstoffbericht`),
    p3(395, 'Lokale Wiederherstellung nach Rückbau und Öffnungen', '1', 'psch', [], all4(29750), 'projekt', 'mengen', 'Projektansatz'),
    p3(398, 'Temporäre Sicherungen, Abdeckungen und Schutzkonstruktionen', '1', 'psch', [], all4(29750), 'projekt', 'mengen', 'Projektansatz'),
    p3(399, 'Arbeitsansatz für verdeckte Funde/Kleinleistungen; keine separate Risikoreserve', '1', 'psch', [5, 10, 18], all4(23800), 'projekt', 'schadstoff', `${S}, S. 422, KG 399; geringe Basisvorsorge`),

    // ── KG 200 · 2. Ebene ───────────────────────────────────────────────────
    ...[210, 220, 230, 240, 250].map(kg => p2(kg, '=GF_BKI_SCOPE', 'm² GF', ['', 2, 5], all4(0), 'projekt', 'mengen',
      `${S}, S. 419: KG 200 nur auf 1. Ebene (Unterwert „< 1“); keine 2.-Ebene-Kennwerte ausgewiesen. Startwert 0 ist eine technische Initialisierung, nicht „es fallen keine Kosten an“.`)),

    // ── KG 400 · 2. Ebene ───────────────────────────────────────────────────
    p2(410, '=BGF_GES', 'm² BGF', [24, 68, 125], { V1: '=24+V1_ENTW_ZUSATZ_BRUTTO/BGF_GES', V2A: '24', V2B: '24', V3: '24' }, 'bki-von', 'mengen',
       `${S}, S. 419. V1 zusätzlich Nutzerangabe 20.08.2026: Dachentwässerung Nebenbau neu, als äquivalenter €/m²-Zuschlag.`),
    p2(420, '=BGF_GES', 'm² BGF', [50, 146, 304], all4(50), 'bki-von', 'konzept', `${S}, S. 419; Wärmeerzeugung/Energiequelle noch nicht festgelegt`),
    p2(430, '=BGF_GES', 'm² BGF', [9, 54, 90],    all4(9),  'bki-von', 'konzept', `${S}, S. 419; RLT-Konzept und Geräteanzahl offen`),
    p2(440, '=BGF_GES', 'm² BGF', [43, 103, 180], all4(43), 'bki-von', 'mengen',  `${S}, S. 419; Elektroinstallation komplett neu, keine PV, keine Ladesäulen`),
    p2(450, '=BGF_GES', 'm² BGF', [12, 34, 75],   all4(12), 'bki-von', 'konzept', `${S}, S. 419; BMA/Zutritt/SAA teilweise offen`),
    p2(460, '=BGF_GES', 'm² BGF', ['', 12, ''],   all4(0),  'bki-von', 'bki',     `${S}, S. 419; keine Förderanlagen vorgesehen`),
    p2(470, '=BGF_GES', 'm² BGF', ['', '', 1],    all4(0),  'bki-von', 'bki',     `${S}, S. 419`),
    p2(480, '=BGF_GES', 'm² BGF', [17, 63, 104],  all4(17), 'bki-von', 'mengen',  `${S}, S. 419; MSR/GA neu, KNX vorgesehen`),
    p2(490, '=BGF_GES', 'm² BGF', [2, 5, 15],     all4(2),  'bki-von', 'mengen',  `${S}, S. 419; TGA-Rückbau hier zuzuordnen`),

    // ── KG 500 · 2. Ebene ───────────────────────────────────────────────────
    ...[[510, 5.2], [520, 2.6], [530, 13], [540, 2.6], [550, 0], [560, 0], [570, 2.6], [580, 0], [590, 0]].map(([kg, v]) =>
      p2(kg, '=AF_SCOPE', 'm² AF', [], all4(v), 'projekt', 'mengen',
        `${S}, S. 419: KG 500 nur als Gesamtkennwert (26/105/284 €/m² AF). Verteilung des Gesamt-Unterwerts auf die 2. Ebene = Projektannahme.`)),

    // ── KG 600 · 2. Ebene ───────────────────────────────────────────────────
    ...[[610, 0.8], [620, 3.2], [630, 0], [640, 0], [690, 0]].map(([kg, v]) =>
      p2(kg, '=BGF_GES', 'm² BGF', [], all4(v), 'projekt', 'mengen',
        `${S}, S. 419: KG 600 nur als Gesamtkennwert (4/19/51 €/m² BGF). Verteilung auf die 2. Ebene = Projektannahme. Abgrenzung KG 380 (fest eingebaut) vs. KG 600 (lose) fortschreiben.`)),

    // ── KG 700 · Projektansatz in Prozent von KG 200–600 netto ──────────────
    ...[[710, 0.01], [720, 0.015], [730, 0.07], [740, 0.06], [750, 0], [760, 0.045], [790, 0]].map(([kg, v]) =>
      pPct(kg, all4(v),
        `${S}, S. 419: KG 700 = „–“, kein Kennwert ausgewiesen. Erstbefüllung insgesamt 20 % von KG 200–600 netto; Verteilung auf die 2. Ebene = Projektannahme.`)),
  ]

  est.assumptions = [
    { ...emptyAssumption(), topic: 'Bezugsflächen',  text: 'Im Projektverlauf wurden unterschiedliche BGF-/BRI-Werte genannt. Das Modell arbeitet mit 2.418 m² BGF als Steuerwert; abweichende Stände wurden nicht stillschweigend verrechnet.', impact: 'Alle BKI-bezogenen Mengen', risk: 'hoch' },
    { ...emptyAssumption(), topic: 'Erstbefüllung',  text: 'Alle wählbaren Kennwerte starten beim unteren BKI-Wert, sofern Leistung und Einheit passen. Das ist eine Erstbefüllungsregel, keine Prognose.', impact: 'Gesamtes Modell', risk: 'hoch' },
    { ...emptyAssumption(), topic: 'Abbruch/Entkernung', text: 'Nicht alle nichttragenden Wände werden entfernt; Wandbekleidungen, Putz und Fliesen weitgehend bis auf den Rohbau. Bodenplatte Sporthalle bleibt, Bodenplatte Nebenräume/Kopfbau neu. TGA-Leitungen weitgehend vollständig demontiert.', impact: 'KG 320, KG 390, KG 490', risk: 'mittel' },
    { ...emptyAssumption(), topic: 'Dach',           text: 'Bestehendes Dach bleibt unangetastet (Schadstoffe in alten Dachlagen). RLT-Durchführungen seitlich durch die Fassade. Ausnahme Variante 1: Umbau Nebenbaudach und neue Dachentwässerung.', impact: 'KG 360, KG 410', risk: 'mittel' },
    { ...emptyAssumption(), topic: 'Schadstoffe',    text: 'Mengen sind Arbeitsmengen aus der orientierenden Untersuchung. Das Gutachten weist ausdrücklich auf weitere zu erwartende Funde hin. Vor einer Kostenberechnung müssen die Massen LV-fähig ermittelt werden.', impact: 'KG 390', risk: 'hoch' },
    { ...emptyAssumption(), topic: 'Fassadenpreise', text: 'BEMO Sonderfarbe/natur, Streckmetall und die horizontale Holzverschalung sind mit dem BKI-Unterwert vorbefüllt und marktpreislich nicht verifiziert. Sonderfarbe derzeit ohne Farbzuschlag.', impact: 'KG 335', risk: 'hoch' },
    { ...emptyAssumption(), topic: 'Sonderpositionen', text: 'Tribüne, Prallwände, Sportboden, Sportgeräte, Trennvorhänge und Spezialtore laufen über Projekt-/Marktansätze und sind durch Herstellerangebote zu ersetzen.', impact: 'KG 345, KG 353, KG 382', risk: 'hoch' },
    { ...emptyAssumption(), topic: 'Brandschutz',    text: 'Brandschutzkonzept in Erstellung. Brandschutztüren/-tore sind angesetzt; mögliche Bekleidungen, RWA und weitere Anforderungen sind offen.', impact: 'KG 334, KG 344, KG 380, KG 450', risk: 'hoch' },
    { ...emptyAssumption(), topic: 'KG 700',         text: 'Baunebenkosten als Projektansatz von insgesamt 20 % der Nettokosten KG 200–600, verteilt auf die 2. Ebene. BKI weist für diese Objektgruppe keinen Kennwert aus.', impact: 'KG 700', risk: 'mittel' },
    { ...emptyAssumption(), topic: 'Risikoreserve',  text: 'Das Modell enthält einzelne Vorsorge-/Sonstige-Positionen, aber KEINE pauschale Projektrisikoreserve. Ein vom Bauherrn geforderter Risikozuschlag ist transparent separat auszuweisen.', impact: 'Gesamtprojekt', risk: 'hoch' },
    { ...emptyAssumption(), topic: 'Varianten',      text: 'V2A und V2B nutzen denselben Grundriss 2 und unterscheiden sich nur in der Fassadenausführung. Fassaden sind untereinander austauschbar; die Zuordnung dient dem exemplarischen Vergleich. Grundrissbedingte Mengendifferenzen sind noch nicht getrennt von fassadenbedingten Kennwertdifferenzen.', impact: 'Alle Varianten', risk: 'mittel' },
    { ...emptyAssumption(), topic: 'BKI-Spannen',    text: 'Untere/mittlere/obere Kennwerte stammen aus unterschiedlichen Vergleichsobjekten. Die Summe der Unterwerte der 2./3. Ebene muss den Unterwert der übergeordneten Kostengruppe nicht treffen. BKI dient der Plausibilisierung, nicht als Verteilungsrechnung.', impact: 'Methodik', risk: 'niedrig' },
    { ...emptyAssumption(), topic: 'Elektro',        text: 'Keine PV-Anlage und keine E-Ladesäulen (Bauherrenentscheidung). KNX vorgesehen, ballwurfsichere Ausführung im Hallenbereich, flächendeckendes WLAN.', impact: 'KG 440, KG 450', risk: 'niedrig' },
    { ...emptyAssumption(), topic: 'Außenanlagen',   text: 'Nur direkter Perimeter um die Halle im Umfang der Fassaden-/Dämmarbeiten, lokale Belagswiederherstellung. Keine Freianlagenneugestaltung, keine allgemeine neue Außenentwässerung.', impact: 'KG 500', risk: 'niedrig' },
  ]

  est.planners = [
    { ...emptyPlannerState(), discipline: 'Elektro',    stand: '19.08.2026', file: 'Aktueller Planungsstand Elektroverteilerräume.pdf', findings: 'Separate Räume für Sicherheitstechnik (BMZ, Sicherheitsbeleuchtung, SAA); getrennte Daten- und Elektroverteilung; HLS benötigt bisherigen Verteilerraum und Geräteraum 1; zusätzliche Flächen im Konditionsraum; Außengeräteraum in Stark-/Schwachstrom geteilt.', impact: 'Zusätzliche Trennwände, Türen und Ausbauanpassungen – vor allem KG 340.' },
    { ...emptyPlannerState(), discipline: 'HLS / RLT',  stand: 'Planstand hochgeladen', file: '_01 AM-TGA_neue Modellzeichnung_Layout1.pdf', findings: 'Luftwechsel: Nasszellen/Umkleiden/Konditionsraum ca. 8-fach/h, Aufenthaltsräume ca. 5-fach/h, Flure/Nebenräume/Technik ca. 3-fach/h. Konkrete Platzbedarfe für HLS-Bauteile dargestellt.', impact: 'Raumaufteilung und Schnittstellen zu KG 300; Basis 4 Außen-RLT-Geräte.' },
    { ...emptyPlannerState(), discipline: 'Schadstoffe',stand: '23.07.2026', file: '260723-131.4-Bericht_SchadstoffU.pdf (Sakosta GmbH)', findings: 'Asbest in Spachtelmassen, Strukturputz Foyer, Fliesenklebern, Dachpappe/Dampfsperre Umkleidetrakt, PVC-Hallenboden (1–5 % Chrysotil), Fensterkitt, alten Flanschdichtungen. Zahlreiche KMF-Produkte vorsorglich als „alte KMF“. Estrich nach EBV als RC-3. Weitere Detailerkundung empfohlen.', impact: 'KG 390: Schutzmaßnahmen, Sanierung, Entsorgung, Freimessungen.' },
    { ...emptyPlannerState(), discipline: 'Brandschutz',stand: 'in Erstellung', file: '–', findings: 'Brandschutzkonzept in Bearbeitung. Brandschutztüren/-tore neu; mögliche Bekleidungen, RWA und weitere Anforderungen offen; Fluchtwege teilweise baulich angepasst.', impact: 'KG 334, KG 344, KG 380, KG 450 – Ansätze vorläufig.' },
  ]

  est.sources = [
    { ...emptySource(), file: '023_Modernisierung_Sporthallen.pdf (aus ZIP)', stand: 'BKI 2026 / Q2 2026', usage: 'BKI-Kennwerte KG 300 sowie 3. Ebene (S. 418–422)', note: 'BKI von/Mittel/bis brutto; Regionalisierung separat', type: 'BKI' },
    { ...emptySource(), file: 'Regionalfaktoren.pdf (aus ZIP)', stand: '2026', usage: 'Regionalfaktor Landkreis Bad Dürkheim / Grünstadt', note: 'Faktor 0,983', type: 'BKI' },
    { ...emptySource(), file: '023_Modernisierung_Sporthallen.pdf, S. 419', stand: 'Q2/2026', usage: 'KG 200/400/500/600 – Unter-/Mittel-/Oberwerte', note: 'KG 200 <1/2/5, KG 400 122/399/651, KG 500 26/105/284, KG 600 4/19/51; KG 700 nicht ausgewiesen', type: 'BKI' },
    { ...emptySource(), file: 'Sanierung Sporthalle Grünstadt – Leistungsbeschreibung.pdf', stand: 'Projektstart', usage: 'Ausgangsbudget und Sanierungsumfang', note: 'KG 300 Ausgangsansatz 2,10 Mio. € netto', type: 'Projekt' },
    { ...emptySource(), file: '1.4-Bestand GR EG.pdf / 1.5-Bestand Boden EG.pdf', stand: '31.07.2026', usage: 'Raumflächen, Bodenaufbauten, Bestandsnutzung', note: 'Mengen im Arbeitsstand', type: 'Plan' },
    { ...emptySource(), file: '1.7-Ansichten Nord _ Süd.pdf / 1.6-Schnitte.pdf', stand: '31.07.2026', usage: 'Fassaden-/Geometrieplausibilisierung', note: 'Aufmaß noch erforderlich', type: 'Plan' },
    { ...emptySource(), file: '260723-131.4-Bericht_SchadstoffU.pdf', stand: '23.07.2026', usage: 'Schadstoffannahmen und Rückbaurisiko', note: 'orientierende Untersuchung; weitere Erkundung erforderlich', type: 'Gutachten' },
    { ...emptySource(), file: 'Aktueller Planungsstand Elektroverteilerräume.pdf', stand: '19.08.2026', usage: 'zusätzliche Technikräume / Trennwände / Türen', note: 'Planungsstand kann sich ändern', type: 'Fachplaner' },
    { ...emptySource(), file: '_01 AM-TGA_neue Modellzeichnung_Layout1.pdf', stand: 'Planstand hochgeladen', usage: 'HLS-Platzbedarf und RLT-Konzept', note: 'Konzept noch in Bearbeitung', type: 'Fachplaner' },
    { ...emptySource(), file: 'DIN SPORTHALLEN 3711394.pdf (E DIN 18032-1:2026-08)', stand: 'Entwurf August 2026', usage: 'Planungsanforderungen Sporthalle', note: 'Norm-Entwurf; Anwendung ist besonders zu vereinbaren', type: 'Norm' },
    { ...emptySource(), file: 'VStaettVO Rheinland-Pfalz', stand: '01.09.2018', usage: 'Zuschauer-/Versammlungsstätten-Schnittstellen', note: '400 Besucher / Tribünenbetrieb relevant', type: 'Recht' },
    { ...emptySource(), file: '260817-131.4_Schallmaier_Fragenkatalog_mK_ert-Kru.xlsx', stand: '17.08.2026', usage: 'Elektro-Bauherrenentscheidungen', note: 'keine PV, keine Ladesäulen, KNX, WLAN, Kiosk-Anschlüsse', type: 'Fachplaner' },
    { ...emptySource(), file: 'Nutzerangabe Fassadenvarianten', stand: '20.08.2026', usage: 'Varianten V1, V2A, V2B, V3', note: 'V1 Blech/Holz + Dachkürzung/Entwässerung; V2A BEMO Sonderfarbe; V2B BEMO natur; V3 Streckmetall', type: 'Projekt' },
  ]

  return est
}

// ── Registrierung ────────────────────────────────────────────────────────────

export const TEMPLATES = [
  {
    id: 'leer',
    name: 'Leere DIN-276-Struktur',
    description: 'KG 200–700 auf der 2. Ebene, eine Variante, keine Werte. Für ein neues Projekt mit eigener Datenbasis.',
    build: buildLeer,
  },
  {
    id: 'sporthalle',
    name: 'Sporthalle – Modernisierung (BKI Q2/2026)',
    description: 'Vollständig vorbelegtes Vorplanungsmodell: 51 KG-300-Positionen auf der 3. Ebene, KG 200–700 auf der 2. Ebene, '
               + '37 Parameter, vier Varianten, Annahmen, Planerstände und Quellenregister. Werte sind Startwerte eines konkreten '
               + 'Projekts und müssen ersetzt werden.',
    build: buildSporthalle,
  },
]

export const buildFromTemplate = (templateId, projectId, projectName) => {
  const tpl = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0]
  const est = tpl.build(projectId, projectName)
  est.id = uid()
  est.templateId = tpl.id
  return est
}
