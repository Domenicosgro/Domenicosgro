import React, { useState } from 'react'
import { Plus, ExternalLink, Trash2, X, FolderOpen, Link } from 'lucide-react'
import { uid } from '../utils'

// 4 × 4 cm, Mindest-Fallback 80 px für kleine Screens
const TILE_STYLE = { width: '4cm', height: '4cm', minWidth: '80px', minHeight: '80px' }

const COLOR_SCHEMES = {
  night:    'bg-night text-light hover:bg-sky hover:text-night',
  sky:      'bg-sky text-night hover:bg-night hover:text-light',
  concrete: 'bg-concrete text-night hover:bg-sky hover:text-night',
}
const COLORS = ['night', 'sky', 'concrete']

// ── Kachel-Modal ──────────────────────────────────────────────────────────────
function TileModal({ linkedFolders, onAdd, onClose }) {
  const [source,   setSource]   = useState(linkedFolders.length ? 'folder' : 'url')
  const [folderId, setFolderId] = useState(linkedFolders[0]?.id ?? '')
  const [label,    setLabel]    = useState('')
  const [url,      setUrl]      = useState('')
  const [color,    setColor]    = useState('night')

  const selectedFolder = linkedFolders.find(f => f.id === folderId)

  const handleAdd = () => {
    let finalLabel = label.trim()
    let finalUrl   = url.trim()
    if (source === 'folder' && selectedFolder) {
      finalLabel = finalLabel || selectedFolder.label
      finalUrl   = selectedFolder.url
    }
    if (!finalLabel || !finalUrl) return
    onAdd({ id: uid(), label: finalLabel, kind: source === 'folder' ? 'folder' : 'url', url: finalUrl, color })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-night">LNA hinzufügen</h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Quelle */}
        <div className="flex rounded overflow-hidden border border-concrete text-xs">
          {linkedFolders.length > 0 && (
            <button
              className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors
                ${source === 'folder' ? 'bg-night text-light' : 'bg-white text-gray-600 hover:bg-concrete'}`}
              onClick={() => setSource('folder')}
            >
              <FolderOpen size={12} /> Ordner
            </button>
          )}
          <button
            className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors
              ${source === 'url' ? 'bg-night text-light' : 'bg-white text-gray-600 hover:bg-concrete'}`}
            onClick={() => setSource('url')}
          >
            <Link size={12} /> URL / Link
          </button>
        </div>

        {source === 'folder' && linkedFolders.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Verknüpfter Ordner</label>
            <select
              className="select"
              value={folderId}
              onChange={e => {
                setFolderId(e.target.value)
                const f = linkedFolders.find(x => x.id === e.target.value)
                if (f && !label) setLabel(f.label)
              }}
            >
              {linkedFolders.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Bezeichnung auf dem LNA</label>
          <input
            type="text"
            className="input"
            placeholder={source === 'folder' && selectedFolder ? selectedFolder.label : 'z. B. Pläne, Protokoll…'}
            value={label}
            onChange={e => setLabel(e.target.value)}
            autoFocus
          />
        </div>

        {source === 'url' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">URL / Link</label>
            <input type="url" className="input" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Farbe</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                className={`w-7 h-7 rounded border-2 transition-all ${COLOR_SCHEMES[c].split(' ')[0]}
                  ${color === c ? 'border-sky scale-110' : 'border-transparent'}`}
                title={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary text-xs" onClick={onClose}>Abbrechen</button>
          <button
            className="btn-primary text-xs"
            disabled={source === 'url' ? (!label.trim() || !url.trim()) : (!selectedFolder && !label.trim())}
            onClick={handleAdd}
          >
            <Plus size={12} /> Hinzufügen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
// Kein eigenes Positioning – das erledigt der Parent (sticky in ProtocolEditor)
export default function TileSidebar({ tiles, linkedFolders, onChange }) {
  const [showModal, setShowModal] = useState(false)

  const removeTile = (id) => onChange(tiles.filter(t => t.id !== id))
  const addTile    = (tile) => { onChange([...tiles, tile]); setShowModal(false) }

  return (
    <>
      <div className="flex flex-col gap-2 pt-1">
        {tiles.map(tile => {
          const scheme = COLOR_SCHEMES[tile.color] ?? COLOR_SCHEMES.night
          return (
            <div key={tile.id} className="group relative flex-shrink-0">
              <button
                className={`flex flex-col items-center justify-center gap-2 rounded-lg transition-colors ${scheme}`}
                style={TILE_STYLE}
                title={tile.url || tile.label}
                onClick={() => tile.url && window.open(tile.url, '_blank', 'noopener')}
              >
                <ExternalLink size={20} className="flex-shrink-0 opacity-70" />
                <span className="text-[11px] font-medium text-center px-2 leading-tight line-clamp-3 break-words w-full">
                  {tile.label}
                </span>
              </button>
              <button
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white
                  opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10"
                title="LNA entfernen"
                onClick={() => removeTile(tile.id)}
              >
                <X size={10} />
              </button>
            </div>
          )
        })}

        {/* Plus-Kachel */}
        <button
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg flex-shrink-0
            border-2 border-dashed border-sky/60 text-sky/70
            hover:border-sky hover:text-sky hover:bg-sky/5 transition-colors"
          style={TILE_STYLE}
          title="LNA hinzufügen"
          onClick={() => setShowModal(true)}
        >
          <Plus size={24} />
          <span className="text-xs">LNA</span>
        </button>
      </div>

      {showModal && (
        <TileModal
          linkedFolders={linkedFolders ?? []}
          onAdd={addTile}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
