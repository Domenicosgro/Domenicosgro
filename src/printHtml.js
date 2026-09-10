import { shrinkDataUrl, PHOTO_TARGET_BYTES } from './photoUtils'

// ── Druck-HTML für das serverseitige PDF einsammeln ──────────────────────────
// Das PDF entsteht aus der aktuellen Seite: alle Stylesheets inline, der Body
// als statisches Markup (ohne Skripte). So ist der Anhang identisch zum
// Browser-Ausdruck.
//
// Wichtig für den Umfang: Alles mit `no-print` wird aus dem Klon ENTFERNT statt
// nur ausgeblendet. Im Druck wäre es ohnehin unsichtbar – im HTML wiegt es aber
// schwer: Die Foto-Miniaturen der Baudokumentation tragen dieselben data:-URLs
// wie die großen Tafeln im Anhang. Mit ihnen im Markup wird jedes Foto doppelt
// übertragen und im Rendering doppelt dekodiert.
//
// imageBudget: Byte-Obergrenze für ALLE Bilder des Dokuments zusammen. Die
// Bilder im Klon werden so weit verkleinert, dass der Anhang unter der Grenze
// des Mailversands bleibt (Microsoft Graph: 3 MB beim direkten Versand). Das
// greift auch für Bestandsfotos, die vor der Verkleinerung beim Hereinladen
// abgelegt wurden. Ohne imageBudget bleiben die Bilder unverändert.
const MAIL_IMAGE_BUDGET = 2.5 * 1024 * 1024   // 3 MB abzüglich Text, Schriften, PDF-Struktur

export async function collectPrintHtml({ imageBudget = null, imageSelector = 'img[src^="data:image"]' } = {}) {
  const css = Array.from(document.styleSheets).map(s => {
    try { return Array.from(s.cssRules).map(r => r.cssText).join('\n') } catch { return '' }
  }).join('\n')

  const clone = document.body.cloneNode(true)
  clone.querySelectorAll('script, .no-print').forEach(el => el.remove())

  let imageInfo = null
  if (imageBudget) {
    const imgs = Array.from(clone.querySelectorAll(imageSelector))
      .filter(img => !img.closest('.print-footer'))   // Logos in Kopf/Fuß bleiben
    if (imgs.length) {
      // Budget je Bild: gleichmäßig verteilt, nach oben gedeckelt auf die
      // Ablagegröße (mehr bringt im Druck nichts), nach unten auf 40 KB –
      // darunter würde ein Foto seinen Dokumentationswert verlieren.
      const perImage = Math.max(40 * 1024, Math.min(PHOTO_TARGET_BYTES, Math.floor(imageBudget / imgs.length)))
      let before = 0, after = 0
      for (const img of imgs) {
        const src = img.getAttribute('src')
        before += Math.floor((src.length - src.indexOf(',') - 1) * 3 / 4)
        const small = await shrinkDataUrl(src, { targetBytes: perImage })
        img.setAttribute('src', small)
        after += Math.floor((small.length - small.indexOf(',') - 1) * 3 / 4)
      }
      imageInfo = { count: imgs.length, perImage, before, after }
    }
  }

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head>`
    + `<body class="${document.body.className}">${clone.innerHTML}</body></html>`
  return { html, imageInfo }
}

export { MAIL_IMAGE_BUDGET }
