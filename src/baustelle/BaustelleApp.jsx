import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  HardHat, LogOut, ExternalLink, Loader, Search, ChevronRight, ChevronLeft,
  Plus, CloudOff, UploadCloud, AlertTriangle, Camera, FolderOpen, RefreshCw,
} from 'lucide-react'
import LoginScreen from '../components/LoginScreen'
import SessionExpiredModal from '../components/SessionExpiredModal'
import brand from '../brand'
import { projekteLaden, berichteLaden, tokenOf, authHeaders, fotoPfad, GRUND_TEXT } from './api'
import { berichteOffen, warteschlangeSenden, berichtVerwerfen } from './warteschlange'
import { originalList, originaleSenden } from '../fotoOriginale'
import BerichtForm from './BerichtForm'

// ── Baustelle ────────────────────────────────────────────────────────────────
// Die schlanke Oberfläche für das Handy: Projekt wählen, Tagesbericht
// schreiben, fotografieren. Nichts weiter – Protokolle, Mängel, Kontakte und
// Nachträge bleiben im Protokolltool am Rechner.
//
// Alles läuft über /api/baustelle/* (server/baustelle.js). Geschrieben wird
// immer in die Warteschlange und von dort gesendet – damit ein Bericht auf der
// Baustelle auch ohne Netz fertig geschrieben werden kann.

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const LETZTES_PROJEKT = 'kp_baustelle_projekt'

const formatDate = (iso) => {
  if (!iso) return ''
  const [j, m, t] = iso.split('-')
  return `${t}.${m}.${j}`
}

const WETTER_TEXT = { sonnig: 'Sonnig', bewoelkt: 'Bewölkt', regen: 'Regen', schnee: 'Schnee/Frost' }

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const an = () => setOnline(true)
    const ab = () => setOnline(false)
    window.addEventListener('online', an)
    window.addEventListener('offline', ab)
    return () => { window.removeEventListener('online', an); window.removeEventListener('offline', ab) }
  }, [])
  return online
}

export default function BaustelleApp() {
  const [user,        setUser]        = useState(null)
  const [authChecked, setAuthChecked] = useState(!isServer)
  const [expired,     setExpired]     = useState(false)

  useEffect(() => {
    if (!isServer) return
    const token = tokenOf()
    fetch('/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => { if (r.status === 401) { localStorage.removeItem('kp_session_token'); return null } return r.json() })
      .then(u => { setUser(u || null); setAuthChecked(true) })
      .catch(() => { setUser(null); setAuthChecked(true) })
  }, [])

  useEffect(() => {
    const onExpired = () => setExpired(true)
    window.addEventListener('kp-auth-expired', onExpired)
    return () => window.removeEventListener('kp-auth-expired', onExpired)
  }, [])

  const abmelden = async () => {
    const token = tokenOf()
    try { if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
    localStorage.removeItem('kp_session_token')
    setUser(null)
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        <Loader size={18} className="animate-spin mr-2" /> Anmeldung wird geprüft…
      </div>
    )
  }
  if (!isServer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-gray-500">
        Die Baustellen-Ansicht läuft nur im Server-Modus – sie schreibt in die Projektdatenbank und legt Fotos auf der NAS ab.
      </div>
    )
  }
  if (!user) return <LoginScreen onLogin={setUser} title={brand.appNameSite} />

  return (
    <>
      <header className="sticky top-0 z-30 bg-night text-light px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <HardHat size={18} className="text-sky flex-shrink-0" />
          <span className="font-semibold truncate">{brand.appNameSite}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <a className="btn btn-ghost text-light hover:bg-white/10 hover:text-light px-3 py-2" href="/" title="Zum Protokolltool">
            <ExternalLink size={16} />
          </a>
          <button className="btn btn-ghost text-light hover:bg-white/10 hover:text-light px-3 py-2" onClick={abmelden} title="Abmelden">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <Baustelle user={user} />

      {expired && (
        <SessionExpiredModal
          username={user?.username}
          onSuccess={(u) => { setExpired(false); if (u) setUser(u) }}
        />
      )}
    </>
  )
}

