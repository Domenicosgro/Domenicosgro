import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Farben (GHBA)
const NIGHT  = rgb(0, 0, 0.25)
const SKY    = rgb(0.56, 0.75, 1)
const GREY   = rgb(0.42, 0.45, 0.5)
const LIGHT  = rgb(0.97, 0.97, 0.97)
const YELLOW = rgb(1, 0.976, 0.8)
const BORDER = rgb(0.85, 0.87, 0.89)
const RED    = rgb(0.86, 0.15, 0.15)
const GREEN  = rgb(0.09, 0.64, 0.29)
const AMBER  = rgb(0.85, 0.47, 0.02)

const DAYS = [
  { key: 'mo', label: 'Montag' }, { key: 'di', label: 'Dienstag' }, { key: 'mi', label: 'Mittwoch' },
  { key: 'do', label: 'Donnerstag' }, { key: 'fr', label: 'Freitag' },
]
const SPECIAL_LABEL = { urlaub: 'Urlaub', krank: 'Krank', buero: 'Büro' }

function truncate(font, text, size, maxWidth) {
  if (!text) return ''
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxWidth) t = t.slice(0, -1)
  return t + '…'
}

/**
 * Wochenplan als PDF (A4 quer). Rückgabe: base64.
 * staff: aktive Mitarbeiter (name, funktion, dayHours)
 * rows:  [{ staffId, days: { mo: {p, h}, … } }]
 * projName: (id) => Anzeigename
 */
export async function buildStaffPlanPdf({ week, monday, staff, rows, projName }) {
  const doc  = await PDFDocument.create()
  doc.setTitle(`Personalplanung ${week}`)
  const font     = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const W = 841.89, H = 595.28, M = 36
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  const fmt = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

  // Spalten: Name | 5 Tage | Ist/Soll
  const nameW = 130, sumW = 60
  const dayW  = (W - 2 * M - nameW - sumW) / 5
  const headH = 30, rowH = 28

  let page, y
  const newPage = () => {
    page = doc.addPage([W, H])
    // Kopf
    page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: NIGHT })
    page.drawText('GHBA', { x: M, y: H - 26, size: 9, font: fontBold, color: SKY })
    page.drawText('Personalplanung', { x: M, y: H - 44, size: 16, font: fontBold, color: rgb(0.98, 1, 0.9) })
    const kw = week.split('-W')[1]
    page.drawText(`KW ${kw}  ·  ${fmt(monday)} – ${fmt(addDays(monday, 4))}  ·  Stand ${new Date().toLocaleDateString('de-DE')}`,
      { x: M, y: H - 58, size: 8.5, font, color: SKY })
    y = H - 64 - 18

    // Tabellenkopf
    page.drawRectangle({ x: M, y: y - headH, width: W - 2 * M, height: headH, color: NIGHT })
    page.drawText('MITARBEITER', { x: M + 6, y: y - 19, size: 7.5, font: fontBold, color: SKY })
    DAYS.forEach((d, i) => {
      const x = M + nameW + i * dayW
      page.drawText(d.label.toUpperCase(), { x: x + 5, y: y - 13, size: 7.5, font: fontBold, color: SKY })
      page.drawText(fmt(addDays(monday, i)), { x: x + 5, y: y - 24, size: 7, font, color: SKY })
    })
    page.drawText('IST/SOLL', { x: M + nameW + 5 * dayW + 5, y: y - 19, size: 7.5, font: fontBold, color: SKY })
    y -= headH
  }
  newPage()

  const rowFor = (staffId) => rows.find(r => r.staffId === staffId)

  staff.forEach((member, idx) => {
    if (y - rowH < M + 20) newPage()
    const row  = rowFor(member.id)
    const ist  = DAYS.reduce((s, d) => s + (row?.days?.[d.key]?.p ? (row.days[d.key].h || 0) : 0), 0)
    const soll = DAYS.reduce((s, d) => s + (member.dayHours?.[d.key] || 0), 0)

    // Zebra + Rahmen
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: W - 2 * M, height: rowH, color: LIGHT })
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: W - M, y: y - rowH }, thickness: 0.5, color: BORDER })

    // Name + Funktion
    page.drawText(truncate(fontBold, member.name, 9, nameW - 10), { x: M + 6, y: y - 12, size: 9, font: fontBold, color: NIGHT })
    if (member.funktion) {
      page.drawText(truncate(font, member.funktion, 7, nameW - 10), { x: M + 6, y: y - 22, size: 7, font, color: GREY })
    }

    // Tageszellen
    DAYS.forEach((d, i) => {
      const x = M + nameW + i * dayW
      const cell = row?.days?.[d.key]
      if (cell?.p) {
        const isSpecial = !!SPECIAL_LABEL[cell.p]
        if (cell.p === 'urlaub' || cell.p === 'krank') {
          page.drawRectangle({ x, y: y - rowH, width: dayW, height: rowH, color: YELLOW })
        }
        const label = SPECIAL_LABEL[cell.p] || projName(cell.p) || '–'
        page.drawText(truncate(font, label, 8, dayW - 10), { x: x + 5, y: y - 12, size: 8, font, color: rgb(0.1, 0.12, 0.16) })
        if (!isSpecial && cell.h) {
          page.drawText(`${cell.h} h`, { x: x + 5, y: y - 22, size: 7, font, color: GREY })
        }
      } else {
        page.drawText('–', { x: x + 5, y: y - 15, size: 8, font, color: BORDER })
      }
    })

    // Ist/Soll
    const balColor = ist > soll ? RED : (ist === soll && soll > 0) ? GREEN : AMBER
    page.drawText(`${ist} / ${soll}`, { x: M + nameW + 5 * dayW + 5, y: y - 15, size: 9, font: fontBold, color: balColor })

    y -= rowH
  })

  // Spaltenlinien über die ganze Tabelle (letzte Seite reicht optisch – je Seite gezeichnet wäre besser,
  // deshalb: einfache Fußzeile statt Vollraster)
  page.drawText('GHBA · Personalplanung – erstellt mit Komplizen Protokolle',
    { x: M, y: M - 14, size: 7, font, color: GREY })

  return doc.saveAsBase64()
}
