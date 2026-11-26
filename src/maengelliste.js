// ── Mängelliste als Dokument ─────────────────────────────────────────────────
//
// Das Erzeugnis, das einem Abnahmeprotokoll als Anlage beiliegt. Gebaut als
// Druck-HTML (wie das Protokoll und die Notiz), nicht mit pdf-lib gezeichnet:
// so lassen sich Fotos und Planausschnitte ohne Verrenkungen einbetten, und
// der Browser macht daraus ein PDF.
//
// Zwei Gliederungen, weil es zwei Anlässe gibt:
//   nach Firma – für die Abnahme je Gewerk (wer muss was noch beseitigen)
//   nach Plan  – für die Begehung (was ist in diesem Geschoss offen)
//
// Am Ende steht je Plan eine **Planübersicht**: der ganze Plan mit allen Pins,
// jeder mit der Nummer des Mangels. Ein Ausschnitt je Mangel wäre schöner,
// bräuchte aber Zuschnitt im Bild – die Übersicht leistet für die Begehung
// mehr, weil man alles auf einem Blatt sieht.
//
// Der Stand zur Abnahme wird aus dem Zustand abgeleitet, nicht geraten:
//   abgenommen            → abgenommen
//   behoben               → behoben, Abnahme offen
//   offen / in Arbeit     → vorbehalten
// Die Bewertung, was davon ein wesentlicher Mangel ist und was ein Vorbehalt
// bedeutet, steht nicht in diesem Programm.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const datumDe = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '')

export const ABNAHME_STAND = {
  abgenommen: { text: 'abgenommen',            klasse: 'ok'   },
  behoben:    { text: 'behoben, Abnahme offen', klasse: 'halb' },
  in_arbeit:  { text: 'vorbehalten',            klasse: 'rot'  },
  offen:      { text: 'vorbehalten',            klasse: 'rot'  },
}

const STATUS_TEXT = {
  offen: 'Offen', in_arbeit: 'In Arbeit', behoben: 'Behoben', abgenommen: 'Abgenommen',
}
const PRIO_TEXT = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }

/**
 * Druckfassung der Mängelliste.
 *
 * maengel   – Mängel des Projekts (bereits gefiltert, falls gewünscht)
 * optionen  – {
 *   projektName, abnahmeDatum, gliederung: 'firma'|'plan',
 *   fotos: bool, planUebersicht: bool,
 *   unterschriften: bool,
 *   logoDataUrl, clientLogoDataUrl,
 *   fotoUrls: Map<fotoId, dataUrl>,        // vorher geladen (async)
 *   plaene: [{ id, title, seiten }],
 *   planBildUrl: (planId, seite) => string,
 * }
 */
