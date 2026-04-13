import {
  AlignmentType, BorderStyle, convertInchesToTwip,
  Document, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import { buildProtocolNo, formatDate } from './utils'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BRAND = '1a56db'
const GRAY  = '6b7280'
const DARK  = '111827'
const GREEN = '15803d'

const NO_BORDER   = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' }

// ── Low-level helpers ──────────────────────────────────────────────────────────

function run(text, opts = {}) {
  return new TextRun({ text: String(text ?? ''), size: 20, color: DARK, ...opts })
}

function para(runs, opts = {}) {
  const children = Array.isArray(runs) ? runs : [run(runs)]
  return new Paragraph({ children, spacing: { before: 0, after: 0 }, ...opts })
}

function sp() { return para('') }

function pageBreakPara() {
  return new Paragraph({ children: [new PageBreak()] })
}

function sectionTitle(text) {
  return para([run(text, { bold: true, size: 24, color: DARK })], {
    spacing: { before: 300, after: 120 },
    border: { bottom: THIN_BORDER },
  })
}

// Table cell helper
function tc(text, widthPct, opts = {}) {
  const { bold, color, allCaps, size, alignment } = opts
  return new TableCell({
    width:    { size: widthPct, type: WidthType.PERCENTAGE },
    margins:  { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: alignment ?? AlignmentType.LEFT,
      children:  [new TextRun({
        text:    String(text ?? ''),
        bold:    bold    ?? false,
        color:   color   ?? DARK,
        allCaps: allCaps ?? false,
        size:    size    ?? 20,
      })],
    })],
  })
}

// No-border table (for metadata key-value pairs)
function metaTable(rows) {
  const filtered = rows.filter(r => r[1] != null && r[1] !== '')
  if (!filtered.length) return sp()
  return new Table({
    width:   { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
               insideHorizontal: THIN_BORDER, insideVertical: NO_BORDER },
    rows: filtered.map(([label, value]) => new TableRow({ children: [
      tc(label, 28, { color: GRAY, allCaps: true, size: 17 }),
      tc(value,  72, { color: DARK }),
    ]})),
  })
}

// Data table with column header row
function dataTable(columns, dataRows) {
  // columns: [{ text, width, opts }]
  // dataRows: [[cell-text-or-opts, ...], ...]
  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(c => tc(c.text, c.width, { bold: true, color: GRAY, allCaps: true, size: 16, ...c.headerOpts })),
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
               insideHorizontal: THIN_BORDER, insideVertical: NO_BORDER },
    rows: [headerRow, ...bodyRows],
  })
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildAgendaPage(protocol) {
  const agenda   = protocol.agenda ?? []
  const present  = (protocol.participants ?? []).filter(p => p.present)
  const totalMin = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  const out = []

  // Page title
  out.push(para([run('Einladung / Agenda', { bold: true, size: 40, color: DARK })],
    { spacing: { before: 0, after: 80 } }))
  out.push(para([run(protocol.meetingType, { size: 28, color: BRAND })],
    { spacing: { before: 0, after: 40 } }))
  out.push(para([run(protocol.projectName || '', { size: 22, color: GRAY })],
    { spacing: { before: 0, after: 280 } }))

  // Metadata
  out.push(metaTable([
    ['Datum',     formatDate(protocol.date)],
    ['Ort',       protocol.location || '–'],
    ['Einladung', protocol.preparedBy || '–'],
  ]))

  // Agenda table
  out.push(sp())
  out.push(sp())
  out.push(sectionTitle('Tagesordnung'))

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      tc('Nr.',       8,  { bold: true, color: GRAY, allCaps: true, size: 16 }),
      tc('Thema',     47, { bold: true, color: GRAY, allCaps: true, size: 16 }),
      tc('Dauer',     14, { bold: true, color: GRAY, allCaps: true, size: 16, alignment: AlignmentType.RIGHT }),
      tc('Zuständig', 31, { bold: true, color: GRAY, allCaps: true, size: 16 }),
    ],
  })
  const bodyRows = agenda.map((item, i) => new TableRow({
    children: [
      tc(String(item.no || i + 1), 8, { bold: true, color: BRAND }),
      // Thema cell: topic + optional Unterlagen sub-line
      new TableCell({
        width:   { size: 47, type: WidthType.PERCENTAGE },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [
          para([run(item.topic || '–')]),
          ...(item.documents ? [para([run(`Unterlagen: ${item.documents}`, { size: 17, color: GRAY })])] : []),
        ],
      }),
      tc(item.duration ? `${item.duration} min` : '–', 14, { color: GRAY, alignment: AlignmentType.RIGHT }),
      tc(item.responsible || '–', 31, { color: GRAY }),
    ],
  }))
  const totalRow = totalMin > 0 ? [new TableRow({ children: [
    tc('', 8, {}),
    tc('Gesamt', 47, { color: GRAY }),
    tc(`${totalMin} min`, 14, { bold: true, color: BRAND, alignment: AlignmentType.RIGHT }),
    tc('', 31, {}),
  ]})] : []
  out.push(new Table({
    width:   { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
               insideHorizontal: THIN_BORDER, insideVertical: NO_BORDER },
    rows: [headerRow, ...bodyRows, ...totalRow],
  }))

  // Participants
  if (present.length > 0) {
    out.push(sp())
    out.push(para([
      run('Eingeladene Teilnehmer  ', { size: 17, color: GRAY, allCaps: true }),
      run(present.map(p => p.name).filter(Boolean).join(' · '), { color: DARK }),
    ], { spacing: { before: 120, after: 0 } }))
  }

  out.push(pageBreakPara())
  return out
}

