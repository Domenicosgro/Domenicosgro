import React, { useState, useMemo } from 'react'
import {
  Database, Plus, Trash2, RefreshCw, AlertTriangle, Check, Loader, X,
  FileText, ExternalLink, ArrowUpRight, Info,
} from 'lucide-react'
import { useKostendatenbanken, openDocument } from '../../hooks/useKostendatenbanken'
import {
  dbKind, versionStatus, sortedVersions, currentVersion, findVersion,
  fillFromVersion, pruefeAktualitaet, referenzKostenstand, emptyDatabase,
  defaultBezuege, ENTRY_BEZUG,
} from '../../kosten/datenbank'
import { buildLookup, fmtNum } from '../../kosten/calc'
import { evaluate } from '../../kosten/formula'
import { KG1 } from '../../kosten/din276'
import { datenquelle } from '../../kosten/model'
import { formatDate } from '../../utils'

// Reiter „Datenquellen“ – Bindung der Kostenermittlung an Kostenstände der
// büroweiten Kostendatenbanken.
//
// Die Bindung ist bewusst explizit: eine Kostenermittlung rechnet mit genau dem
// Kostenstand, an den sie gebunden wurde. Erscheint ein neuerer Stand, wird das
// gemeldet – übernommen wird er erst auf Anweisung, damit eine abgegebene
// Kostenermittlung nicht nachträglich ihre Zahlen ändert.

