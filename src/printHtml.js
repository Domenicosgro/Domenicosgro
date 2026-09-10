// ── Druck-HTML für das serverseitige PDF einsammeln ──────────────────────────
// Das PDF entsteht aus der aktuellen Seite: alle Stylesheets inline, der Body
// als statisches Markup (ohne Skripte). So ist der Anhang identisch zum
// Browser-Ausdruck.
//
// Wichtig für den Umfang: Alles mit `no-print` wird aus dem Klon ENTFERNT statt
// nur ausgeblendet. Im Druck wäre es ohnehin unsichtbar – im HTML wiegt es aber
// schwer: Die Foto-Miniaturen der Baudokumentation tragen dieselben data:-URLs
// wie die großen Tafeln im Anhang. Mit ihnen im Markup wird jedes Foto doppelt
// übertragen und im Rendering doppelt dekodiert; bei 20–30 Fotos reichte das,
// um das Rendering auf der NAS in den Zeitüberlauf zu treiben.
export function collectPrintHtml() {
  const css = Array.from(document.styleSheets).map(s => {
    try { return Array.from(s.cssRules).map(r => r.cssText).join('\n') } catch { return '' }
  }).join('\n')

  const clone = document.body.cloneNode(true)
  clone.querySelectorAll('script, .no-print').forEach(el => el.remove())

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head>`
    + `<body class="${document.body.className}">${clone.innerHTML}</body></html>`
}
