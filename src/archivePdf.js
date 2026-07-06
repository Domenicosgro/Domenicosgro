import { PDFDocument } from 'pdf-lib'
import { buildProtocolPdf } from './protocolPdf'
import { getChainNo, buildProtocolNo } from './utils'

/**
 * Gesamtprotokoll-PDF für ein Projekt: alle Protokolle chronologisch,
 * jedes über den bestehenden Einzel-PDF-Renderer erzeugt und zu einem
 * Dokument zusammengeführt. Rückgabe: base64-String.
 */
export async function buildProjectArchivePdf(project, projectProtocols, allProtocols, logoDataUrl, clientLogoDataUrl) {
  const sorted = [...projectProtocols].sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') ||
    (a.createdAt || '').localeCompare(b.createdAt || '')
  )
  if (sorted.length === 0) return null

  const merged = await PDFDocument.create()
  merged.setTitle(`Gesamtprotokoll – ${project.name || 'Projekt'}`)
  merged.setCreationDate(new Date())

  for (const protocol of sorted) {
    const chainNo    = getChainNo(protocol, allProtocols)
    const protocolNo = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)
    const base64     = await buildProtocolPdf(protocol, protocolNo, logoDataUrl, clientLogoDataUrl)
    const src        = await PDFDocument.load(base64)
    const pages      = await merged.copyPages(src, src.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }

  return merged.saveAsBase64()
}

/** base64-PDF als Datei-Download auslösen (Browser). */
export function downloadPdfBase64(base64, filename) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const blob  = new Blob([bytes], { type: 'application/pdf' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
