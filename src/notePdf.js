import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { NOTE_TYPES, formatDate } from './utils'

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
  for (const para of text.split('\n')) {
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

export async function buildNotePdf(note, contact, projectName, logoDataUrl) {
  const pdfDoc = await PDFDocument.create()
  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 42
  const CONTENT_W = PAGE_W - MARGIN * 2

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const typeInfo = NOTE_TYPES.find(t => t.value === note.type) ?? NOTE_TYPES[0]
  const today    = new Date().toISOString().slice(0, 10)

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y    = PAGE_H - MARGIN

  const ensureSpace = (needed) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H])
      y    = PAGE_H - MARGIN
    }
  }

  // Logo
  let logoImg = null
  if (logoDataUrl) {
    try {
      const comma = logoDataUrl.indexOf(',')
      const isPng = logoDataUrl.slice(0, comma).includes('png')
      const b64   = logoDataUrl.slice(comma + 1)
      logoImg = isPng ? await pdfDoc.embedPng(b64) : await pdfDoc.embedJpg(b64)
    } catch {}
  }

  const HEADER_H = 44
  if (logoImg) {
    const d = logoImg.scaleToFit(100, 32)
    page.drawImage(logoImg, { x: MARGIN, y: y - d.height, width: d.width, height: d.height })
  }

  // Right header block
  const typeText  = typeInfo.label.toUpperCase()
  const titleText = note.subject || typeInfo.label
  const standText = `${projectName ? projectName + ' · ' : ''}Stand: ${formatDate(today)}`

  page.drawText(typeText, {
    x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(typeText, 7),
    y: y - 10, size: 7, font: fontReg, color: rgb(0.33, 0.33, 0.33),
  })
  page.drawText(titleText, {
    x: PAGE_W - MARGIN - fontBold.widthOfTextAtSize(titleText, 14),
    y: y - 24, size: 14, font: fontBold, color: rgb(0, 0, 0),
  })
  page.drawText(standText, {
    x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(standText, 7),
    y: y - 38, size: 7, font: fontReg, color: rgb(0.33, 0.33, 0.33),
  })

  y -= HEADER_H

  // Header rule
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: rgb(0, 0, 0) })
  y -= 12

  // Metadata
  const metaRows = []
  metaRows.push(['Datum', `${formatDate(note.date)}${note.time ? `, ${note.time} Uhr` : ''}`])
  if (projectName) metaRows.push(['Projekt', projectName])
  if (contact) {
    const label = note.type === 'telefonnotiz' ? 'Gesprächspartner' : 'Kontakt'
    const parts = [contact.name, contact.company].filter(Boolean).join(' · ')
    metaRows.push([label, parts || '–'])
    if (contact.phone) metaRows.push(['Telefon', contact.phone])
    if (contact.email) metaRows.push(['E-Mail', contact.email])
  }

  const VALUE_X = MARGIN + 72
  const ROW_H   = 14

  for (const [k, v] of metaRows) {
    ensureSpace(ROW_H)
    page.drawText(k.toUpperCase(), { x: MARGIN, y, size: 6.5, font: fontReg, color: rgb(0.47, 0.47, 0.47) })
    page.drawText(String(v), { x: VALUE_X, y, size: 9, font: fontReg, color: rgb(0, 0, 0) })
    y -= ROW_H
  }

  y -= 8

  // Content divider
  ensureSpace(24)
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 10
  page.drawText('INHALT', { x: MARGIN, y, size: 6.5, font: fontReg, color: rgb(0.47, 0.47, 0.47) })
  y -= 14

  // Content
  const contentText = stripHtmlForPdf(note.content) || 'Kein Inhalt.'
  const FONT_SIZE   = 10
  const LINE_H      = 14
  const lines       = wrapText(contentText, fontReg, FONT_SIZE, CONTENT_W)

  for (const l of lines) {
    ensureSpace(LINE_H)
    if (l) page.drawText(l, { x: MARGIN, y, size: FONT_SIZE, font: fontReg, color: rgb(0, 0, 0) })
    y -= LINE_H
  }

  return pdfDoc.saveAsBase64()
}
