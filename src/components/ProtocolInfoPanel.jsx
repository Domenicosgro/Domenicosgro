import React from 'react'
import { Info, X } from 'lucide-react'

// ── Seitliches Info-Panel im Protokoll-Editor ────────────────────────────────
// Dritter Reiter neben Notizen und Maßnahmen. Zeigt die projektweite Liste der
// Punkte mit der Zuständigkeit "Info" – auch die bereits freigemeldeten, die
// aus dem Protokoll herausgefallen sind.
// Kein Backdrop: das Protokoll bleibt parallel bedienbar.
export default function ProtocolInfoPanel({ open, onOpenChange, count = 0, children }) {
  return (
    <>
      {/* Seitlicher Aufklapp-Reiter (unter dem Maßnahmen-Reiter) */}
      {!open && (
        <button
          className="fixed right-0 top-2/3 z-30 flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-2.5 py-3 rounded-l-lg shadow-lg no-print"
          style={{ writingMode: 'vertical-rl' }}
          onClick={() => onOpenChange(true)}
          title="Info-Punkte des Projekts (auch freigemeldete)"
        >
          <Info size={15} /> Infos{count > 0 ? ` (${count})` : ''}
        </button>
      )}

      {open && (
        <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-md bg-white border-l border-gray-200 shadow-2xl flex flex-col no-print">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <Info size={16} className="text-brand-600" /> Info-Punkte des Projekts
            </h3>
            <button className="btn-ghost p-1" title="Infos schließen" onClick={() => onOpenChange(false)}><X size={16} /></button>
          </div>
          <p className="px-4 py-1.5 text-[11px] text-gray-400 border-b border-gray-100 bg-gray-50/60">
            Alle Protokollpunkte mit der Zuständigkeit „Info“ – auch die, die nach der Freimeldung aus dem Protokoll entfallen sind.
          </p>
          <div className="flex-1 overflow-y-auto p-3">
            {children}
          </div>
        </div>
      )}
    </>
  )
}
