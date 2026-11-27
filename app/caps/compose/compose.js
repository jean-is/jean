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
import { app, openFile, openConversation, notify, activeBrain, brainsHere } from '../../ui/state.js'
import { markdown, declared, drawn as drawers } from '../../ui/markdown.js'
import { held } from '../../ui/held.js'
import { opened } from '../../ui/dock.js'
import { fire } from '../../core/hooks.js'
import { isLocal, parseFrontMatter, stringifyFrontMatter } from '../../core/settings.js'
import { icons } from '../../ui/menu-icons.js'
import { t, useStrings, locale, intlLocales } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { PLACE } from '../tables/table.js'
import '../tables/tables.js'
import { parseRef, parseFigure, refsIn, loops, refused, versionless, tableOf, chartOf, choiceIn, choicesIn, tinted, withRef, filledPage, written as writtenWith, linksIn, further, standing, DOCUMENT, sectionOf, withId, notesIn } from './refs.js'
import { option } from '../interactive/parts.js'
import { versionOf, loadedOf, reshaped, breaks, current, headOf, asOf, since } from './versions.js'
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
/** The project's design system (ui/kit.js), a source that decks, sites and designs wear (step 11); and a routine's file, its request a consumer (step 12). */
const KIT = 'kit.json', ROUTINE = /(^|\/)routines\/[^/]+\.md$/
/** The design system a project wears and versions, as its page edits it: its own, the person's for the home project (ui/kit.js `kitPath()`). @param {string} dir */
const kitFile = (dir) => (app.project.peek().data.default === true && dir === app.projectDir ? KIT : `${dir}/${KIT}`)
/** A site's or a prototype's pages, read by its record. @param {string} record @returns {(path: string, dir: string) => Promise<{ source: string, name: string, wears?: Ref['at'] } | null>} */
const pagesOf = (record) => async (path, dir) => ((one) => one && Promise.all(one.files.filter((/** @type {string} */ file) => file.endsWith('.html')).map((/** @type {string} */ file) => app.fs.read(`${dir}/${path}/${file}`))).then((pages) => ({ source: pages.join('\n'), name: one.name, wears: one.look?.id === 'project' ? /** @type {Ref['at']} */ ('live') : undefined })))(JSON.parse((await app.fs.read(`${dir}/${path}/${record}`)) ?? 'null'))
/** The kinds that hold references, by folder: which entries are their own, and the text and name read from one, and the version of the design system it wears. @type {[string, RegExp, (path: string, dir: string) => Promise<{ source: string, name: string, wears?: Ref['at'] } | null>][]} */
const CONSUMERS = [['decks', /\.deck\.html$/, async (path, dir) => ((one) => one && { ...one, wears: /^\d+$/.test(one.meta.kit ?? '') ? Number(one.meta.kit) : /** @type {Ref['at']} */ (one.meta.kit === 'published' ? 'published' : 'live') })(await (await import('../skills/decks.js')).load(path, dir))],
  ['documents', /^[^.].*\.md$/, async (path, dir) => ((text) => (text ? { source: text, name: /^name: *(.+)$/m.exec(text)?.[1] ?? /^# (.+)$/m.exec(text)?.[1] ?? path } : null))(await app.fs.read(`${dir}/${path}`))],
  ['sites', /^[^.][^.]*$/, pagesOf('site.json')], ['prototypes', /^[^.][^.]*$/, pagesOf('prototype.json')],
  // A game's rows and a design's, each a reference in its file (`from`), and the pictures a design holds.
  ['games', /\.game\.html$/, async (path, dir) => ((one) => one && { source: blockOf(one.meta.from), name: one.name })((await import('../games/file.js')).gameOf((await app.fs.read(`${dir}/${path}`)) ?? ''))],
  ['designs', /\.svg$/, async (path, dir) => ((one) => one && { source: [blockOf(one.from), ...one.parts.map((part) => part.file ?? '')].join('\n'), name: one.name, wears: one.take?.[1] === 'project' || one.take?.[2] === 'own' ? /** @type {Ref['at']} */ ('live') : undefined })((await import('../designs/format.js')).fromSvg((await app.fs.read(`${dir}/${path}`)) ?? ''))]]
/** A reference a file holds as a value (a game's, a design's `from`), as a block, which the graph reads. @param {string} [from] */
const blockOf = (from) => (from ? `\`\`\`table\n${from}\n\`\`\`` : '')
const HOW = () => ({ locales: intlLocales(locale.peek()), labels: { yes: '✓', no: '' }, today: new Date() })

/** The project's graph, each reference and each creation's name by its place, and the links that are no references (./refs.js `linksIn()`): read again once a consumer or a collection's columns are written, else every five minutes at most (a folder changed outside Jean), from what each file gave it but those written since (`once()`). */
let read = { at: 0, dir: '', graph: /** @type {Promise<typeof known> | null} */ (null) }
/** The graph as it was last read, for what must answer at once (a toast's words), with each collection's columns' kinds. */
let known = { edges: /** @type {Edge[]} */ ([]), names: /** @type {Map<string, string>} */ (new Map()), kinds: /** @type {Map<string, Map<string, string>>} */ (new Map()) }
/** The blocks of the answers that name a collection (../../ui/held.js), each making its task a consumer. */
const answers = held({ fence: 'table', record: 'reference', named: () => '', extension: 'md', mimeType: 'text/markdown' })
/** What each file gave the graph, by its path, kept until the watcher below sees it written, or for five minutes (a folder changed outside Jean): read again, the graph reads only those. @type {Map<string, Promise<any>>} */
const files = new Map()
let fresh = 0
/** @template T @param {string} path @param {() => Promise<T>} make @returns {Promise<T | null>} */
const once = (path, make) => files.get(path) ?? (files.set(path, make().catch(() => null)), /** @type {Promise<T | null>} */ (files.get(path)))
function graph(dir = app.projectDir) {
  if (Date.now() - fresh > 300_000) files.clear(), fresh = Date.now()
  if (read.dir !== dir || Date.now() - read.at > 300_000) read = { at: Date.now(), dir, graph: (async () => {
    const tables = await import('../tables/tables.js'), names = new Map(), edges = /** @type {Edge[]} */ ([]), kinds = new Map(), kit = await app.fs.exists(kitFile(dir))
    if (kit) names.set(KIT, t('compose.kit'))
    for (const folder of await tables.folders(dir).catch(() => [])) {
      const table = await once(`${dir}/${folder}/collection.json`, () => app.fs.read(`${dir}/${folder}/collection.json`).then((text) => JSON.parse(text ?? 'null')))
      if (table) names.set(folder, table.name), kinds.set(folder, new Map((table?.properties ?? []).map((/** @type {{ id: string, type: string }} */ { id, type }) => [id, type]))), edges.push(...linksIn(folder, table))
    }
    for (const [folder, own, readOf] of CONSUMERS) for (const { name } of (await app.fs.list(`${dir}/${folder}`).catch(() => [])).filter((entry) => own.test(entry.name))) {
      const path = `${folder}/${name}`, one = await once(`${dir}/${path}`, async () => ((got) => got && { name: got.name, wears: got.wears, edges: [...refsIn(got.source).map((ref, index) => ({ from: path, to: ref.place, at: ref.at, recipe: ref.recipe, index })), ...linksIn(path, null, got.source)] })(await readOf(path, dir)))
      if (one) names.set(path, one.name), edges.push(...one.edges, ...(kit && one.wears !== undefined ? [{ from: path, to: KIT, at: one.wears, recipe: {}, index: -1, kind: /** @type {const} */ ('kit') }] : []))
    }
    // A routine whose request holds a reference reads it as it runs (../routines/routines.js), the project's routines where Routines keeps them.
    for (const one of await (await import('../routines/schedule.js')).listRoutines(app.fs, app.project.peek().data.default === true && dir === app.projectDir ? '' : dir).catch(() => [])) if (refsIn(one.request).length) names.set(one.path, one.title), edges.push(...refsIn(one.request).map((ref, index) => ({ from: one.path, to: ref.place, at: ref.at, recipe: ref.recipe, index })))
    for (const { path, name, source } of /** @type {(import('../../ui/creations.js').Creation & { source: string })[]} */ (await answers.kept(dir).catch(() => []))) {
      const ref = parseRef(source), from = path.slice(0, path.indexOf('#'))
      if (ref) names.set(from, name), edges.push({ from, to: ref.place, at: ref.at, recipe: ref.recipe, index: Number(path.slice(path.indexOf('#') + 1)) })
    }
    if (wanted === dir) setTimeout(() => mapped(dir))
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

/** Where a source's versions are kept: a collection's in its folder, a document's beside the documents, as Jean's suggestions wait (../documents/documents.js). @param {string} place */
const versionsAt = (place) => (place === KIT ? '.versions/kit' : DOCUMENT.test(place) ? place.replace(/^documents\//, 'documents/.versions/').replace(/\.md$/, '') : `${place}/versions`)
/** A source's versions, the first first; a document's each its whole text (`text`). @param {string} dir @param {string} place @returns {Promise<(Version & { text?: string })[]>} */
const versionsOf = async (dir, place) => (await Promise.all((await app.fs.list(`${dir}/${versionsAt(place)}`).catch(() => [])).filter((entry) => /^\d+\.json$/.test(entry.name))
  .map(async (entry) => JSON.parse((await app.fs.read(`${dir}/${versionsAt(place)}/${entry.name}`)) ?? 'null')))).filter(Boolean).sort((a, b) => a.n - b.n)

/** A document's text, its front matter aside, as a reference reads it: as it is now, or at the version it names; null where it has none. @param {Pick<Ref, 'place' | 'at'>} ref @param {string} dir */
const textAt = async (ref, dir) => (ref.at === 'live' ? ((text) => (text === null ? null : parseFrontMatter(text).body))(await app.fs.read(`${dir}/${ref.place}`))
  : ((versions) => (ref.at === 'published' ? versions.at(-1) : versions.find((one) => one.n === ref.at))?.text ?? null)(await versionsOf(dir, ref.place)))
/**
 * What a reference to a document shows: its section's Markdown (./refs.js `sectionOf()`), or why it shows none. A section found by its heading's words gets
 * their id written after them, once, so that a rename keeps it (the editor takes the change in). @param {Ref} ref @param {string} from @param {string} dir @returns {Promise<{ why?: string, words?: string }>}
 */
async function sectionShown(ref, from, dir) {
  const why = refused({ denied: isDenied('documents'), shared: false, loop: Boolean(from && loops((await graph(dir)).edges, from, ref.place)), found: await app.fs.exists(`${dir}/${ref.place}`) }), body = why ? null : await textAt(ref, dir), found = body === null ? null : sectionOf(body, ref.recipe.section)
  if (found && ref.recipe.section && !found.id && ref.at === 'live') void app.fs.read(`${dir}/${ref.place}`).then((text) => (text ? ((read) => app.fs.write(`${dir}/${ref.place}`, stringifyFrontMatter(read.data, withId(read.body, found.line, String(ref.recipe.section)))))(parseFrontMatter(text)) : undefined))
  return why || body === null || !found ? { why: why || (body === null ? versionless(ref.at) : 'section') } : { words: found.text }
}
/** Why a document's section shows none, in words. @param {string} why @param {Ref['at']} at */
const unsaid = (why, at) => t(why === 'loop' ? 'compose.loop' : `compose.document.${why}`, { n: Number(at) })
/** A document's section drawn, a slide's or a document's, again as the document or its versions change while it shows. @param {HTMLElement} box @param {Ref} ref @param {string} from @param {string} dir */
function sectionIn(box, ref, from, dir) {
  const draw = () => sectionShown(ref, from, dir).then(({ why, words }) => render(why ? html`<p class="deck-words">${unsaid(why, ref.at)}</p>` : html`<div class="composed-section" dir="auto">${markdown(words ?? '')}</div>`, box))
  const unwatch = app.fs.watch?.((path) => (!box.isConnected && box.firstChild ? unwatch?.() : (path === `${dir}/${ref.place}` || path.startsWith(`${dir}/${versionsAt(ref.place)}/`)) && void draw()), { all: true })
  void draw()
}
/** A section's Markdown as a site's page holds it: drawn as Jean draws Markdown, lit's marks taken out of the tree, never out of its text, then its HTML read back. @param {string} words */
const htmlOf = (words) => ((holder, marks = document.createNodeIterator(holder, NodeFilter.SHOW_COMMENT)) => { render(markdown(words), holder); for (let mark = marks.nextNode(); mark; mark = marks.nextNode()) mark.parentNode?.removeChild(mark); return holder.innerHTML })(document.createElement('div'))

/** A collection's port, while its owner keeps it open; null otherwise. @param {string} dir @param {string} folder @returns {Promise<Port | null>} */
const portOf = async (dir, folder) => { try { return JSON.parse((await app.fs.read(`${dir}/${folder}/port.json`)) ?? 'null') } catch { return null } }

/**
 * What a reference shows of a collection loaded, at the version it reads (`read`), its recipe's old names read as the columns are named now; or
 * why it shows nothing; its columns as it reads them (`table`). @param {Ref} ref @param {NonNullable<Loaded>} live @param {string} dir @returns {Promise<{ why?: string, rows?: string[][], read?: string, old?: [string, string][], certificate?: import('../receipt/certificate.js').Sealed, table?: import('../tables/table.js').Table, list?: boolean }>}
 */
async function resolved(ref, live, dir, most = 12) {
  const versions = await versionsOf(dir, ref.place), version = ref.at === 'published' ? versions.at(-1) : versions.find((one) => one.n === ref.at)
  if (ref.at !== 'live' && !version) return { why: versionless(ref.at) }
  const base = version ? loadedOf(version) : live, { table, recipe, old } = current(base.table, versions, ref.recipe)
  const read = version ? `v${version.n}` : headOf(live.lines), notes = recipe.section && table.kind === 'whiteboard' ? notesIn(base.rows, recipe.section) : undefined
  // A whiteboard's section: its notes' words, as a list.
  if (notes !== undefined) return notes ? { rows: [[''], ...notes.map((note) => [note])], read, list: true, certificate: version?.certificate } : { why: 'area' }
  try { return { rows: tableOf({ ...base, table }, recipe, HOW(), most), read, old, certificate: version?.certificate, table } } catch { return { why: 'recipe' } }
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
 * @param {Ref} ref @param {string} from @param {string} dir @param {string} [then] the time it reads its source at, an answer's @returns {Promise<Run | null>}
 */
async function run(ref, from, dir, then = '') {
  const live = !isDenied('tables') && ref.recipe.ask ? await (await import('../tables/tables.js')).load(ref.place, dir).catch(() => null) : null, shown = live && await resolved(ref, then ? asOf(live, then) : live, dir, 200)
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
/** The run a reference's block shows: its last good one, else one made now, the first time it shows; in an answer, the one on its source as it was then. @param {Ref} ref @param {string} from @param {string} dir @param {string} [then] */
const shownRun = async (ref, from, dir, then = '') => ((last) => (last ? { output: last.output } : run(ref, from, dir, then).then((line) => (line?.output !== undefined ? { output: line.output } : { why: 'unasked' }))))(then ? undefined : lastRun(await runsOf(runsAt(dir, from)), keyOf(ref)))
/** When the answer a box is in was written, '' outside one or while it is written: what it shows of a collection is as it was then (D188). @param {Element} box */
const answered = (box) => box.closest('article.msg-jean')?.querySelector('.msg-actions time')?.getAttribute('datetime') ?? ''

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
  const ref = parseRef(source), pane = /** @type {any} */ (box.closest('app-preview')), from = pane ? String(pane.file?.peek()?.uri ?? '') : box.closest('article.msg-jean') ? `conversations/${app.current.peek()?.id}.jsonl` : '', dir = app.projectDir
  const shared = !pane && Boolean(app.current.peek()?.records.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'shared'))
  if (ref && DOCUMENT.test(ref.place)) return void sectionIn(box, ref, from, dir)
  const tables = ref && !isDenied('tables') && !shared ? await import('../tables/tables.js') : null, live = ref && tables && await tables.load(ref.place, dir).catch(() => null)
  const why = refused({ denied: isDenied('tables'), shared, loop: Boolean(ref && from && loops((await graph(dir)).edges, from, ref.place)), found: Boolean(live) })
  const chart = Boolean(ref?.recipe.chart && !ref.recipe.ask) && await unlock('charts')
  // A chart's box, as an `echarts` block's is: the chart its own for the printer and PowerPoint's writer, which makes it a chart of its own.
  if (chart) box.classList.replace('deck-table', 'deck-echarts'), Object.defineProperty(box, 'chart', { get: () => /** @type {any} */ (box.querySelector('app-chart'))?.chart ?? null, configurable: true })
  // A choice, in a cell or as a bar, in the colour Tables gives it.
  const pills = (/** @type {ReturnType<typeof choiceIn>} */ property, /** @type {string} */ cell) => (property ? choicesIn(property, cell).map(({ name, hue, group }) => html`<span class="table-pill composed-pill" dir="auto" data-hue=${hue ?? nothing} data-group=${group ?? nothing}>${name}</span>`) : cell)
  const show = (/** @type {{ why?: string, rows?: string[][], output?: string, table?: import('../tables/table.js').Table, after?: unknown, list?: boolean }} */ { why, rows: all = [], output, table, after = nothing, list }, [heads = [], ...rows] = all, by = table && choiceIn(table, heads[0])) => render(html`${why ? html`<p class="deck-words">${t(`compose.${why}`)}</p>` : list ? html`<ul>${rows.map(([note]) => html`<li dir="auto">${note}</li>`)}</ul>` : output !== undefined ? html`<div dir="auto">${markdown(output)}</div>`
    : chart ? html`<app-chart live ?svg=${Boolean(dress)} source=${JSON.stringify(((drawing) => (dress ? dress(drawing) : drawing))(tinted(option(chartOf(all, ref?.recipe.chart)), rows.map(([label]) => (by ? painted(choicesIn(by, label)[0], box) : undefined)))))}></app-chart>`
    : ((columns) => html`<table><thead><tr>${heads.map((head) => html`<th dir="auto">${head}</th>`)}</tr></thead><tbody>${rows.map((row) => html`<tr>${row.map((cell, i) => html`<td dir="auto">${pills(columns[i], cell)}</td>`)}</tr>`)}</tbody></table>`)(heads.map((head) => (table ? choiceIn(table, head) : null)))}${after}`, box)
  if (why || !ref || !live || !tables) return void show({ why: why || 'missing' })
  const where = signal(/** @type {Loaded} */ (live)), holds = /** @type {(() => void)[]} */ ([]), fresh = signal(false)
  tables.watched(where, holds)
  const stop = effect(() => {
    const now = (ran.value, where.value), then = ref.at === 'live' ? answered(box) : '', at = fresh.value ? '' : then, count = then && now ? since(now.lines, then) : 0
    if (!box.isConnected && box.firstElementChild?.nextSibling) return void (stop?.(), holds.forEach((hold) => hold()))
    // In an answer, the collection as it was then, and how many changes came since, which it shows as it is now, written nowhere.
    const after = count ? html`<p class="composed-since">${t('compose.since', { count })} <button type="button" class="link-button" @click=${() => { fresh.value = !fresh.value }}>${t(fresh.value ? 'compose.then' : 'compose.now')}</button></p>` : nothing
    if (now) (ref.recipe.ask ? shownRun(ref, from, dir, at) : resolved(ref, at ? asOf(now, at) : now, dir)).then((one) => show({ ...one, after }))
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
    const then = ref.at === 'live' ? answered(root) : ''
    return live ? new Promise((resolve) => { const stop = effect(() => void (code.isConnected ? resolved(ref, then ? asOf(live.value, then) : live.value, dir).then(put).then(resolve) : (stop?.(), resolve(null)))); holds.push(stop) }) : put({ why: why || 'missing' })
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
// An answer's figures (../../ui/markdown.js draws them as code), worked out as the collection was when it was written.
customElements.define('app-figures', class extends HTMLElement { connectedCallback() { this.live = ((answer) => answer && liven(/** @type {HTMLElement} */ (answer), undefined, '.prose code'))(this.closest('article.msg-jean')) } disconnectedCallback() { this.live?.stop() } })
// A collection's block in an answer: a reference too, its task the consumer, as the collection was when the answer was written.
drawers.value = { ...drawers.peek(), table: (source, open) => (open || !parseRef(source) ? null : html`<app-composed source=${source}></app-composed>`) }
effect(() => { if (!declared.value.has('table')) declared.value = new Set([...declared.value, 'table']) })
customElements.define('app-composed', class extends HTMLElement { connectedCallback() { void drawn(this, this.getAttribute('source') ?? '') } })
// A figure in a document's words (../documents/drawn.js), as a slide's is.
customElements.define('app-figure', class extends HTMLElement { connectedCallback() { this.replaceChildren(Object.assign(document.createElement('code'), { textContent: this.getAttribute('source') })), this.live = liven(this, undefined, 'code') } disconnectedCallback() { this.live?.stop() } })

/** A site's pages, as it is read (../sites/kind.js), each table or section that says `data-from` filled as its reference shows it now, those that can't be as written. @param {Map<string, Uint8Array>} files @param {string} dir */
export async function composed(files, dir) {
  const tables = isDenied('tables') ? null : await import('../tables/tables.js'), [decode, encode] = [new TextDecoder(), new TextEncoder()]
  for (const [file, bytes] of files) if (file.endsWith('.html')) files.set(file, encode.encode(filledPage(decode.decode(bytes), await Promise.all(refsIn(decode.decode(bytes)).map(async (ref) => {
    if (DOCUMENT.test(ref.place)) return ((one) => (one.words === undefined ? null : htmlOf(one.words)))(await sectionShown(ref, '', dir))
    const live = tables && await tables.load(ref.place, dir).catch(() => null)
    return live ? (await resolved(ref, live, dir)).rows ?? null : null
  })))))
  return files
}

/** A collection's rows as a page or a design is given them (../games/page.js, ../designs/export.js): each by its columns' names, as its reference shows it, 200 at most; none where it can't. @param {string} source @param {string} from @param {string} [dir] @returns {Promise<Record<string, string>[]>} */
export async function given(source, from, dir = app.projectDir) {
  const ref = parseRef(source), live = ref && PLACE.test(ref.place) && !isDenied('tables') && !(from && loops((await graph(dir)).edges, from, ref.place)) ? await (await import('../tables/tables.js')).load(ref.place, dir).catch(() => null) : null
  const [heads = [], ...rows] = (ref && live && (await resolved(ref, live, dir, 200)).rows) || []
  return rows.map((row) => Object.fromEntries(heads.map((head, i) => [head, row[i]])))
}

/** Markdown as it leaves Jean (../made/paper.js, ../slides/save.js), each reference as its consumer, `from`, shows it now (./refs.js). @param {string} text @param {string} from */
export const written = (text, from, dir = app.projectDir) => writtenWith(text, async (ref) => {
  if (DOCUMENT.test(ref.place)) return ((one) => ({ words: one.words ?? unsaid(String(one.why), ref.at) }))(await sectionShown(ref, from, dir))
  const live = isDenied('tables') ? null : await (await import('../tables/tables.js')).load(ref.place, dir).catch(() => null), why = refused({ denied: isDenied('tables'), shared: false, loop: Boolean(from && loops((await graph(dir)).edges, from, ref.place)), found: Boolean(live) })
  const one = /** @type {{ why?: string, rows?: string[][], output?: string, list?: boolean }} */ (why || !live ? { why: why || 'missing' } : ref.recipe.ask ? await shownRun(ref, from, dir) : await resolved(ref, live, dir))
  return { rows: one.rows, words: one.why ? t(`compose.${one.why}`) : one.list ? one.rows?.slice(1).map(([note]) => `- ${note}`).join('\n') : one.output }
})

/**
 * A version of a collection made, its author's or for its columns changed (`schema`), when they differ from the last version's; none where a
 * column would break, whose names it gives instead. @param {string} folder @param {Version['why']} [why] @param {string} [dir]
 * @returns {Promise<{ version?: Version, broken?: string[] } | null>}
 */
export async function publish(folder, why = 'published', dir = app.projectDir) {
  if (DOCUMENT.test(folder) || folder === KIT) return publishText(folder, dir)
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
/** A document's version, or the design system's, its whole text frozen and certified, when it differs from the last one's. @param {string} place @param {string} dir @returns {Promise<{ version: any } | null>} */
async function publishText(place, dir) {
  const [body, versions] = await Promise.all([place === KIT ? app.fs.read(kitFile(dir)) : textAt({ place, at: 'live' }, dir), versionsOf(dir, place)]), last = versions.at(-1)
  if (body === null || body === last?.text) return null
  const version = { format: 1, n: (last?.n ?? 0) + 1, at: new Date().toISOString(), by: 'user', why: 'published', text: body }
  Object.assign(version, await certified({ kind: place === KIT ? 'kit' : 'document', creation: place === KIT ? ulidOf(app.project.peek().dir ?? '') : ulidOf(place), n: version.n, at: version.at, by: version.by, content: body }))
  await app.fs.write(`${dir}/${versionsAt(place)}/${version.n}.json`, `${JSON.stringify(version, null, 1)}\n`)
  return { version }
}
/**
 * A creation changed: each reference to it whose `ask` runs as its source changes (its user opted in, `refresh: auto`) run again once changes
 * stop coming for a while, then what uses that consumer, so far deep at most; a routine whose request reads it so is set off, one clock for both.
 * @param {string} place @param {string} dir
 */
async function propagate(place, dir, depth = 0) {
  if (depth < DEPTH) for (const edge of (await graph(dir)).edges.filter((one) => one.to === place && paceOf(one.recipe).auto && (one.recipe.ask || ROUTINE.test(one.from)))) {
    clearTimeout(later.get(`${edge.from}#${edge.index}`))
    later.set(`${edge.from}#${edge.index}`, setTimeout(async () => {
      if (ROUTINE.test(edge.from)) return void ((await unlock('routines')) && (await import('../routines/routines.js')).changed(edge.from))
      if ((await run(refOf(edge), edge.from, dir))?.output !== undefined) void propagate(edge.from, dir, depth + 1)
    }, GATHER))
  }
}
// A collection changed, here, in another tab or by Sync: what runs as it changes; and, its columns changed, a version of them once it has versions.
// A consumer written: the graph is read again, a second later, so that a toast's words are as it is.
const later = new Map()
app.fs.watch?.((path) => {
  for (const key of files.keys()) if (path === key || path.startsWith(`${key}/`)) files.delete(key)
  const [, dir, folder, file] = /^(.*)\/(collections\/[^/]+)\/(collection\.json|changes\.jsonl|versions\/\d+\.json)$/.exec(path) ?? []; if (/(^|\/)(decks|documents|sites|prototypes|games|designs|routines)\/|(^|\/)(collection|kit|port)\.json$|\/versions\/\d+\.json$/.test(path)) read.at = 0, checked.clear(), (inside.value = new Map(inside.peek())), clearTimeout(later.get('graph')), later.set('graph', setTimeout(() => app.projectDir && graph(), 1000))
  if (file === 'collection.json') clearTimeout(later.get(folder)), later.set(folder, setTimeout(() => publish(folder, 'schema', dir), 500)), dir === app.projectDir && void retyped(folder, dir)
  if (folder && dir === app.projectDir) void propagate(folder, dir)
  // The design system changed: each site on show that wears it is drawn again in it, at once (../sites/kind.js dresses it at each read).
  if (/(^|\/)kit\.json$/.test(path)) for (const edge of known.edges.filter((one) => one.kind === 'kit' && /^(sites|prototypes)\//.test(one.from) && opened.peek().includes(one.from))) void import('../../ui/preview.js').then(({ preview }) => preview({ uri: edge.from, name: known.names.get(edge.from) ?? '', title: known.names.get(edge.from) ?? '', mimeType: 'text/html' }))
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
const beside = (edge) => html`<span class="menu-value" dir="auto">${edge.kind && edge.kind !== 'kit' ? edge.recipe.relation ?? '' : edge.from.startsWith('conversations/') && edge.at === 'live' ? t('compose.answer') : which(edge.at)}</span>`
/** A consumer with its `index`th reference changed, written: which version it reads, or when its `ask` runs. @param {string} from @param {number} index @param {(ref: Ref) => Ref} change */
async function choose(from, index, change) {
  const dir = app.projectDir, decks = from.endsWith('.deck.html') ? await import('../skills/decks.js') : null, deck = decks && await decks.load(from, dir)
  if (decks && deck) await decks.rewrite(from, withRef(deck.source, index, change), deck.name, dir)
  else if (!decks) await app.fs.write(`${dir}/${from}`, withRef((await app.fs.read(`${dir}/${from}`)) ?? '', index, change))
  read.at = 0
}
/** When a reference's `ask` runs again, each choice by its `refresh`: by hand, every five minutes, every hour, or as its source changes. */
const PACES = [['', 'compose.byHand'], ['5 min', 'compose.every5'], ['60 min', 'compose.hourly'], ['auto', 'compose.auto']]
/** What the pane's head lists for each place, once read: `source`, a collection, not a whiteboard; `runs`, each `ask`'s last run; `proofs`, the certificates of what each shows, checked. @typedef {{ source: boolean, fed: boolean, uses: Edge[], usedIn: Edge[], names: Map<string, string>, versions: Map<string, (Version & { text?: string })[]>, old: Map<Edge, [string, string][]>, runs: Map<Edge, Run | undefined>, proofs: Map<Edge, { chain: import('../receipt/certificate.js').Sealed[], holds: boolean, n?: number } | null>, changes: number, broken: string[] }} Links */
const links = signal(/** @type {Map<string, Links>} */ (new Map()))
/** Whether each place is in the graph, read as its pane's head first draws and again after any change of the graph, the last answer kept meanwhile so that an open menu stays: a link to or from it, a version, an open port or a source (a routine naming it). */
const inside = signal(/** @type {Map<string, boolean>} */ (new Map())), asking = new Set(), checked = new Set()
const within = (/** @type {string} */ uri, dir = app.projectDir) => (asking.add(uri), checked.add(uri), Promise.all([graph(dir), versionsOf(dir, uri), PLACE.test(uri) && portOf(dir, uri), PLACE.test(uri) ? import('../routines/schedule.js').then(({ listRoutines }) => listRoutines(app.fs, app.project.peek().data.default === true ? '' : dir)).catch(() => []) : []])
  .then(([{ edges }, versions, port, routines]) => { asking.delete(uri); inside.value = new Map(inside.peek()).set(uri, edges.some((edge) => edge.from === uri || edge.to === uri) || versions.length > 0 || Boolean(port) || routines.some((one) => one.request.includes(uri))) }))
/** Each place's links, read as its menu opens. @param {string} uri */
async function linksOf(uri) {
  const dir = app.projectDir, tables = await import('../tables/tables.js'), { edges, names } = await graph(dir), uses = edges.filter((edge) => edge.from === uri && names.has(edge.to))
  const versions = new Map(await Promise.all([...new Set([uri, ...uses.map((edge) => edge.to)])].map(async (place) => /** @type {[string, (Version & { text?: string })[]]} */ ([place, await versionsOf(dir, place)]))))
  const loaded = PLACE.test(uri) ? await tables.load(uri, dir) : null, own = loaded?.table.kind ? null : loaded, last = versions.get(uri)?.at(-1), old = new Map(), text = DOCUMENT.test(uri) ? await textAt({ place: uri, at: 'live' }, dir) : uri === KIT ? await app.fs.read(kitFile(dir)) : null
  fed ??= own ? await import('../sources/sources.js') : undefined
  for (const edge of uses.filter((one) => !one.kind)) { const live = await tables.load(edge.to, dir).catch(() => null); if (live) old.set(edge, current(live.table, versions.get(edge.to) ?? [], edge.recipe).old) }
  const runs = await runsOf(runsAt(dir, uri)), lastOf = (/** @type {Edge} */ edge) => runs.findLast((one) => one.key === keyOf(refOf(edge))), proofs = new Map()
  // What each shows, certified: its last run's and the version it read, else the version it reads; nothing for the rows as they are.
  for (const edge of uses.filter((one) => !one.kind || one.kind === 'kit')) {
    const run = edge.recipe.ask ? lastRun(runs, keyOf(refOf(edge))) : undefined, all = versions.get(edge.to) ?? [], read = run?.read ?? (edge.at === 'published' ? `v${all.at(-1)?.n}` : typeof edge.at === 'number' ? `v${edge.at}` : '')
    const version = all.find((one) => `v${one.n}` === read), chain = [run?.certificate, version?.certificate].filter((one) => one !== undefined)
    proofs.set(edge, chain.length ? { chain, holds: holds(await chainOf(chain)), n: version?.n } : null)
  }
  links.value = new Map(links.peek()).set(uri, { source: Boolean(loaded) || text !== null, fed: Boolean(own), uses, usedIn: edges.filter((edge) => edge.to === uri), names, versions, old, proofs, runs: new Map(uses.map((edge) => [edge, lastOf(edge)])), broken: loaded && last ? breaks(last.table, loaded.table) : [],
    changes: loaded ? loaded.lines.filter((line) => 'at' in line && line.at > (last?.head ?? '')).length : Number(text !== null && text !== last?.text) })
}

/** A creation's glyph, by its folder. */
const KIND = /** @type {Record<string, unknown>} */ ({ conversations: icons.task, collections: icons.table, decks: icons.slides, documents: icons.note, sites: icons.code, prototypes: icons.code, games: icons.play, designs: icons.palette, [KIT]: icons.palette, routines: icons.sync })
/** A creation opened from the graph, as its kind opens: the design system's page or the routines' in Settings, a task, else beside the task. @param {string} place @param {string} name */
const opening = (place, name) => (place === KIT || ROUTINE.test(place) ? import('../../ui/dialogs.js').then(({ openSettings }) => openSettings(ROUTINE.test(place) ? 'routines' : app.project.peek().data.default === true ? 'appearance/kit' : 'appearance/kit-project')) : place.startsWith('conversations/') ? openConversation(`${app.projectDir}/${place}`) : openFile({ type: 'resource_link', uri: place, name }))
/**
 * What the map draws (./map.js): the creations that references, relations and forms link, by their places so that the same graph is laid out the same, those
 * about `here` alone when it names one (what it uses and what uses it, as far as they go); each by its name and glyph, a consumer with the versions it reads.
 * @param {string} dir @param {string} [here] @returns {Promise<import('./map.js').Drawing>}
 */
async function drawingOf(dir, here = '') {
  const { edges: all, names } = await graph(dir), edges = all.filter((edge) => edge.kind !== 'file' && edge.kind !== 'kit' && names.has(edge.from) && names.has(edge.to))
  const latest = new Map(await Promise.all([...new Set(all.filter((edge) => typeof edge.at === 'number').map((edge) => edge.to))].map(async (place) => /** @type {[string, number]} */ ([place, (await versionsOf(dir, place)).at(-1)?.n ?? 0]))))
  const near = here && new Set([here, ...edges.flatMap((edge) => (edge.from === here ? [edge.to] : edge.to === here ? [edge.from] : [])), ...[...further(edges, here, true), ...further(edges, here, false)].map(([one]) => one)])
  // A consumer whose source is gone is drawn too, saying it shows nothing.
  const places = [...new Set([...edges.flatMap((edge) => [edge.from, edge.to]), ...all.filter((edge) => !edge.kind && names.has(edge.from) && !names.has(edge.to)).map((edge) => edge.from)])].filter((place) => !near || near.has(place)).sort()
  // One line between two creations for each way they link, however many blocks hold it; each block's version said all the same.
  const drawn = edges.filter((edge) => places.includes(edge.from) && places.includes(edge.to)), stands = (/** @type {string} */ place) => standing(place, all, (one) => names.has(one), (one) => latest.get(one) ?? 0)
  return { places, edges: [...new Map(drawn.map((edge) => [`${edge.from} ${edge.to} ${edge.kind ?? ''}`, edge])).values()], here, name: (place) => names.get(place) ?? place, glyph: (place) => KIND[place.split('/')[0]] ?? icons.layers, open: (place) => opening(place, names.get(place) ?? place), alert: (place) => new Set(stands(place).filter(([key]) => /missing|loop/.test(key)).map(([key]) => t(`compose.${key}`))),
    said: (place) => [...new Set([...drawn.filter((edge) => edge.from === place && !edge.kind).map((edge) => (place.startsWith('conversations/') && edge.at === 'live' ? t('compose.answer') : which(edge.at))), ...stands(place).map(([key, given]) => (key === 'brain' ? String(given.name) : t(`compose.${key}`, given)))])] }
}
/** The project's map, Creations' (../../ui/creations-page.js) once three creations are linked: drawn as Creations first asks, then again each time the graph is read, with the map's module. */
const whole = signal(/** @type {{ dir: string, drawing: import('./map.js').Drawing, drawn: typeof import('./map.js').drawn } | null} */ (null))
let wanted = ''
const mapped = (dir = app.projectDir) => ((wanted = dir), Promise.all([drawingOf(dir), import('./map.js')]).then(([drawing, { drawn }]) => { whole.value = drawing.places.length > 2 ? { dir, drawing, drawn } : null }))
/** The reference whose settings the links menu shows, as its consumer's place and its index there; the list while it is empty. */
const deep = signal('')
/** Whether the menu shows every creation that uses its own, past the first five, and the words they are found by among them. */
const every = signal(false), among = signal('')
/** Sources' part of a collection's links menu, fetched as the first collection's opens. @type {typeof import('../sources/sources.js') | undefined} */
let fed

/**
 * The pane's head, for a creation in the graph, none for one outside it: a button whose menu lists what uses it and what it uses, each with the version it
 * reads, then for a collection where its rows come from and its versions, each status under the row it is about. A reference used opens its
 * settings in the same menu, Back returning to the list: the version it shows, when its `ask` runs, its certificate, the collection itself.
 * @param {{ uri: string }} file
 */
function head({ uri }) {
  if (!PLACE.test(uri) && !/^files\/sha256-/.test(uri) && !CONSUMERS.some(([folder, own]) => uri.startsWith(`${folder}/`) && own.test(uri.slice(folder.length + 1)))) return nothing
  if (!checked.has(uri) && !asking.has(uri)) void within(uri)
  if (!inside.value.get(uri)) return nothing
  const id = `links-${uri}`, these = links.value.get(uri), date = new Intl.DateTimeFormat(intlLocales(locale.value), { dateStyle: 'medium', timeStyle: 'short' }), name = (/** @type {string} */ place) => these?.names.get(place) ?? place
  const open = (/** @type {string} */ place, /** @type {unknown} */ value = nothing) => html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${() => opening(place, name(place))}>${KIND[place.split('/')[0]] ?? icons.layers}<span dir="auto">${name(place)}</span>${value}</button>`
  const group = (/** @type {string} */ key, /** @type {unknown[]} */ rows) => (rows.length ? html`<div role="group" aria-label=${t(key)}><p class="menu-heading" aria-hidden="true">${t(key)}</p><ul>${rows}</ul></div>` : nothing)
  /** A line under the row it is about. @param {string} words @param {string} [role] */
  const said = (words, role) => html`<p class="links-said" role=${role ?? nothing}>${words}</p>`
  const go = (/** @type {string} */ to) => { deep.value = to; requestAnimationFrame(() => /** @type {HTMLElement | null | undefined} */ (document.getElementById(id)?.querySelector('button:not(:disabled)'))?.focus()) }
  /** A choice, ticked while it holds. @param {boolean} on @param {string} words @param {() => unknown} pick @param {boolean} off */
  const choice = (on, words, pick, off) => html`<li><button type="button" aria-current=${String(on)} ?disabled=${off} @click=${pick}><span>${words}</span>${on ? icons.check : nothing}</button></li>`
  /** A reference's settings. @param {Edge} edge */
  const settings = (edge) => {
    const site = /^(sites|prototypes|games|designs)\//.test(edge.from), last = these?.runs.get(edge), proof = these?.proofs.get(edge), set = (/** @type {(ref: Ref) => Ref} */ change) => (edge.kind === 'kit' ? import('../skills/decks.js').then((decks) => decks.wear(uri, change(refOf(edge)).at)).then(() => { read.at = 0 }) : choose(uri, edge.index, change)).then(() => linksOf(uri))
    return html`<button type="button" class="back" @click=${() => go('')}>${icons.back}${t('compose.uses')}</button><hr>${(these?.old.get(edge) ?? []).map(([was, now]) => said(t('compose.old', { old: was, name: now })))}
      ${group('compose.which', /** @type {Edge['at'][]} */ (['live', 'published', ...(these?.versions.get(edge.to) ?? []).map((version) => version.n)]).map((at) => choice(at === edge.at, which(at), () => set((ref) => ({ ...ref, at })), site)))}
      ${edge.recipe.ask ? html`${group('compose.pace', PACES.map(([refresh, key]) => choice((edge.recipe.refresh ?? '') === refresh, t(key), () => set((ref) => ({ ...ref, recipe: { ...Object.fromEntries(Object.entries(ref.recipe).filter(([what]) => what !== 'refresh')), ...(refresh && { refresh }) } })), site)))}
        <ul><li><button type="button" @click=${() => run(refOf(edge), uri, app.projectDir).then(() => linksOf(uri))}>${icons.sync}<span>${t('compose.update')}</span></button>${last ? said(last.error ? t('compose.failed') : t('compose.ran', { date: date.format(new Date(last.at)) }), last.error ? 'alert' : 'status') : nothing}</li></ul>` : nothing}
      <hr><ul>${proof ? html`<li><button type="button" @click=${async () => (await import('../../ui/save.js')).save(new Blob([JSON.stringify(proof.chain, null, 1)], { type: 'application/json' }), `${t('compose.proofFile', { name: name(uri) })}.json`)}>${icons.download}<span>${t('compose.saveProof')}</span></button>
        ${said(proof.holds ? (proof.n ? t(edge.to === KIT ? 'compose.kit.certified' : DOCUMENT.test(edge.to) ? 'compose.document.certified' : 'compose.certified', { n: proof.n }) : t('compose.certifiedLive')) : t('compose.unproven'), proof.holds ? 'status' : 'alert')}</li>` : html`<li>${said(t('compose.uncertified'))}</li>`}<li>${open(edge.to)}</li></ul>`
  }
  const all = these?.versions.get(uri) ?? [], edge = these?.uses.find((one) => `${uri} ${one.index}` === deep.value)
  const versions = these?.source ? html`<div role="group" aria-label=${t('compose.versions')}><p class="menu-heading" aria-hidden="true">${t('compose.versions')}</p><ul>
    <li><button type="button" ?disabled=${these.broken.length > 0 || (!these.changes && all.length > 0)} @click=${async () => { const made = await publish(uri); if (made?.version) notify(t('compose.done', { n: made.version.n })); await linksOf(uri) }}>${icons.upload}<span>${t('compose.publish', { n: (all.at(-1)?.n ?? 0) + 1 })}</span></button>
      ${these.broken.length ? said(t('compose.breaks', { columns: listed(these.broken) }), 'alert') : said(t('compose.journal', { count: these.changes }), 'status')}</li>
    ${[...all].reverse().slice(0, 5).map((version) => html`<li><p class="links-past">${t(version.why === 'schema' ? 'compose.versionSchema' : 'compose.version', { n: version.n, date: date.format(new Date(version.at)) })}</p></li>`)}</ul></div>` : nothing
  /** What a reference shows, said under its row where its consumer reads that source more than once: a figure, a brain's words, a chart, a section, a table and its columns. @param {Edge} edge */
  const shows = ({ recipe }) => (recipe.total ? t('compose.shows.figure') : recipe.ask ? t('compose.shows.ask') : recipe.chart ? t('compose.shows.chart', { by: recipe.by ?? '' }) : recipe.section ? t('compose.shows.section', { section: recipe.section })
    : recipe.fields ? t('compose.shows.columns', { columns: listed(recipe.fields.split('|').map((one) => one.trim())) }) : t('compose.shows.table'))
  // Each creation that uses it once, however many of its blocks read it and at whichever version: the first five, then, once asked, all of them, found by their
  // names past eight; how they link further along is drawn (See them drawn), never listed.
  const users = these ? [...new Map(these.usedIn.map((one) => [`${one.from} ${one.kind ?? ''}`, one])).values()] : [], words = among.value.trim().toLocaleLowerCase()
  const more = () => { every.value = true; requestAnimationFrame(() => /** @type {HTMLElement | null | undefined} */ (document.getElementById(id)?.querySelector('.links-find, [role="group"] li:nth-child(6) button'))?.focus()) }
  const list = these && html`${group('compose.usedIn', [...(every.value && users.length > 8 ? [html`<li><input type="search" class="links-find" dir="auto" title=${t('compose.find')} placeholder=${t('compose.find')} .value=${among.value} @input=${(/** @type {Event} */ e) => { among.value = /** @type {HTMLInputElement} */ (e.target).value }}></li>`] : []),
      ...(every.value ? users.filter((one) => name(one.from).toLocaleLowerCase().includes(words)) : users.slice(0, 5)).map((one) => html`<li>${open(one.from, beside(one))}</li>`),
      ...(users.length > 5 && !every.value ? [html`<li><button type="button" @click=${more}>${icons.list}<span>${t('compose.all', { count: users.length })}</span></button></li>`] : [])])}
    ${group('compose.uses', these.uses.map((one) => (one.kind && one.kind !== 'kit' ? html`<li>${open(one.to, beside(one))}</li>` : html`<li><button type="button" class="submenu" @click=${() => go(`${uri} ${one.index}`)}>${KIND[one.to.split('/')[0]]}<span dir="auto">${name(one.to)}</span>${beside(one)}${icons.chevron}</button>
      ${!one.kind && these.uses.filter((other) => !other.kind && other.to === one.to).length > 1 ? said(shows(one)) : nothing}</li>`)))}
    ${these.uses.concat(these.usedIn).some((one) => one.kind !== 'file' && one.kind !== 'kit') ? html`<ul><li><button type="button" popovertarget=${id} popovertargetaction="hide" @click=${() => Promise.all([drawingOf(app.projectDir, uri), import('./map.js')]).then(([drawing, map]) => map.sheet(name(uri), drawing))}>${icons.graph}<span>${t('compose.drawn')}</span></button></li></ul>` : nothing}
    ${these.fed && fed ? fed.linked(uri, id) : nothing}${versions}`
  // Keyed by its place: a pane that shows another creation draws its menu anew, closed; closed, it opens on its list again.
  return keyed(uri, html`<button class="icon-button" popovertarget=${id} aria-label=${t('compose.links')}>${icons.graph}</button>
    <div id=${id} class="menu links-menu" popover @toggle=${(/** @type {ToggleEvent} */ event) => (event.newState === 'open' ? linksOf(uri) : (deep.value = '', every.value = false, among.value = ''))}>${edge ? settings(edge) : list || nothing}</div>`)
}

/** What the brain reads of the graph: what uses a creation and what it uses, each with the version it reads and its recipe, then what is reached further; or, given no place, every creation that uses another, and what shows nothing and why. @type {import('../../core/loop.js').Tool} */
const linksTool = {
  spec: { name: 'creation_links', description: 'What uses a creation of the project and what it uses: the slides, documents, sites and prototypes that show a collection, the collections that relate to it, the sites whose form proposes rows to it, the files a creation holds, each with the version it reads and its recipe, then what is reached through them; with no place, every creation of the project that uses another, and what shows nothing. Read it before changing the columns of a collection others show, to bring up to date what shows it, or to tell how the project’s creations link.',
    parameters: { type: 'object', properties: { place: { type: 'string', description: 'Its place: collections/…, decks/….deck.html, documents/….md, sites/…; none for the whole project' } } } },
  kind: 'read',
  title: (args) => (args?.place ? t('compose.linking', { name: String(args.place) }) : t('compose.linkingAll')),
  run: async (args) => {
    const place = String(args?.place ?? '').trim().replace(/^(\.\.?\/)+/, ''), { edges, names } = await graph(), named = (/** @type {string} */ one) => `${names.get(one) ?? one} (${one})`
    const said = (/** @type {Edge} */ edge, /** @type {string} */ other) => [named(other), ...(edge.kind === 'relation' ? [`by its column ${edge.recipe.relation}`] : edge.kind === 'form' ? [`proposing rows to it through its form ${edge.recipe.form}`] : edge.kind ? [] : [`reading ${edge.at === 'live' ? 'it as it is now' : edge.at === 'published' ? 'its published version' : `its version ${edge.at}`}`, ...Object.entries(edge.recipe).map(([what, value]) => `${what}: ${value}`)]),
      ...(edge.kind || names.has(edge.to) ? [] : ['showing nothing, as this project has no such creation']), ...(!edge.kind && loops(edges, edge.from, edge.to) ? ['showing nothing, as each would use the other, in a loop'] : [])].join(', ')
    const all = edges.filter((edge) => edge.kind !== 'file' && edge.kind !== 'kit')
    if (!place) return all.length ? `In this project, ${[...new Set(all.map((edge) => edge.from))].map((from) => `${named(from)} uses ${all.filter((edge) => edge.from === from).map((edge) => said(edge, edge.to)).join('; ')}`).join('. ')}.` : 'No creation of this project uses another.'
    const far = [...further(edges, place, true), ...further(edges, place, false)].map(([one, via]) => `${named(one)} through ${names.get(via) ?? via}`)
    return names.has(place) || edges.some((edge) => edge.to === place) ? `${named(place)} is used in: ${edges.filter((edge) => edge.to === place).map((edge) => said(edge, edge.from)).join('; ') || 'nothing'}. It uses: ${edges.filter((edge) => edge.from === place).map((edge) => said(edge, edge.to)).join('; ') || 'nothing'}.${far.length ? ` Further: ${far.join('; ')}.` : ''}` : `No creation of this project is at ${place}.`
  },
}

/**
 * A routine's run, certified once it ends as a recipe's run is, and kept with the routine's runs: what it read, each reference of its request at the
 * version it read, and the rows it added to the collections its request names (a source's, caps/sources), its request the recipe; so rows from
 * elsewhere carry where they came from. The brain is the one the room's messages have, as a routine's most often is. @param {{ routine?: string, answer: string, at: string }} turn
 */
async function routineRan({ routine, answer, at }) {
  const dir = app.projectDir, request = routine ? parseFrontMatter((await app.fs.read(routine)) ?? '').body : '', places = [...new Set(request.match(/collections\/[0-9A-HJKMNP-TV-Z]{26}-[^\s)\]`'"<>@#]+/g) ?? [])].filter((place) => PLACE.test(place))
  if (!routine || !places.length || isDenied('tables')) return
  const tables = await import('../tables/tables.js'), brain = activeBrain.peek(), file = runsAt(dir, routine), runs = await runsOf(file)
  const read = (await Promise.all(refsIn(request).filter((ref) => PLACE.test(ref.place)).map(async (ref) => Promise.resolve(((live) => live && resolved(ref, live, dir))(await tables.load(ref.place, dir).catch(() => null)))
    .then(async (shown) => (shown?.read ? [{ kind: /** @type {const} */ ('collection'), creation: ref.place.slice(12, 38), read: shown.read, ...(shown.certificate && { certificate: await imprint(shown.certificate) }) }] : []))))).flat()
  const added = Object.fromEntries((await Promise.all(places.map(async (place) => [place, ((await tables.load(place, dir).catch(() => null))?.lines ?? []).filter((line) => 'at' in line && line.at >= at && line.by === 'jean')]))).filter(([, lines]) => lines.length))
  const line = /** @type {Run & { wrote: string[] }} */ ({ format: 1, key: 'routine', n: runs.filter((one) => one.key === 'routine').length + 1, at: new Date().toISOString(), read: read.map((one) => one.read).join(' '), brain: brain ? `${brain.provider}:${brain.model}` : '', output: answer, wrote: Object.keys(added) })
  Object.assign(line, await certified({ kind: 'run', creation: ulidOf(routine), n: line.n, at: line.at, by: 'jean', content: JSON.stringify({ answer, added }), recipe: { request }, ingredients: read,
    ...(brain && { brain: { provider: brain.provider, model: brain.model, local: isLocal(brain) } }) }))
  await app.fs.append(file, `${JSON.stringify(line)}\n`)
}

/** The project's design system's part of its page (../slides/kit-page.js): what wears it, and Publish version N, as a collection's menu has it. @param {string | null} dir the project's, on its page */
function kitPart(dir) {
  const these = dir && links.value.get(KIT), all = these ? these.versions.get(KIT) ?? [] : []
  if (dir && !these) void linksOf(KIT)
  return these ? html`<section><h3>${t('compose.versions')}</h3>${these.usedIn.length ? html`<p class="hint">${t('compose.kit.worn', { names: listed(these.usedIn.map((edge) => these.names.get(edge.from) ?? edge.from)) })}</p>` : nothing}
    <p><button type="button" class="button" ?disabled=${!these.changes && all.length > 0} @click=${async () => { const made = await publish(KIT); if (made?.version) notify(t('compose.done', { n: made.version.n })); await linksOf(KIT) }}>${t('compose.publish', { n: (all.at(-1)?.n ?? 0) + 1 })}</button></p></section>` : nothing
}

register({ id: 'compose', tools: [linksTool], lines: [{ name: 'creation_links', line: 'what uses a creation and what it uses, before changing what others show' }], hooks: [{ on: 'turn.end', run: (e, next) => ((read.at = 0), e.routine && void routineRan(e).catch(console.warn), next(e)) }], slots: { head: { at: 1, draw: head }, answer: { at: 9, draw: (/** @type {{ text: string }} */ { text }) => (/`=\s*collections\//.test(text) ? html`<app-figures hidden></app-figures>` : nothing) }, touched: { at: 1, draw: () => null, said: touched }, kit: { at: 1, draw: kitPart },
  // Creations' map, those its kind and words keep lit (all of them when null), offered once it is drawn for this project.
  map: { at: 1, named: () => t('compose.map'), ready: () => (wanted === app.projectDir || void mapped(), whole.value?.dir === app.projectDir), draw: (/** @type {Set<string> | null} */ lit) => ((one) => (one ? one.drawn({ ...one.drawing, lit }) : nothing))(whole.value?.dir === app.projectDir ? whole.value : null) } } })
