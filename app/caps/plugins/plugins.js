// Plugins (D296): what someone else made to add to what Jean does, read before it is added, and run
// apart. A plugin is a folder, plugins/<name>/ at the root: its plugin.json (manifest.js) and the module
// it names, kept as they came, beside data.json, what it keeps for itself. Each one turned on runs in a
// sandbox of its own (plugin-worker.js), an opaque frame with no network, which only messages reach:
// its hooks join Jean's events as the user's tier (D293) and count only within the rights granted when
// it was added; what it draws (above the box, under an answer, in its row here) is a tree of Jean's
// elements, which Jean draws. It never sees a key, a file of the user's or an address of Jean's. One
// that keeps failing is turned off, and with ?safe in the address none runs (D307).
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register } from '../../ui/caps.js'
import { app, effective, updateSettings, notify } from '../../ui/state.js'
import { markdown } from '../../ui/markdown.js'
import { styleSheet } from '../../ui/sheet.js'
import { icons } from '../../ui/icons.js'
import { join, readJSON, writeJSON } from '../../core/fs.js'
import { STRICT } from '../../core/rules.js'
import { t, useStrings, locale } from '../../core/i18n.js'
import { readManifest, shownIn, baseOf, EVENTS } from './manifest.js'

await Promise.all([useStrings('plugins'), styleSheet(new URL('plugins.css', import.meta.url))])

/** @typedef {import('./manifest.js').Manifest} Manifest */
/** @typedef {import('../../core/hooks.js').Hook} Hook */
/**
 * A plugin running: its frame, what it hooks and draws, and what waits on it: answers by id, and the
 * rest of the chain an event's next asks for, which holds the plugin's own time still; and how many
 * times it failed in this visit.
 * @typedef {{ manifest: Manifest, frame: HTMLIFrameElement, hooks: Hook[], slots: string[], stop: () => void, failed: number,
 *   calls: Map<string, (data: any) => void>, nexts: Map<string, (e: any) => Promise<any>>, still: Map<string, (still: boolean) => void> }} Host
 */

const DIR = 'plugins'
// A plugin answers an event, or draws, within this long, not counting its waits on Jean; or Jean goes on without it.
const PATIENCE = 5000
// The largest module a plugin may have.
const LARGEST = 1_000_000
// A plugin whose hooks or drawings fail, or go unanswered, this many times in a visit is turned off.
const FAILURES = 3
// The most of Jean's elements a plugin's drawing has.
const ELEMENTS = 500

/** The plugins added, as their manifests say. */
const installed = signal(/** @type {Manifest[]} */ ([]))
/** Those running, by name. */
const running = signal(/** @type {Map<string, Host>} */ (new Map()))
/** What each plugin drew, by its name, slot and key: null while it draws. */
const trees = signal(/** @type {Map<string, any>} */ (new Map()))
/** Safe mode: with ?safe in the address, no plugin runs until the user leaves it (D307). */
const safe = signal(new URLSearchParams(location.search).has('safe'))
/** The plugin just added, whose row opens to show what it draws there. */
const opened = signal('')
/** A plugin read from an address, shown before it is added. */
const reading = signal(/** @type {{ manifest?: Manifest, json?: string, code?: string, base?: string, failed?: string } | null} */ (null))
const worker = fetch(new URL('plugin-worker.js', import.meta.url)).then((response) => response.text())
let ids = 0

/** @param {Manifest} manifest @param {string} right */
const granted = (manifest, right) => manifest.rights.includes(/** @type {any} */ (right))
/** Whether each plugin is on, on this device, and whether it was turned off for failing. @returns {Record<string, { on?: boolean, failed?: boolean }>} */
const switches = () => /** @type {any} */ (effective.value.settings).plugins ?? {}
/** Plain data, as a message carries it. @param {any} value */
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

