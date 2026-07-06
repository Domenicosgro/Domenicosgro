import { attachmentStore } from './attachmentStore'
import { uid } from './utils'

/**
 * Foto client-seitig verkleinern (max. 1600px, JPEG 80%) und im
 * Anhang-Speicher ablegen. Rückgabe: { id, name } für den Datensatz.
 */
export async function savePhoto(file, maxDim = 1600) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload  = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const scale  = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(img.width  * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const jpeg   = canvas.toDataURL('image/jpeg', 0.8)
  const base64 = jpeg.split(',')[1]
  const id     = uid()
  await attachmentStore.save(id, base64)
  return { id, name: file.name || 'foto.jpg' }
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