// ── Inhalt ───────────────────────────────────────────────────────────────────
function Baustelle({ user }) {
  const online = useOnline()
  const [projekte, setProjekte] = useState([])
  const [laden,    setLaden]    = useState(true)
  const [fehler,   setFehler]   = useState(null)
  const [projektId, setProjektId] = useState(() => localStorage.getItem(LETZTES_PROJEKT) || null)
  const [form,     setForm]     = useState(null)      // null | 'neu' | Bericht
  const [offen,    setOffen]    = useState({ berichte: 0, originale: 0 })
  const [sendet,   setSendet]   = useState(false)
  // Zähler, der nach jedem Versand hochgeht. Die Projektansicht hängt daran
  // und lädt neu – sonst stünde ein gerade gesendeter Bericht weiter unter
  // „wartet auf Versand", obwohl er schon im Büro liegt.
  const [stand,    setStand]    = useState(0)
  const [hinweis,  setHinweis]  = useState(null)

  const zaehleOffene = useCallback(async () => {
    const [b, o] = await Promise.all([berichteOffen(), originalList()])
    setOffen({ berichte: b.length, originale: o.length })
    const mit = b.find(x => x.fehler)
    setHinweis(mit ? mit.fehler : null)
    return b.length + o.length
  }, [])

  const senden = useCallback(async ({ still = false } = {}) => {
    setSendet(true)
    try {
      const r = await warteschlangeSenden()
      if (r.grund === 'laeuft') return
      // Originale, die ohne wartenden Bericht übrig sind (z. B. Ablage
      // fehlgeschlagen), noch einmal anschieben – je Projekt.
      const rest = await originalList()
      for (const pid of new Set(rest.map(x => x.projectId))) {
        try { await originaleSenden(pid, authHeaders(), { pfad: fotoPfad }) } catch {}
      }
      await zaehleOffene()
      setStand(n => n + 1)
      if (!still && r.grund === 'offline') setHinweis('Kein Netz – die Berichte warten und gehen später von selbst raus.')
      else if (!still && r.fehler) setHinweis(r.fehler)
    } finally { setSendet(false) }
  }, [zaehleOffene])

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null)
    try { setProjekte(await projekteLaden()) }
    catch (e) { setFehler(e.message) }
    finally { setLaden(false) }
  }, [])

  useEffect(() => {
    laden_()
    zaehleOffene().then(() => { if (navigator.onLine) senden({ still: true }) })
  }, [laden_, zaehleOffene, senden])

  useEffect(() => {
    const an = () => senden({ still: true })
    window.addEventListener('online', an)
    return () => window.removeEventListener('online', an)
  }, [senden])

  useEffect(() => {
    if (projektId) localStorage.setItem(LETZTES_PROJEKT, projektId)
  }, [projektId])

  const projekt = useMemo(() => projekte.find(p => p.id === projektId) || null, [projekte, projektId])

  // Das gewählte Projekt gibt es nicht mehr (Zugang entzogen, archiviert)
  useEffect(() => {
    if (!laden && projektId && projekte.length && !projekt) setProjektId(null)
  }, [laden, projektId, projekte, projekt])

  const wartet = offen.berichte + offen.originale

  return (
    <div className="pb-24">
      {!online && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2 flex items-center gap-2">
          <CloudOff size={15} className="flex-shrink-0" />
          Kein Netz. Berichte und Fotos werden gespeichert und später gesendet.
        </div>
      )}

      {wartet > 0 && (
        <div className="bg-sky/20 border-b border-sky text-brand-800 text-sm px-4 py-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <UploadCloud size={15} className="flex-shrink-0" />
            <span className="truncate">
              {offen.berichte > 0 && `${offen.berichte} Bericht${offen.berichte === 1 ? '' : 'e'}`}
              {offen.berichte > 0 && offen.originale > 0 && ', '}
              {offen.originale > 0 && `${offen.originale} Foto${offen.originale === 1 ? '' : 's'}`}
              {' '}warten
            </span>
          </span>
          <button className="btn btn-secondary px-3 py-1.5 flex-shrink-0" disabled={sendet || !online} onClick={() => senden()}>
            {sendet ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />} Senden
          </button>
        </div>
      )}

      {hinweis && (
        <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-4 py-2 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span className="min-w-0">{hinweis}</span>
          <button className="ml-auto text-red-700 underline flex-shrink-0" onClick={() => setHinweis(null)}>ok</button>
        </div>
      )}

      {fehler && (
        <div className="m-4 card p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {fehler}
        </div>
      )}

      {form && projekt ? (
        <BerichtForm
          projekt={projekt}
          bericht={form === 'neu' ? null : form}
          onFertig={async () => { setForm(null); await zaehleOffene(); await senden({ still: true }) }}
          onAbbrechen={() => setForm(null)}
        />
      ) : projekt ? (
        <ProjektAnsicht
          projekt={projekt}
          online={online}
          stand={stand}
          onZurueck={() => setProjektId(null)}
          onNeu={() => setForm('neu')}
          onBearbeiten={(b) => setForm(b)}
          onVerwerfen={async (id) => { await berichtVerwerfen(id); zaehleOffene() }}
        />
      ) : (
        <ProjektListe projekte={projekte} laden={laden} onWahl={setProjektId} />
      )}
    </div>
  )
}