/** Reads the plugins added. */
async function refresh() {
  const folders = (await app.fs.list(DIR)).filter((entry) => entry.kind === 'directory').map((entry) => entry.name)
  const read = await Promise.all(folders.map(async (name) => {
    try {
      const manifest = readManifest((await app.fs.read(join(DIR, name, 'plugin.json'))) ?? '')
      return manifest.name === name ? manifest : null
    } catch {
      return null
    }
  }))
  installed.value = /** @type {Manifest[]} */ (read.filter(Boolean)).sort((a, b) => (a.name < b.name ? -1 : 1))
}

// ─── Running them, each in a sandbox of its own ──────────────────────────────

/** @param {Host} host @param {any} message */
const post = (host, message) => host.frame.contentWindow?.postMessage(message, '*')

/**
 * Sends a plugin a message that it answers, and waits for the answer: undefined when it takes longer
 * than its patience, the time it waits on Jean not counted. @param {Host} host @param {any} message
 */
function call(host, message) {
  const id = message.id ?? `c${++ids}`
  return new Promise((resolve) => {
    let timer = 0
    const done = (/** @type {any} */ data) => {
      clearTimeout(timer)
      host.calls.delete(id)
      host.still.delete(id)
      resolve(data)
    }
    host.still.set(id, (still) => {
      clearTimeout(timer)
      if (!still) timer = setTimeout(() => done(undefined), PATIENCE)
    })
    host.calls.set(id, done)
    host.still.get(id)?.(false)
    post(host, { ...message, id })
  })
}

/** Starts a plugin turned on: its frame, its module, then what it hooks and draws. @param {Manifest} manifest */
async function start(manifest) {
  const frame = document.createElement('iframe')
  // Scripts, but an opaque origin: never with allow-same-origin (AGENTS.md).
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.hidden = true
  /** @type {Host} */
  const host = { manifest, frame, hooks: [], slots: [], stop: () => {}, failed: 0, calls: new Map(), nexts: new Map(), still: new Map() }
  const hear = (/** @type {MessageEvent} */ { source, data }) => { if (source === frame.contentWindow && data) heard(host, data) }
  host.stop = () => {
    removeEventListener('message', hear)
    frame.remove()
    for (const done of host.calls.values()) done(undefined)
  }
  addEventListener('message', hear)
  // Running from now on, so a second look doesn't start it again; stopped meanwhile, it goes no further.
  running.value = new Map(running.peek()).set(manifest.name, host)
  const code = await app.fs.read(join(DIR, manifest.name, manifest.main))
  // Its module goes in once the sandbox has started the worker that runs it.
  const booted = new Promise((resolve) => frame.addEventListener('load', async () => resolve(post(host, { type: 'boot', source: await worker })), { once: true }))
  frame.src = new URL('../../sandbox.html', import.meta.url).href
  document.body.append(frame)
  await booted
  if (running.peek().get(manifest.name) !== host) return host.stop()
  const started = await call(host, { type: 'start', code: code ?? '' })
  if (started?.type !== 'started') {
    console.warn('Plugin', manifest.name, started?.error ?? 'did not start')
    stop(manifest.name)
    return notify(t('plugins.failed', { title: shownIn(manifest, locale.peek()).title }))
  }
  // Only the events a plugin may hook, and only once it may watch them.
  host.hooks = granted(manifest, 'watch') ? started.hooks.flatMap((/** @type {any} */ hook, /** @type {number} */ index) => (EVENTS.includes(hook.on) ? [proxy(host, index, hook)] : [])) : []
  host.slots = granted(manifest, 'draw') ? started.slots : []
  running.value = new Map(running.peek())
}

/** @param {string} name */
function stop(name) {
  running.peek().get(name)?.stop()
  const left = new Map(running.peek())
  left.delete(name)
  running.value = left
  forget(name)
}

/** Counts a plugin's failure, and turns it off at the last one, saying so; stopped meanwhile, it no longer counts. @param {Host} host */
function failing(host) {
  if (++host.failed !== FAILURES || running.peek().get(host.manifest.name) !== host) return
  updateSettings(/** @type {any} */ ({ plugins: { ...switches(), [host.manifest.name]: { on: false, failed: true } } }))
  notify(t('plugins.off', { title: shownIn(host.manifest, locale.peek()).title }))
}

