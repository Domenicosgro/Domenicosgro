import React, { useState, useMemo, useRef } from 'react'
import {
  ArrowLeft, Plus, Trash2, Loader, AlertCircle, X, Database, FileText, Upload,
  ChevronDown, ChevronRight, Copy, Check, Search, ExternalLink, Lock, CalendarClock,
} from 'lucide-react'
import { useKostendatenbanken, uploadDocument, openDocument, deleteDocument } from '../hooks/useKostendatenbanken'
import {
  DB_KINDS, dbKind, VERSION_STATUS, versionStatus, ENTRY_BEZUG, bezugUnit, DOC_KINDS,
  emptyDatabase, emptyVersion, emptyEntry, emptyDocument,
  sortedVersions, entryCount, documentCount, currentVersion,
} from '../kosten/datenbank'
import { KG1, KG2, KG3, kgLabel } from '../kosten/din276'
import { formatDate, uid } from '../utils'
import { ValueCell, TextCell, SelectCell, AreaCell } from './kosten/cells'

// Büroweite Kostendatenbanken.
//
// Jede Datenbank führt mehrere Kostenstände. Ein Kostenstand ist der
// nachweisbare Zustand zu einem Datum – mit seinen Kennwerten und den
// Dokumenten, die ihn belegen. Bestehende Stände werden nicht überschrieben,
// sondern abgelöst, damit ältere Kostenermittlungen nachvollziehbar bleiben.

