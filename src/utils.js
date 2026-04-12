export const uid = () => Math.random().toString(36).slice(2, 9)

export const today = () => new Date().toISOString().slice(0, 10)

export const formatDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export const MEETING_TYPES = ['Baubesprechung', 'Team-Besprechung', 'Projektbesprechung']

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

// Auto-generate protocol number: ["N - "]"ProjektName_DD.MM.YYYY"
// chainNo is computed via getChainNo() and is optional.
export const buildProtocolNo = (projectName, date, chainNo = null) => {
  const name = (projectName || '').trim().replace(/\s+/g, '-') || 'Protokoll'
  const d = date ? formatDate(date) : formatDate(today())
  const prefix = chainNo !== null ? `${chainNo} - ` : ''
  return `${prefix}${name}_${d}`
}

export const emptyContact = () => ({
  id: uid(),
  name: '',
  company: '',
  role: '',
  email: '',
  phone: '',
})

export const emptyProject = () => ({
  id: uid(),
  name: '',
  contacts: [],
  passwordHash: null,   // SHA-256 hex of password; null = no protection
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

export const emptyProtocol = () => ({
  id: uid(),
  meetingType: 'Baubesprechung',
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
  isClosed: false,       // protocol is finalized / locked
  closedAt: null,
  participants: [],
  agenda: [],
  agendaSentAt: null,
  agendaGreeting: '',
  agendaItems: [],       // Protokollpunkte
  actionItems: [],
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
  const { projectName, meetingType, date, location, preparedBy, agenda, agendaGreeting, participants } = protocol
  const dateStr = date ? formatDate(date) : '–'

  const lines = []

  lines.push(`Einladung zur ${meetingType}`)
  lines.push('='.repeat(50))
  lines.push('')
  lines.push(`Projekt:   ${projectName || '–'}`)
  lines.push(`Datum:     ${dateStr}`)
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

  agenda.forEach((item, i) => {
    const no          = item.no || String(i + 1)
    const topic       = item.topic       || '(kein Thema)'
    const dur         = item.duration    ? `${item.duration} min` : ''
    const responsible = item.responsible ? `  [${item.responsible}]` : ''
    lines.push(`${no.padEnd(4)} ${topic.padEnd(40)} ${dur.padStart(7)}${responsible}`)
    if (item.documents) lines.push(`     Unterlagen: ${item.documents}`)
  })

  if (agenda.length === 0) lines.push('(keine Tagesordnungspunkte erfasst)')

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
})
