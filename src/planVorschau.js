// ── Planvorschau im Browser erzeugen ─────────────────────────────────────────
//
// Pins auf einem Plan brauchen ein Bild. Pläne kommen als PDF, deshalb werden
// die Seiten hier einmal in PNG gewandelt und auf dem Server abgelegt
// (server/planVorschau.js). Danach braucht niemand mehr einen PDF-Renderer –
// vor allem nicht das Handy auf der Baustelle.
//
// pdfjs wird **nachgeladen**, nicht mitgebaut: `await import(...)` erst in dem
// Moment, in dem wirklich ein PDF aufbereitet wird. Das Bündel des
// Protokolltools wächst dadurch nicht, und die Baustellen-Oberfläche lädt es
// nie – sie benutzt nur die fertigen Bilder.

// Lange Kante der Vorschau. 1800 px reichen, um auf einem Grundriss eine
// Stelle zu zeigen; ein Strichplan in dieser Größe bleibt als PNG meist unter
// einem Megabyte, und das zählt, wenn es über Mobilfunk geht.
export const VORSCHAU_KANTE = 1800
export const VORSCHAU_MAX_SEITEN = 40

// Die reinen Auskünfte stehen in src/planHelfer.js – ohne Bezug auf pdfjs,
// damit die Baustellen-Oberfläche sie benutzen kann, ohne den Renderer in
// ihrem Bündel zu haben. Hier weitergereicht, damit Aufrufer eine Anlaufstelle
// haben.
export { brauchtVorschau, planBepinnbar, seiteBereit, planBildUrl } from './planHelfer'
import { brauchtVorschau } from './planHelfer'

let pdfjsP = null
async function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = (async () => {
      const lib = await import('pdfjs-dist')
      // Der Worker kommt als eigene Datei aus dem Build; ohne ihn rendert
      // pdfjs im Hauptfaden und friert die Oberfläche ein.
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })()
  }
  return pdfjsP
}

/**
 * Alle Seiten eines PDF als Vorschau ablegen.
 *
 * quelle: File/Blob/ArrayBuffer des PDF – oder null, dann wird die beim
 * Server liegende Plandatei geholt (für Pläne, die früher hochgeladen wurden).
 *
 * Rückgabe: { seiten, abgelegt } · wirft bei Fehlern.
 */
export async function vorschauErzeugen(projectId, plan, quelle = null, { token, onFortschritt } = {}) {
  if (!brauchtVorschau(plan)) return { seiten: 1, abgelegt: 0 }
  const kopf = token ? { Authorization: `Bearer ${token}` } : {}

  let daten
  if (quelle) {
    daten = quelle instanceof ArrayBuffer ? quelle : await quelle.arrayBuffer()
  } else {
    const res = await fetch(`/api/projects/${projectId}/plans/${plan.id}/file`, { headers: kopf })
    if (!res.ok) throw new Error('Plandatei nicht lesbar.')
    daten = await res.arrayBuffer()
  }

  const lib = await pdfjs()
  // pdfjs übernimmt den Puffer – eine Kopie, damit der Aufrufer seine Daten
  // behält (der Upload der Plandatei läuft womöglich noch).
  const doc = await lib.getDocument({ data: new Uint8Array(daten.slice(0)) }).promise
  const seiten = Math.min(doc.numPages, VORSCHAU_MAX_SEITEN)
  let abgelegt = 0

  for (let n = 1; n <= seiten; n++) {
    const page = await doc.getPage(n)
    const roh = page.getViewport({ scale: 1 })
    const skala = VORSCHAU_KANTE / Math.max(roh.width, roh.height)
    const vp = page.getViewport({ scale: Math.min(skala, 4) })

    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(vp.width)
    canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d')
    // Weißer Grund: PDF-Seiten sind durchsichtig, ein PNG davon wäre auf
    // dunklem Hintergrund unlesbar.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise

    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error(`Seite ${n} konnte nicht gewandelt werden.`)

    const res = await fetch(
      `/api/projects/${projectId}/plans/${plan.id}/vorschau?seite=${n}&seiten=${seiten}`,
      { method: 'POST', headers: { ...kopf, 'Content-Type': 'application/octet-stream' }, body: blob })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
    abgelegt++
    if (onFortschritt) onFortschritt(n, seiten)
  }

  try { doc.destroy() } catch {}
  return { seiten, abgelegt }
}
