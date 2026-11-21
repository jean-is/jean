// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a consumer's ```table block (a slide's, a document's) or a site's table that says `data-from`
// shows a collection of its project: the journal's head (live), its latest version (published) or one version (pinned), read again at each
// resolution, the reader's right asked each time (./refs.js), and drawn again as the collection changes while it shows. A collection's
// versions (./versions.js) are made when its author publishes one or its columns change, never on a row's change. The pane's head says, for a
// collection, slides or a document, what it uses and what uses it, which version each reads, and for a collection its versions and what
// changed since the last. Loaded with Tables.
import { html, render, nothing } from 'lit-html'
import { keyed } from 'lit-html/directives/keyed.js'
import { signal, effect } from '@preact/signals-core'
import { register, isDenied } from '../../ui/caps.js'
import { app, openFile, notify } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { t, useStrings, locale, intlLocales } from '../../core/i18n.js'
import { PLACE } from '../tables/table.js'
import { parseRef, refsIn, loops, refused, versionless, tableOf, withAt, filledPage } from './refs.js'
import { versionOf, loadedOf, reshaped, breaks, current } from './versions.js'

await useStrings('compose')

/** @import { Edge, Ref } from './refs.js' */
/** @import { Version } from './versions.js' */
/** @typedef {Awaited<ReturnType<typeof import('../tables/tables.js').load>>} Loaded */
/** The kinds that hold references, by folder: which entries are their own, and the text and name read from one. @type {[string, RegExp, (path: string, dir: string) => Promise<{ source: string, name: string } | null>][]} */
const CONSUMERS = [['decks', /\.deck\.html$/, async (path, dir) => (await import('../skills/decks.js')).load(path, dir)],
  ['documents', /^[^.].*\.md$/, async (path, dir) => ((text) => (text ? { source: text, name: /^name: *(.+)$/m.exec(text)?.[1] ?? /^# (.+)$/m.exec(text)?.[1] ?? path } : null))(await app.fs.read(`${dir}/${path}`))],
  ['sites', /^[^.][^.]*$/, async (path, dir) => ((record) => record && Promise.all(record.files.filter((/** @type {string} */ file) => file.endsWith('.html')).map((/** @type {string} */ file) => app.fs.read(`${dir}/${path}/${file}`)))
    .then((pages) => ({ source: pages.join('\n'), name: record.name })))(JSON.parse((await app.fs.read(`${dir}/${path}/site.json`)) ?? 'null'))]]
const HOW = () => ({ locales: intlLocales(locale.peek()), labels: { yes: '✓', no: '' }, today: new Date() })

/** The project's graph, read again at most once a second, as slides draw each of their blocks at once: each reference, and each creation's name by its place. */
let read = { at: 0, dir: '', graph: /** @type {Promise<{ edges: Edge[], names: Map<string, string> }> | null} */ (null) }
function graph(dir = app.projectDir) {
  if (read.dir !== dir || Date.now() - read.at > 1000) read = { at: Date.now(), dir, graph: (async () => {
    const tables = await import('../tables/tables.js'), names = new Map((await tables.collections(dir)).map((one) => [one.folder, one.name])), edges = /** @type {Edge[]} */ ([])
    for (const [folder, own, readOf] of CONSUMERS) for (const { name } of (await app.fs.list(`${dir}/${folder}`).catch(() => [])).filter((entry) => own.test(entry.name))) {
      const path = `${folder}/${name}`, one = await readOf(path, dir).catch(() => null)
      if (one) names.set(path, one.name), edges.push(...refsIn(one.source).map((ref, index) => ({ from: path, to: ref.place, at: ref.at, recipe: ref.recipe, index })))
    }
    return { edges, names }
  })() }
  return /** @type {NonNullable<typeof read.graph>} */ (read.graph)
}

/** A collection's versions, the first first. @param {string} dir @param {string} folder @returns {Promise<Version[]>} */
const versionsOf = async (dir, folder) => (await Promise.all((await app.fs.list(`${dir}/${folder}/versions`).catch(() => [])).filter((entry) => /^\d+\.json$/.test(entry.name))
  .map(async (entry) => JSON.parse((await app.fs.read(`${dir}/${folder}/versions/${entry.name}`)) ?? 'null')))).filter(Boolean).sort((a, b) => a.n - b.n)

/**
 * What a reference shows of a collection loaded, at the version it reads, its recipe's old names read as the columns are named now; or why it
 * shows nothing. @param {Ref} ref @param {NonNullable<Loaded>} live @param {string} dir @returns {Promise<{ why?: string, rows?: string[][], old?: [string, string][] }>}
 */
async function resolved(ref, live, dir) {
  const versions = await versionsOf(dir, ref.place), version = ref.at === 'published' ? versions.at(-1) : versions.find((one) => one.n === ref.at)
  if (ref.at !== 'live' && !version) return { why: versionless(ref.at) }
  const base = version ? loadedOf(version) : live, { table, recipe, old } = current(base.table, versions, ref.recipe)
  try { return { rows: tableOf({ ...base, table }, recipe, HOW()), old } } catch { return { why: 'recipe' } }
}

/**
 * A consumer's `table` block drawn, a slide's (Slides' `BLOCKS`) or a document's (`<app-composed>`): the collection it names, read now and as
 * it changes while the block shows, at the version it reads, as its recipe shows it, or why it can't be shown here. @param {HTMLElement} box @param {string} source
 */
export async function drawn(box, source) {
  const ref = parseRef(source), pane = /** @type {any} */ (box.closest('app-preview')), from = String(pane?.file?.peek()?.uri ?? ''), dir = app.projectDir
  const shared = !pane && Boolean(app.current.peek()?.records.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'shared'))
  const tables = ref && !isDenied('tables') && !shared ? await import('../tables/tables.js') : null, live = ref && tables && await tables.load(ref.place, dir).catch(() => null)
  const why = refused({ denied: isDenied('tables'), shared, loop: Boolean(ref && from && loops((await graph(dir)).edges, from, ref.place)), found: Boolean(live) })
  const show = (/** @type {{ why?: string, rows?: string[][] }} */ { why, rows: [heads = [], ...rows] = [] }) => render(why ? html`<p class="deck-words">${t(`compose.${why}`)}</p>`
    : html`<table><thead><tr>${heads.map((head) => html`<th dir="auto">${head}</th>`)}</tr></thead><tbody>${rows.map((row) => html`<tr>${row.map((cell) => html`<td dir="auto">${cell}</td>`)}</tr>`)}</tbody></table>`, box)
  if (why || !ref || !live || !tables) return void show({ why: why || 'missing' })
  const where = signal(/** @type {Loaded} */ (live)), holds = /** @type {(() => void)[]} */ ([])
  tables.watched(where, holds)
  const stop = effect(() => {
    const now = where.value
    if (!box.isConnected && box.querySelector('table, p')) return void (stop?.(), holds.forEach((hold) => hold()))
    if (now) resolved(ref, now, dir).then(show)
  })
}
customElements.define('app-composed', class extends HTMLElement { connectedCallback() { void drawn(this, this.getAttribute('source') ?? '') } })

/** A site's pages, as it is read (../sites/kind.js), each table that says `data-from` filled as its reference shows it now, those that can't be as written. @param {Map<string, Uint8Array>} files @param {string} dir */
export async function composed(files, dir) {
  const tables = isDenied('tables') ? null : await import('../tables/tables.js'), [decode, encode] = [new TextDecoder(), new TextEncoder()]
  for (const [file, bytes] of files) if (file.endsWith('.html') && tables) files.set(file, encode.encode(filledPage(decode.decode(bytes), await Promise.all(refsIn(decode.decode(bytes)).map(async (ref) => {
    const live = await tables.load(ref.place, dir).catch(() => null)
    return live ? (await resolved(ref, live, dir)).rows ?? null : null
  })))))
  return files
}

/**
 * A version of a collection made, its author's or for its columns changed (`schema`), when they differ from the last version's; none where a
 * column would break, whose names it gives instead. @param {string} folder @param {Version['why']} [why] @param {string} [dir]
 * @returns {Promise<{ version?: Version, broken?: string[] } | null>}
 */
export async function publish(folder, why = 'published', dir = app.projectDir) {
  const tables = await import('../tables/tables.js'), [one, versions] = await Promise.all([tables.load(folder, dir), versionsOf(dir, folder)]), last = versions.at(-1)
  if (!one || (why === 'schema' && (!last || !reshaped(last, one.table)))) return null
  const broken = last ? breaks(last.table, one.table) : []
  if (broken.length) return { broken }
  const version = versionOf(one, { n: (last?.n ?? 0) + 1, at: new Date().toISOString(), by: 'user', why })
  await app.fs.write(`${dir}/${folder}/versions/${version.n}.json`, `${JSON.stringify(version, null, 1)}\n`)
  await tables.reread(one)
  return { version }
}
// A collection's columns changed, here, in another tab or by Sync: a version of them, once it has versions.
const later = new Map()
app.fs.watch?.((path) => { const [, dir, folder] = /^(.*)\/(collections\/[^/]+)\/collection\.json$/.exec(path) ?? []; if (folder) clearTimeout(later.get(folder)), later.set(folder, setTimeout(() => publish(folder, 'schema', dir), 500)) }, { all: true })

/** Which version a reference reads, in words. @param {Edge['at']} at */
const which = (at) => (typeof at === 'number' ? t('compose.pinned', { n: at }) : t(`compose.${at}`))
/** A consumer with its `index`th reference reading another version, written. @param {string} from @param {number} index @param {Edge['at']} at */
async function choose(from, index, at) {
  const dir = app.projectDir, decks = from.endsWith('.deck.html') ? await import('../skills/decks.js') : null, deck = decks && await decks.load(from, dir)
  if (decks && deck) await decks.rewrite(from, withAt(deck.source, index, at), deck.name, dir)
  else if (!decks) await app.fs.write(`${dir}/${from}`, withAt((await app.fs.read(`${dir}/${from}`)) ?? '', index, at))
  read.at = 0
}
/** What the pane's head lists for each place, once read. @typedef {{ uses: Edge[], usedIn: Edge[], names: Map<string, string>, versions: Map<string, Version[]>, old: Map<Edge, [string, string][]>, changes: number, broken: string[] }} Links */
const links = signal(/** @type {Map<string, Links>} */ (new Map()))
/** Each place's links, read as its menu opens. @param {string} uri */
async function linksOf(uri) {
  const dir = app.projectDir, tables = await import('../tables/tables.js'), { edges, names } = await graph(dir), uses = edges.filter((edge) => edge.from === uri && names.has(edge.to))
  const versions = new Map(await Promise.all([...new Set([uri, ...uses.map((edge) => edge.to)])].map(async (place) => /** @type {[string, Version[]]} */ ([place, await versionsOf(dir, place)]))))
  const own = PLACE.test(uri) ? await tables.load(uri, dir) : null, last = versions.get(uri)?.at(-1), old = new Map()
  for (const edge of uses) { const live = await tables.load(edge.to, dir).catch(() => null); if (live) old.set(edge, current(live.table, versions.get(edge.to) ?? [], edge.recipe).old) }
  links.value = new Map(links.peek()).set(uri, { uses, usedIn: edges.filter((edge) => edge.to === uri), names, versions, old, broken: own && last ? breaks(last.table, own.table) : [],
    changes: own ? own.lines.filter((line) => 'at' in line && line.at > (last?.head ?? '')).length : 0 })
}

/** The pane's head, for a collection, slides or a document: a button whose menu lists what it uses and what uses it, each opening it; for a collection, its versions. @param {{ uri: string }} file */
function head({ uri }) {
  if (!PLACE.test(uri) && !CONSUMERS.some(([folder, own]) => uri.startsWith(`${folder}/`) && own.test(uri.slice(folder.length + 1)))) return nothing
  const id = `links-${uri}`, these = links.value.get(uri), date = new Intl.DateTimeFormat(intlLocales(locale.value), { dateStyle: 'medium', timeStyle: 'short' }), name = (/** @type {string} */ place) => these?.names.get(place) ?? place
  const open = (/** @type {string} */ place, /** @type {unknown} */ value = nothing) => html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${() => openFile({ type: 'resource_link', uri: place, name: name(place) })}><span dir="auto">${name(place)}</span>${value}</button>`
  const group = (/** @type {string} */ key, /** @type {unknown[]} */ rows) => (rows.length ? html`<div role="group" aria-label=${t(key)}><p class="menu-heading" aria-hidden="true">${t(key)}</p><ul>${rows}</ul></div>` : nothing)
  const uses = (these?.uses ?? []).map((edge) => html`<li>${open(edge.to)}<select title=${t('compose.which')} ?disabled=${edge.from.startsWith('sites/')}
    @change=${(/** @type {Event} */ event) => ((value) => choose(uri, edge.index, /^\d/.test(value) ? Number(value) : /** @type {'live' | 'published'} */ (value)).then(() => linksOf(uri)))(/** @type {HTMLSelectElement} */ (event.target).value)}>
    ${['live', 'published', ...(these?.versions.get(edge.to) ?? []).map((version) => version.n)].map((at) => html`<option value=${String(at)} ?selected=${at === edge.at}>${which(/** @type {Edge['at']} */ (at))}</option>`)}</select>
    ${(these?.old.get(edge) ?? []).map(([was, now]) => html`<p class="menu-heading">${t('compose.old', { old: was, name: now })}</p>`)}</li>`)
  const versions = PLACE.test(uri) && these ? html`<div role="group" aria-label=${t('compose.versions')}><p class="menu-heading" aria-hidden="true">${t('compose.versions')}</p>
    <p class="menu-heading" role="status">${t('compose.journal', { count: these.changes })}</p>${these.broken.length ? html`<p class="menu-heading" role="alert">${t('compose.breaks', { columns: new Intl.ListFormat(intlLocales(locale.value)).format(these.broken) })}</p>` : nothing}
    <ul><li><button type="button" ?disabled=${these.broken.length > 0} @click=${async () => { const made = await publish(uri); if (made?.version) notify(t('compose.done', { n: made.version.n })); await linksOf(uri) }}>${icons.upload}<span>${t('compose.publish', { n: (these.versions.get(uri)?.at(-1)?.n ?? 0) + 1 })}</span></button></li>
    ${[...these.versions.get(uri) ?? []].reverse().slice(0, 5).map((version) => html`<li><p class="menu-heading">${t(version.why === 'schema' ? 'compose.versionSchema' : 'compose.version', { n: version.n, date: date.format(new Date(version.at)) })}</p></li>`)}</ul></div>` : nothing
  // Keyed by its place: a pane that shows another creation draws its menu anew, closed.
  return keyed(uri, html`<button class="icon-button" popovertarget=${id} aria-label=${t('compose.links')}>${icons.layers}</button>
    <div id=${id} class="menu out-menu" popover @toggle=${(/** @type {ToggleEvent} */ event) => event.newState === 'open' && linksOf(uri)}>${these ? html`${versions}${group('compose.uses', uses)}
      ${group('compose.usedIn', these.usedIn.map((edge) => html`<li>${open(edge.from, html`<span class="menu-value">${which(edge.at)}</span>`)}</li>`))}${these.uses.length + these.usedIn.length || versions !== nothing ? nothing : html`<p class="menu-heading">${t('compose.none')}</p>`}` : nothing}</div>`)
}

register({ id: 'compose', slots: { head: { at: 1, draw: head } } })
