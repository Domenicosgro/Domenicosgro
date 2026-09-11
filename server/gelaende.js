'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Gelaende-Darstellung der Personalplanung  (Muster: "Daten als begehbare
// Plattform", Komplizen-Dashboard, docs/MUSTER_GELAENDE-DARSTELLUNG.md)
//
// Diese Datei liefert ausschliesslich DATEN - eine flache Liste aus Projekten,
// Personen und Agentenmeldungen fuer genau eine Kalenderwoche. Platzierung auf
// dem Wabenraster, Farbfamilien und Bauformen entstehen im Frontend
// (src/gelaende/). Damit bleibt jede Schicht datengetrieben: ein neues Projekt
// oder eine neue Person erscheint ohne jede Konfiguration auf der Karte.
//
// Zustandsabbildung (Muster 5.1):
//   nichts beauftragt                      -> 'idee'      Hologramm
//   beauftragt, diese Woche niemand drauf   -> 'fundament' Fundamentplatte
//   diese Woche eingeplant                  -> 'rohbau'    Rohbau mit Kran
//   beauftragt, zuletzt bearbeitet, jetzt   -> 'fertig'    fertiges Gebaeude
//   nicht mehr eingeplant
// ─────────────────────────────────────────────────────────────────────────────

const DAY_KEYS = ['mo', 'di', 'mi', 'do', 'fr']

// Abwesenheiten/Interna sind im Plan normale "Projekt"-IDs (siehe
// PersonalplanungView ABSENCE) - hier bekommen sie ihre Gelaende-Rolle.
const ABSENCE = [
  { id: 'urlaub', name: 'Urlaub',        kind: 'absence', form: 'strand' },
  { id: 'krank',  name: 'Krank',         kind: 'absence', form: 'heim'   },
  { id: 'buero',  name: 'Büro / intern', kind: 'service', form: 'buero'  },
]
const ABSENCE_IDS = ABSENCE.map(a => a.id)

