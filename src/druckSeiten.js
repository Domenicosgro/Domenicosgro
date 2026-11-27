// ── Seitenumbruch von Hand, damit „Seite 2 von 5" stimmt ─────────────────────
//
// Eine Fußzeile auf jeder Seite kann ein Browser: eine Tabelle mit <tfoot>
// (siehe `components/PrintSheet.jsx`) wiederholt sie zuverlässig. Eine
// *Seitenzahl* kann er nicht – die CSS-Zähler dafür (`@bottom-center`,
// `counter(pages)`) kennt weder Chrome noch Edge noch Firefox, und eine
// wiederholte Fußzeile steht auf jeder Seite gleich da.
//
// Deshalb bricht dieses Modul selbst um: Inhalt in Atome zerlegen, Höhen
// messen, zu Blättern bündeln, jedem Blatt seine eigene Fußzeile geben. Das ist
// mehr Aufwand als eine CSS-Regel, liefert aber eine Zahl, die stimmt – und bei
// einem Dokument, das unterschrieben und abgeheftet wird, ist das der Punkt.
//
// Erwartet wird ein Druck-HTML mit dieser Gliederung:
//
//   <div class="gruppe" data-quer="0" data-schmal="0">
//     <div class="atom">…</div>          ← bleibt am Stück
//     <div class="fliess">…</div>        ← Kinder werden einzeln zu Atomen
//     <table class="atom teilbar">…</table>  ← wird zeilenweise getrennt
//   </div>
//
// Jede Gruppe hat ihre eigene Ausrichtung (`data-quer`), weil im Format
// „gemischt" der Text hochkant und die Punktetabelle quer steht.

export const MM = 96 / 25.4            // CSS-Pixel je Millimeter bei 96 dpi

const RAND   = { oben: 12, unten: 16, seite: 12 }   // mm, wie im @page
const FUSS   = 14                                    // mm, Fußzeile samt Abstand
const PUFFER = 3                                     // mm Reserve gegen Rundung

export const blattHoehe   = (quer) => (quer ? 210 : 297) - RAND.oben - RAND.unten
export const blattBreite  = (quer) => (quer ? 297 : 210) - RAND.seite * 2
const nutzHoehe           = (quer) => blattHoehe(quer) - FUSS - PUFFER

// ── Messen ───────────────────────────────────────────────────────────────────
function hoeheVon(el, win) {
  const s = win.getComputedStyle(el)
  return el.getBoundingClientRect().height
    + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0)
}

// Zerlegt eine Gruppe in Stücke. Eine Tabelle mit `teilbar` wird zeilenweise
// zerlegt – eine lange Punkteliste soll nicht als Klotz auf die nächste Seite
// rutschen, sondern dort weiterlaufen, mit wiederholtem Tabellenkopf.
function stueckeVon(gruppe, win) {
  const stuecke = []
  for (const el of [...gruppe.children]) {
    if (el.classList.contains('fliess')) {
      for (const kind of [...el.children]) {
        stuecke.push({ art: 'block', el: kind, hoehe: hoeheVon(kind, win) })
      }
      continue
    }
    if (el.tagName === 'TABLE' && el.classList.contains('teilbar')) {
      const kopf = el.querySelector('thead')
      const koerper = el.tBodies[0]
      if (kopf && koerper) {
        const kopfHoehe = hoeheVon(kopf, win)
        for (const tr of [...koerper.rows]) {
          stuecke.push({ art: 'zeile', el: tr, hoehe: hoeheVon(tr, win), tabelle: el, kopf, kopfHoehe })
        }
        continue
      }
    }
    stuecke.push({ art: 'block', el, hoehe: hoeheVon(el, win) })
  }
  return stuecke
}

// ── Bündeln ──────────────────────────────────────────────────────────────────
// Reine Rechnung auf den gemessenen Höhen: welche Stücke stehen auf welchem
// Blatt? Ein Stück, das allein höher ist als eine Seite (ein großes Bild, ein
// sehr langer Absatz), bekommt sein eigenes Blatt und läuft notfalls über –
// abschneiden wäre schlimmer als überlaufen.
function buendeln(stuecke, hoehePx) {
  const blaetter = []
  let aktuell = { stuecke: [], hoehe: 0 }
  let tabelleLaeuft = null

  const umbrechen = () => {
    if (aktuell.stuecke.length) blaetter.push(aktuell)
    aktuell = { stuecke: [], hoehe: 0 }
    tabelleLaeuft = null
  }

  for (const s of stuecke) {
    if (s.art === 'block') {
      tabelleLaeuft = null
      if (aktuell.hoehe > 0 && aktuell.hoehe + s.hoehe > hoehePx) umbrechen()
      aktuell.stuecke.push(s)
      aktuell.hoehe += s.hoehe
      continue
    }
    // Tabellenzeile: der Kopf zählt mit, sobald die Tabelle auf einem Blatt neu anfängt
    let zusatz = tabelleLaeuft === s.tabelle ? 0 : s.kopfHoehe
    if (aktuell.hoehe > 0 && aktuell.hoehe + zusatz + s.hoehe > hoehePx) {
      umbrechen()
      zusatz = s.kopfHoehe
    }
    if (tabelleLaeuft !== s.tabelle) {
      aktuell.stuecke.push({ art: 'tabellenstart', tabelle: s.tabelle, kopf: s.kopf })
      aktuell.hoehe += zusatz
      tabelleLaeuft = s.tabelle
    }
    aktuell.stuecke.push(s)
    aktuell.hoehe += s.hoehe
  }
  if (aktuell.stuecke.length) blaetter.push(aktuell)
  return blaetter
}

