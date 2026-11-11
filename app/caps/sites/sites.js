// Sites (D720): websites of a few pages the brain makes with its skill "Make a site". Each is a folder of the project,
// `sites/<ulid>-<slug>` (./file.js), made or replaced whole by `site` and changed by exact passages with `site_change`; each call
// checks it, from its files (./check.js) and as its pages show at a phone's and a computer's width (./frame.js), and tells the
// brain what to fix before it is shown. A site opens beside the task at a phone's, a tablet's or a computer's width, its links leading
// to its other pages, and leaves as a zip of its files, or goes online at a name of its own where the share host publishes
// sites (./publish.js). A page on its own (a file, an app, a game, a deck) goes online the same way, as a site of one page made from it
// (publishPage). Among the creations once the project holds one; until then its card to start one. Found by its skill, which brings it
// (D401), or by a page's Publish…; nothing of it shows before. Its words are retyped in place and its parts pointed at for the brain in its
// pane (./hand.js, D741); what the brain changes after the turn it made the site waits as its version, `sites/.suggested/<ulid>-<slug>`,
// for the person to accept or reject (D505).
import { html, svg } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, conversationOf, notify } from '../../ui/state.js'
import { register, unlock } from '../../ui/caps.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { ask, reread, page } from '../../ui/creations.js'
import { styleSheet } from '../../ui/sheet.js'
import { save } from '../../ui/save.js'
import { noteRecord } from '../../core/events.js'
import { taskFiles, fileNamed } from '../../core/files.js'
import { writeZip } from '../../core/zip.js'
import { ulid } from '../../core/ulid.js'
import { slug } from '../../core/settings.js'
import { t, useStrings } from '../../core/i18n.js'
import { PLACE, RECORD, pathIn, changed, sited, waitingOf, retyped } from './file.js'
import { offered } from './offer.js'
import { checkFiles, told } from './check.js'
import { LINES, SITE, CHANGE } from './tool.js'
import { shown, pageOf } from './frame.js'
import { LOOK, dealt, projectLook, worn, cssOf, saidOf } from './look.js'
import { lookHere, hexOf } from '../../ui/kit.js'

await Promise.all([useStrings('sites'), styleSheet(new URL('sites.css', import.meta.url))])

/** A browser's window. */
const GLYPH = icon(svg`<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 9h18M6 7h.01M8.5 7h.01M7 13h6M7 16h4"/>`)

/** @typedef {import('./file.js').SiteRecord} SiteRecord */
/** @typedef {{ dir: string, path: string, record: SiteRecord, files: Map<string, Uint8Array> }} One */

/** Its skill in the room, as reading it would bring it (D401). */
const skill = async () => { if (await unlock('skills')) await (await import('../skills/skills.js')).bring(['site']).catch(console.warn) }