/** Runs the plugins turned on again, leaving safe mode without reloading. */
function leaveSafe() {
  const url = new URL(location.href)
  url.searchParams.delete('safe')
  history.replaceState(history.state, '', url)
  safe.value = false
}

/** What a plugin drew, to draw again. @param {string} name */
const forget = (name) => { trees.value = new Map([...trees.peek()].filter(([key]) => !key.startsWith(`${name} `))) }

/** A message from a plugin's sandbox. @param {Host} host @param {any} data */
function heard(host, data) {
  const { manifest } = host
  if (data.type === 'next') {
    const still = host.still.get(data.event)
    still?.(true)
    Promise.resolve(host.nexts.get(data.event)?.(data.e)).then((value) => post(host, { type: 'answer', id: data.id, value }),
      (error) => post(host, { type: 'answer', id: data.id, error: String(error?.message ?? error) })).finally(() => still?.(false))
  } else if (data.type === 'store') keep(host, data)
  else if (data.type === 'notify' && granted(manifest, 'notify')) notify(t('plugins.says', { title: shownIn(manifest, locale.peek()).title, text: String(data.text).slice(0, 300) }))
  else if (data.type === 'redraw' && granted(manifest, 'draw')) forget(manifest.name)
  else host.calls.get(data.id)?.(data)
}

/** Each plugin's reads and writes of its data, one after the other, so that none is lost. */
const keeping = new Map()

/** What a plugin keeps for itself, in its folder's data.json: a value read, or set. @param {Host} host @param {{ id: string, key: string, value?: any }} asked */
function keep(host, { id, key, value }) {
  const path = join(DIR, host.manifest.name, 'data.json')
  const turn = (keeping.get(path) ?? Promise.resolve()).then(async () => {
    const data = await readJSON(app.fs, path, {})
    if (value !== undefined) await writeJSON(app.fs, path, { ...data, [String(key)]: value })
    post(host, { type: 'answer', id, value: value ?? data[String(key)] ?? null })
  }).catch((/** @type {unknown} */ error) => console.warn('Plugin', host.manifest.name, error))
  keeping.set(path, turn)
}

/**
 * One of a plugin's hooks, in Jean's chain: the event goes to its sandbox as plain data, its next(e)
 * goes on with the event (a changed one only with the right to change), and what it answers counts only
 * within its rights; nothing in time, or a failure, and Jean goes on as without it.
 * @param {Host} host @param {number} index @param {{ on: string, match?: any }} hook @returns {Hook}
 */
function proxy(host, index, { on, match }) {
  return {
    on, tier: 'user', by: host.manifest.name,
    ...(match && typeof match === 'object' && { match: Object.fromEntries(Object.entries(match).filter(([, value]) => value === null || typeof value !== 'object' || Array.isArray(value))) }),
    run: async (e, next) => {
      const id = `e${++ids}`
      const sent = plain(e)
      const before = JSON.stringify(sent)
      /** @type {{ gave?: any, given?: string, threw?: unknown }} */
      const went = {}
      host.nexts.set(id, async (changed) => {
        try {
          went.gave = await next(JSON.stringify(changed) === before || !granted(host.manifest, 'change') ? e : { ...e, ...changed })
        } catch (error) {
          went.threw = error
          throw error
        }
        went.given = JSON.stringify(plain(went.gave))
        return plain(went.gave)
      })
      const data = await call(host, { type: 'event', id, hook: index, e: sent }).finally(() => host.nexts.delete(id))
      if ('threw' in went) throw went.threw
      if (data?.type !== 'done') {
        console.warn('Plugin', host.manifest.name, on, data?.error ?? 'took too long')
        failing(host)
      }
      if (data?.type === 'done' && JSON.stringify(data.result) !== went.given && allowed(host.manifest, on, e, data.result, went.gave)) return data.result
      return 'gave' in went ? went.gave : next(e)
    },
  }
}

