'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Mängel: Status folgt den Maßnahmen
//
// Ein Mangel wird über „in Protokoll übernehmen" zu einer Maßnahme mit
// Zuständigem und Frist (handleAddDefectToProtocol in src/App.jsx). Die
// Maßnahme trägt dabei `defectId` – die Rückverweis-Kennung auf den Mangel.
//
// Bis zum 26.11.2026 wurde diese Kennung geschrieben und **nie gelesen**.
// Meldete die Firma die Maßnahme frei, blieb der Mangel in der Mängelliste auf
// „offen". Die Liste, die bis zur Abnahme geführt wird, lief damit
// auseinander – unbemerkt, denn beide Seiten sahen für sich richtig aus.
//
// Diese Datei schließt den Rückkanal. Eine Richtung, ein Feld:
//
//   Maßnahme „erledigt"   → Mangel „behoben"
//   Maßnahme „in Arbeit"  → Mangel „in Arbeit"
//   Maßnahme „offen"      → Mangel „offen"     (auch zurück: abgelehnte
//                                               Freimeldung heißt Nachbessern)
//   Maßnahme „verschoben" → keine Änderung      (eine Frist, kein Zustand)
//
// Was bewusst NICHT mitläuft:
//
// - **„Abgenommen" bleibt Handarbeit.** Behoben sagt die Firma, abgenommen
//   sagt das Büro. Ein Mangel in diesem Zustand wird hier nie mehr angefasst.
// - **Die Frist nicht.** Sie steht am Mangel und an der Maßnahme und ist in
//   beiden Fällen von Hand änderbar. Würde sie in eine Richtung mitlaufen,
//   würde die alte Frist der Maßnahme die neue am Mangel überschreiben –
//   Verschlimmbesserung. Eine Richtung heißt: nur der Status.
//
// Hängen an einem Mangel mehrere Maßnahmen (in zwei Protokollen übernommen),
// gilt die **am wenigsten fortgeschrittene**: behoben ist er erst, wenn alle
// erledigt sind.
// ─────────────────────────────────────────────────────────────────────────────

// Rangfolge der Maßnahmen-Zustände (ACTION_STATUSES in src/utils.js)
const RANG = { offen: 0, in_arbeit: 1, erledigt: 2 }
const VON_RANG = ['offen', 'in_arbeit', 'erledigt']

// Maßnahmen-Zustand → Mangel-Zustand (STATUS in MaengelView.jsx)
const AUF_MANGEL = { offen: 'offen', in_arbeit: 'in_arbeit', erledigt: 'behoben' }

// Ende der Fahnenstange: sagt das Büro, nicht die Firma.
const ABGENOMMEN = 'abgenommen'

/**
 * Baut die Spiegelung. Rückgabe: spiegle(protocolId, by, req?) → Anzahl der
 * geänderten Mängel.
 *
 * Wird nach jeder Änderung an einem Protokoll aufgerufen – auch nach jedem
 * Zwischenspeichern im Editor. Deshalb bricht sie früh ab, wenn das Protokoll
 * keine Maßnahme mit `defectId` hat; das ist der Normalfall.
 */
