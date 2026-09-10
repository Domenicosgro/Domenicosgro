import { attachmentStore } from './attachmentStore'
import { uid } from './utils'

// ── Zielgrößen ───────────────────────────────────────────────────────────────
// Fotos werden beim Hereinladen auf eine feste Obergrenze gebracht, damit der
// Anhang-Speicher schlank bleibt und ein PDF mit 20–30 Fotos unter der
// 3-MB-Grenze des Mailversands bleibt (Microsoft Graph, direkter Versand).
// 1200 px lange Kante reichen für den zweispaltigen Fotoanhang (88 mm Breite
// → rund 350 dpi); 120 KB je Foto ergeben bei 25 Fotos etwa 3 MB.
export const PHOTO_MAX_DIM      = 1200
export const PHOTO_TARGET_BYTES = 120 * 1024

const loadImage = (src) => new Promise((resolve, reject) => {
  const i = new Image()
  i.onload  = () => resolve(i)
  i.onerror = reject
  i.src = src
})

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload  = () => resolve(r.result)
  r.onerror = reject
  r.readAsDataURL(file)
})

// Bild auf maxDim skalieren und so lange stärker komprimieren, bis es unter
// targetBytes liegt: zuerst die JPEG-Qualität senken, dann die Kantenlänge.
// Untergrenzen verhindern, dass ein Foto unbrauchbar wird – im Zweifel bleibt
// es etwas größer.
async function encodeToTarget(img, { maxDim, targetBytes }) {
  const MIN_DIM = 640, MIN_Q = 0.45
  let dim = Math.min(maxDim, Math.max(img.width, img.height))
  let best = null
  for (;;) {
    const scale  = Math.min(1, dim / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(img.width  * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    for (let q = 0.8; q >= MIN_Q - 1e-9; q -= 0.1) {
      const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1]
      const bytes = Math.floor(b64.length * 3 / 4)
      best = b64
      if (!targetBytes || bytes <= targetBytes) return b64
    }
    if (dim <= MIN_DIM) return best
    dim = Math.max(MIN_DIM, Math.round(dim * 0.8))
  }
}

/** Foto client-seitig verkleinern → reines base64 (JPEG).
 *  opts: Zahl (nur maxDim, alte Signatur) oder { maxDim, targetBytes }. */
export async function compressToBase64(file, opts = {}) {
  const o = typeof opts === 'number' ? { maxDim: opts } : opts
  const img = await loadImage(await readAsDataUrl(file))
  return encodeToTarget(img, {
    maxDim:      o.maxDim      ?? PHOTO_MAX_DIM,
    targetBytes: o.targetBytes ?? PHOTO_TARGET_BYTES,
  })
}

/** Bereits vorliegendes Bild (DataURL) auf ein Byte-Budget bringen – für den
 *  PDF-Versand, damit auch Bestandsfotos aus früheren, größeren Ablagen den
 *  Anhang nicht sprengen. Liefert wieder eine DataURL. */
export async function shrinkDataUrl(dataUrl, { maxDim = PHOTO_MAX_DIM, targetBytes = PHOTO_TARGET_BYTES } = {}) {
  try {
    const cur = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4)
    const img = await loadImage(dataUrl)
    // Schon klein genug und nicht zu groß → unverändert lassen
    if (cur <= targetBytes && Math.max(img.width, img.height) <= maxDim) return dataUrl
    const b64 = await encodeToTarget(img, { maxDim, targetBytes })
    return `data:image/jpeg;base64,${b64}`
  } catch { return dataUrl }
}

/** Foto verkleinern und im Anhang-Speicher ablegen. Rückgabe: { id, name }. */
export async function savePhoto(file, opts = {}) {
  const base64 = await compressToBase64(file, opts)
  const id     = uid()
  await attachmentStore.save(id, base64)
  return { id, name: file.name || 'foto.jpg' }
}

/** Bereits komprimiertes base64 (aus der Offline-Warteschlange) ablegen. */
export async function savePhotoBase64(base64, name = 'foto.jpg') {
  const id = uid()
  await attachmentStore.save(id, base64)
  return { id, name }
}

/** Foto als DataURL laden (für <img src>). */
export async function loadPhotoUrl(id) {
  try {
    const base64 = await attachmentStore.load(id)
    return base64 ? `data:image/jpeg;base64,${base64}` : null
  } catch { return null }
}

export async function removePhoto(id) {
  try { await attachmentStore.remove(id) } catch {}
}
