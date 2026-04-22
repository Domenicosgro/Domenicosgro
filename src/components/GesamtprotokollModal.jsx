import React from 'react'
import { X, Printer, Layers } from 'lucide-react'
import { formatDate, buildProtocolNo, getChainNo } from '../utils'

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildChain(protocol, allProtocols) {
  const chain = []
  let curr = protocol
  const visited = new Set()
  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id)
    chain.unshift(curr)
    curr = curr.predecessorId ? allProtocols.find(p => p.id === curr.predecessorId) : null
    if (chain.length > 100) break
  }
  return chain
}

function buildPrintHtml(chain, allProtocols, logoDataUrl, today) {
  const project = chain[chain.length - 1]
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="height:40px;max-width:120px;object-fit:contain;display:block;">`
    : '<div style="height:40px"></div>'

  const sections = chain.map((protocol, pi) => {
    const chainNo    = getChainNo(protocol, allProtocols)
    const protocolNo = buildProtocolNo(protocol.projectName, protocol.date, chainNo, protocol.meetingType)
    const items      = protocol.agendaItems ?? []

    const itemRows = items.map((item, i) => {
      const lvl  = item.level ?? 1
      const pl   = lvl === 2 ? '8mm' : lvl === 3 ? '16mm' : '0'
      const done = item.status === 'erledigt'
      const gray = done && item.carriedGray
      return `<tr style="${gray ? 'color:#bbb;' : ''}">
        <td style="padding:1mm 2mm 1mm ${pl};font-weight:${lvl === 1 ? 'bold' : 'normal'};white-space:nowrap;width:14mm;vertical-align:top;border-bottom:0.3pt solid #eee;">${esc(item.no || String(i + 1))}</td>
        <td style="padding:1mm 2mm;vertical-align:top;white-space:nowrap;width:20mm;border-bottom:0.3pt solid #eee;">${item.createdAt ? formatDate(item.createdAt.slice(0, 10)) : '–'}</td>
        <td style="padding:1mm 2mm;vertical-align:top;font-weight:${lvl === 1 ? 'bold' : 'normal'};border-bottom:0.3pt solid #eee;${done ? 'text-decoration:line-through;' : ''}">${esc(item.topic || '–')}</td>
        <td style="padding:1mm 2mm;vertical-align:top;color:#444;border-bottom:0.3pt solid #eee;">${esc(item.discussion || '')}</td>
        <td style="padding:1mm 2mm;vertical-align:top;white-space:nowrap;width:26mm;border-bottom:0.3pt solid #eee;">${esc(item.assignedTo || '–')}</td>
        <td style="padding:1mm 2mm;vertical-align:top;text-align:center;width:16mm;border-bottom:0.3pt solid #eee;">${done ? '✓' : '○'}</td>
      </tr>`
    }).join('')

    return `<div style="margin-top:${pi > 0 ? '8mm' : '0'};${pi < chain.length - 1 ? 'padding-bottom:6mm;border-bottom:0.5pt solid #ccc;' : ''}">
      <table style="width:100%;border-collapse:collapse;margin-bottom:2mm;">
        <tr>
          <td>
            <div style="font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:#777;">${pi + 1}. Sitzung</div>
            <div style="font-size:11pt;font-weight:bold;">${esc(protocol.meetingType)} · ${formatDate(protocol.date)}</div>
            <div style="font-size:7pt;color:#777;font-family:monospace;">${esc(protocolNo)}</div>
          </td>
          <td style="text-align:right;font-size:7pt;color:#777;vertical-align:bottom;">
            ${protocol.location ? `${esc(protocol.location)}<br>` : ''}${protocol.preparedBy ? `Erstellt: ${esc(protocol.preparedBy)}` : ''}
          </td>
        </tr>
      </table>
      ${items.length === 0
        ? '<p style="font-size:7.5pt;color:#aaa;font-style:italic;margin:2mm 0;">Keine Protokollpunkte.</p>'
        : `<table style="width:100%;border-collapse:collapse;font-size:7.5pt;">
            <thead>
              <tr style="border-bottom:0.5pt solid #000;">
                <th style="text-align:left;padding:1mm 2mm;font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;width:14mm;">Nr.</th>
                <th style="text-align:left;padding:1mm 2mm;font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;width:20mm;">Erstellt</th>
                <th style="text-align:left;padding:1mm 2mm;font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;">Thema</th>
                <th style="text-align:left;padding:1mm 2mm;font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;">Inhalt</th>
                <th style="text-align:left;padding:1mm 2mm;font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;width:26mm;">Zugewiesen</th>
                <th style="text-align:center;padding:1mm 2mm;font-size:6.5pt;text-transform:uppercase;letter-spacing:.05em;width:16mm;">Status</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>`
      }
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<title>Gesamtprotokoll – ${esc(project?.projectName ?? '')}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; margin: 0; background: #fff; }
</style></head><body>
<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1pt solid #000;padding-bottom:4mm;margin-bottom:8mm;">
  <div>${logoHtml}</div>
  <div style="text-align:right;line-height:1.4;">
    <div style="font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:#555;">Gesamtprotokoll</div>
    <div style="font-size:15pt;font-weight:bold;">${esc(project?.projectName ?? '')}</div>
    <div style="font-size:7pt;color:#555;">${chain.length} Sitzung${chain.length !== 1 ? 'en' : ''} · Stand: ${formatDate(today)}</div>
  </div>
</div>
${sections}
</body></html>`
}

export default function GesamtprotokollModal({ protocol, protocols, logoDataUrl, onClose }) {
  const today      = new Date().toISOString().slice(0, 10)
  const chain      = buildChain(protocol, protocols)
  const totalItems = chain.reduce((s, p) => s + (p.agendaItems ?? []).length, 0)

  const handlePrint = () => {
    const html   = buildPrintHtml(chain, protocols, logoDataUrl, today)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()

    const doPrint = () => {
      iframe.style.visibility = 'visible'
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe)
      }, 2000)
    }

    const img = doc.querySelector('img')
    if (img && !img.complete) {
      img.onload = doPrint; img.onerror = doPrint
    } else {
      setTimeout(doPrint, 150)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">Gesamtprotokoll</h2>
            <span className="badge-gray">{chain.length} Sitzung{chain.length !== 1 ? 'en' : ''}</span>
            <span className="badge-gray">{totalItems} Punkte</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs" onClick={handlePrint}>
              <Printer size={14} /> Drucken / PDF
            </button>
            <button className="btn-ghost p-2" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Preview */}
        <div className="overflow-auto flex-1 p-8 bg-gray-50">
          <div className="bg-white shadow-sm rounded-lg p-8 max-w-4xl mx-auto space-y-8">

            {/* Document header */}
            <div className="flex items-end justify-between pb-4 border-b border-black">
              <div className="flex-shrink-0">
                {logoDataUrl
                  ? <img src={logoDataUrl} alt="Logo" className="h-10 max-w-[120px] object-contain" />
                  : <div className="h-10 w-8" />
                }
              </div>
              <div className="text-right leading-tight">
                <div className="text-xs uppercase tracking-widest text-gray-500">Gesamtprotokoll</div>
                <div className="text-xl font-bold text-gray-900 mt-0.5">{protocol.projectName || '–'}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {chain.length} Sitzung{chain.length !== 1 ? 'en' : ''} · Stand: {formatDate(today)}
                </div>
              </div>
            </div>

            {/* Protocol sections */}
            {chain.map((p, pi) => {
              const chainNo    = getChainNo(p, protocols)
              const protocolNo = buildProtocolNo(p.projectName, p.date, chainNo, p.meetingType)
              const items      = p.agendaItems ?? []

              return (
                <div key={p.id} className={pi > 0 ? 'pt-6 border-t border-gray-200' : ''}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">{pi + 1}. Sitzung</div>
                      <div className="text-base font-bold text-gray-900">{p.meetingType} · {formatDate(p.date)}</div>
                      <div className="text-xs font-mono text-gray-400">{protocolNo}</div>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      {p.location  && <div>{p.location}</div>}
                      {p.preparedBy && <div>Erstellt: {p.preparedBy}</div>}
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Keine Protokollpunkte.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-black text-xs uppercase tracking-wide text-gray-500">
                          <th className="text-left pb-1.5 pr-2 w-10">Nr.</th>
                          <th className="text-left pb-1.5 pr-2 w-20">Erstellt</th>
                          <th className="text-left pb-1.5 pr-2">Thema</th>
                          <th className="text-left pb-1.5 pr-2">Inhalt</th>
                          <th className="text-left pb-1.5 pr-2 w-28">Zugewiesen</th>
                          <th className="text-center pb-1.5 w-14">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((item, i) => {
                          const lvl  = item.level ?? 1
                          const done = item.status === 'erledigt'
                          const gray = done && item.carriedGray
                          return (
                            <tr key={item.id} className={gray ? 'text-gray-300' : ''}>
                              <td
                                className={`py-1.5 pr-2 ${lvl === 1 ? 'font-bold' : lvl === 2 ? 'font-semibold' : 'font-medium'}`}
                                style={{ paddingLeft: lvl === 2 ? '1rem' : lvl === 3 ? '2rem' : undefined }}
                              >
                                {item.no || String(i + 1)}
                              </td>
                              <td className="py-1.5 pr-2 tabular-nums text-gray-500">
                                {item.createdAt ? formatDate(item.createdAt.slice(0, 10)) : '–'}
                              </td>
                              <td className={`py-1.5 pr-2 ${lvl === 1 ? 'font-bold' : lvl === 2 ? 'font-semibold' : ''} ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {item.topic || '–'}
                              </td>
                              <td className="py-1.5 pr-2 text-gray-500 max-w-xs">
                                <span className="line-clamp-2">{item.discussion || ''}</span>
                              </td>
                              <td className="py-1.5 pr-2 text-gray-500">{item.assignedTo || '–'}</td>
                              <td className="py-1.5 text-center text-gray-500">{done ? '✓' : '○'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