function buildCoverPage(protocol, protocolNo) {
  const present  = (protocol.participants ?? []).filter(p => p.present)
  const absent   = (protocol.participants ?? []).filter(p => !p.present)
  const isClosed = !!protocol.isClosed

  const out = []

  out.push(para([run('Besprechungsprotokoll', { bold: true, size: 40, color: DARK })],
    { spacing: { before: 0, after: 80 } }))
  out.push(para([run(protocol.meetingType, { size: 28, color: BRAND })],
    { spacing: { before: 0, after: 40 } }))
  out.push(para([run(protocol.projectName || '', { size: 22, color: GRAY })],
    { spacing: { before: 0, after: 280 } }))

  out.push(metaTable([
    ['Protokoll-Nr.',      protocolNo],
    ['Datum',              formatDate(protocol.date)],
    ['Ort / Raum',         protocol.location || '–'],
    ['Erstellt von',       protocol.preparedBy || '–'],
    ...(isClosed ? [['Status', 'Abgeschlossen']] : []),
    ...(protocol.nextMeeting ? [['Nächste Besprechung', formatDate(protocol.nextMeeting)]] : []),
  ]))

  if ((protocol.participants ?? []).length > 0) {
    out.push(sp())
    out.push(sp())
    out.push(sectionTitle(
      `Teilnehmerliste (${present.length} anwesend${absent.length > 0 ? `, ${absent.length} entschuldigt` : ''})`
    ))
    out.push(dataTable(
      [
        { text: '#',        width: 5  },
        { text: 'Name',     width: 22 },
        { text: 'Firma',    width: 21 },
        { text: 'Funktion', width: 18 },
        { text: 'E-Mail',   width: 24 },
        { text: '✓',        width: 10, headerOpts: { alignment: AlignmentType.CENTER } },
      ],
      protocol.participants.map((p, i) => {
        const clr = p.present ? DARK : GRAY
        return [
          { text: String(i + 1), opts: { color: GRAY } },
          { text: p.name    || '–', opts: { bold: p.present, color: clr } },
          { text: p.company || '–', opts: { color: clr } },
          { text: p.role    || '–', opts: { color: clr } },
          { text: p.email   || '–', opts: { color: clr, size: 18 } },
          { text: p.present ? '✓' : '–', opts: { alignment: AlignmentType.CENTER, color: p.present ? GREEN : GRAY } },
        ]
      })
    ))
  }

  out.push(pageBreakPara())
  return out
}

