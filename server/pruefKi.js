'use strict'

// ── Prüfstation Stufe 2: Prüfung mit Claude ─────────────────────────────────
// Der Server prüft einen Vorgang über die Claude API – mit dem API-Schlüssel des
// Büros. Wer die Prüfstation nutzen darf, kann eine Prüfung starten, auch ohne
// eigenen Claude-Zugang.
//
// Ablauf eines Laufs:
//   1. Skill (nachtragspruefung / rechnungspruefung) aus dem Skill-Ordner auf
//      der NAS lesen und bei Anthropic als Custom Skill anlegen bzw. eine neue
//      Version hochladen, wenn sich etwas geändert hat (Hash in app_state).
//      Die Skills liegen NICHT in Git – sie enthalten Projektdaten.
//   2. Prüfdokumente, Anlagen, Projekt-Standard (_Standard/) und Vorlagen
//      (Vorlage_*.docx im Prüfordner) über die Files API hochladen.
//   3. Messages API mit Code-Ausführung, Container mit den Skills
//      (Custom + Anthropic pdf/docx). Claude legt Ergebnisse in $OUTPUT_DIR.
//   4. Ergebnisdateien herunterladen und unter /data/pruefung/<vorgang>/ ablegen.
//      In den NAS-Ordner kommen sie erst nach Freigabe („… geprüft JJJJ-MM-TT").
//   5. Rückfragen (z. B. Positionsabfrage der Rechnungsprüfung) beantwortet der
//      Bearbeiter in der App; der Lauf geht im selben Container weiter.
//
// Konfiguration (NAS-docker-compose.yml, nie in Git):
//   ANTHROPIC_API_KEY   Schlüssel aus der Anthropic Console (Pflicht)
//   PRUEF_SKILLS_PFAD   NAS-Ordner mit den Skill-Ordnern, z. B.
//                       "/DriveShare/01 Projekte/_Pruefstation/Skills"
//   PRUEF_KI_MODELL     optional, Vorgabe claude-opus-5-5
//   PRUEF_KI_EFFORT     optional, Vorgabe high

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')

const MODELL = () => process.env.PRUEF_KI_MODELL || 'claude-opus-5-5'
const EFFORT = () => process.env.PRUEF_KI_EFFORT || 'high'
const SKILL_FUER_ART = { nachtrag: 'nachtragspruefung', rechnung: 'rechnungspruefung' }
const MAX_RUNDEN = 12            // pause_turn-Fortsetzungen je Lauf
const MAX_DATEI  = 100 * 1024 * 1024
const MAX_GESAMT = 400 * 1024 * 1024   // je Lauf
const MAX_WISSEN = 300                 // Dateien je Projektwissen-Ordner

