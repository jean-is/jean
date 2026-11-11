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
import { effect } from '@preact/signals-core'
import { app } from '../../ui/state.js'
import { register } from '../../ui/caps.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { reread } from '../../ui/creations.js'
import { styleSheet } from '../../ui/sheet.js'
import { ulid } from '../../core/ulid.js'
import { slug } from '../../core/settings.js'
import { t, useStrings } from '../../core/i18n.js'
import { sited } from './file.js'
import { offered } from './offer.js'
import { checkFiles, told } from './check.js'
import { LINES, SITE, CHANGE } from './tool.js'
import { shown } from './frame.js'
import { LOOK, cssOf } from './look.js'
import { folderKind } from './kind.js'

await Promise.all([useStrings('sites'), styleSheet(new URL('sites.css', import.meta.url))])

/** @typedef {import('./kind.js').One} One */

/** What its first page says it is. @param {Map<string, Uint8Array>} files */
const describe = (files) => /<meta\s+name=["']description["']\s+content=["']([^"']*)/i.exec(new TextDecoder().decode(files.get('index.html') ?? new Uint8Array()))?.[1] ?? ''

/**
 * A site checked, from its files and as its pages show, by day and by night alike, whichever the device prefers. @param {One} one
 * @param {import('./look.js').Look | null} look @param {string[]} said @param {AbortSignal} [signal]
 */
async function check(one, look, said, signal) {
  const report = checkFiles(one.files), as = (/** @type {'day' | 'night'} */ when) => look && new Map(one.files).set(LOOK, new TextEncoder().encode(cssOf({ ...look, day: look[when], night: look[when] })))
  report.problems = [...new Set([...report.problems, ...said, ...await shown(as('day') || one.files, report.pages, signal, as('night') || undefined)])]
  return report
}

const kind = folderKind({ id: 'sites', folder: 'sites', record: 'site.json', noun: 'site', words: 'sites', element: 'app-site:not(app-prototype *)', skill: 'site', at: 2.8,
  /** A browser's window. */
  glyph: icon(svg`<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 9h18M6 7h.01M8.5 7h.01M7 13h6M7 16h4"/>`),
  specs: { make: SITE, change: CHANGE }, text: describe, check, told: (report, at) => told(/** @type {any} */ (report), at),
  view: (site) => html`<app-site class="beside" .site=${site}></app-site>` })
export const { load, metaOf, bytesOf, editor } = kind

/** A site's record with what was published, its files untouched. @param {string} path @param {import('./file.js').SiteRecord['published']} published */
export const remember = async (path, published) => { const record = await kind.recordOf(path); if (record) await app.fs.write(`${app.projectDir}/${path}/site.json`, JSON.stringify({ ...record, published }, null, 1)) }

/**
 * A page on its own published as a site of one page: the site made from it the first time, under its name, its files made again from it
 * each time (./file.js's sited()), so that the dialog says what changed since; then Publish's dialog. @param {{ uri: string, title: string }} file @param {BlobPart} page
 */
export async function publishPage(file, page) {
  const [offer, places] = await Promise.all([offered(), app.fs.list(`${app.projectDir}/sites`)]), now = new Date().toISOString(), name = file.title.replace(/\.html?$/i, '') || 'Page'
  if (!offer) return
  const found = (await Promise.all(places.map(async ({ kind: type, name: folder }) => (type === 'directory' && (await kind.recordOf(`sites/${folder}`).catch(() => null))?.page === file.uri ? `sites/${folder}` : '')))).find(Boolean)
  const [one, files] = [found ? await load(found) : null, new Map([...sited(await new Blob([page]).text())].map(([path, text]) => [path, new TextEncoder().encode(text)]))], path = one?.path ?? `sites/${ulid()}-${slug(name) || 'page'}`
  if (!one || files.size !== one.files.size || [...files].some(([at, bytes]) => String(one.files.get(at)) !== String(bytes))) await kind.write(one ? { ...one, files, record: { ...one.record, changed: now } }
    : { dir: app.projectDir, path, files, record: { format: 1, name, author: app.deviceId, created: now, changed: now, source: app.current.peek()?.path ?? '', page: file.uri, files: [] } }, one ? [...one.files.keys()] : [])
  kind.join(app.projectDir), reread()
  await (await import('./publish.js')).openPublish(path, offer)
}
/** What a site can do (ui/out.js): go online, where the host offers it, or leave as a zip of its files. @param {{ uri: string }} file @param {{ address: string } | null} offer @returns {import('../../ui/out.js').Ways} */
const ways = (file, offer) => ({ ...(offer && { publish: { id: '', glyph: icons.globe, label: t('sites.publish'), run: () => import('./publish.js').then(({ openPublish }) => openPublish(file.uri, offer)) } }), files: kind.zip(file) })

effect(() => register({ id: 'sites', tools: kind.tools, lines: LINES, slots: { ...kind.joined.value, modes: { at: 14, draw: () => null, notes: kind.notes }, out: { at: 2, draw: () => null, of: (/** @type {{ uri: string }} */ { uri }) => /^sites\//.test(uri), load: async () => ((offer) => ({ ways: (/** @type {{ uri: string }} */ file) => ways(file, offer) }))(await offered()) },
  dialog: { at: 2, draw: () => html`<app-site-publish></app-site-publish>` } } }))
