// SPDX-License-Identifier: MIT
// Report a problem (D771): where a request waits, said in the live answer and in the box once it lasts (ui/trail.js keeps it), and a report
// for support, made from everything that would help to see what went wrong and none of the person's words, names or keys (build.js),
// shown before it leaves: copied, saved, written to support, or as a sealed link that ends after a week. Each way asks `report.check` first,
// which an organisation's data checks may refuse (ee/dlp.js), then says it was done (`act`). Loaded once a request is slow, a send wasn't
// sent, or Settings asks for it, never offered. Opened by support, a report becomes a stand-in to restore in a new profile (standin.js).
import { html, nothing, render } from 'lit-html'
import { signal, effect } from '@preact/signals-core'
import { register, slots, loaded, isDenied, contributions, unlock } from '../../ui/caps.js'
import { app, runs } from '../../ui/state.js'
import { act } from '../../ui/acts.js'
import { save } from '../../ui/save.js'
import { getSecret } from '../../ui/secrets.js'
import { here as profile } from '../../ui/opfs.js'
import { fire } from '../../core/hooks.js'
import { join } from '../../core/fs.js'
import { listSkills } from '../../core/skills.js'
import { loadConversation } from '../../core/conversations.js'
import { PROVIDERS } from '../../core/llm.js'
import { DEFAULT_URLS, serviceURL } from '../../core/settings.js'
import { t, useStrings, locale, intlLocales, formatDuration } from '../../core/i18n.js'
import { icons } from '../../ui/menu-icons.js'
import { styleSheet, still } from '../../ui/sheet.js'
import { BRAND } from '../../brand.js'
import { trails, ended, attempts, log, moved, SLOW_MS } from '../../ui/trail.js'
import { build, markdown } from './build.js'

await Promise.all([useStrings('report'), styleSheet(new URL('report.css', import.meta.url))])

// Past this long on one stage, Report a problem is offered; a send not sent is told this long after.
const [STALLED_MS, TOLD_MS, began] = [20_000, 120_000, Date.now()]
// What the live answer and the box say themselves once it lasts, the rest (words coming, a call, a card) showing already; hooks whose wait has a sentence of its own.
const [SAID, OWN, UNSENT] = [['choose', 'prepare', 'read', 'key', 'hook', 'ask'], ['receipt', 'compact'], ['held', 'unreached', 'loading', 'unloaded']]
// Jean's own words, which a report keeps as they are: events, kinds of call, rules, besides the capabilities' ids and the providers'.
const WORDS = ['task.start', 'task.turn', 'turn.step', 'turn.compact', 'turn.limit', 'turn.answer', 'tool.check', 'turn.end', 'file.add', 'signout', 'remove', 'record', 'person.check', 'act', 'seal', 'report.check',
  'read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other', 'allow', 'ask', 'never', 'low', 'medium', 'high', 'none', 'key', 'oauth', 'oidc', 'dlp', 'audit', 'policy', 'user']

/** One more each second while something is under way or was just not sent, for the seconds shown. */
const second = signal(0)
let ticking = 0

/** The place on screen: its task, or '' for one about to start. */
const place = () => app.current.value?.path ?? ''
/** Where the request to a task is, and since when. @param {string} path */
const stageOf = (path) => { void moved.value, second.value; const trail = trails.get(path), stage = trail?.stages.at(-1); return trail && stage ? { stage, for: Date.now() - trail.began - stage.at } : null }
/** The last send from the box that wasn't sent, while it is recent. */
const unsent = () => { const last = attempts.at(-1); return last && UNSENT.includes(last.outcome ?? '') && Date.now() - last.at < TOLD_MS ? last : null }
const pending = () => trails.size > 0 || Boolean(unsent())
effect(() => { void moved.value; if (!ticking && pending()) ticking = setInterval(() => { if (!pending()) (clearInterval(ticking), (ticking = 0)); second.value++ }, 1000) })

/** What a hook's owner is called: an extension's or the organisation's, as their capability says, or a capability's name. @param {string} by */
const nameOf = (by, key = `cap.${by}.name`) => /** @type {string | undefined} */ (slots('by').map((one) => one.draw({ by })).find((name) => typeof name === 'string' && name)) || (t(key) === key ? '' : t(key))

