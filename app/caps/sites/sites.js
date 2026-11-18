// SPDX-License-Identifier: MIT
// Sites (D720): websites of a few pages the brain makes with its skill "Make a site". Each is a folder of the project,
// `sites/<ulid>-<slug>` (./file.js), made or replaced whole by `site` and changed by exact passages with `site_change`; each call
// checks it, from its files (./check.js) and as its pages show at a phone's and a computer's width (./frame.js), and tells the
// brain what to fix before it is shown. A site opens beside the task at a phone's, a tablet's or a computer's width, its links leading
// to its other pages, and leaves as a zip of its files, or goes online at a name of its own where the share host publishes
// sites (./publish.js). A page on its own (a file, an app, a game, a deck) goes online the same way, as a site of one page made from it
// (publishPage). Among the creations once the project holds one; until then its row in Create's menu. Found by its skill, which brings it
// (D401), or by a page's Publish…; nothing of it shows before. Its words are retyped in place and its parts pointed at for the brain in its
// pane (./hand.js, D741); what the brain changes after the turn it made the site waits as its version, `sites/.suggested/<ulid>-<slug>`,
// for the person to accept or reject (D505). What visitors send its forms once it is online waits sealed at the host until Jean collects it
// into a collection for each form, as the project opens and as Publish's dialog does (D751, ./replies.js).
import { html, svg } from 'lit-html'
import { effect } from '@preact/signals-core'
import { app, notify } from '../../ui/state.js'
import { register, unlock } from '../../ui/caps.js'
import { getSecret } from '../../ui/secrets.js'
import { icon, icons } from '../../ui/menu-icons.js'
import { reread } from '../../ui/creations.js'
import { styleSheet } from '../../ui/sheet.js'
import { ulid } from '../../core/ulid.js'
import { slug } from '../../core/settings.js'
import { t, useStrings } from '../../core/i18n.js'
import { sited, secretOf, tokenOf } from './file.js'
import { keyOf, opened } from './replies.js'
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

const kind = folderKind({ id: 'sites', folder: 'sites', record: 'site.json', noun: 'site', says: ['sites.zip', 'sites.ask', 'sites.example'], element: 'app-site:not(app-prototype *)', skill: 'site', at: 2.8,
  /** A browser's window. */
  glyph: icon(svg`<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 9h18M6 7h.01M8.5 7h.01M7 13h6M7 16h4"/>`),
  specs: { make: SITE, change: CHANGE }, text: describe, check, told: (report, at) => told(/** @type {any} */ (report), at),
  view: (site) => html`<app-site class="beside" .site=${site}></app-site>` })
export const { load, metaOf, bytesOf, editor } = kind

/** A site's record with what was published, its files untouched. @param {string} path @param {import('./file.js').SiteRecord['published']} published @param {string} [dir] */
export const remember = async (path, published, dir = app.projectDir) => { const record = await kind.recordOf(path, dir); if (record) await app.fs.write(`${dir}/${path}/site.json`, JSON.stringify({ ...record, published }, null, 1)) }

const DAY = 86_400_000
/** Collections under way, by site, one at a time. @type {Map<string, Promise<number>>} */
const collecting = new Map()
/**
 * The replies waiting at the host for a published site's forms (D751), opened with its secret and kept as rows of a collection for each form,
 * made the first time, named after the form and the site: when it was sent, then a column for each field by its label, a choice's a select.
 * Then the host drops them; the last one's id stays in site.json, so that none comes twice. None for a site whose secret isn't here, or with
 * Tables turned off, whose replies wait at the host. @param {string} path @param {string} [dir] @returns {Promise<number>} how many came
 */