function mangelSpiegel({ db, broadcast, logEvent, displayName }) {
  return function spiegle(protocolId, by, req = null) {
    try {
      const proto = db.protocols.get(protocolId)
      if (!proto || !proto.projectId) return 0

      const betroffen = new Set(
        (Array.isArray(proto.actionItems) ? proto.actionItems : [])
          .map(a => a && a.defectId)
          .filter(Boolean))
      if (!betroffen.size) return 0

      // Maßnahmen zu diesen Mängeln können in mehreren Protokollen des
      // Projekts stehen – alle zusammentragen.
      const protos = db.protocols.list().filter(p => p.projectId === proto.projectId)
      let geaendert = 0

      for (const defectId of betroffen) {
        const zustaende = []
        for (const p of protos) {
          for (const a of (Array.isArray(p.actionItems) ? p.actionItems : [])) {
            if (a && a.defectId === defectId && RANG[a.status] != null) zustaende.push(RANG[a.status])
          }
        }
        if (!zustaende.length) continue          // nur „verschoben" o. Ä.

        const ziel = AUF_MANGEL[VON_RANG[Math.min(...zustaende)]]
        const mangel = db.defects.get(defectId)
        if (!mangel || mangel.projectId !== proto.projectId) continue
        if (mangel.status === ABGENOMMEN) continue
        if (mangel.status === ziel) continue

        const now = new Date().toISOString()
        const { _version, _updatedAt, ...daten } = mangel
        const ergebnis = db.defects.update(defectId, {
          ...daten,
          status: ziel,
          // Woher der Zustand kommt – damit in der Mängelliste steht, dass das
          // nicht jemand von Hand gesetzt hat.
          statusQuelle: 'massnahme',
          statusAm:     now,
          statusDurch:  displayName ? displayName(by) : (by || ''),
          updatedAt:    now,
        }, _version, by)

        if (ergebnis && (ergebnis.conflict || ergebnis.notFound)) continue
        geaendert++
        if (broadcast) broadcast('defect', 'update', defectId, now)
        if (logEvent && req) logEvent('MANGEL_STATUS', req, `defect=${defectId} status=${ziel} quelle=massnahme`)
      }
      return geaendert
    } catch {
      // Die Spiegelung darf das Speichern eines Protokolls nie zum Scheitern
      // bringen. Schlägt sie fehl, bleibt der Mangel, wie er war.
      return 0
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dasselbe für Aufgaben aus einer Notiz
//
// Eine Aktennotiz endet oft mit „X kümmert sich bis Freitag". Solche Aufgaben
// lassen sich als Maßnahme in ein Protokoll übernehmen (dort hängen Mahnwesen
// und Freimeldung); die Maßnahme trägt dann `noteId` und `noteTaskId`.
//
// Ab da führt die Maßnahme, und der Zustand in der Notiz folgt ihr – sonst
// müsste man beides pflegen und hätte nach zwei Wochen zwei Wahrheiten.
// Hier gibt es keine Umbenennung der Zustände: Notizaufgaben benutzen
// dieselben vier Werte wie Maßnahmen.
// ─────────────────────────────────────────────────────────────────────────────
function notizSpiegel({ db, broadcast, logEvent, displayName }) {
  return function spiegle(protocolId, by, req = null) {
    try {
      const proto = db.protocols.get(protocolId)
      if (!proto) return 0

      // Je Notiz die betroffenen Aufgaben sammeln – eine Notiz wird höchstens
      // einmal geschrieben, auch wenn mehrere ihrer Aufgaben im Protokoll
      // stehen.
      const nachNotiz = new Map()
      for (const a of (Array.isArray(proto.actionItems) ? proto.actionItems : [])) {
        if (!a || !a.noteId || !a.noteTaskId) continue
        if (!RANG_NOTIZ.includes(a.status)) continue
        if (!nachNotiz.has(a.noteId)) nachNotiz.set(a.noteId, new Map())
        nachNotiz.get(a.noteId).set(a.noteTaskId, a.status)
      }
      if (!nachNotiz.size) return 0

      let geaendert = 0
      for (const [noteId, zustaende] of nachNotiz) {
        const notiz = db.notes.get(noteId)
        if (!notiz) continue
        const aufgaben = Array.isArray(notiz.actionItems) ? notiz.actionItems : []
        let etwas = false
        const neu = aufgaben.map(t => {
          const ziel = t && zustaende.get(t.id)
          if (!ziel || ziel === t.status) return t
          etwas = true
          return { ...t, status: ziel, statusQuelle: 'massnahme', statusAm: new Date().toISOString() }
        })
        if (!etwas) continue

        const now = new Date().toISOString()
        const { _version, _updatedAt, ...daten } = notiz
        const ergebnis = db.notes.update(noteId, { ...daten, actionItems: neu, updatedAt: now }, _version, by)
        if (ergebnis && (ergebnis.conflict || ergebnis.notFound)) continue
        geaendert++
        if (broadcast) broadcast('note', 'update', noteId, now)
        if (logEvent && req) logEvent('NOTIZ_AUFGABE_STATUS', req, `note=${noteId} aus=massnahme`)
      }
      return geaendert
    } catch {
      // Wie bei den Mängeln: eine fehlgeschlagene Spiegelung darf das
      // Speichern des Protokolls nicht aufhalten.
      return 0
    }
  }
}

const RANG_NOTIZ = ['offen', 'in_arbeit', 'erledigt', 'verschoben']

module.exports = { mangelSpiegel, notizSpiegel, AUF_MANGEL, RANG, ABGENOMMEN }