// ── Projektauswahl ───────────────────────────────────────────────────────────
function ProjektListe({ projekte, laden, onWahl }) {
  const [suche, setSuche] = useState('')
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase()
    if (!s) return projekte
    return projekte.filter(p =>
      (p.name || '').toLowerCase().includes(s) ||
      (p.nummer || '').toLowerCase().includes(s) ||
      (p.ort || '').toLowerCase().includes(s))
  }, [projekte, suche])

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-8 py-3 text-base"
          placeholder="Projekt suchen"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>

      {laden && <div className="text-sm text-gray-400 flex items-center gap-2"><Loader size={14} className="animate-spin" /> Projekte werden geladen…</div>}
      {!laden && treffer.length === 0 && (
        <div className="text-sm text-gray-500">Kein Projekt gefunden.</div>
      )}

      <ul className="space-y-2">
        {treffer.map(p => (
          <li key={p.id}>
            <button
              className="card w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-concrete"
              onClick={() => onWahl(p.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-night truncate">{p.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {[p.nummer, p.ort].filter(Boolean).join(' · ')}
                  {p.letzterBericht ? ` · letzter Bericht ${formatDate(p.letzterBericht)}` : ' · noch kein Bericht'}
                </div>
                {!p.fotoordner && (
                  <div className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
                    <FolderOpen size={12} /> Fotoordner im Büro noch nicht festgelegt
                  </div>
                )}
              </div>
              <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Ein Projekt: Berichte der letzten Tage ───────────────────────────────────
function ProjektAnsicht({ projekt, online, stand, onZurueck, onNeu, onBearbeiten, onVerwerfen }) {
  const [berichte, setBerichte] = useState([])
  const [wartende, setWartende] = useState([])
  const [laden,    setLaden]    = useState(true)
  const [fehler,   setFehler]   = useState(null)

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null)
    try {
      const [d, w] = await Promise.all([
        online ? berichteLaden(projekt.id) : Promise.resolve({ berichte: [] }),
        berichteOffen(projekt.id),
      ])
      setBerichte(d.berichte || [])
      setWartende(w)
    } catch (e) { setFehler(e.message) }
    finally { setLaden(false) }
    // `stand` steht absichtlich dabei: nach jedem Versand neu laden.
  }, [projekt.id, online, stand])

  useEffect(() => { laden_() }, [laden_])

  return (
    <div className="p-4 space-y-3">
      <button className="btn btn-ghost px-0 py-2 -ml-1" onClick={onZurueck}>
        <ChevronLeft size={16} /> Projekte
      </button>

      <div>
        <h1 className="text-lg font-semibold text-night leading-tight">{projekt.name}</h1>
        <div className="text-xs text-gray-500">{[projekt.nummer, projekt.ort].filter(Boolean).join(' · ')}</div>
      </div>

      {!projekt.fotoordner && (
        <div className="card p-3 text-sm text-amber-800 bg-amber-50 border-amber-200 flex items-start gap-2">
          <FolderOpen size={15} className="flex-shrink-0 mt-0.5" />
          <span>
            Für dieses Projekt ist noch kein Fotoordner festgelegt. Fotografieren geht trotzdem –
            die Originale warten dann, bis das Büro den Ordner in der Baudokumentation hinterlegt hat.
          </span>
        </div>
      )}

      <button className="btn btn-primary w-full py-3 text-base justify-center" onClick={onNeu}>
        <Plus size={18} /> Neuer Tagesbericht
      </button>

      {fehler && <div className="text-sm text-red-700">{fehler}</div>}
      {laden && <div className="text-sm text-gray-400 flex items-center gap-2"><Loader size={14} className="animate-spin" /> wird geladen…</div>}

      {wartende.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Wartet auf Versand</div>
          {wartende.map(w => (
            <div key={w.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {formatDate(w.felder?.date)} · {w.felder?.daytime === 'nachmittag' ? 'Nachmittag' : 'Vormittag'}
                </span>
                <span className="badge-yellow">wartet</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {(w.fotos || []).length} Foto{(w.fotos || []).length === 1 ? '' : 's'}
                {w.versuche ? ` · ${w.versuche} Versuch${w.versuche === 1 ? '' : 'e'}` : ''}
              </div>
              {w.fehler && <div className="text-xs text-red-700 mt-1">{w.fehler}</div>}
              <button
                className="btn btn-danger mt-2 px-3 py-1.5"
                onClick={() => { if (window.confirm('Diesen wartenden Bericht verwerfen? Er ist dann weg.')) onVerwerfen(w.id).then(laden_) }}
              >
                Verwerfen
              </button>
            </div>
          ))}
        </div>
      )}

      {!laden && berichte.length === 0 && wartende.length === 0 && (
        <div className="text-sm text-gray-500">
          {online ? 'In den letzten 14 Tagen gibt es keinen Bericht.' : 'Ohne Netz werden die Berichte vom Server nicht angezeigt.'}
        </div>
      )}

      <ul className="space-y-2">
        {berichte.map(b => (
          <li key={b.id} className="card p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-night">
                {formatDate(b.date)} · {b.daytime === 'nachmittag' ? 'Nachmittag' : 'Vormittag'}
              </span>
              <span className="text-xs text-gray-500">
                {WETTER_TEXT[b.weather] || b.weather}
                {b.tempMin !== '' || b.tempMax !== '' ? ` · ${b.tempMin ?? '–'}–${b.tempMax ?? '–'} °C` : ''}
              </span>
            </div>

            {b.arbeiten.length > 0 && (
              <div className="text-gray-700 mt-1 whitespace-pre-line line-clamp-4">{b.arbeiten.join('\n')}</div>
            )}

            <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {b.fotos.length > 0 && (
                <span className="flex items-center gap-1">
                  <Camera size={12} /> {b.fotos.length}
                  {b.fotos.some(f => !f.abgelegt) && ' · Originale noch nicht abgelegt'}
                </span>
              )}
              {b.von && <span>von {b.von}</span>}
              {b.quelle === 'baustelle' && <span className="badge-gray">Baustelle</span>}
            </div>

            {b.nurBuero
              ? <div className="text-xs text-gray-400 mt-2">{GRUND_TEXT[b.nurBuero]}</div>
              : <button className="btn btn-secondary mt-2 px-3 py-1.5" onClick={() => onBearbeiten(b)}>Bearbeiten</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
