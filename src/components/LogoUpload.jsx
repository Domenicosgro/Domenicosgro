import React, { useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'

export default function LogoUpload({ logoDataUrl, onUpdate, onClear }) {
  const inputRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onUpdate(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="flex items-center gap-3">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {logoDataUrl ? (
        <>
          <img
            src={logoDataUrl}
            alt="Firmenlogo"
            className="h-12 max-w-[160px] object-contain border border-gray-200 rounded p-1 bg-white"
          />
          <div className="flex flex-col gap-1">
            <button className="btn-secondary text-xs py-1" onClick={() => inputRef.current?.click()}>
              <ImagePlus size={13} /> Ändern
            </button>
            <button className="btn-ghost text-xs py-1 text-red-400 hover:text-red-600" onClick={onClear}>
              <X size={13} /> Entfernen
            </button>
          </div>
        </>
      ) : (
        <button className="btn-secondary text-sm" onClick={() => inputRef.current?.click()}>
          <ImagePlus size={15} /> Firmenlogo hochladen
        </button>
      )}
    </div>
  )
}
