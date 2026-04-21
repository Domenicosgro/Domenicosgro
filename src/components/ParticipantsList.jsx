import React from 'react'
import { X, Printer, FileDown, Users } from 'lucide-react'
import { formatDate } from '../utils'
import { exportParticipantsListDocx } from '../exportParticipantsList'

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function ParticipantsList({ project, logoDataUrl, onClose }) {
  const today    = new Date().toISOString().slice(0, 10)
  const contacts = project.contacts ?? []

  const handlePrint = () => {
    const logoHtml = logoDataUrl
      ? `<img src="${logoDataUrl}" style="height:48px;max-width:150px;object-fit:contain;display:block;" />`
      : '<div style="height:48px"></div>'

    const rows = contacts.map((c, i) => `
      <tr>
        <td class="nr">${i + 1}</td>
        <td>${esc(c.name)}</td>
        <td>${esc(c.company)}</td>
        <td>${esc(c.role)}</td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.phone)}</td>
      </tr>`).join('')

    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(`<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<title>Projektbeteiligte – ${esc(project.name)}</title>
<style>
  @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
  body  { font-family: Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; }
  .header { display: flex; align-items: flex-end; justify-content: space-between;
            border-bottom: 1pt solid #000; padding-bottom: 4mm; margin-bottom: 8mm; }
  .header-right { text-align: right; line-height: 1.4; }
  .sub  { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; color: #555; }
  .main { font-size: 16pt; font-weight: bold; margin: 1mm 0 0; }
  .date { font-size: 7.5pt; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th { text-align: left; border-bottom: 1pt solid #000; padding: 2mm 3mm 2mm 0;
       font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 1.5mm 3mm 1.5mm 0; border-bottom: .5pt solid #ddd; vertical-align: top; }
  tr:last-child td { border-bottom: 1pt solid #000; }
  .nr { width: 8mm; color: #666; }
</style></head><body>
<div class="header">
  <div>${logoHtml}</div>
  <div class="header-right">
    <div class="sub">Projektbeteiligte</div>
    <div class="main">${esc(project.name)}</div>
    <div class="date">Stand: ${formatDate(today)}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th class="nr">Nr.</th><th>Name</th><th>Firma</th>
    <th>Funktion</th><th>E-Mail</th><th>Telefon</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const handleWord = () => exportParticipantsListDocx(project, logoDataUrl)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">Projektbeteiligtenliste</h2>
            <span className="badge-gray">{contacts.length} Kontakt{contacts.length !== 1 ? 'e' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs" onClick={handleWord}>
              <FileDown size={14} /> Word
            </button>
            <button className="btn-primary text-xs" onClick={handlePrint}>
              <Printer size={14} /> Drucken / PDF
            </button>
            <button className="btn-ghost p-2" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Preview */}
        <div className="overflow-auto flex-1 p-8 bg-gray-50">
          <div className="bg-white shadow-sm rounded-lg p-10 max-w-3xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-end justify-between pb-4 border-b border-black">
              <div className="flex-shrink-0">
                {logoDataUrl
                  ? <img src={logoDataUrl} alt="Logo" className="h-12 max-w-[150px] object-contain" />
                  : <div className="h-12 w-8" />
                }
              </div>
              <div className="text-right leading-tight">
                <div className="text-xs uppercase tracking-widest text-gray-500">Projektbeteiligte</div>
                <div className="text-xl font-bold text-gray-900 mt-0.5">{project.name || '–'}</div>
                <div className="text-xs text-gray-400 mt-0.5">Stand: {formatDate(today)}</div>
              </div>
            </div>

            {/* Contacts table */}
            {contacts.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-8">Keine Kontakte erfasst.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black text-xs uppercase tracking-wide text-gray-500">
                    <th className="text-left pb-2 pr-3 w-8">Nr.</th>
                    <th className="text-left pb-2 pr-3">Name</th>
                    <th className="text-left pb-2 pr-3">Firma</th>
                    <th className="text-left pb-2 pr-3">Funktion</th>
                    <th className="text-left pb-2 pr-3">E-Mail</th>
                    <th className="text-left pb-2">Telefon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map((c, i) => (
                    <tr key={c.id} className="text-xs">
                      <td className="py-2 pr-3 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium text-gray-800">{c.name || <span className="text-gray-300">–</span>}</td>
                      <td className="py-2 pr-3 text-gray-600">{c.company || <span className="text-gray-300">–</span>}</td>
                      <td className="py-2 pr-3 text-gray-500">{c.role || <span className="text-gray-300">–</span>}</td>
                      <td className="py-2 pr-3 text-gray-500">{c.email || <span className="text-gray-300">–</span>}</td>
                      <td className="py-2 text-gray-500">{c.phone || <span className="text-gray-300">–</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Footer line */}
            <div className="flex justify-between text-xs text-gray-400 pt-3 border-t border-black">
              <span className="font-medium">{project.name}</span>
              <span>Stand: {formatDate(today)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
