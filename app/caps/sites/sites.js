// Sites (D720): websites of a few pages the brain makes with its skill "Make a site". Each is a folder of the project,
// `sites/<ulid>-<slug>` (./file.js), made or replaced whole by `site` and changed by exact passages with `site_change`; each call
// checks it, from its files (./check.js) and as its pages show at a phone's and a computer's width (./frame.js), and tells the
// brain what to fix before it is shown. A site opens beside the task at a phone's, a tablet's or a computer's width, its links leading
// to its other pages, and leaves as a zip of its files, or goes online at a name of its own where the share host publishes
// sites (./publish.js). Among the creations once the project holds one; until then its card to start one. Found by its skill,
// which brings it (D401); nothing of it shows before.
import { html, svg } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, conversationOf } from '../../ui/state.js'
import { register, unlock } from '../../ui/caps.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { ask, reread, page } from '../../ui/creations.js'
import { styleSheet } from '../../ui/sheet.js'
import { save } from '../../ui/save.js'
import { noteRecord, linkedFiles } from '../../core/events.js'
import { writeZip } from '../../core/zip.js'
import { ulid } from '../../core/ulid.js'
import { slug, serviceURL } from '../../core/settings.js'
import { t, useStrings } from '../../core/i18n.js'
import { PLACE, RECORD, pathIn, changed } from './file.js'
import { checkFiles, told } from './check.js'
import { LINES, SITE, CHANGE } from './tool.js'
import { shown, pageOf } from './frame.js'

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
/** The share host, which publishes sites too where it says so, or '' where policy names none or says never. */
export const hostOf = () => (app.policy.rules?.share === 'never' ? '' : String(serviceURL('share', app.settings.value, app.policy) ?? ''))
/** What the host offers for sites, asked once a host: the address a name makes, or null. @type {Map<string, Promise<{ address: string } | null>>} */
const offers = new Map()
const offered = (host = hostOf()) => {
  if (!host) return Promise.resolve(null)
  if (!offers.has(host)) offers.set(host, fetch(host).then((response) => response.json()).then((told) => (typeof told?.sites?.address === 'string' ? told.sites : null), () => null))
  return /** @type {Promise<{ address: string } | null>} */ (offers.get(host))
}
/** What its first page says it is. @param {Map<string, Uint8Array>} files */
const describe = (files) => /<meta\s+name=["']description["']\s+content=["']([^"']*)/i.exec(new TextDecoder().decode(files.get('index.html') ?? new Uint8Array()))?.[1] ?? ''

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
/** Its view in its pane. @param {{ uri: string }} file */
export const editor = async ({ uri }) => ((one) => one && html`<app-site class="beside" .site=${{ path: one.path, name: one.record.name, files: one.files }}></app-site>`)(await load(uri))
/** Open beside the task. @param {One} one */
const open = (one) => import('../../ui/preview.js').then(({ preview }) => preview({ uri: one.path, name: one.record.name, title: one.record.name, mimeType: 'text/html' }))
/** What a site can do (ui/out.js): go online, where the host offers it, or leave as a zip of its files. @param {{ uri: string }} file @param {{ address: string } | null} offer @returns {import('../../ui/out.js').Ways} */
const ways = (file, offer) => ({ ...(offer && { publish: { id: '', glyph: icons.globe, label: t('sites.publish'), run: () => import('./publish.js').then(({ openPublish }) => openPublish(file.uri, offer)) } }), files: [{ id: '', glyph: icons.download, label: t('sites.zip'), run: async () => {
  const one = await load(file.uri)
  if (one) save(new Blob([/** @type {BlobPart} */ (await writeZip([...one.files].map(([name, bytes]) => ({ name, bytes }))))], { type: 'application/zip' }), `${one.record.name}.zip`)
} }] })

/** A file of a call: its text, or a file the user shared, by its name. @param {any} file @param {import('../../core/loop.js').ToolContext} ctx @returns {Promise<[string, Uint8Array]>} */
async function fileOf(file, ctx) {
  const path = pathIn(file?.path)
  if (typeof file?.text === 'string') return [path, new TextEncoder().encode(file.text)]
  const from = String(file?.from ?? '').normalize(), links = linkedFiles(conversationOf(ctx.signal)?.records ?? []), link = links.find((one) => one.name.normalize() === from)
  const bytes = link && await app.fs.readBytes(`${app.projectDir}/${link.uri}`)
  if (!bytes) throw new Error(from ? `There is no shared file named "${from}". Shared: ${links.map((one) => one.name).join(', ') || 'none'}.` : `${path} has neither text nor from`)
  return [path, bytes]
}

/** What a call makes of a site: written, shown, checked, and said. @param {One} one @param {import('../../core/loop.js').ToolContext} ctx @param {string} done @param {string[]} before */
async function checked(one, ctx, done, before) {
  await write(one, before)
  ctx.meta.files = [{ uri: one.path, name: one.record.name, mimeType: 'text/html', size: [...one.files.values()].reduce((sum, bytes) => sum + bytes.length, 0) }]
  if (conversationOf(ctx.signal)?.path === app.current.peek()?.path) await open(one)
  join(one.dir), reread()
  const report = checkFiles(one.files)
  report.problems = [...new Set([...report.problems, ...await shown(one.files, report.pages, ctx.signal)])]
  await write({ ...one, record: { ...one.record, text: describe(one.files), check: { problems: report.problems, fill: report.fill, at: new Date().toISOString() } } })
  return `${done} ${told(report, { name: one.record.name, place: one.path })}`
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
      record: { format: 1, name, author: 'jean', created: now, changed: now, source: conversationOf(ctx.signal)?.path ?? '', files: [] } }, ctx, before ? 'Replaced.' : 'Made.', before ? [...before.files.keys()] : [])
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
    return checked({ ...one, files: done.files, record: { ...one.record, changed: new Date().toISOString() } }, ctx, 'Changed.', [...one.files.keys()])
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

const sites = { id: 'sites', at: 2.8, draw: () => GLYPH, kept, like: skill,
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