/** A site's record, or its waiting version's; null when there is none. @param {string} path @param {string} [dir] @returns {Promise<SiteRecord | null>} */
const recordOf = async (path, dir = app.projectDir) => (PLACE.test(path.replace(/^sites\/\.suggested\//, 'sites/')) ? ((record) => (record?.format ? record : null))(JSON.parse((await app.fs.read(`${dir}/${path}/${RECORD}`).catch(() => null)) ?? 'null')) : null)
/** A site of a project and its files; null when there is none. @param {string} path @param {string} [dir] @returns {Promise<One | null>} */
export async function load(path, dir = app.projectDir) {
  const record = await recordOf(path, dir).catch(() => null)
  if (!record) return null
  const files = new Map()
  for (const file of record.files) { const bytes = await app.fs.readBytes(`${dir}/${path}/${file}`); if (bytes) files.set(file, bytes) }
  return { dir, path, record, files }
}
/** A site written: its files, those it had and no longer has taken away, then its record. @param {One} one @param {string[]} [before] */
async function write(one, before = []) {
  for (const [file, bytes] of one.files) await app.fs.writeBytes(`${one.dir}/${one.path}/${file}`, bytes)
  for (const file of before) if (!one.files.has(file)) await app.fs.remove(`${one.dir}/${one.path}/${file}`)
  await app.fs.write(`${one.dir}/${one.path}/${RECORD}`, JSON.stringify({ ...one.record, files: [...one.files.keys()] }, null, 1))
}
/** What is written of a site, each after the one before, so that none is lost under another however fast they come. */
let writing = /** @type {Promise<unknown>} */ (Promise.resolve())
/** @template T @param {() => Promise<T>} work */
const serial = (work) => { const done = writing.then(work); writing = done.catch(() => {}); return done }
/** A site's record changed as it is now. @param {string} path @param {(record: SiteRecord) => SiteRecord} change */
const update = async (path, change) => { const one = await load(path); if (one) await write({ ...one, record: change({ ...one.record, changed: new Date().toISOString() }) }) }
/** A site's record with what was published, its files untouched. @param {string} path @param {SiteRecord['published']} published */
export const remember = async (path, published) => { const record = await recordOf(path); if (record) await app.fs.write(`${app.projectDir}/${path}/${RECORD}`, JSON.stringify({ ...record, published }, null, 1)) }
/** What its first page says it is. @param {Map<string, Uint8Array>} files */
const describe = (files) => /<meta\s+name=["']description["']\s+content=["']([^"']*)/i.exec(new TextDecoder().decode(files.get('index.html') ?? new Uint8Array()))?.[1] ?? ''

/** Designs' palettes, which a site's looks are dealt from, read once. @type {Promise<any[]> | null} */
let palettes = null
/** A site's three looks (./look.js, D739) and the one it wears, its record keeping it. @param {One} one @param {import('./look.js').Own} [given] the brain's colours or the user's */
async function looksOf(one, given) {
  const tokens = await lookHere(one.dir), { looks, look, kept } = dealt({ files: one.files, seed: one.path, kept: one.record.look, given, project: (voices) => projectLook(tokens, voices, hexOf),
    palettes: await (palettes ??= fetch(new URL('../designs/layouts.json', import.meta.url)).then((response) => response.json()).then((book) => book.palettes)) })
  return { looks, look, record: { ...one.record, look: kept } }
}

/** The project's sites, the latest made first. @param {string} [dir] @returns {Promise<import('../../ui/creations.js').Creation[]>} */
async function kept(dir = app.projectDir) {
  const places = (await app.fs.list(`${dir}/sites`)).flatMap(({ kind, name }) => (kind === 'directory' ? [`sites/${name}`] : [])).sort().reverse()
  return (await Promise.all(places.map(async (path) => ({ path, record: await recordOf(path, dir).catch(() => null) })))).flatMap(({ path, record }) => (record ? [{ path, name: record.name,
    changed: record.changed, created: record.created, pinned: !!record.pinned, text: record.text ?? '', link: /** @type {import('../../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: path, name: record.name, title: record.name, mimeType: 'text/html' }) }] : []))
}

/** What an address names: a site by its name. @param {string} path */
export const metaOf = async (path) => ((record) => record && { name: record.name, title: record.name, mimeType: 'text/html' })(await recordOf(path).catch(() => null))
/** What Save gives: its first page, as one page. @param {string} path */
export const bytesOf = async (path) => ((one) => (one ? pageOf(one.files, 'index.html').then((page) => new TextEncoder().encode(page)) : null))(await load(path))
/**
 * Its view in its pane, a site the brain made with its looks: one picked writes look.css and keeps it in site.json. @param {{ uri: string }} file
 * @returns {Promise<unknown>}
 */
export async function editor({ uri }) {
  const one = await load(uri), theirs = one && await load(waitingOf(uri)), shown = theirs ?? one, deal = shown?.record.look && await looksOf({ ...shown, path: uri })
  // A pick is the person's: the brain's version waiting wears it too.
  const pick = (/** @type {import('./look.js').Look} */ look) => serial(async () => { for (const now of await Promise.all([load(uri), load(waitingOf(uri))])) if (now) await write({ ...now, files: new Map(now.files).set(LOOK, new TextEncoder().encode(cssOf(look))),
    record: { ...now.record, look: { ...now.record.look, id: look.id, voice: look.voice } } }) }).catch(console.warn)
  return one && shown && html`<app-site class="beside" .site=${{ path: one.path, name: one.record.name, files: shown.files, ...(theirs && { mine: one.files, decide: (/** @type {boolean} */ yes) => decide(uri, yes) }),
    retype: (/** @type {string} */ page, /** @type {{ old: string, new: string }[]} */ changes) => retype(uri, page, changes), ask: askJean, ...(deal && { looks: deal.looks, look: deal.look, pick }) }}></app-site>`
}

/**
 * Words the person retyped in its frame (D741): each the one text of the page that read so, changed as `site_change` changes a passage,
 * written, then checked again; the site's files after, or null when any can't be, nothing changed then. @param {string} path @param {string} page
 * @param {{ old: string, new: string }[]} changes @returns {Promise<Map<string, Uint8Array> | null>}
 */
const retype = (path, page, changes) => serial(async () => {
  const one = await load(path), text = new TextDecoder().decode(one?.files.get(page) ?? new Uint8Array()), passages = changes.map((change) => retyped(text, change.old, change.new))
  const done = one && passages.every(Boolean) && changed(one.files, passages.map((passage) => ({ path: page, ...passage })))
  return !done || 'error' in done ? null : (await write({ ...one, files: done.files, record: { ...one.record, changed: new Date().toISOString() } }), recheck(path), done.files)
}).catch((error) => (console.warn(error), null))

/** A check of a site the person changed, under way, and the site changed since, which is checked once it ends. */
let checking = /** @type {Promise<void> | null} */ (null), next = ''
/** A site checked again after the person changed it, in its look of now, one check at a time. @param {string} path */
function recheck(path) {
  next = path
  checking ??= (async () => { for (let at = next; at; at = next) { next = ''; const one = await load(at); if (one) await check(one, (await looksOf(one)).look, []) } })().catch(console.warn).finally(() => { checking = null })
}

/** The brain's version accepted, the site its files and its check from now on, or rejected; either way, no longer waiting (D505). @param {string} path @param {boolean} yes */
const decide = (path, yes) => void serial(async () => {
  const [one, theirs] = await Promise.all([load(path), load(waitingOf(path))])
  if (one && theirs && yes) await write({ ...one, files: theirs.files, record: { ...one.record, look: theirs.record.look, text: theirs.record.text, check: theirs.record.check, changed: new Date().toISOString() } }, [...one.files.keys()])
  await app.fs.remove(`${app.projectDir}/${waitingOf(path)}`), notify(t(yes ? 'sites.accepted' : 'sites.rejected'), { quiet: true })
  if (one) reread(), await open(one)
}).catch(console.warn)

/** A site whose pane made way for the box, its page and the part pointed at there, and the task, whose next message alone still says them. @type {{ site: import('./frame.js').Shown, page: string, pointed: import('./frame.js').Pointed | null, task?: string } | null} */
let asked = null
/**
 * Ask Jean (D741), as Designs' does: the part pointed at, which the brain hears of with the next message, said in a toast, and the box;
 * where the pane covers the conversation, it makes way for the box first. @param {{ site: import('./frame.js').Shown, page: string, pointed: import('./frame.js').Pointed | null }} pointed
 */
async function askJean(pointed) {
  if (document.documentElement.dataset.dock === 'over') (asked = { ...pointed, task: app.current.peek()?.path }), (await import('../../ui/preview.js')).unshow(pointed.site.path)
  document.getElementById('prompt')?.focus(), notify(t('sites.pointed'))
}
/**
 * A page on its own published as a site of one page: the site made from it the first time, under its name, its files made again from it
 * each time (./file.js's sited()), so that the dialog says what changed since; then Publish's dialog. @param {{ uri: string, title: string }} file @param {BlobPart} page
 */
export async function publishPage(file, page) {
  const [offer, places] = await Promise.all([offered(), app.fs.list(`${app.projectDir}/sites`)]), now = new Date().toISOString(), name = file.title.replace(/\.html?$/i, '') || 'Page'
  if (!offer) return
  const found = (await Promise.all(places.map(async ({ kind, name: folder }) => (kind === 'directory' && (await recordOf(`sites/${folder}`).catch(() => null))?.page === file.uri ? `sites/${folder}` : '')))).find(Boolean)
  const [one, files] = [found ? await load(found) : null, new Map([...sited(await new Blob([page]).text())].map(([path, text]) => [path, new TextEncoder().encode(text)]))], path = one?.path ?? `sites/${ulid()}-${slug(name) || 'page'}`
  if (!one || files.size !== one.files.size || [...files].some(([at, bytes]) => String(one.files.get(at)) !== String(bytes))) await write(one ? { ...one, files, record: { ...one.record, changed: now } }
    : { dir: app.projectDir, path, files, record: { format: 1, name, author: app.deviceId, created: now, changed: now, source: app.current.peek()?.path ?? '', page: file.uri, files: [] } }, one ? [...one.files.keys()] : [])
  join(app.projectDir), reread()
  await (await import('./publish.js')).openPublish(path, offer)
}
/** Open beside the task. @param {One} one */
const open = (one) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: one.path, name: one.record.name, title: one.record.name, mimeType: 'text/html' }))
/** What a site can do (ui/out.js): go online, where the host offers it, or leave as a zip of its files. @param {{ uri: string }} file @param {{ address: string } | null} offer @returns {import('../../ui/out.js').Ways} */
const ways = (file, offer) => ({ ...(offer && { publish: { id: '', glyph: icons.globe, label: t('sites.publish'), run: () => import('./publish.js').then(({ openPublish }) => openPublish(file.uri, offer)) } }), files: [{ id: '', glyph: icons.download, label: t('sites.zip'), run: async () => {
  const one = await load(file.uri)
  if (one) save(new Blob([/** @type {BlobPart} */ (await writeZip([...one.files].map(([name, bytes]) => ({ name, bytes }))))], { type: 'application/zip' }), `${one.record.name}.zip`)
} }] })

/**
 * A file of a call: its text, or a file of the task by its name or place, one the user shared or Jean made (a picture, a chart), else
 * one of the project's by its place. @param {any} file @param {import('../../core/loop.js').ToolContext} ctx @returns {Promise<[string, Uint8Array]>}
 */
async function fileOf(file, ctx) {
  const path = pathIn(file?.path)
  if (typeof file?.text === 'string') return [path, new TextEncoder().encode(file.text)]
  const from = String(file?.from ?? ''), conversation = conversationOf(ctx.signal), files = taskFiles(conversation?.records ?? [], conversation?.turn?.steps).filter((one) => !/^sites\//.test(one.uri))
  const uri = fileNamed(files, from)?.uri ?? (/^files\/[\w.-]+$/.test(from.replace(/^(\.\.?\/)+/, '')) ? from.replace(/^(\.\.?\/)+/, '') : '')
  const bytes = uri && await app.fs.readBytes(`${app.projectDir}/${uri}`)
  if (!bytes) throw new Error(from ? `There is no file named "${from}" in this task. Its files: ${[...new Set(files.map((one) => one.name))].join(', ') || 'none'}.` : `${path} has neither text nor from`)
  return [path, bytes]
}

/**
 * A site checked, from its files and as its pages show, by day and by night alike, whichever the device prefers; what it found kept in
 * its record. @param {One} one @param {import('./look.js').Look | null} look @param {string[]} said @param {AbortSignal} [signal]
 */
async function check(one, look, said, signal) {
  const report = checkFiles(one.files), as = (/** @type {'day' | 'night'} */ when) => look && new Map(one.files).set(LOOK, new TextEncoder().encode(cssOf({ ...look, day: look[when], night: look[when] })))
  report.problems = [...new Set([...report.problems, ...said, ...await shown(as('day') || one.files, report.pages, signal, as('night') || undefined)])]
  await serial(async () => { const record = await recordOf(one.path, one.dir); if (record) await app.fs.write(`${one.dir}/${one.path}/${RECORD}`, JSON.stringify({ ...record, text: describe(one.files), check: { problems: report.problems, fill: report.fill, at: new Date().toISOString() } }, null, 1)) })
  return report
}

/**
 * What a call makes of a site: dressed in its look, written, or as the brain's version waiting, shown, checked, and said. @param {One} given
 * @param {import('../../core/loop.js').ToolContext} ctx @param {string} done @param {string[]} before @param {import('./look.js').Own} [colours] the brain's or the user's @param {boolean} [waits]
 */
async function checked(given, ctx, done, before, colours, waits) {
  // A page on its own, made a site again from it each time it is published, keeps its own colours.
  const { look, record } = given.record.page ? { look: null, record: given.record } : await looksOf(given, colours)
  const dressed = look ? worn(given.files, look) : { files: given.files, put: [], left: [] }, said = saidOf(dressed), one = { ...given, files: dressed.files, record }, kept = waits ? { ...one, path: waitingOf(one.path) } : one
  await serial(() => write(kept, before))
  ctx.meta.files = [{ uri: one.path, name: one.record.name, mimeType: 'text/html', size: [...one.files.values()].reduce((sum, bytes) => sum + bytes.length, 0) }]
  if (conversationOf(ctx.signal)?.path === app.current.peek()?.path) await open(one)
  join(one.dir), reread()
  return [done, told(await check(kept, look, said.problems, ctx.signal), { name: one.record.name, place: one.path }), said.line, waits && WAITS].filter(Boolean).join(' ')
}

/** The sites each run made, whose changes in that run are still their making, applied at once rather than waiting (D741). @type {WeakMap<AbortSignal, Set<string>>} */
const making = new WeakMap()
/** Whether a call's change to a site waits for the person: one the run didn't make, where the run is the person's. @param {import('../../core/loop.js').ToolContext} ctx @param {string} path */
const waits = (ctx, path) => Boolean(ctx.signal) && !making.get(/** @type {AbortSignal} */ (ctx.signal))?.has(path)

/** What a call says of a change waiting for the person. */
const WAITS = 'This is your version, beside the task for the user to accept or reject; site_change goes on from it.'

/** @type {import('../../core/loop.js').Tool} */
const siteTool = {
  spec: SITE, kind: 'edit',
  title: (args) => `Site ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const list = Array.isArray(args?.files) ? args.files : [], name = String(args?.name ?? '').trim() || 'Site', now = new Date().toISOString(), before = args?.site ? await load(String(args.site)) : null
    if (!list.length) throw new Error('Give the site its files: index.html first, then style.css and the other pages.')
    const files = new Map(await Promise.all(list.map((/** @type {any} */ file) => fileOf(file, ctx)))), path = before?.path ?? `sites/${ulid()}-${slug(name) || 'site'}`, wait = Boolean(before) && waits(ctx, path)
    if (!before && ctx.signal) making.set(ctx.signal, (making.get(ctx.signal) ?? new Set()).add(path))
    const theirs = wait ? await load(waitingOf(path)) : null
    return checked(before ? { ...before, files, record: { ...(theirs ?? before).record, name, changed: now } } : { dir: app.projectDir, path, files,
      record: { format: 1, name, author: 'jean', created: now, changed: now, source: conversationOf(ctx.signal)?.path ?? '', files: [] } }, ctx, before ? 'Replaced.' : 'Made.',
    [...((wait ? theirs : before)?.files.keys() ?? [])], args?.look, wait)
  },
}

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: CHANGE, kind: 'edit',
  title: (args) => `Change the site ${args?.site ?? ''}`,
  run: async (args, ctx) => {
    const one = await load(String(args?.site ?? ''))
    if (!one) throw new Error(`There is no site at ${args?.site}.`)
    // After the run that made it, the brain changes its own version, waiting for the person, made from the site the first time.
    const wait = waits(ctx, one.path), theirs = wait ? await load(waitingOf(one.path)) : null, base = theirs ?? one, done = changed(base.files, Array.isArray(args?.changes) ? args.changes : [])
    if ('error' in done) throw new Error(done.error)
    for (const file of Array.isArray(args?.files) ? args.files : []) done.files.set(...await fileOf(file, ctx))
    for (const path of Array.isArray(args?.remove) ? args.remove : []) done.files.delete(pathIn(path))
    return checked({ ...one, files: done.files, record: { ...base.record, changed: new Date().toISOString() } }, ctx, 'Changed.', [...((wait ? theirs : one)?.files.keys() ?? [])], args?.look, wait)
  },
}

/**
 * The note a message comes with while a site is open beside the task, or just after its pane made way for the box: its page on show as
 * it is now, the brain's version while it waits, and the part the user points at, once. @param {import('../../core/types.js').Envelope[]} records
 */
function notes(records) {
  const view = /** @type {(HTMLElement & { site?: import('./frame.js').Shown, page?: string, pointed?: import('./frame.js').Pointed | null }) | null} */ (document.querySelector('app-preview app-site'))
  const was = asked?.task === app.current.peek()?.path ? asked : null, one = view?.site ?? was?.site, at = (view?.site ? view.page : was?.page) ?? 'index.html', part = view?.site ? view.pointed : was?.pointed
  asked = null
  if (!one) return []
  const text = `The site ${one.name} (${one.path}) is open beside the conversation, on ${at}.${one.mine ? ' Your version of it waits for the user to accept or reject; site_change goes on from it.' : ''}${part
    ? ` The user points at its <${part.name}> at ${part.place}${part.words ? `: “${part.words}”` : ''}.` : ''} Change it with site_change. Its files: ${[...one.files.keys()].join(', ')}. ${at} now:\n\n\`\`\`html\n${new TextDecoder().decode(one.files.get(at) ?? new Uint8Array())}\n\`\`\``
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'site')
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'site', uri: one.path })]
}

const sites = { id: 'sites', at: 2.8, draw: () => GLYPH, kept, mention: 'site', like: skill,
  pin: (/** @type {{ path: string }} */ { path }, /** @type {boolean} */ pinned) => update(path, (record) => ({ ...record, pinned })),
  rename: (/** @type {{ path: string }} */ { path }, /** @type {string} */ name) => update(path, (record) => ({ ...record, name })),
  remove: (/** @type {{ path: string }} */ { path }) => Promise.all([path, waitingOf(path)].map((one) => app.fs.remove(`${app.projectDir}/${one}`))),
  make: async () => { await skill(); await ask('sites.ask', 'sites.example') } }

// Among the creations once the project holds a site, from when its first is written; until then only its card to start one (D553).
const joined = signal(/** @type {Record<string, unknown>} */ ({ starts: sites }))
let here = ''
/** Sites among the creations of the project open, `dir`, which holds one. @param {string} dir */
const join = (dir) => { if (here === dir && !joined.peek().creations) joined.value = { creations: sites, main: page } }
effect(() => {
  const dir = (void app.conversations.value, app.projectDir)
  if (dir !== here) (here = dir, (joined.value = { starts: sites }))
  if (!joined.peek().creations) kept().then((list) => list.length && join(dir), console.warn)
})
effect(() => register({ id: 'sites', tools: [siteTool, changeTool], lines: LINES, slots: { ...joined.value, modes: { at: 14, draw: () => null, notes }, out: { at: 2, draw: () => null, of: (/** @type {{ uri: string }} */ { uri }) => /^sites\//.test(uri), load: async () => ((offer) => ({ ways: (/** @type {{ uri: string }} */ file) => ways(file, offer) }))(await offered()) },
  dialog: { at: 2, draw: () => html`<app-site-publish></app-site-publish>` } } }))