/** A stage in the room's words. @param {import('../../ui/trail.js').Stage} stage */
const sentence = ({ id, by = '', brain = '' }) => (id !== 'hook' ? t(`report.stage.${id}`, { brain: brain && t(`provider.${brain}`) }) : OWN.includes(by) ? t(`report.stage.${by}`)
  : nameOf(by) ? t('report.stage.hook', { name: nameOf(by) }) : t('report.stage.check'))

/** The live answer's line once a stage lasts (ui/chat.js), else nothing of its own. @param {string} path its task */
const words = (path) => { const now = stageOf(path); return now && now.for >= SLOW_MS && SAID.includes(now.stage.id) ? sentence(now.stage) : undefined }

/** A stage lasting long enough to offer a report, unless words are coming or the person has a card to answer. @param {string} path */
const stalled = (path) => { const now = stageOf(path); return Boolean(now && now.for >= STALLED_MS && now.stage.id !== 'write' && now.stage.id !== 'decide') }

/** A stage and how long it has lasted, each kept whole in a line of the other direction. @param {string} words @param {number} ms */
const waited = (words, ms) => html`<bdi>${words}</bdi> · <bdi>${formatDuration(Math.max(0, Math.floor(ms / 1000) * 1000))}</bdi>`
const offer = (/** @type {string} */ why) => html`<button type="button" class="link-button" @click=${() => open(why)}>${t('report.title')}</button>`

/** Under the live answer, once it stalls. @param {{ streaming?: boolean, drawing: { path: string } }} props */
const slow = ({ streaming, drawing }) => (streaming && stalled(drawing.path) ? html`<p class="report-slow"><span>${t('report.slow')}</span> ${offer('stalled')}</p>` : nothing)

/**
 * In the box: before its request has a task's answer under way, where it waits once that lasts; a send that wasn't sent, why. The region is
 * there before its words, which come a moment after it is drawn.
 */
function line() {
  const path = place(), now = runs.has(path) ? null : stageOf(path), missed = unsent(), shown = Date.now() - began > 800
  const said = !shown ? '' : missed ? t(`report.unsent.${missed.outcome}`) : now && now.for >= SLOW_MS && SAID.includes(now.stage.id) ? waited(sentence(now.stage), now.for) : ''
  return html`<p class="report-line" role="status"><span dir="auto">${said}</span>${said && (missed || stalled(path)) ? html` ${offer(missed ? 'unsent' : 'stalled')}` : nothing}</p>`
}

// ─── The report ──────────────────────────────────────────────────────────────

/** How long something takes to answer, given 3 s at most: its time in ms, or why it didn't. @param {unknown} promise */
const timed = (promise) => { const from = performance.now(); return Promise.race([Promise.resolve(promise).then(() => Math.round(performance.now() - from), () => 'failed'), new Promise((resolve) => setTimeout(() => resolve('no answer'), 3000))]) }

/** @param {string} dir @param {string} folder */
const countIn = async (dir, folder) => (await app.fs.list(join(dir, folder)).catch(() => [])).filter((entry) => entry.kind === 'file').length

/** What the browser says of itself, the screen and the device, nothing of the person. */
async function browser() {
  const agent = /** @type {any} */ (navigator).userAgentData
  const [high, adapter, estimate, persisted] = await Promise.all([agent?.getHighEntropyValues?.(['platformVersion', 'fullVersionList', 'architecture']).catch(() => null),
    /** @type {any} */ (navigator).gpu?.requestAdapter?.().catch(() => null), navigator.storage?.estimate?.().catch(() => null), navigator.storage?.persisted?.().catch(() => null)])
  const media = (/** @type {string} */ query) => matchMedia(query).matches
  return { userAgent: navigator.userAgent, brands: high?.fullVersionList ?? agent?.brands, platform: agent?.platform, platformVersion: high?.platformVersion, architecture: high?.architecture, mobile: agent?.mobile,
    language: locale.peek(), languages: [...navigator.languages], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
    online: navigator.onLine, dark: media('(prefers-color-scheme: dark)'), reducedMotion: still(), contrast: media('(prefers-contrast: more)'), standalone: media('(display-mode: standalone)'),
    gpu: adapter ? { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture } : null, persisted, usedMB: Math.round((estimate?.usage ?? 0) / 1e6), quotaMB: Math.round((estimate?.quota ?? 0) / 1e6), isolated: crossOriginIsolated }
}

/**
 * Everything a report is made from, as the room has it now. @param {string} why what asked for it: `stalled`, `unsent`, `asked` @param {boolean} include the task's words too
 * @returns {Promise<Record<string, any>>}
 */
