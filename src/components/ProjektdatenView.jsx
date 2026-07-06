import React, { useState, useMemo } from 'react'
import { ArrowLeft, Save, Check, AlertCircle, X, Database, UserPlus, Trash2, Handshake } from 'lucide-react'
import { uid } from '../utils'

export const LPH = [
  { nr: 1, label: 'Grundlagenermittlung' },
  { nr: 2, label: 'Vorplanung' },
  { nr: 3, label: 'Entwurfsplanung' },
  { nr: 4, label: 'Genehmigungsplanung' },
  { nr: 5, label: 'Ausführungsplanung' },
  { nr: 6, label: 'Vorbereitung der Vergabe' },
  { nr: 7, label: 'Mitwirkung bei der Vergabe' },
  { nr: 8, label: 'Objektüberwachung' },
  { nr: 9, label: 'Objektbetreuung' },
]
export const VERTRAG_TYPES = [
  'Direktauftrag Auftraggeber', 'Generalplanervertrag', 'Subplanervertrag',
  'ARGE', 'Rahmenvertrag', 'Sonstiges',
]
export const DISZIPLINEN = [
  'Tragwerksplanung', 'TGA – HLS', 'TGA – Elektro', 'Brandschutz',
  'Bauphysik / Akustik', 'Freianlagen', 'Vermessung', 'Baugrund', 'Sonstige',
]

export const validNummer  = (v) => /^\d{3,4}$/.test(v)
export const validKuerzel = (v) => /^[A-Za-zÄÖÜäöüß]{3,4}$/.test(v)
export const composeName  = (nummer, kuerzel, bezeichnung) =>
  [nummer, kuerzel, bezeichnung].filter(Boolean).join(' ').trim()

const emptyData = () => ({
  nummer: '', kuerzel: '', kuerzelAusnahme: false, bezeichnung: '',
  vertrag: VERTRAG_TYPES[0], vertragNotiz: '',
  lph: {},                      // { 1: { beauftragt: true, pauschale: '' }, … }
  pauschalGesamt: '',
  isGeneralplanung: false,
  planungspartner: [],          // [{ id, name, company, email, disziplin }]
})

