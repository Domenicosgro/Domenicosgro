import React, { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader, AlertCircle, Move, Maximize2 } from 'lucide-react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import * as THREE from 'three'

const INIT_W = typeof window !== 'undefined' ? Math.min(920, Math.round(window.innerWidth  * 0.78)) : 840
const INIT_H = typeof window !== 'undefined' ? Math.min(640, Math.round(window.innerHeight * 0.72)) : 580

export default function BimViewerPopup({ project, token, viewpoint, title, onClose }) {
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Position: null = CSS-zentriert, sonst absolute px-Werte
  const [pos,  setPos]  = useState({ x: null, y: null })
  const [size, setSize] = useState({ w: INIT_W, h: INIT_H })

  // IFC-Modell laden + Standpunkt ansteuern
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    const viewer = new IfcViewerAPI({
      container: containerRef.current,
      backgroundColor: new THREE.Color(0x1e1e2e),
    })
    viewer.axes.setAxes()
    viewer.grid.setGrid()
    viewerRef.current = viewer

    const init = async () => {
      try {
        if (cancelled || !viewer.IFC) return
        await viewer.IFC.setWasmPath('/')
        if (cancelled || !viewer.IFC) return
        if (token) viewer.IFC.loader.setRequestHeader({ 'Authorization': `Bearer ${token}` })

        const model = await viewer.IFC.loadIfcUrl(
          `/api/projects/${project.id}/bim`,
          true, undefined, () => {}
        )
        if (cancelled) return
        if (!model) throw new Error('Modell konnte nicht geladen werden')
        setLoading(false)

        // Kameraposition auf Issue-Standpunkt setzen
        if (viewpoint?.position && viewer.context) {
          try {
            const { position: p, target: t, elementId, modelId } = viewpoint
            const controls = viewer.context.ifcCamera.cameraControls
            controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, true)
            if (elementId != null && modelId != null) {
              viewer.IFC.selector.pickIfcItemsByID(modelId, [elementId], true)
            }
          } catch (_) {}
        }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false) }
      }
    }

    init()
    return () => {
      cancelled = true
      viewerRef.current = null
      try { viewer.dispose() } catch (_) {}
    }
  }, [project.id, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape schließt das Popup
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Verschieben per Header-Drag
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
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [pos, size])

  // Größe ändern per SE-Resize-Handle
  const handleResizeStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = size.w
    const startH = size.h

    const onMove = (ev) => setSize({
      w: Math.max(480, startW + ev.clientX - startX),
      h: Math.max(320, startH + ev.clientY - startY),
    })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [size])

  const positioned = pos.x !== null

  return (
    <>
      {/* Hintergrund-Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Popup-Fenster */}
      <div
        className="fixed z-50 flex flex-col bg-gray-900 border border-gray-700 shadow-2xl"
        style={{
          width:     size.w,
          height:    size.h,
          left:      positioned ? pos.x : '50%',
          top:       positioned ? pos.y : '50%',
          transform: positioned ? 'none' : 'translate(-50%, -50%)',
          minWidth:  480,
          minHeight: 320,
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
            <span className="text-xs font-medium text-gray-200 truncate">
              {title || project.name} · BIM-Ansicht
            </span>
            {!viewpoint?.position && !loading && !error && (
              <span className="text-[10px] text-gray-500 flex-shrink-0">Kein Standpunkt hinterlegt</span>
            )}
          </div>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            className="ml-3 flex-shrink-0 text-gray-500 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* 3D-Viewer */}
        <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
          <div ref={containerRef} className="absolute inset-0" style={{ background: '#1e1e2e' }} />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
              <div className="text-center">
                <Loader size={28} className="animate-spin text-brand-400 mx-auto mb-2" />
                <p className="text-xs text-gray-300">BIM-Modell wird geladen…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <AlertCircle size={22} className="text-red-400 mx-auto mb-2" />
                <p className="text-xs text-red-400 max-w-xs">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="absolute bottom-3 left-3 text-[10px] text-gray-500 bg-gray-900/70 px-2 py-1 z-10 pointer-events-none">
              Linksklick = drehen · Rechtsklick = verschieben · Scroll = zoomen · Esc = schließen
            </div>
          )}
        </div>

        {/* Resize-Handle (SE-Ecke) */}
        <div
          className="absolute bottom-0 right-0 w-5 h-5 z-20 cursor-se-resize flex items-end justify-end pb-0.5 pr-0.5"
          onMouseDown={handleResizeStart}
        >
          <Maximize2 size={10} className="text-gray-600 rotate-90" />
        </div>
      </div>
    </>
  )
}
