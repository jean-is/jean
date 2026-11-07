// An extension's code runs here, in the sandbox (AGENTS.md: code from outside runs only there), a worker of
// an opaque origin with no network, one for each extension (D296). Jean sends its module as text; the
// module's register(on, $) hooks events with on(event, match?, run) and draws with $.slot(name, draw).
// Each event comes as a message; next(e) asks Jean for the rest of the chain; what it draws is a tree of
// Jean's elements, which Jean draws. Nothing else reaches Jean: it holds no key, file or address of Jean's.
//
// → { type: 'start', id, code }           ← { type: 'started', id, hooks: [{ on, match }], slots } | { type: 'failed', id, error }
// → { type: 'event', id, hook, e }        ← { type: 'next', id, e } → { type: 'answer', id, value }…, then { type: 'done', id, result } | { type: 'threw', id, error }
// → { type: 'draw', id, slot, props }     ← { type: 'drawn', id, tree }
// → { type: 'press', action }             ← { type: 'notify', text } | { type: 'redraw' } | { type: 'store', id, key, value? } → { type: 'answer', id, value }
/** @typedef {(e: unknown, next: (e?: unknown) => Promise<unknown>) => unknown} Run */
/** @type {{ on: string, match?: Record<string, unknown>, run: Run }[]} */
const hooks = []
/** @type {Record<string, (props: unknown) => unknown>} */
const draws = {}
/** @type {(action: unknown) => unknown} */
let pressed = () => {}
/** @type {Map<string, { resolve: (value: unknown) => void, reject: (error: Error) => void }>} */
const waiting = new Map()
let asked = 0
/** @param {Record<string, unknown>} message @returns {Promise<unknown>} */
const ask = (message) => new Promise((resolve, reject) => {
  const id = `p${++asked}`
  waiting.set(id, { resolve, reject })
  self.postMessage({ ...message, id })
})
/** @type {{ slot: (name: string, draw: (props: unknown) => unknown) => void, press: (handler: (action: unknown) => unknown) => void, redraw: () => void, notify: (text: unknown) => void, store: { get: (key: string) => Promise<unknown>, set: (key: string, value: unknown) => Promise<unknown> } }} */
const $ = {
  slot: (name, draw) => { draws[name] = draw },
  press: (handler) => { pressed = handler },
  redraw: () => self.postMessage({ type: 'redraw' }),
  notify: (text) => self.postMessage({ type: 'notify', text: String(text) }),
  store: { get: (key) => ask({ type: 'store', key }), set: (key, value) => ask({ type: 'store', key, value }) },
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'start') {
      const module = await import(URL.createObjectURL(new Blob([data.code], { type: 'text/javascript' })))
      await module.register((/** @type {string} */ on, /** @type {Run | Record<string, unknown>} */ match, /** @type {Run} */ run) => { hooks.push(typeof match === 'function' ? { on, run: match } : { on, match, run }) }, $)
      self.postMessage({ type: 'started', id: data.id, hooks: hooks.map(({ on, match }) => ({ on, match })), slots: Object.keys(draws) })
    } else if (data.type === 'event') {
      const result = await hooks[data.hook].run(data.e, (e = data.e) => ask({ type: 'next', event: data.id, e }))
      self.postMessage({ type: 'done', id: data.id, result })
    } else if (data.type === 'draw') self.postMessage({ type: 'drawn', id: data.id, tree: (await draws[data.slot]?.(data.props)) ?? null })
    else if (data.type === 'press') await pressed(data.action)
    else if (data.type === 'answer') {
      const { resolve, reject } = waiting.get(data.id) ?? {}
      waiting.delete(data.id)
      if (data.error) reject?.(new Error(data.error))
      else resolve?.(data.value)
    }
  } catch (error) {
    self.postMessage({ type: data.type === 'start' ? 'failed' : 'threw', id: data.id, error: String(/** @type {Error} */ (error)?.message ?? error) })
  }
}