export default function ProjektdatenView({ project, allContacts = [], onUpdateProject, onBack }) {
  const [data,  setData]  = useState({ ...emptyData(), ...(project.projectData || {}) })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [partnerPick, setPartnerPick] = useState('')
  const [partnerDisziplin, setPartnerDisziplin] = useState(DISZIPLINEN[0])

  const set = (patch) => { setData(d => ({ ...d, ...patch })); setSaved(false) }
  const setLph = (nr, patch) =>
    set({ lph: { ...data.lph, [nr]: { ...(data.lph[nr] || {}), ...patch } } })

  const nummerOk  = !data.nummer  || validNummer(data.nummer)
  const kuerzelOk = !data.kuerzel || data.kuerzelAusnahme || validKuerzel(data.kuerzel)
  const codedName = composeName(data.nummer, data.kuerzel, data.bezeichnung)

  const partnerCandidates = useMemo(() => {
    const used = new Set(data.planungspartner.map(p => `${p.name}|${p.company}`))
    return allContacts.filter(c => c.name && !used.has(`${c.name}|${c.company || ''}`))
  }, [allContacts, data.planungspartner])

  const addPartner = () => {
    const c = partnerCandidates.find(x => (x.id || x.name) === partnerPick)
    if (!c) return
    set({ planungspartner: [...data.planungspartner, {
      id: uid(), name: c.name, company: c.company || '', email: c.email || '', disziplin: partnerDisziplin,
    }] })
    setPartnerPick('')
  }

  const save = () => {
    if (!nummerOk || !kuerzelOk) { setError('Codierung prüfen: 3–4 Ziffern und 3–4 Buchstaben (oder Ausnahme aktivieren).'); return }
    setError(null)
    const patch = { projectData: data }
    if (codedName) patch.name = codedName
    onUpdateProject(project.id, patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="app-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Dashboard</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <Database size={22} className="text-brand-600" /> Projektdatenbank
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{project.name || 'Unbenanntes Projekt'}</p>
          </div>
        </div>
        <button className="btn-primary" onClick={save}>
          {saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'Gespeichert' : 'Speichern'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      {/* Projektcodierung */}
      <div className="card p-5 space-y-3">
        <h2 className="section-title">Projektcodierung</h2>
        <p className="text-xs text-gray-400 -mt-1">Schema: 3–4 Ziffern · 3–4 Buchstaben · Projektbezeichnung</p>
        <div className="grid grid-cols-2 sm:grid-cols-[110px_130px_1fr] gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nummer</label>
            <input className={`input font-mono ${!nummerOk ? 'border-red-400' : ''}`} placeholder="1234"
              maxLength={4} value={data.nummer}
              onChange={e => set({ nummer: e.target.value.replace(/\D/g, '') })} />
            {!nummerOk && <p className="text-[11px] text-red-500 mt-0.5">3–4 Ziffern</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Kürzel
              <label className="ml-2 font-normal text-gray-400 cursor-pointer">
                <input type="checkbox" className="mr-1 align-middle" checked={data.kuerzelAusnahme}
                  onChange={e => set({ kuerzelAusnahme: e.target.checked })} />Ausnahme
              </label>
            </label>
            <input className={`input font-mono uppercase ${!kuerzelOk ? 'border-red-400' : ''}`} placeholder="MUST"
              maxLength={data.kuerzelAusnahme ? 12 : 4} value={data.kuerzel}
              onChange={e => set({ kuerzel: data.kuerzelAusnahme ? e.target.value : e.target.value.replace(/[^A-Za-zÄÖÜäöüß]/g, '').toUpperCase() })} />
            {!kuerzelOk && <p className="text-[11px] text-red-500 mt-0.5">3–4 Buchstaben (oder Ausnahme)</p>}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Projektbezeichnung</label>
            <input className="input" placeholder="z. B. Neubau Produktionshalle Musterstadt"
              value={data.bezeichnung} onChange={e => set({ bezeichnung: e.target.value })} />
          </div>
        </div>
        {codedName && (
          <p className="text-sm text-gray-600">
            Projektname: <strong className="text-night">{codedName}</strong>
            <span className="text-xs text-gray-400 ml-2">(wird beim Speichern übernommen)</span>
          </p>
        )}
      </div>

      {/* Vertragsverhältnis + Gesellschaft */}
      <div className="card p-5 space-y-3">
        <h2 className="section-title"><Handshake size={16} /> Vertragsverhältnis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_160px] gap-3">
          <select className="select" value={data.vertrag} onChange={e => set({ vertrag: e.target.value })}>
            {VERTRAG_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className="input" placeholder="Ergänzung (z. B. Vertragspartner, AZ, Datum)"
            value={data.vertragNotiz} onChange={e => set({ vertragNotiz: e.target.value })} />
          <div>
            <select className="select w-full" value={data.gesellschaft || ''}
              onChange={e => set({ gesellschaft: e.target.value })} title="Ausführende Gesellschaft">
              <option value="">Gesellschaft…</option>
              <option value="GmbH">GmbH</option>
              <option value="PartGmbB">PartGmbB</option>
            </select>
          </div>
        </div>
      </div>

      {/* Beauftragte Leistungsphasen / Pauschalwerte */}
      <div className="card p-5 space-y-3">
        <h2 className="section-title">Beauftragte Leistungsphasen (HOAI) / Pauschalwerte</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1.5">
          {LPH.map(p => {
            const entry = data.lph[p.nr] || {}
            return (
              <div key={p.nr} className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" checked={!!entry.beauftragt}
                    onChange={e => setLph(p.nr, { beauftragt: e.target.checked })} />
                  <span className="truncate"><span className="text-gray-400">LPH {p.nr}</span> {p.label}</span>
                </label>
                {entry.beauftragt && (
                  <input className="input py-0.5 text-xs w-24 text-right" placeholder="Pauschale €"
                    value={entry.pauschale || ''}
                    onChange={e => setLph(p.nr, { pauschale: e.target.value })} />
                )}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <label className="text-xs font-medium text-gray-500">Gesamtpauschale (optional)</label>
          <input className="input py-1 text-sm w-40 text-right" placeholder="z. B. 250.000 €"
            value={data.pauschalGesamt} onChange={e => set({ pauschalGesamt: e.target.value })} />
        </div>
      </div>

      {/* Generalplanung + Planungspartner */}
      <div className="card p-5 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={data.isGeneralplanung}
            onChange={e => set({ isGeneralplanung: e.target.checked })} />
          <span className="section-title !mb-0">Generalplanung</span>
        </label>

        {data.isGeneralplanung && (
          <>
            <p className="text-xs text-gray-400">Planungspartner aus der Kontaktdatenbank zuordnen (Fachplaner unter Generalplanervertrag).</p>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Kontakt</label>
                <select className="select w-full" value={partnerPick} onChange={e => setPartnerPick(e.target.value)}>
                  <option value="">– aus Kontaktdatenbank wählen –</option>
                  {partnerCandidates.map(c => (
                    <option key={c.id || c.name} value={c.id || c.name}>
                      {c.name}{c.company ? ` (${c.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fachdisziplin</label>
                <select className="select" value={partnerDisziplin} onChange={e => setPartnerDisziplin(e.target.value)}>
                  {DISZIPLINEN.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button className="btn-primary" disabled={!partnerPick} onClick={addPartner}>
                <UserPlus size={14} /> Hinzufügen
              </button>
            </div>

            {data.planungspartner.length > 0 && (
              <div className="border border-gray-100 divide-y divide-gray-50">
                {data.planungspartner.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}{p.company ? ` (${p.company})` : ''}</p>
                      {p.email && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
                    </div>
                    <select className="select text-xs py-1" value={p.disziplin}
                      onChange={e => set({ planungspartner: data.planungspartner.map(x => x.id === p.id ? { ...x, disziplin: e.target.value } : x) })}>
                      {DISZIPLINEN.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600"
                      onClick={() => set({ planungspartner: data.planungspartner.filter(x => x.id !== p.id) })}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
