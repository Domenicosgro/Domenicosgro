import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X, FileText, CheckSquare, NotebookPen, Users, FolderOpen, ChevronRight } from 'lucide-react'
import { formatDate, buildProtocolNo, getChainNo } from '../utils'

const strip = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

function snippet(text, q, len = 90) {
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return text.slice(0, len)
  const start = Math.max(0, idx - 30)
  return (start > 0 ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '')
}

function Highlight({ text, q }) {
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

/**
 * Globale Volltextsuche über Projekte, Protokollpunkte, Aufgaben,
 * Notizen und Kontakte. Rein client-seitig über die geladenen Daten.
 */
export default function GlobalSearch({ projects, protocols, notes, onOpenProject, onOpenProtocol, onOpenNotes, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const q = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (q.length < 2) return null
    const LIMIT = 8
    const projName = (id) => projects.find(p => p.id === id)?.name || ''

    const projectHits = projects
      .filter(p => (p.name || '').toLowerCase().includes(q))
      .slice(0, LIMIT)
      .map(p => ({ id: p.id, name: p.name || 'Unbenannt' }))

    const itemHits = []
    const taskHits = []
    outer:
    for (const proto of protocols) {
      const chainNo = getChainNo(proto, protocols)
      const protoNo = buildProtocolNo(proto.projectName, proto.date, chainNo, proto.meetingType)
      for (const it of (proto.agendaItems ?? [])) {
        const topic = it.topic || ''
        const disc  = strip(it.discussion)
        if (topic.toLowerCase().includes(q) || disc.toLowerCase().includes(q)) {
          itemHits.push({
            protocolId: proto.id, protoNo, project: proto.projectName || '',
            no: it.no, topic, text: snippet(disc || topic, q),
          })
          if (itemHits.length >= LIMIT && taskHits.length >= LIMIT) break outer
        }
      }
      for (const a of (proto.actionItems ?? [])) {
        const d = a.description || ''
        if (d.toLowerCase().includes(q) || (a.responsible || '').toLowerCase().includes(q)) {
          taskHits.push({
            protocolId: proto.id, protoNo, project: proto.projectName || '',
            no: a.no, text: snippet(d, q), responsible: a.responsible || '', status: a.status,
          })
          if (itemHits.length >= LIMIT && taskHits.length >= LIMIT) break outer
        }
      }
    }

    const noteHits = (notes ?? [])
      .filter(n => (n.subject || '').toLowerCase().includes(q) || strip(n.content).toLowerCase().includes(q))
      .slice(0, LIMIT)
      .map(n => ({
        projectId: n.projectId, project: projName(n.projectId),
        subject: n.subject || 'Notiz', type: n.type || 'Notiz', date: n.date || '',
      }))

    const contactHits = []
    for (const p of projects) {
      for (const c of (p.contacts ?? [])) {
        const hay = `${c.name || ''} ${c.company || ''} ${c.email || ''}`.toLowerCase()
        if (hay.includes(q)) {
          contactHits.push({ projectId: p.id, project: p.name || '', name: c.name || c.company, company: c.company || '', email: c.email || '' })
          if (contactHits.length >= LIMIT) break
        }
      }
      if (contactHits.length >= LIMIT) break
    }

    return { projectHits, itemHits: itemHits.slice(0, LIMIT), taskHits: taskHits.slice(0, LIMIT), noteHits, contactHits }
  }, [q, projects, protocols, notes])

  const total = results
    ? results.projectHits.length + results.itemHits.length + results.taskHits.length + results.noteHits.length + results.contactHits.length
    : 0

  const Section = ({ icon, title, children }) => (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-1">{icon} {title}</p>
      <div className="divide-y divide-gray-100 border border-gray-100">{children}</div>
    </div>
  )
  const Row = ({ onClick, children }) => (
    <button className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-start gap-2 group" onClick={onClick}>
      <span className="flex-1 min-w-0">{children}</span>
      <ChevronRight size={13} className="text-gray-300 group-hover:text-brand-500 flex-shrink-0 mt-1" />
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Suchfeld */}
        <div className="relative border-b border-gray-200">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            className="w-full pl-11 pr-11 py-3.5 text-sm outline-none"
            placeholder="Alles durchsuchen: Protokollpunkte, Aufgaben, Notizen, Kontakte, Projekte…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Ergebnisse */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {q.length < 2 && (
            <p className="text-sm text-gray-400 text-center py-6">Mindestens 2 Zeichen eingeben…</p>
          )}
          {results && total === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Keine Treffer für „{query}".</p>
          )}

          {results?.projectHits.length > 0 && (
            <Section icon={<FolderOpen size={12} />} title="Projekte">
              {results.projectHits.map(p => (
                <Row key={p.id} onClick={() => { onOpenProject(p.id); onClose() }}>
                  <span className="text-sm font-medium text-gray-800"><Highlight text={p.name} q={q} /></span>
                </Row>
              ))}
            </Section>
          )}

          {results?.itemHits.length > 0 && (
            <Section icon={<FileText size={12} />} title="Protokollpunkte">
              {results.itemHits.map((h, i) => (
                <Row key={i} onClick={() => { onOpenProtocol(h.protocolId); onClose() }}>
                  <span className="block text-sm font-medium text-gray-800 truncate">
                    {h.no && <span className="text-gray-400 mr-1">{h.no}</span>}
                    <Highlight text={h.topic || '(ohne Thema)'} q={q} />
                  </span>
                  {h.text && <span className="block text-xs text-gray-500 truncate"><Highlight text={h.text} q={q} /></span>}
                  <span className="block text-[11px] text-gray-400 truncate">{h.project} · {h.protoNo}</span>
                </Row>
              ))}
            </Section>
          )}

          {results?.taskHits.length > 0 && (
            <Section icon={<CheckSquare size={12} />} title="Aufgaben">
              {results.taskHits.map((h, i) => (
                <Row key={i} onClick={() => { onOpenProtocol(h.protocolId); onClose() }}>
                  <span className="block text-sm font-medium text-gray-800 truncate"><Highlight text={h.text} q={q} /></span>
                  <span className="block text-[11px] text-gray-400 truncate">
                    {h.responsible && <>{h.responsible} · </>}{h.project} · {h.protoNo}
                    {h.status === 'erledigt' && ' · erledigt'}
                  </span>
                </Row>
              ))}
            </Section>
          )}

          {results?.noteHits.length > 0 && (
            <Section icon={<NotebookPen size={12} />} title="Akten- / Telefonnotizen">
              {results.noteHits.map((h, i) => (
                <Row key={i} onClick={() => { onOpenNotes(h.projectId); onClose() }}>
                  <span className="block text-sm font-medium text-gray-800 truncate"><Highlight text={h.subject} q={q} /></span>
                  <span className="block text-[11px] text-gray-400 truncate">{h.type} · {h.project}{h.date ? ` · ${formatDate(h.date)}` : ''}</span>
                </Row>
              ))}
            </Section>
          )}

          {results?.contactHits.length > 0 && (
            <Section icon={<Users size={12} />} title="Kontakte">
              {results.contactHits.map((h, i) => (
                <Row key={i} onClick={() => { onOpenProject(h.projectId); onClose() }}>
                  <span className="block text-sm font-medium text-gray-800 truncate">
                    <Highlight text={h.name || '–'} q={q} />
                    {h.company && <span className="text-gray-500 font-normal"> ({h.company})</span>}
                  </span>
                  <span className="block text-[11px] text-gray-400 truncate">{h.email || '–'} · {h.project}</span>
                </Row>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