// ── Fußzeile ─────────────────────────────────────────────────────────────────
export function fussCss() {
  return `
  .blatt { position: relative; height: ${blattHoehe(false)}mm; page-break-after: always; break-after: page; }
  .blatt.quer { page: quer; height: ${blattHoehe(true)}mm; }
  .blatt:last-child { page-break-after: auto; break-after: auto; }
  /* Schmale Textspalte im Querformat. Die Regel muss auch beim Messen gelten
     (noch in der Gruppe), sonst wird in voller Breite gemessen und in halber
     gesetzt – und der Text läuft in die Fußzeile. */
  .gruppe.schmal > *,
  .blatt.schmal > *:not(.fuss) { max-width: 190mm; }
  .fuss { position: absolute; left: 0; right: 0; bottom: 0;
          display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm;
          border-top: 0.5pt solid #ccc; padding-top: 2mm;
          font-size: 7pt; color: #555; line-height: 1.3; }
  .fuss-logos { display: flex; align-items: flex-end; gap: 4mm; flex-shrink: 0; }
  .fuss-logos img { height: 8mm; max-width: 28mm; object-fit: contain; display: block; }
  .fuss-text { flex: 1; min-width: 0; }
  .fuss-nr { white-space: nowrap; flex-shrink: 0; }`
}

function fussEl(doc, fuss, nr, von) {
  const el = doc.createElement('div')
  el.className = 'fuss'
  el.innerHTML = `<div class="fuss-logos">${fuss.logos || ''}</div>
    <div class="fuss-text">${fuss.text || ''}</div>
    <div class="fuss-nr">Seite ${nr} von ${von}</div>`
  return el
}

// ── Aufteilen ────────────────────────────────────────────────────────────────
// `breiteFuer(quer)` stellt die Messbreite des Dokuments ein (beim Druck aus
// einem Iframe dessen Breite). Gemessen werden muss in der Breite, in der auch
// gedruckt wird – sonst bricht der Text anders um als gerechnet.
//
// Gibt die Zahl der Blätter zurück; 0 heißt: nichts aufgeteilt.
export function seitenAufteilen(doc, { breiteFuer, fuss }) {
  const win = doc.defaultView
  const gruppen = [...doc.querySelectorAll('.gruppe')]
  if (!win || gruppen.length === 0) return 0

  // 1. Messen – Gruppe für Gruppe in ihrer eigenen Breite.
  const geplant = []
  for (const gruppe of gruppen) {
    const quer = gruppe.dataset.quer === '1'
    if (breiteFuer) breiteFuer(quer)
    const hoehePx = nutzHoehe(quer) * MM
    for (const blatt of buendeln(stueckeVon(gruppe, win), hoehePx)) {
      geplant.push({ ...blatt, quer, schmal: gruppe.dataset.schmal === '1' })
    }
  }
  if (geplant.length === 0) return 0

  // 2. Bauen – erst jetzt wird am DOM gerückt.
  const ziel = doc.createElement('div')
  geplant.forEach((plan, i) => {
    const blatt = doc.createElement('div')
    blatt.className = `blatt${plan.quer ? ' quer' : ''}${plan.schmal ? ' schmal' : ''}`
    let tabelle = null
    for (const s of plan.stuecke) {
      if (s.art === 'tabellenstart') {
        tabelle = s.tabelle.cloneNode(false)
        tabelle.appendChild(s.kopf.cloneNode(true))
        tabelle.appendChild(doc.createElement('tbody'))
        blatt.appendChild(tabelle)
      } else if (s.art === 'zeile') {
        tabelle?.tBodies[0].appendChild(s.el)
      } else {
        blatt.appendChild(s.el)
      }
    }
    blatt.appendChild(fussEl(doc, fuss, i + 1, geplant.length))
    ziel.appendChild(blatt)
  })

  doc.body.replaceChildren(...ziel.children)
  return geplant.length
}
