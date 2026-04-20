/**
 * SpellCheckTextarea
 * Replaces <textarea> in protocol item fields.
 * When the user pauses after finishing a word the German dictionary is
 * checked and up to 7 suggestions are shown as clickable chips.
 * Clicking a chip replaces the misspelled word in the textarea.
 */
import React, { useState, useRef, useCallback } from 'react'
import { useSpellCheck } from '../hooks/useSpellCheck'

// Return the word currently under/just-before the cursor in a textarea
function wordAtCursor(el) {
  const pos  = el.selectionStart ?? 0
  const text = el.value ?? ''
  let start  = pos
  let end    = pos
  // Walk backwards to word start
  while (start > 0 && /[a-zA-ZäöüÄÖÜß\-]/.test(text[start - 1])) start--
  // Walk forwards to word end
  while (end < text.length && /[a-zA-ZäöüÄÖÜß\-]/.test(text[end])) end++
  if (start === end) return null
  return { word: text.slice(start, end), start, end }
}

export default function SpellCheckTextarea({ value, onChange, className, rows = 2, placeholder, disabled }) {
  const checkWord      = useSpellCheck()
  const timerRef       = useRef(null)
  const [hint, setHint] = useState(null)  // { word, start, end, suggestions }

  const handleChange = (e) => onChange(e)  // pass through

  const scheduleCheck = useCallback((el) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const info = wordAtCursor(el)
      if (!info) { setHint(null); return }
      const { correct, suggestions } = await checkWord(info.word)
      if (!correct && suggestions.length > 0) {
        setHint({ ...info, suggestions })
      } else {
        setHint(null)
      }
    }, 600)
  }, [checkWord])

  const handleKeyDown = (e) => {
    if (e.altKey && e.key === 'Enter') {
      e.preventDefault()
      const el    = e.target
      const start = el.selectionStart
      const end   = el.selectionEnd
      const newVal = value.slice(0, start) + '\n' + value.slice(end)
      onChange({ target: { value: newVal } })
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 1 })
    }
  }

  const handleKeyUp = (e) => scheduleCheck(e.target)
  const handleClick = (e) => scheduleCheck(e.target)

  const applySuggestion = (suggestion) => {
    if (!hint) return
    const before  = value.slice(0, hint.start)
    const after   = value.slice(hint.end)
    const newVal  = before + suggestion + after
    // Simulate a change event so the parent updates its state
    onChange({ target: { value: newVal } })
    setHint(null)
  }

  return (
    <div className="relative">
      <textarea
        className={className}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        onBlur={() => { clearTimeout(timerRef.current); setHint(null) }}
        disabled={disabled}
        spellCheck={true}
        lang="de"
        autoCorrect="on"
      />
      {hint && (
        <div className="absolute left-0 z-20 flex flex-wrap gap-1 mt-0.5 bg-white border border-amber-300 rounded-lg shadow-lg px-2 py-1.5 text-xs">
          <span className="text-amber-600 font-medium mr-1 self-center">„{hint.word}":</span>
          {hint.suggestions.map(s => (
            <button
              key={s}
              type="button"
              className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-gray-800 transition-colors cursor-pointer"
              onMouseDown={e => { e.preventDefault(); applySuggestion(s) }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
