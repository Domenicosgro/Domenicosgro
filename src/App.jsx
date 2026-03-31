import React, { useState, useEffect, useRef } from 'react'
import { useProtocols } from './hooks/useProtocols'
import { useLogo } from './hooks/useLogo'
import ProtocolList from './components/ProtocolList'
import ProtocolEditor from './components/ProtocolEditor'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export default function App() {
  const {
    protocols, loaded,
    createProtocol, updateProtocol, deleteProtocol, duplicateProtocol, importProtocol,
  } = useProtocols()

  const { logoDataUrl, updateLogo, clearLogo } = useLogo()

  const [activeId, setActiveId] = useState(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  // ── Electron menu wiring ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return

    // Import JSON from main menu
    window.electronAPI.onMenuImport(async () => {
      const data = await window.electronAPI.importJSON()
      if (data) {
        const id = importProtocol(data)
        if (id) setActiveId(id)
      }
    })

    // Export JSON from main menu (only when a protocol is open)
    window.electronAPI.onMenuExportJSON(async () => {
      const id = activeIdRef.current
      if (!id) return
      const p = protocols.find(x => x.id === id)
      if (p) await window.electronAPI.exportJSON(p)
    })

    // Print from main menu
    window.electronAPI.onMenuPrint(() => window.print())

    // Send agenda from main menu – signals to the editor via a custom DOM event
    window.electronAPI.onMenuSendAgenda(() => {
      window.dispatchEvent(new CustomEvent('app:send-agenda'))
    })

    return () => {
      ;['menu:import', 'menu:export-json', 'menu:print', 'menu:send-agenda'].forEach(
        ch => window.electronAPI.removeAllListeners(ch)
      )
    }
  }, [protocols, importProtocol])

  const handleCreate = () => {
    const id = createProtocol()
    setActiveId(id)
  }

  const activeProtocol = protocols.find(p => p.id === activeId)

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Lade Protokolle…</div>
      </div>
    )
  }

  if (activeId && activeProtocol) {
    return (
      <ProtocolEditor
        protocol={activeProtocol}
        protocols={protocols}
        logoDataUrl={logoDataUrl}
        onLogoUpdate={updateLogo}
        onLogoClear={clearLogo}
        onUpdate={updateProtocol}
        onBack={() => setActiveId(null)}
      />
    )
  }

  return (
    <ProtocolList
      protocols={protocols}
      onCreate={handleCreate}
      onOpen={setActiveId}
      onDelete={deleteProtocol}
      onDuplicate={duplicateProtocol}
      onImport={importProtocol}
      onOpenImported={setActiveId}
    />
  )
}
