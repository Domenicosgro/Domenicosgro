'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Stammdaten-Schnittstelle  (Phase 1 aus komplizen-dashboard/docs/ARCHITEKTUR_STAMMDATEN.md)
//
// Eine Fassade vor der vorhandenen Datenhaltung: intern aendert sich nichts, aber
// andere Anwendungen sprechen ab jetzt NUR noch diese Routen und nie die
// Datenbank. Erster Nutzer ist die Personalplanung, die ins Dashboard umzieht
// und von dort Projekte und Mitarbeiter braucht.
//
// Besitzprinzip: Projekte und Mitarbeiter gehoeren dem Protokolltool und werden
// hier nur gelesen. Die einzige Ausnahme ist das Projektteam - das pflegt die
// Personalplanung, deshalb darf sie es schreiben.
//
// Datensparsamkeit: Kontakte werden bewusst NICHT herausgegeben. Die
// Personalplanung braucht sie nicht, und ein Teil davon kann projektweise
// verschluesselt sein.
// ─────────────────────────────────────────────────────────────────────────────

// Beauftragungsgrad - identisch zu auftrag() in gelaende.js, damit beide
// Seiten denselben Bauzustand ableiten.
function beauftragung(projectData) {
  const d = projectData || {}
  const lph = Object.entries(d.lph || {})
    .filter(([, v]) => v?.beauftragt)
    .map(([k]) => parseInt(k, 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const pre = Object.entries(d.preLeistungen || {})
    .filter(([, v]) => v?.beauftragt)
    .map(([k]) => k)
  return { lph, pre, beauftragt: lph.length > 0 || pre.length > 0 }
}

// Die Aussensicht eines Projekts. Bewusst schmal: was hier nicht steht, ist
// entweder Sache des Protokolltools oder muss bewusst ergaenzt werden.
function projektAussen(p) {
  const d = p.projectData || {}
  return {
    id:           p.id,
    name:         p.name || '',
    nummer:       d.nummer || '',
    kuerzel:      d.kuerzel || '',
    bezeichnung:  d.bezeichnung || '',
    gesellschaft: d.gesellschaft || '',
    vertrag:      d.vertrag || '',
    generalplanung: !!d.isGeneralplanung,
    beauftragung: beauftragung(d),
    team: (p.team || []).map(t => ({
      id:       t.id,
      name:     t.name || '',
      username: t.username || null,
      rolle:    t.role || '',
      anteil:   typeof t.anteil === 'number' ? t.anteil : null,
    })),
    hex:       d.hex || null,
    archived:  !!p.archived,
    updatedAt: p._updatedAt || null,
  }
}

function mitarbeiterAussen(s) {
  return {
    id:           s.id,
    name:         s.name || '',
    funktion:     s.funktion || '',
    username:     s.username || null,
    weeklyHours:  s.weeklyHours ?? null,
    dayHours:     s.dayHours || null,
    active:       s.active !== false,
    // 'contact' = aus einem Kontakt der eigenen Organisation gespiegelt.
    // Solche Eintraege werden im Protokolltool ueber die Kontaktkategorie
    // gesteuert und duerfen von aussen nicht bearbeitet werden.
    quelle:       s.source || 'manuell',
    updatedAt:    s._updatedAt || null,
  }
}

// ── Router ───────────────────────────────────────────────────────────────────
// `schutz` ist eine Express-Middleware, die den Aufrufer prueft (siehe
// index.js): entweder der Stammdaten-Schluessel oder eine normale Sitzung.
function registerStammdaten(app, db, schutz) {
  // Lebenszeichen - damit das Dashboard beim Start sagen kann, ob die Quelle
  // erreichbar ist, ohne gleich alle Projekte zu ziehen.
  app.get('/api/stammdaten/health', schutz, (req, res) => {
    res.json({
      ok: true,
      quelle: 'komplizen-protokolle',
      projekte: db.projects.list().length,
      mitarbeiter: db.staffMembers.list().length,
      zeit: new Date().toISOString(),
    })
  })

  // Projekte. `?archiviert=1` nimmt archivierte mit auf (Standard: ohne).
  app.get('/api/stammdaten/projekte', schutz, (req, res) => {
    try {
      const mitArchiv = req.query.archiviert === '1'
      const rows = db.projects.list()
        .filter(p => mitArchiv || !p.archived)
        .map(projektAussen)
        .sort((a, b) => (a.nummer || a.name).localeCompare(b.nummer || b.name, 'de'))
      res.json({ projekte: rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/stammdaten/projekte/:id', schutz, (req, res) => {
    const p = db.projects.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    res.json(projektAussen(p))
  })

  // Projektteam schreiben - die einzige Schreiboperation. Alles andere am
  // Projekt bleibt dem Protokolltool vorbehalten.
  app.put('/api/stammdaten/projekte/:id/team', schutz, (req, res) => {
    const p = db.projects.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Projekt nicht gefunden.' })

    const eingang = req.body?.team
    if (!Array.isArray(eingang)) {
      return res.status(400).json({ error: 'Feld "team" muss eine Liste sein.' })
    }
    // Nur die bekannten Felder uebernehmen: ein fremder Aufrufer soll dem
    // Projekt nichts unterschieben koennen.
    const team = eingang.map(t => ({
      id:       String(t.id || ''),
      name:     String(t.name || ''),
      username: t.username || null,
      role:     String(t.rolle ?? t.role ?? ''),
      anteil:   typeof t.anteil === 'number' ? t.anteil : 0,
    })).filter(t => t.id && (t.name || t.username))

    // Der Store sperrt optimistisch. Ein Konflikt heisst hier: jemand hat das
    // Projekt waehrenddessen geaendert. Einmal mit frischem Stand nachfassen
    // genuegt - das Team ist ein eigenes Feld, die fremde Aenderung betraf
    // fast sicher etwas anderes. Bleibt es dabei, sagen wir es ehrlich.
    try {
      let aktuell = p
      for (let versuch = 0; versuch < 2; versuch++) {
        const r = db.projects.update(
          aktuell.id,
          { ...aktuell, team, updatedAt: new Date().toISOString() },
          aktuell._version,
          req.user || '__stammdaten__',
        )
        if (r.notFound) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
        if (!r.conflict) return res.json(projektAussen(db.projects.get(aktuell.id)))
        aktuell = r.serverData
      }
      res.status(409).json({ error: 'Projekt wurde zwischenzeitlich geändert. Bitte erneut versuchen.' })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Mitarbeiter (Personalplanung). Nur lesen: gespiegelte Eintraege haengen an
  // den Kontakten, eigene werden im Protokolltool gepflegt.
  app.get('/api/stammdaten/mitarbeiter', schutz, (req, res) => {
    try {
      const rows = db.staffMembers.list()
        .map(mitarbeiterAussen)
        .filter(m => req.query.inaktiv === '1' || m.active)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      res.json({ mitarbeiter: rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

module.exports = { registerStammdaten, projektAussen, mitarbeiterAussen, beauftragung }
