// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D762): a consumer's ```table block (a slide's, a document's) or a site's table that says `data-from`
// shows a collection of its project: the journal's head (live), its latest version (published) or one version (pinned), read again at each
// resolution, the reader's right asked each time (./refs.js), and drawn again as the collection changes while it shows. A collection's
// versions (./versions.js) are made when its author publishes one or its columns change, never on a row's change. The pane's head says, for a
// collection, slides or a document, what it uses and what uses it, which version each reads, and for a collection its versions and what
// changed since the last. A reference's `ask` is run by a brain (./recipes.js) the first time it shows, then by hand, every so many minutes or
// as its source changes, as its user chose, each run kept on the consumer's side. Each version and each run is certified (./proof.js), as an
// answer is, and the consumer's menu checks the chain back to the collection's version. What people outside propose comes in through the
// collection's port alone (./ports.js), into its journal, and shows only once its owner approves it. Loaded with Tables.
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
import { PLACE } from '../tables/table.js'
import { parseRef, refsIn, loops, refused, versionless, tableOf, withRef, filledPage } from './refs.js'
import { versionOf, loadedOf, reshaped, breaks, current, headOf } from './versions.js'
import { keyOf, paceOf, askOf, lastRun, due, PROMPT, DEPTH, GATHER } from './recipes.js'
import { credentialOf, chainOf, holds } from './proof.js'
import { admitted, owned, waiting, portOf as portFor } from './ports.js'
import { imprint } from '../receipt/certificate.js'

await useStrings('compose')

/** @import { Edge, Ref } from './refs.js' */
/** @import { Version } from './versions.js' */
/** @import { Run } from './recipes.js' */
/** @import { Port, Proposal } from './ports.js' */
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

/** A collection's port, while its owner keeps it open; null otherwise. @param {string} dir @param {string} folder @returns {Promise<Port | null>} */
const portOf = async (dir, folder) => { try { return JSON.parse((await app.fs.read(`${dir}/${folder}/port.json`)) ?? 'null') } catch { return null } }

/**
 * What a reference shows of a collection loaded, at the version it reads (`read`), its recipe's old names read as the columns are named now; or
 * why it shows nothing. @param {Ref} ref @param {NonNullable<Loaded>} live @param {string} dir @returns {Promise<{ why?: string, rows?: string[][], read?: string, old?: [string, string][], certificate?: import('../receipt/certificate.js').Sealed }>}
 */
async function resolved(ref, live, dir, most = 12) {
  const versions = await versionsOf(dir, ref.place), version = ref.at === 'published' ? versions.at(-1) : versions.find((one) => one.n === ref.at)
  if (ref.at !== 'live' && !version) return { why: versionless(ref.at) }
  // The journal's head, its approval column holding only what its owner set; a version was frozen so.
  const base = version ? loadedOf(version) : owned(live, await portOf(dir, ref.place)), { table, recipe, old } = current(base.table, versions, ref.recipe)
  try { return { rows: tableOf({ ...base, table }, recipe, HOW(), most), read: version ? `v${version.n}` : headOf(live.lines), old, certificate: version?.certificate } } catch { return { why: 'recipe' } }
}

/** Where a consumer's runs are kept, by its ULID, or its task's for slides in an answer: composed/<ulid>.jsonl, appended, never edited. @param {string} dir @param {string} from */
const runsAt = (dir, from) => `${dir}/composed/${ulidOf(from)}.jsonl`, ulidOf = (/** @type {string} */ from) => /[0-9A-HJKMNP-TV-Z]{26}/.exec(from)?.[0] ?? app.current.peek()?.id ?? 'answers'
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
  const brain = brainsHere.peek().find((one) => [one.id, one.label, one.model].includes(ref.recipe.brain ?? '')) ?? activeBrain.peek(), at = runsAt(dir, from), runs = await runsOf(at), key = keyOf(ref)
  if (!shown?.rows || !shown.read || !brain) return null
  const { rows, read, certificate } = shown, same = lastRun(runs, key, read, `${brain.provider}:${brain.model}`), once = `${at} ${key} ${read} ${brain.id}`
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

/**
 * A consumer's `table` block drawn, a slide's (Slides' `BLOCKS`) or a document's (`<app-composed>`): the collection it names, read now and as
 * it changes while the block shows, at the version it reads, as its recipe shows it, or why it can't be shown here. @param {HTMLElement} box @param {string} source
 */
