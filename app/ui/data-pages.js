// Settings' Your data: Download a backup at its head, the map of where the user's things are (ui/map.js, D728), one line on how
// things stand, the most pressing thing in it with its fix; then where each copy is, as rows that open their pages at their own addresses (D509):
// on this device (Space used, Delete old tasks), the copies they keep (Backup, the synced folder), and Bring in. And Privacy (D729), from the
// same parts: who can open them on this device (Lock, Profiles) and who else sees them (Your devices, People, Shared links, their organization).
// A capability's row and page are its part of the data slot, shown once it is found.
// Loaded the first time Your data shows; its strings are a part of their own (locales/data/).
import { html, nothing } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { app, effective, updateSettings, pairs } from './state.js'
import { unlock, isDenied, slots, loaded } from './caps.js'
import { sectionOpen, pageOpen, openSettings, projectName, backup, lockedBy } from './dialogs.js'
import { everywhere } from './discovery.js'
import { BRAND } from '../brand.js'
import { weigh } from '../core/files.js'
import { t, relativeTime, intlLocales, formatBytes, useStrings } from '../core/i18n.js'
import { icons } from './menu-icons.js'
import { styleSheet } from './sheet.js'
import { handheld } from './model.js'
import { map, ghost } from './map.js'

await Promise.all([useStrings('data'), styleSheet(new URL('data-pages.css', import.meta.url))])

/**
 * A part of Your data: its row in a group, which opens its page, settings/data/<id>, under its name and a line, its
 * row's unless it has its own; at the row's end how it stands, at its page's head what it does most, what presses, and,
 * while a copy it keeps elsewhere is in step, where the user's things are safe (the synced folder's, the devices'), which stands for the browser
 * that may clear them, its fix beside what it says or beside a line saying they are only here (Add a device), and its places on the map.
 * With `page: false`, no row and no page (Your devices, D726); with `section`, Privacy's (D729); with `link`, a row that opens that section.
 * @typedef {{ id: string, at: number, group: 'here' | 'copies' | 'others', icon: unknown, label: string, text: () => string, line?: () => string, page?: false, section?: 'privacy', link?: import('./dialogs.js').Section, state?: () => unknown,
 *   end?: () => unknown, say?: () => string | undefined, copy?: () => string | undefined, fix?: () => unknown, node?: () => Place | Place[] | undefined, when?: () => boolean, draw: (settings: { lockedBy: () => string }) => unknown }} Part
 */
/** @typedef {import('./map.js').Place} Place */

/** How much the browser keeps for Jean, how much it would, and whether it keeps it come what may. */
const storage = signal(/** @type {{ usage?: number, quota?: number, persisted?: boolean } | null} */ (null))
// The page open (pageOpen()): a part's id, or '' for the list.

/** Opens the section's list ('') or a page, the keyboard on its title, or back on the list on the row it came from. @param {string} to */
function go(to) {
  const from = pageOpen()
  app.section.value = to ? `${sectionOpen()}/${to}` : sectionOpen()
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(to ? '.data-head h2' : `[data-part="${from}"]`))?.focus())
}

// ─── What takes up space ─────────────────────────────────────────────────────

/** What takes up space, by kind, largest first and the rest last; null while it is measured. */
const parts = signal(/** @type {Array<{ id: keyof typeof KINDS, bytes: number }> | null} */ (null))
/** The natural voice's languages here, and how much each takes. */
const voices = signal(/** @type {Record<string, number>} */ ({}))
/** Each kind: its icon, its name and what it holds, when its name doesn't say. */
const KINDS = /** @type {const} */ ({
  conversations: ['list', 'history.title', ''], files: ['file', 'cap.files.name', ''], computer: ['computer', 'cap.computer.name', 'storage.computer.text'],
  brains: ['brain-device', 'storage.brains', 'storage.brains.text'], voice: ['voice', 'cap.natural-voice.name', ''], app: ['download', 'storage.app', 'storage.app.text'], rest: ['cabinet', 'storage.rest', 'storage.rest.text'],
})

