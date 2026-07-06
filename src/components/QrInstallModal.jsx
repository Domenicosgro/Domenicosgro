import React, { useState, useEffect } from 'react'
import { X, Smartphone, Loader } from 'lucide-react'
import QRCode from 'qrcode'

/**
 * QR-Code zur Installation der App auf dem Smartphone.
 * Kodiert die aktuelle App-Adresse – am Handy gescannt öffnet sich die
 * PWA und kann über den Browser installiert werden.
 */
export default function QrInstallModal({ onClose }) {
  const [qrUrl, setQrUrl] = useState(null)
  const appUrl = window.location.origin

  useEffect(() => {
    QRCode.toDataURL(appUrl, { width: 300, margin: 2, color: { dark: '#000040', light: '#ffffff' } })
      .then(setQrUrl)
      .catch(() => setQrUrl(null))
  }, [appUrl])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm border border-gray-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Smartphone size={16} className="text-brand-600" /> App auf dem Handy installieren
          </h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-5 text-center">
          {qrUrl
            ? <img src={qrUrl} alt="QR-Code zur App" className="mx-auto w-64 h-64" />
            : <div className="w-64 h-64 mx-auto flex items-center justify-center"><Loader size={22} className="animate-spin text-gray-300" /></div>}
          <p className="text-xs text-gray-500 mt-2 font-mono break-all">{appUrl}</p>

          <div className="text-left mt-4 space-y-2 text-sm text-gray-600">
            <p className="font-medium text-gray-800">So geht's:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>QR-Code mit der Handy-Kamera scannen (Handy muss im selben Netzwerk bzw. VPN sein)</li>
              <li>Seite öffnet sich im Browser und anmelden</li>
              <li><strong>Android/Chrome:</strong> Menü ⋮ → „App installieren"</li>
              <li><strong>iPhone/Safari:</strong> Teilen-Symbol → „Zum Home-Bildschirm"</li>
            </ol>
            <p className="text-xs text-gray-400 pt-1">
              Danach startet die App wie eine normale App vom Home-Bildschirm – ideal für Bautagebuch
              und Mängelerfassung mit Foto direkt von der Baustelle.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
