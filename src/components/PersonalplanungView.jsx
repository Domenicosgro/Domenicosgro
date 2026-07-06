import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Loader, AlertCircle, X,
         CalendarClock, Printer } from 'lucide-react'
import { uid } from '../utils'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

const DAYS = [
  { key: 'mo', label: 'Montag' }, { key: 'di', label: 'Dienstag' }, { key: 'mi', label: 'Mittwoch' },
  { key: 'do', label: 'Donnerstag' }, { key: 'fr', label: 'Freitag' },
]

// ISO-Kalenderwoche: 'JJJJ-WNN' + Montag der Woche
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
function mondayOf(date) {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
const fmtShort = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

export default function PersonalplanungView({ projects, serverUser, onBack }) {
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [rows,   setRows]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const saveTimer = useRef(null)
  const week = isoWeek(monday)
  const lsKey = `kp_staffplan_${week}`

  // Woche laden
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (isServer) {
        const res = await fetch(`/api/staff-plan/${week}`, { headers: authHeaders() })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        const doc = await res.json()
        setRows(doc.rows || [])
      } else {
        setRows(JSON.parse(localStorage.getItem(lsKey) || '[]'))
      }
    } catch (e) { setError(`Laden fehlgeschlagen: ${e.message}`) }
    finally { setLoading(false) }
  }, [week])

  useEffect(() => { load() }, [load])

  // Debounced speichern
  const persist = useCallback((nextRows) => {
    setRows(nextRows)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        if (isServer) {
          setSaving(true)
          const res = await fetch(`/api/staff-plan/${week}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ rows: nextRows }),
          })
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        } else {
          localStorage.setItem(lsKey, JSON.stringify(nextRows))
        }
      } catch (e) { setError(`Speichern fehlgeschlagen: ${e.message}`) }
      finally { setSaving(false) }
    }, 600)
  }, [week, lsKey])

  const addRow = () => persist([...rows, { id: uid(), name: '', days: {} }])
  const removeRow = (id) => persist(rows.filter(r => r.id !== id))
  const setName = (id, name) => persist(rows.map(r => r.id === id ? { ...r, name } : r))
  const setDay = (id, day, value) => persist(rows.map(r => r.id === id ? { ...r, days: { ...r.days, [day]: value } } : r))

  const activeProjects = (projects || []).filter(p => !p.isArchived)

  return (
    <div className="app-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button className="btn-secondary no-print" onClick={onBack}><ArrowLeft size={16} /> Start</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <CalendarClock size={22} className="text-brand-600" /> Personalplanung
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Wocheneinsatz je Mitarbeiter · KW {week.split('-W')[1]} ({fmtShort(monday)} – {fmtShort(addDays(monday, 4))})
              {saving && <span className="ml-2 text-gray-400"><Loader size={11} className="inline animate-spin" /> speichert…</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 no-print">
          <button className="btn-secondary" onClick={() => window.print()}><Printer size={15} /></button>
          <button className="btn-secondary" onClick={() => setMonday(m => addDays(m, -7))}><ChevronLeft size={15} /> Vorwoche</button>
          <button className="btn-secondary" onClick={() => setMonday(mondayOf(new Date()))}>Heute</button>
          <button className="btn-secondary" onClick={() => setMonday(m => addDays(m, 7))}>Folgewoche <ChevronRight size={15} /></button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      <datalist id="staffplan-projects">
        {activeProjects.map(p => <option key={p.id} value={p.name || ''} />)}
        <option value="Urlaub" /><option value="Krank" /><option value="Büro" />
      </datalist>

      {loading ? (
        <div className="card p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Mitarbeiter</th>
                {DAYS.map((d, i) => (
                  <th key={d.key} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {d.label}<span className="block font-normal normal-case text-gray-400">{fmtShort(addDays(monday, i))}</span>
                  </th>
                ))}
                <th className="w-10 no-print" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                  <td className="px-3 py-1.5">
                    <input className="input py-1 text-sm font-medium w-full" placeholder="Name…"
                      value={row.name} onChange={e => setName(row.id, e.target.value)} />
                  </td>
                  {DAYS.map(d => (
                    <td key={d.key} className="px-2 py-1.5">
                      <input className="input py-1 text-xs w-full" placeholder="–" list="staffplan-projects"
                        value={row.days?.[d.key] || ''} onChange={e => setDay(row.id, d.key, e.target.value)} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 no-print">
                    <button className="btn-ghost p-1 text-gray-300 hover:text-red-500" title="Zeile entfernen"
                      onClick={() => removeRow(row.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  Noch keine Mitarbeiter für diese Woche eingeplant.
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-gray-100 no-print">
            <button className="btn-secondary text-xs" onClick={addRow}><Plus size={13} /> Mitarbeiter hinzufügen</button>
            <span className="text-xs text-gray-400 ml-3">Projektnamen werden automatisch vorgeschlagen · zusätzlich „Urlaub", „Krank", „Büro"</span>
          </div>
        </div>
      )}
    </div>
  )
}