/** A cached response's size: its length as sent, unless it came compressed, then its body's. @param {Response | undefined} response */
const sizeOf = async (response) => (response && !response.headers.has('content-encoding') && Number(response.headers.get('content-length'))) || (await response?.blob())?.size || 0

/**
 * What the browser keeps for Jean in its caches: the brains downloaded to this device (Transformers.js's
 * cache), the natural voice's languages among them apart, and Jean's own code, the Computer's apart, to
 * work offline (sw.js's), with a score's instruments (D338).
 */
async function cached() {
  const kept = { brains: 0, computer: 0, app: 0, voice: 0 }
  const [langs, reader] = [/** @type {Record<string, number>} */ ({}), loaded.value.has('natural-voice') ? await import('../caps/natural-voice/natural-voice.js') : null]
  for (const name of await caches.keys()) {
    const kind = name === 'transformers-cache' ? 'brains' : /^app-cap-.*-computer$/.test(name) ? 'computer' : /^app-(shell-|cap-|sounds$)/.test(name) ? 'app' : null
    if (!kind) continue
    const cache = await caches.open(name)
    for (const [url, size] of await Promise.all((await cache.keys()).map(async (request) => /** @type {const} */ ([request.url, await sizeOf(await cache.match(request))])))) {
      const lang = kind === 'brains' ? reader?.fileIn(url) : undefined
      kept[lang === undefined ? kind : 'voice'] += size
      if (lang) langs[lang] = size
    }
  }
  voices.value = langs
  return kept
}

/** Measures what takes up space: Jean's files by kind (`weigh`), then its caches; what the browser counts beyond is the rest's. */
async function measure() {
  parts.value = null
  const [files, estimate, kept] = await Promise.all([weigh(app.fs), app.fs.estimate?.(), cached().catch(() => ({ brains: 0, computer: 0, app: 0, voice: 0 }))])
  const named = { conversations: files.conversations, files: files.files, computer: files.workspace + kept.computer, brains: kept.brains, voice: kept.voice, app: kept.app }
  const sum = Object.values(named).reduce((total, bytes) => total + bytes, 0)
  const rest = Math.max(files.rest, (estimate?.usage ?? 0) - sum)
  storage.value = { ...estimate, usage: sum + rest }
  parts.value = [...(/** @type {Array<[keyof typeof KINDS, number]>} */ (Object.entries(named))).filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1]), /** @type {const} */ (['rest', rest])]
    .map(([id, bytes]) => ({ id, bytes }))
}

/** Space used's page: a row a kind, its size and a bar of its share, the brains with the way to make room, the natural voice's languages each to remove; then whether the browser keeps it all, or where it is safe if not. */
function space() {
  const [total, copy] = [parts.value?.reduce((sum, part) => sum + part.bytes, 0) ?? 0, copied(all())]
  return html`<div class="parts">${parts.value ? html`<ul class="list">${parts.value.map(({ id, bytes }) => {
    const [icon, label, text] = KINDS[id]
    return html`<li>
      <span class="item-icon" aria-hidden="true">${icons[icon]}</span>
      <span class="item-text"><span id=${`part-${id}`}>${t(label)}</span>${text ? html`<small>${t(text, { name: BRAND.name })}</small>` : nothing}</span>
      <strong>${formatBytes(bytes)}</strong>
      <meter value=${total ? bytes / total : 0} aria-labelledby=${`part-${id}`}></meter>
      ${id === 'brains' ? html`<button class="button subtle" @click=${() => openSettings('brains')}>${t('data.room')}</button>` : nothing}
      ${id === 'voice' ? html`<ul class="voices">${Object.entries(voices.value).map(([lang, size]) => html`<li><span>${new Intl.DisplayNames(intlLocales(), { type: 'language' }).of(lang)}</span>
        <small>${formatBytes(size)}</small><button class="button subtle" @click=${() => import('../caps/natural-voice/natural-voice.js').then((reader) => reader.remove(lang)).then(measure)}>${t('action.remove')}</button></li>`)}</ul>` : nothing}
    </li>`
  })}</ul>` : html`<p class="muted" role="status">${t('storage.measuring')}</p>`}</div>
  ${storage.value?.persisted ? html`<p class="muted">${icons.check} ${t('storage.persisted')}</p>` : app.ephemeral.value ? nothing
    : copy ? html`<p class="muted">${icons.check} ${copy}</p>` : html`<p class="hint">${t('data.unkept')}</p>`}`
}