export const collect = (path, dir = app.projectDir) => collecting.get(path) ?? /** @type {Promise<number>} */ (collecting.set(path, gather(path, dir).catch((error) => (console.warn(error), 0)).finally(() => collecting.delete(path))).get(path))
/** @param {string} path @param {string} dir */
async function gather(path, dir) {
  const record = await kind.recordOf(path, dir).catch(() => null), out = record?.published, kept = out?.replies
  const code = kept && Date.parse(out.expires) > Date.now() - 30 * DAY && await getSecret(app.fs, `site:${path.split('/')[1].split('-')[0]}`), secret = code ? secretOf(String(code)) : null
  if (!record || !out || !kept || !secret) return 0
  const at = new URL(`v1/sites/${out.name}/replies`, out.host), authorization = `Bearer ${await tokenOf(secret)}`
  /** @type {{ id: string, sealed: string }[]} */
  const replies = /** @type {{ replies?: any }} */ (await fetch(at, { headers: { authorization } }).then((answer) => (answer.ok ? answer.json() : {}), () => ({}))).replies ?? []
  if (!Array.isArray(replies)) return 0
  const fresh = replies.filter((one) => one.id > (kept.through ?? '')), key = fresh.length ? await keyOf(kept.sealed, secret) : null
  const came = /** @type {NonNullable<Awaited<ReturnType<typeof opened>>>[]} */ ((await Promise.all(fresh.map((one) => (key ? opened(one.sealed, key) : null)))).filter(Boolean))
  if (!replies.length || (came.length && !(await unlock('tables'))) || app.projectDir !== dir) return 0
  const collections = { ...kept.collections }
  if (came.length) {
    const [tables, { propertyOf, converted }] = await Promise.all([import('../tables/tables.js'), import('../tables/table.js')]), sent = t('sites.sentAt')
    for (const form of new Set(came.map((one) => one.form))) {
      const rows = came.filter((one) => one.form === form)
      let one = (collections[form] && await tables.load(collections[form], dir).catch(() => null)) || await tables.load(await tables.makeTable({ name: t('sites.repliesOf', { form, site: record.name }), columns: [{ name: sent, type: 'date' }] }, dir), dir)
      for (const field of rows.flatMap((reply) => reply.fields)) if (one && !propertyOf(one.table, field.label)) one = (await tables.reshapeTable(one, { add: { name: field.label, type: field.choice ? 'select' : 'text' } }, false), await tables.load(one.folder, dir))
      if (!one) continue
      const table = one.table, cell = (/** @type {string} */ label, /** @type {string} */ value) => ((property) => ((fit) => (property && fit !== undefined ? [[property.id, fit]] : []))(property && converted(property, value)))(propertyOf(table, label))
      // When each was sent, on this device's clock, then its fields, each as its column takes it.
      await tables.change(one, rows.map((reply) => ({ set: Object.fromEntries([...cell(sent, new Date(Date.parse(reply.at) - new Date(reply.at).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)), ...reply.fields.flatMap((field) => cell(field.label, field.value))]) })), 'visitor', undefined, false, false)
      collections[form] = one.folder
    }
  }
  // Only its replies' part of the record, as it is now: a publish may have written the rest meanwhile.
  const now = (await kind.recordOf(path, dir).catch(() => null))?.published ?? out
  await remember(path, { ...now, replies: { ...now.replies ?? kept, collections, through: replies[replies.length - 1].id } }, dir)
  await fetch(`${at}?through=${encodeURIComponent(replies[replies.length - 1].id)}`, { method: 'DELETE', headers: { authorization } }).catch(() => {})
  if (came.length) notify(t('sites.replied', { count: came.length, name: record.name }))
  return came.length
}
/** Each published site of a project with replies waiting, collected once as it opens. */
let collected = ''
effect(() => { const dir = app.projectDir; if (dir !== collected) (collected = dir, kind.kept(dir).then((list) => list.forEach(({ path }) => collect(path, dir)), console.warn)) })

/**
 * A page on its own published as a site of one page: the site made from it the first time, under its name, its files made again from it
 * each time (./file.js's sited(), or given as files, a game's), so that the dialog says what changed since; then Publish's dialog. @param {{ uri: string, title: string }} file @param {BlobPart | Map<string, string>} page
 */
export async function publishPage(file, page) {
  const [offer, places] = await Promise.all([offered(), app.fs.list(`${app.projectDir}/sites`)]), now = new Date().toISOString(), name = file.title.replace(/\.html?$/i, '') || 'Page'
  if (!offer) return
  const found = (await Promise.all(places.map(async ({ kind: type, name: folder }) => (type === 'directory' && (await kind.recordOf(`sites/${folder}`).catch(() => null))?.page === file.uri ? `sites/${folder}` : '')))).find(Boolean)
  const [one, files] = [found ? await load(found) : null, new Map([...(page instanceof Map ? page : sited(await new Blob([page]).text()))].map(([path, text]) => [path, new TextEncoder().encode(text)]))], path = one?.path ?? `sites/${ulid()}-${slug(name) || 'page'}`
  if (!one || files.size !== one.files.size || [...files].some(([at, bytes]) => String(one.files.get(at)) !== String(bytes))) await kind.write(one ? { ...one, files, record: { ...one.record, changed: now } }
    : { dir: app.projectDir, path, files, record: { format: 1, name, author: app.deviceId, created: now, changed: now, source: app.current.peek()?.path ?? '', page: file.uri, files: [] } }, one ? [...one.files.keys()] : [])
  kind.join(app.projectDir), reread()
  await (await import('./publish.js')).openPublish(path, offer)
}
/** What a site can do (ui/out.js): go online, where the host offers it, then what its kind can (./kind.js): a link, another app, a zip of its files. @param {{ uri: string, name: string }} file @param {{ address: string } | null} offer @returns {import('../../ui/out.js').Ways} */
const ways = (file, offer) => ({ ...(offer && { publish: { id: '', glyph: icons.globe, label: t('sites.publish'), run: () => import('./publish.js').then(({ openPublish }) => openPublish(file.uri, offer)) } }), ...kind.ways(file) })

effect(() => register({ id: 'sites', tools: kind.tools, lines: LINES, slots: { ...kind.joined.value, modes: { at: 14, draw: () => null, notes: kind.notes }, out: { at: 2, draw: () => null, of: (/** @type {{ uri: string }} */ { uri }) => /^sites\//.test(uri), load: async () => ((offer) => ({ ways: (/** @type {{ uri: string, name: string }} */ file) => ways(file, offer) }))(await offered()) },
  dialog: { at: 2, draw: () => html`<app-site-publish></app-site-publish>` } } }))
