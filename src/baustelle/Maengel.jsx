import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, Loader, Save, X, AlertTriangle, Camera, MapPin, Clock, Check,
} from 'lucide-react'
import { uid } from '../utils'
import { compressToBase64 } from '../photoUtils'
import PlanPin from '../components/PlanPin'
import {
  maengelLaden, plaeneLaden, planBildUrl, anhangLaden,
  MANGEL_STATUS, MANGEL_PRIO,
} from './api'
import { mangelEinstellen, berichteOffen } from './warteschlange'

// ── Mängel auf der Baustelle ─────────────────────────────────────────────────
//
// Was hier geht: einen Mangel erfassen, fotografieren, auf dem Plan verorten,
// Frist und Zuständigen eintragen, den Zustand setzen. Was nicht geht:
// abnehmen. Behoben meldet die Baustelle, abgenommen erklärt das Büro – und
// nur dort, weil daran Rechtsfolgen hängen (server/maengel.js).
//
// Bei einem fremden Mangel – einem, den das Büro erfasst hat – lassen sich
// Zustand und Fotos ändern, der Rest nicht. Der Server hält diese Grenze; die
// Oberfläche zeigt sie nur.
//
// Gespeichert wird wie beim Tagesbericht immer erst auf dem Gerät.

const heute = () => new Date().toISOString().slice(0, 10)
const formatDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '')

const statusInfo = (v) => MANGEL_STATUS.find(s => s.value === v)
  || { value: v, label: v === 'abgenommen' ? 'Abgenommen' : v, farbe: 'bg-green-100 text-green-700 border-green-300' }

export default function Maengel({ projekt, online, stand: aussen = 0 }) {
  const [maengel,  setMaengel]  = useState([])
  const [wartend,  setWartend]  = useState([])
  const [plaene,   setPlaene]   = useState([])
  const [laedt,    setLaedt]    = useState(true)
  const [fehler,   setFehler]   = useState(null)
  const [form,     setForm]     = useState(null)     // null | 'neu' | Mangel
  // Eigener Zähler plus der der Hülle: die zählt hoch, wenn die Warteschlange
  // durch ist – sonst stünde ein gesendeter Eintrag weiter unter „wartet".
  const [stand,    setStand]    = useState(0)

  const laden = useCallback(async () => {
    setLaedt(true); setFehler(null)
    try {
      const [d, w] = await Promise.all([
        online ? maengelLaden(projekt.id) : Promise.resolve({ maengel: [] }),
        berichteOffen(projekt.id, 'mangel'),
      ])
      setMaengel(d.maengel || [])
      setWartend(w)
    } catch (e) { setFehler(e.message) }
    finally { setLaedt(false) }
  }, [projekt.id, online, stand, aussen])

  useEffect(() => { laden() }, [laden])

  // Pläne nur holen, wenn wirklich verortet werden soll – auf der Baustelle
  // ist jede vermeidbare Abfrage eine gute Abfrage.
  const plaeneHolen = useCallback(async () => {
    if (plaene.length || !online) return
    try { setPlaene((await plaeneLaden(projekt.id)).plaene || []) } catch { /* ohne Plan geht es auch */ }
  }, [plaene.length, online, projekt.id])

  const offen = useMemo(() => maengel.filter(m => m.status === 'offen' || m.status === 'in_arbeit'), [maengel])
  const rest  = useMemo(() => maengel.filter(m => !(m.status === 'offen' || m.status === 'in_arbeit')), [maengel])

  const zustandSetzen = async (m, status) => {
    await mangelEinstellen({
      projectId: projekt.id, mangelId: m.id, version: m.version,
      felder: { status },
    })
    setStand(n => n + 1)
    window.dispatchEvent(new Event('kp-baustelle-senden'))
  }

  if (form) {
    return (
      <MangelForm
        projekt={projekt}
        mangel={form === 'neu' ? null : form}
        plaene={plaene}
        andere={maengel}
        onPlaene={plaeneHolen}
        onFertig={() => { setForm(null); setStand(n => n + 1); window.dispatchEvent(new Event('kp-baustelle-senden')) }}
        onAbbrechen={() => setForm(null)}
      />
    )
  }

  return (
    <div className="space-y-3">
      <button className="btn btn-primary w-full py-3 text-base justify-center" onClick={() => setForm('neu')}>
        <Plus size={18} /> Mangel erfassen
      </button>

      {fehler && <div className="text-sm text-red-700">{fehler}</div>}
      {laedt && <div className="text-sm text-gray-400 flex items-center gap-2"><Loader size={14} className="animate-spin" /> wird geladen…</div>}

      {wartend.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Wartet auf Versand</div>
          {wartend.map(w => (
            <div key={w.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{w.felder?.title || (w.mangelId ? 'Änderung' : 'Neuer Mangel')}</span>
                <span className="badge-yellow flex-shrink-0">wartet</span>
              </div>
              {w.fehler && <div className="text-xs text-red-700 mt-1">{w.fehler}</div>}
            </div>
          ))}
        </div>
      )}

      {!laedt && maengel.length === 0 && wartend.length === 0 && (
        <div className="text-sm text-gray-500">
          {online ? 'Für dieses Projekt sind keine offenen Mängel erfasst.' : 'Ohne Netz werden die Mängel vom Server nicht angezeigt.'}
        </div>
      )}

      {offen.length > 0 && <Liste titel="Offen" eintraege={offen} onZustand={zustandSetzen} onBearbeiten={setForm} projekt={projekt} />}
      {rest.length  > 0 && <Liste titel="Erledigt" eintraege={rest}  onZustand={zustandSetzen} onBearbeiten={setForm} projekt={projekt} />}
    </div>
  )
}