// ─── Backup and Bring in ─────────────────────────────────────────────────────

/** Whether Backup is offered: unless policy says no; in a private window too, as the one way to keep what was done there. */
const backs = () => !isDenied('backup')
/** When the last backup was downloaded here, if ever. */
const backedUp = () => app.settings.value.backedUp
/** How long ago a backup was made, a minute at least: "now" would read as if it were being made. @param {string} at */
const ago = (at) => relativeTime(Math.min(Date.parse(at), Date.now() - 60_000))
/** Download a backup, at the section's head and its page's. */
const download = () => (backs() ? html`<button class="button" @click=${backup}>${icons.backup} ${t('backup.download')}</button>` : nothing)
/** A backup is old once a week went by and tasks moved on since. */
const stale = (at = backedUp()) => !!at && Date.now() - Date.parse(at) > 7 * 86_400_000 && app.conversations.value.some((one) => one.updatedAt > at)

/** A backup of Jean's, or an export of Gemini's from Google Takeout, of ChatGPT's or of Claude's, its parts together (D340, D341). @param {Event} event */
async function restore(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length || !(await unlock('backup'))) return
  const { restoreBackup, isBackup, bringIn } = await import('../caps/backup/backup.js')
  if (!(await isBackup(files[0]))) await bringIn(files)
  else if (confirm(t('backup.confirmRestore'))) await restoreBackup(files[0])
}

/** A button that picks a backup or an export. @param {string} label */
const picker = (label) => html`<label class="button" for=${label}>${icons.upload} ${t(label)}
  <input id=${label} type="file" accept=".zip,.tgz,.json,application/zip,application/gzip" multiple class="visually-hidden" @change=${restore}></label>`

/** Bring in (D340, D341): how to ask each assistant for an export, then the file, into the project open. @type {Part} */
const BRING = { id: 'import', at: 0, group: 'others', icon: icons.upload, label: 'data.import', text: () => t('data.importText'),
  line: () => t('data.into', { project: projectName(app.project.value) }), draw: () => html`<section><h3>${t('data.ask')}</h3>
    <p>${t('data.assistants')}</p><p>${t('data.gemini')}</p></section>
    <section><div class="row">${picker('data.choose')}</div><p class="hint">${t('data.drop')}</p></section>` }

/** How long a task is kept once nothing changes in it: always, or a month, three months or a year, said as the language says it. */
const KEEP = [0, 30, 90, 365]
const kept = (/** @type {number} */ days) => (days ? new Intl.NumberFormat(intlLocales(), { style: 'unit', unit: days < 365 ? 'month' : 'year', unitDisplay: 'long' }).format(days < 365 ? days / 30 : 1) : t('data.forgetNever'))
/** Delete old tasks (D718): how long, chosen with what it means said first, older ones deleted at once, then each day. @type {Part} */
const forgetting = { id: 'forget', at: 8, group: 'here', icon: icons.trash, label: 'data.forget', text: () => kept(effective.value.settings.forget ?? 0), line: () => t('data.forgetText'),
  draw: () => html`<ul class="list forget-choices" role="radiogroup" aria-label=${t('data.forget')}>${KEEP.map((days) => html`<li><label for=${`forget-${days}`}>
    <input id=${`forget-${days}`} type="radio" name="forget" .checked=${(effective.value.settings.forget ?? 0) === days} @change=${async () => {
      if (days && !confirm(t('data.forgetConfirm', { kept: kept(days) }))) return void (app.settings.value = { ...app.settings.value })
      await updateSettings({ forget: days || undefined })
      if (days) await import('./forget.js').then((module) => module.forget(true))
    }}><strong>${kept(days)}</strong></label></li>`)}</ul>` }

