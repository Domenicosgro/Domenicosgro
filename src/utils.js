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

export const emptyProtocol = () => ({
  id: uid(),
  meetingType: 'Baubesprechung',
  projectName: '',
  protocolNo: '',
  date: today(),
  time: '',
  location: '',
  nextMeeting: '',
  nextMeetingTime: '',
  preparedBy: '',
  notes: '',
  predecessorId: null,   // ID of the previous meeting (for carryover)
  participants: [],
  agendaItems: [],
  actionItems: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export const emptyParticipant = () => ({
  id: uid(),
  name: '',
  company: '',
  role: '',
  present: true,
})

// level: 1 = Hauptpunkt, 2 = Unterpunkt, 3 = Unter-Unterpunkt
export const emptyAgendaItem = (level = 1) => ({
  id: uid(),
  no: '',
  topic: '',
  discussion: '',
  result: '',
  level,
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
  carriedFromId: null,   // source protocol ID if carried over from a previous meeting
  completedAt: null,     // ISO timestamp when status was set to 'erledigt'
})
