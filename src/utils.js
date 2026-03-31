export const uid = () => Math.random().toString(36).slice(2, 9)

export const today = () => new Date().toISOString().slice(0, 10)

export const formatDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export const MEETING_TYPES = ['Baubesprechung', 'Jour Fixe', 'Projektbesprechung', 'Abnahme', 'Sonstige']

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

// Auto-generate protocol number: "ProjektName_DD.MM.YYYY"
export const buildProtocolNo = (projectName, date) => {
  const name = (projectName || '').trim().replace(/\s+/g, '-') || 'Protokoll'
  const d = date ? formatDate(date) : formatDate(today())
  return `${name}_${d}`
}

export const emptyProtocol = () => ({
  id: uid(),
  meetingType: 'Baubesprechung',
  projectName: '',
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
  const { projectName, meetingType, date, time, location, preparedBy, agenda, agendaGreeting, participants } = protocol
  const dateStr = date ? formatDate(date) : '–'
  const timeStr = time ? `${time} Uhr` : '–'

  const lines = []

  lines.push(`Einladung zur ${meetingType}`)
  lines.push('='.repeat(50))
  lines.push('')
  lines.push(`Projekt:   ${projectName || '–'}`)
  lines.push(`Datum:     ${dateStr}`)
  lines.push(`Uhrzeit:   ${timeStr}`)
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
  assignedTo: '',       // person or company responsible for this point
  carriedGray: false,
  carriedFromId: null,
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
