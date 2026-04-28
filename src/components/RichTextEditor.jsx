import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline as UIcon, Strikethrough,
  List, ListOrdered,
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

// ── Tiptap extensions ─────────────────────────────────────────────────────────

const buildExtensions = (placeholder) => [
  StarterKit.configure({
    heading:         false,
    codeBlock:       false,
    blockquote:      false,
    horizontalRule:  false,
    code:            false,
  }),
  Underline,
  Placeholder.configure({ placeholder: placeholder ?? '' }),
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
}) {
  // Track the last HTML string WE sent to the parent via onChange.
  // This lets the sync-effect below skip re-setting content when the parent
  // re-renders with the value we just emitted (which would reset the cursor).
  const lastEmittedRef = useRef(null)

  const editor = useEditor({
    extensions: buildExtensions(placeholder),
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
      </div>

      <EditorContent editor={editor} className="rich-editor-content" />
    </div>
  )
}
