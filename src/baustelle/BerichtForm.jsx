import React, { useCallback, useEffect, useState } from 'react'
import {
  Camera, Trash2, Plus, Loader, CloudSun, Save, X, AlertTriangle, Check,
} from 'lucide-react'
import { uid } from '../utils'
import { compressToBase64 } from '../photoUtils'
import { WETTER, wetterHolen, anhangLaden } from './api'
import { berichtEinstellen } from './warteschlange'

// ── Tagesbericht auf dem Handy ───────────────────────────────────────────────
// Fließtext statt Rechteditor: der Editor des Protokolltools zieht Tiptap mit,
// und auf der Baustelle tippt niemand Listen und Hervorhebungen. Die Fassade
// macht daraus dieselben Absätze, die das Büro ablegt (server/baustelle.js).
//
// Gespeichert wird immer in die Warteschlange, nie direkt zum Server. Das ist
// derselbe Weg mit und ohne Netz – ein Weg, der auf der Baustelle hält.

const heute = () => new Date().toISOString().slice(0, 10)

export default function BerichtForm({ projekt, bericht, onFertig, onAbbrechen }) {
  const neu = !bericht

  const [date,    setDate]    = useState(bericht?.date || heute())
  const [daytime, setDaytime] = useState(bericht?.daytime || (new Date().getHours() < 12 ? 'vormittag' : 'nachmittag'))
  const [weather, setWeather] = useState(bericht?.weather || 'sonnig')
  const [tempMin, setTempMin] = useState(bericht?.tempMin ?? '')
  const [tempMax, setTempMax] = useState(bericht?.tempMax ?? '')
  const [wxDate,  setWxDate]  = useState(bericht?.weatherDate || '')
  const [wxOrt,   setWxOrt]   = useState(bericht?.weatherLocation || '')
  const [progress, setProgress] = useState(bericht?.progress ?? '')
  const [firmen,  setFirmen]  = useState(() => (bericht?.firmen?.length ? bericht.firmen : []))
  const [arbeiten, setArbeiten] = useState(() => (bericht?.arbeiten?.length ? bericht.arbeiten : ['']))
  const [bemerkung,  setBemerkung]  = useState(bericht?.bemerkung || '')
  const [besonderes, setBesonderes] = useState(bericht?.besonderes || '')
  const [fotos,   setFotos]   = useState(() => (bericht?.fotos || []).map(f => ({ ...f, alt: true })))
  const [bild,    setBild]    = useState(false)      // Foto wird verarbeitet
  const [speichert, setSpeichert] = useState(false)
  const [wxBusy,  setWxBusy]  = useState(false)
  const [wxFehler, setWxFehler] = useState(null)
  const [fehler,  setFehler]  = useState(null)

  // ── Wetter vom Projektstandort ─────────────────────────────────────────────
  const wetter = useCallback(async () => {
    setWxBusy(true); setWxFehler(null)
    try {
      const d = await wetterHolen(projekt.id, date, daytime)
      setWeather(d.weather); setTempMin(d.tempMin ?? ''); setTempMax(d.tempMax ?? '')
      setWxDate(d.date || date); setWxOrt(d.location || '')
    } catch (e) { setWxFehler(e.message) }
    finally { setWxBusy(false) }
  }, [projekt.id, date, daytime])

  // Beim Anlegen einmal automatisch – unterwegs soll niemand das Wetter von
  // Hand nachtragen. Ohne Netz oder ohne Ort im Projekt bleibt die Auswahl.
  useEffect(() => {
    if (!neu) return
    if (!navigator.onLine) return
    wetter()
    // Absicht: nur beim Öffnen, nicht bei jeder Änderung von Datum/Tageshälfte.
    // Dafür gibt es die Schaltfläche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fotos ──────────────────────────────────────────────────────────────────
  const fotosAufnehmen = async (dateien) => {
    setBild(true); setFehler(null)
    try {
      for (const file of dateien) {
        if (!file || !file.type?.startsWith('image/')) continue
        // Kleine Fassung für den Bericht, Rohdaten für den Projektordner.
        const base64 = await compressToBase64(file)
        let bytes = null
        try { bytes = await file.arrayBuffer() } catch {}
        setFotos(prev => [...prev, {
          id: uid(), name: file.name || 'foto.jpg', caption: '',
          base64, bytes, typ: file.type || 'image/jpeg',
        }])
      }
    } catch (e) {
      setFehler(`Foto konnte nicht verarbeitet werden: ${e.message}`)
    } finally { setBild(false) }
  }

  const speichern = async () => {
    setSpeichert(true); setFehler(null)
    try {
      await berichtEinstellen({
        projectId: projekt.id,
        entryId: bericht?.id || null,
        version: bericht?.version ?? null,
        felder: {
          date, daytime, weather,
          tempMin, tempMax,
          weatherDate: wxDate, weatherLocation: wxOrt,
          progress,
          firmen: firmen.filter(f => (f.company || '').trim()),
          arbeiten: arbeiten.map(a => a.trim()).filter(Boolean),
          bemerkung, besonderes,
        },
        fotos: fotos.map(f => ({
          id: f.id, name: f.name, caption: f.caption || '',
          base64: f.base64, bytes: f.bytes, typ: f.typ,
        })),
      })
      onFertig()
    } catch (e) {
      setFehler(`Konnte nicht gespeichert werden: ${e.message}`)
      setSpeichert(false)
    }
  }

  const setFirma = (i, patch) => setFirmen(rows => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-night leading-tight">
          {neu ? 'Neuer Tagesbericht' : 'Bericht bearbeiten'}
        </h1>
        <button className="btn btn-ghost px-3 py-2" onClick={onAbbrechen} title="Abbrechen">
          <X size={18} />
        </button>
      </div>
      <div className="text-xs text-gray-500 -mt-3">{projekt.name}</div>

      {/* ── Tag ─────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tag</label>
        <input type="date" className="input py-3 text-base" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          {['vormittag', 'nachmittag'].map(h => (
            <button
              key={h}
              className={`btn py-3 justify-center ${daytime === h ? 'bg-brand-600 text-light' : 'bg-white border border-concrete text-brand-600'}`}
              onClick={() => setDaytime(h)}
            >
              {h === 'vormittag' ? 'Vormittag' : 'Nachmittag'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Wetter ──────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Wetter</label>
          <button className="btn btn-secondary px-3 py-1.5" onClick={wetter} disabled={wxBusy}>
            {wxBusy ? <Loader size={14} className="animate-spin" /> : <CloudSun size={14} />} Holen
          </button>
        </div>
        <select className="select py-3 text-base" value={weather} onChange={(e) => setWeather(e.target.value)}>
          {WETTER.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" inputMode="numeric" className="input py-3 text-base" placeholder="min °C"
                 value={tempMin} onChange={(e) => setTempMin(e.target.value)} />
          <input type="number" inputMode="numeric" className="input py-3 text-base" placeholder="max °C"
                 value={tempMax} onChange={(e) => setTempMax(e.target.value)} />
        </div>
        {wxFehler && <div className="text-xs text-amber-700">{wxFehler}</div>}
        {!wxFehler && wxDate && wxDate !== date && (
          <div className="text-xs text-amber-700">Werte vom {wxDate} – für den {date} erneut holen.</div>
        )}
        {!wxFehler && wxOrt && wxDate === date && (
          <div className="text-xs text-gray-500">gemessen in {wxOrt}</div>
        )}
      </section>

      {/* ── Fotos ───────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fotos</label>

        <label className="btn btn-primary w-full py-3 text-base justify-center cursor-pointer">
          {bild ? <Loader size={18} className="animate-spin" /> : <Camera size={18} />}
          {bild ? 'wird verarbeitet…' : 'Foto aufnehmen oder wählen'}
          <input
            type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={(e) => { fotosAufnehmen(Array.from(e.target.files || [])); e.target.value = '' }}
          />
        </label>

        {fotos.length > 0 && (
          <ul className="space-y-2">
            {fotos.map((f, i) => (
              <li key={f.id} className="card p-2 flex gap-2">
                <Miniatur foto={f} projektId={projekt.id} />
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    className="input py-2 text-base"
                    placeholder={`Bildunterschrift Foto ${i + 1}`}
                    value={f.caption || ''}
                    onChange={(e) => setFotos(rows => rows.map((r, k) => (k === i ? { ...r, caption: e.target.value } : r)))}
                  />
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    {f.abgelegt
                      ? <><Check size={12} className="text-green-600" /> Original im Projektordner</>
                      : f.alt ? 'Original wartet auf Ablage' : 'Original geht in den Projektordner'}
                  </div>
                </div>
                <button
                  className="btn btn-danger px-3 self-start"
                  title="Foto entfernen"
                  onClick={() => {
                    if (f.abgelegt && !window.confirm('Das Original liegt schon im Projektordner. Es bleibt dort liegen – nur aus dem Bericht wird das Foto entfernt. Fortfahren?')) return
                    setFotos(rows => rows.filter((_, k) => k !== i))
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Firmen vor Ort ──────────────────────────────────────────────── */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Firmen vor Ort</label>
        {firmen.map((f, i) => (
          <div key={f.id || i} className="card p-2 space-y-1">
            <input className="input py-2 text-base" placeholder="Firma"
                   value={f.company || ''} onChange={(e) => setFirma(i, { company: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input py-2 text-base" placeholder="Gewerk"
                     value={f.gewerk || ''} onChange={(e) => setFirma(i, { gewerk: e.target.value })} />
              <input type="number" inputMode="numeric" className="input py-2 text-base" placeholder="Anzahl AK"
                     value={f.workers ?? ''} onChange={(e) => setFirma(i, { workers: e.target.value })} />
            </div>
            <input className="input py-2 text-base" placeholder="Wer war da (optional)"
                   value={f.person || ''} onChange={(e) => setFirma(i, { person: e.target.value })} />
            <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setFirmen(rows => rows.filter((_, k) => k !== i))}>
              <Trash2 size={13} /> Zeile entfernen
            </button>
          </div>
        ))}
        <button className="btn btn-secondary w-full py-3 justify-center"
                onClick={() => setFirmen(rows => [...rows, { id: uid(), company: '', person: '', gewerk: '', workers: '' }])}>
          <Plus size={16} /> Firma
        </button>
      </section>

      {/* ── Ausgeführte Arbeiten ────────────────────────────────────────── */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ausgeführte Arbeiten</label>
        {arbeiten.map((a, i) => (
          <div key={i} className="flex gap-2">
            <textarea
              className="textarea py-3 text-base" rows={3}
              placeholder="Was wurde heute gemacht?"
              value={a}
              onChange={(e) => setArbeiten(rows => rows.map((r, k) => (k === i ? e.target.value : r)))}
            />
            {arbeiten.length > 1 && (
              <button className="btn btn-danger px-3 self-start" onClick={() => setArbeiten(rows => rows.filter((_, k) => k !== i))}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        <button className="btn btn-secondary w-full py-3 justify-center" onClick={() => setArbeiten(rows => [...rows, ''])}>
          <Plus size={16} /> Weitere Angabe
        </button>
      </section>

      {/* ── Rest ────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bemerkungen</label>
        <textarea className="textarea py-3 text-base" rows={3} value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />
      </section>

      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Besonderes</label>
        <textarea className="textarea py-3 text-base" rows={2} placeholder="Behinderungen, Unfälle, Besuche …"
                  value={besonderes} onChange={(e) => setBesonderes(e.target.value)} />
      </section>

      <section className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Baufortschritt</label>
        <div className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min="0" max="100" className="input py-3 text-base"
                 value={progress} onChange={(e) => setProgress(e.target.value)} />
          <span className="text-sm text-gray-500">%</span>
        </div>
      </section>

      {fehler && (
        <div className="card p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {fehler}
        </div>
      )}

      {/* ── Speichern ───────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white border-t border-concrete flex gap-2">
        <button className="btn btn-primary flex-1 py-3 text-base justify-center" disabled={speichert || bild} onClick={speichern}>
          {speichert ? <Loader size={18} className="animate-spin" /> : <Save size={18} />} Speichern
        </button>
        <button className="btn btn-secondary py-3 px-4" onClick={onAbbrechen}>Abbrechen</button>
      </div>
      <div className="text-xs text-gray-500">
        Der Bericht wird sofort auf dem Gerät gespeichert und gesendet, sobald Netz da ist.
      </div>
    </div>
  )
}

// Miniatur: neue Fotos haben ihre kleine Fassung schon im Speicher, bei
// vorhandenen wird sie einmal geholt.
function Miniatur({ foto, projektId }) {
  const [url, setUrl] = useState(foto.base64 ? `data:image/jpeg;base64,${foto.base64}` : null)

  useEffect(() => {
    if (url || !foto.alt) return
    let weg = false
    anhangLaden(projektId, foto.id).then(u => { if (!weg) setUrl(u) })
    return () => { weg = true }
  }, [url, foto.alt, foto.id, projektId])

  return (
    <div className="w-16 h-16 bg-concrete flex-shrink-0 flex items-center justify-center overflow-hidden">
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : <Camera size={18} className="text-gray-400" />}
    </div>
  )
}
