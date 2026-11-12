// SPDX-License-Identifier: MIT
// What the user marks in a file beside the task (D690). Words selected in its view, a PDF's page (its words laid over it,
// ui/view.js) or a text, offer a bar: Highlight, Note and Ask Jean, in the top layer next after the view in the order of focus
// (Alt+F10 from the view, the arrows along it, Escape back), as a document's bubble is (D485). A highlight, with a note or not, is
// a file of its own, `marks/<the file's name>/<ULID>.json`, its words and page, found again each time the file shows, and lit
// (CSS.highlights); selected or pressed again, it offers its note and Remove. Ask Jean tells the brain of the words with the next
// message (./files.js), says so in a toast, and makes way for the box where the pane covers the conversation.
import { html, nothing, render } from 'lit-html'
import { app, notify, assistantName } from '../../ui/state.js'
import { t, dir, useStrings } from '../../core/i18n.js'
import { ulid } from '../../core/ulid.js'
import { rangeOf } from '../../ui/view.js'
import { pop, float, free } from '../documents/ui.js'
import { point } from './files.js'

await useStrings('files')

/** @typedef {{ format: 1, kind: 'mark', file: string, page?: number, words: string, note?: string, author: string, createdAt: string, changedAt: string }} Mark */
/** @typedef {{ mark: Mark, path: string, range: Range }} Shown */

/** What every pane shows marked, by its file. @type {Map<string, Shown[]>} */
const shown = new Map()
/** Every pane's marks lit, those with a note underlined too. */
function lit() {
  const all = [...shown.values()].flat()
  if (globalThis.Highlight) CSS.highlights.set('mark', new Highlight(...all.map(({ range }) => range))), CSS.highlights.set('noted', new Highlight(...all.filter(({ mark }) => mark.note).map(({ range }) => range)))
}

/** Where a file's marks are kept. @param {string} uri */
const folder = (uri) => `${app.projectDir}/marks/${uri.replace(/^.*\//, '').replace(/\.[^.]*$/, '')}`

/**
 * A PDF page's words, as pdf.js laid them over it (ui/view.js), put in the order they read, a line at a time: each shows where the
 * file drew it, whatever its place, so a line mostly in right-to-left letters reads from its right end, a run of left-to-right words
 * keeping its own order. The browser then selects them as they read, and rangeOf finds them so. @param {Element} words
 */
function order(words) {
  const lines = /** @type {HTMLElement[][]} */ ([[]]), at = (/** @type {HTMLElement} */ one) => one.getBoundingClientRect().left, strong = (/** @type {HTMLElement} */ one) => one.dir !== 'rtl' && /[\p{L}\p{N}]/u.test(one.textContent ?? ''), letters = (/** @type {HTMLElement[]} */ line, /** @type {boolean} */ rtl) => line.filter((one) => (one.dir === 'rtl') === rtl).reduce((n, one) => n + (one.textContent?.match(/\p{L}/gu)?.length ?? 0), 0)
  for (const one of /** @type {HTMLElement[]} */ ([...words.children])) lines.at(-1)?.push(one), one.nodeName === 'BR' && lines.push([])
  if (lines.some((line) => letters(line, true) > letters(line, false))) words.append(...lines.flatMap((line) => {
    if (letters(line, true) <= letters(line, false)) return line
    const read = line.filter((one) => one.nodeName !== 'BR').sort((a, b) => at(b) - at(a))
    for (let i = 0; i < read.length; i++) if (strong(read[i])) { let j = i; for (let k = i + 1; k < read.length && read[k].dir !== 'rtl'; k++) if (strong(read[k])) j = k; read.splice(i, j - i + 1, ...read.slice(i, j + 1).reverse()); i = j }
    return [...read, ...line.filter((one) => one.nodeName === 'BR')]
  }))
}