/**
 * Whether what a plugin answered is within its rights: a decision more careful is refuse's, a looser one
 * loosen's (never past a rule the organisation set), any other answer change's.
 * @param {Manifest} manifest @param {string} on @param {any} e @param {any} result @param {any} gave what the chain gave it, if it went on
 */
function allowed(manifest, on, e, result, gave) {
  if (on !== 'tool.check') return granted(manifest, result?.refuse ? 'refuse' : 'change')
  const now = result?.refuse ? STRICT.never : STRICT[/** @type {'allow'} */ (result?.decision)]
  if (now === undefined) return false
  const was = gave ? STRICT[/** @type {'allow'} */ (gave.decision)] ?? STRICT.never : undefined
  if (now > (was ?? STRICT.allow)) return granted(manifest, 'refuse')
  if (now < (was ?? STRICT.never)) return granted(manifest, 'loosen') && !app.policy.rules?.[e.kind]
  return true
}

// ─── What they draw ──────────────────────────────────────────────────────────

/** What a plugin draws in a slot, under a key: asked the first time it shows, and again once it says to redraw. @param {Host} host @param {string} slot @param {any} props @param {string} [key] */
function drawn(host, slot, props, key = '') {
  const at = `${host.manifest.name} ${slot} ${key}`
  const tree = trees.value.get(at)
  if (tree === undefined) {
    trees.peek().set(at, null)
    call(host, { type: 'draw', slot, props: plain(props) }).then((data) => {
      if (data?.type !== 'drawn') failing(host)
      trees.value = new Map(trees.peek()).set(at, data?.type === 'drawn' ? data.tree : null)
    })
  }
  return element(host, tree ?? null)
}

/**
 * A tree a plugin drew, as Jean's own elements: text, a button whose press goes back to it, a row, and
 * Markdown as answers have it (no picture is ever loaded); anything else, and what goes past ELEMENTS,
 * is left out. @param {Host} host @param {any} node @param {{ left: number }} [count]
 * @returns {unknown}
 */
function element(host, node, depth = 0, count = { left: ELEMENTS }) {
  if (node === null || node === undefined || depth > 8 || --count.left < 0) return nothing
  if (typeof node === 'string' || typeof node === 'number') return html`<span dir="auto">${String(node)}</span>`
  if (Array.isArray(node)) return node.slice(0, 50).map((child) => element(host, child, depth + 1, count))
  if (typeof node !== 'object') return nothing
  if ('row' in node) return html`<div class="row">${element(host, node.row, depth + 1, count)}</div>`
  if ('markdown' in node) return html`<div class="prose" dir="auto">${markdown(String(node.markdown))}</div>`
  if ('button' in node) return html`<button type="button" class="button subtle" @click=${() => post(host, { type: 'press', action: String(node.action ?? '') })}>${String(node.button)}</button>`
  if ('text' in node) return html`<span dir="auto" class=${node.muted ? 'muted' : ''}>${String(node.text)}</span>`
  return nothing
}

/** The plugins running that draw in a slot. @param {string} slot */
const drawing = (slot) => [...running.value.values()].filter((host) => host.slots.includes(slot))

// ─── Settings › Plugins ──────────────────────────────────────────────────────

/** Reads a plugin from an address, to show before it is added. @param {SubmitEvent} event */
async function look(event) {
  event.preventDefault()
  const address = String(new FormData(/** @type {HTMLFormElement} */ (event.target)).get('address') ?? '').trim()
  const base = baseOf(address)
  if (!base) return void (reading.value = { failed: 'address' })
  reading.value = { base }
  try {
    const json = await fetch(new URL('plugin.json', base)).then((response) => (response.ok ? response.text() : Promise.reject(new Error('fetch'))))
    const manifest = readManifest(json)
    const code = await fetch(new URL(manifest.main, base)).then((response) => (response.ok ? response.text() : Promise.reject(new Error('fetch'))))
    if (code.length > LARGEST) throw new Error('size')
    reading.value = { manifest, json, code, base }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    reading.value = { base, failed: ['json', 'format', 'name', 'main', 'rights', 'size'].includes(code) ? code : 'fetch' }
  }
}

