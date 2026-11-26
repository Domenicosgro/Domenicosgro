// ── Pläne: die reinen Auskünfte ──────────────────────────────────────────────
//
// Absichtlich eine eigene, winzige Datei ohne jeden Bezug auf pdfjs. Die
// Baustellen-Oberfläche und die Pin-Komponente brauchen nur diese Auskünfte;
// das Wandeln von PDF-Seiten in Bilder steht in src/planVorschau.js und wird
// nur dort nachgeladen, wo es wirklich gebraucht wird (Büro, Rechner).

const istPdf = (mime, name = '') => (mime || '').includes('pdf') || /\.pdf$/i.test(name)

/** Braucht dieser Plan eine Vorschau, um bepinnbar zu sein? Bilder sind schon eine. */
export const brauchtVorschau = (plan) => !!plan?.hasFile && istPdf(plan.mimeType, plan.filename)

/** Liegt ein Bild vor, auf das man pinnen kann? */
export const planBepinnbar = (plan) =>
  !!plan?.hasFile && (!brauchtVorschau(plan) || (plan.vorschauSeiten || []).length > 0)

/** Ist DIESE Seite als Bild da? */
export const seiteBereit = (plan, seite = 1) =>
  !plan?.hasFile ? false
  : !brauchtVorschau(plan) ? true
  : (plan.vorschauSeiten || []).includes(seite)

/**
 * Bild-Adresse im Protokolltool: Vorschau beim PDF, sonst die Plandatei.
 * Die Baustellen-Oberfläche hat ihren eigenen Weg über die Fassade und
 * übergibt der Pin-Komponente deshalb ein eigenes `bildUrl`.
 */
export function planBildUrl(projectId, plan, seite = 1, token = null) {
  if (!plan?.hasFile) return null
  const t = token ? `token=${encodeURIComponent(token)}` : ''
  const basis = `/api/projects/${encodeURIComponent(projectId)}/plans/${encodeURIComponent(plan.id)}`
  return brauchtVorschau(plan)
    ? `${basis}/vorschau?seite=${seite}${t ? `&${t}` : ''}`
    : `${basis}/file${t ? `?${t}` : ''}`
}