export default function KostendatenbankView({ serverUser, onBack, canEdit = true }) {
  const { databases, loaded, saving, error, setError, create, save, remove } = useKostendatenbanken()
  const [openId,  setOpenId]  = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [search,  setSearch]  = useState('')

  const current = databases.find(d => d.id === openId) ?? null

  if (!loaded) {
    return (
      <div className="app-page">
        <Header onBack={onBack} />
        <div className="card p-10 flex items-center justify-center text-gray-400 gap-2">
          <Loader size={16} className="animate-spin" /> Kostendatenbanken werden geladen …
        </div>
      </div>
    )
  }

  if (current) {
    return (
      <DatabaseEditor
        key={current.id}
        database={current}
        saving={saving}
        error={error}
        canEdit={canEdit}
        serverUser={serverUser}
        onSave={save}
        onBack={() => setOpenId(null)}
      />
    )
  }

  const q = search.trim().toLowerCase()
  const visible = q
    ? databases.filter(d => [d.name, d.publisher, d.objektart, d.description].some(v => String(v ?? '').toLowerCase().includes(q)))
    : databases

  const byKind = DB_KINDS.map(k => ({ ...k, items: visible.filter(d => d.kind === k.value) }))

  return (
    <div className="app-page">
      <Header onBack={onBack}>
        {canEdit && <button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={16} /> Neue Kostendatenbank</button>}
      </Header>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
          <button className="ml-auto text-red-500 hover:text-red-700" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}
      {!canEdit && (
        <p className="text-xs text-gray-600 bg-concrete px-3 py-2 flex items-center gap-1.5">
          <Lock size={12} /> Nur-Lese-Zugriff: Kostendatenbanken pflegen Systemadministratoren.
        </p>
      )}

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-7" placeholder="Datenbank suchen …" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {databases.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <Database size={30} className="mx-auto text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-700">Noch keine Kostendatenbank angelegt</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xl mx-auto leading-relaxed">
              Kostendatenbanken liefern die Kennwerte für alle Kostenermittlungen des Büros – aus BKI,
              aus eigenen abgeschlossenen Projekten oder aus externen Quellen. Jede Datenbank führt
              mehrere Kostenstände mit den Dokumenten, die sie belegen.
            </p>
          </div>
          {canEdit && <button className="btn-primary mx-auto" onClick={() => setShowNew(true)}><Plus size={16} /> Kostendatenbank anlegen</button>}
        </div>
      ) : (
        byKind.filter(k => k.items.length > 0).map(k => (
          <section key={k.value} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-night">{k.label}</h2>
              <span className="text-xs text-gray-400">{k.hint}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {k.items.map(d => (
                <DatabaseCard
                  key={d.id}
                  database={d}
                  canEdit={canEdit}
                  onOpen={() => setOpenId(d.id)}
                  onDelete={() => window.confirm(`„${d.name}" mit allen Kostenständen und Dokumenten löschen?`) && remove(d.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {showNew && (
        <NewDatabaseModal
          onClose={() => setShowNew(false)}
          onCreate={async (draft) => {
            const saved = await create(draft)
            setShowNew(false)
            setOpenId(saved.id)
          }}
        />
      )}
    </div>
  )
}

function Header({ onBack, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="flex items-end gap-3">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Startseite</button>
        <div>
          <h1 className="text-2xl font-bold text-night">Kostendatenbanken</h1>
          <p className="text-sm text-gray-500 mt-0.5">Büroweite Kennwertquellen mit nachweisbarem Kostenstand</p>
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function DatabaseCard({ database, onOpen, onDelete, canEdit }) {
  const kind = dbKind(database.kind)
  const aktuell = currentVersion(database)
  return (
    <div className="card p-4 flex flex-col gap-2 hover:border-brand-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button className="text-left flex-1 min-w-0" onClick={onOpen}>
          <h3 className="font-semibold text-sm text-night truncate hover:text-brand-700">{database.name || 'Ohne Namen'}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{database.publisher || database.objektart || '—'}</p>
        </button>
        <span className={`${kind.badge} flex-shrink-0`}>{kind.label}</span>
      </div>

      <button className="text-left" onClick={onOpen}>
        {aktuell ? (
          <>
            <div className="text-sm font-bold text-night">Kostenstand {aktuell.label || '—'}</div>
            <div className="text-xs text-gray-400">
              {aktuell.stand ? formatDate(aktuell.stand) : 'ohne Datum'} · {aktuell.entries?.length ?? 0} Kennwerte
            </div>
          </>
        ) : (
          <div className="text-xs text-amber-700">Kein freigegebener Kostenstand</div>
        )}
      </button>

      <div className="flex items-center gap-2 text-xs text-gray-500 mt-auto pt-2 border-t border-concrete">
        <span>{(database.versions ?? []).length} Stände</span>
        <span>{entryCount(database)} Kennwerte</span>
        <span className="flex items-center gap-1"><FileText size={11} />{documentCount(database)}</span>
        {canEdit && (
          <button className="ml-auto text-gray-300 hover:text-red-600" title="Datenbank löschen" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Editor einer Kostendatenbank ─────────────────────────────────────────────

function DatabaseEditor({ database, saving, error, canEdit, serverUser, onSave, onBack }) {
  const [draft, setDraft] = useState(database)
  const [dirty, setDirty] = useState(false)
  const [openVersion, setOpenVersion] = useState(() => sortedVersions(database)[0]?.id ?? null)

  const mutate = (fn) => { if (!canEdit) return; setDraft(prev => fn(prev)); setDirty(true) }
  const patch  = (p)  => mutate(prev => ({ ...prev, ...p }))
  const persist = async () => { const r = await onSave(draft); if (r) setDirty(false) }

  const versions = sortedVersions(draft)

  const addVersion = (copyFrom = null) => {
    const base = copyFrom ? draft.versions.find(v => v.id === copyFrom) : null
    const v = {
      ...emptyVersion(''),
      importedBy: serverUser?.displayName || serverUser?.username || '',
      gebiet:     base?.gebiet ?? '',
      ustHinweis: base?.ustHinweis ?? '',
      // Struktur übernehmen, Werte aber leeren: ein neuer Kostenstand ist ein
      // neuer Preisstand, kein Duplikat der alten Zahlen.
      entries: (base?.entries ?? []).map(e => ({ ...e, id: uid(), von: '', mittel: '', bis: '' })),
      note: base ? `Struktur übernommen aus Kostenstand „${base.label || '—'}"; Werte neu zu erfassen.` : '',
    }
    mutate(prev => ({ ...prev, versions: [...(prev.versions ?? []), v] }))
    setOpenVersion(v.id)
  }

  const setVersion = (vid, p) =>
    mutate(prev => ({ ...prev, versions: prev.versions.map(v => (v.id === vid ? { ...v, ...p } : v)) }))

  const removeVersion = async (v) => {
    if (!window.confirm(`Kostenstand „${v.label || '—'}" mit ${v.entries?.length ?? 0} Kennwerten und ${v.documents?.length ?? 0} Dokumenten löschen?`)) return
    for (const doc of v.documents ?? []) await deleteDocument(doc)
    mutate(prev => ({ ...prev, versions: prev.versions.filter(x => x.id !== v.id) }))
  }

  /** Setzt einen Stand freigegeben und löst alle älteren freigegebenen ab. */
  const freigeben = (vid) => mutate(prev => ({
    ...prev,
    versions: prev.versions.map(v =>
      v.id === vid            ? { ...v, status: 'freigegeben' }
      : v.status === 'freigegeben' ? { ...v, status: 'abgeloest' }
      : v),
  }))

  const kind = dbKind(draft.kind)

  return (
    <div className="app-page">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex items-end gap-3 min-w-0">
          <button className="btn-secondary flex-shrink-0" onClick={() => { if (dirty) persist(); onBack() }}>
            <ArrowLeft size={16} /> Alle Datenbanken
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-night flex items-center gap-2 flex-wrap">
              <span className="truncate">{draft.name || 'Ohne Namen'}</span>
              <span className={kind.badge}>{kind.label}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {draft.publisher || '—'}
              {draft.objektart && ` · ${draft.objektart}`}
              {` · ${versions.length} Kostenstände · ${entryCount(draft)} Kennwerte`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && (
            <>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                {saving ? <><Loader size={12} className="animate-spin" /> speichert …</>
                 : dirty ? 'ungespeicherte Änderungen'
                 : <><Check size={12} className="text-green-600" /> gespeichert</>}
              </span>
              <button className="btn-primary" disabled={!dirty || saving} onClick={persist}>Speichern</button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
        </p>
      )}

      {/* Stammdaten */}
      <section className="card p-4 space-y-3">
        <h3 className="section-title">Stammdaten</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Bezeichnung">
            <input className="input" value={draft.name ?? ''} disabled={!canEdit} onChange={e => patch({ name: e.target.value })} />
          </Field>
          <Field label="Art">
            <select className="select" value={draft.kind} disabled={!canEdit} onChange={e => patch({ kind: e.target.value })}>
              {DB_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="Herausgeber / Herkunft">
            <input className="input" value={draft.publisher ?? ''} disabled={!canEdit}
                   placeholder="BKI Baukosteninformationszentrum" onChange={e => patch({ publisher: e.target.value })} />
          </Field>
          <Field label="Objektart / Vergleichsgruppe">
            <input className="input" value={draft.objektart ?? ''} disabled={!canEdit}
                   placeholder="Objektgruppe 023 – Modernisierung Sporthallen" onChange={e => patch({ objektart: e.target.value })} />
          </Field>
        </div>
        <Field label="Beschreibung / Verwendungshinweis">
          <textarea className="textarea" rows={2} value={draft.description ?? ''} disabled={!canEdit}
                    onChange={e => patch({ description: e.target.value })} />
        </Field>
      </section>

      {/* Kostenstände */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-night">Kostenstände</h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
              Ein neuer Preisstand wird als neuer Kostenstand angelegt – bestehende Werte werden nie überschrieben.
              Beim Freigeben wird der bisher freigegebene Stand automatisch auf „abgelöst" gesetzt; bereits
              gerechnete Kostenermittlungen behalten ihren Stand.
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-shrink-0">
              {versions.length > 0 && (
                <button className="btn-secondary text-sm" onClick={() => addVersion(versions[0].id)}
                        title="Neuen Kostenstand mit der Struktur des aktuellsten anlegen">
                  <Copy size={14} /> Aus letztem Stand
                </button>
              )}
              <button className="btn-secondary text-sm" onClick={() => addVersion()}><Plus size={14} /> Kostenstand</button>
            </div>
          )}
        </div>

        {versions.length === 0 && (
          <div className="card p-6 text-center text-sm text-gray-400">
            Noch kein Kostenstand angelegt.
          </div>
        )}

        {versions.map(v => (
          <VersionPanel
            key={v.id}
            version={v}
            open={openVersion === v.id}
            canEdit={canEdit}
            serverUser={serverUser}
            onToggle={() => setOpenVersion(openVersion === v.id ? null : v.id)}
            onChange={(p) => setVersion(v.id, p)}
            onFreigeben={() => freigeben(v.id)}
            onDelete={() => removeVersion(v)}
          />
        ))}
      </section>
    </div>
  )
}

// ── Ein Kostenstand ──────────────────────────────────────────────────────────

function VersionPanel({ version, open, canEdit, serverUser, onToggle, onChange, onFreigeben, onDelete }) {
  const status = versionStatus(version.status)
  const [tab, setTab] = useState('kennwerte')

  return (
    <div className={`card ${version.status === 'freigegeben' ? 'border-l-4 border-l-green-500' : version.status === 'abgeloest' ? 'opacity-70' : 'border-l-4 border-l-amber-400'}`}>
      <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
        <button className="flex items-center gap-2 min-w-0" onClick={onToggle}>
          {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
          <CalendarClock size={14} className="text-brand-600 flex-shrink-0" />
          <span className="font-semibold text-sm text-night truncate">{version.label || 'Ohne Bezeichnung'}</span>
        </button>
        <span className={status.badge} title={status.hint}>{status.label}</span>
        <span className="text-xs text-gray-500">{version.stand ? formatDate(version.stand) : 'ohne Datum'}</span>
        <span className="text-xs text-gray-400">{version.entries?.length ?? 0} Kennwerte</span>
        <span className="text-xs text-gray-400 flex items-center gap-1"><FileText size={11} />{version.documents?.length ?? 0}</span>
        {version.importedBy && <span className="text-xs text-gray-300 truncate">eingespielt von {version.importedBy}</span>}

        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            {version.status !== 'freigegeben' && (
              <button className="btn-secondary text-xs" onClick={onFreigeben}>Freigeben</button>
            )}
            <button className="text-gray-300 hover:text-red-600" title="Kostenstand löschen" onClick={onDelete}><Trash2 size={13} /></button>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-concrete">
          {/* Metadaten */}
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-50/60">
            <Field label="Bezeichnung des Stands">
              <input className="input" value={version.label ?? ''} disabled={!canEdit} placeholder="Q2/2026"
                     onChange={e => onChange({ label: e.target.value })} />
            </Field>
            <Field label="Kostenstand (Datum)">
              <input type="date" className="input" value={version.stand ?? ''} disabled={!canEdit}
                     onChange={e => onChange({ stand: e.target.value })} />
            </Field>
            <Field label="Im Büro zu verwenden ab">
              <input type="date" className="input" value={version.gueltigAb ?? ''} disabled={!canEdit}
                     onChange={e => onChange({ gueltigAb: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="select" value={version.status} disabled={!canEdit} onChange={e => onChange({ status: e.target.value })}>
                {VERSION_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Gebietsstand">
              <input className="input" value={version.gebiet ?? ''} disabled={!canEdit} placeholder="Bundesdurchschnitt"
                     onChange={e => onChange({ gebiet: e.target.value })} />
            </Field>
            <Field label="Steuerhinweis">
              <input className="input" value={version.ustHinweis ?? ''} disabled={!canEdit} placeholder="inkl. 19 % MwSt."
                     onChange={e => onChange({ ustHinweis: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Vermerk">
                <input className="input" value={version.note ?? ''} disabled={!canEdit}
                       onChange={e => onChange({ note: e.target.value })} />
              </Field>
            </div>
          </div>

          {/* Reiter */}
          <div className="flex gap-px border-b border-concrete px-3">
            {[['kennwerte', `Kennwerte (${version.entries?.length ?? 0})`],
              ['dokumente', `Nachweisdokumente (${version.documents?.length ?? 0})`]].map(([id, label]) => (
              <button key={id}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-brand-600'}`}
                onClick={() => setTab(id)}
              >{label}</button>
            ))}
          </div>

          {tab === 'kennwerte'
            ? <EntryTable version={version} canEdit={canEdit} onChange={onChange} />
            : <DocumentList version={version} canEdit={canEdit} serverUser={serverUser} onChange={onChange} />}
        </div>
      )}
    </div>
  )
}

// ── Kennwerte eines Kostenstands ─────────────────────────────────────────────

function EntryTable({ version, canEdit, onChange }) {
  const [showImport, setShowImport] = useState(false)
  const entries = version.entries ?? []

  const setEntry = (id, p) => onChange({ entries: entries.map(e => (e.id === id ? { ...e, ...p } : e)) })
  const addEntry = ()      => onChange({ entries: [...entries, emptyEntry()] })
  const delEntry = (id)    => onChange({ entries: entries.filter(e => e.id !== id) })

  return (
    <div className="space-y-2 p-3">
      {canEdit && (
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-sm" onClick={addEntry}><Plus size={14} /> Kennwert</button>
          <button className="btn-secondary text-sm" onClick={() => setShowImport(true)}><Upload size={14} /> Aus Tabelle einfügen</button>
          <span className="text-xs text-gray-400 ml-auto">{entries.length} Kennwerte</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-concrete text-left text-xs">
              <th className="px-2 py-2 font-semibold text-night w-[80px]">KG</th>
              <th className="px-2 py-2 font-semibold text-night w-[20%]">Bezeichnung</th>
              <th className="px-2 py-2 font-semibold text-night w-[20%]">Leistung / Abgrenzung</th>
              <th className="px-2 py-2 font-semibold text-night w-[120px]">Bezug</th>
              <th className="px-2 py-2 font-semibold text-night w-[90px] text-right">von</th>
              <th className="px-2 py-2 font-semibold text-night w-[90px] text-right">Mittel</th>
              <th className="px-2 py-2 font-semibold text-night w-[90px] text-right">bis</th>
              <th className="px-2 py-2 font-semibold text-night w-[110px]">Einheit</th>
              <th className="px-2 py-2 font-semibold text-night">Quelle</th>
              {canEdit && <th className="px-2 py-2 w-[40px]" />}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-t border-gray-100 align-top">
                <td className="px-1 py-0.5">
                  <TextCell value={String(e.kg ?? '')} list="kosten-kg-liste" placeholder="335"
                            onChange={v => setEntry(e.id, { kg: v, label: e.label || kgLabel(v) })} />
                </td>
                <td className="px-1 py-0.5"><TextCell value={e.label} onChange={v => setEntry(e.id, { label: v })} /></td>
                <td className="px-1 py-0.5"><TextCell value={e.leistung} onChange={v => setEntry(e.id, { leistung: v })}
                                                      placeholder="z. B. Herstellen / Abbrechen" /></td>
                <td className="px-1 py-0.5">
                  <SelectCell value={e.bezug} options={ENTRY_BEZUG.map(b => ({ value: b.value, label: b.label }))}
                              onChange={v => setEntry(e.id, { bezug: v, unit: bezugUnit(v) + (e.brutto ? ' brutto' : ' netto') })} />
                </td>
                <td className="px-1 py-0.5"><ValueCell value={e.von}    onChange={v => setEntry(e.id, { von: v })} /></td>
                <td className="px-1 py-0.5"><ValueCell value={e.mittel} onChange={v => setEntry(e.id, { mittel: v })} /></td>
                <td className="px-1 py-0.5"><ValueCell value={e.bis}    onChange={v => setEntry(e.id, { bis: v })} /></td>
                <td className="px-1 py-0.5"><TextCell value={e.unit} onChange={v => setEntry(e.id, { unit: v })} /></td>
                <td className="px-1 py-0.5"><TextCell value={e.quelle} onChange={v => setEntry(e.id, { quelle: v })}
                                                      placeholder="S. 419" /></td>
                {canEdit && (
                  <td className="px-2 py-1.5 text-right">
                    <button className="text-gray-300 hover:text-red-600" onClick={() => delEntry(e.id)}><Trash2 size={13} /></button>
                  </td>
                )}
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={canEdit ? 10 : 9} className="px-3 py-6 text-center text-sm text-gray-400">
                Noch keine Kennwerte erfasst.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <datalist id="kosten-kg-liste">
        {[...KG1, ...KG2, ...KG3].map(k => <option key={k.kg} value={k.kg}>{`${k.kg} · ${k.label}`}</option>)}
      </datalist>

      <p className="text-xs text-gray-500 leading-relaxed">
        Kennwerte werden als <b>Bruttowerte</b> geführt, wie BKI sie ausweist. Die Umrechnung auf netto passiert
        erst in der Kostenermittlung. Liegt ein Wert netto vor, im Feld „Einheit" vermerken.
      </p>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={(rows) => { onChange({ entries: [...entries, ...rows] }); setShowImport(false) }}
        />
      )}
    </div>
  )
}

// ── Nachweisdokumente ────────────────────────────────────────────────────────

function DocumentList({ version, canEdit, serverUser, onChange }) {
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const docs = version.documents ?? []

  const addFiles = async (files) => {
    setBusy(true); setError(null)
    try {
      const added = []
      for (const file of Array.from(files || [])) {
        const meta = await uploadDocument(file)
        added.push({
          ...emptyDocument(), ...meta,
          kind: guessKind(file.name),
          uploadedBy: serverUser?.displayName || serverUser?.username || '',
        })
      }
      onChange({ documents: [...docs, ...added] })
    } catch (e) { setError(e.message) }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const removeDoc = async (doc) => {
    if (!window.confirm(`Dokument „${doc.name}" aus diesem Kostenstand entfernen?`)) return
    await deleteDocument(doc)
    onChange({ documents: docs.filter(d => d.id !== doc.id) })
  }

  return (
    <div className="p-3 space-y-2">
      {canEdit && (
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" multiple className="hidden"
                 accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip,.png,.jpg,.jpeg"
                 onChange={e => addFiles(e.target.files)} />
          <button className="btn-secondary text-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />} Dokument hinzufügen
          </button>
          <span className="text-xs text-gray-400">PDF, Excel, CSV, Word, ZIP oder Bild</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Noch kein Nachweisdokument hinterlegt. Ohne Beleg ist der Kostenstand fachlich nicht nachvollziehbar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-concrete text-left text-xs">
                <th className="px-2 py-2 font-semibold text-night">Dokument</th>
                <th className="px-2 py-2 font-semibold text-night w-[160px]">Art</th>
                <th className="px-2 py-2 font-semibold text-night w-[90px] text-right">Größe</th>
                <th className="px-2 py-2 font-semibold text-night w-[150px]">Eingespielt</th>
                <th className="px-2 py-2 font-semibold text-night">Vermerk</th>
                <th className="px-2 py-2 w-[70px]" />
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-1.5">
                    <button className="text-left text-brand-700 hover:underline flex items-start gap-1.5"
                            onClick={() => openDocument(d).catch(e => setError(e.message))}>
                      <FileText size={13} className="mt-0.5 flex-shrink-0" />
                      <span className="break-all">{d.name}</span>
                    </button>
                  </td>
                  <td className="px-1 py-0.5">
                    <SelectCell value={d.kind} options={DOC_KINDS.map(k => ({ value: k, label: k }))}
                                onChange={v => onChange({ documents: docs.map(x => (x.id === d.id ? { ...x, kind: v } : x)) })} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-500 tabular-nums">{fmtSize(d.size)}</td>
                  <td className="px-2 py-1.5 text-gray-500 text-xs">
                    {d.uploadedAt ? formatDate(d.uploadedAt.slice(0, 10)) : '—'}
                    {d.uploadedBy && <div className="text-gray-400">{d.uploadedBy}</div>}
                  </td>
                  <td className="px-1 py-0.5">
                    <TextCell value={d.note}
                              onChange={v => onChange({ documents: docs.map(x => (x.id === d.id ? { ...x, note: v } : x)) })} />
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button className="text-gray-300 hover:text-brand-600 p-0.5" title="Öffnen"
                            onClick={() => openDocument(d).catch(e => setError(e.message))}><ExternalLink size={13} /></button>
                    {canEdit && (
                      <button className="text-gray-300 hover:text-red-600 p-0.5" title="Entfernen"
                              onClick={() => removeDoc(d)}><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tabellenimport ───────────────────────────────────────────────────────────

function ImportModal({ onClose, onImport }) {
  const [text,    setText]    = useState('')
  const [preview, setPreview] = useState([])
  const [error,   setError]   = useState(null)
  const fileRef = useRef(null)

  const parse = (raw) => {
    setError(null)
    try {
      const rows = parseTable(raw)
      setPreview(rows)
      if (!rows.length) setError('Keine verwertbaren Zeilen gefunden.')
    } catch (e) { setError(e.message); setPreview([]) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-concrete w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-concrete flex items-center justify-between">
          <h2 className="font-semibold text-night">Kennwerte aus Tabelle einfügen</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            Spalten aus Excel kopieren und hier einfügen, oder eine CSV-Datei wählen. Erwartet werden – durch
            Tabulator, Semikolon oder Komma getrennt:
            <code className="bg-concrete px-1 mx-1">KG; Bezeichnung; Leistung; Bezug; von; Mittel; bis; Einheit; Quelle</code>.
            Eine Kopfzeile wird erkannt und übersprungen. Es genügen die ersten Spalten; fehlende bleiben leer.
          </p>

          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden"
                   onChange={async e => {
                     const f = e.target.files?.[0]
                     if (!f) return
                     const raw = await f.text()
                     setText(raw); parse(raw)
                   }} />
            <button className="btn-secondary text-sm" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> CSV-Datei wählen
            </button>
          </div>

          <textarea
            className="textarea font-mono text-xs" rows={8}
            placeholder={'335\tAußenwandbekleidungen, außen\tHerstellen\tm2\t166\t271\t564\t€/m² brutto\tS. 420'}
            value={text}
            onChange={e => { setText(e.target.value); parse(e.target.value) }}
          />

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 flex items-center gap-1.5">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          {preview.length > 0 && (
            <div className="card overflow-x-auto max-h-64">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-concrete sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">KG</th><th className="px-2 py-1.5">Bezeichnung</th>
                    <th className="px-2 py-1.5">Leistung</th><th className="px-2 py-1.5">Bezug</th>
                    <th className="px-2 py-1.5 text-right">von</th><th className="px-2 py-1.5 text-right">Mittel</th>
                    <th className="px-2 py-1.5 text-right">bis</th><th className="px-2 py-1.5">Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(r => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-2 py-1 tabular-nums">{r.kg}</td>
                      <td className="px-2 py-1">{r.label}</td>
                      <td className="px-2 py-1">{r.leistung}</td>
                      <td className="px-2 py-1">{r.bezug}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.von}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.mittel}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.bis}</td>
                      <td className="px-2 py-1">{r.quelle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-concrete flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={!preview.length} onClick={() => onImport(preview)}>
            <Plus size={14} /> {preview.length} Kennwerte übernehmen
          </button>
        </div>
      </div>
    </div>
  )
}

/** Erkennt Trennzeichen, überspringt eine Kopfzeile und baut Kennwerte. */
function parseTable(raw) {
  const lines = String(raw).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return []

  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const looksLikeHeader = /^\s*(kg|kostengruppe)\b/i.test(lines[0])
  const body = looksLikeHeader ? lines.slice(1) : lines

  const out = []
  for (const line of body) {
    const c = line.split(sep).map(x => x.trim().replace(/^"|"$/g, ''))
    const kg = (c[0] ?? '').replace(/[^0-9]/g, '')
    if (!kg) continue
    const bezug = normBezug(c[3])
    out.push({
      ...emptyEntry(kg),
      label:    c[1] || kgLabel(kg),
      leistung: c[2] || '',
      bezug,
      von:      c[4] || '',
      mittel:   c[5] || '',
      bis:      c[6] || '',
      unit:     c[7] || bezugUnit(bezug) + ' brutto',
      quelle:   c[8] || '',
    })
  }
  return out
}

const normBezug = (v) => {
  const s = String(v ?? '').trim().toLowerCase()
  const hit = ENTRY_BEZUG.find(b => b.value.toLowerCase() === s || b.label.toLowerCase() === s)
  if (hit) return hit.value
  if (s.includes('bgf')) return 'BGF'
  if (s.includes('bri')) return 'BRI'
  if (s.includes('nuf')) return 'NUF'
  if (s.includes('af'))  return 'AF'
  if (s.includes('gf'))  return 'GF'
  if (s.includes('st'))  return 'St'
  if (s.includes('m³') || s.includes('m3')) return 'm3'
  if (s.includes('m²') || s.includes('m2')) return 'm2'
  return 'BGF'
}

// ── Neue Datenbank ───────────────────────────────────────────────────────────

function NewDatabaseModal({ onClose, onCreate }) {
  const [kind, setKind] = useState('bki')
  const [name, setName] = useState('')
  const [publisher, setPublisher] = useState('')
  const [busy, setBusy] = useState(false)

  const presets = {
    bki:    { name: 'BKI Baukosten – ', publisher: 'BKI Baukosteninformationszentrum Deutscher Architektenkammern' },
    eigen:  { name: 'Eigene Kostenermittlungen', publisher: 'GHBA / Komplizen' },
    extern: { name: '', publisher: '' },
  }

  const choose = (k) => {
    setKind(k)
    if (!name || Object.values(presets).some(p => p.name === name)) setName(presets[k].name)
    if (!publisher || Object.values(presets).some(p => p.publisher === publisher)) setPublisher(presets[k].publisher)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-concrete w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-concrete flex items-center justify-between">
          <h2 className="font-semibold text-night">Neue Kostendatenbank</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-600">Art der Datenbank</span>
            {DB_KINDS.map(k => (
              <button key={k.value}
                className={`w-full text-left card p-3 border-l-4 transition-colors ${kind === k.value ? 'border-l-brand-600 bg-sky/10 border-brand-300' : 'border-l-transparent hover:border-brand-200'}`}
                onClick={() => choose(k.value)}>
                <div className="flex items-center gap-2">
                  <Database size={15} className="text-brand-600 flex-shrink-0" />
                  <span className="font-medium text-sm text-night">{k.label}</span>
                  {kind === k.value && <Check size={14} className="text-brand-600 ml-auto" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">{k.hint}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Bezeichnung">
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                     placeholder="BKI Modernisierungen Sporthallen" autoFocus />
            </Field>
            <Field label="Herausgeber / Herkunft">
              <input className="input" value={publisher} onChange={e => setPublisher(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-concrete flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={busy || !name.trim()}
                  onClick={async () => {
                    setBusy(true)
                    try { await onCreate({ ...emptyDatabase(kind), name: name.trim(), publisher: publisher.trim() }) }
                    finally { setBusy(false) }
                  }}>
            {busy ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Anlegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Kleinteile ───────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}

const fmtSize = (bytes) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const guessKind = (name) => {
  const n = String(name).toLowerCase()
  if (n.includes('regionalfaktor')) return 'Regionalfaktoren'
  if (n.includes('erläuter') || n.includes('erlauter') || n.includes('faq')) return 'Erläuterungen'
  if (n.includes('angebot')) return 'Angebot'
  if (n.includes('schlussrechnung') || n.includes('rechnung')) return 'Schlussrechnung'
  if (n.includes('vergabe')) return 'Vergabeergebnis'
  return 'Kennwerttabelle'
}