export async function drawn(box, source) {
  const ref = parseRef(source), pane = /** @type {any} */ (box.closest('app-preview')), from = String(pane?.file?.peek()?.uri ?? ''), dir = app.projectDir
  const shared = !pane && Boolean(app.current.peek()?.records.some(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'shared'))
  const tables = ref && !isDenied('tables') && !shared ? await import('../tables/tables.js') : null, live = ref && tables && await tables.load(ref.place, dir).catch(() => null)
  const why = refused({ denied: isDenied('tables'), shared, loop: Boolean(ref && from && loops((await graph(dir)).edges, from, ref.place)), found: Boolean(live) })
  const show = (/** @type {{ why?: string, rows?: string[][], output?: string }} */ { why, rows: [heads = [], ...rows] = [], output }) => render(why ? html`<p class="deck-words">${t(`compose.${why}`)}</p>` : output !== undefined ? html`<div dir="auto">${markdown(output)}</div>`
    : html`<table><thead><tr>${heads.map((head) => html`<th dir="auto">${head}</th>`)}</tr></thead><tbody>${rows.map((row) => html`<tr>${row.map((cell) => html`<td dir="auto">${cell}</td>`)}</tr>`)}</tbody></table>`, box)
  if (why || !ref || !live || !tables) return void show({ why: why || 'missing' })
  const where = signal(/** @type {Loaded} */ (live)), holds = /** @type {(() => void)[]} */ ([])
  tables.watched(where, holds)
  const stop = effect(() => {
    const now = (ran.value, where.value)
    if (!box.isConnected && box.firstElementChild?.nextSibling) return void (stop?.(), holds.forEach((hold) => hold()))
    if (now) (ref.recipe.ask ? shownRun(ref, from, dir) : resolved(ref, now, dir)).then(show)
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
  const version = versionOf(owned(one, await portOf(dir, folder)), { n: (last?.n ?? 0) + 1, at: new Date().toISOString(), by: 'user', why })
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
// A consumer written: the graph is read again.
const later = new Map()
app.fs.watch?.((path) => {
  const [, dir, folder, file] = /^(.*)\/(collections\/[^/]+)\/(collection\.json|changes\.jsonl|versions\/\d+\.json)$/.exec(path) ?? []
  if (/\/(decks|documents|sites)\//.test(path)) read.at = 0
  if (file === 'collection.json') clearTimeout(later.get(folder)), later.set(folder, setTimeout(() => publish(folder, 'schema', dir), 500))
  if (folder && dir === app.projectDir) void propagate(folder, dir)
}, { all: true })
// Each minute, the references whose `ask` runs every so many minutes, those due run.
setInterval(async () => {
  for (const edge of app.projectDir ? (await graph(app.projectDir)).edges : []) if (edge.recipe.ask && due(lastRun(await runsOf(runsAt(app.projectDir, edge.from)), keyOf(refOf(edge))), paceOf(edge.recipe).every, Date.now())) void run(refOf(edge), edge.from, app.projectDir)
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
/** A collection's port opened by its owner: every column a form fills, approved in its first box, or in one made for it. @param {string} folder */
async function openPort(folder) {
  const dir = app.projectDir, tables = await import('../tables/tables.js'), one = await tables.load(folder, dir), box = (/** @type {Loaded} */ one) => one?.table.properties.find((p) => !p.deleted && p.type === 'checkbox')
  const now = one && !box(one) ? (await tables.reshapeTable(one, { add: { name: t('compose.approved'), type: 'checkbox' } }), await tables.load(folder, dir)) : one, approval = box(now)
  if (now && approval) await app.fs.write(`${dir}/${folder}/port.json`, `${JSON.stringify(portFor(now.table, approval.id, new Date().toISOString()), null, 1)}\n`)
}

/** Which version a reference reads, in words. @param {Edge['at']} at */
const which = (at) => (typeof at === 'number' ? t('compose.pinned', { n: at }) : t(`compose.${at}`))
/** A consumer with its `index`th reference changed, written: which version it reads, or when its `ask` runs. @param {string} from @param {number} index @param {(ref: Ref) => Ref} change */
async function choose(from, index, change) {
  const dir = app.projectDir, decks = from.endsWith('.deck.html') ? await import('../skills/decks.js') : null, deck = decks && await decks.load(from, dir)
  if (decks && deck) await decks.rewrite(from, withRef(deck.source, index, change), deck.name, dir)
  else if (!decks) await app.fs.write(`${dir}/${from}`, withRef((await app.fs.read(`${dir}/${from}`)) ?? '', index, change))
  read.at = 0
}
/** When a reference's `ask` runs again, each choice by its `refresh`: by hand, every five minutes, every hour, or as its source changes. */
const PACES = [['', 'compose.byHand'], ['5 min', 'compose.every5'], ['60 min', 'compose.hourly'], ['auto', 'compose.auto']]
/** What the pane's head lists for each place, once read; `runs`, each `ask`'s last run; `proofs`, the certificates of what each shows, checked. @typedef {{ uses: Edge[], usedIn: Edge[], names: Map<string, string>, versions: Map<string, Version[]>, old: Map<Edge, [string, string][]>, runs: Map<Edge, Run | undefined>, proofs: Map<Edge, { chain: import('../receipt/certificate.js').Sealed[], holds: boolean, n?: number } | null>, changes: number, broken: string[], port?: { columns: string, approval: string, waiting: number } | null }} Links */
const links = signal(/** @type {Map<string, Links>} */ (new Map()))
/** Each place's links, read as its menu opens. @param {string} uri */
async function linksOf(uri) {
  const dir = app.projectDir, tables = await import('../tables/tables.js'), { edges, names } = await graph(dir), uses = edges.filter((edge) => edge.from === uri && names.has(edge.to))
  const versions = new Map(await Promise.all([...new Set([uri, ...uses.map((edge) => edge.to)])].map(async (place) => /** @type {[string, Version[]]} */ ([place, await versionsOf(dir, place)]))))
  const own = PLACE.test(uri) ? await tables.load(uri, dir) : null, last = versions.get(uri)?.at(-1), old = new Map(), port = own && await portOf(dir, uri), named = (/** @type {string} */ id) => own?.table.properties.find((p) => p.id === id)?.name ?? id
  for (const edge of uses) { const live = await tables.load(edge.to, dir).catch(() => null); if (live) old.set(edge, current(live.table, versions.get(edge.to) ?? [], edge.recipe).old) }
  const runs = await runsOf(runsAt(dir, uri)), lastOf = (/** @type {Edge} */ edge) => runs.findLast((one) => one.key === keyOf(refOf(edge))), proofs = new Map()
  // What each shows, certified: its last run's and the version it read, else the version it reads; nothing for the rows as they are.
  for (const edge of uses) {
    const run = edge.recipe.ask ? lastRun(runs, keyOf(refOf(edge))) : undefined, all = versions.get(edge.to) ?? [], read = run?.read ?? (edge.at === 'published' ? `v${all.at(-1)?.n}` : typeof edge.at === 'number' ? `v${edge.at}` : '')
    const version = all.find((one) => `v${one.n}` === read), chain = [run?.certificate, version?.certificate].filter((one) => one !== undefined)
    proofs.set(edge, chain.length ? { chain, holds: holds(await chainOf(chain)), n: version?.n } : null)
  }
  links.value = new Map(links.peek()).set(uri, { uses, usedIn: edges.filter((edge) => edge.to === uri), names, versions, old, proofs, runs: new Map(uses.map((edge) => [edge, lastOf(edge)])), broken: own && last ? breaks(last.table, own.table) : [],
    changes: own ? own.lines.filter((line) => 'at' in line && line.at > (last?.head ?? '')).length : 0,
    port: own && port ? { columns: new Intl.ListFormat(intlLocales(locale.peek())).format(port.columns.map(named)), approval: named(port.approval), waiting: waiting(own, port) } : null })
}

/** The pane's head, for a collection, slides or a document: a button whose menu lists what it uses and what uses it, each opening it; for a collection, its versions. @param {{ uri: string }} file */
function head({ uri }) {
  if (!PLACE.test(uri) && !CONSUMERS.some(([folder, own]) => uri.startsWith(`${folder}/`) && own.test(uri.slice(folder.length + 1)))) return nothing
  const id = `links-${uri}`, these = links.value.get(uri), date = new Intl.DateTimeFormat(intlLocales(locale.value), { dateStyle: 'medium', timeStyle: 'short' }), name = (/** @type {string} */ place) => these?.names.get(place) ?? place
  const open = (/** @type {string} */ place, /** @type {unknown} */ value = nothing) => html`<button type="button" popovertarget=${id} popovertargetaction="hide" @click=${() => openFile({ type: 'resource_link', uri: place, name: name(place) })}><span dir="auto">${name(place)}</span>${value}</button>`
  const group = (/** @type {string} */ key, /** @type {unknown[]} */ rows) => (rows.length ? html`<div role="group" aria-label=${t(key)}><p class="menu-heading" aria-hidden="true">${t(key)}</p><ul>${rows}</ul></div>` : nothing)
  const uses = (these?.uses ?? []).map((edge) => html`<li>${open(edge.to)}<select title=${t('compose.which')} ?disabled=${edge.from.startsWith('sites/')}
    @change=${(/** @type {Event} */ event) => ((value) => choose(uri, edge.index, (ref) => ({ ...ref, at: /^\d/.test(value) ? Number(value) : /** @type {'live' | 'published'} */ (value) })).then(() => linksOf(uri)))(/** @type {HTMLSelectElement} */ (event.target).value)}>
    ${['live', 'published', ...(these?.versions.get(edge.to) ?? []).map((version) => version.n)].map((at) => html`<option value=${String(at)} ?selected=${at === edge.at}>${which(/** @type {Edge['at']} */ (at))}</option>`)}</select>
    ${(these?.old.get(edge) ?? []).map(([was, now]) => html`<p class="menu-heading">${t('compose.old', { old: was, name: now })}</p>`)}${edge.recipe.ask ? ((last) => html`<select title=${t('compose.pace')} ?disabled=${edge.from.startsWith('sites/')}
      @change=${(/** @type {Event} */ event) => choose(uri, edge.index, (ref) => ((refresh) => ({ ...ref, recipe: { ...Object.fromEntries(Object.entries(ref.recipe).filter(([what]) => what !== 'refresh')), ...(refresh && { refresh }) } }))(/** @type {HTMLSelectElement} */ (event.target).value)).then(() => linksOf(uri))}>
      ${PACES.map(([refresh, key]) => html`<option value=${refresh} ?selected=${(edge.recipe.refresh ?? '') === refresh}>${t(key)}</option>`)}</select>
      <button type="button" @click=${() => run(refOf(edge), uri, app.projectDir).then(() => linksOf(uri))}>${icons.sync}<span>${t('compose.update')}</span></button>
      ${last ? html`<p class="menu-heading" role=${last.error ? 'alert' : 'status'}>${last.error ? t('compose.failed') : t('compose.ran', { date: date.format(new Date(last.at)) })}</p>` : nothing}`)(these?.runs.get(edge)) : nothing}
    ${((proof) => (proof ? html`<p class="menu-heading" role=${proof.holds ? 'status' : 'alert'}>${proof.holds ? (proof.n ? t('compose.certified', { n: proof.n }) : t('compose.certifiedLive')) : t('compose.unproven')}</p>
      <button type="button" @click=${async () => (await import('../../ui/save.js')).save(new Blob([JSON.stringify(proof.chain, null, 1)], { type: 'application/json' }), `${t('compose.proofFile', { name: name(uri) })}.json`)}>${icons.download}<span>${t('compose.saveProof')}</span></button>`
      : html`<p class="menu-heading">${t('compose.uncertified')}</p>`))(these?.proofs.get(edge))}</li>`)
  const versions = PLACE.test(uri) && these ? html`<div role="group" aria-label=${t('compose.versions')}><p class="menu-heading" aria-hidden="true">${t('compose.versions')}</p>
    <p class="menu-heading" role="status">${t('compose.journal', { count: these.changes })}</p>${these.broken.length ? html`<p class="menu-heading" role="alert">${t('compose.breaks', { columns: new Intl.ListFormat(intlLocales(locale.value)).format(these.broken) })}</p>` : nothing}
    <ul><li><button type="button" ?disabled=${these.broken.length > 0} @click=${async () => { const made = await publish(uri); if (made?.version) notify(t('compose.done', { n: made.version.n })); await linksOf(uri) }}>${icons.upload}<span>${t('compose.publish', { n: (these.versions.get(uri)?.at(-1)?.n ?? 0) + 1 })}</span></button></li>
    ${[...these.versions.get(uri) ?? []].reverse().slice(0, 5).map((version) => html`<li><p class="menu-heading">${t(version.why === 'schema' ? 'compose.versionSchema' : 'compose.version', { n: version.n, date: date.format(new Date(version.at)) })}</p></li>`)}</ul></div>
    <div role="group" aria-label=${t('compose.ports')}><p class="menu-heading" aria-hidden="true">${t('compose.ports')}</p>${these.port ? html`<p class="menu-heading">${t('compose.port', these.port)}</p>
      <p class="menu-heading" role="status">${t('compose.waiting', { count: these.port.waiting })}</p>` : nothing}<ul><li><button type="button" @click=${async () => { await (these.port ? app.fs.remove(`${app.projectDir}/${uri}/port.json`) : openPort(uri)); await linksOf(uri) }}>
      ${icons[these.port ? 'close' : 'plug']}<span>${t(these.port ? 'compose.close' : 'compose.open')}</span></button></li></ul></div>` : nothing
  // Keyed by its place: a pane that shows another creation draws its menu anew, closed.
  return keyed(uri, html`<button class="icon-button" popovertarget=${id} aria-label=${t('compose.links')}>${icons.layers}</button>
    <div id=${id} class="menu out-menu" popover @toggle=${(/** @type {ToggleEvent} */ event) => event.newState === 'open' && linksOf(uri)}>${these ? html`${versions}${group('compose.uses', uses)}
      ${group('compose.usedIn', these.usedIn.map((edge) => html`<li>${open(edge.from, html`<span class="menu-value">${which(edge.at)}</span>`)}</li>`))}${these.uses.length + these.usedIn.length || versions !== nothing ? nothing : html`<p class="menu-heading">${t('compose.none')}</p>`}` : nothing}</div>`)
}

register({ id: 'compose', slots: { head: { at: 1, draw: head } } })
