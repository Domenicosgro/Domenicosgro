/* spellcheck.worker.js – runs in a Web Worker, loads German Hunspell dictionary */
import NSpell from 'nspell'

let checker = null

async function init() {
  const [affRes, dicRes] = await Promise.all([
    fetch('/de.aff'),
    fetch('/de.dic'),
  ])
  const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()])
  checker = NSpell(aff, dic)
  postMessage({ type: 'ready' })
}

init().catch(err => postMessage({ type: 'error', message: String(err) }))

onmessage = (e) => {
  if (!checker) return
  const { id, word } = e.data
  const correct      = checker.correct(word)
  const suggestions  = correct ? [] : checker.suggest(word).slice(0, 7)
  postMessage({ type: 'result', id, word, correct, suggestions })
}
