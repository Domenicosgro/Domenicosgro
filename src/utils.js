export const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID() } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export const today = () => new Date().toISOString().slice(0, 10)

export const formatDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export const MEETING_TYPES = ['Baubesprechung', 'Team-Besprechung', 'Projektbesprechung', 'Jour Fixe']

export const ACTION_STATUSES = [
  { value: 'offen',       label: 'Offen',       color: 'badge-yellow' },
  { value: 'in_arbeit',   label: 'In Arbeit',   color: 'badge-blue'   },
  { value: 'erledigt',    label: 'Erledigt',    color: 'badge-green'  },
  { value: 'verschoben',  label: 'Verschoben',  color: 'badge-red'    },
]

export const PRIORITIES = [
  { value: 'hoch',   label: 'Hoch',   color: 'badge-red'    },
  { value: 'mittel', label: 'Mittel', color: 'badge-yellow' },
  { value: 'niedrig',label: 'Niedrig',color: 'badge-gray'   },
]

export const statusBadge = (val) =>
  ACTION_STATUSES.find(s => s.value === val) ?? ACTION_STATUSES[0]

export const priorityBadge = (val) =>
  PRIORITIES.find(p => p.value === val) ?? PRIORITIES[1]

// Fixed abbreviations for known meeting types; custom types → initials or first 3 chars
const MEETING_TYPE_ABBREV = {
  'Baubesprechung':    'BB',
  'Team-Besprechung':  'TB',
  'Projektbesprechung':'PB',
  'Jour Fixe':         'JF',
  'Jour-Fix':          'JF',   // legacy alias
}
export const getMeetingAbbrev = (meetingType) => {
  if (!meetingType?.trim()) return ''
  const fixed = MEETING_TYPE_ABBREV[meetingType.trim()]
  if (fixed) return fixed
  const words = meetingType.trim().split(/[\s\-_]+/)
  if (words.length > 1) return words.map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 4)
  return meetingType.trim().slice(0, 3).toUpperCase()
}

// Returns the chain sequence number for a protocol (1-based).
// Returns null if the protocol is standalone (no predecessor and not referenced as one).
export const getChainNo = (protocol, allProtocols) => {
  const pool = allProtocols ?? []
  const hasPred = !!protocol.predecessorId
  const hasSucc = pool.some(p => p.predecessorId === protocol.id)
  if (!hasPred && !hasSucc) return null   // standalone → no prefix

  let depth = 1
  let pred = protocol.predecessorId ? pool.find(p => p.id === protocol.predecessorId) : null
  while (pred) {
    depth++
    pred = pred.predecessorId ? pool.find(p => p.id === pred.predecessorId) : null
    if (depth > 200) break  // safety guard against circular refs
  }
  return depth
}

// Auto-generate protocol number: ["N - "]["TYPE-"]"ProjektName_DD.MM.YYYY"
export const buildProtocolNo = (projectName, date, chainNo = null, meetingType = null) => {
  const name   = (projectName || '').trim().replace(/\s+/g, '-') || 'Protokoll'
  const d      = date ? formatDate(date) : formatDate(today())
  const prefix = chainNo !== null ? `${chainNo} - ` : ''
  const abbrev = meetingType?.trim() ? `${getMeetingAbbrev(meetingType)}-` : ''
  return `${prefix}${abbrev}${name}_${d}`
}

// ── HOAI-Konstanten ───────────────────────────────────────────────────────────

export const HOAI_LEISTUNGSBILDER = [
  { type: 'gebaeude',    label: 'Gebäude (§ 34)' },
  { type: 'freianlagen', label: 'Freianlagen (§ 39)' },
  { type: 'ingbauwerke', label: 'Ingenieurbauwerke (§ 43)' },
  { type: 'tragwerk',    label: 'Tragwerksplanung (§ 51)' },
  { type: 'tga',         label: 'Technische Ausrüstung (§ 55)' },
]

export const HOAI_PHASEN = {
  1: 'Grundlagenermittlung',
  2: 'Vorplanung',
  3: 'Entwurfsplanung',
  4: 'Genehmigungsplanung',
  5: 'Ausführungsplanung',
  6: 'Vorbereitung der Vergabe',
  7: 'Mitwirkung bei der Vergabe',
  8: 'Objektüberwachung (Bauüberwachung)',
  9: 'Objektbetreuung',
}

export const emptyHoaiService = (type = 'gebaeude') => ({
  id: uid(),
  type,
  label: HOAI_LEISTUNGSBILDER.find(l => l.type === type)?.label ?? type,
  phases: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
  activePhase: 1,
})

// Gesamtfortschritt eines Projekts (0–100)
export const calcProjectProgress = (hoaiServices = []) => {
  if (!hoaiServices.length) return 0
  const totals = hoaiServices.map(svc => {
    const vals = Object.values(svc.phases ?? {})
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  })
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)
}

// ── Factory functions ─────────────────────────────────────────────────────────