// Verfuegbare Tage je Mitarbeiter/Wochentag aus dem Arbeitszeitmodell
// (identisch zu capDays() in PersonalplanungView: 8 h = 1 Tag, Viertelschritte)
const capDays = (member, dayKey) => Math.round(((member?.dayHours?.[dayKey] || 0) / 8) * 4) / 4
const capWeek = (member) => DAY_KEYS.reduce((s, k) => s + capDays(member, k), 0)
const round2  = (n) => Math.round(n * 100) / 100

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`
}

// Montag einer ISO-Woche ("2026-W38" -> Date). Gibt null bei ungueltiger Woche.
function mondayOfIsoWeek(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(week || ''))
  if (!m) return null
  const jan4 = new Date(Date.UTC(+m[1], 0, 4))
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (+m[2] - 1) * 7)
  return monday
}
const addDays = (date, n) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + n); return d }
const weekOffset = (week, n) => {
  const mon = mondayOfIsoWeek(week)
  if (!mon) return week
  const d = addDays(mon, n * 7)
  return isoWeekOf(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
const fmtTage = (n) => String(round2(n)).replace('.', ',')

function planSettings(db) {
  try { return JSON.parse(db.appState.get('staff_plan_settings') || '{}') } catch { return {} }
}

// Beauftragungsgrad aus den Projektdaten (Vorleistungen + HOAI-Leistungsphasen)
function auftrag(project) {
  const d = project.projectData || {}
  const lph = Object.entries(d.lph || {}).filter(([, v]) => v?.beauftragt).map(([k]) => parseInt(k, 10)).filter(Number.isFinite)
  const pre = Object.entries(d.preLeistungen || {}).filter(([, v]) => v?.beauftragt).map(([k]) => k)
  return { lph: lph.sort((a, b) => a - b), pre, beauftragt: lph.length > 0 || pre.length > 0 }
}

// Soll-Besetzung einer Woche aus dem Projektteam: Summe(Anteil x Kapazitaet)
function sollDaysFor(project, staff) {
  const team = project.team || []
  if (team.length === 0) return 0
  let soll = 0
  for (const s of staff) {
    const m = team.find(x => x.name === s.name
      || (x.email && s.email && x.email.toLowerCase() === s.email.toLowerCase()))
    if (m) soll += (m.anteil ?? 1) * capWeek(s)
  }
  return round2(soll)
}

/**
 * Gelaende-Daten einer Kalenderwoche.
 * @param {object} db      Store aus server/db.js
 * @param {string} week    ISO-Woche "YYYY-Www"
 * @returns {object}       { week, monday, days, projects[], people[], totals }
 */
function buildGelaende(db, week) {
  const monday = mondayOfIsoWeek(week)
  if (!monday) throw new Error('Ungültige Woche.')

  const settings   = planSettings(db)
  const hidden     = new Set(settings.hiddenProjects || [])
  const services   = Array.isArray(settings.services) ? settings.services : []
  const orderIdx   = new Map((settings.projectOrder || []).map((id, i) => [id, i]))
  const staff      = db.staffMembers.list().filter(s => s.active !== false)
  const plan       = db.staffPlan.get(week) || {}
  const assignments = Array.isArray(plan.assignments) ? plan.assignments : []

  // Vorwochen nur fuer den Bauzustand ("wurde hier zuletzt gearbeitet?")
  const workedBefore = new Set()
  for (let back = 1; back <= 4; back++) {
    const doc = db.staffPlan.get(weekOffset(week, -back)) || {}
    for (const a of (doc.assignments || [])) {
      if (DAY_KEYS.some(k => (a.days?.[k] || 0) > 0)) workedBefore.add(a.projectId)
    }
  }

  // ── Tagessummen je Projekt und je Person ──────────────────────────────────
  const daysOf = (a) => DAY_KEYS.reduce((s, k) => s + (a.days?.[k] || 0), 0)
  const perProject = new Map()   // projectId -> { days, staffIds:Set, byDay:{} }
  const perPerson  = new Map()   // staffId   -> { days, byProject:Map }
  for (const a of assignments) {
    const total = daysOf(a)
    if (total <= 0) continue
    if (!perProject.has(a.projectId)) perProject.set(a.projectId, { days: 0, staffIds: new Set(), byDay: {} })
    const p = perProject.get(a.projectId)
    p.days = round2(p.days + total)
    p.staffIds.add(a.staffId)
    for (const k of DAY_KEYS) p.byDay[k] = round2((p.byDay[k] || 0) + (a.days?.[k] || 0))

    if (!perPerson.has(a.staffId)) perPerson.set(a.staffId, { days: 0, byProject: new Map() })
    const q = perPerson.get(a.staffId)
    q.days = round2(q.days + total)
    q.byProject.set(a.projectId, round2((q.byProject.get(a.projectId) || 0) + total))
  }

  // ── Objekte: Projekte, Zusatz-Leistungen, Abwesenheiten ───────────────────
  const projectRows = db.projects.list()
    .filter(p => !p.isArchived && !hidden.has(p.id))
    .sort((a, b) => {
      const na = parseInt(a.projectData?.nummer, 10) || 99999
      const nb = parseInt(b.projectData?.nummer, 10) || 99999
      if (na !== nb) return na - nb
      const ia = orderIdx.has(a.id) ? orderIdx.get(a.id) : Infinity
      const ib = orderIdx.has(b.id) ? orderIdx.get(b.id) : Infinity
      if (ia !== ib) return ia - ib
      return (a.name || '').localeCompare(b.name || '', 'de')
    })

  const projects = []
  for (const p of projectRows) {
    const stat = perProject.get(p.id) || { days: 0, staffIds: new Set(), byDay: {} }
    const a    = auftrag(p)
    const soll = sollDaysFor(p, staff)
    const d    = p.projectData || {}

    let state = 'idee'
    if (a.beauftragt) {
      if (stat.days > 0) state = 'rohbau'
      else if (workedBefore.has(p.id)) state = 'fertig'
      else state = 'fundament'
    }

    let saturation = 'ok'
    if (soll > 0 && state !== 'idee') {
      if (stat.days > soll * 1.15) saturation = 'ueber'
      else if (stat.days < soll * 0.75) saturation = 'unter'
    }

    const lphLabel = a.lph.length > 0 ? `LPH ${a.lph.join(', ')}` : (a.pre.length > 0 ? 'Vorleistungen' : 'nicht beauftragt')
    const says = []
    if (stat.days > 0) says.push(`${fmtTage(stat.days)} Personentage, ${stat.staffIds.size} ${stat.staffIds.size === 1 ? 'Kopf' : 'Köpfe'}`)
    if (saturation === 'unter') says.push(`Soll ${fmtTage(soll)} Tage – ${fmtTage(soll - stat.days)} fehlen`)
    if (saturation === 'ueber') says.push(`${fmtTage(stat.days - soll)} Tage über Soll`)
    if (state === 'fundament') says.push('Beauftragt, diese Woche niemand eingeplant')
    if (state === 'idee')      says.push('Akquise – noch nicht beauftragt')
    if (state === 'fertig')    says.push('Zuletzt bearbeitet, diese Woche frei')

    projects.push({
      id: p.id,
      kind: 'project',
      name: p.name || 'Unbenannt',
      short: (d.nummer && d.kuerzel) ? `${d.nummer} ${d.kuerzel}` : (p.name || 'Unbenannt'),
      nummer: d.nummer || '',
      gesellschaft: d.gesellschaft || '',
      lphLabel,
      state,
      saturation,
      personDays: round2(stat.days),
      headcount: stat.staffIds.size,
      sollDays: soll,
      teamSize: (p.team || []).length,
      byDay: stat.byDay,
      hex: (d.hex && Number.isFinite(d.hex.q) && Number.isFinite(d.hex.r)) ? { q: d.hex.q, r: d.hex.r } : null,
      color: d.color || null,
      agentSays: says,
    })
  }

  // Zusatz-Leistungen (nicht projektgebunden) - eigenes Quartier, Laborform
  for (const s of services) {
    const stat = perProject.get(s.id) || { days: 0, staffIds: new Set(), byDay: {} }
    projects.push({
      id: s.id, kind: 'service', name: s.name || 'Leistung', short: s.name || 'Leistung',
      state: 'labor', saturation: 'ok',
      personDays: round2(stat.days), headcount: stat.staffIds.size, sollDays: 0, teamSize: 0,
      byDay: stat.byDay, hex: null, color: null,
      agentSays: stat.days > 0 ? [`${fmtTage(stat.days)} Personentage`] : ['Diese Woche nicht belegt'],
    })
  }

  // Abwesenheiten / Interna
  for (const abs of ABSENCE) {
    const stat = perProject.get(abs.id) || { days: 0, staffIds: new Set(), byDay: {} }
    projects.push({
      id: abs.id, kind: abs.kind, form: abs.form, name: abs.name, short: abs.name,
      state: abs.id === 'buero' ? 'buero' : abs.id, saturation: 'ok',
      personDays: round2(stat.days), headcount: stat.staffIds.size, sollDays: 0, teamSize: 0,
      byDay: stat.byDay, hex: null, color: null,
      agentSays: stat.days > 0 ? [`${fmtTage(stat.days)} Tage`] : [],
    })
  }

  const nameOf = new Map(projects.map(p => [p.id, p.name]))

  // ── Figuren: Mitarbeitende mit Identitaet ─────────────────────────────────
  const people = staff.map(s => {
    const q  = perPerson.get(s.id) || { days: 0, byProject: new Map() }
    const cap = round2(capWeek(s))
    const targets = [...q.byProject.entries()]
      .map(([projectId, days]) => ({ projectId, name: nameOf.get(projectId) || projectId, days: round2(days) }))
      .sort((x, y) => y.days - x.days)
    const absence = ABSENCE_IDS.find(id => (q.byProject.get(id) || 0) > 0
      && (q.byProject.get(id) || 0) >= Math.max(...targets.map(t => t.days), 0)) || null
    const projectDays = round2(targets.filter(t => !ABSENCE_IDS.includes(t.projectId)).reduce((a, t) => a + t.days, 0))
    return {
      id: s.id,
      name: s.name || '?',
      funktion: s.funktion || '',
      capacityDays: cap,
      plannedDays: round2(q.days),
      projectDays,
      loadPct: cap > 0 ? Math.round((q.days / cap) * 100) : 0,
      absence,                                   // 'urlaub' | 'krank' | null
      targets,                                   // [{ projectId, name, days }]
      mainProjectId: targets[0]?.projectId || null,
      free: q.days === 0,                        // ohne Zuteilung -> an den Brunnen
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'))

  const totals = {
    capacityDays: round2(people.reduce((s, p) => s + p.capacityDays, 0)),
    plannedDays:  round2(people.reduce((s, p) => s + p.plannedDays, 0)),
    projectDays:  round2(people.reduce((s, p) => s + p.projectDays, 0)),
    freePeople:   people.filter(p => p.free).length,
    absentPeople: people.filter(p => p.absence).length,
  }
  totals.loadPct = totals.capacityDays > 0 ? Math.round((totals.plannedDays / totals.capacityDays) * 100) : 0

  const mon = monday
  return {
    week,
    weekLabel: `KW ${week.split('-W')[1]}`,
    monday: mon.toISOString().slice(0, 10),
    days: DAY_KEYS.map((key, i) => ({ key, date: addDays(mon, i).toISOString().slice(0, 10) })),
    projects,
    people,
    totals,
    updatedAt: plan.updatedAt || null,
  }
}

module.exports = { buildGelaende, isoWeekOf, mondayOfIsoWeek, weekOffset, DAY_KEYS }