async function made(why, include) {
  const settings = app.settings.peek(), policy = /** @type {Record<string, any>} */ (app.policy), path = app.current.peek()?.path ?? ''
  const [listing, registration, task, skills, browsed, keys] = await Promise.all([fetch(new URL('../../capabilities.json', import.meta.url)).then((response) => response.json()).catch(() => ({})),
    navigator.serviceWorker?.getRegistration().catch(() => undefined), path ? loadConversation(app.fs, path).catch(() => null) : null,
    listSkills(app.fs, app.project.peek().data.default === true ? [''] : ['', app.projectDir]).catch(() => []), browser(), Promise.all(settings.brains.map((brain) => getSecret(app.fs, brain.id).then((key) => (key ? brain.id : '')))).catch(() => [])])
  const ids = Object.keys(listing.capabilities ?? {}), active = settings.brains.find((brain) => brain.id === settings.activeBrain)
  const [extensions, directory, status] = await Promise.all([loaded.peek().has('extensions') ? import('../extensions/extensions.js') : null, import('../connections/directory.js'),
    loaded.peek().has('connections') ? import('../connections/connections.js').then((module) => module.status.peek()) : {}])
  const run = runs.get(path), trail = trails.get(path) ?? null
  // The probes, and what the user found, or policy turns on, that hasn't come back within theirs: what holds `app.ready`, which a request waits for a while (ui/send.js).
  const [probes, coming] = await Promise.all([Promise.all(Object.entries({ storage: app.fs.read('settings.json'), ready: app.ready, send: import('../../ui/send.js'), key: active ? getSecret(app.fs, active.id) : null })
    .map(async ([name, promise]) => [name, promise === null ? 'none' : await timed(promise)])).then(Object.fromEntries), Promise.all([...new Set([...settings.unlocked, ...(policy.capabilities?.preUnlock ?? [])])].map(async (id) => (isDenied(id) || (await timed(unlock(id))) !== 'no answer' ? [] : [id]))).then((ids) => ids.flat())])
  return build({
    made: Date.now(), why, origin: location.origin, include,
    jean: { version: listing.release?.version, date: listing.release?.date, files: listing.version, host: location.hostname === BRAND.domain ? BRAND.domain : 'own', sub: location.pathname !== '/',
      desktop: Boolean(sessionStorage.getItem('app.host')), profile: profile() ? 'another' : 'first', worker: { controlled: Boolean(navigator.serviceWorker?.controller), waiting: Boolean(registration?.waiting) }, update: app.updateReady.peek() },
    browser: browsed, settings, policy: Object.keys(policy).length ? policy : null,
    words: [...ids, ...Object.keys(PROVIDERS), ...WORDS, ...Object.keys(DEFAULT_URLS), ...directory.DIRECTORY.map((one) => one.id)],
    tools: contributions().tools.filter((tool) => !tool.service).map((tool) => tool.spec.name),
    defaults: { ...DEFAULT_URLS, ...Object.fromEntries(Object.entries(PROVIDERS).map(([id, provider]) => [`provider:${id}`, provider.baseURL])) }, keyed: keys.filter(Boolean),
    directory: Object.fromEntries(directory.DIRECTORY.flatMap((one) => (one.url ? [[one.url, one.id]] : []))),
    projects: app.projects.peek().map((project) => ({ dir: project.dir, data: project.data, body: project.body, current: project.dir === app.projectDir })),
    skills: skills.map((skill) => ({ name: skill.name, source: skill.source, blocks: skill.blocks, body: skill.body, ready: Boolean(skill.metadata?.['title-en']) })),
    routines: (await Promise.all(['', app.projectDir].map((dir) => countIn(dir, 'routines')))).map((count, i) => ({ place: i ? 'project' : 'home', count })),
    flows: (await Promise.all(['', app.projectDir].map((dir) => countIn(dir, 'flows')))).reduce((sum, count) => sum + count, 0),
    memory: (await Promise.all(['memory.md', join(app.projectDir, 'memory.md')].map(async (file) => ((await app.fs.read(file).catch(() => null)) ?? '').split('\n').filter((one) => /^[-*]\s/.test(one)).length))).reduce((sum, count) => sum + count, 0),
    extensions: (extensions?.installed.peek() ?? []).map((manifest) => { const switched = settings.extensions?.[manifest.name], host = extensions?.running.peek().get(manifest.name)
      return { name: manifest.name, source: switched?.from ? 'address' : 'file', hooks: host?.hooks.map((hook) => hook.on) ?? [], slots: host?.slots ?? [], rights: manifest.rights, on: switched?.on !== false, failed: switched?.failed } }),
    status: /** @type {any} */ (status),
    now: { busy: app.busy.peek(), presence: app.presence.peek(), task: path || null, trail, ended: [...ended], attempts: attempts.slice(-10),
      runs: [...runs.values()].map((one) => ({ path: one.path, provider: one.brain.provider, model: one.brain.model, steps: one.turn.steps.length, stopped: one.controller.signal.aborted })),
      waiting: app.decisions.peek().map((decision) => ({ path: decision.conversation, kind: 'toolCall' in decision ? String(decision.toolCall.kind ?? 'other') : 'question' })),
      hooks: contributions().hooks.filter((hook) => /^(task|turn|tool|report)\./.test(hook.on)).map((hook) => ({ by: hook.by ?? '', on: hook.on, tier: hook.tier ?? 'jean' })),
      loaded: [...loaded.peek().keys()], denied: ids.filter(isDenied), coming, probes, ...(run && { since: Date.now() - Date.parse(run.turn.at) }) },
    task: task ? { path, records: task.records } : null, log: [...log],
  })
}

