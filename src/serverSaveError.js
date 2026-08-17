// Behandelt nicht-erfolgreiche Server-Antworten beim Speichern.
// 409 (Versionskonflikt) lösen die Hooks selbst auf → hier durchlassen.
// Alles andere MUSS sichtbar werden, damit Änderungen nicht stillschweigend
// verloren gehen. Netzwerk-Aussetzer (fetch wirft) werden in den Hooks
// toleriert – hier geht es nur um tatsächliche Server-Antworten (res).
//
// WICHTIG: Alle hier geworfenen Fehler sind "wiederholbar" – die Hooks starten
// danach einen automatischen erneuten Speicherversuch, damit keine Arbeit
// verloren geht (siehe scheduleRetry in useProtocols/useProjects).
export function assertSaveOk(res, label) {
  if (res.ok || res.status === 409) return

  if (res.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('kp-auth-expired'))
    const e = new Error('Sitzung abgelaufen – noch nicht gespeichert. Bitte in einem NEUEN '
      + 'Browser-Tab neu anmelden; danach wird automatisch gespeichert. '
      + 'Diesen Tab NICHT neu laden und nicht schließen.')
    e.authExpired = true
    e.retryable   = true
    throw e
  }

  if (res.status === 429) {
    const e = new Error('Server ist gerade ausgelastet – noch nicht gespeichert. '
      + 'Es wird automatisch erneut versucht. Bitte den Tab geöffnet lassen.')
    e.retryable = true
    e.rateLimited = true
    throw e
  }

  const e = new Error(`${label} fehlgeschlagen (Server ${res.status}) – noch nicht gespeichert. `
    + 'Es wird automatisch erneut versucht. Bitte den Tab geöffnet lassen.')
  e.retryable = true
  throw e
}
