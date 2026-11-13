// SPDX-License-Identifier: MIT
// This computer's browser in the pane (D746): once This computer's bridge has found Chrome, Edge, Chromium or Brave, the sites
// the pane opens show in that browser's tab, drawn as it draws, and the person's pointer, wheel and keys go to it, with what an
// input method or a paste makes. Its address, title and history are the tab's own, which a framed site hides (D140), and no
// site refuses it. A field over the picture takes the input: ⌘ and F6 stay the browser's and Jean's, everything else is the page's.
import { signal, computed } from '@preact/signals-core'
import { bridge, drive, screen } from '../machine/machine.js'
export { allowed } from '../machine/machine.js'
import { parseSSE } from '../../core/sse.js'

/** Whether the pane's sites show there. */
export const on = computed(() => bridge.value.on && bridge.value.browser)
/** What its tab shows. */
export const shown = signal({ url: '', title: '', loading: false, back: false, forward: false })

const picture = Object.assign(document.createElement('canvas'), { className: 'browser-remote' })
const field = Object.assign(document.createElement('textarea'), { className: 'browser-input', spellcheck: false, autocapitalize: 'off' })
const surface = Object.assign(document.createElement('div'), { className: 'browser-surface' })
surface.append(picture, field)

/** Opens an address in its tab. @param {string} url */
export const open = (url) => drive({ action: 'open', url })
/** @param {'back' | 'forward' | 'reload'} way */
export const go = (way) => drive({ action: way })

/** @type {AbortController | null} */
let watching = null
/** The tab's picture for the pane, watched while it shows. */
export function view() { if (!watching) watch(); return surface }

/** The tab's frames and what it shows, until the picture leaves the page or the bridge ends. */
async function watch() {
  const stop = (watching = new AbortController())
  const gone = setInterval(() => surface.isConnected || stop.abort(), 2000)
  try {
    const res = await screen(stop.signal)
    for await (const { event, data } of parseSSE(/** @type {ReadableStream<Uint8Array>} */ (res.body))) {
      if (event === 'page') field.title = (shown.value = JSON.parse(data)).title || shown.value.url
      else if (event === 'frame') draw(JSON.parse(data).data)
    }
  } catch {}
  clearInterval(gone)
  if (watching === stop) watching = null
}

let drawing = Promise.resolve()
/** A frame, a JPEG in base64, drawn once the one before it is. @param {string} data */
const draw = (data) => (drawing = drawing.then(async () => {
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }))
  if (picture.width !== bitmap.width || picture.height !== bitmap.height) Object.assign(picture, { width: bitmap.width, height: bitmap.height })
  picture.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()
}).catch(() => {}))

// ─── The person's own input ─────────────────────────────────────────────────

let queue = Promise.resolve()
/** What the person did, sent in order. @param {Record<string, unknown>} args */
const send = (args) => { queue = queue.then(() => drive(args)).then(() => {}, () => {}) }
/** @type {Record<string, unknown> | null} the pointer's last move while one is on its way */
let moved = null
const modifiers = (/** @type {MouseEvent | KeyboardEvent} */ e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
const mouse = (/** @type {MouseEvent} */ e, /** @type {string} */ event) => ({ action: 'pointer', event, x: e.offsetX, y: e.offsetY, button: ['left', 'middle', 'right'][e.button], clicks: e.detail || 1, modifiers: modifiers(e) })

field.addEventListener('mousedown', (e) => { e.preventDefault(); field.focus(); send(mouse(e, 'down')) })
field.addEventListener('mouseup', (e) => send(mouse(e, 'up')))
field.addEventListener('mousemove', (e) => {
  if (!moved) queue = queue.then(() => { const args = moved; moved = null; return args && drive(args) }).then(() => {}, () => {})
  moved = mouse(e, 'move')
})
// A wheel's lines are about 16 pixels each.
field.addEventListener('wheel', (e) => { e.preventDefault(); send({ action: 'wheel', x: e.offsetX, y: e.offsetY, dx: e.deltaX * (e.deltaMode === 1 ? 16 : 1), dy: e.deltaY * (e.deltaMode === 1 ? 16 : 1) }) }, { passive: false })
field.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229 || e.key === 'Dead' || e.metaKey || e.key === 'F6') return
  e.preventDefault()
  send({ action: 'press', key: e.key, code: e.code, keyCode: e.keyCode, text: e.key === 'Enter' ? '\r' : e.key.length === 1 && !e.ctrlKey && !e.altKey ? e.key : '', modifiers: modifiers(e) })
})
// What an input method, dictation or a dead key made, once made, whichever says it first; and what is pasted.
const typed = () => { if (field.value) send({ action: 'text', text: field.value }); field.value = '' }
field.addEventListener('compositionend', typed)
field.addEventListener('input', (e) => { if (!(/** @type {InputEvent} */ (e).isComposing)) typed() })
field.addEventListener('paste', (e) => { e.preventDefault(); if (e.clipboardData?.getData('text/plain')) send({ action: 'text', text: e.clipboardData.getData('text/plain') }) })

// The tab takes the picture's size, in its pixels and the screen's.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let sizing
let sized = ''
new ResizeObserver(([{ contentRect: { width, height } }]) => {
  if (!width || !height || sized === (sized = `${Math.round(width)}×${Math.round(height)}×${devicePixelRatio}`)) return
  clearTimeout(sizing)
  sizing = setTimeout(() => send({ action: 'size', width, height, scale: devicePixelRatio }), 150)
}).observe(surface)