const ohneHtml = (s) => String(s || '').replace(/<\/(p|li|div|h\d)>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

let Anthropic = null, toFile = null
function sdk() {
  if (!Anthropic) {
    const m = require('@anthropic-ai/sdk')
    Anthropic = m.default || m.Anthropic || m
    toFile = m.toFile
  }
  return { Anthropic, toFile }
}

let _client = null
function client() {
  if (!_client) {
    const { Anthropic: A } = sdk()
    // Lange Läufe (mehrere Minuten) – Zeitlimit großzügig, Streaming ohnehin an
    _client = new A({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30 * 60 * 1000, maxRetries: 2 })
  }
  return _client
}

function konfiguriert() { return !!process.env.ANTHROPIC_API_KEY }
function skillsPfad()   { return String(process.env.PRUEF_SKILLS_PFAD || '').replace(/\/+$/, '') }

function registerPruefKi(app, deps) {
  const { db, fileStation, requireAuth, writeLimiter, canAccessProject, isProjectManager, logEvent, broadcast,
          ANLAGEN_ORDNER, cleanName, uniqueName } = deps
  const DATA_DIR = path.join(process.env.DB_PATH || path.join(__dirname, '..', 'data'), 'pruefung')
  const laufend  = new Set()       // Vorgangs-IDs mit aktivem Lauf
  const displayName = (u) => db.users.get(u)?.display_name || u

  // ── Hilfen: Vorgang lesen/schreiben ──────────────────────────────────────────
  function getVorgang(req, res) {
    const v = db.pruefVorgaenge.get(req.params.id)
    if (!v) { res.status(404).json({ error: 'Prüfvorgang nicht gefunden.' }); return null }
    const project = db.projects.get(v.projectId)
    if (project && !canAccessProject(project, req.user)) { res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' }); return null }
    return v
  }

  function setPruefung(id, patch) {
    for (let i = 0; i < 5; i++) {
      const cur = db.pruefVorgaenge.get(id)
      if (!cur) return
      const { _version, _updatedAt, ...data } = cur
      const pruefung = { ...(data.pruefung || {}), ...patch }
      const updatedAt = new Date().toISOString()
      const r = db.pruefVorgaenge.update(id, { ...data, pruefung, updatedAt }, _version, '__pruefki__')
      if (!r.conflict) { broadcast?.('pruefvorgang', 'update', id, updatedAt); return pruefung }
    }
  }

  const verlaufDatei = (vid) => path.join(DATA_DIR, vid, 'verlauf.json')
  function ladeVerlauf(vid) {
    try { return JSON.parse(fs.readFileSync(verlaufDatei(vid), 'utf8')) } catch { return null }
  }
  function speichereVerlauf(vid, v) {
    fs.mkdirSync(path.dirname(verlaufDatei(vid)), { recursive: true })
    fs.writeFileSync(verlaufDatei(vid), JSON.stringify(v))
  }

  async function nasDatei(pfad) {
    const res = await fileStation.downloadFile(pfad)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_DATEI) throw new Error(`Datei zu groß für die Prüfung: ${pfad}`)
    return buf
  }

  async function listeSicher(p) {
    try { return await fileStation.listFolder(p) } catch { return [] }
  }

  // Alle Dateien eines Ordners rekursiv (für Skill-Ordner)
  async function rekursiv(basis, rel = '') {
    const out = []
    for (const e of await fileStation.listFolder(rel ? `${basis}/${rel}` : basis)) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isdir) out.push(...await rekursiv(basis, r))
      else out.push({ rel: r, path: e.path, size: e.size })
    }
    return out
  }

  // ── 1. Skill synchronisieren ─────────────────────────────────────────────────
  async function skillId(name) {
    const basis = skillsPfad()
    if (!basis) throw new Error('PRUEF_SKILLS_PFAD ist nicht gesetzt – Skill-Ordner auf der NAS festlegen.')
    let dateien
    try { dateien = await rekursiv(`${basis}/${name}`) }
    catch { throw new Error(`Skill-Ordner nicht gefunden: ${basis}/${name}`) }
    if (!dateien.some(d => d.rel === 'SKILL.md')) throw new Error(`${basis}/${name} enthält keine SKILL.md.`)
    const inhalt = []
    const hash = crypto.createHash('sha256')
    for (const d of dateien.sort((a, b) => a.rel.localeCompare(b.rel))) {
      const buf = await nasDatei(d.path)
      hash.update(d.rel).update(buf)
      inhalt.push({ rel: d.rel, buf })
    }
    const digest = hash.digest('hex')
    const key = `pruef_skill_${name}`
    let stand = null
    try { stand = JSON.parse(db.appState.get(key) || 'null') } catch {}
    if (stand?.id && stand.hash === digest) return stand.id

    const { toFile: tf } = sdk()
    const files = await Promise.all(inhalt.map(d => tf(d.buf, `${name}/${d.rel}`)))
    let id = stand?.id
    if (id) {
      try { await client().skills.versions.create(id, { files }) }
      catch (e) { if (e?.status === 404) id = null; else throw e }
    }
    if (!id) {
      const s = await client().skills.create({ files })
      id = s.id
    }
    db.appState.set(key, JSON.stringify({ id, hash: digest, at: new Date().toISOString() }))
    return id
  }

  // ── 2. Unterlagen sammeln und hochladen ──────────────────────────────────────
  async function sammleUnterlagen(v, project) {
    const folder = v.folderPath
    const liste  = []
    const top    = await listeSicher(folder)
    for (const f of top.filter(e => !e.isdir)) liste.push({ path: f.path, name: f.name, rolle: 'Prüfdokument' })
    if (top.some(e => e.isdir && e.name === ANLAGEN_ORDNER)) {
      for (const f of (await listeSicher(`${folder}/${ANLAGEN_ORDNER}`)).filter(e => !e.isdir)) {
        const meta = v.dateien?.[`${ANLAGEN_ORDNER}/${f.name}`]
        liste.push({ path: f.path, name: f.name, rolle: `Anlage zur Prüfung${meta?.art ? ` (${meta.art})` : ''}` })
      }
    }
    // Projekt-Standard und Vorlagen aus dem Prüfordner des Projekts
    const basis = project?.pruefOrdner?.[v.art]
    if (basis) {
      const b = await listeSicher(basis)
      for (const f of b.filter(e => !e.isdir && /^Vorlage_/i.test(e.name))) liste.push({ path: f.path, name: f.name, rolle: 'Layout-Vorlage' })
      if (b.some(e => e.isdir && e.name === '_Standard')) {
        for (const f of (await listeSicher(`${basis}/_Standard`)).filter(e => !e.isdir)) liste.push({ path: f.path, name: f.name, rolle: 'Projekt-Standard (neuere Fassung, geht dem Skill vor)' })
      }
    }
    if (!liste.some(d => d.rolle === 'Prüfdokument')) throw new Error('Im Vorgangsordner liegt kein Prüfdokument.')

    // Ergebnisse der anderen Vorgänge im selben Prüfordner (Stundensätze,
    // Abgrenzungen, Doppelvergütung): Arbeitsnotizen und der jüngste Prüfstand.
    if (basis) {
      const eigener = folder.split('/').pop()
      for (const d of (await listeSicher(basis)).filter(e => e.isdir && e.name !== eigener && !e.name.startsWith('_'))) {
        const inhalt = await listeSicher(d.path)
        for (const f of inhalt.filter(e => !e.isdir && /^Arbeitsnotiz.*\.(md|txt|docx)$/i.test(e.name))) {
          liste.push({ path: f.path, name: `${d.name} - ${f.name}`, rolle: `Arbeitsnotiz anderer Vorgang (${d.name})` })
        }
        const stand = inhalt.filter(e => e.isdir && /geprüft|geprueft/i.test(e.name)).sort((a, b) => b.name.localeCompare(a.name))[0]
        if (stand) {
          for (const f of (await listeSicher(stand.path)).filter(e => !e.isdir && /^(Pruefvermerk|Prüfvermerk|Arbeitsnotiz|Anschreiben_LBIH_[^_]+(_Index\d+)?\.pdf$)/i.test(e.name))) {
            liste.push({ path: f.path, name: `${d.name} - ${f.name}`, rolle: `Prüfergebnis anderer Vorgang (${d.name}, ${stand.name})` })
          }
        }
      }
    }

    // Projektwissen: vom Projekt-Admin festgelegte Ordner (LV, Schnittstellen-
    // liste, Bieterantworten, Klärungsliste, Schriftverkehr …), rekursiv.
    for (const w of project?.pruefWissen || []) {
      try {
        const dateien = await rekursivBegrenzt(w, 4, MAX_WISSEN)
        const wurzel = w.split('/').pop()
        for (const f of dateien) liste.push({ path: f.path, name: `${wurzel} - ${f.rel.replace(/\//g, ' - ')}`, rolle: `Projektwissen (${wurzel}/${f.rel})`, size: f.size })
      } catch (e) { console.warn('[pruefKi] Projektwissen', w, e.message) }
    }

    const { toFile: tf } = sdk()
    const hochgeladen = []
    const namen = []
    const ausgelassen = []
    let summe = 0
    for (const d of liste) {
      if (d.size && (d.size > MAX_DATEI || summe + d.size > MAX_GESAMT)) { ausgelassen.push(`${d.name} (zu groß)`); continue }
      let buf
      try { buf = await nasDatei(d.path) } catch (e) { ausgelassen.push(`${d.name} (${e.message})`); continue }
      if (summe + buf.length > MAX_GESAMT) { ausgelassen.push(`${d.name} (Gesamtgröße erreicht)`); continue }
      summe += buf.length
      const name = uniqueName(cleanName(d.name), namen)
      namen.push(name)
      const meta = await client().files.upload({ file: await tf(buf, name) })
      hochgeladen.push({ ...d, name, fileId: meta.id, size: buf.length })
    }

    // Protokolle und Notizen des Projekts aus dem Protokolltool als Text
    const protokolle = protokollText(project)
    if (protokolle) {
      const name = uniqueName('Protokolle und Notizen aus Komplizen.md', namen)
      const meta = await client().files.upload({ file: await tf(Buffer.from(protokolle, 'utf8'), name) })
      hochgeladen.push({ name, rolle: 'Besprechungsprotokolle, Maßnahmen und Akten-/Telefonnotizen des Projekts (Protokolltool)', fileId: meta.id, size: protokolle.length })
    }
    hochgeladen.ausgelassen = ausgelassen
    return hochgeladen
  }

  async function rekursivBegrenzt(basis, tiefe, maxAnzahl, rel = '', out = []) {
    if (out.length >= maxAnzahl) return out
    for (const e of await fileStation.listFolder(rel ? `${basis}/${rel}` : basis)) {
      if (out.length >= maxAnzahl) break
      if (e.name.startsWith('.') || e.name.startsWith('~$') || e.name === '#recycle' || e.name === '@eaDir') continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isdir) { if (tiefe > 1) await rekursivBegrenzt(basis, tiefe - 1, maxAnzahl, r, out) }
      else out.push({ rel: r, path: e.path, size: e.size })
    }
    return out
  }

  // Protokolle (Punkte, Ergebnisse, Maßnahmen) und Notizen eines Projekts
  function protokollText(project) {
    if (!project) return ''
    const z = [`# Protokolle und Notizen – ${project.name}`, '', 'Auszug aus dem Protokolltool (Komplizen). Datum je Eintrag beachten.', '']
    const prot = db.protocols.list().filter(p => p.projectId === project.id)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    for (const p of prot) {
      z.push(`## ${p.meetingType || 'Besprechung'} vom ${p.date || '?'}${p.location ? ` (${ohneHtml(p.location)})` : ''}`)
      for (const it of p.agendaItems || []) {
        const t = [ohneHtml(it.topic), ohneHtml(it.discussion), it.result ? `Ergebnis: ${ohneHtml(it.result)}` : ''].filter(Boolean).join(' – ')
        if (t) z.push(`- ${it.no ? it.no + ' ' : ''}${t}`)
      }
      for (const a of p.actionItems || []) {
        const t = ohneHtml(a.description)
        if (t) z.push(`- Maßnahme: ${t}${a.responsible ? ` · zuständig ${a.responsible}` : ''}${a.deadline ? ` · bis ${a.deadline}` : ''}${a.status ? ` · ${a.status}` : ''}`)
      }
      z.push('')
    }
    const notizen = db.notes.list().filter(n => n.projectId === project.id)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    if (notizen.length) z.push('# Akten- und Telefonnotizen', '')
    for (const n of notizen) {
      z.push(`## ${n.type === 'telefonnotiz' ? 'Telefonnotiz' : 'Aktennotiz'} vom ${n.date || (n._updatedAt || '').slice(0, 10)}: ${ohneHtml(n.subject || n.title)}`)
      z.push(ohneHtml(n.content || n.text), '')
    }
    return prot.length || notizen.length ? z.join('\n') : ''
  }

  function auftrag(v, project, unterlagen, skillName) {
    const z = []
    z.push(`Prüfvorgang aus der Prüfstation (GHBA).`)
    z.push(`Projekt: ${project?.name || '–'}`)
    z.push(`Art: ${v.art === 'rechnung' ? 'Abschlagsrechnung' : v.art === 'nachtrag' ? 'Nachtrag' : 'Sonstige Prüfung'}`)
    if (v.nummer) z.push(`Nummer: ${v.nummer}${v.index ? ` · Index ${v.index}` : ''}`)
    if (v.titel) z.push(`Titel: ${v.titel}`)
    if (v.auftragnehmer) z.push(`Auftragnehmer: ${v.auftragnehmer}`)
    if (v.eingangAm) z.push(`Eingang: ${v.eingangAm}`)
    if (v.frist) z.push(`Prüffrist: ${v.frist}`)
    if (v.einigungAm) z.push(`Einigung vom: ${v.einigungAm}`)
    if (v.betragNetto != null) z.push(`Betrag netto laut Vorgang: ${v.betragNetto} €`)
    z.push('')
    z.push('Hinweise des Bearbeiters (gehen für diesen Vorgang dem Standard vor, ändern ihn aber nicht):')
    z.push(v.hinweise?.trim() || '– keine –')
    z.push('')
    z.push('Unterlagen (liegen im Container als hochgeladene Dateien):')
    for (const d of unterlagen) z.push(`- ${d.name} — ${d.rolle}`)
    z.push('')
    z.push(skillName
      ? `Arbeite nach dem Skill „${skillName}“.`
      : 'Prüfe nach den üblichen Regeln der Objektüberwachung von GHBA.')
    z.push('Lege jede Ergebnisdatei (DOCX, PDF, Arbeitsnotiz) in $OUTPUT_DIR ab und liste das Verzeichnis im selben Befehl auf.')
    z.push('Nichts selbst versenden. Die Ergebnisse legt der Prüfer nach Freigabe in den Projektordner.')
    if (unterlagen.ausgelassen?.length) z.push(`Nicht mitgeschickt (Größe/Fehler): ${unterlagen.ausgelassen.join('; ')}`)
    z.push('')
    z.push('So gehst du mit fehlenden Angaben um:')
    z.push('1. Erst selbst nachsehen: Projektwissen, Protokolle und Notizen, Ergebnisse und Arbeitsnotizen der anderen Vorgänge, Anlagen. Durchsuche die Dateien mit Code (z. B. pdftotext + grep), bevor du etwas als fehlend einstufst.')
    z.push('2. Was sich nicht klären lässt, aber eine vertretbare Bewertung nicht verhindert: mit einer begründeten Annahme weiterarbeiten und sie im Ergebnis unter „Offene Punkte" bzw. in der Arbeitsnotiz kennzeichnen.')
    z.push('3. Nur fragen, wenn ohne die Angabe kein vertretbares Ergebnis möglich ist (z. B. Einigung liegt nicht vor oder widerspricht sich; bei Abschlagsrechnungen der Leistungsstand, den der Skill ausdrücklich beim Prüfer abfragt). Dann höchstens fünf Fragen, nummeriert, jeweils mit deinem Vorschlag als Antwort, und alles andere vorher fertigstellen.')
    z.push('Schließe mit einer kurzen Zusammenfassung: Ergebnis, Beträge netto/brutto, offene Punkte, erzeugte Dateien.')
    return z.join('\n')
  }

  // ── 3. Lauf: Anfrage, pause_turn, Dateien einsammeln ─────────────────────────
  async function runde(vid, verlauf) {
    const containerParam = { skills: verlauf.skills }
    if (verlauf.containerId) containerParam.id = verlauf.containerId
    const neueDateien = []
    let text = ''
    let usage = verlauf.usage || { input: 0, output: 0 }

    for (let i = 0; i < MAX_RUNDEN; i++) {
      const params = {
        model: MODELL(),
        max_tokens: 64000,
        output_config: { effort: EFFORT() },
        system: 'Du arbeitest für GHBA (Gehbauer | Helten | Bickel | Sgró Architekten Partnerschaft GmbB) als Prüfassistenz der Objekt-/Bauüberwachung. Antworte auf Deutsch, sachlich und knapp. Halte dich strikt an den geladenen Skill und an die Hinweise des Bearbeiters.',
        container: containerParam,
        tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
        messages: verlauf.messages,
      }
      // Rückfallmodell bei einer Ablehnung durch die Sicherheitsfilter. Lehnt
      // die API den Parameter in dieser Kombination ab, ohne ihn weiter.
      let msg
      if (verlauf.ohneFallback) {
        msg = await client().beta.messages.stream(params).finalMessage()
      } else {
        try {
          msg = await client().beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage()
        } catch (e) {
          if (e?.status !== 400 || !/fallback/i.test(e?.message || '')) throw e
          verlauf.ohneFallback = true
          msg = await client().beta.messages.stream(params).finalMessage()
        }
      }
      if (msg.container?.id) { verlauf.containerId = msg.container.id; containerParam.id = msg.container.id }
      usage = { input: usage.input + (msg.usage?.input_tokens || 0), output: usage.output + (msg.usage?.output_tokens || 0) }
      verlauf.messages.push({ role: 'assistant', content: msg.content })

      for (const b of msg.content) {
        if (b.type === 'bash_code_execution_tool_result' && b.content?.type === 'bash_code_execution_result') {
          for (const o of b.content.content || []) if (o.file_id) neueDateien.push(o.file_id)
        }
      }
      verlauf.dateiIds = [...new Set([...(verlauf.dateiIds || []), ...neueDateien])]
      const t = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      if (t) text = t

      if (msg.stop_reason === 'pause_turn') { speichereVerlauf(vid, verlauf); continue }
      if (msg.stop_reason === 'refusal') throw new Error('Claude hat die Prüfung abgelehnt (Sicherheitsfilter).')
      if (msg.stop_reason === 'max_tokens') text += '\n\n(Antwort wurde wegen Längenbegrenzung abgeschnitten – „Weiter“ schreiben.)'
      break
    }
    verlauf.usage = usage
    speichereVerlauf(vid, verlauf)

    // Ergebnisdateien holen (Doppelte über die file_id vermeiden)
    const zielDir = path.join(DATA_DIR, vid, 'ergebnisse')
    fs.mkdirSync(zielDir, { recursive: true })
    const vorhanden = new Set(fs.readdirSync(zielDir))
    const geholt = []
    for (const fid of [...new Set(neueDateien)]) {
      try {
        const meta = await client().files.retrieveMetadata(fid)
        const res  = await client().files.download(fid)
        const buf  = Buffer.from(await res.arrayBuffer())
        let name = cleanName(meta.filename || `${fid}.bin`)
        if (vorhanden.has(name)) {
          // Neue Fassung derselben Datei ersetzt die alte im Entwurf
          fs.unlinkSync(path.join(zielDir, name))
        }
        fs.writeFileSync(path.join(zielDir, name), buf)
        vorhanden.add(name)
        geholt.push(name)
      } catch (e) { console.warn('[pruefKi] Download', fid, e.message) }
    }
    return { text, usage, geholt }
  }

  // ── Dateien bei Anthropic löschen ───────────────────────────────────────────
  // Über die Files API hochgeladene und erzeugte Dateien bleiben dort, bis sie
  // ausdrücklich gelöscht werden. Gelöscht wird, sobald ein Lauf ersetzt wird,
  // der Vorgang nicht mehr existiert oder 30 Tage nichts mehr passiert ist
  // (dann ist auch der Container abgelaufen und keine Rückfrage mehr möglich).
  async function dateienBeiAnthropicLoeschen(verlauf) {
    const ids = [...new Set([...(verlauf?.unterlagen || []).map(u => u.fileId), ...(verlauf?.dateiIds || [])].filter(Boolean))]
    let ok = 0
    for (const id of ids) {
      try { await client().files.delete(id); ok++ }
      catch (e) { if (e?.status === 404) ok++; else console.warn('[pruefKi] Löschen', id, e.message) }
    }
    return { ok, gesamt: ids.length }
  }

  async function aufraeumen() {
    if (!konfiguriert()) return
    let eintraege = []
    try { eintraege = fs.readdirSync(DATA_DIR) } catch { return }
    const grenze = Date.now() - 30 * 24 * 3600 * 1000
    for (const vid of eintraege) {
      if (laufend.has(vid)) continue
      const datei = verlaufDatei(vid)
      let alt = false
      try { alt = fs.statSync(datei).mtimeMs < grenze } catch { continue }
      const weg = !db.pruefVorgaenge.get(vid)
      if (!alt && !weg) continue
      const verlauf = ladeVerlauf(vid)
      if (verlauf?.geloescht) continue
      const r = await dateienBeiAnthropicLoeschen(verlauf)
      if (weg) fs.rmSync(path.join(DATA_DIR, vid), { recursive: true, force: true })
      else if (r.ok === r.gesamt) speichereVerlauf(vid, { ...verlauf, geloescht: new Date().toISOString() })
      console.log(`[pruefKi] Aufgeräumt: ${vid} (${r.ok}/${r.gesamt} Dateien bei Anthropic gelöscht)`)
    }
  }
  setTimeout(() => aufraeumen().catch(() => {}), 60_000)
  setInterval(() => aufraeumen().catch(() => {}), 6 * 3600 * 1000).unref?.()

  function ergebnisListe(vid) {
    const dir = path.join(DATA_DIR, vid, 'ergebnisse')
    try {
      return fs.readdirSync(dir).map(n => {
        const st = fs.statSync(path.join(dir, n))
        return { name: n, size: st.size, mtime: st.mtime.toISOString() }
      }).sort((a, b) => a.name.localeCompare(b.name, 'de'))
    } catch { return [] }
  }

  async function starteLauf(v, username, nachricht) {
    const vid = v.id
    laufend.add(vid)
    const start = new Date().toISOString()
    setPruefung(vid, { status: 'laeuft', schritt: 'Vorbereitung', gestartet: start, von: displayName(username), fehler: '' })
    try {
      let verlauf = nachricht ? ladeVerlauf(vid) : null
      if (!verlauf) {
        const project = db.projects.get(v.projectId)
        const skillName = SKILL_FUER_ART[v.art] || null
        const skills = [
          { type: 'anthropic', skill_id: 'pdf',  version: 'latest' },
          { type: 'anthropic', skill_id: 'docx', version: 'latest' },
        ]
        if (skillName) {
          setPruefung(vid, { schritt: `Skill „${skillName}“ abgleichen` })
          skills.unshift({ type: 'custom', skill_id: await skillId(skillName), version: 'latest' })
        }
        setPruefung(vid, { schritt: 'Unterlagen von der NAS laden' })
        const unterlagen = await sammleUnterlagen(v, project)
        // Alter Entwurf gehört zu einem früheren Lauf – auch bei Anthropic entfernen
        const alt = ladeVerlauf(vid)
        if (alt && !alt.geloescht) await dateienBeiAnthropicLoeschen(alt)
        fs.rmSync(path.join(DATA_DIR, vid), { recursive: true, force: true })
        verlauf = {
          skills, containerId: null, usage: { input: 0, output: 0 },
          unterlagen: unterlagen.map(u => ({ name: u.name, rolle: u.rolle, fileId: u.fileId })),
          messages: [{ role: 'user', content: [
            { type: 'text', text: auftrag(v, project, unterlagen, skillName) },
            ...unterlagen.map(u => ({ type: 'container_upload', file_id: u.fileId })),
          ] }],
          runden: [],
        }
      } else {
        verlauf.messages.push({ role: 'user', content: [{ type: 'text', text: `${displayName(username)} antwortet:\n${nachricht}` }] })
      }
      verlauf.runden.push({ von: displayName(username), am: start, nachricht: nachricht || '' })
      speichereVerlauf(vid, verlauf)

      setPruefung(vid, { schritt: 'Claude prüft – das dauert einige Minuten' })
      const { text, usage, geholt } = await runde(vid, verlauf)
      verlauf.runden[verlauf.runden.length - 1].antwort = text
      verlauf.runden[verlauf.runden.length - 1].dateien = geholt
      speichereVerlauf(vid, verlauf)
      setPruefung(vid, {
        status: 'fertig', schritt: '', beendet: new Date().toISOString(), usage,
        antwort: text, dateien: ergebnisListe(vid), runden: verlauf.runden.length,
      })
    } catch (e) {
      console.error('[pruefKi]', e)
      setPruefung(vid, { status: 'fehler', schritt: '', beendet: new Date().toISOString(), fehler: fehlerText(e) })
    } finally {
      laufend.delete(vid)
    }
  }

  function fehlerText(e) {
    const s = e?.status
    if (s === 401) return 'API-Schlüssel ungültig (ANTHROPIC_API_KEY prüfen).'
    if (s === 403) return 'Der API-Schlüssel hat keine Berechtigung für diese Funktion.'
    if (s === 429) return 'Zu viele Anfragen an Claude – in ein paar Minuten erneut versuchen.'
    if (s === 413) return 'Die Unterlagen sind zu groß für eine Anfrage.'
    if (s >= 500)  return 'Claude ist gerade nicht erreichbar – später erneut versuchen.'
    return e?.message || String(e)
  }

  // ── Routen ───────────────────────────────────────────────────────────────────
  app.get('/api/pruefstation/ki-status', requireAuth, (_req, res) => {
    res.json({ aktiv: konfiguriert(), skillsPfad: skillsPfad(), modell: MODELL() })
  })

  app.post('/api/pruefstation/vorgaenge/:id/pruefung', requireAuth, writeLimiter, (req, res) => {
    const v = getVorgang(req, res)
    if (!v) return
    if (!konfiguriert()) return res.status(400).json({ error: 'Die Prüfung mit Claude ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt).' })
    if (!fileStation.isConfigured()) return res.status(400).json({ error: 'NAS-Anbindung fehlt.' })
    if (!v.folderPath) return res.status(400).json({ error: 'Erst einen NAS-Ordner verknüpfen.' })
    if (laufend.has(v.id)) return res.status(409).json({ error: 'Für diesen Vorgang läuft bereits eine Prüfung.' })
    if (laufend.size >= 3) return res.status(429).json({ error: 'Es laufen gerade drei Prüfungen – bitte kurz warten.' })
    const nachricht = typeof req.body?.nachricht === 'string' ? req.body.nachricht.trim().slice(0, 20000) : ''
    const bisher = ladeVerlauf(v.id)
    if (nachricht && !bisher) return res.status(400).json({ error: 'Es gibt noch keinen Lauf, auf den sich die Antwort bezieht.' })
    if (nachricht && bisher?.geloescht) return res.status(400).json({ error: 'Dieser Lauf ist älter als 30 Tage und bei Anthropic gelöscht – bitte „Neu prüfen“.' })
    logEvent('PRUEF_KI_START', req, `vorgang=${v.id} folge=${nachricht ? 1 : 0}`)
    starteLauf(v, req.user, nachricht)    // läuft im Hintergrund weiter
    res.status(202).json({ ok: true })
  })

  // Verlauf (Runden mit Fragen/Antworten) für die Anzeige
  app.get('/api/pruefstation/vorgaenge/:id/pruefung', requireAuth, (req, res) => {
    const v = getVorgang(req, res)
    if (!v) return
    const verlauf = ladeVerlauf(v.id)
    res.json({
      pruefung: { ...(v.pruefung || {}), status: laufend.has(v.id) ? 'laeuft' : (v.pruefung?.status === 'laeuft' ? 'fehler' : v.pruefung?.status) },
      runden: verlauf?.runden || [],
      unterlagen: verlauf?.unterlagen?.map(u => ({ name: u.name, rolle: u.rolle })) || [],
      dateien: ergebnisListe(v.id),
    })
  })

  app.get('/api/pruefstation/vorgaenge/:id/pruefung/datei', requireAuth, (req, res) => {
    const v = getVorgang(req, res)
    if (!v) return
    const name = String(req.query.name || '')
    if (!name || name !== path.basename(name)) return res.status(400).json({ error: 'Ungültiger Dateiname.' })
    const p = path.join(DATA_DIR, v.id, 'ergebnisse', name)
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'Datei nicht gefunden.' })
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^a-zA-Z0-9 ._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
    res.setHeader('Content-Type', 'application/octet-stream')
    fs.createReadStream(p).pipe(res)
  })

  // Freigabe: ausgewählte Ergebnisse in „… geprüft JJJJ-MM-TT" ablegen.
  // Freigeben dürfen Projekt-Admins und System-Admins.
  app.post('/api/pruefstation/vorgaenge/:id/pruefung/freigeben', requireAuth, writeLimiter, async (req, res) => {
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const project = db.projects.get(v.projectId)
      if (!project || !isProjectManager(project, req.user)) return res.status(403).json({ error: 'Freigeben dürfen Projekt-Administratoren.' })
      if (!v.folderPath) return res.status(400).json({ error: 'Kein NAS-Ordner verknüpft.' })
      const namen = Array.isArray(req.body?.dateien) ? req.body.dateien.map(String) : ergebnisListe(v.id).map(d => d.name)
      const datum = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
      const ordnerName = `${v.art === 'rechnung' ? 'Rechnung' : v.art === 'nachtrag' ? 'Nachtrag' : 'Prüfung'} geprüft ${datum}`
      const ziel = `${v.folderPath}/${ordnerName}`
      const vorhanden = (await listeSicher(ziel)).map(f => f.name)
      const abgelegt = []
      for (const n of namen) {
        if (n !== path.basename(n)) continue
        const p = path.join(DATA_DIR, v.id, 'ergebnisse', n)
        if (!fs.existsSync(p)) continue
        const name = uniqueName(cleanName(n), vorhanden)
        await fileStation.uploadFile(ziel, name, fs.readFileSync(p))
        vorhanden.push(name)
        abgelegt.push(name)
      }
      setPruefung(v.id, { freigegeben: { am: new Date().toISOString(), von: displayName(req.user), ordner: ziel, dateien: abgelegt } })
      logEvent('PRUEF_KI_FREIGABE', req, `vorgang=${v.id} ordner=${ziel} n=${abgelegt.length}`)
      res.json({ ordner: ziel, dateien: abgelegt })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })
}

module.exports = { registerPruefKi }
