import React, { useState, useMemo } from 'react'
import { ArrowLeft, AlertTriangle, CheckSquare, Filter, X, Lock, BarChart2 } from 'lucide-react'
import { ACTION_STATUSES, PRIORITIES, formatDate, buildProtocolNo, getChainNo,
         statusBadge, priorityBadge } from '../utils'

const todayStr = () => new Date().toISOString().slice(0, 10)

function calcOverdue(item) {
  return !!(item.deadline && item.status !== 'erledigt' && item.deadline < todayStr())
}

export default function MassnahmenDashboard({ protocols, projects, onOpenProtocol, onBack }) {
  const [filterProject,     setFilterProject]     = useState('')
  const [filterStatus,      setFilterStatus]      = useState('')
  const [filterResponsible, setFilterResponsible] = useState('')
  const [onlyOpen,          setOnlyOpen]          = useState(false)
  const [onlyOverdue,       setOnlyOverdue]       = useState(false)

  // Flat list of all action items enriched with protocol/project context
  const allItems = useMemo(() => {
    const items = []
    for (const protocol of protocols) {
      const project    = projects.find(p => p.id === protocol.projectId) ?? null
      const chainNo    = getChainNo(protocol, protocols)
      const protocolNo = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)
      for (const item of (protocol.actionItems ?? [])) {
        items.push({
          ...item,
          _protocolId:    protocol.id,
          _protocolNo:    protocolNo,
          _protocolDate:  protocol.date,
          _projectId:     protocol.projectId,
          _projectName:   protocol.projectName,
          _projectLocked: project !== null && !project.isUnlocked,
        })
      }
    }
    // Sort: overdue first, then deadline asc (no deadline last), then protocol date desc
    items.sort((a, b) => {
      const ao = calcOverdue(a) ? 0 : 1
      const bo = calcOverdue(b) ? 0 : 1
      if (ao !== bo) return ao - bo
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (a.deadline)  return -1
      if (b.deadline)  return  1
      return (b._protocolDate ?? '').localeCompare(a._protocolDate ?? '')
    })
    return items
  }, [protocols, projects])

  // Apply filters
  const visible = useMemo(() => allItems.filter(item => {
    if (filterProject     && item._projectId !== filterProject)  return false
    if (filterStatus      && item.status !== filterStatus)        return false
    if (filterResponsible && !item.responsible.toLowerCase().includes(filterResponsible.toLowerCase())) return false
    if (onlyOpen    && item.status !== 'offen' && item.status !== 'in_arbeit') return false
    if (onlyOverdue && !calcOverdue(item))                        return false
    return true
  }), [allItems, filterProject, filterStatus, filterResponsible, onlyOpen, onlyOverdue])

  const totalOverdue = allItems.filter(calcOverdue).length
  const totalOpen    = allItems.filter(i => i.status === 'offen' || i.status === 'in_arbeit').length
  const hasFilters   = filterProject || filterStatus || filterResponsible || onlyOpen || onlyOverdue

  // Unique projects for dropdown
  const projectOptions = useMemo(() => {
    const seen = new Set()
    const opts = []
    for (const item of allItems) {
      if (item._projectId && !seen.has(item._projectId)) {
        seen.add(item._projectId)
        opts.push({ id: item._projectId, name: item._projectName || 'Unbenannt' })
      }
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name))
  }, [allItems])

  const clearFilters = () => {
    setFilterProject(''); setFilterStatus(''); setFilterResponsible('')
    setOnlyOpen(false); setOnlyOverdue(false)
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button className="btn-ghost p-2" onClick={onBack} title="Zurück zur Startseite">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={20} className="text-brand-600" />
            Maßnahmen-Dashboard
          </h1>
          <p className="text-xs text-gray-400">Alle Maßnahmen projekt- und protokollübergreifend</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="badge bg-gray-100 text-gray-700 text-xs">{allItems.length} Maßnahmen gesamt</span>
        {totalOpen    > 0 && <span className="badge-yellow text-xs">{totalOpen} offen</span>}
        {totalOverdue > 0 && <span className="badge-red text-xs">{totalOverdue} überfällig</span>}
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
          <Filter size={13} />
          Filter
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="select text-sm"
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
          >
            <option value="">Alle Projekte</option>
            {projectOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            className="select text-sm"
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); if (e.target.value) setOnlyOpen(false) }}
          >
            <option value="">Alle Status</option>
            {ACTION_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <input
            className="input text-sm w-40"
            placeholder="Zuständig…"
            value={filterResponsible}
            onChange={e => setFilterResponsible(e.target.value)}
          />

          <button
            className={`btn text-xs px-3 py-1.5 ${onlyOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setOnlyOpen(v => !v); if (!onlyOpen) setFilterStatus('') }}
          >
            <CheckSquare size={12} /> Nur offene
          </button>

          <button
            className={`btn text-xs px-3 py-1.5 ${onlyOverdue ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => setOnlyOverdue(v => !v)}
          >
            <AlertTriangle size={12} /> Nur überfällige
          </button>

          {hasFilters && (
            <button className="btn-ghost text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              onClick={clearFilters}>
              <X size={12} /> Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div className="card p-12 text-center text-gray-400 text-sm">
          {allItems.length === 0
            ? 'Noch keine Maßnahmen in keinem Protokoll erfasst.'
            : 'Keine Maßnahmen entsprechen den gewählten Filtern.'
          }
        </div>
      )}

      {/* Table */}
      {visible.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Projekt</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Protokoll</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nr</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Beschreibung</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Zuständig</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Frist</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priorität</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item, idx) => {
                const ovr   = calcOverdue(item)
                const done  = item.status === 'erledigt'
                const sb    = statusBadge(item.status)
                const pb    = priorityBadge(item.priority)
                const rowBg = ovr  ? 'bg-red-50 hover:bg-red-100'
                            : done ? 'bg-green-50/60 hover:bg-green-100/60'
                            : idx % 2 === 0 ? 'bg-white hover:bg-brand-50'
                            : 'bg-gray-50/40 hover:bg-brand-50'

                return (
                  <tr
                    key={`${item._protocolId}-${item.id}`}
                    className={`${rowBg} cursor-pointer border-b border-gray-100 transition-colors`}
                    onClick={() => onOpenProtocol(item._protocolId)}
                    title="Protokoll öffnen"
                  >
                    {/* Projekt */}
                    <td className="px-4 py-2.5 text-xs max-w-[120px]">
                      {item._projectLocked
                        ? <span className="flex items-center gap-1 text-amber-600"><Lock size={10} /> Gesperrt</span>
                        : <span className="font-medium text-gray-700 truncate block">{item._projectName || '–'}</span>
                      }
                    </td>

                    {/* Protokoll */}
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[150px]">
                      <span className="truncate block" title={item._protocolNo}>{item._protocolNo}</span>
                    </td>

                    {/* Nr */}
                    <td className="px-3 py-2.5 text-center text-xs font-bold text-brand-700">{item.no}</td>

                    {/* Beschreibung + Bemerkungen */}
                    <td className="px-4 py-2.5 max-w-xs">
                      <span className={`block font-medium ${done ? 'line-through text-gray-400' : ovr ? 'text-red-700' : 'text-gray-800'}`}>
                        {item.description || <span className="italic text-gray-400">–</span>}
                      </span>
                      {item.remarks && (
                        <span className="block text-xs text-gray-400 truncate mt-0.5">{item.remarks}</span>
                      )}
                    </td>

                    {/* Zuständig */}
                    <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                      {item.responsible || '–'}
                    </td>

                    {/* Frist */}
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {item.deadline ? (
                        <span className={ovr ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                          {formatDate(item.deadline)}
                          {ovr && <span className="ml-1 inline-flex items-center"><AlertTriangle size={11} className="text-red-500" /></span>}
                        </span>
                      ) : <span className="text-gray-400">–</span>}
                    </td>

                    {/* Priorität */}
                    <td className="px-4 py-2.5">
                      <span className={`badge text-xs ${pb.color}`}>{pb.label}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <span className={`badge text-xs ${sb.color}`}>{sb.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 bg-gray-50/50">
            {visible.length} von {allItems.length} Maßnahmen angezeigt · Klick auf eine Zeile öffnet das Protokoll
          </div>
        </div>
      )}
    </div>
  )
}
