import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, CheckCheck } from 'lucide-react'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso + (iso.includes('T') ? '' : 'Z')).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)   return 'gerade eben'
  if (min < 60)  return `vor ${min} Min.`
  const h = Math.floor(min / 60)
  if (h < 24)    return `vor ${h} Std.`
  const d = Math.floor(h / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}

const TYPE_DOT = {
  release:  'bg-green-500',
  request:  'bg-amber-500',
  decision: 'bg-brand-500',
  info:     'bg-gray-400',
}

/** In-App-Benachrichtigungsglocke (Server-Modus). Lädt beim Mount + alle 60 s. */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const [items,  setItems]  = useState([])
  const [open,   setOpen]   = useState(false)
  const panelRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { headers: authHeaders() })
      if (!res.ok) return
      const data = await res.json()
      setUnread(data.unread || 0)
      setItems(data.items || [])
    } catch {}
  }, [])

  useEffect(() => {
    if (!isServer) return
    load()
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [load])

  // Klick außerhalb schließt das Panel
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read', { method: 'POST', headers: authHeaders() })
      setUnread(0)
      setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    } catch {}
  }

  if (!isServer) return null

  return (
    <div className="relative" ref={panelRef}>
      <button
        className="btn btn-ghost p-1.5 relative"
        title="Benachrichtigungen"
        onClick={() => { setOpen(v => !v); if (!open) load() }}
      >
        <Bell size={14} className="text-gray-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-w-[90vw] bg-white border border-gray-200 shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">Benachrichtigungen</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-0.5" onClick={markAllRead}>
                  <CheckCheck size={11} /> Alle gelesen
                </button>
              )}
              <button className="btn-ghost p-0.5 text-gray-400" onClick={() => setOpen(false)}><X size={13} /></button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Keine Benachrichtigungen.</p>
            )}
            {items.map(n => (
              <div key={n.id} className={`px-3 py-2.5 border-b border-gray-50 flex items-start gap-2 ${!n.read_at ? 'bg-brand-50/50' : ''}`}>
                <span className={`flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${TYPE_DOT[n.type] || TYPE_DOT.info}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs leading-snug ${!n.read_at ? 'font-medium text-gray-800' : 'text-gray-600'}`}>{n.text}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
