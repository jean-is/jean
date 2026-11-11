// Sites (D720): websites of a few pages the brain makes with its skill "Make a site". Each is a folder of the project,
// `sites/<ulid>-<slug>` (./file.js), made or replaced whole by `site` and changed by exact passages with `site_change`; each call
// checks it, from its files (./check.js) and as its pages show at a phone's and a computer's width (./frame.js), and tells the
// brain what to fix before it is shown. A site opens beside the task at a phone's, a tablet's or a computer's width, its links leading
// to its other pages, and leaves as a zip of its files, or goes online at a name of its own where the share host publishes
// sites (./publish.js). A page on its own (a file, an app, a game, a deck) goes online the same way, as a site of one page made from it
// (publishPage). Among the creations once the project holds one; until then its card to start one. Found by its skill, which brings it
// (D401), or by a page's Publish…; nothing of it shows before.
import { html, svg } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, conversationOf } from '../../ui/state.js'
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
import { PLACE, RECORD, pathIn, changed, sited } from './file.js'
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

/** A site's record; null when there is none. @param {string} path @param {string} [dir] @returns {Promise<SiteRecord | null>} */
const recordOf = async (path, dir = app.projectDir) => (PLACE.test(path) ? ((record) => (record?.format ? record : null))(JSON.parse((await app.fs.read(`${dir}/${path}/${RECORD}`).catch(() => null)) ?? 'null')) : null)
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
  const one = await load(uri), deal = one?.record.look && await looksOf(one)
  // Each pick after the one before, so that look.css and site.json agree however fast the arrows go.
  let picking = /** @type {Promise<unknown>} */ (Promise.resolve())
  const pick = (/** @type {import('./look.js').Look} */ look) => (picking = picking.then(() => load(uri)).then((now) => now && write({ ...now, files: new Map(now.files).set(LOOK, new TextEncoder().encode(cssOf(look))),
    record: { ...now.record, look: { ...now.record.look, id: look.id, voice: look.voice } } })).catch(console.warn))
  return one && html`<app-site class="beside" .site=${{ path: one.path, name: one.record.name, files: one.files, ...(deal && { looks: deal.looks, look: deal.look, pick }) }}></app-site>`
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
 * What a call makes of a site: dressed in its look, written, shown, checked, and said. @param {One} given @param {import('../../core/loop.js').ToolContext} ctx @param {string} done
 * @param {string[]} before @param {import('./look.js').Own} [colours] the brain's or the user's
 */
async function checked(given, ctx, done, before, colours) {
  // A page on its own, made a site again from it each time it is published, keeps its own colours.
  const { look, record } = given.record.page ? { look: null, record: given.record } : await looksOf(given, colours)
  const dressed = look ? worn(given.files, look) : { files: given.files, put: [], left: [] }, said = saidOf(dressed), one = { ...given, files: dressed.files, record }
  await write(one, before)
  ctx.meta.files = [{ uri: one.path, name: one.record.name, mimeType: 'text/html', size: [...one.files.values()].reduce((sum, bytes) => sum + bytes.length, 0) }]
  if (conversationOf(ctx.signal)?.path === app.current.peek()?.path) await open(one)
  join(one.dir), reread()
  const report = checkFiles(one.files)
  // Seen by day and by night alike, whichever the device prefers.
  const as = (/** @type {'day' | 'night'} */ when) => look && new Map(one.files).set(LOOK, new TextEncoder().encode(cssOf({ ...look, day: look[when], night: look[when] })))
  report.problems = [...new Set([...report.problems, ...said.problems, ...await shown(as('day') || one.files, report.pages, ctx.signal, as('night') || undefined)])]
  await write({ ...one, record: { ...one.record, text: describe(one.files), check: { problems: report.problems, fill: report.fill, at: new Date().toISOString() } } })
  return [done, told(report, { name: one.record.name, place: one.path }), said.line].filter(Boolean).join(' ')
}

/** @type {import('../../core/loop.js').Tool} */
const siteTool = {
  spec: SITE, kind: 'edit',
  title: (args) => `Site ${args?.name ?? ''}`,
  run: async (args, ctx) => {
    const list = Array.isArray(args?.files) ? args.files : [], name = String(args?.name ?? '').trim() || 'Site', now = new Date().toISOString(), before = args?.site ? await load(String(args.site)) : null
    if (!list.length) throw new Error('Give the site its files: index.html first, then style.css and the other pages.')
    const files = new Map(await Promise.all(list.map((/** @type {any} */ file) => fileOf(file, ctx))))
    return checked(before ? { ...before, files, record: { ...before.record, name, changed: now } } : { dir: app.projectDir, path: `sites/${ulid()}-${slug(name) || 'site'}`, files,
      record: { format: 1, name, author: 'jean', created: now, changed: now, source: conversationOf(ctx.signal)?.path ?? '', files: [] } }, ctx, before ? 'Replaced.' : 'Made.', before ? [...before.files.keys()] : [], args?.look)
  },
}

/** @type {import('../../core/loop.js').Tool} */
const changeTool = {
  spec: CHANGE, kind: 'edit',
  title: (args) => `Change the site ${args?.site ?? ''}`,
  run: async (args, ctx) => {
    const one = await load(String(args?.site ?? ''))
    if (!one) throw new Error(`There is no site at ${args?.site}.`)
    const done = changed(one.files, Array.isArray(args?.changes) ? args.changes : [])
    if ('error' in done) throw new Error(done.error)
    for (const file of Array.isArray(args?.files) ? args.files : []) done.files.set(...await fileOf(file, ctx))
    for (const path of Array.isArray(args?.remove) ? args.remove : []) done.files.delete(pathIn(path))
    return checked({ ...one, files: done.files, record: { ...one.record, changed: new Date().toISOString() } }, ctx, 'Changed.', [...one.files.keys()], args?.look)
  },
}

/** The note a message comes with while a site is open beside the task: its page on show as it is now, once. @param {import('../../core/types.js').Envelope[]} records */
function notes(records) {
  const view = /** @type {(HTMLElement & { site?: { path: string, name: string, files: Map<string, Uint8Array> }, page?: string }) | null} */ (document.querySelector('app-preview app-site'))
  const one = view?.site, at = view?.page ?? 'index.html'
  if (!one) return []
  const text = `The site ${one.name} (${one.path}) is open beside the conversation, on ${at}. Change it with site_change. Its files: ${[...one.files.keys()].join(', ')}. ${at} now:\n\n\`\`\`html\n${new TextDecoder().decode(one.files.get(at) ?? new Uint8Array())}\n\`\`\``
  const last = records.findLast(({ update }) => update?.sessionUpdate === '_system_note' && update.data?.kind === 'site')
  return last?.update?.sessionUpdate === '_system_note' && last.update.text === text ? [] : [noteRecord(text, { kind: 'site', uri: one.path })]
}

const sites = { id: 'sites', at: 2.8, draw: () => GLYPH, kept, mention: 'site', like: skill,
  pin: (/** @type {{ path: string }} */ { path }, /** @type {boolean} */ pinned) => update(path, (record) => ({ ...record, pinned })),
  rename: (/** @type {{ path: string }} */ { path }, /** @type {string} */ name) => update(path, (record) => ({ ...record, name })),
  remove: (/** @type {{ path: string }} */ { path }) => app.fs.remove(`${app.projectDir}/${path}`),
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
