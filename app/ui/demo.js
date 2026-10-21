// A demo (D457): a task Jean did, played again in the room's own conversation (ui/chat.js) for a page
// or a talk, over a copy's state (ui/reader-state.js, in ui/state.js's place), so it keeps and sends
// nothing and turns nothing on. demo.html#src=<a task's file on this site>, with lang (en), theme (the
// system's), look (tilde), speed (1) and loop if wanted: each request shows whole, then its answer is
// written again as it came (ui/replay.js); a follow-up that is the request coming next plays it at once,
// and with wait, only that does. With tour, a guided tour's stops show along the way (caps/tour, D460).
// With still, it shows as it ended, at once, and play=<words> puts a button with them that plays it (D462); without
// still, that button comes once it has played (D480);
// bare leaves the task's title out, for a page that frames it. demo.html's first line sets the look, light or dark and bare.
import { batch, effect } from '@preact/signals-core'
import { html, render } from 'lit-html'
import { applyUpdate } from '../core/events.js'
import { dir } from '../core/i18n.js'
import { configureCapabilities } from './caps.js'
import { declared, WIDGETS } from './markdown.js'
import { icons } from './menu-icons.js'
import { PACE, exchanges, requestOf, words, beats } from './replay.js'

/** @import { Envelope } from '../core/types.js' */
/** @import { Turn } from '../core/events.js' */

const params = new URLSearchParams(location.hash.slice(1))
const root = document.documentElement
root.lang = params.get('lang') || 'en'
root.dir = dir(root.lang)
// Its widgets draw (D196); what else the conversation would turn on needs the room's own files.
declared.value = new Set(Object.keys(WIDGETS))
configureCapabilities({ deny: ['made', 'receipt', 'compact', 'plan'], remember: () => {} })
const { app, theme, sent } = await import('./reader-state.js')
await import('./chat.js')
const chosen = root.dataset.theme
if (chosen === 'light' || chosen === 'dark') theme.value = chosen
effect(() => { root.dataset.theme = theme.value })

const speed = Math.max(Number(params.get('speed')) || 1, 0.1)
const response = await fetch(new URL(params.get('src') ?? '', location.href))
if (!response.ok) throw new Error(`demo: ${response.status} for ${params.get('src')}`)
/** Each record's line in the file, as an editor numbers them, which a tour's stops name. @type {Map<any, number>} */
const lineOf = new Map()
/** @type {any[]} */
const lines = (await response.text()).split('\n').flatMap((line, i) => { try { const record = JSON.parse(line); lineOf.set(record, i + 1); return [record] } catch { return [] } })
const header = lines[0]?.kind === 'conversation' ? lines.shift() : null
const tour = params.get('tour') ? await (await import('../caps/tour/tour.js')).load(new URL(String(params.get('tour')), location.href), root.lang, speed) : null
const cut = matchMedia('(prefers-reduced-motion: reduce)').matches ? (/** @type {string} */ text) => [text] : words(root.lang)
const wait = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms / speed))

/** A moment, or less once the page sends the request coming next, as a tour's stop may have had it do already. @param {number} ms @param {string} request */
async function pause(ms, request) {
  let [timer, stop] = [0, () => {}]
  await new Promise((resolve) => {
    if (ms < Infinity) timer = setTimeout(resolve, ms / speed)
    stop = effect(() => { if (request && sent.value?.text === request) resolve(undefined) })
  })
  clearTimeout(timer)
  stop()
  sent.value = null
}

/** The tour's stops just before these records play, and whether there were any. @param {Envelope[]} records */
async function stops(records) {
  let any = false
  for (const record of records) any = (await tour?.at(lineOf.get(record))) || any
  return any
}

/** Records shown now, kept as of now, as the room keeps what it is told. @param {Envelope[]} added */
function show(added) {
  const at = new Date().toISOString()
  app.current.value = { id: String(header?.id ?? ''), path: '', records: [...app.current.peek()?.records ?? [], ...added.map((record) => ({ ...record, at }))] }
}

/** The task played again as it came, a tour's stops along the way. */
async function play() {
  app.current.value = null
  for (const [index, { said, answer }] of exchanges(lines).entries()) {
    const stopped = await stops(said)
    await pause(!index ? PACE.start : params.has('wait') ? Infinity : stopped ? 0 : PACE.read, requestOf(said))
    show(said)
    if (!answer.length) continue
    app.busy.value = true
    /** @type {Turn} */
    const turn = { user: null, notes: [], steps: [], at: new Date().toISOString() }
    const started = new Set()
    for (const { update, step, hold, record } of beats(answer, cut)) {
      if (!started.has(record) && started.add(record)) await stops([record])
      applyUpdate(turn, update, step)
      app.live.value = { turn, steers: [] }
      if (update.sessionUpdate === 'tool_call' && update.status === 'in_progress') await tour?.at(update.toolCallId)
      await wait(hold)
    }
    batch(() => { show(answer); app.live.value = null; app.busy.value = false })
  }
  await tour?.at('end')
}

// With play, a button with its words plays it again: at once when still, else once it has played (a page's tour, D480).
const label = params.get('play')
const button = label ? document.body.appendChild(Object.assign(document.createElement('button'), { className: 'button primary demo-play', hidden: !params.has('still') })) : null
if (params.has('still')) show(lines)
if (button) {
  render(html`${icons.play}<span dir="auto">${label}</span>`, button)
  button.addEventListener('click', async () => {
    button.hidden = true
    await play()
    button.hidden = false
  })
}
// Framed in a page's popover (a tour, D480), Esc here closes it, as it would from the page.
addEventListener('keydown', (event) => event.key === 'Escape' && /** @type {HTMLElement | null | undefined} */ (frameElement?.closest('[popover]'))?.hidePopover())
while (!params.has('still')) {
  await play()
  if (!params.has('loop')) break
  await wait(PACE.read)
}
if (button) button.hidden = false