/** Adds the plugin read, as it came, and turns it on: added again, it takes the earlier one's place and keeps its data. */
async function add() {
  const { manifest, json, code } = reading.peek() ?? {}
  if (!manifest || !json || code === undefined) return
  // The one it replaces stops, and starts again as the new one, with the rights granted now.
  stop(manifest.name)
  await app.fs.write(join(DIR, manifest.name, 'plugin.json'), json)
  await app.fs.write(join(DIR, manifest.name, manifest.main), code)
  reading.value = null
  opened.value = manifest.name
  await refresh()
  await updateSettings(/** @type {any} */ ({ plugins: { ...switches(), [manifest.name]: { on: true } } }))
  notify(t('plugins.added', { title: shownIn(manifest, locale.peek()).title }))
}

/** @param {Manifest} manifest @param {boolean} on */
const turn = (manifest, on) => updateSettings(/** @type {any} */ ({ plugins: { ...switches(), [manifest.name]: { on } } }))

/** @param {Manifest} manifest */
async function remove(manifest) {
  if (!confirm(t('plugins.confirmRemove', { title: shownIn(manifest, locale.peek()).title }))) return
  stop(manifest.name)
  await app.fs.remove(join(DIR, manifest.name))
  const { [manifest.name]: gone, ...rest } = switches()
  await updateSettings(/** @type {any} */ ({ plugins: rest }))
  await refresh()
}

/** What a plugin asks to do, in plain words, loosening apart. @param {Manifest} manifest */
const rightsOf = (manifest) => html`<ul class="plugin-rights">${manifest.rights.map((right) => html`<li class=${right === 'loosen' ? 'is-loose' : ''}>${t(`plugins.right.${right}`)}</li>`)}</ul>`
/** Its first letter, as its icon. @param {string} title */
const initial = (title) => html`<span class="item-icon" aria-hidden="true">${[...title][0]?.toLocaleUpperCase()}</span>`

/** The card of a plugin read from an address: who made it, where it comes from, what it asks, its code, and Add it. @param {NonNullable<typeof reading.value>} state */
function card({ manifest, code, base, failed }) {
  if (failed) return html`<p class="plugin-card status is-error" role="alert">${t(`plugins.error.${failed}`)}</p>`
  if (!manifest) return html`<p class="plugin-card muted" role="status">${t('plugins.reading')}</p>`
  const { title, description } = shownIn(manifest, locale.value)
  return html`<article class="plugin-card" aria-label=${title}>
    <div class="item">${initial(title)}<span class="item-text"><strong dir="auto">${title}</strong><small dir="auto">${[manifest.version,
      manifest.author && t('plugins.by', { author: manifest.author }), t('plugins.from', { site: new URL(base ?? '').host })].filter(Boolean).join(' · ')}</small></span></div>
    <p dir="auto">${description}</p>
    <div><p class="plugin-label">${t('plugins.asks')}</p>${manifest.rights.length ? rightsOf(manifest) : html`<p class="muted small">${t('plugins.nothing')}</p>`}</div>
    <details><summary>${t('plugins.code')}</summary><pre dir="ltr"><code>${code}</code></pre></details>
    <div class="row">
      <button type="button" class="button primary" @click=${add}>${t('plugins.add')}</button>
      <button type="button" class="button subtle" @click=${() => { reading.value = null }}>${t('plugins.cancel')}</button>
    </div>
  </article>`
}

/**
 * A plugin in Settings' list (D134): its name and what it does, or why it was turned off, its switch
 * beside them; opened, what it draws there, what it may do, its version and maker, and Remove.
 * @param {Manifest} manifest @param {string} lang
 */