function buildContent(protocol, protocolNo) {
  const items   = protocol.agendaItems ?? []
  const actions = protocol.actionItems ?? []
  const isClosed = !!protocol.isClosed

  const out = []

  // Running header line
  out.push(para([
    run(`${protocol.projectName} – ${protocol.meetingType}`, { bold: true, size: 19, color: DARK }),
    run(`   ${protocolNo}`, { size: 17, color: GRAY }),
  ], { spacing: { before: 0, after: 200 }, border: { bottom: THIN_BORDER } }))

  // Protocol items
  if (items.length > 0) {
    out.push(sectionTitle('Protokollpunkte'))
    for (const item of items) {
      const lvl    = item.level ?? 1
      const isGray = !!item.carriedGray
      const indent = (lvl - 1) * 360
      out.push(para([
        run(`${item.no}  `, { bold: true, color: isGray ? GRAY : BRAND, size: lvl === 1 ? 22 : 20 }),
        run(item.topic || '–', { bold: lvl === 1, color: isGray ? GRAY : DARK, size: lvl === 1 ? 22 : 20 }),
        ...(item.assignedTo ? [run(`   [${item.assignedTo}]`, { color: GRAY, size: 18 })] : []),
      ], {
        indent: { left: indent },
        spacing: { before: lvl === 1 ? 180 : 60, after: 40 },
      }))
      if (item.discussion?.trim()) {
        out.push(para([run(item.discussion, { color: isGray ? GRAY : '374151', size: 19 })], {
          indent: { left: indent + 200 },
          spacing: { before: 0, after: 40 },
        }))
      }
      // Per-item tasks
      const myTasks = actions.filter(t => t.protocolItemId === item.id)
      for (const task of myTasks) {
        const taskDone = task.status === 'erledigt'
        out.push(para([
          run(taskDone ? '✓ ' : '○ ', { color: taskDone ? GREEN : GRAY, size: 18 }),
          run(task.description || '–', { color: taskDone ? GRAY : DARK, size: 18 }),
          ...(task.responsible ? [run(`  [${task.responsible}]`, { color: GRAY, size: 17 })] : []),
        ], { indent: { left: indent + 360 }, spacing: { before: 20, after: 20 } }))
      }
    }
  }

  // Action items
  if (actions.length > 0) {
    out.push(sp())
    out.push(sectionTitle('Maßnahmen'))
    const STATUS_LABELS = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }
    const STATUS_COLORS = { offen: 'b45309', in_arbeit: '1d4ed8', erledigt: GREEN, verschoben: 'b91c1c' }
    out.push(dataTable(
      [
        { text: '#',        width: 5  },
        { text: 'Aufgabe',  width: 38 },
        { text: 'Zuständig',width: 19 },
        { text: 'Fällig',   width: 13 },
        { text: 'Status',   width: 14 },
        { text: 'Priorität',width: 11 },
      ],
      actions.map((a, i) => [
        { text: String(i + 1), opts: { color: GRAY } },
        a.task || '–',
        { text: a.assignedTo || '–', opts: { color: GRAY } },
        { text: a.dueDate ? formatDate(a.dueDate) : '–', opts: { color: GRAY } },
        { text: STATUS_LABELS[a.status] ?? a.status ?? '–', opts: { bold: true, color: STATUS_COLORS[a.status] ?? GRAY } },
        { text: a.priority ?? '–', opts: { color: GRAY } },
      ])
    ))
  }

  // Notes
  if (protocol.notes?.trim()) {
    out.push(sp())
    out.push(sectionTitle('Notizen'))
    out.push(para([run(protocol.notes, { size: 20, color: DARK })],
      { spacing: { before: 100, after: 0 } }))
  }

  // Footer line
  out.push(sp())
  out.push(para([
    run(`Erstellt: ${formatDate(protocol.date)}`, { size: 17, color: GRAY }),
    ...(protocol.preparedBy ? [run(`   · ${protocol.preparedBy}`, { size: 17, color: GRAY })] : []),
    ...(isClosed ? [run('   · Abgeschlossen', { size: 17, color: GRAY })] : []),
  ], { spacing: { before: 200, after: 0 }, border: { top: THIN_BORDER } }))

  return out
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function exportDocx(protocol, chainNo = null) {
  const protocolNo = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)
  const agenda     = protocol.agenda ?? []

  const children = [
    ...(agenda.length > 0 ? buildAgendaPage(protocol) : []),
    ...buildCoverPage(protocol, protocolNo),
    ...buildContent(protocol, protocolNo),
  ]

  const doc = new Document({
    creator:     'Komplizen Protokolle',
    title:       protocolNo,
    description: `${protocol.meetingType} – ${protocol.projectName}`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20, color: DARK } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1.0),
            bottom: convertInchesToTwip(0.8),
            left:   convertInchesToTwip(1.2),
            right:  convertInchesToTwip(1.2),
          },
        },
      },
      children,
    }],
  })

  const blob     = await Packer.toBlob(doc)
  const filename = `${protocolNo.replace(/[/\\:*?"<>|]/g, '-')}.docx`
  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  a.href         = url
  a.download     = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
