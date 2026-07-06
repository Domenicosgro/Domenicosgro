import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Farben (GHBA)
const NIGHT  = rgb(0, 0, 0.25)
const SKY    = rgb(0.56, 0.75, 1)
const GREY   = rgb(0.42, 0.45, 0.5)
const LIGHT  = rgb(0.97, 0.97, 0.97)
const YELLOW = rgb(1, 0.976, 0.8)
const BORDER = rgb(0.85, 0.87, 0.89)

const DAYS = [
  { key: 'mo', label: 'Montag' }, { key: 'di', label: 'Dienstag' }, { key: 'mi', label: 'Mittwoch' },
  { key: 'do', label: 'Donnerstag' }, { key: 'fr', label: 'Freitag' },
]
const fmtTage = (t) => String(t).replace('.', ',')

function truncate(font, text, size, maxWidth) {
  if (!text) return ''
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxWidth) t = t.slice(0, -1)
  return t + '…'
}

/**
 * Personalplan als PDF (A4 quer, eine Seite je Woche).
 * weeks: [{ week, monday, assignments: [{projectId, staffId, days:{mo:0.25…}}] }]
 * staff: aktive Mitarbeiter; projName: (id) => Anzeigename
 * Werte in Tagen (¼-Schritte); Urlaub/Krank gelb hinterlegt.
 */
export async function buildStaffPlanPdf({ weeks, staff, projName }) {
  const doc  = await PDFDocument.create()
  doc.setTitle('Personalplanung')
  const font     = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const W = 841.89, H = 595.28, M = 36
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  const fmt = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

  const nameW = 120
  const dayW  = (W - 2 * M - nameW) / 5
  const headH = 30

  for (const { week, monday, assignments } of weeks) {
    const page = doc.addPage([W, H])
    // Kopf
    page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: NIGHT })
    page.drawText('GHBA', { x: M, y: H - 26, size: 9, font: fontBold, color: SKY })
    page.drawText('Personalplanung', { x: M, y: H - 44, size: 16, font: fontBold, color: rgb(0.98, 1, 0.9) })
    const kw = week.split('-W')[1]
    page.drawText(`KW ${kw}  ·  ${fmt(monday)} – ${fmt(addDays(monday, 4))}  ·  Werte in Tagen  ·  Stand ${new Date().toLocaleDateString('de-DE')}`,
      { x: M, y: H - 58, size: 8.5, font, color: SKY })
    let y = H - 64 - 18

    // Tabellenkopf
    page.drawRectangle({ x: M, y: y - headH, width: W - 2 * M, height: headH, color: NIGHT })
    page.drawText('MITARBEITER', { x: M + 6, y: y - 19, size: 7.5, font: fontBold, color: SKY })
    DAYS.forEach((d, i) => {
      const x = M + nameW + i * dayW
      page.drawText(d.label.toUpperCase(), { x: x + 5, y: y - 13, size: 7.5, font: fontBold, color: SKY })
      page.drawText(fmt(addDays(monday, i)), { x: x + 5, y: y - 24, size: 7, font, color: SKY })
    })
    y -= headH

    staff.forEach((member, idx) => {
      // Zeilenhöhe: max. Zuweisungen je Tag (mind. 1, max. 3 Zeilen Text)
      const perDay = DAYS.map(d =>
        assignments.filter(a => a.staffId === member.id && a.days?.[d.key] > 0))
      const lines = Math.min(3, Math.max(1, ...perDay.map(l => l.length)))
      const rowH  = 12 + lines * 11

      if (y - rowH < M + 20) return   // Seitenlimit – Rest fällt auf dieser Woche weg (selten)

      if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: W - 2 * M, height: rowH, color: LIGHT })
      page.drawLine({ start: { x: M, y: y - rowH }, end: { x: W - M, y: y - rowH }, thickness: 0.5, color: BORDER })

      page.drawText(truncate(fontBold, member.name, 9, nameW - 10), { x: M + 6, y: y - 13, size: 9, font: fontBold, color: NIGHT })
      if (member.funktion) {
        page.drawText(truncate(font, member.funktion, 7, nameW - 10), { x: M + 6, y: y - 23, size: 7, font, color: GREY })
      }

      perDay.forEach((list, i) => {
        const x = M + nameW + i * dayW
        if (list.some(a => a.projectId === 'urlaub' || a.projectId === 'krank')) {
          page.drawRectangle({ x, y: y - rowH, width: dayW, height: rowH, color: YELLOW })
        }
        if (list.length === 0) {
          page.drawText('–', { x: x + 5, y: y - 14, size: 8, font, color: BORDER })
        } else {
          list.slice(0, 3).forEach((a, li) => {
            const label = `${projName(a.projectId) || '–'}  ${fmtTage(a.days[DAYS[i].key])}`
            page.drawText(truncate(font, label, 7.5, dayW - 10),
              { x: x + 5, y: y - 13 - li * 11, size: 7.5, font, color: rgb(0.1, 0.12, 0.16) })
          })
        }
      })
      y -= rowH
    })

    page.drawText('GHBA · Personalplanung – erstellt mit Komplizen Protokolle',
      { x: M, y: M - 14, size: 7, font, color: GREY })
  }

  return doc.saveAsBase64()
}
