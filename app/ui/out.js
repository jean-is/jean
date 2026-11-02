// How what a pane shows leaves Jean (D683), the same for a document, a collection, a deck, a design, a tune, a game, an app, a picture,
// a film or any other file: one button in its head, just before Close, whose menu goes in one order, as an answer's does: to someone
// (Share, a link; Send to an app, the system's sheet; Copy), as a file (Download, the format most people want first, its own file last),
// on paper (Print, or save as PDF, which ⌘P does in the pane too), then the way to the design system for what wears one. What a kind has
// no use for, or this browser or this Jean hasn't, isn't there, and one way alone is the button itself. A kind says what it can do
// through its `out` slot: `of(file)` whether it is its own, `load()` the module whose `ways(file, pane)` says so, read as a pane first draws one.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { app, notify } from './state.js'
import { act } from './acts.js'
import { loaded, slots } from './caps.js'
import { icons } from './menu-icons.js'
import { t, useStrings } from '../core/i18n.js'

await useStrings('out')

/**
 * One way out. id: the format the audit is told (D421), none where what it runs tells it; run: given what was pressed.
 * @typedef {{ id: string, glyph?: unknown, label?: string, run: (from: EventTarget | null) => unknown }} Way
 */
/**
 * What a kind can do. first: what to do before any of it (a design's marks); share: what a link holds (Share's `Item`); send: what the system's
 * sheet is given, with the file's name and type this browser is asked about.
 * @typedef {{ first?: Way, share?: () => unknown, send?: { file?: string, type?: string, make: () => Promise<ShareData> }, copy?: Way, files: Way[], print?: Way, kit?: boolean }} Ways
 */

/** Each kind's module, once read. @type {import('@preact/signals-core').Signal<Map<unknown, { ways: (file: any, pane: Element) => Ways | null }>>} */
const read = signal(new Map())
const moduleOf = (/** @type {any} */ part) => read.value.get(part) ?? void part.load().then((/** @type {any} */ module) => { read.value = new Map(read.peek()).set(part, module) })

/** What an `out` slot says of the file a pane shows, or `other` where no kind claims it. @param {any} file @param {Element} pane @param {() => Ways} other @returns {Ways | null} */
export function waysOf(file, pane, other) {
  const part = slots('out').find((one) => one.of(file))
  return part ? moduleOf(part)?.ways(file, pane) ?? null : other()
}

/** A way taken, said to the audit once done; a system sheet closed unused is no failure. @param {any} file @param {Way} way @param {EventTarget | null} [from] */
async function take(file, way, from = null) {
  try {
    await way.run(from)
    if (way.id) act('file.save', { task: app.current.peek()?.path, path: file.uri, format: way.id })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) (console.warn('Out', error), notify(t(way.id === 'copy' ? 'made.copyFailed' : 'out.failed'), { alert: true }))
  }
}

/** ⌘P in a pane prints what it shows, not the task beside it, for a kind that prints. @param {KeyboardEvent} event @param {any} file @param {Ways | null} ways */
export function printKey(event, file, ways) {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === 'p' && ways?.print) (event.preventDefault(), take(file, ways.print))
}

/** What the system's sheet will send, made as the menu opens, so that it is there within the click the sheet needs. @type {Promise<ShareData> | null} */
let ready = null

/** The design system's page: the project's where it has a look of its own, which goes over the person's, so that a change shows in the pane. */
const toKit = async () => { const [{ openSettings }, { projectKit }] = await Promise.all([import('./dialogs.js'), import('./kit.js')]); await openSettings(app.project.peek().data.default !== true && await projectKit() ? 'appearance/kit-project' : 'appearance/kit') }

/** The button and its menu, or the button alone. @param {any} file @param {Ways | null} ways */
export function outButton(file, ways) {
  if (!ways) return nothing
  const { send, share, first, copy, files, print, kit } = ways, menu = `out-${file.uri}`, linked = share && loaded.value.has('share')
  const sends = send && navigator.canShare?.(send.file ? { files: [new File([''], send.file, { type: send.type })] } : { text: 'a' })
  const row = (/** @type {Way} */ way) => html`<li><button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${(/** @type {Event} */ event) => take(file, way, event.currentTarget)}>${way.glyph}<span dir="auto">${way.label}</span></button></li>`
  const to = /** @type {Way[]} */ ([...(linked ? [{ id: '', glyph: icons.share, label: t('out.share'), run: async (/** @type {EventTarget | null} */ from) => (await import('../caps/share/share.js')).openShare({ path: app.current.peek()?.path ?? `${app.projectDir}/conversations/`, title: file.title, item: /** @type {any} */ (await share()) }, from) }] : []),
    ...(sends ? [{ id: 'share', glyph: icons.send, label: t('out.send'), run: async () => navigator.share(await (ready ?? send.make())) }] : []), ...(copy ? [{ glyph: icons.copy, label: t('action.copy'), ...copy }] : [])])
  const paper = print ? [{ glyph: icons.print, label: t('out.print'), ...print }] : [], every = [...to, ...files, ...paper]
  if (every.length === 1 && !first && !kit) return html`<button class="icon-button" aria-label=${t('out.name', { name: file.name })} @click=${() => take(file, every[0])}>${icons.download}</button>`
  return html`<button class="icon-button" popovertarget=${menu} aria-label=${t(linked || sends ? (print ? 'out.menu' : 'out.menuNoPrint') : 'out.menuNoShare')}>${linked || sends ? icons.share : icons.download}</button>
    <div id=${menu} class="menu out-menu" popover @toggle=${(/** @type {ToggleEvent} */ event) => { ready = sends && event.newState === 'open' ? send.make() : null; ready?.catch(() => {}) }}>
      ${first ? html`<ul>${row(first)}</ul><hr>` : nothing}${to.length ? html`<ul>${to.map(row)}</ul><hr>` : nothing}
      <div role="group" aria-label=${t('out.download')}><p class="out-heading" aria-hidden="true">${t('out.download')}</p><ul>${files.map(row)}</ul></div>
      ${paper.length ? html`<hr><ul>${paper.map(row)}</ul>` : nothing}${kit ? html`<hr><ul>${row({ id: '', glyph: icons.palette, label: t('out.kit'), run: toKit })}</ul>` : nothing}
    </div>`
}