export default function DatenquellenTab({ draft, result, mutate, readOnly, serverUser }) {
  const { databases, loaded, error } = useKostendatenbanken()
  const [picker, setPicker] = useState(false)
  const [notice, setNotice] = useState(null)
  const [refModal, setRefModal] = useState(false)

  const quellen = useMemo(
    () => pruefeAktualitaet(draft.datenquellen ?? [], databases),
    [draft.datenquellen, databases]
  )

  const bind = (db, version, primary) => {
    mutate(prev => ({
      ...prev,
      datenquellen: [...(prev.datenquellen ?? []).filter(q => q.dbId !== db.id),
                     datenquelle(db, version, { primary })],
    }))
    setPicker(false)
  }

  const unbind = (id) =>
    mutate(prev => ({ ...prev, datenquellen: prev.datenquellen.filter(q => q.id !== id) }))

  const fill = (db, version, overwrite) => {
    let report = null
    mutate(prev => {
      const r = fillFromVersion(prev.positions ?? [], db, version, { overwrite })
      report = r
      return { ...prev, positions: r.positions }
    })
    setTimeout(() => setNotice(report && {
      text: `${report.gefuellt} Positionen aus „${db.name} · ${version.label}" gefüllt`
          + (report.uebersprungen ? `, ${report.uebersprungen} mit vorhandenen Werten übersprungen` : '')
          + (report.ohneTreffer ? `, ${report.ohneTreffer} ohne passenden Kennwert` : '') + '.',
    }), 0)
  }

  const wechselAuf = (q) => {
    const neu = q.aktuellerStand
    if (!neu) return
    if (!window.confirm(
      `Kostenstand von „${q.versionLabel || '—'}" auf „${neu.label || '—'}" umstellen?\n\n`
      + 'Die Vergleichsspalten der betroffenen Positionen werden neu gefüllt. '
      + 'Selbst gewählte Kennwerte in den Variantenspalten bleiben unverändert.')) return
    mutate(prev => ({
      ...prev,
      datenquellen: prev.datenquellen.map(x =>
        x.id === q.id ? { ...datenquelle(q.database, neu, { primary: x.primary }), id: x.id } : x),
    }))
    fill(q.database, neu, true)
  }

  if (!loaded) {
    return <div className="card p-8 flex items-center justify-center text-gray-400 gap-2">
      <Loader size={16} className="animate-spin" /> Kostendatenbanken werden geladen …
    </div>
  }

  const veraltet = quellen.filter(q => q.veraltet)

  return (
    <div className="space-y-4">

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-1.5">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      {notice && (
        <p className="text-xs text-green-800 bg-green-50 border border-green-200 px-3 py-2 flex items-center gap-1.5">
          <Check size={13} /> {notice.text}
          <button className="ml-auto text-green-600 hover:text-green-800" onClick={() => setNotice(null)}><X size={13} /></button>
        </p>
      )}

      {veraltet.length > 0 && (
        <div className="card border-l-4 border-l-amber-500 p-3 space-y-2">
          <p className="text-sm font-semibold text-night flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-amber-600" />
            {veraltet.length} Datenquelle{veraltet.length !== 1 ? 'n' : ''} mit neuerem Kostenstand
          </p>
          {veraltet.map(q => (
            <div key={q.id} className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
              <span><b>{q.dbName}</b>: gebunden an {q.versionLabel || '—'}
                {q.stand && ` (${formatDate(q.stand)})`} · verfügbar {q.aktuellerStand.label || '—'}
                {q.aktuellerStand.stand && ` (${formatDate(q.aktuellerStand.stand)})`}</span>
              {!readOnly && (
                <button className="btn-secondary text-xs py-0.5" onClick={() => wechselAuf(q)}>
                  <RefreshCw size={12} /> Umstellen
                </button>
              )}
            </div>
          ))}
          <p className="text-[11px] text-gray-400">
            Eine abgegebene Kostenermittlung sollte ihren Stand behalten. Umstellen nur, solange die Ermittlung
            noch in Bearbeitung ist – sonst besser eine neue Ermittlung anlegen.
          </p>
        </div>
      )}

      {/* Gebundene Datenquellen */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-night">Gebundene Kostenstände</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
            Diese Kostenermittlung rechnet mit den hier gebundenen Ständen. Bezeichnung, Stand und Datum werden
            als Kopie mitgeführt, damit die Datenbasis auch später noch nachweisbar ist.
          </p>
        </div>
        {!readOnly && (
          <button className="btn-secondary text-sm flex-shrink-0" onClick={() => setPicker(true)}>
            <Plus size={14} /> Datenquelle binden
          </button>
        )}
      </div>

      {quellen.length === 0 ? (
        <div className="card p-6 text-center space-y-2">
          <Database size={24} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-500">Noch keine Kostendatenbank gebunden.</p>
          <p className="text-xs text-gray-400 max-w-xl mx-auto">
            Ohne Bindung werden die Vergleichsspalten von Hand gepflegt. Mit Bindung lassen sich
            von/Mittel/bis je Kostengruppe aus einem nachweisbaren Kostenstand füllen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {quellen.map(q => {
            const kind = dbKind(q.dbKind)
            const st   = q.gebundenerStand
            return (
              <div key={q.id} className={`card p-3 space-y-2 border-l-4 ${q.veraltet ? 'border-l-amber-500' : q.fehlt ? 'border-l-red-500' : 'border-l-green-500'}`}>
                <div className="flex items-start gap-2">
                  <Database size={15} className="text-brand-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-night truncate">{q.dbName}</span>
                      <span className={kind.badge}>{kind.label}</span>
                      {q.primary && <span className="badge-blue" title="Leitquelle für die Erstbefüllung">Leitquelle</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{q.publisher || q.objektart || '—'}</p>
                  </div>
                  {!readOnly && (
                    <button className="text-gray-300 hover:text-red-600 flex-shrink-0" title="Bindung lösen"
                            onClick={() => unbind(q.id)}><Trash2 size={13} /></button>
                  )}
                </div>

                {q.fehlt ? (
                  <p className="text-xs text-red-700">
                    Die Datenbank existiert nicht mehr. Die mitgeführten Angaben bleiben als Nachweis erhalten:
                    Stand {q.versionLabel || '—'}{q.stand && `, ${formatDate(q.stand)}`}.
                  </p>
                ) : (
                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Kostenstand</span>
                      <span className="text-night font-medium">{q.versionLabel || '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Datum</span>
                      <span className="text-gray-700">{q.stand ? formatDate(q.stand) : '—'}</span>
                    </div>
                    {q.gebiet && (
                      <div className="flex justify-between gap-2"><span className="text-gray-500">Gebiet</span>
                        <span className="text-gray-700 truncate">{q.gebiet}</span></div>
                    )}
                    {q.ustHinweis && (
                      <div className="flex justify-between gap-2"><span className="text-gray-500">Steuer</span>
                        <span className="text-gray-700">{q.ustHinweis}</span></div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Status</span>
                      <span className={versionStatus(st?.status).badge}>{versionStatus(st?.status).label}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Kennwerte</span>
                      <span className="text-gray-700">{st?.entries?.length ?? 0}</span>
                    </div>
                  </div>
                )}

                {/* Nachweisdokumente des gebundenen Stands */}
                {(st?.documents ?? []).length > 0 && (
                  <div className="pt-2 border-t border-concrete space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Nachweis</p>
                    {st.documents.map(d => (
                      <button key={d.id} className="text-xs text-brand-700 hover:underline flex items-center gap-1 w-full text-left"
                              onClick={() => openDocument(d).catch(() => {})}>
                        <FileText size={11} className="flex-shrink-0" />
                        <span className="truncate">{d.name}</span>
                        <ExternalLink size={10} className="flex-shrink-0 text-gray-300" />
                      </button>
                    ))}
                  </div>
                )}

                {!readOnly && !q.fehlt && st && (
                  <div className="pt-2 border-t border-concrete flex gap-2">
                    <button className="btn-secondary text-xs py-1" onClick={() => fill(q.database, st, false)}
                            title="Nur Positionen füllen, die noch keine Vergleichswerte haben">
                      Leere Spalten füllen
                    </button>
                    <button className="btn-secondary text-xs py-1" onClick={() => fill(q.database, st, true)}
                            title="Alle Vergleichsspalten aus diesem Kostenstand neu setzen">
                      Alle neu setzen
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Rückfluss in die eigene Datenbank */}
      <div className="card p-3 flex items-start gap-3">
        <ArrowUpRight size={16} className="text-brand-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-night">Als Referenzobjekt übernehmen</h4>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
            Überträgt die Kennwerte dieser Kostenermittlung als neuen Kostenstand in eine Datenbank der Art
            „Eigene Kostenermittlungen". So wächst der Erfahrungsschatz des Büros mit jedem abgeschlossenen
            Projekt. Der neue Stand wird als <b>in Erfassung</b> angelegt und ist vor der Verwendung fachlich
            zu prüfen und freizugeben.
          </p>
        </div>
        <button className="btn-secondary text-sm flex-shrink-0" disabled={readOnly} onClick={() => setRefModal(true)}>
          Übernehmen
        </button>
      </div>

      {picker && (
        <BindModal
          databases={databases}
          onClose={() => setPicker(false)}
          onBind={bind}
        />
      )}

      {refModal && (
        <ReferenzModal
          draft={draft}
          result={result}
          databases={databases}
          serverUser={serverUser}
          onClose={() => setRefModal(false)}
        />
      )}
    </div>
  )
}

// ── Datenquelle binden ───────────────────────────────────────────────────────

function BindModal({ databases, onClose, onBind }) {
  const [dbId,      setDbId]      = useState(databases[0]?.id ?? '')
  const [versionId, setVersionId] = useState('')
  const [primary,   setPrimary]   = useState(true)

  const db       = databases.find(d => d.id === dbId) ?? null
  const versions = db ? sortedVersions(db) : []
  const chosen   = versions.find(v => v.id === versionId) ?? currentVersion(db) ?? versions[0] ?? null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-concrete w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-concrete flex items-center justify-between">
          <h2 className="font-semibold text-night">Kostendatenbank binden</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {databases.length === 0 ? (
            <p className="text-sm text-gray-500">
              Es ist noch keine Kostendatenbank angelegt. Datenbanken werden auf der Startseite unter
              „Kostendatenbanken" gepflegt.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Datenbank</span>
                <select className="select mt-0.5" value={dbId} onChange={e => { setDbId(e.target.value); setVersionId('') }}>
                  {databases.map(d => (
                    <option key={d.id} value={d.id}>{d.name} — {dbKind(d.kind).label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Kostenstand</span>
                <select className="select mt-0.5" value={chosen?.id ?? ''} onChange={e => setVersionId(e.target.value)}>
                  {versions.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.label || 'Ohne Bezeichnung'}
                      {v.stand ? ` · ${v.stand}` : ''} · {versionStatus(v.status).label} · {v.entries?.length ?? 0} Kennwerte
                    </option>
                  ))}
                </select>
              </label>

              {chosen && chosen.status !== 'freigegeben' && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  Dieser Kostenstand ist nicht freigegeben. Für eine abzugebende Kostenermittlung sollte ein
                  freigegebener Stand verwendet werden.
                </p>
              )}

              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={primary} onChange={e => setPrimary(e.target.checked)} />
                <span>Als <b>Leitquelle</b> kennzeichnen – die Datenbank, aus der die Erstbefüllung stammt.</span>
              </label>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-concrete flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={!db || !chosen} onClick={() => onBind(db, chosen, primary)}>
            <Plus size={14} /> Binden
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Referenzobjekt in die eigene Datenbank übernehmen ────────────────────────

function ReferenzModal({ draft, result, databases, serverUser, onClose }) {
  const { save, create } = useKostendatenbanken()
  const eigene = databases.filter(d => d.kind === 'eigen')
  const [dbId,  setDbId]  = useState(eigene[0]?.id ?? '__neu')
  const [vkey,  setVkey]  = useState(result.vkeys[0])
  const [ebene, setEbene] = useState(2)
  const [label, setLabel] = useState(draft.projectName || draft.name || '')
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState(null)

  // Parameterwerte für die Bezugsgrößen
  const evalParam = useMemo(() => {
    const lookup = buildLookup(draft)
    return (key) => evaluate(key ? `=${key}` : '', { lookup }).value
  }, [draft])

  const [bezuege, setBezuege] = useState(() => defaultBezuege(draft, evalParam))

  // Welche Hauptkostengruppen kommen in dieser Ermittlung überhaupt vor?
  const kg1Liste = useMemo(() => {
    const set = new Set(result.totals.kg1Rows.map(r => r.kg))
    return KG1.filter(k => set.has(k.kg))
  }, [result])

  const paramKeys = useMemo(
    () => (draft.parameters ?? []).map(p => String(p.key ?? '').trim()).filter(Boolean),
    [draft.parameters]
  )

  const setBezug = (kg, patch) => setBezuege(prev => {
    const key = kg === 'default' ? 'default' : String(kg)
    const cur = prev[key] ?? prev.default ?? { key: '', art: 'BGF', wert: null }
    const next = { ...cur, ...patch }
    next.wert = evalParam(next.key)
    return { ...prev, [key]: next.key ? next : undefined }
  })

  const vorschau = useMemo(() => referenzKostenstand(draft, result, {
    vkey, ebene, label, bezuege,
    by: serverUser?.displayName || serverUser?.username || '',
  }), [draft, result, vkey, ebene, label, bezuege, serverUser])

  const uebernehmen = async () => {
    if (!vorschau) { setError('Keine Kostengruppe hat eine gültige Bezugsgröße – ohne sie lassen sich keine Kennwerte bilden.'); return }
    setBusy(true); setError(null)
    try {
      if (dbId === '__neu') {
        await create({
          ...emptyDatabase('eigen'),
          name: 'Eigene Kostenermittlungen',
          publisher: 'Eigene abgeschlossene Projekte',
          description: 'Aus abgeschlossenen Kostenermittlungen abgeleitete Referenzkennwerte des Büros.',
          versions: [vorschau],
        })
      } else {
        const db = databases.find(d => d.id === dbId)
        await save({ ...db, versions: [...(db.versions ?? []), vorschau] })
      }
      onClose()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const bezugRow = (kg, labelText) => {
    const key = kg === 'default' ? 'default' : String(kg)
    const b   = bezuege[key]
    const geerbt = kg !== 'default' && !b
    const eff = b ?? bezuege.default
    return (
      <tr key={key} className="border-t border-gray-100">
        <td className="px-2 py-1 whitespace-nowrap">{labelText}</td>
        <td className="px-1 py-0.5">
          <select className="select text-xs" value={geerbt ? '' : (b?.key ?? '')}
                  onChange={e => setBezug(kg, { key: e.target.value })}>
            {kg !== 'default' && <option value="">wie Standard</option>}
            <option value="">— keine —</option>
            {paramKeys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </td>
        <td className="px-1 py-0.5">
          <select className="select text-xs" value={eff?.art ?? 'BGF'} disabled={geerbt}
                  onChange={e => setBezug(kg, { art: e.target.value })}>
            {ENTRY_BEZUG.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </td>
        <td className="px-2 py-1 text-right tabular-nums text-gray-600">
          {eff?.wert ? fmtNum(eff.wert) : <span className="text-red-600">fehlt</span>}
        </td>
      </tr>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-concrete w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-concrete flex items-center justify-between">
          <h2 className="font-semibold text-night">Als Referenzobjekt übernehmen</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Zieldatenbank</span>
              <select className="select mt-0.5" value={dbId} onChange={e => setDbId(e.target.value)}>
                {eigene.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value="__neu">Neu anlegen: „Eigene Kostenermittlungen"</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Variante</span>
              <select className="select mt-0.5" value={vkey} onChange={e => setVkey(e.target.value)}>
                {result.variants.map(v => <option key={v.key} value={v.key}>{v.key} · {v.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Gliederungstiefe</span>
              <select className="select mt-0.5" value={ebene} onChange={e => setEbene(Number(e.target.value))}>
                <option value={1}>1. Ebene (KG 100–800)</option>
                <option value={2}>2. Ebene (KG x10–x90)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Bezeichnung des Stands</span>
              <input className="input mt-0.5" value={label} onChange={e => setLabel(e.target.value)} />
            </label>
          </div>

          {/* Bezugsgrößen je Kostengruppe */}
          <div>
            <p className="text-xs font-medium text-gray-600">Bezugsgröße je Kostengruppe</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-1.5 max-w-3xl leading-relaxed">
              Nicht jede Kostengruppe bezieht sich auf dieselbe Größe: KG 500 rechnet gegen die
              Außenanlagenfläche, KG 200 gegen die Grundstücksfläche. Kostengruppen ohne Bezugsgröße
              werden übersprungen statt gegen eine unpassende Größe gerechnet.
            </p>
            <div className="card overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-concrete">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-semibold text-night w-[26%]">Kostengruppe</th>
                    <th className="px-2 py-1.5 font-semibold text-night w-[26%]">Parameter</th>
                    <th className="px-2 py-1.5 font-semibold text-night w-[26%]">Art</th>
                    <th className="px-2 py-1.5 font-semibold text-night text-right">Wert</th>
                  </tr>
                </thead>
                <tbody>
                  {bezugRow('default', 'Standard (alle übrigen)')}
                  {kg1Liste.map(k => bezugRow(k.kg, `KG ${k.kg} · ${k.label}`))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-concrete pl-3">
            Gerechnet wird: Nettokosten der Kostengruppe ÷ Bezugsgröße, anschließend auf brutto hochgerechnet,
            damit die Werte mit BKI-Kennwerten vergleichbar bleiben. Ein Referenzobjekt liefert einen
            Einzelwert, keine Spanne – er landet in der Spalte „Mittel".
          </p>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 flex items-center gap-1.5">
              <AlertTriangle size={12} /> {error}
            </p>
          )}

          {vorschau ? (
            <>
              {vorschau.ohneBezug?.length > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 flex items-start gap-1.5">
                  <Info size={12} className="mt-0.5 flex-shrink-0" />
                  Übersprungen mangels Bezugsgröße: KG {vorschau.ohneBezug.join(', ')}.
                </p>
              )}
              <div className="card overflow-x-auto max-h-64">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-concrete sticky top-0">
                    <tr className="text-left">
                      <th className="px-2 py-1.5">KG</th>
                      <th className="px-2 py-1.5">Bezeichnung</th>
                      <th className="px-2 py-1.5 text-right">Kennwert brutto</th>
                      <th className="px-2 py-1.5">Einheit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vorschau.entries.map(e => (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="px-2 py-1 tabular-nums">{e.kg}</td>
                        <td className="px-2 py-1">{e.label}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-medium">{e.mittel}</td>
                        <td className="px-2 py-1 text-gray-500">{e.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              Keine Kostengruppe hat eine gültige Bezugsgröße. In den Kopfdaten unter „Bezugsgröße der Kennzahl"
              einen Parameter eintragen, der einen Wert liefert.
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-concrete flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={busy || !vorschau} onClick={uebernehmen}>
            {busy ? <Loader size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
            {vorschau ? `${vorschau.entries.length} Kennwerte übernehmen` : 'Übernehmen'}
          </button>
        </div>
      </div>
    </div>
  )
}