// ─── The dialog ──────────────────────────────────────────────────────────────

/** @typedef {{ report: Record<string, any>, why: string, include: boolean, busy: boolean, said: string, link: string }} Shown */
const shown = signal(/** @type {Shown | null} */ (null))
const dialog = () => /** @type {HTMLDialogElement | null} */ (document.querySelector('dialog.report'))

/** A count in words; a list of them, or none. @param {string} key @param {number} count */
const counted = (key, count) => t(key, { count })
const list = (/** @type {string[]} */ items) => (items.length ? new Intl.ListFormat(intlLocales()).format(items) : t('report.none'))

/** The report's main facts, in the person's words, before all of it. @param {Record<string, any>} report */
function facts(report) {
  const { jean, browser: seen, settings, context, now, task, log: lines } = report
  const trail = now.trail ?? now.ended[0], stage = trail?.stages.at(-1)
  // A trail began this long before the report was made (build.js), and its stage this long after it began.
  const where = now.trail && stage ? waited(sentence(stage), -now.trail.began - stage.at)
    : UNSENT.includes(now.attempts.at(-1)?.outcome ?? '') ? t(`report.unsent.${now.attempts.at(-1).outcome}`) : t('report.idle')
  const brands = (seen.brands ?? []).filter((/** @type {{ brand: string }} */ one) => !/Not.A.Brand|Chromium/i.test(one.brand)).map((/** @type {{ brand: string, version: string }} */ one) => `${one.brand} ${one.version}`)
  const rows = /** @type {[string, unknown][]} */ ([
    ['report.row.version', `${BRAND.name} ${jean.version ?? '?'}`],
    ['report.row.browser', [...brands, [seen.platform, seen.platformVersion].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || seen.userAgent],
    ['report.row.where', where],
    ['report.row.brains', list(settings.brains.map((/** @type {{ provider: string, model: string }} */ brain) => `${t(`provider.${brain.provider}`)} ${brain.model ?? ''}`.trim()))],
    ['report.row.context', list([counted('report.count.capabilities', now.capabilities.loaded.length), counted('report.count.connections', context.connections.length), counted('report.count.extensions', context.extensions.length), counted('report.count.skills', context.skills.length)])],
    ['report.row.task', task ? counted('report.count.records', task.records) : t('report.none')],
    ['report.row.log', counted('report.count.lines', lines.length)],
  ])
  return html`<dl class="report-facts">${rows.map(([key, value]) => html`<div><dt>${t(key)}</dt><dd dir="auto">${value}</dd></div>`)}</dl>`
}

/** What the dialog shows: what goes, the choice of the task's words, all of it folded, and the ways it leaves. @param {Shown} now */
function sheet(now) {
  const settings = app.settings.peek(), support = serviceURL('support', settings, app.policy), linkable = Boolean(serviceURL('share', settings, app.policy)) && app.policy.rules?.share !== 'never'
  const close = () => dialog()?.close()
  return html`<dialog class="sheet report" aria-labelledby="report-title">
    <header class="dialog-head"><h2 id="report-title">${t('report.title')}</h2><button type="button" class="icon-button" aria-label=${t('action.close')} @click=${close}>${icons.close}</button></header>
    <p>${t('report.intro')}</p>
    ${facts(now.report)}
    <p class="report-words"><input type="checkbox" id="report-words" .checked=${now.include} ?disabled=${now.busy || !app.current.peek()} @change=${(/** @type {Event} */ event) => remake(/** @type {HTMLInputElement} */ (event.target).checked)}>
      <label for="report-words">${t('report.words')}</label></p>
    <p class="hint">${t('report.wordsHint')}</p>
    <details class="report-json"><summary>${t('report.json')}</summary><pre dir="ltr" tabindex="0">${JSON.stringify(now.report, null, 2)}</pre></details>
    <p class="report-said" role="status">${now.said}${now.link ? html` <a href=${now.link} target="_blank" rel="noopener noreferrer" dir="ltr">${now.link}</a>` : nothing}</p>
    <footer class="dialog-foot">
      <button type="button" class="button subtle" ?disabled=${now.busy} @click=${() => way('copy', copy)}>${icons.copy}${t('action.copy')}</button>
      <button type="button" class="button subtle" ?disabled=${now.busy} @click=${() => way('save', keep)}>${icons.download}${t('report.save')}</button>
      ${support ? html`<button type="button" class="button subtle" ?disabled=${now.busy} @click=${() => way('write', (text) => write(text, support))}>${icons.send}${t('report.write')}</button>` : nothing}
      ${linkable ? html`<button type="button" class="button primary" ?disabled=${now.busy} @click=${() => way('share', link)}>${icons.share}${t('report.link')}</button>` : nothing}
    </footer>
  </dialog>`
}

/** The report made again, with or without the task's words. @param {boolean} include */
const remake = async (include, now = /** @type {Shown} */ (shown.peek())) => { shown.value = { ...now, busy: true, include }; shown.value = { ...now, include, busy: false, said: '', link: '', report: await made(now.why, include) } }

/**
 * A way out, once the organisation's checks let it (`report.check`), then told (`act`). @param {'copy' | 'save' | 'write' | 'share'} name
 * @param {(text: string) => Promise<unknown>} run
 */
async function way(name, run) {
  const now = shown.peek()
  if (!now || now.busy) return
  const text = JSON.stringify(now.report, null, 2)
  shown.value = { ...now, busy: true, said: '' }
  const asked = await fire(contributions().hooks, 'report.check', { way: name, text, words: now.include }, (e) => e)
  if (asked?.refuse) return void (shown.value = { ...now, busy: false, said: t('report.refused') })
  const said = await run(text).then((done) => (typeof done === 'string' ? done : ''), (error) => { console.warn('Report', error); return t('report.failed') })
  act(`report.${name}`, { words: now.include })
  shown.value = { ...now, ...shown.peek(), busy: false, said: said || shown.peek()?.said || '' }
}

const copy = (/** @type {string} */ text) => navigator.clipboard.writeText(text).then(() => t('toast.copied'))
const keep = async (/** @type {string} */ text) => { save(new Blob([text], { type: 'application/json' }), `${t('report.fileName', { date: new Intl.DateTimeFormat('en-CA').format(new Date()) })}.json`); return t('report.saved') }

/** To support: the report on the clipboard, then their address, a mail with a subject or their page. @param {string} text @param {string} to */
async function write(text, to) {
  await navigator.clipboard.writeText(text)
  const mail = to.startsWith('mailto:')
  const address = mail ? `${to}${to.includes('?') ? '&' : '?'}${new URLSearchParams({ subject: t('report.subject', { name: BRAND.name, version: String(shown.peek()?.report.jean.version ?? '') }), body: t('report.mailBody') }).toString().replaceAll('+', '%20')}` : to
  globalThis.open(address, mail ? '_self' : '_blank', 'noopener')
  return t('report.written')
}

/** A sealed link to the report as a page, which ends after a week, listed with the person's links (caps/share). */
async function link() {
  const share = await import('../share/share.js'), now = /** @type {Shown} */ (shown.peek())
  const made = await share.create({ path: app.current.peek()?.path ?? `${app.projectDir}/conversations/`, title: t('report.title'), item: { text: markdown(now.report, t) } }, { days: 7 })
  const url = share.linkFor(made)
  shown.value = { ...now, link: url }
  await navigator.clipboard.writeText(url).catch(() => {})
  return t('report.linked')
}

/**
 * A dialog over the page while its state holds something, drawn from it, until it closes. @template T
 * @param {import('@preact/signals-core').Signal<T | null>} state @param {(now: T) => unknown} view
 */
function over(state, view) {
  const host = document.body.appendChild(document.createElement('div')), stop = effect(() => { const now = state.value; if (now) render(view(now), host) })
  const opened = /** @type {HTMLDialogElement} */ (host.querySelector('dialog'))
  opened.addEventListener('close', () => { stop(); host.remove(); state.value = null })
  opened.showModal()
}

/** Report a problem: the report made now, over the page, until it closes. @param {string} [why] what asked for it: `stalled`, `unsent`, `asked` */
export async function open(why = 'asked') {
  if (shown.peek()) return dialog()?.showModal()
  shown.value = { report: await made(why, false), why, include: false, busy: false, said: '', link: '' }
  over(shown, sheet)
}

// ─── A report someone sent ───────────────────────────────────────────────────

/** @typedef {{ report: Record<string, any> | null, wrong: boolean, said: string }} Taken */
const taken = signal(/** @type {Taken | null} */ (null))

/** A report from what was pasted or picked: its JSON, or the JSON in a link's page. @param {string} text */
const read = (text) => { try { const report = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)?.[1] ?? text); return report?.format === 1 && report.kind === 'report' ? report : null } catch { return null } }
/** @param {string} text */
const given = (text) => { const report = read(text); taken.value = { report, wrong: Boolean(text.trim()) && !report, said: '' } }

