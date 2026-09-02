import React from 'react'

// ── Druckbogen mit Platz für die Fußzeile ────────────────────────────────────
// Eine fixe Fußzeile (position: fixed) kennt der Textfluss nicht – der Inhalt
// läuft darunter weiter und wird von ihr überdeckt bzw. von ihrer Trennlinie
// durchschnitten. Chrome reserviert Platz auf JEDER Druckseite nur über eine
// echte Tabelle mit <tfoot> (display: table-footer-group); mit <div>-Attrappen
// funktioniert es nachweislich nicht.
//
// Deshalb: echtes Tabellen-Markup, dessen Elemente am Bildschirm per CSS als
// gewöhnliche Blöcke dargestellt werden (siehe .print-sheet in index.css) –
// das Bildschirmlayout bleibt damit unverändert, im Druck bricht der Text vor
// der Fußzeile um.
export default function PrintSheet({ className = '', children }) {
  return (
    <table className={`print-sheet ${className}`}>
      <tfoot>
        <tr><td><div className="print-footer-space" /></td></tr>
      </tfoot>
      <tbody>
        <tr><td>{children}</td></tr>
      </tbody>
    </table>
  )
}
