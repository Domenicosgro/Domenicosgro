import {
  AlignmentType, BorderStyle, convertInchesToTwip,
  Document, Footer, ImageRun, Packer, PageBreak, PageNumber,
  Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { buildProtocolNo, formatDate } from './utils'

// ── HTML helpers ──────────────────────────────────────────────────────────────

function stripHtmlForDocx(html) {
  if (!html) return ''
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractDocxImages(html, maxW = 420) {
  if (!html) return []
  const re  = /<img[^>]+src="(data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))"[^>]*>/gi
  const runs = []
  let m
  while ((m = re.exec(html)) !== null) {
    const mimeRaw = m[2].toLowerCase()
    const mime    = mimeRaw.replace('jpeg', 'jpg')
    const type    = ['png', 'jpg', 'gif', 'bmp'].includes(mime) ? mime : 'png'
    const base64  = m[3]
    try {
      const img = new Image()
      img.src = `data:image/${mimeRaw};base64,${base64}`
      await new Promise(r => { img.onload = r; img.onerror = r })
      const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1
      const w = Math.round((img.naturalWidth  || maxW) * scale)
      const h = Math.round((img.naturalHeight || 300) * scale)
      runs.push(new ImageRun({ data: base64, type, transformation: { width: w, height: h } }))
    } catch {}
  }
  return runs
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const BLACK = '000000'
const FONT  = 'Arial'

const NO_BORDER   = { style: BorderStyle.NONE,   size: 0,  color: 'FFFFFF' }
const LINE_BORDER = { style: BorderStyle.SINGLE, size: 4,  color: BLACK }   // ~0.5 pt
const LEFT_BAR    = { style: BorderStyle.SINGLE, size: 12, color: BLACK }   // ~1.5 pt

// ── Low-level helpers ──────────────────────────────────────────────────────────

function run(text, opts = {}) {
  return new TextRun({ text: String(text ?? ''), size: 20, color: BLACK, font: FONT, ...opts })
}

function para(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [run(runs)]
  return new Paragraph({ children, spacing: { before: 0, after: 0 }, ...opts })
}

function sp(after = 120) { return para('', { spacing: { before: 0, after } }) }

function pageBreakPara() { return new Paragraph({ children: [new PageBreak()] }) }

function sectionTitle(text) {
  return para([run(text, { bold: true, size: 22, font: FONT })], {
    spacing: { before: 280, after: 100 },
    border: { bottom: LINE_BORDER },
  })
}

// Body cell — no borders
function tc(text, widthPct, opts = {}) {
  const { bold, italic, allCaps, size, alignment } = opts
  return new TableCell({
    width:    { size: widthPct, type: WidthType.PERCENTAGE },
    margins:  { top: 60, bottom: 60, left: 80, right: 80 },
    borders:  { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [new Paragraph({
      alignment: alignment ?? AlignmentType.LEFT,
      children:  [new TextRun({
        text:    String(text ?? ''),
        bold:    bold    ?? false,
        italic:  italic  ?? false,
        color:   BLACK,
        allCaps: allCaps ?? false,
        size:    size    ?? 20,
        font:    FONT,
      })],
    })],
  })
}

// Header cell — bottom border only
function tcH(text, widthPct, opts = {}) {
  return new TableCell({
    width:   { size: widthPct, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 80, left: 80, right: 80 },
    borders: { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: LINE_BORDER },
    children: [new Paragraph({
      alignment: opts.alignment ?? AlignmentType.LEFT,
      children:  [new TextRun({
        text: String(text ?? ''), bold: true, color: BLACK,
        allCaps: true, size: 16, font: FONT,
      })],
    })],
  })
}

// Metadata block — label allCaps small, value normal, no borders
function metaTable(rows) {
  const filtered = rows.filter(r => r[1] != null && r[1] !== '')
  if (!filtered.length) return sp()
  return new Table({
    width:   { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
               insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: filtered.map(([label, value]) => new TableRow({ children: [
      tc(label, 28, { allCaps: true, size: 16 }),
      tc(value,  72),
    ]})),
  })
}

// Data table — header row has bottom border, body rows have no borders
function dataTable(columns, dataRows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(c => tcH(c.text, c.width, { alignment: c.headerOpts?.alignment })),
  })
  const bodyRows = dataRows.map(cells => new TableRow({
    children: cells.map((cell, i) => {
      if (typeof cell === 'object' && cell !== null && 'text' in cell) {
        return tc(cell.text, columns[i].width, cell.opts ?? {})
      }
      return tc(cell, columns[i].width, {})
    }),
  }))
  return new Table({
    width:   { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
               insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [headerRow, ...bodyRows],
  })
}

// Page header: logo(s) left · doc-type/title/project right · bottom black line
function buildPageHeader(protocol, subtitle, logoImage, clientImage) {
  const textChildren = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { before: 0, after: 20 },
      children:  [new TextRun({ text: subtitle.toUpperCase(), size: 16, allCaps: true, color: BLACK, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { before: 0, after: 20 },
      children:  [new TextRun({ text: protocol.meetingType || '', bold: true, size: 32, color: BLACK, font: FONT })],
    }),
    // Protokollbezeichnung (Untertitel), sofern gepflegt
    ...(protocol.subtitle?.trim() ? [new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { before: 0, after: 20 },
      children:  [new TextRun({ text: protocol.subtitle.trim(), bold: true, size: 20, color: BLACK, font: FONT })],
    })] : []),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { before: 0, after: 0 },
      children:  [new TextRun({ text: protocol.projectName || '', size: 20, color: BLACK, font: FONT })],
    }),
  ]
  const logoRuns = [logoImage, clientImage].filter(Boolean)
  const leftCell = new TableCell({
    width:         { size: 35, type: WidthType.PERCENTAGE },
    borders:       { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: LINE_BORDER },
    verticalAlign: VerticalAlign.BOTTOM,
    margins:       { top: 0, bottom: 80, left: 0, right: 160 },
    children:      logoRuns.length
      ? [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: logoRuns.flatMap((img, i) => i === 0 ? [img] : [new TextRun({ text: '   ', font: FONT }), img]),
        })]
      : [sp(0)],
  })
  const rightCell = new TableCell({
    width:         { size: 65, type: WidthType.PERCENTAGE },
    borders:       { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: LINE_BORDER },
    verticalAlign: VerticalAlign.BOTTOM,
    margins:       { top: 0, bottom: 80, left: 160, right: 0 },
    children:      textChildren,
  })
  return [
    new Table({
      width:   { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
                 insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows:    [new TableRow({ children: [leftCell, rightCell] })],
    }),
    sp(200),
  ]
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildAgendaPage(protocol, logoImage, clientImage) {
  const agenda   = protocol.agenda ?? []
  const present  = (protocol.participants ?? []).filter(p => p.present)
  const totalMin = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  const out = []
  out.push(...buildPageHeader(protocol, 'Einladung / Agenda', logoImage, clientImage))
  out.push(metaTable([
    ['Datum',     formatDate(protocol.date)],
    ['Ort',       protocol.location || '–'],
    ['Einladung', protocol.preparedBy || '–'],
  ]))
  out.push(sp(80))
  out.push(sectionTitle('Tagesordnung'))

  const bodyRows = agenda.map((item, i) => new TableRow({
    children: [
      tc(String(item.no || i + 1), 8, { bold: true }),
      new TableCell({
        width:   { size: 47, type: WidthType.PERCENTAGE },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
        children: [
          para([run(item.topic || '–')]),
          ...(item.documents ? [para([run(`Unterlagen: ${item.documents}`, { size: 17 })])] : []),
        ],
      }),
      tc(item.duration ? `${item.duration} min` : '–', 14, { alignment: AlignmentType.RIGHT }),
      tc(item.responsible || '–', 31),
    ],
  }))
  const totalRow = totalMin > 0 ? [new TableRow({ children: [
    tc('', 8),
    tc('Gesamt', 47),
    tc(`${totalMin} min`, 14, { bold: true, alignment: AlignmentType.RIGHT }),
    tc('', 31),
  ]})] : []
  out.push(new Table({
    width:   { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
               insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [
      new TableRow({ tableHeader: true, children: [
        tcH('Nr.',       8),
        tcH('Thema',     47),
        tcH('Dauer',     14, { alignment: AlignmentType.RIGHT }),
        tcH('Zuständig', 31),
      ]}),
      ...bodyRows,
      ...totalRow,
    ],
  }))

  if (present.length > 0) {
    out.push(sp(120))
    out.push(para([
      run('Eingeladene Teilnehmer   ', { size: 16, allCaps: true }),
      run(present.map(p => p.name).filter(Boolean).join(' · ')),
    ], { spacing: { before: 80, after: 0 } }))
  }

  out.push(pageBreakPara())
  return out
}

function buildCoverPage(protocol, protocolNo, logoImage, clientImage) {
  const present  = (protocol.participants ?? []).filter(p => p.present)
  const absent   = (protocol.participants ?? []).filter(p => !p.present)
  const isClosed = !!protocol.isClosed

  const out = []
  out.push(...buildPageHeader(protocol, 'Besprechungsprotokoll', logoImage, clientImage))
  out.push(metaTable([
    ['Protokoll-Nr.',      protocolNo],
    ...(protocol.subtitle?.trim() ? [['Bezeichnung', protocol.subtitle.trim()]] : []),
    ['Datum',              formatDate(protocol.date)],
    ['Ort / Raum',         protocol.location || '–'],
    ['Erstellt von',       protocol.preparedBy || '–'],
    ...(isClosed ? [['Status', 'Abgeschlossen']] : []),
    ...(protocol.nextMeeting ? [['Nächste Besprechung', formatDate(protocol.nextMeeting)]] : []),
  ]))

  if ((protocol.participants ?? []).length > 0) {
    out.push(sp(120))
    out.push(sectionTitle(
      `Teilnehmerliste (${present.length} anwesend${absent.length > 0 ? `, ${absent.length} entschuldigt` : ''})`
    ))
    out.push(dataTable(
      [
        { text: '#',        width: 5  },
        { text: 'Name',     width: 23 },
        { text: 'Firma',    width: 21 },
        { text: 'Funktion', width: 18 },
        { text: 'E-Mail',   width: 23 },
        { text: '✓',        width: 10, headerOpts: { alignment: AlignmentType.CENTER } },
      ],
      protocol.participants.map((p, i) => [
        { text: String(i + 1) },
        { text: p.name    || '–', opts: { bold: p.present, italic: !p.present } },
        { text: p.company || '–', opts: { italic: !p.present } },
        { text: p.role    || '–', opts: { italic: !p.present } },
        { text: p.email   || '–', opts: { size: 18, italic: !p.present } },
        { text: p.present ? '✓' : '–', opts: { alignment: AlignmentType.CENTER } },
      ])
    ))
  }

  out.push(pageBreakPara())
  return out
}

async function buildContent(protocol, protocolNo) {
  const items    = protocol.agendaItems ?? []
  const actions  = protocol.actionItems ?? []

  const out = []

  // Running header line
  out.push(para([
    run(`${protocol.projectName} – ${protocol.meetingType}`, { bold: true, size: 19 }),
    run(`   ${protocolNo}`, { size: 17 }),
  ], { spacing: { before: 0, after: 200 }, border: { bottom: LINE_BORDER } }))

  // Protocol items
  if (items.length > 0) {
    out.push(sectionTitle('Protokollpunkte'))
    for (const item of items) {
      const lvl    = item.level ?? 1
      const isGray = !!item.carriedGray
      const indent = (lvl - 1) * 400

      out.push(para([
        run(`${item.no}  `, { bold: true, size: lvl === 1 ? 22 : 20 }),
        run(item.topic || '–', { bold: lvl === 1, size: lvl === 1 ? 22 : 20, italic: isGray }),
        ...(item.assignedTo ? [run(`   [${item.assignedTo}]`, { size: 18, italic: isGray })] : []),
      ], {
        indent:  { left: indent },
        spacing: { before: lvl === 1 ? 200 : 80, after: 40 },
        border:  lvl === 1 && !isGray ? { left: LEFT_BAR } : {},
      }))

      const discText = stripHtmlForDocx(item.discussion)
      if (discText) {
        out.push(para([run(discText, { size: 19, italic: isGray })], {
          indent:  { left: indent + 280 },
          spacing: { before: 0, after: 40 },
        }))
      }

      // Inline images from discussion
      const imgRuns = await extractDocxImages(item.discussion)
      for (const imgRun of imgRuns) {
        out.push(new Paragraph({
          spacing: { before: 60, after: 60 },
          indent:  { left: indent + 280 },
          children: [imgRun],
        }))
      }

      // Per-item tasks
      const myTasks = actions.filter(t => t.protocolItemId === item.id)
      for (const task of myTasks) {
        const taskDone = task.status === 'erledigt'
        out.push(para([
          run(taskDone ? '✓ ' : '○ ', { size: 18 }),
          run(task.description || '–', { size: 18, italic: taskDone }),
          ...(task.responsible ? [run(`  [${task.responsible}]`, { size: 17 })] : []),
        ], { indent: { left: indent + 440 }, spacing: { before: 20, after: 20 } }))
      }
    }
  }

  // Action items summary
  if (actions.length > 0) {
    out.push(sp(80))
    out.push(sectionTitle('Maßnahmen'))
    const STATUS_LABELS = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }
    out.push(dataTable(
      [
        { text: '#',         width: 5  },
        { text: 'Aufgabe',   width: 38 },
        { text: 'Zuständig', width: 19 },
        { text: 'Fällig',    width: 13 },
        { text: 'Status',    width: 14 },
        { text: 'Priorität', width: 11 },
      ],
      actions.map((a, i) => [
        { text: String(i + 1) },
        a.description || '–',
        { text: a.responsible || '–' },
        { text: a.deadline ? formatDate(a.deadline) : '–' },
        { text: STATUS_LABELS[a.status] ?? a.status ?? '–', opts: { bold: true } },
        { text: a.priority ?? '–' },
      ])
    ))
  }

  // Notes
  const notesText = stripHtmlForDocx(protocol.notes)
  if (notesText) {
    out.push(sp(80))
    out.push(sectionTitle('Notizen'))
    out.push(para([run(notesText)], { spacing: { before: 100, after: 0 } }))
  }

  return out
}

// ── Public API ─────────────────────────────────────────────────────────────────

// Prepare an ImageRun from a data URL for Word (returns null on error)
async function prepareLogoImage(dataUrl, maxW = 120) {
  if (!dataUrl) return null
  try {
    const typeMatch  = dataUrl.match(/data:image\/(\w+);/)
    const typeRaw    = (typeMatch?.[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg')
    const validTypes = ['png', 'jpg', 'gif', 'bmp', 'svg']
    const type       = validTypes.includes(typeRaw) ? typeRaw : 'png'
    const base64     = dataUrl.split(',')[1]
    const img        = new Image()
    img.src          = dataUrl
    await new Promise(r => { img.onload = r; img.onerror = r })
    const scale = img.naturalWidth > 0 ? Math.min(1, maxW / img.naturalWidth) : 1
    const w     = Math.round((img.naturalWidth  || maxW) * scale)
    const h     = Math.round((img.naturalHeight || 50)  * scale)
    return new ImageRun({ data: base64, type, transformation: { width: w, height: h } })
  } catch { return null }
}

// returnBlob: when true, returns { blob, filename } instead of triggering a download
export async function exportDocx(protocol, chainNo = null, logoDataUrl = null, returnBlob = false, clientLogoDataUrl = null) {
  const protocolNo = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)
  const agenda     = protocol.agenda ?? []

  // Prepare logo images for Word (office logo + optional client logo)
  const logoImage   = await prepareLogoImage(logoDataUrl)
  const clientImage = await prepareLogoImage(clientLogoDataUrl)

  // Pre-process image attachments on protocol items
  const attachmentPages = []
  const VALID_IMG = ['png', 'jpg', 'gif', 'bmp']
  for (const item of (protocol.agendaItems ?? []).filter(it => it.attachment)) {
    const att = item.attachment
    if (!att.mimeType?.startsWith('image/')) {
      // Non-image: reference line only
      attachmentPages.push(
        pageBreakPara(),
        para([run(`Anlage ${item.no} – ${att.name}`, { bold: true })], {
          spacing: { before: 0, after: 0 }, border: { bottom: LINE_BORDER },
        })
      )
      continue
    }
    try {
      const typeMatch = att.mimeType.match(/image\/(\w+)/)
      const typeRaw   = (typeMatch?.[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg')
      const type      = VALID_IMG.includes(typeRaw) ? typeRaw : 'png'
      const img       = new Image()
      img.src         = `data:${att.mimeType};base64,${att.data}`
      await new Promise(r => { img.onload = r; img.onerror = r })
      const maxW  = 500
      const scale = img.naturalWidth > 0 ? Math.min(1, maxW / img.naturalWidth) : 1
      const w     = Math.round((img.naturalWidth  || maxW) * scale)
      const h     = Math.round((img.naturalHeight || 350) * scale)
      attachmentPages.push(
        pageBreakPara(),
        para([run(`Anlage ${item.no} – ${att.name}`, { bold: true })], {
          spacing: { before: 0, after: 160 }, border: { bottom: LINE_BORDER },
        }),
        new Paragraph({
          spacing: { before: 120, after: 0 },
          children: [new ImageRun({ data: att.data, type, transformation: { width: w, height: h } })],
        })
      )
    } catch { /* skip attachment on error */ }
  }

  const children = [
    ...(agenda.length > 0 ? buildAgendaPage(protocol, logoImage, clientImage) : []),
    ...buildCoverPage(protocol, protocolNo, logoImage, clientImage),
    ...await buildContent(protocol, protocolNo),
    ...attachmentPages,
  ]

  const doc = new Document({
    creator:     'Komplizen Protokolle',
    title:       protocolNo,
    description: `${protocol.meetingType} – ${protocol.projectName}`,
    styles: {
      default: {
        document: { run: { font: FONT, size: 20, color: BLACK } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1.0),
            bottom: convertInchesToTwip(0.9),
            left:   convertInchesToTwip(1.2),
            right:  convertInchesToTwip(1.2),
          },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            border:   { top: LINE_BORDER },
            spacing:  { before: 80, after: 0 },
            children: [
              new TextRun({ text: `${protocol.projectName || '–'} · ${protocol.meetingType || ''}   `, font: FONT, size: 16, color: BLACK }),
              new TextRun({ text: 'Seite ', font: FONT, size: 16, color: BLACK }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: BLACK }),
              new TextRun({ text: ' / ', font: FONT, size: 16, color: BLACK }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: BLACK }),
            ],
          })],
        }),
      },
      children,
    }],
  })

  const blob     = await Packer.toBlob(doc)
  const filename = `${protocolNo.replace(/[/\\:*?"<>|]/g, '-')}.docx`

  if (returnBlob) return { blob, filename }

  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  a.href         = url
  a.download     = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
