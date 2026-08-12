import React from 'react'
import { CheckSquare, X } from 'lucide-react'

// ── Seitliches Maßnahmen-Panel im Protokoll-Editor ────────────────────────────
// Rechtsseitiger Reiter (wie die Notizen), der ein andockendes Panel öffnet.
// Der eigentliche Editor (ActionItems) wird als children übergeben; damit
// arbeiten Panel, Inline-Druckansicht und Maßnahmenkachel auf DERSELBEN
// Datenquelle (protocol.actionItems) → automatisch synchron.
// Kein Backdrop: das Protokoll bleibt parallel bedienbar.
export default function ProtocolActionsPanel({ open, onOpenChange, openCount = 0, children }) {
  return (
    <>
      {/* Seitlicher Aufklapp-Reiter (unter dem Notizen-Reiter) */}
      {!open && (
        <button
          className="fixed right-0 top-1/2 z-30 flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-2.5 py-3 rounded-l-lg shadow-lg no-print"
          style={{ writingMode: 'vertical-rl' }}
          onClick={() => onOpenChange(true)}
          title="Maßnahmen & Aufgaben zum Protokoll"
        >
          <CheckSquare size={15} /> Maßnahmen{openCount > 0 ? ` (${openCount})` : ''}
        </button>
      )}

      {open && (
        <div className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-md bg-white border-l border-gray-200 shadow-2xl flex flex-col no-print">
          {/* Kopf */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <CheckSquare size={16} className="text-brand-600" /> Maßnahmen &amp; Aufgaben
            </h3>
            <button className="btn-ghost p-1" title="Maßnahmen schließen" onClick={() => onOpenChange(false)}><X size={16} /></button>
          </div>
          <p className="px-4 py-1.5 text-[11px] text-gray-400 border-b border-gray-100 bg-gray-50/60">
            Änderungen wirken sofort im Protokoll und in der Maßnahmenkachel.
          </p>
          <div className="flex-1 overflow-y-auto p-3">
            {children}
          </div>
        </div>
      )}
    </>
  )
}