export const emptyContact = () => ({
  id: uid(),
  name: '',
  company: '',
  gewerk: '',
  role: '',
  email: '',
  phone: '',
  category: '',
})

export const emptyProject = () => ({
  id: uid(),
  name: '',
  contacts: [],
  passwordHash: null,        // legacy SHA-256 hex – null after migration to AES-GCM
  isEncrypted: false,
  encryptedContacts: null,   // base64 AES-GCM ciphertext
  cryptoSalt: null,          // base64 32-byte PBKDF2 salt (stable per password)
  cryptoIv: null,            // base64 12-byte AES-GCM IV (refreshed on every save)
  hoaiServices: [],          // HOAI-Leistungsbilder mit LPH-Fortschritt
  linkedFolders: [],         // verknüpfte Synology-Freigabe-Links
  tiles: [],                 // Schnellzugriff-Kacheln (gültig für alle Protokolle des Projekts)
  logo: '',                  // Büro-/Eigen-Logo (base64) – Fallback auf globales Logo
  clientLogo: '',            // Auftraggeber-Logo (base64)
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

// Hash a password with SHA-256 (Web Crypto API — works in Electron + browser)
export async function hashPassword(password) {
  const data   = new TextEncoder().encode(password)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Phasen & Notizen ─────────────────────────────────────────────────────────

export const PHASES = [
  { value: 'planung', label: 'Planungsphase', color: 'badge-blue'   },
  { value: 'bau',     label: 'Bauphase',      color: 'badge-yellow' },
]

export const phaseBadge = (val) => PHASES.find(p => p.value === val) ?? null

export const NOTE_TYPES = [
  { value: 'aktennotiz',   label: 'Aktennotiz',       color: 'badge-blue'   },
  { value: 'telefonnotiz', label: 'Telefonnotiz',      color: 'badge-yellow' },
  { value: 'besprochen',   label: 'Besprechungsnotiz', color: 'badge-green'  },
]

export const NOTE_TEMPLATES = [
  {
    id: 'tel',
    type: 'telefonnotiz',
    label: 'Telefonnotiz',
    subject: 'Telefonnotiz',
    content: '<p><strong>Gesprächspartner:</strong> </p><p><strong>Thema:</strong> </p><p><strong>Ergebnis:</strong> </p><p><strong>Weiteres Vorgehen:</strong> </p>',
  },
  {
    id: 'akte',
    type: 'aktennotiz',
    label: 'Aktennotiz',
    subject: 'Aktennotiz',
    content: '<p><strong>Betreff:</strong> </p><p><strong>Sachverhalt:</strong> </p><p><strong>Ergebnis / Beschluss:</strong> </p>',
  },
  {
    id: 'bespr',
    type: 'besprochen',
    label: 'Besprechungsnotiz',
    subject: 'Besprechungsnotiz',
    content: '<p><strong>Teilnehmer:</strong> </p><p><strong>Themen:</strong> </p><p><strong>Beschlüsse:</strong> </p><p><strong>Nächste Schritte:</strong> </p>',
  },
]

export const emptyNote = (projectId = null) => ({
  id: uid(),
  projectId,
  type: 'aktennotiz',
  date: today(),
  time: '',
  subject: '',
  content: '',
  linkedContactId: null,
  participants: [],          // Teilnehmer aus Kontakten: { id, name, company, email }
  sentAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export const emptyProtocol = () => ({
  id: uid(),
  meetingType: '',
  projectName: '',
  projectId: null,   // link to project database entry
  date: today(),
  time: '',
  location: '',
  nextMeeting: '',
  nextMeetingTime: '',
  preparedBy: '',
  notes: '',
  predecessorId: null,
  phase: null,           // 'planung' | 'bau' | null
  itemCarriedFrom: null, // Vorgänger-ID, dessen Protokollpunkte bereits auto-übernommen wurden
  isClosed: false,       // protocol is finalized / locked
  closedAt: null,
  participants: [],
  agenda: [],
  agendaSentAt: null,
  agendaGreeting: '',
  agendaItems: [],       // Protokollpunkte
  actionItems: [],
  tiles: [],             // Kacheln in der Sidebar (Dokument-/URL-Links)
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export const emptyParticipant = () => ({
  id: uid(),
  name: '',
  company: '',
  role: '',
  email: '',
  present: true,
  contactId: null,   // link to project contact (for sync detection)
})

// Pre-meeting agenda draft item
export const emptyAgendaDraftItem = () => ({
  id: uid(),
  no: '',
  topic: '',
  duration: '',
  responsible: '',
  documents: '',
  linkedProtocolItemId: null,  // links to an existing agendaItem.id (or null = create new)
})

// Builds the plain-text agenda body for the email
export const buildAgendaEmailBody = (protocol) => {
  const { projectName, meetingType, date, time, location, preparedBy, agenda, agendaGreeting, participants } = protocol
  const dateStr = date ? formatDate(date) : '–'
  const timeStr = time ? `${time} Uhr` : ''

  const lines = []

  lines.push(`Einladung zur ${meetingType}`)
  lines.push('='.repeat(50))
  lines.push('')
  lines.push(`Projekt:   ${projectName || '–'}`)
  lines.push(`Datum der Besprechung: ${dateStr}${timeStr ? '   ' + timeStr : ''}`)
  lines.push(`Ort:       ${location || '–'}`)
  if (preparedBy) lines.push(`Einladung: ${preparedBy}`)
  lines.push('')

  if (agendaGreeting) {
    lines.push(agendaGreeting)
    lines.push('')
  }

  lines.push('TAGESORDNUNG')
  lines.push('-'.repeat(50))

  const totalMinutes = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  // Level-1 protocol items without linkedFromAgendaId serve as section headers
  const sectionItems = (protocol.agendaItems ?? []).filter(
    it => it.topic && (it.level ?? 1) === 1 && !it.linkedFromAgendaId
  )

  if (sectionItems.length > 0) {
    // Structured view: section headers from agendaItems, sub-items from agenda[]
    sectionItems.forEach(si => {
      const label = `${si.no ? si.no + ' – ' : ''}${si.topic}`
      lines.push('')
      lines.push(`** ${label} **`)
      const linked = agenda.filter(a => a.linkedProtocolItemId === si.id)
      linked.forEach((item, i) => {
        const no          = item.no || String(i + 1)
        const topic       = item.topic       || '(kein Thema)'
        const dur         = item.duration    ? `${item.duration} min` : ''
        const responsible = item.responsible ? `  [${item.responsible}]` : ''
        lines.push(`  ${no.padEnd(4)} ${topic.padEnd(38)} ${dur.padStart(7)}${responsible}`)
        if (item.documents) lines.push(`       Unterlagen: ${item.documents}`)
      })
    })
    // Unlinked agenda items (not under any section)
    const linkedIds = new Set(sectionItems.map(si => si.id))
    const unlinked = agenda.filter(a => !a.linkedProtocolItemId || !linkedIds.has(a.linkedProtocolItemId))
    unlinked.forEach((item, i) => {
      const no          = item.no || String(i + 1)
      const topic       = item.topic       || '(kein Thema)'
      const dur         = item.duration    ? `${item.duration} min` : ''
      const responsible = item.responsible ? `  [${item.responsible}]` : ''
      lines.push(`${no.padEnd(4)} ${topic.padEnd(40)} ${dur.padStart(7)}${responsible}`)
      if (item.documents) lines.push(`     Unterlagen: ${item.documents}`)
    })
  } else {
    agenda.forEach((item, i) => {
      const no          = item.no || String(i + 1)
      const topic       = item.topic       || '(kein Thema)'
      const dur         = item.duration    ? `${item.duration} min` : ''
      const responsible = item.responsible ? `  [${item.responsible}]` : ''
      lines.push(`${no.padEnd(4)} ${topic.padEnd(40)} ${dur.padStart(7)}${responsible}`)
      if (item.documents) lines.push(`     Unterlagen: ${item.documents}`)
    })
  }

  if (agenda.length === 0 && sectionItems.length === 0) lines.push('(keine Tagesordnungspunkte erfasst)')

  lines.push('-'.repeat(50))
  if (totalMinutes > 0) lines.push(`     Geplante Dauer gesamt: ca. ${totalMinutes} min`)
  lines.push('')

  const attending = (participants || []).filter(p => p.present).map(p => p.name).filter(Boolean)
  if (attending.length > 0) {
    lines.push(`Teilnehmer: ${attending.join(', ')}`)
    lines.push('')
  }

  lines.push('Mit freundlichen Grüßen')
  if (preparedBy) lines.push(preparedBy)

  return lines.join('\n')
}

// level: 1 = Hauptpunkt, 2 = Unterpunkt, 3 = Unter-Unterpunkt
// status: 'offen' | 'erledigt'
// carriedGray: true  → item was erledigt in direct predecessor (show gray)
//              false → normal carry or new item
// Items with carriedGray=true AND status='erledigt' are NOT carried to the next protocol
export const emptyAgendaItem = (level = 1) => ({
  id: uid(),
  no: '',
  topic: '',
  discussion: '',
  result: '',
  level,
  status: 'offen',
  assignedTo: '',
  carriedGray: false,
  carriedFromId: null,
  createdAt: new Date().toISOString(),
  attachment: null,   // { name, mimeType, data (base64), size }
})

export const emptyActionItem = () => ({
  id: uid(),
  no: '',
  description: '',
  responsible: '',
  deadline: '',
  status: 'offen',
  priority: 'mittel',
  remarks: '',
  carriedFromId: null,
  completedAt: null,
  protocolItemId: null,   // links to an agendaItem.id when added from within a protocol point
})

export const emptyTile = (color = 'night') => ({
  id: uid(),
  label: '',
  kind: 'url',   // 'folder' | 'url' | 'doc'
  url: '',
  color,         // 'night' | 'sky' | 'concrete'
})
