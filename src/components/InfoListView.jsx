import React, { useMemo } from 'react'
import { ArrowLeft, Info, Printer } from 'lucide-react'
import { formatDate, infoItemsForProject } from '../utils'
import InfoItemsList from './InfoItemsList'
import PrintSheet from './PrintSheet'

// ── Info-Liste je Projekt (eigene Ansicht) ───────────────────────────────────
// Sammelt die Protokollpunkte mit der Zuständigkeit "Info" über alle Protokolle
// des Projekts – vor allem die freigemeldeten, die aus dem Protokoll heraus-
// gefallen sind. Durchsuchbar und druckbar; Kopf- und Fußzeile wie im Bericht.
export default function InfoListView({ project, protocols = [], allProtocols,
                                       logoDataUrl, clientLogoDataUrl, onOpenProtocol, onBack }) {
  const rows = useMemo(
    () => infoItemsForProject(protocols, allProtocols ?? protocols),
    [protocols, allProtocols])
  const closedCount = rows.filter(r => r.closed).length

  return (
    <div className="app-page">
    <PrintSheet>
      {/* Druckkopf wie in den übrigen Berichten (Logos links, Titel rechts) */}
      <div className="hidden print:block mb-4">
        <div className="flex items-end justify-between pb-3 border-b border-black">
          <div className="flex-shrink-0 flex items-end gap-4">
            {logoDataUrl
              ? <img src={logoDataUrl} alt="Büro-Logo" className="h-12 max-w-[150px] object-contain" />
              : <div className="h-12 w-8" />}
            {clientLogoDataUrl && (
              <img src={clientLogoDataUrl} alt="Auftraggeber-Logo" className="h-12 max-w-[150px] object-contain" />
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest">Info-Punkte</div>
            <div className="text-xl font-bold">{project.name}</div>
            <div className="text-xs">
              {rows.length} Punkt{rows.length === 1 ? '' : 'e'} · {closedCount} freigemeldet · Stand {formatDate(new Date().toISOString().slice(0, 10))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 no-print">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Dashboard</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <Info size={22} className="text-brand-600" /> Info-Punkte
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {project.name} · {rows.length} Punkt{rows.length === 1 ? '' : 'e'} · {closedCount} freigemeldet
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <button className="btn-secondary" onClick={() => window.print()}><Printer size={15} /> Drucken</button>
        )}
      </div>

      <div className="card p-4">
        <InfoItemsList rows={rows} onOpenProtocol={onOpenProtocol} />
      </div>

    </PrintSheet>

      {/* Fußzeile auf jeder Druckseite */}
      <div className="print-footer hidden print:flex">
        <span className="font-bold">Info-Punkte · {project.name}</span>
        <span>Stand {formatDate(new Date().toISOString().slice(0, 10))}</span>
      </div>
    </div>
  )
}
