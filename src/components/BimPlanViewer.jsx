import React, { useState, useCallback, useEffect } from 'react'
import { X, Move, Maximize2, FileText, Image as ImageIcon, ExternalLink, ZoomIn, ZoomOut, Loader, AlertCircle } from 'lucide-react'

const INIT_W = typeof window !== 'undefined' ? Math.min(1000, Math.round(window.innerWidth  * 0.8)) : 900
const INIT_H = typeof window !== 'undefined' ? Math.min(720, Math.round(window.innerHeight * 0.82)) : 640

export default function BimPlanViewer({ projectId, plan, token, onClose }) {
  const [pos,  setPos]  = useState({ x: null, y: null })
  const [size, setSize] = useState({ w: INIT_W, h: INIT_H })
  const [zoom, setZoom] = useState(1)
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const isPdf   = (plan.mimeType || '').includes('pdf')
  // Direkte URL (nur für „in neuem Tab öffnen" – Top-Level-Navigation, kein CSP-Frame)
  const fileUrl = `/api/projects/${projectId}/plans/${plan.id}/file?token=${encodeURIComponent(token || '')}`

  // Datei mit Auth-Header laden und als Blob-URL anzeigen. Das umgeht sowohl die
  // CSP-/Plugin-Eigenheiten beim direkten Einbetten als auch fehlende Header beim
  // PDF-Renderer – derselbe Pfad, der für die Plan-Liste zuverlässig funktioniert.
  useEffect(() => {
    let cancelled = false
    let createdUrl = null
    setLoading(true); setError(null); setBlobUrl(null)
    ;(async () => {
      try {
        const res = await fetch(fileUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        const blob = await res.blob()
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl)
        setLoading(false)
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false) }
      }
    })()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [fileUrl, token])

  const handleDragStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const originX = pos.x ?? (window.innerWidth  / 2 - size.w / 2)
    const originY = pos.y ?? (window.innerHeight / 2 - size.h / 2)
    const dx = e.clientX - originX
    const dy = e.clientY - originY
    const onMove = (ev) => setPos({
      x: Math.max(0, Math.min(window.innerWidth  - size.w, ev.clientX - dx)),
      y: Math.max(0, Math.min(window.innerHeight - size.h, ev.clientY - dy)),
    })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [pos, size])

  const handleResizeStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY, startW = size.w, startH = size.h
    const onMove = (ev) => setSize({
      w: Math.max(420, startW + ev.clientX - startX),
      h: Math.max(300, startH + ev.clientY - startY),
    })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [size])

  const positioned = pos.x !== null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="fixed z-50 flex flex-col bg-gray-900 border border-gray-700 shadow-2xl"
        style={{
          width: size.w, height: size.h,
          left: positioned ? pos.x : '50%', top: positioned ? pos.y : '50%',
          transform: positioned ? 'none' : 'translate(-50%, -50%)',
          minWidth: 420, minHeight: 300,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header / Drag-Griff */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0 cursor-move select-none"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Move size={11} className="text-gray-500 flex-shrink-0" />
            {isPdf ? <FileText size={13} className="text-brand-400 flex-shrink-0" /> : <ImageIcon size={13} className="text-brand-400 flex-shrink-0" />}
            <span className="text-xs font-medium text-gray-200 truncate">{plan.title}</span>
            {plan.filename && <span className="text-[10px] text-gray-500 truncate hidden sm:inline">· {plan.filename}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0" onMouseDown={e => e.stopPropagation()}>
            {!isPdf && (
              <>
                <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Verkleinern"
                  className="text-gray-400 hover:text-white transition-colors"><ZoomOut size={13} /></button>
                <span className="text-[10px] text-gray-400 w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} title="Vergrößern"
                  className="text-gray-400 hover:text-white transition-colors"><ZoomIn size={13} /></button>
                <span className="text-gray-700">|</span>
              </>
            )}
            <a href={fileUrl} target="_blank" rel="noreferrer" title="In neuem Tab öffnen"
              className="text-gray-400 hover:text-white transition-colors"><ExternalLink size={13} /></a>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors ml-1"><X size={14} /></button>
          </div>
        </div>

        {/* Inhalt */}
        <div className="flex-1 relative overflow-auto bg-gray-950" style={{ minHeight: 0 }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Loader size={26} className="animate-spin text-brand-400 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Plan wird geladen…</p>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="text-center">
                <AlertCircle size={22} className="text-red-400 mx-auto mb-2" />
                <p className="text-xs text-red-400 max-w-xs">{error}</p>
              </div>
            </div>
          )}
          {!loading && !error && blobUrl && (
            isPdf ? (
              <iframe title={plan.title} src={blobUrl} className="absolute inset-0 w-full h-full bg-white" />
            ) : (
              <div className="min-h-full flex items-center justify-center p-2">
                <img
                  src={blobUrl}
                  alt={plan.title}
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
                  className="max-w-none transition-transform"
                />
              </div>
            )
          )}
        </div>

        {/* Resize-Handle */}
        <div className="absolute bottom-0 right-0 w-5 h-5 z-20 cursor-se-resize flex items-end justify-end pb-0.5 pr-0.5"
          onMouseDown={handleResizeStart}>
          <Maximize2 size={10} className="text-gray-600 rotate-90" />
        </div>
      </div>
    </>
  )
}
