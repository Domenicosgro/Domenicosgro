import { useState, useEffect } from 'react'

const LOGO_KEY = 'bb_logo_v1'
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

function loadLogo() {
  try { return localStorage.getItem(LOGO_KEY) || '' } catch { return '' }
}
function saveLogo(dataUrl) {
  try { localStorage.setItem(LOGO_KEY, dataUrl) } catch {}
}

export function useLogo() {
  const [logoDataUrl, setLogoDataUrl] = useState(loadLogo)

  const updateLogo = (dataUrl) => {
    setLogoDataUrl(dataUrl)
    saveLogo(dataUrl)
  }

  const clearLogo = () => updateLogo('')

  return { logoDataUrl, updateLogo, clearLogo }
}
