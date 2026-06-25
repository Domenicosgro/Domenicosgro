import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Upload, Trash2, Box, AlertCircle, Loader, Info } from 'lucide-react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import * as THREE from 'three'
import { formatDate } from '../utils'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function formatBytes(bytes) {
  if (!bytes) return '–'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function BimView({ project, serverUser, token, onBack, onProjectUpdated }) {
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)
  const fileInputRef = useRef(null)

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [modelInfo, setModelInfo] = useState(null)

  const bimMeta = project.bimMeta
  const canEdit = !isServer || !serverUser || serverUser.role === 'admin' ||
    project.projectAdminUser === serverUser?.username ||
    (project.projectAdmins || []).includes(serverUser?.username)

  // Viewer initialisieren
  useEffect(() => {
    if (!containerRef.current || !bimMeta) return

    let cancelled = false

    const viewer = new IfcViewerAPI({
      container: containerRef.current,
      backgroundColor: new THREE.Color(0x1e1e2e),
    })

    viewer.axes.setAxes()
    viewer.grid.setGrid()
    viewerRef.current = viewer

    const loadModel = async () => {
      setLoading(true)
      setError(null)
      try {
        // Guard after every await: dispose() sets viewer.IFC = null asynchronously
        if (cancelled || !viewer.IFC) return
        await viewer.IFC.setWasmPath('/')

        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        if (cancelled || !viewer.IFC) return
        const response = await fetch(`/api/projects/${project.id}/bim`, { headers })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        if (cancelled || !viewer.IFC) return
        const blob = await response.blob()
        const url  = URL.createObjectURL(blob)

        if (cancelled || !viewer.IFC) { URL.revokeObjectURL(url); return }

        // loadIfcUrl catches errors internally and returns null — capture via callback
        let ifcError = null
        const model = await viewer.IFC.loadIfcUrl(url, false, undefined, (err) => { ifcError = err })
        URL.revokeObjectURL(url)

        if (cancelled) return
        if (!model) throw ifcError || new Error('IFC-Datei konnte nicht geparst werden (web-ifc Fehler – Konsole prüfen)')

        // Kamera auf das Modell ausrichten
        const bb     = new THREE.Box3().setFromObject(model.mesh)
        const center = bb.getCenter(new THREE.Vector3())
        const size   = bb.getSize(new THREE.Vector3())
        const dist   = Math.max(size.x, size.y, size.z) * 1.5
        if (!cancelled && viewer.context) {
          viewer.context.getCamera().position.set(center.x + dist, center.y + dist * 0.5, center.z + dist)
          viewer.context.getCamera().lookAt(center)
        }

        if (!cancelled) setModelInfo({ center, size })
      } catch (e) {
        if (!cancelled) setError(`Modell konnte nicht geladen werden: ${e.message}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadModel()

    return () => {
      cancelled = true
      viewerRef.current = null
      try { viewer.dispose() } catch (_) {}
    }
  }, [project.id, bimMeta, token])

  // Maus-Events für Modell-Picking
  useEffect(() => {
    if (!containerRef.current || !bimMeta) return
    const el = containerRef.current
    const onMouseMove = () => {
      if (viewerRef.current?.IFC) viewerRef.current.IFC.selector.prePickIfcItem()
    }
    el.addEventListener('mousemove', onMouseMove)
    return () => el.removeEventListener('mousemove', onMouseMove)
  }, [bimMeta])

  // IFC hochladen
  const handleUpload = useCallback(async (file) => {
    if (!file) return
    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      const headers = { 'Content-Type': 'application/octet-stream', 'X-Filename': file.name }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)) }

      await new Promise((resolve, reject) => {
        xhr.open('POST', `/api/projects/${project.id}/bim`)
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
        xhr.onload  = () => xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText))
        xhr.onerror = () => reject(new Error('Netzwerkfehler'))
        xhr.send(file)
      })

      if (onProjectUpdated) onProjectUpdated()
    } catch (e) {
      setError(`Upload fehlgeschlagen: ${e.message}`)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [project.id, token, onProjectUpdated])

  // IFC löschen
  const handleDelete = useCallback(async () => {
    if (!window.confirm(`BIM-Modell „${bimMeta?.filename}" wirklich löschen?`)) return
    setError(null)
    try {
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/projects/${project.id}/bim`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error((await res.json()).error)
      if (onProjectUpdated) onProjectUpdated()
    } catch (e) {
      setError(`Löschen fehlgeschlagen: ${e.message}`)
    }
  }, [project.id, bimMeta, token, onProjectUpdated])

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
            onClick={onBack}
          >
            <ArrowLeft size={15} /> Dashboard
          </button>
          <span className="text-gray-600">|</span>
          <Box size={15} className="text-brand-400" />
          <span className="text-sm font-medium">{project.name} · BIM-Modell</span>
        </div>

        <div className="flex items-center gap-2">
          {bimMeta && (
            <span className="text-xs text-gray-400">
              {bimMeta.filename} · {formatBytes(bimMeta.size)} · hochgeladen {formatDate(bimMeta.uploadedAt?.slice(0,10))} von {bimMeta.uploadedBy}
            </span>
          )}
          {canEdit && bimMeta && (
            <button
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-800 transition-colors"
              onClick={handleDelete}
            >
              <Trash2 size={13} /> Modell entfernen
            </button>
          )}
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ifc"
                className="hidden"
                onChange={e => handleUpload(e.target.files?.[0])}
              />
              <button
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-brand-700/60 hover:bg-brand-700 text-brand-200 border border-brand-600 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? `${progress}%` : bimMeta ? 'Ersetzen' : 'IFC hochladen'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inhalt */}
      {!bimMeta ? (
        // Kein Modell – Upload-Fläche
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <Box size={48} className="mx-auto text-gray-600 mb-4" />
            <h2 className="text-lg font-semibold text-gray-300 mb-2">Kein BIM-Modell hinterlegt</h2>
            <p className="text-sm text-gray-500 mb-6">
              Lade eine IFC-Datei hoch um das Gebäudemodell direkt im Protokolltool zu betrachten.
            </p>
            {canEdit && (
              <button
                className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm transition-colors"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? <><Loader size={15} className="animate-spin" /> Wird hochgeladen… {progress}%</>
                  : <><Upload size={15} /> IFC-Datei hochladen</>
                }
              </button>
            )}
            {error && (
              <p className="mt-4 text-sm text-red-400 flex items-center gap-2 justify-center">
                <AlertCircle size={14} /> {error}
              </p>
            )}
          </div>
        </div>
      ) : (
        // Viewer
        <div className="flex-1 relative overflow-hidden">
          {/* IFC Canvas */}
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ background: '#1e1e2e' }}
          />

          {/* Ladeindikator */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
              <div className="text-center">
                <Loader size={32} className="animate-spin text-brand-400 mx-auto mb-3" />
                <p className="text-sm text-gray-300">Modell wird geladen…</p>
                <p className="text-xs text-gray-500 mt-1">{formatBytes(bimMeta.size)}</p>
              </div>
            </div>
          )}

          {/* Fehler */}
          {error && !loading && (
            <div className="absolute bottom-4 left-4 right-4 bg-red-900/80 border border-red-700 p-3 flex items-start gap-2 z-10">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Steuerungshinweis */}
          {!loading && !error && modelInfo && (
            <div className="absolute bottom-4 right-4 bg-gray-900/70 border border-gray-700 px-3 py-2 text-xs text-gray-400 z-10">
              <span className="flex items-center gap-1.5">
                <Info size={11} />
                Linksklick = drehen · Rechtsklick = verschieben · Scroll = zoomen
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
