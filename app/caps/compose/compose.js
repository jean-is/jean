// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a consumer's ```table block (a slide's, a document's) or a site's table that says `data-from`
// shows a collection of its project: the journal's head (live), its latest version (published) or one version (pinned), read again at each
// resolution, the reader's right asked each time (./refs.js), and drawn again as the collection changes while it shows. A collection's
// versions (./versions.js) are made when its author publishes one or its columns change, never on a row's change. The pane's head says, for a
// collection, slides or a document, what it uses and what uses it, which version each reads, and for a collection its versions and what
// changed since the last. A reference's `ask` is run by a brain (./recipes.js) the first time it shows, then by hand, every so many minutes or
// as its source changes, as its user chose, each run kept on the consumer's side. Each version and each run is certified (./proof.js), as an
// answer is, and the consumer's menu checks the chain back to the collection's version. What people outside propose comes in through the
// collection's port alone (./ports.js), into its journal; what shows of it is each consumer's own criteria. It is Tables' loader (ui/caps.js),
// importing Tables itself, so that the two come and go together, off the first screen.
import { html, render, nothing } from 'lit-html'
import { keyed } from 'lit-html/directives/keyed.js'
import { signal, effect } from '@preact/signals-core'
import { register, isDenied, contributions, unlock } from '../../ui/caps.js'
import { app, openFile, notify, activeBrain, brainsHere } from '../../ui/state.js'
import { markdown } from '../../ui/markdown.js'
import { fire } from '../../core/hooks.js'
import { isLocal } from '../../core/settings.js'
import { icons } from '../../ui/menu-icons.js'
import { t, useStrings, locale, intlLocales } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { PLACE } from '../tables/table.js'
import '../tables/tables.js'
import { parseRef, parseFigure, refsIn, loops, refused, versionless, tableOf, chartOf, choiceIn, choicesIn, tinted, withRef, filledPage, written as writtenWith, linksIn, further } from './refs.js'
import { option } from '../interactive/parts.js'
import { versionOf, loadedOf, reshaped, breaks, current, headOf } from './versions.js'
import { keyOf, paceOf, askOf, lastRun, due, PROMPT, DEPTH, GATHER } from './recipes.js'
import { credentialOf, chainOf, holds } from './proof.js'
import { admitted, portOf as portFor } from './ports.js'
import { imprint } from '../receipt/certificate.js'

await Promise.all([useStrings('compose'), styleSheet(new URL('compose.css', import.meta.url))])