/** The words a range holds, a line where a <br> breaks one, as rangeOf reads them. @param {Range} range */
const said = (range) => { const copy = range.cloneContents(); copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n')); return copy.textContent?.trim() ?? '' }

/**
 * The marks of a file in its view, kept as the user makes them; a PDF's found on each page as its words are laid over it.
 * @param {HTMLElement} view what viewOf drew @param {{ uri: string, name: string }} file @param {(() => void)[]} holds
 */
export async function follow(view, file, holds) {
  if (!view.matches('.view-pages') && !view.querySelector('.view-text, .view-sheet')) return
  const at = folder(file.uri), own = /** @type {Shown[]} */ ([])
  const marks = (await Promise.all((await app.fs.list(at).catch(() => [])).filter(({ name }) => name.endsWith('.json'))
    .map(async ({ name }) => ({ path: `${at}/${name}`, mark: /** @type {Mark} */ (JSON.parse((await app.fs.read(`${at}/${name}`)) ?? '{}')) })))).filter(({ mark }) => mark.kind === 'mark')
  /** Finds a file's marks in what holds them, a page or the whole text. @param {Element} box @param {number} [page] */
  const find = async (box, page) => {
    for (const { path, mark } of marks.filter((one) => one.mark.page === page)) { const range = await rangeOf(box, mark.words); if (range && !own.some((one) => one.path === path)) own.push({ mark, path, range }) }
    lit()
  }
  shown.set(file.uri, own)
  // A page is taken as its words are laid over it, and those laid before this listened, now; one taken twice is ordered and found once.
  const take = (/** @type {HTMLElement} */ page) => { order(/** @type {Element} */ (page.querySelector('.view-words'))); void find(page, Number(page.dataset.page)) }, laid = (/** @type {Event} */ event) => take(/** @type {HTMLElement} */ (event.target))
  view.addEventListener('textlayer', laid)
  if (!view.matches('.view-pages')) await find(view)
  else view.querySelectorAll('.view-page:has(.view-words > *)').forEach((page) => take(/** @type {HTMLElement} */ (page)))
  const bar = Object.assign(document.createElement('div'), { className: 'marks-bar', id: free('marks-bar') })
  for (const [name, value] of [['role', 'toolbar'], ['popover', 'manual'], ['aria-label', t('files.passage')]]) bar.setAttribute(name, value)
  /** @type {{ words: string, page?: number, range: Range, box?: Element, one?: Shown, writing?: boolean } | null} */
  let now = null
  const hide = () => { now = null; pop(bar, view, false, view.closest('.view') ?? view) }
  const draw = () => {
    if (!now) return hide()
    const { one, writing } = now
    const button = (/** @type {string} */ label, /** @type {() => void} */ run) => html`<li><button type="button" @mousedown=${(/** @type {Event} */ e) => e.preventDefault()} @click=${run}>${label}</button></li>`
    render(html`<ul dir=${dir()}>${writing ? html`<li class="marks-note"><label for=${`${bar.id}-note`}>${t('files.note')}</label><textarea id=${`${bar.id}-note`} rows="3" dir="auto" .value=${one?.mark.note ?? ''}
        @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) e.preventDefault(), keep(/** @type {HTMLTextAreaElement} */ (e.target).value) }}></textarea></li>${button(t('files.save'), () => keep(/** @type {HTMLTextAreaElement} */ (bar.querySelector('textarea')).value))}`
      : html`${one?.mark.note ? html`<li class="marks-said" dir="auto">${one.mark.note}</li>` : nothing}${one ? nothing : button(t('files.highlight'), () => keep())}${button(t('files.note'), () => { if (now) now.writing = true; draw(); bar.querySelector('textarea')?.focus() })}${one ? button(t('action.remove'), () => remove(one)) : nothing}${button(t('files.askJean', { name: assistantName() }), () => ask())}`}</ul>`, bar)
    pop(bar, view, true, view.closest('.view') ?? view)
    float(bar, now.range.getBoundingClientRect(), { over: true })
  }
  /** A mark kept: the words selected, or the one pointed at with its note. @param {string} [note] */
  const keep = async (note) => {
    if (!now) return
    const at = new Date().toISOString(), one = now.one, range = one ? one.range : (await rangeOf(/** @type {Element} */ (now.box), now.words)) ?? now.range
    const mark = /** @type {Mark} */ ({ ...(one?.mark ?? { format: 1, kind: 'mark', file: file.uri, ...(now.page && { page: now.page }), words: now.words, author: 'user', createdAt: at }), changedAt: at, ...(note !== undefined && { note: note.trim() || undefined }) })
    const path = one?.path ?? `${folder(file.uri)}/${ulid()}.json`
    await app.fs.write(path, JSON.stringify(mark))
    if (one) one.mark = mark
    else own.push({ mark, path, range }), getSelection()?.removeAllRanges()
    lit(); hide()
  }
  /** @param {Shown} one */
  const remove = async (one) => { await app.fs.remove(one.path); own.splice(own.indexOf(one), 1); lit(); hide() }
  const ask = async () => {
    if (!now) return
    const { words, page } = now, note = now.one?.mark.note
    point({ text: `The user points at a passage of ${file.name} (${file.uri})${page ? `, page ${page}` : ''}: "${words.slice(0, 2000)}"${note ? `, with their note: "${note}"` : ''}.`, uri: file.uri, task: app.current.peek()?.path })
    hide()
    if (document.documentElement.dataset.dock === 'over') (await import('../../ui/preview.js')).unshow(file.uri)
    document.getElementById('prompt')?.focus()
    notify(t('files.pointed', { words: words.length > 60 ? `${words.slice(0, 60)}…` : words }))
  }
  /** What the user selected or pressed in the view: words to mark, or a mark. @param {Event} event */
  const looked = (event) => {
    // A selection made by three clicks runs on past the view's end: what of it is in the view.
    const selection = getSelection(), range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    if (range && view.contains(range.startContainer) && !view.contains(range.endContainer)) range.setEnd(view, view.childNodes.length)
    const page = /** @type {HTMLElement | null} */ ((range?.startContainer.parentElement ?? null)?.closest('.view-page'))
    const words = range ? said(range) : ''
    const at = /** @type {PointerEvent} */ (event)
    const one = own.find(({ range: marked }) => (words ? marked.intersectsNode(/** @type {Node} */ (range?.startContainer)) && said(marked) === words
      : 'clientX' in at && [...marked.getClientRects()].some((r) => at.clientX >= r.left && at.clientX <= r.right && at.clientY >= r.top && at.clientY <= r.bottom)))
    if (!one && (!range || !words || !view.contains(range.startContainer))) return hide()
    now = one ? { words: one.mark.words, page: one.mark.page, range: one.range, one } : { words, page: page ? Number(page.dataset.page) : undefined, range: /** @type {Range} */ (range), box: page ?? view }
    draw()
  }
  const keys = (/** @type {KeyboardEvent} */ event) => { if (event.key === 'F10' && event.altKey) { looked(event); event.preventDefault(); /** @type {HTMLElement | null} */ (bar.querySelector('button, textarea'))?.focus() } else if (event.key === 'Escape' && now) event.stopPropagation(), hide() }
  const along = (/** @type {KeyboardEvent} */ event) => {
    const items = /** @type {HTMLElement[]} */ ([...bar.querySelectorAll('button')]), i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    if (event.key === 'Escape') { event.preventDefault(); hide(); /** @type {HTMLElement | null} */ (view.closest('.view'))?.focus() }
    else if (i >= 0 && /^Arrow(Left|Right)$/.test(event.key)) { event.preventDefault(); items[(i + ((event.key === 'ArrowRight') === (dir() !== 'rtl') ? 1 : items.length - 1)) % items.length].focus() }
  }
  const away = (/** @type {Event} */ event) => { if (!bar.contains(/** @type {Node} */ (event.target)) && !view.contains(/** @type {Node} */ (event.target))) hide() }
  view.addEventListener('pointerup', looked)
  view.addEventListener('keydown', keys)
  view.addEventListener('keyup', (event) => { if (/^(Shift|Arrow)/.test(event.key)) looked(event) })
  bar.addEventListener('keydown', along), document.addEventListener('pointerdown', away)
  holds.push(() => { shown.delete(file.uri); lit(); bar.remove(); document.removeEventListener('pointerdown', away); view.removeEventListener('textlayer', laid) })
}
