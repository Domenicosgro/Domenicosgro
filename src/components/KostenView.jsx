import React, { useState, useMemo } from 'react'
import {
  ArrowLeft, Plus, Trash2, Calculator, Loader, AlertCircle, Printer,
  FileSpreadsheet, Copy, Check, X, Layers, Save,
} from 'lucide-react'
import { useKosten, useKostenDraft } from '../hooks/useKosten'
import { calcEstimate, buildLookup, fmtEur, fmtNum, maturity } from '../kosten/calc'
import { TEMPLATES, buildFromTemplate } from '../kosten/templates'
import { STUFEN, stufeLabel, docStatusBadge } from '../kosten/model'
import { TIEFENPROFILE, tiefeFromProfil } from '../kosten/tiefe'
import { uid, formatDate } from '../utils'
import UebersichtTab from './kosten/UebersichtTab'
import PositionenTab from './kosten/PositionenTab'
import ParameterTab  from './kosten/ParameterTab'
import VariantenTab  from './kosten/VariantenTab'
import AnnahmenTab   from './kosten/AnnahmenTab'
import QuellenTab    from './kosten/QuellenTab'
import KopfdatenTab  from './kosten/KopfdatenTab'
import DatenquellenTab from './kosten/DatenquellenTab'

const TABS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'positionen', label: 'Positionen' },
  { id: 'parameter',  label: 'Parameter' },
  { id: 'varianten',  label: 'Varianten' },
  { id: 'datenquellen', label: 'Datenquellen' },
  { id: 'annahmen',   label: 'Annahmen & Planerstand' },
  { id: 'quellen',    label: 'Quellen' },
  { id: 'kopfdaten',  label: 'Kopfdaten' },
]

