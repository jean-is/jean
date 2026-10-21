// A demo (D457): a task Jean did, played again in the room's own conversation (ui/chat.js) for a page
// or a talk, over a copy's state (ui/reader-state.js, in ui/state.js's place), so it keeps and sends
// nothing and turns nothing on. demo.html#src=<a task's file on this site>, with lang (en), theme (the
// system's), look (tilde), speed (1) and loop if wanted: each request shows whole, then its answer is
// written again as it came (ui/replay.js); a follow-up that is the request coming next plays it at once,
// and with wait, only that does.
import { batch, effect } from '@preact/signals-core'
import { applyUpdate } from '../core/events.js'
import { dir } from '../core/i18n.js'
import { configureCapabilities } from './caps.js'
import { declared, WIDGETS } from './markdown.js'
import { styleSheet } from './sheet.js'
import { PACE, exchanges, requestOf, words, beats } from './replay.js'

/** @import { Envelope } from '../core/types.js' */
/** @import { Turn } from '../core/events.js' */

const params = new URLSearchParams(location.hash.slice(1))
const root = document.documentElement
root.lang = params.get('lang') || 'en'
root.dir = dir(root.lang)
const look = params.get('look') ?? 'tilde'
if (look !== 'room' && /^[a-z]+$/.test(look)) {
  root.dataset.look = look
  await styleSheet(new URL(`looks/${look}.css`, import.meta.url))
}
// Its widgets draw (D196); what else the conversation would turn on needs the room's own files.
declared.value = new Set(Object.keys(WIDGETS))
configureCapabilities({ deny: ['made', 'receipt', 'compact', 'plan'], remember: () => {} })
const { app, theme, sent } = await import('./reader-state.js')
await import('./chat.js')
const chosen = params.get('theme')
if (chosen === 'light' || chosen === 'dark') theme.value = chosen
effect(() => { root.dataset.theme = theme.value })

const response = await fetch(new URL(params.get('src') ?? '', location.href))
if (!response.ok) throw new Error(`demo: ${response.status} for ${params.get('src')}`)
/** @type {any[]} */
const lines = (await response.text()).split('\n').flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
const header = lines[0]?.kind === 'conversation' ? lines.shift() : null
const speed = Math.max(Number(params.get('speed')) || 1, 0.1)
const cut = matchMedia('(prefers-reduced-motion: reduce)').matches ? (/** @type {string} */ text) => [text] : words(root.lang)
const wait = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms / speed))

/** A moment, or less once the page sends the request coming next. @param {number} ms @param {string} request */
const pause = (ms, request) => new Promise((resolve) => {
  sent.value = null
  const done = () => { clearTimeout(timer); stop(); resolve(undefined) }
  const timer = ms < Infinity ? setTimeout(done, ms / speed) : 0
  const stop = effect(() => { if (request && sent.value?.text === request) done() })
})

/** Records shown now, kept as of now, as the room keeps what it is told. @param {Envelope[]} added */
function show(added) {
  const at = new Date().toISOString()
  app.current.value = { id: String(header?.id ?? ''), path: '', records: [...app.current.peek()?.records ?? [], ...added.map((record) => ({ ...record, at }))] }
}

do {
  app.current.value = null
  for (const [index, { said, answer }] of exchanges(lines).entries()) {
    await pause(!index ? PACE.start : params.has('wait') ? Infinity : PACE.read, requestOf(said))
    show(said)
    if (!answer.length) continue
    app.busy.value = true
    /** @type {Turn} */
    const turn = { user: null, notes: [], steps: [], at: new Date().toISOString() }
    for (const { update, step, hold } of beats(answer, cut)) {
      applyUpdate(turn, update, step)
      app.live.value = { turn, steers: [] }
      await wait(hold)
    }
    batch(() => { show(answer); app.live.value = null; app.busy.value = false })
  }
  if (params.has('loop')) await wait(PACE.read)
} while (params.has('loop'))
