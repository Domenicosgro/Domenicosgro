import { useState } from 'react'

const LOGO_KEY   = 'bb_logo_v1'
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

function loadLogo() {
  try { return localStorage.getItem(LOGO_KEY) || '' } catch { return '' }
}

export function useLogo() {
  const [logoDataUrl, setLogoDataUrl] = useState(loadLogo)
  const [saveError,   setSaveError]   = useState(null)

  const updateLogo = (dataUrl) => {
    setLogoDataUrl(dataUrl)
    try {
      localStorage.setItem(LOGO_KEY, dataUrl)
      setSaveError(null)
    } catch (err) {
      const isQuota = err instanceof DOMException && err.name === 'QuotaExceededError'
      setSaveError(isQuota
        ? 'Speicher voll – Logo konnte nicht gespeichert werden.'
        : 'Logo konnte nicht gespeichert werden.'
      )
    }
  }

  const clearLogo = () => updateLogo('')
  const clearSaveError = () => setSaveError(null)

  return { logoDataUrl, updateLogo, clearLogo, saveError, clearSaveError }
}
