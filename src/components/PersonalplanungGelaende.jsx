import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createGelaende, waitForBrandFont } from '../gelaende/engine'
import { buildLayout } from '../gelaende/layout'

// ─────────────────────────────────────────────────────────────────────────────
// Gelaende-Ansicht der Personalplanung
// Umsetzung des Dashboard-Musters "Daten als begehbare Plattform":
// Karte (Uebersicht) + flache Liste (Zugriff) aus denselben Daten, Wochenregler,
// ANIM-Schalter, Panel als Rueckfallebene, wenn ein Klick nichts oeffnen kann.
// Wird sowohl im Protokolltool (Reiter "Gelaende") als auch in der einbettbaren
// Dashboard-Seite (src/gelaendeEntry.jsx) verwendet.
// ─────────────────────────────────────────────────────────────────────────────

const CI = { night: '#000040', cream: '#FBFFE6', sky: '#8FBEFF', line: 'rgba(143,190,255,0.35)' }
const STATE_LABEL = {
  rohbau: 'in Bearbeitung', fundament: 'beauftragt, ruht', fertig: 'zuletzt bearbeitet',
  idee: 'Akquise', labor: 'Leistung', buero: 'Büro / intern', urlaub: 'Urlaub', krank: 'Krank',
}
const STATE_COLOR = { rohbau: '#F0B052', fundament: '#6FA0FF', fertig: '#3FBF85', idee: '#B49FD8', labor: '#CBAE72', buero: '#3FBF85', urlaub: '#6FA0FF', krank: '#6FA0FF' }
const fmt = (n) => String(Math.round((n || 0) * 100) / 100).replace('.', ',')

// ── ISO-Wochen-Helfer (identisch zur Personalplanung) ───────────────────────
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`
}
function mondayOfIsoWeek(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(week || '')
  if (!m) return new Date()
  const jan4 = new Date(Date.UTC(+m[1], 0, 4))
  const mon = new Date(jan4)
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (+m[2] - 1) * 7)
  return mon
}
function shiftWeek(week, n) {
  const mon = mondayOfIsoWeek(week)
  mon.setUTCDate(mon.getUTCDate() + n * 7)
  return isoWeek(new Date(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate()))
}
const weekRange = (week) => {
  const mon = mondayOfIsoWeek(week)
  const fri = new Date(mon); fri.setUTCDate(mon.getUTCDate() + 4)
  const f = (d) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`
  return `${f(mon)} – ${f(fri)}`
}
const hasWebGL = () => {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
  } catch { return false }
}

