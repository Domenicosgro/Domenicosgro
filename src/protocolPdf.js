import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { formatDate } from './utils'
import { attachmentStore } from './attachmentStore'

const STATUS_LABELS   = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }
const PRIORITY_LABELS = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }

function extractHtmlImages(html) {
  if (!html) return []
  const re  = /<img[^>]+src="(data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))"[^>]*>/gi
  const out = []
  let m
  while ((m = re.exec(html)) !== null) {
    out.push({ mimeType: m[2].toLowerCase().replace('jpeg', 'jpg'), base64: m[3] })
  }
  return out
}

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

// Die pdf-lib-Standardschriften nutzen WinAnsi (CP1252) und brechen bei Zeichen
// ab, die sie nicht kodieren können (Häkchen ✓, Pfeile →, Emojis, Math-Symbole …).
// pdfSafe() ersetzt gängige Symbole durch ASCII-Äquivalente und tauscht alle
// übrigen nicht kodierbaren Zeichen gegen '?' – so bricht die PDF-Erzeugung nie ab.
const PDF_CHAR_MAP = {
  '✓': '[x]', '✔': '[x]', '☑': '[x]', '☒': '[x]', '☐': '[ ]', '✗': 'x', '✘': 'x',
  '→': '->', '←': '<-', '↑': '^', '↓': 'v', '↩': '<-', '⇒': '=>', '➔': '->', '»': '>>', '«': '<<',
  '≤': '<=', '≥': '>=', '≈': '~', '≠': '!=', '±': '+/-',
  '‣': '-', '◦': '-', '∙': '-', '●': '-', '▪': '-', '■': '-', '□': '-', '★': '*', '☆': '*',
}
function pdfSafe(text) {
  if (text == null) return ''
  let s = String(text)
  for (const [k, v] of Object.entries(PDF_CHAR_MAP)) if (s.includes(k)) s = s.split(k).join(v)
  // CP1252 = Latin-1 (0x00–0xFF) + einige typografische Sonderzeichen. Alles andere → '?'
  // u-Flag: ganze Codepoints (auch Emojis) werden je zu EINEM '?' zusammengefasst.
  return s.replace(/[^\x00-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu, '?')
}

function wrapText(text, font, fontSize, maxWidth) {
  const lines = []
  for (const para of pdfSafe(text).split('\n')) {
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

async function embedLogo(pdfDoc, dataUrl) {
  if (!dataUrl) return null
  try {
    const comma = dataUrl.indexOf(',')
    const isPng = dataUrl.slice(0, comma).includes('png')
    const b64   = dataUrl.slice(comma + 1)
    return isPng ? await pdfDoc.embedPng(b64) : await pdfDoc.embedJpg(b64)
  } catch { return null }
}

export async function buildProtocolPdf(protocol, protocolNo, logoDataUrl, clientLogoDataUrl = null) {
  const pdfDoc = await PDFDocument.create()
  const PAGE_W = 595.28
  const PAGE_H = 841.89
  const MARGIN = 42
  const CONTENT_W = PAGE_W - MARGIN * 2

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontItal = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  const logoImg       = await embedLogo(pdfDoc, logoDataUrl)
  const clientLogoImg = await embedLogo(pdfDoc, clientLogoDataUrl)

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y    = PAGE_H - MARGIN

  const newPage = () => { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN }
  const ensureSpace = (needed) => { if (y - needed < MARGIN) newPage() }

  // ── Seitenkopf: Logo links · Dokumenttyp/Titel/Projekt rechts · Linie ──────────
  const drawHeader = () => {
    // Draw logos left-to-right and track the right edge of the logo area
    let logoRight = MARGIN
    if (logoImg) {
      const d = logoImg.scaleToFit(110, 34)
      page.drawImage(logoImg, { x: logoRight, y: y - d.height, width: d.width, height: d.height })
      logoRight += d.width + 14
    }
    if (clientLogoImg) {
      const d = clientLogoImg.scaleToFit(110, 34)
      page.drawImage(clientLogoImg, { x: logoRight, y: y - d.height, width: d.width, height: d.height })
      logoRight += d.width + 14
    }

    // Right text column — never let text reach into the logo area
    const TEXT_COL_MIN_X = logoRight + 8
    const TEXT_COL_W     = PAGE_W - MARGIN - TEXT_COL_MIN_X

    const typeText  = 'BESPRECHUNGSPROTOKOLL'
    const rawTitle  = protocol.meetingType || 'Protokoll'
    const projText  = pdfSafe(protocol.projectName || '')

    const TITLE_SIZE   = 14
    const TITLE_LINE_H = 17
    const titleLines   = wrapText(rawTitle, fontBold, TITLE_SIZE, TEXT_COL_W)
    const HEADER_H     = Math.max(46, 10 + titleLines.length * TITLE_LINE_H + (projText ? 14 : 0) + 10)

    page.drawText(typeText, {
      x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(typeText, 7),
      y: y - 10, size: 7, font: fontReg, color: rgb(0.33, 0.33, 0.33),
    })
    let titleY = y - 26
    for (const line of titleLines) {
      const lineW = fontBold.widthOfTextAtSize(line, TITLE_SIZE)
      page.drawText(line, {
        x: Math.max(TEXT_COL_MIN_X, PAGE_W - MARGIN - lineW),
        y: titleY, size: TITLE_SIZE, font: fontBold, color: rgb(0, 0, 0),
      })
      titleY -= TITLE_LINE_H
    }
    if (projText) {
      const projW = fontReg.widthOfTextAtSize(projText, 9)
      page.drawText(projText, {
        x: Math.max(TEXT_COL_MIN_X, PAGE_W - MARGIN - projW),
        y: titleY + 2, size: 9, font: fontReg, color: rgb(0.33, 0.33, 0.33),
      })
    }
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
    page.drawText(pdfSafe(k).toUpperCase(), { x: MARGIN, y, size: 6.5, font: fontReg, color: rgb(0.47, 0.47, 0.47) })
    page.drawText(pdfSafe(v), { x: VALUE_X, y, size: 9, font: fontReg, color: rgb(0, 0, 0) })
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
  // Neu eingefügte Punkte (ohne carriedFromId) nur hervorheben, wenn es auch
  // übernommene Punkte gibt – analog zur Bildschirm-/Druckansicht.
  const hasCarried = items.some(it => it.carriedFromId)
  if (items.length > 0) {
    sectionTitle('Protokollpunkte')
    for (const item of items) {
      const lvl    = item.level ?? 1
      const indent = (lvl - 1) * 16
      const isGray = !!item.carriedGray
      const isNew  = hasCarried && !item.carriedFromId && !isGray
      const color  = isGray ? rgb(0.5, 0.5, 0.5) : isNew ? rgb(0.55, 0.36, 0.02) : rgb(0, 0, 0)

      ensureSpace(16)
      y -= lvl === 1 ? 4 : 2
      // Neu-Punkte: amber Balken links + "(neu)"-Zusatz (identisch in Druck & Versand)
      if (isNew) page.drawRectangle({ x: MARGIN + indent - 5, y: y - 12, width: 2.5, height: 14, color: rgb(0.96, 0.62, 0.04) })
      const head = `${item.no}  ${item.topic || '–'}${item.assignedTo ? `   [${item.assignedTo}]` : ''}${item.deadline ? `   Frist: ${formatDate(item.deadline)}` : ''}${isNew ? '   (neu)' : ''}`
      drawParagraph(head, {
        size: lvl === 1 ? 10.5 : 10,
        font: lvl === 1 ? fontBold : (isGray ? fontItal : fontBold),
        color, indent, lineH: 14,
      })

      const disc = stripHtmlForPdf(item.discussion)
      if (disc) {
        drawParagraph(disc, { size: 9.5, font: isGray ? fontItal : fontReg, color, indent: indent + 14, lineH: 13, gap: 2 })
      }

      // Inline images embedded in the discussion field
      for (const { mimeType, base64 } of extractHtmlImages(item.discussion)) {
        try {
          const pdfImg = mimeType === 'png'
            ? await pdfDoc.embedPng(base64)
            : await pdfDoc.embedJpg(base64)
          const maxImgW = CONTENT_W - indent - 14
          const d = pdfImg.scaleToFit(maxImgW, 280)
          ensureSpace(d.height + 10)
          page.drawImage(pdfImg, { x: MARGIN + indent + 14, y: y - d.height, width: d.width, height: d.height })
          y -= d.height + 10
        } catch {}
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

  // ── Anlagenverzeichnis ────────────────────────────────────────────────────────
  const attachments = protocol.attachments ?? []
  if (attachments.length) {
    sectionTitle('Anlagenverzeichnis')
    attachments.forEach((a, i) => {
      const typ = a.mimeType === 'application/pdf' ? 'PDF'
        : (a.mimeType || '').startsWith('image/') ? 'Bild' : 'Datei'
      drawParagraph(`Anlage ${i + 1}:  ${a.name || '–'}  (${typ})`,
        { size: 9.5, font: fontReg, color: rgb(0, 0, 0), lineH: 13 })
    })
  }

  // ── Fußzeile auf allen Seiten (Protokoll + Anlagenverzeichnis) ─────────────────
  const pages = pdfDoc.getPages()
  pages.forEach((pg, i) => {
    const footer = pdfSafe(`${protocol.projectName || '–'} · ${protocol.meetingType || ''}`)
    pg.drawText(footer, { x: MARGIN, y: 22, size: 7, font: fontReg, color: rgb(0.5, 0.5, 0.5) })
    const pageStr = `Seite ${i + 1} / ${pages.length}`
    pg.drawText(pageStr, { x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(pageStr, 7), y: 22, size: 7, font: fontReg, color: rgb(0.5, 0.5, 0.5) })
  })

  // ── Anlagen physisch anhängen (NACH der Fußzeile → Anlagen selbst ohne Fußzeile).
  //    PDF-Dateien werden seitenweise gemergt, Bilder ganzseitig eingebettet. ─────
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i]
    let b64 = null
    try { b64 = await attachmentStore.load(a.id) } catch {}
    if (!b64) continue
    try {
      if (a.mimeType === 'application/pdf') {
        const src    = await PDFDocument.load(b64, { ignoreEncryption: true })
        const copied = await pdfDoc.copyPages(src, src.getPageIndices())
        copied.forEach(p => pdfDoc.addPage(p))
      } else if ((a.mimeType || '').startsWith('image/')) {
        const img = a.mimeType.includes('png') ? await pdfDoc.embedPng(b64) : await pdfDoc.embedJpg(b64)
        const pg  = pdfDoc.addPage([PAGE_W, PAGE_H])
        pg.drawText(pdfSafe(`Anlage ${i + 1} – ${a.name || ''}`),
          { x: MARGIN, y: PAGE_H - MARGIN, size: 8, font: fontReg, color: rgb(0.3, 0.3, 0.3) })
        const d = img.scaleToFit(PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2 - 24)
        pg.drawImage(img, { x: (PAGE_W - d.width) / 2, y: (PAGE_H - d.height) / 2 - 8, width: d.width, height: d.height })
      }
    } catch { /* defekte/inkompatible Datei überspringen */ }
  }

  // ── Per-Punkt-Bildanlagen als eigene Seiten (wie in der Druckansicht) ──────────
  for (const item of items) {
    const att = item.attachment
    if (!att?.id || !(att.mimeType || '').startsWith('image/')) continue
    let b64 = null
    try { b64 = await attachmentStore.load(att.id) } catch {}
    if (!b64) continue
    try {
      const img = att.mimeType.includes('png') ? await pdfDoc.embedPng(b64) : await pdfDoc.embedJpg(b64)
      const pg  = pdfDoc.addPage([PAGE_W, PAGE_H])
      pg.drawText(pdfSafe(`Anlage ${item.no || ''} – ${att.name || ''}`),
        { x: MARGIN, y: PAGE_H - MARGIN, size: 8, font: fontReg, color: rgb(0.3, 0.3, 0.3) })
      const d = img.scaleToFit(PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2 - 24)
      pg.drawImage(img, { x: (PAGE_W - d.width) / 2, y: (PAGE_H - d.height) / 2 - 8, width: d.width, height: d.height })
    } catch { /* defekte Bilddatei überspringen */ }
  }

  return pdfDoc.saveAsBase64()
}