export function buildMaengellistePrintHtml(maengel, optionen = {}) {
  const {
    projektName = '', abnahmeDatum = '', gliederung = 'firma',
    fotos = true, planUebersicht = true, unterschriften = true,
    logoDataUrl = '', clientLogoDataUrl = '',
    fotoUrls = new Map(), plaene = [], planBildUrl = null,
  } = optionen

  const liste = [...maengel].sort((a, b) => (a.no ?? 0) - (b.no ?? 0))

  // ── Kopf ──────────────────────────────────────────────────────────────────
  const bild = (url) => url
    ? `<img src="${url}" style="height:40px;max-width:120px;object-fit:contain;display:block;">`
    : ''
  const logos = (logoDataUrl || clientLogoDataUrl)
    ? `<div style="display:flex;align-items:flex-end;gap:14px;">${bild(logoDataUrl)}${bild(clientLogoDataUrl)}</div>`
    : '<div style="height:40px"></div>'

  const zahl = (s) => liste.filter(m => m.status === s).length
  const metaRows = [
    ['Projekt', esc(projektName) || '–'],
    ['Stand', datumDe(new Date().toISOString())],
  ]
  if (abnahmeDatum) metaRows.push(['Abnahme', datumDe(abnahmeDatum)])
  metaRows.push(['Mängel', `${liste.length} · offen ${zahl('offen') + zahl('in_arbeit')} · behoben ${zahl('behoben')} · abgenommen ${zahl('abgenommen')}`])

  const metaHtml = metaRows.map(([k, v]) => `
    <tr>
      <td style="padding:1mm 6mm 1mm 0;font-size:7pt;text-transform:uppercase;letter-spacing:.05em;color:#777;white-space:nowrap;vertical-align:top;width:30mm;">${k}</td>
      <td style="padding:1mm 0;font-size:9pt;color:#000;vertical-align:top;">${v}</td>
    </tr>`).join('')

  // ── Gruppen ───────────────────────────────────────────────────────────────
  const gruppen = new Map()
  for (const m of liste) {
    const schluessel = gliederung === 'plan'
      ? (m.planTitel || (m.planId ? 'Plan' : 'Ohne Plan'))
      : (m.responsible || 'Ohne Zuordnung')
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, [])
    gruppen.get(schluessel).push(m)
  }
  const gruppenSortiert = [...gruppen.entries()].sort((a, b) => {
    // „Ohne …" immer zuletzt – das ist die Restliste, nicht der Anfang.
    const ar = /^Ohne /.test(a[0]) ? 1 : 0
    const br = /^Ohne /.test(b[0]) ? 1 : 0
    return ar - br || a[0].localeCompare(b[0], 'de')
  })

  const mangelZeile = (m) => {
    const stand = ABNAHME_STAND[m.status] || ABNAHME_STAND.offen
    const bilder = fotos
      ? (m.photos || []).map(p => fotoUrls.get(p.id)).filter(Boolean)
        .map(u => `<img src="${u}" style="height:26mm;max-width:38mm;object-fit:cover;border:0.5pt solid #ddd;">`).join(' ')
      : ''
    const ortText = [m.location, m.planTitel ? `Plan: ${m.planTitel}${m.planSeite > 1 ? `, S. ${m.planSeite}` : ''}` : '']
      .filter(Boolean).map(esc).join(' · ')

    return `
      <tr>
        <td class="nr">${esc(String(m.no ?? ''))}</td>
        <td>
          <div class="titel">${esc(m.title)}</div>
          ${m.description ? `<div class="besch">${esc(m.description)}</div>` : ''}
          ${ortText ? `<div class="ort">${ortText}</div>` : ''}
          ${bilder ? `<div class="fotos">${bilder}</div>` : ''}
        </td>
        <td class="klein">${esc(m.responsible || '–')}</td>
        <td class="klein">${m.dueDate ? datumDe(m.dueDate) : '–'}</td>
        <td class="klein">${esc(STATUS_TEXT[m.status] || m.status || '')}${
          m.statusQuelle === 'massnahme' ? '<div class="quelle">aus Maßnahme</div>' : ''}</td>
        <td class="klein ${stand.klasse}">${stand.text}</td>
      </tr>`
  }

  const gruppenHtml = gruppenSortiert.map(([name, eintraege]) => `
    <div class="gruppe">
      <h2>${esc(name)} <span class="anzahl">${eintraege.length} ${eintraege.length === 1 ? 'Mangel' : 'Mängel'}</span></h2>
      <table class="liste">
        <thead>
          <tr>
            <th style="width:8mm;">Nr.</th>
            <th>Mangel</th>
            <th style="width:32mm;">Zuständig</th>
            <th style="width:18mm;">Frist</th>
            <th style="width:20mm;">Zustand</th>
            <th style="width:26mm;">Zur Abnahme</th>
          </tr>
        </thead>
        <tbody>${eintraege.map(mangelZeile).join('')}</tbody>
      </table>
    </div>`).join('')

  // ── Planübersichten ───────────────────────────────────────────────────────
  // Je Plan und Seite ein Blatt mit allen Pins, nummeriert wie in der Liste.
  let planHtml = ''
  if (planUebersicht && planBildUrl) {
    const seiten = new Map()   // "planId|seite" → { planId, seite, titel, pins }
    for (const m of liste) {
      if (!m.position || !m.planId) continue
      const s = m.planSeite || 1
      const k = `${m.planId}|${s}`
      if (!seiten.has(k)) {
        const plan = plaene.find(p => p.id === m.planId)
        seiten.set(k, { planId: m.planId, seite: s, titel: plan?.title || m.planTitel || 'Plan', pins: [] })
      }
      seiten.get(k).pins.push(m)
    }
    planHtml = [...seiten.values()]
      .sort((a, b) => a.titel.localeCompare(b.titel, 'de') || a.seite - b.seite)
      // Plan zwischenzeitlich gelöscht: lieber kein Blatt als ein leerer Rahmen
      .filter(s => !!planBildUrl(s.planId, s.seite))
      .map(s => `
        <div class="planblatt">
          <h2>${esc(s.titel)}${s.seite > 1 ? `, Seite ${s.seite}` : ''}
            <span class="anzahl">${s.pins.length} ${s.pins.length === 1 ? 'Mangel' : 'Mängel'}</span></h2>
          <div class="planbild">
            <img src="${planBildUrl(s.planId, s.seite)}" alt="${esc(s.titel)}">
            ${s.pins.map(m => `
              <span class="pin ${(ABNAHME_STAND[m.status] || ABNAHME_STAND.offen).klasse}"
                    style="left:${(m.position.x * 100).toFixed(2)}%;top:${(m.position.y * 100).toFixed(2)}%;"
              >${esc(String(m.no ?? ''))}</span>`).join('')}
          </div>
        </div>`).join('')
  }

  const unterschriftHtml = unterschriften ? `
    <div class="unterschriften">
      <h2>Kenntnis genommen</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          ${['Auftraggeber', 'Auftragnehmer', 'Objektüberwachung'].map(rolle => `
          <td style="width:33.3%;padding:14mm 4mm 0 0;vertical-align:bottom;">
            <div style="border-top:0.5pt solid #000;padding-top:1.5mm;font-size:8pt;color:#555;">
              ${rolle}<br>Ort, Datum, Unterschrift
            </div>
          </td>`).join('')}
        </tr>
      </table>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<title>Mängelliste – ${esc(projektName)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin: 0; background: #fff; line-height: 1.45; }
  h1 { font-size: 16pt; margin: 0 0 1mm; }
  h2 { font-size: 10pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 0.5pt solid #000; }
  h2 .anzahl { font-weight: normal; font-size: 8pt; color: #777; float: right; }
  .untertitel { font-size: 9pt; color: #555; margin: 0 0 4mm; }
  .hinweis { font-size: 7.5pt; color: #777; margin: 0 0 4mm; }
  table.liste { width: 100%; border-collapse: collapse; }
  table.liste th { text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: .04em;
                   color: #555; border-bottom: 0.5pt solid #000; padding: 1.5mm 2mm 1.5mm 0; }
  table.liste td { border-bottom: 0.4pt solid #e5e5e5; padding: 2mm 2mm 2mm 0; vertical-align: top; }
  table.liste tr { page-break-inside: avoid; }
  .nr { color: #777; font-size: 9pt; }
  .titel { font-weight: bold; }
  .besch { color: #333; margin-top: 0.5mm; }
  .ort { color: #777; font-size: 8pt; margin-top: 0.5mm; }
  .quelle { color: #999; font-size: 7pt; }
  .fotos { margin-top: 1.5mm; display: flex; gap: 2mm; flex-wrap: wrap; }
  .klein { font-size: 8.5pt; }
  .ok   { color: #15803d; }
  .halb { color: #1d4ed8; }
  .rot  { color: #b91c1c; font-weight: bold; }
  .gruppe { page-break-inside: auto; }
  .planblatt { page-break-before: always; }
  .planbild { position: relative; display: inline-block; max-width: 100%; }
  .planbild img { max-width: 100%; display: block; border: 0.5pt solid #ccc; }
  .pin { position: absolute; transform: translate(-50%, -50%); min-width: 5.5mm; height: 5.5mm;
         padding: 0 1mm; border-radius: 3mm; background: #fff; border: 0.6pt solid currentColor;
         font-size: 7pt; font-weight: bold; line-height: 5.3mm; text-align: center; }
  .unterschriften { page-break-inside: avoid; margin-top: 8mm; }
  @media print { .planblatt { page-break-before: always; } }
</style></head>
<body>
<table style="width:100%;border-collapse:collapse;margin-bottom:5mm;">
  <tr>
    <td style="vertical-align:top;">
      <h1>Mängelliste</h1>
      <p class="untertitel">${abnahmeDatum ? `Anlage zur Abnahme vom ${datumDe(abnahmeDatum)}` : 'Stand der Mängelverfolgung'}</p>
    </td>
    <td style="text-align:right;vertical-align:top;">${logos}</td>
  </tr>
</table>

<table style="width:100%;border-collapse:collapse;margin-bottom:5mm;">${metaHtml}</table>

<p class="hinweis">
  Die Spalte „Zur Abnahme" ist aus dem Zustand abgeleitet: abgenommen = abgenommen,
  behoben = behoben und noch nicht abgenommen, offen und in Arbeit = vorbehalten.
  Die Bewertung der Mängel bleibt dem Abnahmeprotokoll vorbehalten.
</p>

${liste.length === 0 ? '<p>Für dieses Projekt sind keine Mängel erfasst.</p>' : gruppenHtml}
${unterschriftHtml}
${planHtml}
</body></html>`
}

/** Öffnet die Liste im Druckfenster des Browsers (PDF über „Als PDF speichern"). */
export function printMaengelliste(maengel, optionen) {
  const html = buildMaengellistePrintHtml(maengel, optionen)
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  // Bilder (Fotos, Planseiten) müssen geladen sein, sonst druckt der Browser
  // leere Rahmen.
  const los = () => { try { w.focus(); w.print() } catch {} }
  if (w.document.images.length === 0) setTimeout(los, 150)
  else w.addEventListener('load', () => setTimeout(los, 250))
  return true
}