export default function PersonalplanungGelaende({
  fetchWeek,                 // (week) => Promise<data>
  initialWeek,
  onOpenPerson,              // optional: Einsatzuebersicht im Tool
  appUrl = '',               // fuer die eingebettete Seite: Link ins Protokolltool
  embedded = false,
}) {
  const [week,    setWeek]    = useState(initialWeek || isoWeek(new Date()))
  const [data,    setData]    = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [paused,  setPaused]  = useState(false)
  const [listOpen, setListOpen] = useState(!embedded)
  const [panel,   setPanel]   = useState(null)      // { kind:'region'|'person', item }
  const [webgl]   = useState(() => hasWebGL())
  const stageRef  = useRef(null)
  const engineRef = useRef(null)
  const layoutRef = useRef(null)

  const layout = useMemo(() => (data ? buildLayout(data) : null), [data])

  // Daten der gewaehlten Woche
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchWeek(week)
      .then(d => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError(e.message || 'Laden fehlgeschlagen.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [week, fetchWeek])

  // Engine aufbauen (einmal) und bei neuen Daten fuettern
  useEffect(() => {
    if (!webgl || !stageRef.current || engineRef.current) return
    let disposed = false
    waitForBrandFont().then(() => {
      if (disposed || !stageRef.current) return
      engineRef.current = createGelaende(stageRef.current, {
        onPickRegion: (region) => setPanel({ kind: 'region', id: region.id }),
        onPickPerson: (person) => {
          if (onOpenPerson) onOpenPerson(person)
          else setPanel({ kind: 'person', id: person.id })
        },
      })
      if (layoutRef.current) engineRef.current.setData(layoutRef.current)
    })
    return () => { disposed = true; engineRef.current?.dispose(); engineRef.current = null }
  }, [webgl, onOpenPerson])

  useEffect(() => {
    layoutRef.current = layout
    if (layout && engineRef.current) engineRef.current.setData(layout)
  }, [layout])

  useEffect(() => { engineRef.current?.setPaused(paused) }, [paused])

  const panelItem = useMemo(() => {
    if (!panel || !layout) return null
    return panel.kind === 'region'
      ? layout.regions.find(r => r.id === panel.id)
      : layout.people.find(p => p.id === panel.id)
  }, [panel, layout])

  const peopleOf = useCallback((regionId) =>
    (layout?.people || []).filter(p => p.targets.some(t => t.projectId === regionId)), [layout])

  const quartiere = useMemo(() => {
    const map = new Map()
    for (const r of (layout?.regions || [])) {
      if (!map.has(r.group)) map.set(r.group, [])
      map.get(r.group).push(r)
    }
    return [...map.entries()]
  }, [layout])

  const t = data?.totals || {}

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 520, background: CI.night, color: CI.cream, fontFamily: 'Arial, sans-serif' }}>
      {/* Kopfzeile: Marke, Wochenregler, Kennzahlen */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${CI.line}` }}>
        <div style={{ minWidth: 150 }}>
          <p style={{ margin: 0, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: CI.sky }}>GHBA</p>
          <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 900, fontFamily: "'Yellix', Arial, sans-serif" }}>Personalplanung</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BtnGhost onClick={() => setWeek(w => shiftWeek(w, -1))} title="Woche zurück">‹</BtnGhost>
          <div style={{ textAlign: 'center', minWidth: 150 }}>
            <div style={{ fontSize: 15, fontWeight: 'bold' }}>{data?.weekLabel || `KW ${week.split('-W')[1]}`}</div>
            <div style={{ fontSize: 11, color: CI.sky }}>{weekRange(week)}</div>
          </div>
          <BtnGhost onClick={() => setWeek(w => shiftWeek(w, 1))} title="Woche vor">›</BtnGhost>
          <BtnGhost onClick={() => setWeek(isoWeek(new Date()))} title="Aktuelle Woche">Heute</BtnGhost>
        </div>

        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', flexWrap: 'wrap', fontSize: 12 }}>
          <Kennzahl label="Auslastung" value={`${t.loadPct ?? 0} %`} hint={`${fmt(t.plannedDays)} / ${fmt(t.capacityDays)} Tage`} />
          <Kennzahl label="Frei" value={t.freePeople ?? 0} hint="ohne Zuteilung" />
          <Kennzahl label="Abwesend" value={t.absentPeople ?? 0} hint="Urlaub / krank" />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <BtnGhost onClick={() => setListOpen(v => !v)} title="Flache Liste derselben Objekte">Liste</BtnGhost>
          <BtnGhost onClick={() => setPaused(p => !p)} title="Bewegung anhalten">{paused ? 'ANIM ▶' : 'ANIM ❚❚'}</BtnGhost>
        </div>
      </div>

      {/* Bühne */}
      <div style={{ position: 'relative', flex: 1, minHeight: 420, display: 'flex' }}>
        {webgl
          ? <div ref={stageRef} style={{ position: 'relative', flex: 1, minWidth: 0, cursor: 'grab' }} />
          : <div style={{ flex: 1, padding: 20, fontSize: 13, color: CI.sky }}>
              Diese Ansicht braucht WebGL. Die Liste rechts zeigt dieselben Daten.
            </div>}

        {listOpen && (
          <div style={{ width: 268, maxWidth: '46%', overflowY: 'auto', borderLeft: `1px solid ${CI.line}`, background: 'rgba(0,0,32,0.92)' }}>
            {quartiere.map(([name, items]) => (
              <div key={name} style={{ padding: '8px 10px' }}>
                <p style={{ margin: '0 0 6px', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: CI.sky, fontFamily: "'Yellix', Arial, sans-serif", fontWeight: 900 }}>{name}</p>
                {items.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setPanel({ kind: 'region', id: r.id }); engineRef.current?.focusRegion(r.id) }}
                    onMouseEnter={() => engineRef.current?.highlight(r.id)}
                    onMouseLeave={() => engineRef.current?.highlight(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      background: 'transparent', border: 0, borderBottom: '1px solid rgba(143,190,255,0.14)',
                      color: CI.cream, padding: '6px 2px', cursor: 'pointer', font: '12px/1.3 Arial, sans-serif',
                    }}>
                    <span style={{ width: 10, height: 10, background: r.color, flex: '0 0 auto' }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.short || r.name}</span>
                    <span style={{ color: STATE_COLOR[r.state] || CI.sky, fontSize: 11 }}>{fmt(r.personDays)}</span>
                  </button>
                ))}
              </div>
            ))}
            <div style={{ padding: '8px 10px', borderTop: `1px solid ${CI.line}` }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: CI.sky, fontFamily: "'Yellix', Arial, sans-serif", fontWeight: 900 }}>Mitarbeitende</p>
              {(layout?.people || []).map(p => (
                <button key={p.id}
                  onClick={() => (onOpenPerson ? onOpenPerson(p) : setPanel({ kind: 'person', id: p.id }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    background: 'transparent', border: 0, borderBottom: '1px solid rgba(143,190,255,0.14)',
                    color: p.atBrunnen ? CI.sky : CI.cream, padding: '5px 2px', cursor: 'pointer', font: '12px/1.3 Arial, sans-serif',
                  }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: p.loadPct >= 100 ? '#ff8a8a' : p.loadPct >= 80 ? '#3FBF85' : '#F0B052' }}>{p.loadPct} %</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Legende */}
        <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', background: 'rgba(0,0,32,0.78)', border: `1px solid ${CI.line}`, padding: '6px 10px', fontSize: 11, pointerEvents: 'none' }}>
          {['rohbau', 'fundament', 'fertig', 'idee'].map(k => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLOR[k] }} />{STATE_LABEL[k]}
            </span>
          ))}
          <span style={{ color: CI.sky }}>Figur = Mitarbeitende · Ring rot ab 100 %</span>
        </div>

        {loading && <Overlay>Lade {week} …</Overlay>}
        {error && <Overlay tone="#ff8a8a">{error}</Overlay>}

        {/* Panel: erscheint, wenn der Klick nichts direkt oeffnen kann */}
        {panelItem && (
          <div style={{ position: 'absolute', right: listOpen ? 280 : 12, top: 12, width: 270, background: CI.night, border: `1px solid ${CI.sky}`, padding: 12, fontSize: 12 }}>
            <button onClick={() => setPanel(null)} style={{ float: 'right', background: 'transparent', border: 0, color: CI.sky, cursor: 'pointer', fontSize: 14 }}>✕</button>
            {panel.kind === 'region' ? (
              <>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, fontFamily: "'Yellix', Arial, sans-serif" }}>{panelItem.name}</p>
                <p style={{ margin: '2px 0 8px', color: CI.sky, fontSize: 11 }}>
                  {STATE_LABEL[panelItem.state] || panelItem.state}
                  {panelItem.lphLabel ? ` · ${panelItem.lphLabel}` : ''}
                  {panelItem.gesellschaft ? ` · ${panelItem.gesellschaft}` : ''}
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  {fmt(panelItem.personDays)} Personentage
                  {panelItem.sollDays > 0 && <> · Soll {fmt(panelItem.sollDays)}</>}
                  {panelItem.saturation === 'unter' && <span style={{ color: '#F0B052' }}> · unterbesetzt</span>}
                  {panelItem.saturation === 'ueber' && <span style={{ color: '#ff8a8a' }}> · überbesetzt</span>}
                </p>
                <p style={{ margin: '0 0 4px', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: CI.sky }}>Besetzung dieser Woche</p>
                {peopleOf(panelItem.id).length === 0
                  ? <p style={{ margin: 0, color: CI.sky }}>Niemand eingeplant.</p>
                  : peopleOf(panelItem.id).map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(143,190,255,0.14)', padding: '3px 0' }}>
                      <span>{p.name}</span>
                      <span style={{ color: CI.sky }}>{fmt(p.targets.find(x => x.projectId === panelItem.id)?.days)} Tage</span>
                    </div>
                  ))}
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, fontFamily: "'Yellix', Arial, sans-serif" }}>{panelItem.name}</p>
                <p style={{ margin: '2px 0 8px', color: CI.sky, fontSize: 11 }}>{panelItem.funktion || 'Mitarbeitende/r'}</p>
                <p style={{ margin: '0 0 8px' }}>{fmt(panelItem.plannedDays)} / {fmt(panelItem.capacityDays)} Tage · {panelItem.loadPct} %</p>
                {panelItem.targets.length === 0
                  ? <p style={{ margin: 0, color: CI.sky }}>Diese Woche nicht eingeplant – wartet am Brunnen.</p>
                  : panelItem.targets.map(t2 => (
                    <div key={t2.projectId} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(143,190,255,0.14)', padding: '3px 0' }}>
                      <span>{t2.name}</span><span style={{ color: CI.sky }}>{fmt(t2.days)} Tage</span>
                    </div>
                  ))}
              </>
            )}
            {embedded && appUrl && (
              <a href={appUrl} target="_blank" rel="noreferrer"
                 style={{ display: 'inline-block', marginTop: 10, color: CI.night, background: CI.sky, padding: '5px 9px', textDecoration: 'none', fontSize: 11 }}>
                Im Protokolltool öffnen
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const BtnGhost = ({ children, ...rest }) => (
  <button {...rest} style={{
    background: 'transparent', color: CI.cream, border: `1px solid ${CI.line}`,
    padding: '4px 9px', cursor: 'pointer', font: '12px Arial, sans-serif',
  }}>{children}</button>
)
const Kennzahl = ({ label, value, hint }) => (
  <div style={{ lineHeight: 1.2 }}>
    <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: CI.sky }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 'bold' }}>{value}</div>
    {hint && <div style={{ fontSize: 10, color: 'rgba(251,255,230,0.6)' }}>{hint}</div>}
  </div>
)
const Overlay = ({ children, tone = '#8FBEFF' }) => (
  <div style={{
    position: 'absolute', left: '50%', top: 16, transform: 'translateX(-50%)',
    background: 'rgba(0,0,32,0.9)', border: `1px solid ${tone}`, color: tone,
    padding: '6px 12px', fontSize: 12, pointerEvents: 'none',
  }}>{children}</div>
)