export default function KostenView({ project, serverUser, onBack, readOnly = false }) {
  const { estimates, loaded, saving, error, setError, create, save, remove } = useKosten(project?.id)
  const [openId,   setOpenId]   = useState(null)
  const [showNew,  setShowNew]  = useState(false)

  const current = estimates.find(e => e.id === openId) ?? null

  if (!loaded) {
    return (
      <div className="app-page">
        <Header project={project} onBack={onBack} />
        <div className="card p-10 flex items-center justify-center text-gray-400 gap-2">
          <Loader size={16} className="animate-spin" /> Kostenermittlungen werden geladen …
        </div>
      </div>
    )
  }

  if (current) {
    return (
      <Editor
        key={current.id}
        estimate={current}
        project={project}
        serverUser={serverUser}
        saving={saving}
        error={error}
        readOnly={readOnly}
        onSave={save}
        onBack={() => setOpenId(null)}
      />
    )
  }

  return (
    <div className="app-page">
      <Header project={project} onBack={onBack}>
        {!readOnly && (
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={16} /> Neue Kostenermittlung
          </button>
        )}
      </Header>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
          <button className="ml-auto text-red-500 hover:text-red-700" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      {estimates.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <Calculator size={30} className="mx-auto text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-700">Noch keine Kostenermittlung für dieses Projekt</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xl mx-auto leading-relaxed">
              Eine Kostenermittlung führt Mengen, Kennwerte, Varianten und Annahmen nach DIN 276 zusammen.
              Starten Sie mit einer leeren Struktur oder mit einer vorbelegten Vorlage.
            </p>
          </div>
          {!readOnly && <button className="btn-primary mx-auto" onClick={() => setShowNew(true)}><Plus size={16} /> Kostenermittlung anlegen</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {estimates.map(e => (
            <EstimateCard
              key={e.id}
              estimate={e}
              readOnly={readOnly}
              onOpen={() => setOpenId(e.id)}
              onDuplicate={async () => {
                const copy = { ...structuredClone(e), id: uid(), name: `${e.name} (Kopie)`, status: 'entwurf', createdAt: new Date().toISOString() }
                delete copy._version; delete copy._updatedAt
                const saved = await create(copy)
                setOpenId(saved.id)
              }}
              onDelete={() => window.confirm(`„${e.name}“ endgültig löschen?`) && remove(e.id)}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewEstimateModal
          project={project}
          onClose={() => setShowNew(false)}
          onCreate={async (templateId, name, profilId) => {
            const est = buildFromTemplate(templateId, project.id, project.name)
            if (name) est.name = name
            if (profilId) {
              est.tiefe = tiefeFromProfil(profilId)
              const p = TIEFENPROFILE.find(x => x.id === profilId)
              if (p) est.stufe = p.stufe
            }
            const saved = await create(est)
            setShowNew(false)
            setOpenId(saved.id)
          }}
        />
      )}
    </div>
  )
}

// ── Kopfzeile ────────────────────────────────────────────────────────────────

function Header({ project, onBack, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
      <div className="flex items-end gap-3">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Projekt</button>
        <div>
          <h1 className="text-2xl font-bold text-night">Kostenermittlung</h1>
          <p className="text-sm text-gray-500 mt-0.5">{project?.name || 'Projekt'} · DIN 276</p>
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// ── Kachel einer Kostenermittlung ────────────────────────────────────────────

function EstimateCard({ estimate, onOpen, onDuplicate, onDelete, readOnly }) {
  const result = useMemo(() => calcEstimate(estimate), [estimate])
  const reife  = useMemo(() => maturity(estimate), [estimate])
  const badge  = docStatusBadge(estimate.status)
  const first  = result.vkeys[0]

  return (
    <div className="card p-4 flex flex-col gap-2 hover:border-brand-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <button className="text-left flex-1 min-w-0" onClick={onOpen}>
          <h3 className="font-semibold text-sm text-night truncate hover:text-brand-700">{estimate.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {stufeLabel(estimate.stufe)}
            {estimate.kostenstand && ` · Kostenstand ${estimate.kostenstand}`}
          </p>
        </button>
        <span className={`${badge.badge} flex-shrink-0`}>{badge.label}</span>
      </div>

      <button className="text-left" onClick={onOpen}>
        <div className="text-xl font-bold text-night tabular-nums">{fmtEur(result.totals.byVariant[first]?.sumNet)}</div>
        <div className="text-xs text-gray-400">
          netto · {result.vkeys.length} Variante{result.vkeys.length !== 1 ? 'n' : ''}
          {result.totals.sumRow.spread ? ` · Spreizung ${fmtEur(result.totals.sumRow.spread)}` : ''}
        </div>
      </button>

      <div className="flex items-center gap-2 text-xs text-gray-500 mt-auto pt-2 border-t border-concrete">
        <span>{reife.total} Positionen</span>
        {reife.open > 0 && <span className="badge-yellow">{reife.open} offen</span>}
        {result.errors.length > 0 && <span className="badge-red">{result.errors.length} Rechenhinweise</span>}
        <span className="ml-auto text-gray-300">{estimate.updatedAt ? formatDate(estimate.updatedAt.slice(0, 10)) : ''}</span>
        {!readOnly && <>
          <button className="text-gray-300 hover:text-brand-600" title="Duplizieren" onClick={onDuplicate}><Copy size={13} /></button>
          <button className="text-gray-300 hover:text-red-600" title="Löschen" onClick={onDelete}><Trash2 size={13} /></button>
        </>}
      </div>
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

function Editor({ estimate, project, serverUser, saving, error, readOnly, onSave, onBack }) {
  const [tab, setTab] = useState('uebersicht')
  const { draft, dirty, mutate, patch, flush } = useKostenDraft(estimate, onSave)

  const result = useMemo(() => (draft ? calcEstimate(draft) : null), [draft])
  const lookup = useMemo(() => (draft ? buildLookup(draft) : () => undefined), [draft])

  if (!draft || !result) return null

  const guard = (fn) => (readOnly ? () => {} : fn)
  const badge = docStatusBadge(draft.status)

  return (
    <div className="app-page">

      {/* Kopfzeile */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div className="flex items-end gap-3 min-w-0">
          <button className="btn-secondary flex-shrink-0" onClick={() => { flush(); onBack() }}>
            <ArrowLeft size={16} /> Alle Ermittlungen
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-night flex items-center gap-2 flex-wrap">
              <span className="truncate">{draft.name}</span>
              <span className={badge.badge}>{badge.label}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {project?.name} · {stufeLabel(draft.stufe)}
              {draft.kostenstand && ` · Kostenstand ${draft.kostenstand}`}
              {' · '}Regionalfaktor {fmtNum(result.factors.rf)} · Preisindex {fmtNum(result.factors.pi)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            {saving ? <><Loader size={12} className="animate-spin" /> speichert …</>
             : dirty ? <><Save size={12} /> ungespeicherte Änderungen</>
             : <><Check size={12} className="text-green-600" /> gespeichert</>}
          </span>
          <button className="btn-secondary" onClick={() => { flush(); window.print() }} title="Aktuelle Ansicht drucken">
            <Printer size={16} /> Drucken
          </button>
          <button className="btn-secondary" onClick={() => exportCsv(draft, result)} title="Übersicht als CSV für Excel">
            <FileSpreadsheet size={16} /> CSV
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-1.5 no-print">
          <AlertCircle size={13} /> {error}
        </p>
      )}
      {readOnly && (
        <p className="text-xs text-gray-600 bg-concrete px-3 py-2 no-print">
          Nur-Lese-Zugriff: Änderungen an dieser Kostenermittlung sind Projekt- und Systemadministratoren vorbehalten.
        </p>
      )}

      {/* Reiter */}
      <div className="flex flex-wrap gap-px no-print border-b border-concrete">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-brand-600'}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'uebersicht' && <UebersichtTab draft={draft} result={result} lookup={lookup} />}
      {tab === 'positionen' && <PositionenTab draft={draft} result={result} mutate={guard(mutate)} lookup={lookup} />}
      {tab === 'parameter'  && <ParameterTab  draft={draft} mutate={guard(mutate)} lookup={lookup} />}
      {tab === 'varianten'  && <VariantenTab  draft={draft} result={result} mutate={guard(mutate)} />}
      {tab === 'datenquellen' && (
        <DatenquellenTab draft={draft} result={result} mutate={guard(mutate)} readOnly={readOnly} serverUser={serverUser} />
      )}
      {tab === 'annahmen'   && <AnnahmenTab   draft={draft} mutate={guard(mutate)} />}
      {tab === 'quellen'    && <QuellenTab    draft={draft} mutate={guard(mutate)} />}
      {tab === 'kopfdaten'  && <KopfdatenTab  draft={draft} patch={guard(patch)} mutate={guard(mutate)} lookup={lookup} result={result} />}
    </div>
  )
}

// ── Neue Kostenermittlung ────────────────────────────────────────────────────

function NewEstimateModal({ project, onClose, onCreate }) {
  const [templateId, setTemplateId] = useState('leer')
  const [profilId,   setProfilId]   = useState('kostenschaetzung')
  const [name,       setName]       = useState('Kostenschätzung Vorplanung')
  const [busy,       setBusy]       = useState(false)

  const profil = TIEFENPROFILE.find(p => p.id === profilId)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-concrete w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-concrete flex items-center justify-between">
          <h2 className="font-semibold text-night">Neue Kostenermittlung · {project?.name}</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Bezeichnung</span>
            <input className="input mt-0.5" value={name} onChange={e => setName(e.target.value)} />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Stufe und Kostentiefe</span>
            <select
              className="select mt-0.5"
              value={profilId}
              onChange={e => {
                setProfilId(e.target.value)
                const p = TIEFENPROFILE.find(x => x.id === e.target.value)
                // Bezeichnung mitziehen, solange sie noch einem Profilnamen entspricht
                if (p && TIEFENPROFILE.some(x => name.startsWith(x.name))) setName(p.name)
              }}
            >
              {TIEFENPROFILE.map(p => <option key={p.id} value={p.id}>{p.name} · {p.lph}</option>)}
            </select>
            {profil && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{profil.hint}</p>}
          </label>

          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-600">Vorlage</span>
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                className={`w-full text-left card p-3 border-l-4 transition-colors ${
                  templateId === t.id ? 'border-l-brand-600 bg-sky/10 border-brand-300' : 'border-l-transparent hover:border-brand-200'}`}
                onClick={() => setTemplateId(t.id)}
              >
                <div className="flex items-center gap-2">
                  <Layers size={15} className="text-brand-600 flex-shrink-0" />
                  <span className="font-medium text-sm text-night">{t.name}</span>
                  {templateId === t.id && <Check size={14} className="text-brand-600 ml-auto" />}
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.description}</p>
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-amber-300 pl-3">
            Vorlagenwerte sind Startwerte aus einem konkreten Projekt. Alle Parameter, Mengen und Kennwerte müssen für
            dieses Projekt geprüft und ersetzt werden – insbesondere Bezugsflächen, Regionalfaktor und Kostenstand.
          </p>
        </div>

        <div className="px-4 py-3 border-t border-concrete flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={busy}
                  onClick={async () => { setBusy(true); try { await onCreate(templateId, name, profilId) } finally { setBusy(false) } }}>
            {busy ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} Anlegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CSV-Export der Übersicht ─────────────────────────────────────────────────
// Semikolon-getrennt mit UTF-8-BOM, damit Excel deutsche Umlaute korrekt öffnet.

function exportCsv(draft, result) {
  const { vkeys, totals } = result
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const num = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : '')

  const lines = [
    [esc(draft.name), esc(draft.projectName ?? ''), esc(`Kostenstand ${draft.kostenstand ?? ''}`)].join(';'),
    [esc('Regionalfaktor'), num(result.factors.rf), esc('Preisindex'), num(result.factors.pi), esc('USt'), num(result.factors.ust)].join(';'),
    '',
    ['Kostengruppe', 'Bezeichnung', ...vkeys, 'Minimum', 'Maximum', 'Spreizung'].map(esc).join(';'),
  ]

  for (const row of totals.kg1Rows) {
    lines.push([esc(`KG ${row.kg}`), esc(row.label), ...vkeys.map(v => num(row.values[v])), num(row.min), num(row.max), num(row.spread)].join(';'))
    for (const c of totals.kg2Rows.filter(x => x.kg1 === row.kg)) {
      lines.push([esc(`  KG ${c.kg}`), esc(c.label), ...vkeys.map(v => num(c.values[v])), num(c.min), num(c.max), num(c.spread)].join(';'))
    }
  }
  lines.push([esc('Summe netto'), '', ...vkeys.map(v => num(totals.sumRow.values[v])), num(totals.sumRow.min), num(totals.sumRow.max), num(totals.sumRow.spread)].join(';'))
  lines.push([esc('Summe brutto'), '', ...vkeys.map(v => num(totals.byVariant[v]?.sumGross))].join(';'))
  lines.push([esc(`Kennzahl netto je ${draft.bezugKennzahlUnit ?? ''}`), '', ...vkeys.map(v => num(totals.byVariant[v]?.kennzahl))].join(';'))

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${(draft.name || 'Kostenermittlung').replace(/[^\wÄÖÜäöüß -]/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
