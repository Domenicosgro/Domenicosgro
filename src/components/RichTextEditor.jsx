import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TiptapImage from '@tiptap/extension-image'
import {
  Bold, Italic, Underline as UIcon, Strikethrough,
  List, ListOrdered, Image as ImageIcon,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convert legacy plain-text values to HTML for the editor.
// If the string already contains an HTML tag it is returned as-is.
export function toHtml(str) {
  if (!str) return ''
  if (/<[a-z][\s\S]*>/i.test(str)) return str
  // Escape special characters then convert newlines to paragraphs
  const safe = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const parts = safe.split('\n').map(l => `<p>${l || '<br>'}</p>`)
  return parts.join('')
}

// Strip HTML tags to plain text (for print previews and exports).
export function stripHtml(html) {
  if (!html) return ''
  if (!/<[a-z][\s\S]*>/i.test(html)) return html
  return html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// ── Image helpers ─────────────────────────────────────────────────────────────

// Resize an image to max 1400 px on the longest edge and re-encode as JPEG.
function compressImage(dataUrl, maxDim = 1400) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = (img.width > maxDim || img.height > maxDim)
        ? Math.min(maxDim / img.width, maxDim / img.height) : 1
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function readAndInsertImage(file, editor) {
  if (!file || !file.type.startsWith('image/')) return
  if (file.size > 15 * 1024 * 1024) { alert('Bild ist zu groß (max. 15 MB).'); return }
  const reader = new FileReader()
  reader.onload = async e => {
    const src = await compressImage(e.target.result)
    editor?.chain().focus().setImage({ src }).run()
  }
  reader.readAsDataURL(file)
}

// Intercepts clipboard paste + drag-and-drop of image files.
const ImagePastePlugin = Extension.create({
  name: 'imagePastePlugin',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [new Plugin({
      props: {
        handlePaste(view, event) {
          const items = Array.from(event.clipboardData?.items ?? [])
          const imgItem = items.find(i => i.type.startsWith('image/'))
          if (!imgItem) return false
          const file = imgItem.getAsFile()
          if (file) readAndInsertImage(file, editor)
          return !!file
        },
        handleDrop(view, event, _slice, moved) {
          if (moved) return false
          const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
          if (!files.length) return false
          files.forEach(f => readAndInsertImage(f, editor))
          return true
        },
      },
    })]
  },
})

// ── Tiptap extensions ─────────────────────────────────────────────────────────

// Tab innerhalb einer Liste erzeugt einen Unterpunkt. Liegt der Cursor in einer
// nummerierten Liste, wird der neu eingerückte Unterpunkt automatisch in eine
// nicht-nummerierte (Punkt-)Aufzählung umgewandelt – wie in klassischen
// Textverarbeitungen (1. → •). Shift-Tab rückt wieder aus.
const SmartIndent = Extension.create({
  name: 'smartIndent',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const editor = this.editor
        if (!editor.isActive('listItem')) return false
        const ok = editor.chain().focus().sinkListItem('listItem').run()
        if (!ok) return false
        // Nächstgelegene Listen-Ebene um den Cursor finden; ist sie nummeriert,
        // in eine Punkt-Aufzählung umwandeln (Unterpunkt = nicht-nummerisch).
        const { state, view } = editor
        const orderedList = state.schema.nodes.orderedList
        const bulletList  = state.schema.nodes.bulletList
        const { $from } = state.selection
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d)
          if (node.type === bulletList) break          // bereits Punkt-Liste – nichts tun
          if (node.type === orderedList) {
            const pos = $from.before(d)
            view.dispatch(state.tr.setNodeMarkup(pos, bulletList))
            break
          }
        }
        return true
      },
      'Shift-Tab': () => {
        const editor = this.editor
        if (!editor.isActive('listItem')) return false
        return editor.chain().focus().liftListItem('listItem').run()
      },
    }
  },
})

const buildExtensions = (placeholder, allowImages = false) => [
  StarterKit.configure({
    heading:         false,
    codeBlock:       false,
    blockquote:      false,
    horizontalRule:  false,
    code:            false,
  }),
  Underline,
  SmartIndent,
  Placeholder.configure({ placeholder: placeholder ?? '' }),
  ...(allowImages ? [TiptapImage.configure({ allowBase64: true }), ImagePastePlugin] : []),
]

// ── Toolbar button ─────────────────────────────────────────────────────────────

function Btn({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-brand-100 text-brand-700'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
      }`}
      title={title}
    >
      {children}
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  allowImages = false,
}) {
  const lastEmittedRef = useRef(null)
  const fileInputRef   = useRef(null)

  const editor = useEditor({
    extensions: buildExtensions(placeholder, allowImages),
    content:    toHtml(value),
    editable:   !disabled,
    onUpdate: ({ editor }) => {
      const html       = editor.getHTML()
      const normalized = (html === '<p></p>' || html === '') ? '' : html
      lastEmittedRef.current = normalized
      onChange(normalized)
    },
  })

  // Sync external value changes (e.g., predecessor carryover resets content).
  // Skip when the incoming value is what we just emitted to avoid cursor resets.
  useEffect(() => {
    if (!editor) return
    const incoming = toHtml(value)
    const current  = editor.getHTML()
    const emitted  = lastEmittedRef.current !== null ? toHtml(lastEmittedRef.current) : null

    if (incoming === emitted) return       // our own change reflected back — skip
    if (incoming === current) return       // no real change — skip
    editor.commands.setContent(incoming, false)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync editable state
  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [editor, disabled])

  if (!editor) return null

  const e = editor

  return (
    <div className={`rich-editor ${className}`}>
      {/* Toolbar — hidden in print via CSS */}
      <div className="rich-editor-toolbar flex items-center gap-0.5 mb-1 flex-wrap">
        <Btn onClick={() => e.chain().focus().toggleBold().run()}         active={e.isActive('bold')}        title="Fett (Strg+B)">
          <Bold size={12} />
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleItalic().run()}       active={e.isActive('italic')}      title="Kursiv (Strg+I)">
          <Italic size={12} />
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleUnderline().run()}    active={e.isActive('underline')}   title="Unterstrichen (Strg+U)">
          <UIcon size={12} />
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleStrike().run()}       active={e.isActive('strike')}      title="Durchgestrichen">
          <Strikethrough size={12} />
        </Btn>
        <div className="w-px h-3.5 bg-gray-200 mx-0.5" />
        <Btn onClick={() => e.chain().focus().toggleBulletList().run()}   active={e.isActive('bulletList')}  title="Aufzählung  (Tipp: «- » am Zeilenanfang)">
          <List size={12} />
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleOrderedList().run()}  active={e.isActive('orderedList')} title="Nummerierte Liste  (Tipp: «1. » am Zeilenanfang)">
          <ListOrdered size={12} />
        </Btn>
        {allowImages && (
          <>
            <div className="w-px h-3.5 bg-gray-200 mx-0.5" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={ev => {
                const f = ev.target.files?.[0]
                if (f) readAndInsertImage(f, editor)
                ev.target.value = ''
              }}
            />
            <Btn onClick={() => fileInputRef.current?.click()} active={false} title="Bild einfügen (auch Screenshot einfügen mit Strg+V)">
              <ImageIcon size={12} />
            </Btn>
          </>
        )}
      </div>

      <EditorContent editor={editor} className="rich-editor-content" />
    </div>
  )
}