/** The report as a stand-in, a backup to restore in a new profile, and what it can't hold. @param {Record<string, any>} report */
async function standIn(report) {
  const [{ standIn: filesOf }, { writeZip }, { DIRECTORY }] = await Promise.all([import('./standin.js'), import('../../core/zip.js'), import('../connections/directory.js')])
  const { files, missing } = filesOf(report, { providers: PROVIDERS, directory: Object.fromEntries(DIRECTORY.map((one) => [one.id, { name: one.name, url: one.url }])) })
  save(new Blob([/** @type {BlobPart} */ (await writeZip(files))], { type: 'application/zip' }), `${t('report.standInName', { date: new Intl.DateTimeFormat('en-CA').format(new Date()) })}.zip`)
  taken.value = { report, wrong: false, said: t('report.standInSaved', { missing: list(missing.map((key) => t(`report.missing.${key}`))) }) }
}

/** @param {Taken} now */
function takeSheet(now) {
  const close = () => /** @type {HTMLDialogElement | null} */ (document.querySelector('dialog.report-take'))?.close()
  return html`<dialog class="sheet report report-take" aria-labelledby="report-take-title">
    <header class="dialog-head"><h2 id="report-take-title">${t('report.take')}</h2><button type="button" class="icon-button" aria-label=${t('action.close')} @click=${close}>${icons.close}</button></header>
    <p>${t('report.takeIntro')}</p>
    <p class="report-paste"><label for="report-pasted">${t('report.paste')}</label><textarea id="report-pasted" dir="ltr" rows="4" @input=${(/** @type {Event} */ event) => given(/** @type {HTMLTextAreaElement} */ (event.target).value)}></textarea></p>
    <p><label class="button subtle" for="report-file">${icons.upload}${t('report.pick')}<input id="report-file" type="file" accept=".json,.md,application/json,text/markdown" class="visually-hidden"
      @change=${async (/** @type {Event} */ event) => { const file = /** @type {HTMLInputElement} */ (event.target).files?.[0]; if (file) given(await file.text()) }}></label></p>
    <p role="alert">${now.wrong ? t('report.notReport') : nothing}</p>
    ${now.report ? facts(now.report) : nothing}
    <p class="report-said" role="status">${now.said}</p>
    <footer class="dialog-foot"><button type="button" class="button primary" ?disabled=${!now.report} @click=${() => now.report && standIn(now.report)}>${icons.download}${t('report.standIn')}</button></footer>
  </dialog>`
}

/** Open a report someone sent: pasted or picked, shown as it was sent, then saved as a stand-in. */
export function take() {
  if (taken.peek()) return
  taken.value = { report: null, wrong: false, said: '' }
  over(taken, takeSheet)
}

register({ id: 'report', slots: { stage: { at: 0, draw: () => nothing, words }, progress: { at: 90, draw: slow }, box: { at: 0, draw: line } } })
