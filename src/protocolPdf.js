import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { formatDate } from './utils'

const STATUS_LABELS   = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }
const PRIORITY_LABELS = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }

function stripHtmlForPdf(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function wrapText(text, font, fontSize, maxWidth) {
  const lines = []
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { lines.push(''); continue }
    const words = para.split(/\s+/)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

export async function buildProtocolPdf(protocol, protocolNo, logoDataUrl) {
  const pdfDoc = await PDFDocument.create()
  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 42
  const CONTENT_W = PAGE_W - MARGIN * 2

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontItal = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  let logoImg = null
  if (logoDataUrl) {
    try {
      const comma = logoDataUrl.indexOf(',')
      const isPng = logoDataUrl.slice(0, comma).includes('png')
      const b64   = logoDataUrl.slice(comma + 1)
      logoImg = isPng ? await pdfDoc.embedPng(b64) : await pdfDoc.embedJpg(b64)
    } catch {}
  }

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y    = PAGE_H - MARGIN

  const newPage = () => { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN }
  const ensureSpace = (needed) => { if (y - needed < MARGIN) newPage() }

  // ── Seitenkopf: Logo links · Dokumenttyp/Titel/Projekt rechts · Linie ──────────
  const drawHeader = () => {
    const HEADER_H = 46
    if (logoImg) {
      const d = logoImg.scaleToFit(110, 34)
      page.drawImage(logoImg, { x: MARGIN, y: y - d.height, width: d.width, height: d.height })
    }
    const typeText  = 'BESPRECHUNGSPROTOKOLL'
    const titleText = protocol.meetingType || 'Protokoll'
    const projText  = protocol.projectName || ''
    page.drawText(typeText, {
      x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(typeText, 7),
      y: y - 10, size: 7, font: fontReg, color: rgb(0.33, 0.33, 0.33),
    })
    page.drawText(titleText, {
      x: PAGE_W - MARGIN - fontBold.widthOfTextAtSize(titleText, 15),
      y: y - 26, size: 15, font: fontBold, color: rgb(0, 0, 0),
    })
    if (projText) page.drawText(projText, {
      x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(projText, 9),
      y: y - 40, size: 9, font: fontReg, color: rgb(0.33, 0.33, 0.33),
    })
    y -= HEADER_H
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: rgb(0, 0, 0) })
    y -= 14
  }

  const sectionTitle = (text) => {
    ensureSpace(28)
    page.drawText(text, { x: MARGIN, y, size: 11, font: fontBold, color: rgb(0, 0, 0) })
    y -= 4
    page.drawLine({ start: { x: MARGIN, y: y - 1 }, end: { x: PAGE_W - MARGIN, y: y - 1 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) })
    y -= 12
  }

  const drawParagraph = (text, { size = 10, font = fontReg, color = rgb(0, 0, 0), indent = 0, lineH = 13, gap = 0 } = {}) => {
    const lines = wrapText(text, font, size, CONTENT_W - indent)
    for (const l of lines) {
      ensureSpace(lineH)
      if (l) page.drawText(l, { x: MARGIN + indent, y, size, font, color })
      y -= lineH
    }
    y -= gap
  }

  drawHeader()

  // ── Metadaten ──────────────────────────────────────────────────────────────────
  const metaRows = [
    ['Protokoll-Nr.', protocolNo],
    ['Datum', `${formatDate(protocol.date)}${protocol.time ? `, ${protocol.time} Uhr` : ''}`],
  ]
  if (protocol.location)   metaRows.push(['Ort / Raum', protocol.location])
  if (protocol.preparedBy) metaRows.push(['Erstellt von', protocol.preparedBy])
  if (protocol.isClosed)   metaRows.push(['Status', 'Abgeschlossen'])
  if (protocol.nextMeeting) {
    metaRows.push(['Nächste Besprechung', `${formatDate(protocol.nextMeeting)}${protocol.nextMeetingTime ? `, ${protocol.nextMeetingTime} Uhr` : ''}`])
  }

  const VALUE_X = MARGIN + 120
  for (const [k, v] of metaRows) {
    ensureSpace(14)
    page.drawText(k.toUpperCase(), { x: MARGIN, y, size: 6.5, font: fontReg, color: rgb(0.47, 0.47, 0.47) })
    page.drawText(String(v), { x: VALUE_X, y, size: 9, font: fontReg, color: rgb(0, 0, 0) })
    y -= 14
  }
  y -= 6

  // ── Teilnehmer ───────────────────────────────────────────────────────────────
  const participants = protocol.participants ?? []
  if (participants.length > 0) {
    const present = participants.filter(p => p.present)
    const absent  = participants.filter(p => !p.present)
    sectionTitle(`Teilnehmer (${present.length} anwesend${absent.length ? `, ${absent.length} entschuldigt` : ''})`)
    for (const p of participants) {
      const mark  = p.present ? '✓' : '–'
      const parts = [p.name, p.company, p.role].filter(Boolean).join(', ')
      const mail  = p.email ? `  (${p.email})` : ''
      drawParagraph(`${mark}  ${parts || '–'}${mail}`, {
        size: 9, indent: 0, lineH: 13,
        font:  p.present ? fontReg : fontItal,
        color: p.present ? rgb(0, 0, 0) : rgb(0.45, 0.45, 0.45),
      })
    }
    y -= 6
  }

  // ── Protokollpunkte ─────────────────────────────────────────────────────────
  const items   = protocol.agendaItems ?? []
  const actions = protocol.actionItems ?? []
  if (items.length > 0) {
    sectionTitle('Protokollpunkte')
    for (const item of items) {
      const lvl    = item.level ?? 1
      const indent = (lvl - 1) * 16
      const isGray = !!item.carriedGray
      const color  = isGray ? rgb(0.5, 0.5, 0.5) : rgb(0, 0, 0)

      ensureSpace(16)
      y -= lvl === 1 ? 4 : 2
      const head = `${item.no}  ${item.topic || '–'}${item.assignedTo ? `   [${item.assignedTo}]` : ''}`
      drawParagraph(head, {
        size: lvl === 1 ? 10.5 : 10,
        font: lvl === 1 ? fontBold : (isGray ? fontItal : fontBold),
        color, indent, lineH: 14,
      })

      const disc = stripHtmlForPdf(item.discussion)
      if (disc) {
        drawParagraph(disc, { size: 9.5, font: isGray ? fontItal : fontReg, color, indent: indent + 14, lineH: 13, gap: 2 })
      }

      const myTasks = actions.filter(t => t.protocolItemId === item.id)
      for (const task of myTasks) {
        const done = task.status === 'erledigt'
        drawParagraph(`${done ? '✓' : '○'} ${task.description || '–'}${task.responsible ? `  [${task.responsible}]` : ''}`, {
          size: 9, font: done ? fontItal : fontReg, color: rgb(0.3, 0.3, 0.3), indent: indent + 22, lineH: 12,
        })
      }
      y -= 3
    }
    y -= 4
  }

  // ── Maßnahmen ────────────────────────────────────────────────────────────────
  if (actions.length > 0) {
    sectionTitle('Maßnahmen')
    let n = 1
    for (const a of actions) {
      const head = `${n}.  ${a.description || '–'}${a.responsible ? `  [${a.responsible}]` : ''}`
      drawParagraph(head, { size: 9.5, font: fontReg, color: rgb(0, 0, 0), lineH: 13 })
      const meta = [
        a.deadline ? `Frist: ${formatDate(a.deadline)}` : null,
        `Status: ${STATUS_LABELS[a.status] || a.status || '–'}`,
        a.priority ? `Priorität: ${PRIORITY_LABELS[a.priority] || a.priority}` : null,
      ].filter(Boolean).join('  ·  ')
      drawParagraph(meta, { size: 8, font: fontReg, color: rgb(0.45, 0.45, 0.45), indent: 16, lineH: 11, gap: 3 })
      n++
    }
    y -= 4
  }

  // ── Notizen ──────────────────────────────────────────────────────────────────
  const notes = stripHtmlForPdf(protocol.notes)
  if (notes) {
    sectionTitle('Allgemeine Bemerkungen')
    drawParagraph(notes, { size: 9.5, font: fontReg, color: rgb(0, 0, 0), lineH: 13 })
  }

  // ── Fußzeile auf allen Seiten ─────────────────────────────────────────────────
  const pages = pdfDoc.getPages()
  pages.forEach((pg, i) => {
    const footer = `${protocol.projectName || '–'} · ${protocol.meetingType || ''}`
    pg.drawText(footer, { x: MARGIN, y: 22, size: 7, font: fontReg, color: rgb(0.5, 0.5, 0.5) })
    const pageStr = `Seite ${i + 1} / ${pages.length}`
    pg.drawText(pageStr, { x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(pageStr, 7), y: 22, size: 7, font: fontReg, color: rgb(0.5, 0.5, 0.5) })
  })

  return pdfDoc.saveAsBase64()
}