/** Jean's own parts, Space used and Backup, the organization's once policy names one, and the capabilities' found. @returns {Part[]} */
function all() {
  const at = backedUp()
  const date = at && new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'long' }).format(new Date(at))
  const usage = storage.value?.usage
  return [/** @type {Part} */ ({ id: 'space', at: 9, group: 'here', icon: icons.cabinet, label: 'data.space', text: () => (usage === undefined ? '' : formatBytes(usage)),
    line: () => (usage === undefined || !storage.value?.quota ? '' : t('data.of', { size: formatBytes(usage), quota: formatBytes(storage.value.quota), name: BRAND.name })), draw: space }),
  ...(!backs() ? [] : [/** @type {Part} */ ({ id: 'backup', at: 0, group: 'copies', icon: icons.backup, label: 'cap.backup.name', text: () => (date ? t('data.last', { date }) : t('cap.backup.text')), line: () => (date ? t('data.last', { date }) : ''),
    node: () => ({ side: 'start', icon: icons.backup, name: t('cap.backup.name'), sub: at ? ago(at) : t('data.never'), state: !at ? 'off' : stale(at) ? 'wait' : 'ok' }),
    state: () => html`<span class=${`data-state ${stale(at) || !at ? 'is-wait' : ''}`}>${at ? ago(at) : t('data.never')}</span>`,
    end: download,
    draw: () => html`<p>${t('backup.text', { name: BRAND.name })}</p><p class="hint">${t('data.readable')}</p>
      <section><h3>${t('backup.restore')}</h3><div class="row">${picker('data.pick')}</div>
      ${app.policy.child ? nothing : html`<p class="hint"><button class="link-button" @click=${() => go('import')}>${t('data.import')}</button></p>`}</section>` })]),
  forgetting,
  // People met (D727), a way to their section from Privacy's, People's own code unchanged.
  ...(!loaded.value.has('people') ? [] : [/** @type {Part} */ ({ id: 'people', at: -1, section: 'privacy', group: 'others', icon: icons.people, label: 'cap.people.name', text: () => t('data.peopleText'), link: 'people', draw: () => null })]),
  ...(!slots('organization').length ? [] : [/** @type {Part} */ ({ id: 'organization', at: 9, section: 'privacy', group: 'others', icon: icons.badge, label: 'data.org', text: () => t('data.orgText'),
    draw: () => slots('organization').map((part) => part.draw()) })]),
  .../** @type {Part[]} */ (slots('data'))].filter((part) => part.when?.() ?? true)
}

// ─── The list and the pages ──────────────────────────────────────────────────

/** Where the user's things are safe beyond this device, the first part's copy in step that says. @param {Part[]} shown */
const copied = (shown) => shown.map((part) => part.copy?.()).find(Boolean)

/**
 * The one thing that matters most, a whole sentence: a part that needs the user (the synced folder stuck, the devices' store), with its
 * fix; nothing backed up yet, the browser that may clear it all, with the first part's fix (Add a device); a copy in step elsewhere, which
 * says they are safe there (and answers those two); a backup grown old; otherwise, when the last one was made. @param {Part[]} shown @returns {[string, unknown?]}
 */
function pressing(shown) {
  const [at, copy, says, fix] = [backedUp(), copied(shown), shown.find((part) => part.say?.()), shown.map((part) => part.fix?.()).find(Boolean)]
  if (says) return [says.say?.() ?? '', says.fix?.()]
  if (!copy && !at && backs() && everywhere.value) return [t('data.none'), fix]
  return !copy && storage.value?.persisted === false ? [t('data.unkept'), fix] : [copy ?? (at ? t(stale(at) ? 'data.old' : 'data.fine', { when: ago(at) }) : '')]
}

/**
 * The map's places, the parts' and, before Your devices is found where devices pair, the phone it would add, dashed: choosing it finds it
 * there (D281) and starts adding. @param {Part[]} shown @returns {Place[]}
 */
