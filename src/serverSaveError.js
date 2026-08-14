// Behandelt nicht-erfolgreiche Server-Antworten beim Speichern.
// 409 (Versionskonflikt) lösen die Hooks selbst auf → hier durchlassen.
// 401 (Sitzung abgelaufen) und andere Serverfehler MÜSSEN sichtbar werden,
// damit Änderungen nicht stillschweigend verloren gehen (z. B. neu angelegte
// Projekte, die den Server nie erreichen). Netzwerk-Aussetzer (fetch wirft eine
// Exception) werden weiterhin in den Hooks toleriert – hier geht es nur um
// tatsächliche Server-Antworten (res).
export function assertSaveOk(res, label) {
  if (res.ok || res.status === 409) return
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('kp-auth-expired'))
    const e = new Error('Sitzung abgelaufen – Änderungen wurden NICHT gespeichert. '
      + 'Bitte in einem NEUEN Browser-Tab neu anmelden und danach hier weiterarbeiten; '
      + 'diesen Tab NICHT neu laden, sonst gehen die ungespeicherten Eingaben verloren.')
    e.authExpired = true
    throw e
  }
  throw new Error(`${label} fehlgeschlagen (Server ${res.status}) – nicht gespeichert.`)
}
