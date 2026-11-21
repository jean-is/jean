// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a deck's ```table block shows a collection of its project, read again at each resolution, the
// journal's head (live), and drawn again as the collection changes while it shows; the reader's right to it is asked each time (./refs.js).
// The pane's head says, for a collection, a deck or a document, which creations it uses and which use it. Loaded with Tables.
import { html, render, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, isDenied } from '../../ui/caps.js'
import { app, openFile } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { t, useStrings, locale, intlLocales } from '../../core/i18n.js'
import { PLACE } from '../tables/table.js'
import { parseRef, refsIn, loops, refused, tableOf } from './refs.js'

await useStrings('compose')

/** @import { Edge } from './refs.js' */
/** The kinds that hold references, each by its folder, which files are its own, and its Markdown and name read from one. @type {[string, RegExp, (path: string, dir: string) => Promise<{ source: string, name: string } | null>][]} */
const CONSUMERS = [['decks', /\.deck\.html$/, async (path, dir) => (await import('../skills/decks.js')).load(path, dir)],
  ['documents', /^[^.].*\.md$/, async (path, dir) => ((text) => text ? { source: text, name: /^name: *(.+)$/m.exec(text)?.[1] ?? /^# (.+)$/m.exec(text)?.[1] ?? path } : null)(await app.fs.read(`${dir}/${path}`))]]

/** The project's graph, read again at most once a second, as a deck draws each of its blocks at once: each reference, and each creation's name by its place. */
let read = { at: 0, dir: '', graph: /** @type {Promise<{ edges: Edge[], names: Map<string, string> }> | null} */ (null) }
function graph(dir = app.projectDir) {
  if (read.dir !== dir || Date.now() - read.at > 1000) read = { at: Date.now(), dir, graph: (async () => {
    const tables = await import('../tables/tables.js'), names = new Map((await tables.collections(dir)).map((one) => [one.folder, one.name])), edges = /** @type {Edge[]} */ ([])
    for (const [folder, own, readOf] of CONSUMERS) for (const { name } of (await app.fs.list(`${dir}/${folder}`).catch(() => [])).filter((entry) => entry.kind === 'file' && own.test(entry.name))) {
      const path = `${folder}/${name}`, one = await readOf(path, dir).catch(() => null)
      if (one) names.set(path, one.name), edges.push(...refsIn(one.source).map((ref) => ({ from: path, to: ref.place, at: ref.at })))
    }
    return { edges, names }
  })() }
  return /** @type {NonNullable<typeof read.graph>} */ (read.graph)
}

/**
 * A deck's `table` block drawn (Slides' `BLOCKS`): the collection it names, read now and as it changes while the block shows, as its recipe
 * shows it, or why it can't be shown here. @param {HTMLElement} box @param {string} source
 */
export async function drawn(box, source) {
  const ref = parseRef(source), slides = /** @type {{ file?: { path: string } | null } | null} */ (box.closest('app-slides')), dir = app.projectDir
  const shared = !slides?.file && Boolean(app.current.peek()?.records.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'shared'))
  const tables = ref && !isDenied('tables') && !shared ? await import('../tables/tables.js') : null, one = ref && tables && await tables.load(ref.place, dir).catch(() => null)
  const why = refused({ denied: isDenied('tables'), shared, loop: Boolean(ref && slides?.file && loops((await graph(dir)).edges, slides.file.path, ref.place)), found: Boolean(one) })
  if (why || !ref || !one || !tables) return void render(html`<p class="deck-words">${t(`compose.${why || 'missing'}`)}</p>`, box)
  const where = signal(one), holds = /** @type {(() => void)[]} */ ([]), how = { locales: intlLocales(locale.peek()), labels: { yes: '✓', no: '' }, today: new Date() }
  tables.watched(where, holds)
  const stop = effect(() => {
    const now = where.value
    if (!box.isConnected && box.querySelector('table')) return void (stop?.(), holds.forEach((hold) => hold()))
    const [heads = [], ...rows] = now ? tableOf(now, ref.recipe, how) : []
    render(html`<table><thead><tr>${heads.map((head) => html`<th dir="auto">${head}</th>`)}</tr></thead><tbody>${rows.map((row) => html`<tr>${row.map((cell) => html`<td dir="auto">${cell}</td>`)}</tr>`)}</tbody></table>`, box)
  })
}

/** Which version a reference reads, in words. @param {Edge['at']} at */
const which = (at) => t(`compose.${at}`)
/** What the pane's head lists for each place, once its links are read. */
const links = signal(/** @type {Map<string, { uses: Edge[], usedIn: Edge[], names: Map<string, string> }>} */ (new Map()))

/** The pane's head, for a collection, a deck or a document: a button whose menu lists what it uses and what uses it, each opening it. @param {{ uri: string }} file */
function head({ uri }) {
  if (!PLACE.test(uri) && !CONSUMERS.some(([folder, own]) => uri.startsWith(`${folder}/`) && own.test(uri.slice(folder.length + 1)))) return nothing
  const id = `links-${uri}`, these = links.value.get(uri), row = (/** @type {string} */ place, /** @type {Edge['at']} */ at) => html`<li><button type="button" popovertarget=${id} popovertargetaction="hide"
    @click=${() => openFile({ type: 'resource_link', uri: place, name: these?.names.get(place) ?? place })}><span dir="auto">${these?.names.get(place) ?? place}</span><span class="menu-heading">${which(at)}</span></button></li>`
  const group = (/** @type {string} */ key, /** @type {Edge[]} */ edges, /** @type {'to' | 'from'} */ end) => (edges.length ? html`<div role="group" aria-label=${t(key)}><p class="menu-heading" aria-hidden="true">${t(key)}</p>
    <ul>${edges.map((edge) => row(edge[end], edge.at))}</ul></div>` : nothing)
  return html`<button class="icon-button" popovertarget=${id} aria-label=${t('compose.links')}>${icons.layers}</button>
    <div id=${id} class="menu out-menu" popover @toggle=${(/** @type {ToggleEvent} */ event) => event.newState === 'open' && graph().then(({ edges, names }) => {
      links.value = new Map(links.peek()).set(uri, { uses: edges.filter((edge) => edge.from === uri && names.has(edge.to)), usedIn: edges.filter((edge) => edge.to === uri), names })
    })}>${these ? html`${group('compose.uses', these.uses, 'to')}${group('compose.usedIn', these.usedIn, 'from')}${these.uses.length + these.usedIn.length ? nothing : html`<p class="menu-heading">${t('compose.none')}</p>`}` : nothing}</div>`
}

register({ id: 'compose', slots: { head: { at: 1, draw: head } } })
