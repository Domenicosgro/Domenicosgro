/* useSpellCheck – singleton Web Worker wrapper for German spell checking */
import { useEffect, useRef, useCallback } from 'react'

let worker    = null
let workerReady = false
const pending = new Map()  // id → { resolve, reject }
let nextId    = 1

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../spellcheck.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const msg = e.data
    if (msg.type === 'ready') { workerReady = true; return }
    if (msg.type === 'result') {
      const cb = pending.get(msg.id)
      if (cb) { pending.delete(msg.id); cb(msg) }
    }
  }
  worker.onerror = (err) => console.warn('Spellcheck worker error:', err)
  return worker
}

/**
 * Returns `checkWord(word)` → Promise<{ correct: boolean, suggestions: string[] }>
 * The worker is initialized once (singleton).
 */
export function useSpellCheck() {
  useEffect(() => { getWorker() }, [])   // ensure worker starts early

  const checkWord = useCallback((word) => {
    if (!word || word.length < 2) return Promise.resolve({ correct: true, suggestions: [] })
    // Strip punctuation
    const clean = word.replace(/^[^a-zA-ZäöüÄÖÜß]+|[^a-zA-ZäöüÄÖÜß]+$/g, '')
    if (!clean) return Promise.resolve({ correct: true, suggestions: [] })

    return new Promise((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      getWorker().postMessage({ id, word: clean })
      // Timeout fallback after 1s
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          resolve({ correct: true, suggestions: [] })
        }
      }, 1000)
    })
  }, [])

  return checkWord
}