function row(manifest, lang) {
  const { title, description } = shownIn(manifest, lang)
  const host = running.value.get(manifest.name)
  const { on, failed } = switches()[manifest.name] ?? {}
  return html`<li><details ?open=${opened.value === manifest.name}>
      <summary>${initial(title)}<span class="item-text"><strong dir="auto">${title}</strong>${failed
        ? html`<small class="is-error">${t('plugins.failing')}</small>` : html`<small dir="auto">${description}</small>`}</span>${icons.chevron}</summary>
      <div class="item-body">
        ${host?.slots.includes('settings') ? html`<div class="plugin-own">${drawn(host, 'settings', {})}</div>` : nothing}
        <div><p class="plugin-label">${t('plugins.may')}</p>${manifest.rights.length ? rightsOf(manifest) : html`<p class="muted small">${t('plugins.nothing')}</p>`}</div>
        <div class="row plugin-foot"><small class="muted" dir="auto">${[manifest.version, manifest.author && t('plugins.by', { author: manifest.author })].filter(Boolean).join(' · ')}</small>
          <button type="button" class="button subtle danger" @click=${() => remove(manifest)}>${icons.trash} ${t('action.remove')}</button></div>
      </div>
    </details>
    <input type="checkbox" class="switch" role="switch" aria-label=${title} .checked=${on === true}
      @change=${(/** @type {Event} */ e) => turn(manifest, /** @type {HTMLInputElement} */ (e.target).checked)}></li>`
}

/** Settings › Plugins: safe mode, if on; the plugins added, as Settings' other lists; then a line to add one, and its card. */
function panel() {
  const lang = locale.value
  return html`<p class="lede">${t('plugins.text')}</p>
    ${safe.value ? html`<div class="status plugin-safe" role="status"><span>${t('plugins.safe')}</span>
      <button type="button" class="button" @click=${leaveSafe}>${t('plugins.leaveSafe')}</button></div>` : nothing}
    <section>
      <h3>${t('plugins.yours')}</h3>
      ${installed.value.length ? html`<ul class="list plugins">${installed.value.map((manifest) => row(manifest, lang))}</ul>`
        : html`<p class="empty muted small">${t('plugins.none')}</p>`}
    </section>
    <section>
      <h3>${t('plugins.adding')}</h3>
      <p class="hint">${t('plugins.addHint')}</p>
      <form class="row plugin-address" @submit=${look}>
        <input name="address" dir="ltr" autocomplete="off" placeholder=${t('plugins.address')} aria-label=${t('plugins.address')}>
        <button class="button">${t('plugins.look')}</button>
      </form>
      ${reading.value ? card(reading.value) : nothing}
    </section>`
}

// Each plugin turned on runs, unless in safe mode; one turned off or removed stops.
effect(() => {
  const on = new Set(safe.value ? [] : installed.value.filter((manifest) => switches()[manifest.name]?.on === true).map((manifest) => manifest.name))
  for (const name of running.peek().keys()) if (!on.has(name)) stop(name)
  for (const manifest of installed.value) if (on.has(manifest.name) && !running.peek().has(manifest.name)) start(manifest).catch((error) => console.warn('Plugin', manifest.name, error))
})

effect(() => register({
  id: 'plugins',
  hooks: [...running.value.values()].flatMap((host) => host.hooks),
  slots: {
    above: { at: 50, draw: () => drawing('above').map((host) => html`<aside class="plugin-above" aria-label=${shownIn(host.manifest, locale.value).title}>${drawn(host, 'above', {})}</aside>`) },
    answer: { at: 50, draw: (/** @type {{ text: string, at: string }} */ { text, at }) => drawing('answer').map((host) => html`<span class="plugin-answer">${drawn(host, 'answer', { text }, at)}</span>`) },
    // A call a plugin decided says so by its title (D299).
    by: { at: 50, draw: (/** @type {{ by: string }} */ { by }) => installed.value.filter((manifest) => manifest.name === by).map((manifest) => shownIn(manifest, locale.value).title)[0] },
    settings: { at: 97, id: 'plugins', label: 'cap.plugins.name', icon: icons.bolt, draw: panel },
  },
}))

refresh()