const places = (shown) => [...shown.flatMap((part) => part.node?.() ?? []), ...(pairs() && !loaded.value.has('devices') && !isDenied('devices') && !app.ephemeral.value ? [ghost(() => unlock('devices').then((on) => {
  if (on) import('../caps/devices/devices.js').then((devices) => { openSettings('devices'); devices.start() }) }))] : [])]

/** A part's row: the whole of it opens its page, or the section it leads to. @param {Part} part */
const row = (part) => html`<li><button class="item" data-part=${part.id} @click=${() => (part.link ? openSettings(part.link) : go(part.id))}><span class="item-icon">${part.icon}</span>
  <span class="item-text"><strong>${t(part.label)}</strong>${part.text() ? html`<small dir="auto">${part.text()}</small>` : nothing}</span>${part.state?.() ?? nothing}${icons.chevron}</button></li>`

/** The page open among these parts, under Back to its section, its name and its line, what it does most at its end; or null. @param {Part[]} shown @param {string} title */
function opened(shown, title) {
  const page = shown.find((part) => part.id === pageOpen() && part.page !== false && !part.link), said = page && (page.line ?? page.text)()
  return page ? html`<button class="back button subtle" @click=${() => go('')}>${icons.back} ${t(title)}</button>
    <header class="data-head"><div><h2 tabindex="-1">${t(page.label)}</h2>${said ? html`<p class="lede">${said}</p>` : nothing}</div>${page.end?.() ?? nothing}</header>${page.draw({ lockedBy })}` : null
}
/** These parts' rows, in these groups, each under its heading. @param {Part[]} shown @param {Part['group'][]} names */
const grouped = (shown, names) => names.map((group) => ((rows) => (rows.length ? html`<section><h3>${t(`data.${group}`)}</h3><ul class="list data-rows">${rows.map(row)}</ul></section>` : nothing))(
  shown.filter((part) => part.group === group && part.page !== false).sort((a, b) => a.at - b.at)))

/** Settings' Privacy (D729): who can open the user's things on this device, and who else sees them; or the page open. */
export const privacy = () => ((shown) => opened(shown, 'settings.privacy') ?? html`<header class="data-head"><div><h2>${t('settings.privacy')}</h2><p class="lede">${t('data.privacyLine')}</p></div></header>
  ${grouped(shown, ['here', 'others'])}`)(all().filter((part) => part.section === 'privacy'))

/** Settings' Your data: the list, or the page open. */
export function section() {
  const shown = all().filter((part) => !part.section), page = opened([...shown, BRING], 'settings.storage')
  if (page) return page
  const [[said, fix], around] = [pressing(shown), places(shown)]
  return html`<header class="data-head"><h2>${t('settings.storage')}</h2>${download()}</header>
    ${around.length ? map(t('data.where'), { icon: handheld() ? icons.phone : icons.computer, name: t('data.this') }, around) : nothing}<p class="lede">${app.ephemeral.value ? html`<strong>${t('storage.ephemeral')}</strong>` : html`${t('data.kept')} ${said ? html`<strong>${said}</strong>` : nothing}`}</p>${fix && !app.ephemeral.value ? html`<div class="row data-fix">${fix}</div>` : nothing}
    ${grouped(shown, ['here', 'copies'])}
    ${app.policy.child ? nothing : html`<section><ul class="list data-rows">${row(BRING)}</ul></section>`}
    ${app.ephemeral.value ? html`<p class="hint">${t('data.private', { name: BRAND.name })}</p>` : nothing}`
}

let inside = ''
// Entering Your data or one of its pages (its address may name one, so this runs last: on import), or once a backup is made, the browser says again what it keeps; Space used measures each kind.
effect(() => {
  const open = app.dialog.value === 'settings' && sectionOpen() === 'data' ? pageOpen() : null
  const now = open === null ? '' : `${open}|${app.settings.value.backedUp}`
  if (now && now !== inside) (open === 'space' ? measure() : app.fs.estimate?.().then((value) => { storage.value = value }))?.catch(() => {})
  inside = now
})