/** @import { Edge, Ref } from './refs.js' */
/** @import { Version } from './versions.js' */
/** @import { Run } from './recipes.js' */
/** @import { Port, Proposal } from './ports.js' */
/** @typedef {Awaited<ReturnType<typeof import('../tables/tables.js').load>>} Loaded */
/** A site's or a prototype's pages, read by its record. @param {string} record @returns {(path: string, dir: string) => Promise<{ source: string, name: string } | null>} */
const pagesOf = (record) => async (path, dir) => ((one) => one && Promise.all(one.files.filter((/** @type {string} */ file) => file.endsWith('.html')).map((/** @type {string} */ file) => app.fs.read(`${dir}/${path}/${file}`))).then((pages) => ({ source: pages.join('\n'), name: one.name })))(JSON.parse((await app.fs.read(`${dir}/${path}/${record}`)) ?? 'null'))
/** The kinds that hold references, by folder: which entries are their own, and the text and name read from one. @type {[string, RegExp, (path: string, dir: string) => Promise<{ source: string, name: string } | null>][]} */
const CONSUMERS = [['decks', /\.deck\.html$/, async (path, dir) => (await import('../skills/decks.js')).load(path, dir)],
  ['documents', /^[^.].*\.md$/, async (path, dir) => ((text) => (text ? { source: text, name: /^name: *(.+)$/m.exec(text)?.[1] ?? /^# (.+)$/m.exec(text)?.[1] ?? path } : null))(await app.fs.read(`${dir}/${path}`))],
  ['sites', /^[^.][^.]*$/, pagesOf('site.json')], ['prototypes', /^[^.][^.]*$/, pagesOf('prototype.json')]]
const HOW = () => ({ locales: intlLocales(locale.peek()), labels: { yes: '✓', no: '' }, today: new Date() })

/** The project's graph, each reference and each creation's name by its place, and the links that are no references (./refs.js `linksIn()`): read again once a consumer or a collection's columns are written, else every five minutes at most (a folder changed outside Jean). */
let read = { at: 0, dir: '', graph: /** @type {Promise<typeof known> | null} */ (null) }
/** The graph as it was last read, for what must answer at once (a toast's words), with each collection's columns' kinds. */
let known = { edges: /** @type {Edge[]} */ ([]), names: /** @type {Map<string, string>} */ (new Map()), kinds: /** @type {Map<string, Map<string, string>>} */ (new Map()) }
function graph(dir = app.projectDir) {
  if (read.dir !== dir || Date.now() - read.at > 300_000) read = { at: Date.now(), dir, graph: (async () => {
    const tables = await import('../tables/tables.js'), names = new Map((await tables.collections(dir)).map((one) => [one.folder, one.name])), edges = /** @type {Edge[]} */ ([]), kinds = new Map()
    for (const folder of names.keys()) {
      const table = await app.fs.read(`${dir}/${folder}/collection.json`).then((text) => JSON.parse(text ?? 'null')).catch(() => null)
      kinds.set(folder, new Map((table?.properties ?? []).map((/** @type {{ id: string, type: string }} */ { id, type }) => [id, type]))), edges.push(...linksIn(folder, table))
    }
    for (const [folder, own, readOf] of CONSUMERS) for (const { name } of (await app.fs.list(`${dir}/${folder}`).catch(() => [])).filter((entry) => own.test(entry.name))) {
      const path = `${folder}/${name}`, one = await readOf(path, dir).catch(() => null)
      if (one) names.set(path, one.name), edges.push(...refsIn(one.source).map((ref, index) => ({ from: path, to: ref.place, at: ref.at, recipe: ref.recipe, index })), ...linksIn(path, null, one.source))
    }
    return (known = { edges, names, kinds })
  })() }
  return /** @type {NonNullable<typeof read.graph>} */ (read.graph)
}

/** Names as a list, in the language on show. @param {string[]} names */
const listed = (names) => new Intl.ListFormat(intlLocales(locale.peek())).format(names)
/** What uses a place, by name, from the graph as last read: with a column, the references that name it or show every column; else every link. @param {string} place @param {string} [column] */
const usersOf = (place, column = '') => [...new Set(known.edges.filter((edge) => edge.to === place && (!column || (!edge.kind && (Object.values(edge.recipe).some((value) => value.toLowerCase().includes(column.toLowerCase())) || !(edge.recipe.fields || edge.recipe.total || edge.recipe.chart)))))
  .map((edge) => known.names.get(edge.from) ?? edge.from))]
/** A toast's words with what still uses what it took away, which its Undo gives back: a column (Tables) or a creation deleted (Creations). @param {string} said @param {string} place @param {string} [column] */
const touched = (said, place, column) => ((names) => (names.length ? t('compose.touched', { said, names: listed(names) }) : said))(usersOf(place, column))
/** A column whose kind changed, here or by Sync, said where creations read it: live, they show it as Tables converted it, and no version is made of it. @param {string} folder @param {string} dir */
async function retyped(folder, dir) {
  const was = known.kinds.get(folder), one = was && await (await import('../tables/tables.js')).load(folder, dir).catch(() => null)
  if (!was || !one) return
  for (const { id, name, type } of one.table.properties) if (was.has(id) && was.get(id) !== type && usersOf(folder, name).length) notify(t('compose.retyped', { column: name, names: listed(usersOf(folder, name)) }))
  known.kinds.set(folder, new Map(one.table.properties.map(({ id, type }) => [id, type])))
}

/** A collection's versions, the first first. @param {string} dir @param {string} folder @returns {Promise<Version[]>} */
const versionsOf = async (dir, folder) => (await Promise.all((await app.fs.list(`${dir}/${folder}/versions`).catch(() => [])).filter((entry) => /^\d+\.json$/.test(entry.name))
  .map(async (entry) => JSON.parse((await app.fs.read(`${dir}/${folder}/versions/${entry.name}`)) ?? 'null')))).filter(Boolean).sort((a, b) => a.n - b.n)

/** A collection's port, while its owner keeps it open; null otherwise. @param {string} dir @param {string} folder @returns {Promise<Port | null>} */
const portOf = async (dir, folder) => { try { return JSON.parse((await app.fs.read(`${dir}/${folder}/port.json`)) ?? 'null') } catch { return null } }

/**
 * What a reference shows of a collection loaded, at the version it reads (`read`), its recipe's old names read as the columns are named now; or
 * why it shows nothing; its columns as it reads them (`table`). @param {Ref} ref @param {NonNullable<Loaded>} live @param {string} dir @returns {Promise<{ why?: string, rows?: string[][], read?: string, old?: [string, string][], certificate?: import('../receipt/certificate.js').Sealed, table?: import('../tables/table.js').Table }>}
 */
async function resolved(ref, live, dir, most = 12) {
  const versions = await versionsOf(dir, ref.place), version = ref.at === 'published' ? versions.at(-1) : versions.find((one) => one.n === ref.at)
  if (ref.at !== 'live' && !version) return { why: versionless(ref.at) }
  const base = version ? loadedOf(version) : live, { table, recipe, old } = current(base.table, versions, ref.recipe)
  try { return { rows: tableOf({ ...base, table }, recipe, HOW(), most), read: version ? `v${version.n}` : headOf(live.lines), old, certificate: version?.certificate, table } } catch { return { why: 'recipe' } }
}

/** Where a consumer's runs are kept, by its ULID, or its task's for slides in an answer: composed/<ulid>.jsonl, appended, never edited. @param {string} dir @param {string} from */
const runsAt = (dir, from) => `${dir}/composed/${ulidOf(from)}.jsonl`, ulidOf = (/** @type {string} */ from) => /[0-9A-HJKMNP-TV-Z]{26}/.exec(from)?.[0] ?? app.current.peek()?.id ?? 'answers'
/** What a consumer ran, to read again unpaid: its own runs and, for slides an answer drew that Jean then kept (../skills/decks.js `keep()`), its task's, whose run under way is theirs too (`origin`). @param {string} dir @param {string} from */
async function runsFor(dir, from) {
  const origin = ((task) => (task ? `conversations/${task.split('/').pop()}` : from))(/^decks\//.test(from) ? (await (await import('../skills/decks.js')).load(from, dir).catch(() => null))?.meta.source : '')
  return { origin, runs: [...await runsOf(runsAt(dir, from)), ...(origin === from ? [] : await runsOf(runsAt(dir, origin)))] }
}
/** @param {string} at @returns {Promise<Run[]>} */
const runsOf = async (at) => ((await app.fs.read(at)) ?? '').split('\n').flatMap((line) => { try { return line ? [JSON.parse(line)] : [] } catch { return [] } })
/** How many runs were kept, which a block that shows one reads; and the runs under way, so that one asked twice at once is run once. */
const ran = signal(0), running = /** @type {Map<string, Promise<Run>>} */ (new Map())
/** @param {Edge} edge @returns {Ref} */
const refOf = ({ to, at, recipe }) => ({ place: to, at, recipe })

/** A version or a run certified as an answer is, where About this answer is there: its certificate, and the salts its holder keeps. @param {Parameters<typeof credentialOf>[0]} made */
async function certified(made) {
  if (!(await unlock('receipt'))) return {}
  const [{ credential, salts }, { certify }] = await Promise.all([credentialOf(made), import('../receipt/receipt.js')])
  return { certificate: await certify(credential), salts }
}

/**
 * A reference's `ask` run over what its query keeps of its source now, at the version it reads, by the brain it names or the one at hand;
 * one with the same version and brain already run is read again, unpaid, and a failure is kept beside the last good run, which stays on show.
 * @param {Ref} ref @param {string} from @param {string} dir @returns {Promise<Run | null>}
 */
async function run(ref, from, dir) {
  const live = !isDenied('tables') && ref.recipe.ask ? await (await import('../tables/tables.js')).load(ref.place, dir).catch(() => null) : null, shown = live && await resolved(ref, live, dir, 200)
  const brain = brainsHere.peek().find((one) => [one.id, one.label, one.model].includes(ref.recipe.brain ?? '')) ?? activeBrain.peek(), at = runsAt(dir, from), { runs, origin } = await runsFor(dir, from), key = keyOf(ref)
  if (!shown?.rows || !shown.read || !brain) return null
  const { rows, read, certificate } = shown, same = lastRun(runs, key, read, `${brain.provider}:${brain.model}`), once = `${runsAt(dir, origin)} ${key} ${read} ${brain.id}`
  if (same || running.has(once)) return same ?? running.get(once) ?? null
  const work = (async () => {
    const line = /** @type {Run} */ ({ format: 1, key, n: runs.filter((one) => one.key === key).length + 1, at: new Date().toISOString(), read, brain: `${brain.provider}:${brain.model}` })
    try { line.output = await asked(brain, askOf(String(ref.recipe.ask), rows), from) } catch (error) { line.error = String(/** @type {Error} */ (error)?.message ?? error) }
    // What it read: its source at the version it read, by that version's certificate.
    if (line.output !== undefined) Object.assign(line, await certified({ kind: 'run', creation: ulidOf(from), n: line.n, at: line.at, by: 'jean', content: line.output, recipe: ref.recipe, brain: { provider: brain.provider, model: brain.model, local: isLocal(brain) },
      ingredients: [{ kind: 'collection', creation: ref.place.slice(12, 38), read, ...(certificate && { certificate: await imprint(certificate) }) }] }))
    await app.fs.append(at, `${JSON.stringify(line)}\n`)
    ran.value++
    return line
  })().finally(() => running.delete(once))
  return running.set(once, work), work
}
/** What a brain writes for an instruction, in one request outside any task, through the hooks a turn's steps go through (a month's limit), as titles are written (ui/title.js). @param {import('../../core/types.js').BrainConfig} brain @param {string} text @param {string} task */
async function asked(brain, text, task) {
  const [{ streamChat }, { getSecret }] = await Promise.all([import('../../core/llm.js'), import('../../ui/secrets.js')]), apiKey = (await getSecret(app.fs, brain.id)) ?? undefined
  let reply = ''
  for await (const event of await fire(contributions().hooks, 'turn.step', { task, brain, system: PROMPT, messages: [{ role: 'user', content: text }], tools: [], maxTokens: 1500, effort: 'low', signal: AbortSignal.timeout(120_000) },
    (/** @type {any} */ e) => streamChat({ ...e, apiKey }))) if (event.type === 'text') reply += event.delta
  return reply.trim()
}
/** The run a reference's block shows: its last good one, else one made now, the first time it shows. @param {Ref} ref @param {string} from @param {string} dir */
const shownRun = async (ref, from, dir) => ((last) => (last ? { output: last.output } : run(ref, from, dir).then((line) => (line?.output !== undefined ? { output: line.output } : { why: 'unasked' }))))(lastRun(await runsOf(runsAt(dir, from)), keyOf(ref)))

/** A choice's colour as a chart draws it, in sRGB for its SVG and PowerPoint's writer: as Tables shows it, its hue, else a step's group (under way
 * the flame, done the ink's soft), else the line's, as a card's edge is, read from the page's own style, over the paper it is drawn on. @param {{ hue?: number, group?: string }} shade @param {Element} box */
function painted({ hue, group }, box, probe = Object.assign(document.createElement('i'), { hidden: true }), paper = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d', { willReadFrequently: true }))) {
  document.body.append(probe), hue === undefined || (probe.dataset.hue = String(hue)), probe.style.color = hue !== undefined ? 'var(--hue)' : `var(${group === 'doing' ? '--flame' : group === 'done' ? '--ink-soft' : '--line-strong'})`
  for (const colour of [getComputedStyle(box).getPropertyValue('--deck-paper').trim() || getComputedStyle(document.body).backgroundColor, getComputedStyle(probe).color]) paper.fillStyle = colour, paper.fillRect(0, 0, 1, 1)
  return probe.remove(), `#${[...paper.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/**
 * A consumer's `table` block drawn, a slide's (Slides' `BLOCKS`) or a document's (`<app-composed>`): the collection it names, read now and as
 * it changes while the block shows, at the version it reads, as its recipe shows it (a chart, Charts' own, where it says `chart` and Charts
 * can come), or why it can't be shown here. On a slide, its chart is drawn in SVG, in the deck's colours (`dress`), its box an `echarts` block's. @param {HTMLElement} box @param {string} source
 * @param {(option: Record<string, any>) => Record<string, any>} [dress]
 */
export async function drawn(box, source, dress) {
  const ref = parseRef(source), pane = /** @type {any} */ (box.closest('app-preview')), from = String(pane?.file?.peek()?.uri ?? ''), dir = app.projectDir
  const shared = !pane && Boolean(app.current.peek()?.records.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'shared'))
  const tables = ref && !isDenied('tables') && !shared ? await import('../tables/tables.js') : null, live = ref && tables && await tables.load(ref.place, dir).catch(() => null)
  const why = refused({ denied: isDenied('tables'), shared, loop: Boolean(ref && from && loops((await graph(dir)).edges, from, ref.place)), found: Boolean(live) })
  const chart = Boolean(ref?.recipe.chart && !ref.recipe.ask) && await unlock('charts')
  // A chart's box, as an `echarts` block's is: the chart its own for the printer and PowerPoint's writer, which makes it a chart of its own.
  if (chart) box.classList.replace('deck-table', 'deck-echarts'), Object.defineProperty(box, 'chart', { get: () => /** @type {any} */ (box.querySelector('app-chart'))?.chart ?? null, configurable: true })
  // A choice, in a cell or as a bar, in the colour Tables gives it.
  const pills = (/** @type {ReturnType<typeof choiceIn>} */ property, /** @type {string} */ cell) => (property ? choicesIn(property, cell).map(({ name, hue, group }) => html`<span class="table-pill composed-pill" dir="auto" data-hue=${hue ?? nothing} data-group=${group ?? nothing}>${name}</span>`) : cell)
  const show = (/** @type {{ why?: string, rows?: string[][], output?: string, table?: import('../tables/table.js').Table }} */ { why, rows: all = [], output, table }, [heads = [], ...rows] = all, by = table && choiceIn(table, heads[0])) => render(why ? html`<p class="deck-words">${t(`compose.${why}`)}</p>` : output !== undefined ? html`<div dir="auto">${markdown(output)}</div>`
    : chart ? html`<app-chart live ?svg=${Boolean(dress)} source=${JSON.stringify(((drawing) => (dress ? dress(drawing) : drawing))(tinted(option(chartOf(all, ref?.recipe.chart)), rows.map(([label]) => (by ? painted(choicesIn(by, label)[0], box) : undefined)))))}></app-chart>`
    : ((columns) => html`<table><thead><tr>${heads.map((head) => html`<th dir="auto">${head}</th>`)}</tr></thead><tbody>${rows.map((row) => html`<tr>${row.map((cell, i) => html`<td dir="auto">${pills(columns[i], cell)}</td>`)}</tr>`)}</tbody></table>`)(heads.map((head) => (table ? choiceIn(table, head) : null))), box)
  if (why || !ref || !live || !tables) return void show({ why: why || 'missing' })
  const where = signal(/** @type {Loaded} */ (live)), holds = /** @type {(() => void)[]} */ ([])
  tables.watched(where, holds)
  const stop = effect(() => {
    const now = (ran.value, where.value)
    if (!box.isConnected && box.firstElementChild?.nextSibling) return void (stop?.(), holds.forEach((hold) => hold()))
    if (now) (ref.recipe.ask ? shownRun(ref, from, dir) : resolved(ref, now, dir)).then(show)
  })
}
/**
 * The figures a deck's words hold (inline code that starts with `=`, ./refs.js), each shown worked out from its collection, as it is now or at the
 * version it names, again as it changes, the deck fitted to them; else —, its title saying why. Its words made editable by a double click show its
 * formula again, so that the formula is what the deck keeps. @param {HTMLElement} root @param {() => void} [refit] @param {string} [at] the code that may hold one, a slide's
 */
export function liven(root, refit, at = '.deck-slide code') {
  const pane = /** @type {any} */ (root.closest('app-preview')), from = String(pane?.file?.peek()?.uri ?? ''), dir = app.projectDir, holds = /** @type {(() => void)[]} */ ([]), read = /** @type {Map<string, Promise<any>>} */ (new Map()), shown = /** @type {WeakMap<HTMLElement, string>} */ (new WeakMap())
  const shared = !pane && Boolean(app.current.peek()?.records.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'shared')), filled = /** @type {Promise<unknown>[]} */ ([])
  // A collection read once, then as it changes, for all its figures.
  const source = (/** @type {string} */ place) => read.get(place) ?? read.set(place, import('../tables/tables.js').then(async (tables) => ((live) => live && (tables.watched(live, holds), live))(((one) => one && signal(one))(await tables.load(place, dir).catch(() => null))))).get(place)
  const show = async (/** @type {HTMLElement} */ code, /** @type {Ref} */ ref) => {
    const why = refused({ denied: isDenied('tables'), shared, loop: Boolean(from && loops((await graph(dir)).edges, from, ref.place)), found: true }), live = why ? null : await source(ref.place)
    const put = (/** @type {{ why?: string, rows?: string[][] }} */ { why, rows }) => code.isContentEditable || (code.textContent = rows?.[0]?.[0] ?? '—', code.title = why ? t(`compose.${why}`) : '', refit?.())
    // Worked out again as the collection changes, until the deck draws that slide anew.
    return live ? new Promise((resolve) => { const stop = effect(() => void (code.isConnected ? resolved(ref, live.value, dir).then(put).then(resolve) : (stop?.(), resolve(null)))); holds.push(stop) }) : put({ why: why || 'missing' })
  }
  const scan = () => root.querySelectorAll(`${at}:not([data-formula])`).forEach((code) => ((ref) => ref && (Object.assign(/** @type {HTMLElement} */ (code).dataset, { formula: code.textContent }), filled.push(show(/** @type {HTMLElement} */ (code), ref))))(parseFigure(code.textContent ?? '')))
  // Before the deck reads them (capture), each formula back in the words double-clicked; the figures again if the deck didn't make them editable.
  const watch = new MutationObserver(scan), again = (/** @type {Event} */ event) => {
    const words = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-edit]')), codes = /** @type {HTMLElement[]} */ ([...words?.querySelectorAll('[data-formula]') ?? []])
    for (const code of codes) shown.set(code, code.textContent ?? ''), code.textContent = code.dataset.formula ?? ''
    setTimeout(() => words?.isContentEditable || codes.forEach((code) => { code.textContent = shown.get(code) ?? '' }))
  }
  scan(), watch.observe(root, { childList: true, subtree: true }), root.addEventListener('dblclick', again, true)
  return { ready: Promise.all(filled), stop: () => (watch.disconnect(), root.removeEventListener('dblclick', again, true), holds.forEach((hold) => hold())) }
}
customElements.define('app-composed', class extends HTMLElement { connectedCallback() { void drawn(this, this.getAttribute('source') ?? '') } })
// A figure in a document's words (../documents/drawn.js), as a slide's is.
customElements.define('app-figure', class extends HTMLElement { connectedCallback() { this.replaceChildren(Object.assign(document.createElement('code'), { textContent: this.getAttribute('source') })), this.live = liven(this, undefined, 'code') } disconnectedCallback() { this.live?.stop() } })

/** A site's pages, as it is read (../sites/kind.js), each table that says `data-from` filled as its reference shows it now, those that can't be as written. @param {Map<string, Uint8Array>} files @param {string} dir */
export async function composed(files, dir) {
  const tables = isDenied('tables') ? null : await import('../tables/tables.js'), [decode, encode] = [new TextDecoder(), new TextEncoder()]
  for (const [file, bytes] of files) if (file.endsWith('.html') && tables) files.set(file, encode.encode(filledPage(decode.decode(bytes), await Promise.all(refsIn(decode.decode(bytes)).map(async (ref) => {
    const live = await tables.load(ref.place, dir).catch(() => null)
    return live ? (await resolved(ref, live, dir)).rows ?? null : null
  })))))
  return files
}

/** Markdown as it leaves Jean (../made/paper.js, ../slides/save.js), each reference as its consumer, `from`, shows it now (./refs.js). @param {string} text @param {string} from */
export const written = (text, from, dir = app.projectDir) => writtenWith(text, async (ref) => {
  const live = isDenied('tables') ? null : await (await import('../tables/tables.js')).load(ref.place, dir).catch(() => null), why = refused({ denied: isDenied('tables'), shared: false, loop: Boolean(from && loops((await graph(dir)).edges, from, ref.place)), found: Boolean(live) })
  const one = /** @type {{ why?: string, rows?: string[][], output?: string }} */ (why || !live ? { why: why || 'missing' } : ref.recipe.ask ? await shownRun(ref, from, dir) : await resolved(ref, live, dir))
  return { rows: one.rows, words: one.why ? t(`compose.${one.why}`) : one.output }
})

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
  Object.assign(version, await certified({ kind: 'collection', creation: folder.slice(12, 38), n: version.n, at: version.at, by: version.by, content: JSON.stringify(version) }))
  await app.fs.write(`${dir}/${folder}/versions/${version.n}.json`, `${JSON.stringify(version, null, 1)}\n`)
  await tables.reread(one)
  return { version }
}
/**
 * A creation changed: each reference to it whose `ask` runs as its source changes (its user opted in, `refresh: auto`) run again once changes
 * stop coming for a while, then what uses that consumer, so far deep at most. @param {string} place @param {string} dir
 */
async function propagate(place, dir, depth = 0) {
  if (depth < DEPTH) for (const edge of (await graph(dir)).edges.filter((one) => one.to === place && one.recipe.ask && paceOf(one.recipe).auto)) {
    clearTimeout(later.get(`${edge.from}#${edge.index}`))
    later.set(`${edge.from}#${edge.index}`, setTimeout(async () => { if ((await run(refOf(edge), edge.from, dir))?.output !== undefined) void propagate(edge.from, dir, depth + 1) }, GATHER))
  }
}
// A collection changed, here, in another tab or by Sync: what runs as it changes; and, its columns changed, a version of them once it has versions.
// A consumer written: the graph is read again, a second later, so that a toast's words are as it is.
const later = new Map()
app.fs.watch?.((path) => {
  const [, dir, folder, file] = /^(.*)\/(collections\/[^/]+)\/(collection\.json|changes\.jsonl|versions\/\d+\.json)$/.exec(path) ?? []; if (/\/(decks|documents|sites|prototypes)\/|\/collection\.json$/.test(path)) read.at = 0, clearTimeout(later.get('graph')), later.set('graph', setTimeout(() => app.projectDir && graph(), 1000))
  if (file === 'collection.json') clearTimeout(later.get(folder)), later.set(folder, setTimeout(() => publish(folder, 'schema', dir), 500)), dir === app.projectDir && void retyped(folder, dir)
  if (folder && dir === app.projectDir) void propagate(folder, dir)
}, { all: true })
// Each minute, the references whose `ask` runs every so many minutes, those due run; and the graph read once at the start, for a toast's words.
setTimeout(() => app.projectDir && graph())
setInterval(async () => {
  for (const edge of app.projectDir ? (await graph(app.projectDir)).edges : []) if (edge.recipe.ask && paceOf(edge.recipe).every > 0 && due(lastRun(await runsOf(runsAt(app.projectDir, edge.from)), keyOf(refOf(edge))), paceOf(edge.recipe).every, Date.now())) void run(refOf(edge), edge.from, app.projectDir)
}, 60_000)

/**
 * What visitors proposed through a site's form whose `data-to` names a collection, let in through its port into its journal, as a visitor's
 * rows: those its port takes (./ports.js); null where it has no port open, whose proposals go elsewhere (../sites/sites.js).
 * @param {string} place @param {Proposal[]} proposals @param {string} [dir] @returns {Promise<number | null>}
 */
export async function contribute(place, proposals, dir = app.projectDir) {
  const [tables, port] = await Promise.all([import('../tables/tables.js'), portOf(dir, place)]), one = port && await tables.load(place, dir).catch(() => null)
  if (!port || !one) return null
  const edits = admitted(port, one, proposals, Date.now())
  if (edits.length) await tables.change(one, edits, 'visitor', undefined, false, false)
  return edits.length
}
/** A collection's port opened by its owner, every column a form fills, or shut: from Share's Collect replies (caps/collect). @param {string} folder @param {boolean} on */
export async function propose(folder, on) {
  const dir = app.projectDir, one = on && await (await import('../tables/tables.js')).load(folder, dir)
  if (one) await app.fs.write(`${dir}/${folder}/port.json`, `${JSON.stringify(portFor(one.table, new Date().toISOString()), null, 1)}\n`)
  else if (!on) await app.fs.remove(`${dir}/${folder}/port.json`)
}
/** The columns a site's form can fill while a collection takes proposals, in words; null while its port is shut. @param {string} folder @returns {Promise<string | null>} */
export async function proposalsOf(folder) {
  const dir = app.projectDir, port = await portOf(dir, folder), one = port && await (await import('../tables/tables.js')).load(folder, dir)
  return port && one ? new Intl.ListFormat(intlLocales(locale.peek())).format(port.columns.map((id) => one.table.properties.find((p) => p.id === id)?.name ?? id)) : null
}

/** Which version a reference reads, in words. @param {Edge['at']} at */
const which = (at) => (typeof at === 'number' ? t('compose.pinned', { n: at }) : t(`compose.${at}`))
/** What a menu says beside an edge: the version a reference reads, a relation's column, nothing for a file. @param {Edge} edge */
const beside = (edge) => html`<span class="menu-value" dir="auto">${edge.kind ? edge.recipe.relation ?? '' : which(edge.at)}</span>`
/** A consumer with its `index`th reference changed, written: which version it reads, or when its `ask` runs. @param {string} from @param {number} index @param {(ref: Ref) => Ref} change */
async function choose(from, index, change) {
  const dir = app.projectDir, decks = from.endsWith('.deck.html') ? await import('../skills/decks.js') : null, deck = decks && await decks.load(from, dir)
  if (decks && deck) await decks.rewrite(from, withRef(deck.source, index, change), deck.name, dir)
  else if (!decks) await app.fs.write(`${dir}/${from}`, withRef((await app.fs.read(`${dir}/${from}`)) ?? '', index, change))
  read.at = 0
}
/** When a reference's `ask` runs again, each choice by its `refresh`: by hand, every five minutes, every hour, or as its source changes. */
const PACES = [['', 'compose.byHand'], ['5 min', 'compose.every5'], ['60 min', 'compose.hourly'], ['auto', 'compose.auto']]
/** What the pane's head lists for each place, once read: `source`, a collection, not a whiteboard; `runs`, each `ask`'s last run; `proofs`, the certificates of what each shows, checked. @typedef {{ source: boolean, uses: Edge[], usedIn: Edge[], further: [string, string][], names: Map<string, string>, versions: Map<string, Version[]>, old: Map<Edge, [string, string][]>, runs: Map<Edge, Run | undefined>, proofs: Map<Edge, { chain: import('../receipt/certificate.js').Sealed[], holds: boolean, n?: number } | null>, changes: number, broken: string[] }} Links */
const links = signal(/** @type {Map<string, Links>} */ (new Map()))
/** Each place's links, read as its menu opens. @param {string} uri */
async function linksOf(uri) {
  const dir = app.projectDir, tables = await import('../tables/tables.js'), { edges, names } = await graph(dir), uses = edges.filter((edge) => edge.from === uri && names.has(edge.to))
  const versions = new Map(await Promise.all([...new Set([uri, ...uses.map((edge) => edge.to)])].map(async (place) => /** @type {[string, Version[]]} */ ([place, await versionsOf(dir, place)]))))
  const own = PLACE.test(uri) ? await tables.load(uri, dir).then((one) => (one?.table.kind ? null : one)) : null, last = versions.get(uri)?.at(-1), old = new Map()
  fed ??= own ? await import('../sources/sources.js') : undefined
  for (const edge of uses.filter((one) => !one.kind)) { const live = await tables.load(edge.to, dir).catch(() => null); if (live) old.set(edge, current(live.table, versions.get(edge.to) ?? [], edge.recipe).old) }
  const runs = await runsOf(runsAt(dir, uri)), lastOf = (/** @type {Edge} */ edge) => runs.findLast((one) => one.key === keyOf(refOf(edge))), proofs = new Map()
  // What each shows, certified: its last run's and the version it read, else the version it reads; nothing for the rows as they are.
  for (const edge of uses.filter((one) => !one.kind)) {
    const run = edge.recipe.ask ? lastRun(runs, keyOf(refOf(edge))) : undefined, all = versions.get(edge.to) ?? [], read = run?.read ?? (edge.at === 'published' ? `v${all.at(-1)?.n}` : typeof edge.at === 'number' ? `v${edge.at}` : '')
    const version = all.find((one) => `v${one.n}` === read), chain = [run?.certificate, version?.certificate].filter((one) => one !== undefined)
    proofs.set(edge, chain.length ? { chain, holds: holds(await chainOf(chain)), n: version?.n } : null)
  }
  links.value = new Map(links.peek()).set(uri, { source: Boolean(own), uses, usedIn: edges.filter((edge) => edge.to === uri), further: [...further(edges, uri, true), ...further(edges, uri, false)].filter(([place]) => names.has(place)), names, versions, old, proofs, runs: new Map(uses.map((edge) => [edge, lastOf(edge)])), broken: own && last ? breaks(last.table, own.table) : [],
    changes: own ? own.lines.filter((line) => 'at' in line && line.at > (last?.head ?? '')).length : 0 })
}

/** A creation's glyph, by its folder. */
const KIND = /** @type {Record<string, unknown>} */ ({ collections: icons.table, decks: icons.slides, documents: icons.note, sites: icons.code, prototypes: icons.code })
/** The reference whose settings the links menu shows, as its consumer's place and its index there; the list while it is empty. */
const deep = signal('')
/** Sources' part of a collection's links menu, fetched as the first collection's opens. @type {typeof import('../sources/sources.js') | undefined} */
let fed

/**
 * The pane's head, for a collection, slides or a document: a button whose menu lists what uses it and what it uses, each with the version it
 * reads, then for a collection where its rows come from and its versions, each status under the row it is about. A reference used opens its
 * settings in the same menu, Back returning to the list: the version it shows, when its `ask` runs, its certificate, the collection itself.
 * @param {{ uri: string }} file
 */
function head({ uri }) {
  if (!PLACE.test(uri) && !/^files\/sha256-/.test(uri) && !CONSUMERS.some(([folder, own]) => uri.startsWith(`${folder}/`) && own.test(uri.slice(folder.length + 1)))) return nothing
  const id = `links-${uri}`, these = links.value.get(uri), date = new Intl.DateTimeFormat(intlLocales(locale.value), { dateStyle: 'medium', timeStyle: 'short' }), name = (/** @type {string} */ place) => these?.names.get(place) ?? place
  const open = (/** @type {string} */ place, /** @type {unknown} */ value = nothing) => html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${() => openFile({ type: 'resource_link', uri: place, name: name(place) })}>${KIND[place.split('/')[0]] ?? icons.layers}<span dir="auto">${name(place)}</span>${value}</button>`
  const group = (/** @type {string} */ key, /** @type {unknown[]} */ rows) => (rows.length ? html`<div role="group" aria-label=${t(key)}><p class="menu-heading" aria-hidden="true">${t(key)}</p><ul>${rows}</ul></div>` : nothing)
  /** A line under the row it is about. @param {string} words @param {string} [role] */
  const said = (words, role) => html`<p class="links-said" role=${role ?? nothing}>${words}</p>`
  const go = (/** @type {string} */ to) => { deep.value = to; requestAnimationFrame(() => /** @type {HTMLElement | null | undefined} */ (document.getElementById(id)?.querySelector('button:not(:disabled)'))?.focus()) }
  /** A choice, ticked while it holds. @param {boolean} on @param {string} words @param {() => unknown} pick @param {boolean} off */
  const choice = (on, words, pick, off) => html`<li><button type="button" aria-current=${String(on)} ?disabled=${off} @click=${pick}><span>${words}</span>${on ? icons.check : nothing}</button></li>`
  /** A reference's settings. @param {Edge} edge */
  const settings = (edge) => {
    const site = /^(sites|prototypes)\//.test(edge.from), last = these?.runs.get(edge), proof = these?.proofs.get(edge), set = (/** @type {(ref: Ref) => Ref} */ change) => choose(uri, edge.index, change).then(() => linksOf(uri))
    return html`<button type="button" class="back" @click=${() => go('')}>${icons.back}${t('compose.uses')}</button><hr>${(these?.old.get(edge) ?? []).map(([was, now]) => said(t('compose.old', { old: was, name: now })))}
      ${group('compose.which', /** @type {Edge['at'][]} */ (['live', 'published', ...(these?.versions.get(edge.to) ?? []).map((version) => version.n)]).map((at) => choice(at === edge.at, which(at), () => set((ref) => ({ ...ref, at })), site)))}
      ${edge.recipe.ask ? html`${group('compose.pace', PACES.map(([refresh, key]) => choice((edge.recipe.refresh ?? '') === refresh, t(key), () => set((ref) => ({ ...ref, recipe: { ...Object.fromEntries(Object.entries(ref.recipe).filter(([what]) => what !== 'refresh')), ...(refresh && { refresh }) } })), site)))}
        <ul><li><button type="button" @click=${() => run(refOf(edge), uri, app.projectDir).then(() => linksOf(uri))}>${icons.sync}<span>${t('compose.update')}</span></button>${last ? said(last.error ? t('compose.failed') : t('compose.ran', { date: date.format(new Date(last.at)) }), last.error ? 'alert' : 'status') : nothing}</li></ul>` : nothing}
      <hr><ul>${proof ? html`<li><button type="button" @click=${async () => (await import('../../ui/save.js')).save(new Blob([JSON.stringify(proof.chain, null, 1)], { type: 'application/json' }), `${t('compose.proofFile', { name: name(uri) })}.json`)}>${icons.download}<span>${t('compose.saveProof')}</span></button>
        ${said(proof.holds ? (proof.n ? t('compose.certified', { n: proof.n }) : t('compose.certifiedLive')) : t('compose.unproven'), proof.holds ? 'status' : 'alert')}</li>` : html`<li>${said(t('compose.uncertified'))}</li>`}<li>${open(edge.to)}</li></ul>`
  }
  const all = these?.versions.get(uri) ?? [], edge = these?.uses.find((one) => `${uri} ${one.index}` === deep.value)
  const versions = these?.source ? html`<div role="group" aria-label=${t('compose.versions')}><p class="menu-heading" aria-hidden="true">${t('compose.versions')}</p><ul>
    <li><button type="button" ?disabled=${these.broken.length > 0 || (!these.changes && all.length > 0)} @click=${async () => { const made = await publish(uri); if (made?.version) notify(t('compose.done', { n: made.version.n })); await linksOf(uri) }}>${icons.upload}<span>${t('compose.publish', { n: (all.at(-1)?.n ?? 0) + 1 })}</span></button>
      ${these.broken.length ? said(t('compose.breaks', { columns: listed(these.broken) }), 'alert') : said(t('compose.journal', { count: these.changes }), 'status')}</li>
    ${[...all].reverse().slice(0, 5).map((version) => html`<li><p class="links-past">${t(version.why === 'schema' ? 'compose.versionSchema' : 'compose.version', { n: version.n, date: date.format(new Date(version.at)) })}</p></li>`)}</ul></div>` : nothing
  const list = these && html`${group('compose.usedIn', these.usedIn.map((one) => html`<li>${open(one.from, beside(one))}</li>`))}
    ${group('compose.uses', these.uses.map((one) => (one.kind ? html`<li>${open(one.to, beside(one))}</li>` : html`<li><button type="button" class="submenu" @click=${() => go(`${uri} ${one.index}`)}>${KIND.collections}<span dir="auto">${name(one.to)}</span>${beside(one)}${icons.chevron}</button></li>`)))}
    ${group('compose.further', these.further.map(([place, via]) => html`<li>${open(place, html`<span class="menu-value" dir="auto">${t('compose.through', { name: name(via) })}</span>`)}</li>`))}
    ${these.source && fed ? fed.linked(uri, id) : nothing}${versions}${these.uses.length + these.usedIn.length + these.further.length || these.source ? nothing : html`<p class="menu-heading">${t('compose.none')}</p>`}`
  // Keyed by its place: a pane that shows another creation draws its menu anew, closed; closed, it opens on its list again.
  return keyed(uri, html`<button class="icon-button" popovertarget=${id} aria-label=${t('compose.links')}>${icons.graph}</button>
    <div id=${id} class="menu links-menu" popover @toggle=${(/** @type {ToggleEvent} */ event) => (event.newState === 'open' ? linksOf(uri) : (deep.value = ''))}>${edge ? settings(edge) : list || nothing}</div>`)
}

/** What the brain reads of the graph: what uses a creation and what it uses, each with the version it reads and its recipe, then what is reached further. @type {import('../../core/loop.js').Tool} */
const linksTool = {
  spec: { name: 'creation_links', description: 'What uses a creation of the project and what it uses: the slides, documents, sites and prototypes that show a collection, the collections that relate to it, the files a creation holds, each with the version it reads and its recipe, then what is reached through them. Read it before changing the columns of a collection others show, or to bring up to date what shows it.',
    parameters: { type: 'object', required: ['place'], properties: { place: { type: 'string', description: 'Its place: collections/…, decks/….deck.html, documents/….md, sites/…' } } } },
  kind: 'read',
  title: (args) => t('compose.linking', { name: String(args?.place ?? '') }),
  run: async (args) => {
    const place = String(args?.place ?? '').trim().replace(/^(\.\.?\/)+/, ''), { edges, names } = await graph(), named = (/** @type {string} */ one) => `${names.get(one) ?? one} (${one})`
    const said = (/** @type {Edge} */ edge, /** @type {string} */ other) => [named(other), ...(edge.kind === 'relation' ? [`by its column ${edge.recipe.relation}`] : edge.kind ? [] : [`reading ${edge.at === 'live' ? 'it as it is now' : edge.at === 'published' ? 'its published version' : `its version ${edge.at}`}`, ...Object.entries(edge.recipe).map(([what, value]) => `${what}: ${value}`)])].join(', ')
    const far = [...further(edges, place, true), ...further(edges, place, false)].map(([one, via]) => `${named(one)} through ${names.get(via) ?? via}`)
    return names.has(place) || edges.some((edge) => edge.to === place) ? `${named(place)} is used in: ${edges.filter((edge) => edge.to === place).map((edge) => said(edge, edge.from)).join('; ') || 'nothing'}. It uses: ${edges.filter((edge) => edge.from === place).map((edge) => said(edge, edge.to)).join('; ') || 'nothing'}.${far.length ? ` Further: ${far.join('; ')}.` : ''}` : `No creation of this project is at ${place}.`
  },
}

register({ id: 'compose', tools: [linksTool], lines: [{ name: 'creation_links', line: 'what uses a creation and what it uses, before changing what others show' }], slots: { head: { at: 1, draw: head }, touched: { at: 1, draw: () => null, said: touched } } })