function Liste({ titel, eintraege, onZustand, onBearbeiten, projekt }) {
  const t = heute()
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titel}</div>
      {eintraege.map(m => {
        const st = statusInfo(m.status)
        const ueber = m.dueDate && (m.status === 'offen' || m.status === 'in_arbeit') && m.dueDate < t
        return (
          <div key={m.id} className={`card p-3 text-sm border-l-4 ${ueber ? 'border-l-red-500' : m.status === 'offen' ? 'border-l-amber-400' : 'border-l-gray-300'}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-night min-w-0">
                <span className="text-gray-400 mr-1">Nr. {m.no}</span>{m.title}
              </span>
              <span className={`px-2 py-0.5 border text-xs flex-shrink-0 ${st.farbe}`}>{st.label}</span>
            </div>

            {m.description && <p className="text-gray-600 mt-1 whitespace-pre-line">{m.description}</p>}

            <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {m.location && <span className="flex items-center gap-0.5"><MapPin size={11} /> {m.location}</span>}
              {m.position && <span className="flex items-center gap-0.5 text-brand-600"><MapPin size={11} /> {m.planTitel || 'im Plan'}</span>}
              {m.responsible && <span>{m.responsible}</span>}
              {m.dueDate && (
                <span className={ueber ? 'text-red-600 font-semibold' : ''}>
                  <Clock size={11} className="inline mb-0.5" /> {formatDate(m.dueDate)}{ueber && ' überfällig'}
                </span>
              )}
              {m.fotos.length > 0 && <span className="flex items-center gap-0.5"><Camera size={11} /> {m.fotos.length}</span>}
              {m.statusQuelle === 'massnahme' && <span className="text-gray-400">Zustand aus Maßnahme</span>}
            </div>

            {m.status !== 'abgenommen' && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {MANGEL_STATUS.filter(s => s.value !== m.status).map(s => (
                  <button key={s.value} className="btn btn-secondary px-3 py-1.5 text-xs"
                          onClick={() => onZustand(m, s.value)}>
                    {s.value === 'behoben' ? <Check size={13} /> : null} {s.label}
                  </button>
                ))}
                <button className="btn btn-ghost px-3 py-1.5 text-xs ml-auto" onClick={() => onBearbeiten(m)}>
                  {m.darfVoll ? 'Bearbeiten' : 'Foto zufügen'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Formular ────────────────────────────────────────────────────────────────
function MangelForm({ projekt, mangel, plaene, andere, onPlaene, onFertig, onAbbrechen }) {
  const neu  = !mangel
  const voll = neu || mangel.darfVoll

  const [title,       setTitle]       = useState(mangel?.title || '')
  const [description, setDescription] = useState(mangel?.description || '')
  const [location,    setLocation]    = useState(mangel?.location || '')
  const [responsible, setResponsible] = useState(mangel?.responsible || '')
  const [dueDate,     setDueDate]     = useState(mangel?.dueDate || '')
  const [priority,    setPriority]    = useState(mangel?.priority || 'mittel')
  const [status,      setStatus]      = useState(mangel?.status || 'offen')
  const [ort,         setOrt]         = useState(
    mangel?.position ? { planId: mangel.planId, planSeite: mangel.planSeite || 1,
                         planTitel: mangel.planTitel || '', position: mangel.position } : null)
  const [planOffen,   setPlanOffen]   = useState(false)
  const [fotos,       setFotos]       = useState(() => (mangel?.fotos || []).map(f => ({ ...f, alt: true })))
  const [bild,        setBild]        = useState(false)
  const [speichert,   setSpeichert]   = useState(false)
  const [fehler,      setFehler]      = useState(null)

  // Zuständige aus den bereits erfassten Mängeln vorschlagen. Die Kontakte des
  // Projekts gibt die Fassade bewusst nicht heraus – diese Namen stehen aber
  // ohnehin schon in der Mängelliste.
  const firmen = useMemo(
    () => [...new Set((andere || []).map(m => m.responsible).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')),
    [andere])

  const planAufklappen = async () => {
    await onPlaene()
    setPlanOffen(v => !v)
  }

  const fotosAufnehmen = async (dateien) => {
    setBild(true); setFehler(null)
    try {
      for (const file of dateien) {
        if (!file || !file.type?.startsWith('image/')) continue
        const base64 = await compressToBase64(file)
        setFotos(prev => [...prev, { id: uid(), name: file.name || 'foto.jpg', base64 }])
      }
    } catch (e) { setFehler(`Foto konnte nicht verarbeitet werden: ${e.message}`) }
    finally { setBild(false) }
  }

  const speichern = async () => {
    if (voll && !title.trim()) { setFehler('Bitte einen Kurztext eintragen – was ist zu beanstanden?'); return }
    setSpeichert(true); setFehler(null)
    try {
      const felder = voll
        ? {
            title: title.trim(), description, location, responsible, dueDate, priority, status,
            planId:    ort?.planId    || null,
            planSeite: ort?.planSeite || null,
            position:  ort?.position  || null,
          }
        : { status }
      await mangelEinstellen({
        projectId: projekt.id,
        mangelId: mangel?.id || null,
        version: mangel?.version ?? null,
        felder,
        fotos: fotos.map(f => ({ id: f.id, name: f.name, base64: f.base64 })),
      })
      onFertig()
    } catch (e) {
      setFehler(`Konnte nicht gespeichert werden: ${e.message}`)
      setSpeichert(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-night">
          {neu ? 'Mangel erfassen' : `Mangel Nr. ${mangel.no}`}
        </h2>
        <button className="btn btn-ghost px-3 py-2" onClick={onAbbrechen}><X size={18} /></button>
      </div>

      {!voll && (
        <div className="card p-3 text-xs text-gray-600 bg-concrete">
          Dieser Mangel wurde von {mangel.von || 'jemand anderem'} erfasst. Zustand und Fotos lassen sich
          hier ändern, der Text gehört dem Büro.
        </div>
      )}

      {voll && (
        <>
          <section className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Was ist zu beanstanden *</label>
            <input className="input py-3 text-base" value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="z. B. Risse in der Bodenplatte" />
          </section>

          <section className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Beschreibung</label>
            <textarea className="textarea py-3 text-base" rows={3} value={description}
                      onChange={e => setDescription(e.target.value)} />
          </section>

          <section className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Wo</label>
            <input className="input py-3 text-base" value={location} onChange={e => setLocation(e.target.value)}
                   placeholder="z. B. EG, Achse C/4" />
          </section>
        </>
      )}

      {/* Fotos – auch bei fremden Mängeln */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fotos</label>
        <label className="btn btn-primary w-full py-3 text-base justify-center cursor-pointer">
          {bild ? <Loader size={18} className="animate-spin" /> : <Camera size={18} />}
          {bild ? 'wird verarbeitet…' : 'Foto aufnehmen oder wählen'}
          <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                 onChange={e => { fotosAufnehmen(Array.from(e.target.files || [])); e.target.value = '' }} />
        </label>
        {fotos.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {fotos.map((f, i) => (
              <div key={f.id} className="relative">
                <Miniatur foto={f} projektId={projekt.id} />
                {!f.alt && (
                  <button className="absolute top-0 right-0 bg-black/60 text-white p-1"
                          onClick={() => setFotos(rows => rows.filter((_, k) => k !== i))}>
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {voll && (
        <>
          {/* Auf dem Plan */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stelle im Plan</label>
              <button className="btn btn-secondary px-3 py-1.5 text-xs" onClick={planAufklappen}>
                <MapPin size={13} /> {planOffen ? 'zuklappen' : (ort ? 'Pin ändern' : 'Verorten')}
              </button>
            </div>
            {!planOffen && ort && (
              <p className="text-xs text-gray-500">
                {ort.planTitel || 'Plan'}{ort.planSeite > 1 ? `, Seite ${ort.planSeite}` : ''} – verortet
              </p>
            )}
            {planOffen && (
              <PlanPin
                projectId={projekt.id} plaene={plaene} wert={ort} andere={andere}
                onChange={setOrt} hoehe="h-[45vh]"
                bildUrl={(plan, seite) => planBildUrl(projekt.id, plan.id, seite)} />
            )}
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Frist</label>
              <input type="date" className="input py-3 text-base" value={dueDate}
                     onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dringlichkeit</label>
              <select className="select py-3 text-base" value={priority} onChange={e => setPriority(e.target.value)}>
                {MANGEL_PRIO.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </section>

          <section className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Verantwortliche Firma</label>
            <input className="input py-3 text-base" value={responsible} list="kp-firmen"
                   onChange={e => setResponsible(e.target.value)} placeholder="z. B. Rohbau GmbH" />
            <datalist id="kp-firmen">
              {firmen.map(f => <option key={f} value={f} />)}
            </datalist>
          </section>
        </>
      )}

      <section className="space-y-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zustand</label>
        <select className="select py-3 text-base" value={status} onChange={e => setStatus(e.target.value)}>
          {MANGEL_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <p className="text-xs text-gray-500">
          Die Abnahme erklärt das Büro – deshalb steht „abgenommen" hier nicht zur Wahl.
        </p>
      </section>

      {fehler && (
        <div className="card p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {fehler}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white border-t border-concrete flex gap-2">
        <button className="btn btn-primary flex-1 py-3 text-base justify-center" disabled={speichert || bild} onClick={speichern}>
          {speichert ? <Loader size={18} className="animate-spin" /> : <Save size={18} />} Speichern
        </button>
        <button className="btn btn-secondary py-3 px-4" onClick={onAbbrechen}>Abbrechen</button>
      </div>
    </div>
  )
}

function Miniatur({ foto, projektId }) {
  const [url, setUrl] = useState(foto.base64 ? `data:image/jpeg;base64,${foto.base64}` : null)
  useEffect(() => {
    if (url || !foto.alt) return
    let weg = false
    anhangLaden(projektId, foto.id).then(u => { if (!weg) setUrl(u) })
    return () => { weg = true }
  }, [url, foto.alt, foto.id, projektId])
  return (
    <div className="w-16 h-16 bg-concrete flex items-center justify-center overflow-hidden">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" />
           : <Camera size={16} className="text-gray-400" />}
    </div>
  )
}
