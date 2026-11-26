import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, ZoomIn, ZoomOut, Maximize2, X, Loader, AlertCircle, Wand2 } from 'lucide-react'
import { seiteBereit as seiteDa, planBildUrl } from '../planHelfer'

// ── Einen Punkt auf dem Plan setzen ──────────────────────────────────────────
//
// Dieselbe Komponente im Büro (Mängelliste) und auf dem Handy. Sie kennt
// deshalb nur Bilder – PDF-Seiten werden einmal beim Hochladen in Bilder
// gewandelt (src/planVorschau.js, server/planVorschau.js). Nichts hier lädt
// einen PDF-Renderer nach; das Bündel der Baustellen-Oberfläche bleibt klein.
//
// Gespeichert wird die Stelle als Anteil der Bildkante (0…1), nicht in Pixeln:
// so sitzt der Pin auf jedem Bildschirm und bei jeder Vergrößerung an
// derselben Stelle des Plans.

const STATUS_FARBE = {
  offen:      '#dc2626',
  in_arbeit:  '#d97706',
  behoben:    '#2563eb',
  abgenommen: '#16a34a',
}

export default function PlanPin({
  projectId, plaene = [], wert = null, andere = [], token = null,
  onChange, aufbereiten = null, hoehe = 'h-[55vh]',
  // Die Baustellen-Oberfläche holt die Planbilder über ihre eigene Fassade.
  bildUrl = null,
}) {
  const nutzbar = useMemo(() => (plaene || []).filter(p => p.hasFile), [plaene])
  const [planId, setPlanId] = useState(wert?.planId || nutzbar[0]?.id || '')
  const [seite,  setSeite]  = useState(wert?.planSeite || 1)
  const [zoom,   setZoom]   = useState(1)
  const [laedt,  setLaedt]  = useState(false)
  const [fehler, setFehler] = useState(null)
  const [busy,   setBusy]   = useState(null)
  const bildRef = useRef(null)

  const plan = useMemo(() => nutzbar.find(p => p.id === planId) || null, [nutzbar, planId])

  // Plan gewechselt: auf Seite 1 und in die Übersicht
  useEffect(() => {
    if (wert?.planId === planId) return
    setSeite(1); setZoom(1)
  }, [planId, wert?.planId])

  const url = !plan ? null
    : bildUrl ? bildUrl(plan, seite)
    : planBildUrl(projectId, plan, seite, token)

  // Neues Bild: wieder auf „lädt". <img> hat kein onLoadStart, deshalb hier.
  useEffect(() => { setLaedt(!!url); setFehler(null) }, [url])
  const seiten = Math.max(1, plan?.seiten || 1)

  // Hat der Plan für DIESE Seite ein Bild?
  const bereit = seiteDa(plan, seite)

  const setzen = useCallback((e) => {
    const el = bildRef.current
    if (!el || !onChange) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const p = e.touches?.[0] || e.changedTouches?.[0] || e
    const x = Math.min(1, Math.max(0, (p.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (p.clientY - r.top) / r.height))
    onChange({ planId, planSeite: seite, planTitel: plan?.title || '', position: { x, y } })
  }, [onChange, planId, seite, plan])

  const aufbereitenJetzt = async () => {
    if (!aufbereiten || !plan) return
    setBusy('Plan wird aufbereitet…'); setFehler(null)
    try { await aufbereiten(plan) }
    catch (e) { setFehler(e.message || 'Aufbereiten fehlgeschlagen.') }
    finally { setBusy(null) }
  }

  if (!nutzbar.length) {
    return (
      <div className="card p-3 text-xs text-gray-500 flex items-start gap-2">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        Für dieses Projekt ist kein Plan mit Datei hinterlegt. Pläne werden im Büro über die
        BIM-/Plan-Ansicht hochgeladen.
      </div>
    )
  }

  const eigener = wert?.planId === planId && wert?.planSeite === seite && wert?.position
  const fremde = (andere || []).filter(a =>
    a.position && a.planId === planId && (a.planSeite || 1) === seite)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select className="select py-2 text-sm min-w-0 flex-1" value={planId} onChange={e => setPlanId(e.target.value)}>
          {nutzbar.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {seiten > 1 && (
          <select className="select py-2 text-sm w-28" value={seite} onChange={e => setSeite(Number(e.target.value))}>
            {Array.from({ length: seiten }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Seite {n}</option>
            ))}
          </select>
        )}
      </div>

      {!bereit ? (
        <div className="card p-3 text-xs text-amber-800 bg-amber-50 border-amber-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Dieser Plan ist ein PDF und für Pins noch nicht aufbereitet
              {seiten > 1 ? ` (Seite ${seite})` : ''}. Das geschieht sonst beim Hochladen.
            </span>
          </div>
          {aufbereiten ? (
            <button className="btn btn-secondary px-3 py-1.5" onClick={aufbereitenJetzt} disabled={!!busy}>
              {busy ? <Loader size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {busy || 'Jetzt aufbereiten'}
            </button>
          ) : (
            <p>Einmal am Rechner im Büro aufbereiten – danach geht es hier.</p>
          )}
          {fehler && <p className="text-red-700">{fehler}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <button className="btn btn-ghost px-2 py-1.5" title="Kleiner" onClick={() => setZoom(z => Math.max(1, z / 1.5))}><ZoomOut size={15} /></button>
            <button className="btn btn-ghost px-2 py-1.5" title="Größer" onClick={() => setZoom(z => Math.min(8, z * 1.5))}><ZoomIn size={15} /></button>
            <button className="btn btn-ghost px-2 py-1.5" title="Ganzer Plan" onClick={() => setZoom(1)}><Maximize2 size={15} /></button>
            <span className="ml-1">{eigener ? 'Pin sitzt – zum Verschieben erneut tippen' : 'Auf die Stelle tippen'}</span>
            {eigener && onChange && (
              <button className="btn btn-ghost px-2 py-1.5 ml-auto text-red-600" title="Pin entfernen"
                      onClick={() => onChange(null)}><X size={15} /></button>
            )}
          </div>

          <div className={`relative overflow-auto bg-concrete border border-concrete ${hoehe}`}>
            <div className="relative" style={{ width: `${zoom * 100}%` }}>
              {laedt && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <Loader size={18} className="animate-spin" />
                </div>
              )}
              <img
                ref={bildRef}
                src={url}
                alt={plan?.title || 'Plan'}
                className="w-full h-auto block select-none"
                draggable={false}
                onLoad={() => setLaedt(false)}
                onError={() => { setLaedt(false); setFehler('Planbild konnte nicht geladen werden.') }}
                onClick={setzen}
              />

              {/* Pins anderer Mängel – nur zur Orientierung, nicht anklickbar */}
              {fremde.map(a => (
                <span key={a.id} className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
                      style={{ left: `${a.position.x * 100}%`, top: `${a.position.y * 100}%` }}
                      title={`Nr. ${a.no ?? ''} ${a.title || ''}`}>
                  <MapPin size={20} style={{ color: STATUS_FARBE[a.status] || STATUS_FARBE.offen, opacity: 0.55 }} />
                </span>
              ))}

              {/* Der eigene Pin */}
              {eigener && (
                <span className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
                      style={{ left: `${wert.position.x * 100}%`, top: `${wert.position.y * 100}%` }}>
                  <MapPin size={28} className="text-night drop-shadow" strokeWidth={2.5} />
                </span>
              )}
            </div>
          </div>
          {fehler && <p className="text-xs text-red-700">{fehler}</p>}
        </>
      )}
    </div>
  )
}

/** Nur anzeigen, ohne Setzen – für die Mängelliste und den Ausdruck. */
export function PlanPinAnsicht({ projectId, plan, wert, token = null, hoehe = 'h-64', bildUrl = null }) {
  if (!plan || !wert?.position) return null
  const url = bildUrl ? bildUrl(plan, wert.planSeite || 1)
                      : planBildUrl(projectId, plan, wert.planSeite || 1, token)
  // Das Bild füllt die Breite, der Pin sitzt im Anteil dieses Bildes. Mit
  // „object-contain" in einem festen Rahmen läge er daneben, sobald der
  // Rahmen ein anderes Seitenverhältnis hat als der Plan.
  return (
    <div className={`overflow-hidden bg-concrete border border-concrete ${hoehe}`}>
      <div className="relative">
        <img src={url} alt={plan.title} className="w-full h-auto block" />
        <span className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${wert.position.x * 100}%`, top: `${wert.position.y * 100}%` }}>
          <MapPin size={24} className="text-red-600" strokeWidth={2.5} />
        </span>
      </div>
    </div>
  )
}
