import {
  AlignmentType, BorderStyle, convertInchesToTwip,
  Document, Footer, ImageRun, Packer, PageNumber,
  Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { formatDate } from './utils'

const BLACK       = '000000'
const FONT        = 'Arial'
const NO_BORDER   = { style: BorderStyle.NONE,   size: 0, color: 'FFFFFF' }
const LINE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: BLACK }

function run(text, opts = {}) {
  return new TextRun({ text: String(text ?? ''), size: 20, color: BLACK, font: FONT, ...opts })
}

function para(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [run(runs)]
  return new Paragraph({ children, spacing: { before: 0, after: 0 }, ...opts })
}

function sp(after = 120) { return para('', { spacing: { before: 0, after } }) }

function tc(text, widthPct, opts = {}) {
  return new TableCell({
    width:    { size: widthPct, type: WidthType.PERCENTAGE },
    margins:  { top: 60, bottom: 60, left: 80, right: 80 },
    borders:  { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children:  [new TextRun({
        text: String(text ?? ''), color: BLACK, font: FONT,
        size: opts.size ?? 18,
        bold:   opts.bold   ?? false,
        italic: opts.italic ?? false,
      })],
    })],
  })
}

function tcH(text, widthPct) {
  return new TableCell({
    width:   { size: widthPct, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 80, left: 80, right: 80 },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: LINE_BORDER },
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children:  [new TextRun({ text: String(text ?? ''), bold: true, allCaps: true, color: BLACK, size: 16, font: FONT })],
    })],
  })
}

export async function exportParticipantsListDocx(project, logoDataUrl = null) {
  const today    = new Date().toISOString().slice(0, 10)
  const contacts = project.contacts ?? []

  // ── Logo ────────────────────────────────────────────────────────────────────
  let logoImage = null
  if (logoDataUrl) {
    try {
      const base64 = logoDataUrl.split(',')[1]
      const ext    = (logoDataUrl.match(/image\/(\w+)/) ?? [])[1] ?? 'png'
      const type   = ['png','jpg','jpeg','gif','bmp'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'png'
      await new Promise((res, rej) => {
        const img = new Image()
        img.onload = () => {
          const MAX = 120
          const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1)
          logoImage = new ImageRun({
            data: base64, type,
            transformation: {
              width:  Math.round(img.naturalWidth  * scale),
              height: Math.round(img.naturalHeight * scale),
            },
          })
          res()
        }
        img.onerror = rej
        img.src = logoDataUrl
      })
    } catch { logoImage = null }
  }

  // ── Page header table (logo left | title right) ─────────────────────────────
  const logoCell = new TableCell({
    width:   { size: 30, type: WidthType.PERCENTAGE },
    margins: { top: 0, bottom: 0, left: 0, right: 80 },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: LINE_BORDER },
    verticalAlign: VerticalAlign.BOTTOM,
    children: [logoImage
      ? new Paragraph({ children: [logoImage], spacing: { before: 0, after: 0 } })
      : para(''),
    ],
  })

  const titleCell = new TableCell({
    width:   { size: 70, type: WidthType.PERCENTAGE },
    margins: { top: 0, bottom: 0, left: 80, right: 0 },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: LINE_BORDER },
    verticalAlign: VerticalAlign.BOTTOM,
    children: [
      para([run('Projektbeteiligte', { allCaps: true, size: 16 })], { alignment: AlignmentType.RIGHT }),
      para([run(project.name || '–', { bold: true, size: 28 })], { alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 } }),
      para([run(`Stand: ${formatDate(today)}`, { size: 16, color: '555555' })], { alignment: AlignmentType.RIGHT }),
    ],
  })

  const headerTable = new Table({
    width:  { size: 100, type: WidthType.PERCENTAGE },
    borders: { insideH: NO_BORDER, insideV: NO_BORDER },
    rows: [new TableRow({ children: [logoCell, titleCell] })],
  })

  // ── Contacts table ──────────────────────────────────────────────────────────
  const COL = [5, 17, 17, 14, 15, 20, 12] // Nr · Name · Firma · Gewerk · Funktion · E-Mail · Telefon

  const headerRow = new TableRow({
    children: [
      tcH('Nr.',      COL[0]),
      tcH('Name',     COL[1]),
      tcH('Firma',    COL[2]),
      tcH('Gewerk',   COL[3]),
      tcH('Funktion', COL[4]),
      tcH('E-Mail',   COL[5]),
      tcH('Telefon',  COL[6]),
    ],
  })

  const dataRows = contacts.map((c, i) => new TableRow({
    children: [
      tc(String(i + 1),   COL[0], { size: 16 }),
      tc(c.name,          COL[1]),
      tc(c.company,       COL[2]),
      tc(c.gewerk,        COL[3]),
      tc(c.role,          COL[4]),
      tc(c.email,         COL[5], { size: 16 }),
      tc(c.phone,         COL[6], { size: 16 }),
    ],
  }))

  const contactTable = new Table({
    width:   { size: 100, type: WidthType.PERCENTAGE },
    borders: { insideH: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' }, insideV: NO_BORDER },
    rows:    [headerRow, ...dataRows],
  })

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { before: 0, after: 0 },
      border:    { top: LINE_BORDER },
      children:  [
        new TextRun({ text: `${project.name || ''}  ·  Seite `, size: 15, font: FONT, color: BLACK }),
        new TextRun({ children: [PageNumber.CURRENT], size: 15, font: FONT, color: BLACK }),
        new TextRun({ text: ' / ', size: 15, font: FONT, color: BLACK }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, font: FONT, color: BLACK }),
      ],
    })],
  })

  // ── Document ─────────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) },
          margin: { top: convertInchesToTwip(0.47), right: convertInchesToTwip(0.47), bottom: convertInchesToTwip(0.79), left: convertInchesToTwip(0.47) },
        },
      },
      footers:  { default: footer },
      children: [headerTable, sp(300), contactTable],
    }],
  })

  const blob     = await Packer.toBlob(doc)
  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  a.href         = url
  a.download     = `Projektbeteiligte_${(project.name || 'Projekt').replace(/[^a-zA-Z0-9_\-]/g, '_')}.docx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
