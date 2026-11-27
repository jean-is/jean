// SPDX-License-Identifier: MIT
// A collection's view, beside the conversation (D491) as in a document that holds it: the one on show (./tables.js) as a table, each cell changed in place
// as its column's kind asks, or as a board, a gallery, a calendar, a timeline or, where it is narrow, a list (D757), each drawn by a folder of its own. Jean's changes
// the user hasn't accepted are marked, under the bar (ui/review.js, D505). Its heads stay on top as its rows scroll, each its kind's glyph and
// its name, opening the column's menu: renamed, made another kind or a relation to a collection, the rows sorted by it, Jean asked to fill it, a column
// added beside it, hidden or taken away; the last head adds one. A row is moved by the handle at its start, dragged or with the arrows; a click or a right
// click on it opens its menu: opened as a sheet, a row put under it, duplicated, asked about or deleted. A cell is selected or changed, ⌘Z undoing the
// user's last step and ⇧⌘Z doing it again; a Formula's opens a dialog to write its column's formula in; cells copied from a spreadsheet are pasted on one (D759). Its bar: a pill of how it
// shows and the view on show, Find, Arrange, which groups, colours (D760), filters, shows columns and sorts, and New row; the table's
// foot works out a sum or a share for each column. What is arranged is kept as a view under a name; where others work on the collection too, it is this
// person's alone until they keep it (D753). lit-html, in Jean's own document, redrawn as the collection changes here or by the brain.
import { html, svg, nothing, render } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { keyed } from 'lit-html/directives/keyed.js'
import { repeat } from 'lit-html/directives/repeat.js'
import { ref } from 'lit-html/directives/ref.js'
import { signal, effect } from '@preact/signals-core'
import { t, locale, intlLocales } from '../../core/i18n.js'
import { app, notify, assistantName } from '../../ui/state.js'
import { slots } from '../../ui/caps.js'
import '../../ui/shown.js'
import { reviewBar } from '../../ui/review.js'
import { icons, icon } from '../../ui/menu-icons.js'
import { shown, change, unkept, accept, reject, reread, reshapeTable, retype, collections, undoStep, load, wayOf, localCurrency, groupName, attach, yoursOf, alone, meIn } from './tables.js'
import { query, valueOf, total, filterOf } from './query.js'
import { titleOf, checkCell, notesOf, canonical, hueOf, hueFor, filesOf, calendarOf, keptViews, viewOf, HUES } from './table.js'
import { textOf, said as told, format, amount, digitsOf, calcOf } from './export.js'
import { searchable } from '../../ui/mentions.js'

/** @import { Property, View, Rule } from './table.js' */
/** @import { Row } from './changes.js' */
/** @import { Loaded } from './tables.js' */
/** @import { Signal } from '@preact/signals-core' */
/**
 * What a view keeps while it is drawn: its box, whether it is beside the task, how it shows ('' as a table, or 'board'), the column whose name is being changed, the one whose
 * menu lists the kinds, whether it lists the collections a relation can be to then, the project's collections, read again by `list()`,
 * what its menus' ids start with, the words Search keeps the rows with, the Formula whose dialog is open, saying when its formula can't be read,
 * what was typed in cells their columns refuse, by "row column", the row open as a sheet, by its id (`openRow` opens one), the column whose menu lists its
 * choices' colours, the collection as it is now, its calendar's month on show, whether the view picked is being named, what arranges
 * the view on show (`arrange`), its rows as it sorts them, a row moved by hand then theirs to order (`order`), whether it is narrow (D757), and whether the table was picked there.
 * @typedef {{ box: HTMLElement, beside: boolean, as: Signal<string>, naming: Signal<string>, kinds: Signal<string>, relating: Signal<boolean>, collections: Signal<{ folder: string, name: string }[]>, list: () => void, id: string, reviewed?: boolean, search: Signal<string>, formula: Signal<string>, wrong: Signal<boolean>, refused: Signal<Map<string, string>>, from?: Element | null, digits?: Map<string, number>, folded: Signal<Set<string>>, open: Signal<string>, choosing: Signal<string>, month: Signal<string>, titling: Signal<boolean>, narrow: Signal<boolean>, grid: Signal<boolean>, arrange?: (edit: (view: View) => Partial<View>) => unknown, order?: () => Row[], openRow: (id: string) => void, now: () => Loaded | null, by?: Property, calculate?: NonNullable<View['calculate']>, frozen?: number, edge?: () => void, follow?: (row: string, value: unknown) => void }} State
 */

/** The kinds of column the user adds or makes one, in the order they are offered, then those Jean works out. */
const KINDS = ['text', 'number', 'date', 'select', 'multi-select', 'status', 'checkbox', 'link', 'email', 'phone', 'person', 'place', 'picture', 'files', 'formula']
const WORKED = ['created-by', 'created-at', 'changed-by', 'changed-at']
/** A status's steps to start with, to do, under way and done, in the user's words, unless it has two choices or more to take as its steps. @param {Property} [property] */
const steps = (property) => ((property?.options?.length ?? 0) > 1 ? undefined : ['todo', 'doing', 'done'].map((group) => t(`tables.step.${group}`)))
/** Each kind's glyph, before its column's name; one Jean works out shows who or when. */
const [who, when] = [icons.person, icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`)]
const GLYPHS = /** @type {Record<string, unknown>} */ ({
  text: icon(svg`<path d="M5.5 7V5h13v2M12 5v14M9.5 19h5"/>`),
  number: icon(svg`<path d="M10 4.5 8 19.5M16 4.5l-2 15M5 9h14.5M4.5 15H19"/>`),
  date: icon(svg`<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`),
  select: icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="m8.5 10.5 3.5 3.5 3.5-3.5"/>`),
  'multi-select': icon(svg`<path d="M9.5 7h10M9.5 12h10M9.5 17h10"/><g fill="currentColor" stroke="none"><circle cx="5.5" cy="7" r="1.3"/><circle cx="5.5" cy="12" r="1.3"/><circle cx="5.5" cy="17" r="1.3"/></g>`, 'flip-rtl'),
  status: icon(svg`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor"/>`),
  checkbox: icon(svg`<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`),
  link: icon(svg`<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>`),
  email: icon(svg`<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.25a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"/>`),
  phone: icon(svg`<path d="M9 4.5H6.5a2 2 0 0 0-2 2.1c.5 7.3 5.6 12.4 12.9 12.9a2 2 0 0 0 2.1-2V15L16 13.5l-2 2a11 11 0 0 1-5-5l2-2Z"/>`, 'flip-rtl'),
  person: who,
  place: icon(svg`<path d="M12 20.5s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0c0 4.9 6.5 10.5 6.5 10.5Z"/><circle cx="12" cy="10" r="2.5"/>`),
  files: icons.attach, picture: icons.image,
  relation: icon(svg`<rect x="3.5" y="4" width="8" height="6" rx="2"/><rect x="12.5" y="14" width="8" height="6" rx="2"/><path d="M7.5 10v4.5a2.5 2.5 0 0 0 2.5 2.5h2.5"/>`, 'flip-rtl'),
  'created-by': who, 'changed-by': who, 'created-at': when, 'changed-at': when, formula: icon(svg`<path d="M13.5 4.5h-1a2.5 2.5 0 0 0-2.5 2.5v12.5M7 10h6M15 12.5l5 6M20 12.5l-5 6"/>`),
})
/** A filter's funnel and Arrange's sliders; a head's Hide, an eye struck through. */
const [funnel, sliders] = [icon(svg`<path d="M4.5 5.5h15l-6 7.5v5l-3 1.5V13Z"/>`),
  icon(svg`<path d="M4.5 7h7M15.5 7h4M4.5 17h4M12.5 17h7"/><circle cx="13.5" cy="7" r="2"/><circle cx="10.5" cy="17" r="2"/>`, 'flip-rtl')], shut = icon(svg`<path d="M3.5 12S6.5 6.5 12 6.5 20.5 12 20.5 12 17.5 17.5 12 17.5 3.5 12 3.5 12Z"/><circle cx="12" cy="12" r="2.5"/><path d="m5 5 14 14"/>`)
/** The kinds a rule compares as dates: before, after. */
const DATED = /^(date|created-at|changed-at)$/
/** A row's cells: its name's, the row's head, and the others. */
const CELL = ':is(td, th)[tabindex]'
/** Sorting from A to Z, the bars growing; from Z to A. */
const ascending = icon(svg`<path d="M7 19.5v-15M3.5 8 7 4.5 10.5 8M13.5 6.5h3M13.5 12h5M13.5 17.5h7"/>`, 'flip-rtl')
const descending = icon(svg`<path d="M7 4.5v15M3.5 16 7 19.5l3.5-3.5M13.5 6.5h7M13.5 12h5M13.5 17.5h3"/>`, 'flip-rtl')
/** A column moved to its line's start or end, a row up or down: an arrow to a bar. */
const [toStart, toEnd] = [icon(svg`<path d="M5 5v14M19 12H9m4-4-4 4 4 4"/>`, 'flip-rtl'), icon(svg`<path d="M19 5v14M5 12h10m-4-4 4 4-4 4"/>`, 'flip-rtl')]
const [up, down] = [icon(svg`<path d="M5 5h14M12 19V9m-4 4 4-4 4 4"/>`), icon(svg`<path d="M5 19h14M12 5v10m-4-4 4 4 4-4"/>`)]
/** A menu's rows, a list for each group of them, a line between. @param {...unknown[]} groups */
const listed = (...groups) => groups.map((rows, i) => html`${i ? html`<hr>` : nothing}<ul>${rows.map((row) => html`<li>${row}</li>`)}</ul>`)
/** A row of a menu, by its id, that acts and closes it, greyed where it can't. @param {string} menu @param {unknown} glyph @param {unknown} label @param {() => unknown} act @param {boolean} [off] @param {string} [kind] */
const option = (menu, glyph, label, act, off = false, kind = '') => html`<button type="button" class=${kind || nothing} popovertarget=${menu} popovertargetaction="hide" ?disabled=${off} @click=${() => { act(); document.getElementById(menu)?.hidePopover?.() }}>${glyph}${label}</button>`
/** The views drawn so far, whose menus' ids each start with its own number. */
let drawn = 0
/** What a column refuses, said beside its cell, brought into view once drawn. @param {Element | undefined} said */
const seen = (said) => said && requestAnimationFrame(() => said.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
/** What each field being changed held when it took the keyboard, for Escape to leave it so. @type {WeakMap<HTMLInputElement, string>} */
const before = new WeakMap()

/**
 * The view's box, drawn from `source` while it holds a table: a pane's on show, or one a document holds.
 * @param {(() => void)[]} holds @param {Signal<Loaded | null>} [source] @param {boolean} [beside] in a pane beside the task
 */
export function view(holds, source = shown, beside = false) {
  const box = Object.assign(document.createElement('div'), { className: 'table-view' })
  const way = beside ? wayOf(source.peek()?.folder ?? '') : { as: signal(''), find: signal('') }
  /** @type {State} */
  const state = { box, beside, as: way.as, naming: signal(''), kinds: signal(''), relating: signal(false), collections: signal(/** @type {{ folder: string, name: string }[]} */ ([])), list: () => {}, id: `table-${++drawn}`, search: way.find, formula: signal(''), wrong: signal(false), refused: signal(new Map()), folded: signal(new Set()), open: signal(''), choosing: signal(''), month: signal(''), titling: signal(false), narrow: signal(innerWidth < 480), grid: signal(false), now: () => source.peek(),
    // A row open as a sheet, drawn by caps/row, its first field taking the keyboard.
    openRow: (id) => { state.open.value = id; Promise.all([LAYOUTS.row(), import('../../ui/dialogs.js')]).then(() => requestAnimationFrame(() => { const sheet = /** @type {HTMLDialogElement | null} */ (box.querySelector('dialog.table-row')); if (sheet && !sheet.open) sheet.showModal(), /** @type {HTMLElement | null} */ (sheet.querySelector('dd :is(input, select)'))?.focus() })) } }
  // Beside the task, how it shows is in the address.
  if (beside) holds.push(() => { way.as.value = way.find.value = '' })
  state.list = () => { const dir = source.peek()?.dir; if (dir) collections(dir).then((all) => { state.collections.value = all }) }
  state.list()
  let reached = -1
  /** The bar's arrows: the keyboard to the field of the cell Jean changed after or before the last one gone to. @param {1 | -1} step */
  const go = (step) => {
    // Folded groups unfold: the review's arrows reach every change.
    if (state.folded.peek().size) state.folded.value = new Set()
    const fields = /** @type {HTMLElement[]} */ ([...box.querySelectorAll('.is-jean :is(input, select)')])
    reached = reached < 0 ? (step > 0 ? 0 : fields.length - 1) : (reached + step + fields.length) % fields.length
    fields[reached]?.focus()
  }
  holds.push(effect(() => {
    // Where the bar moved, the keys back in their field.
    const had = box.contains(document.activeElement) && document.activeElement?.id
    render(draw(source.value, state, go), box)
    if (had && !box.contains(document.activeElement)) document.getElementById(had)?.focus()
    // What a changed cell's tip says, on its field, where the keyboard and a screen reader are, and a sum of money's currency.
    for (const field of /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('tbody :is([aria-description], [data-money], .is-jean > :is(input, select))'))) {
      const words = [field.closest('.is-jean') && t('tables.changed', { count: 1, name: assistantName() }), field.dataset.money].filter(Boolean).join(' · ')
      if (!words) field.removeAttribute('aria-description'); else if (field.getAttribute('aria-description') !== words) field.setAttribute('aria-description', words)
    }
    requestAnimationFrame(edge)
  }))
  /**
   * More lies past the table's end edge: a fade says so there, told on scroll, on resize and after each draw, never over Accept and Reject.
   */
  function edge() {
    const scroll = /** @type {HTMLElement | null} */ (box.querySelector('.table-scroll')), fade = /** @type {HTMLElement | null} */ (box.querySelector('.table-fade'))
    if (!scroll || !fade) return
    const decide = scroll.querySelector('tbody .table-decide')?.getBoundingClientRect().width ?? 0
    // Written only when they change, on the fade alone: each write would restyle the whole table.
    for (const [name, px] of Object.entries({ '--top': scroll.offsetTop, '--height': scroll.clientHeight, '--end': decide + scroll.offsetWidth - scroll.clientWidth })) if (fade.style.getPropertyValue(name) !== `${px}px`) fade.style.setProperty(name, `${px}px`)
    fade.classList.toggle('is-more', Math.abs(scroll.scrollLeft) + scroll.clientWidth < scroll.scrollWidth - 4)
    // Where each column kept in view sticks, after the grip and those before it, and the divider after them, while they leave 10rem to scroll.
    const table = /** @type {HTMLTableElement | null} */ (scroll.querySelector('.table-grid')), cells = [...table?.tHead?.rows[0].cells ?? []].slice(0, Number(table?.dataset.frozen ?? 0) + 1)
    /** @type {[string, number][]} */
    const sticks = []
    let at = 0
    for (const [k, cell] of cells.entries()) sticks.push([`--frozen-${k + 1}`, at]), at += cell.getBoundingClientRect().width
    for (const [name, px] of [...sticks, ['--frozen-end', at], ['--tall', table?.offsetHeight ?? 0]]) if (table && table.style.getPropertyValue(String(name)) !== `${px}px`) table.style.setProperty(String(name), `${px}px`)
    table?.classList.toggle('is-frozen', at <= scroll.clientWidth - 10 * parseFloat(getComputedStyle(scroll).fontSize))
  }
  state.edge = edge
  // The table's own scrolls alone: a field's, as a word is typed in Find, would lay the whole table out for nothing.
  box.addEventListener('scroll', (event) => { if (/** @type {Element} */ (event.target).classList?.contains('table-scroll')) edge() }, { capture: true, passive: true })
  // Narrow under 30rem, as its style sheet says it, once it has a width.
  const sized = new ResizeObserver(() => { if (box.clientWidth) state.narrow.value = box.clientWidth < 30 * parseFloat(getComputedStyle(document.documentElement).fontSize); edge() })
  sized.observe(box)
  holds.push(() => sized.disconnect())
  // Escape closes a menu open in it alone, wherever the keyboard is, never the pane; ⌘Z undoes the user's last step and ⇧⌘Z does it again,
  // but in a field being written in, whose own words they undo.
  box.addEventListener('keydown', (event) => {
    const one = source.peek(), undo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !/** @type {Element} */ (event.target).matches('input:not([type="checkbox"]), textarea')
    if ((event.key === 'Escape' && box.querySelector(':popover-open')) || (undo && one)) event.stopPropagation()
    if (undo && one) { event.preventDefault(); undoStep(one, event.shiftKey) }
  })
  // A menu the window doesn't hold whole by its head, as under a head the table's box cuts or in a short window, goes under or over the head,
  // where there is more room, no taller than that, its start moved in as far as it needs: Chromium keeps it where it overflows, whatever its fallbacks.
  box.addEventListener('toggle', (event) => {
    const menu = /** @type {HTMLElement} */ (event.target), head = (state.from?.getAttribute('popovertarget') === menu.id ? state.from : box.querySelector(`[popovertarget="${menu.id}"]`))?.getBoundingClientRect()
    if (/** @type {ToggleEvent} */ (event).newState !== 'open' || !menu.matches('.table-menu') || !head) return
    delete menu.dataset.placed
    const { left, right, top, bottom, width, height } = menu.getBoundingClientRect(), rtl = getComputedStyle(menu).direction === 'rtl', x = Math.max(8, Math.min(rtl ? head.right - width : head.left, innerWidth - width - 8))
    const room = Math.max(head.top, innerHeight - head.bottom) - 12, above = head.top > innerHeight - head.bottom
    for (const [name, px] of Object.entries({ '--at': rtl ? innerWidth - x - width : x, '--top': above ? head.top - 4 - Math.min(height, room) : head.bottom + 4, '--room': room })) menu.style.setProperty(name, `${px}px`)
    menu.toggleAttribute('data-placed', left < 0 || right > innerWidth || top < 0 || bottom > innerHeight)
  }, true)
  // What opened a menu last, where several open the same: the rows' handles.
  box.addEventListener('click', (event) => { state.from = /** @type {Element} */ (event.target).closest('[popovertarget]') }, true)
  return box
}

/**
 * A change the user makes, whether it was; one a column refuses is said, and its field shows the cell as it is again.
 * @param {Loaded} one @param {{ row?: string, set?: Record<string, unknown>, delete?: boolean }} edit @param {Event} [event]
 */
const edit = (one, edit, event) => change(one, [edit], 'user').then(Boolean, async () => {
  notify(t('tables.wrong'), { alert: true })
  await reread(one)
  event?.target instanceof HTMLElement && event.target.blur()
  return false
})

/** A request to Jean written in the box, never sent, the caret at its end (D757); the pane makes way where it covers the box. @param {Loaded} one @param {string} words */
const ask = (one, words) => { app.draft.value = words; if (document.documentElement.dataset.dock === 'over') import('../../ui/preview.js').then(({ unshow }) => unshow(one.folder)); requestAnimationFrame(() => { const box = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt')); box?.focus(); box?.setSelectionRange(words.length, words.length) }) }
/** A row deleted, said with an Undo; whether it was. @param {Loaded} one @param {Row} row */
const rid = async (one, row) => (await edit(one, { row: row.id, delete: true })) && (notify(t('tables.rowDeleted', { name: textOf(row, /** @type {Property} */ (titleOf(one.table))) || t('tables.unnamed') }), { label: t('memory.undo'), run: () => load(one.folder, one.dir).then((now) => now && change(now, [{ row: row.id, delete: false }], 'user')) }), true)

/** A menu closes as the keyboard leaves it, so what has focus is never under it. @param {FocusEvent} event */
const leaving = ({ currentTarget, relatedTarget }) => { const box = /** @type {HTMLElement} */ (currentTarget); if (relatedTarget && !box.contains(/** @type {Node} */ (relatedTarget)) && box.matches(':popover-open')) box.hidePopover() }

/** @param {Loaded} one @param {Parameters<typeof reshapeTable>[1]} edit */
const shape = (one, edit) => reshapeTable(one, edit).catch(() => reread(one))
/** @param {Event} event */
const typed = (event) => /** @type {HTMLInputElement} */ (event.target).value
/** The view on show sorted by a column, from A to Z or from Z to A, empty cells last; pressed again, sorted no more. @param {State} state @param {Property} property @param {string} direction */
const sort = (state, property, direction) => state.arrange?.(({ sort: [was] = [] }) => ({ sort: was?.property === property.id && (was.direction ?? 'ascending') === direction ? undefined : [{ property: property.id, direction: /** @type {'ascending'} */ (direction) }] }))
/** The ways to show a collection, each by its glyph. */
const LAID = /** @type {Record<string, unknown>} */ ({ table: icons.table, list: icons.list, board: icons.board, gallery: icons.image, calendar: GLYPHS.date, timeline: icon(svg`<path d="M4.5 6.5h8M9 12h10.5M6.5 17.5h8"/>`, 'flip-rtl') })
/** How a rule compares, as its column's kind allows. @param {Property} property @returns {Rule['op'][]} */
const opsOf = ({ type }) => (type === 'checkbox' ? ['is'] : [...(type === 'number' || DATED.test(type) || type === 'select' || type === 'status' ? [] : /** @type {const} */ (['contains', 'does-not-contain'])),
  'is', 'is-not', ...(type === 'number' || DATED.test(type) ? /** @type {const} */ (['greater-than', 'less-than']) : []), 'is-empty', 'is-not-empty'])
/** A new rule on a column, its first way to compare, a box ticked. @param {Property} property @returns {Rule} */
const ruleOn = (property) => ({ property: property.id, op: opsOf(property)[0], ...(property.type === 'checkbox' && { value: true }) })

/** The kinds rows are grouped by, in Arrange and on the board: a choice, a status, a person, a box, or a date by its month, which no lane takes. */
const GROUPED = /^(select|status|person|checkbox|date)$/
/** The kinds whose cells may read over their fields (D752), a choice as its pill, or hold something at their end, files their menu, an address what opens it. */
const READS = /^(text|link|email|phone|number|date|status|select|multi-select|person|picture|files)$/
/** The kinds whose foot sums, averages and finds the smallest and the largest. */
const NUMERIC = /^(number|formula)$/
/** A total as its column writes it, a count and a share as such; nothing when there is no number to work out. @param {Row[]} rows @param {Property} property @param {import('./query.js').Total} how @param {number} [digits] */
const totalOf = (rows, property, how, digits) => ((value) => (value === null ? '' : how === 'count' ? format('NumberFormat', intlLocales()).format(value)
  : how === 'percent' ? format('NumberFormat', intlLocales(), { style: 'percent' }).format(value) : amount(value, property, intlLocales(), how === 'average' ? undefined : digits)))(total(rows, property, how))

/**
 * The view: its bar, with what shows over the rows (caps/over); a chip under it for each thing arranged, opening Arrange on it, its × taking it
 * away; then the rows. Beside the task, the name is the pane's head's, a table's bar scrolls with its rows, and how it shows and Find's words are in the address; in a document, the name heads the bar; a whiteboard shown as a table has Find and Arrange alone.
 * @param {Loaded | null} one @param {State} state @param {(step: 1 | -1) => void} go
 */
function draw(one, state, go) {
  if (!one) return nothing
  // A whiteboard shown as a table: its notes (D747).
  const whiteboard = Boolean(one.table.kind)
  if (whiteboard) one = { ...one, rows: notesOf(one.rows) }
  const { as, search, id } = state
  const columns = one.table.properties.filter((property) => !property.deleted)
  // The view on show: one the person kept, picked by its name, else the collection's own, with what they arranged of it since and haven't kept (./tables.js `yoursOf()`).
  // What it groups, filters, hides, sorts and works out: a rule or a sort on a column gone is dropped, a rule with nothing to compare with keeps every row.
  const views = whiteboard ? [] : keptViews(one.table), yours = whiteboard ? {} : yoursOf(one).value, settings = viewOf(one.table, as.value, yours)
  const at = settings.id, picked = at !== 'table', mine = yours[at], hidden = settings.hidden ?? [], calculate = settings.calculate ?? {}
  // The views Jean proposed (D755), this person's alone until kept: those of theirs with a name, under an id no view kept has; and whether one is on show.
  const proposed = Object.keys(yours).filter((key) => yours[key].name && !views.some((view) => view.id === key)), own = views.some((view) => view.id === at), offered = picked && !own
  const rules = (settings.filter?.and ?? []).filter((rule) => columns.some((property) => property.id === rule.property))
  const [sorted] = (settings.sort ?? []).flatMap((sort) => ((property) => (property ? [{ property, direction: sort.direction ?? 'ascending' }] : []))(columns.find((property) => property.id === sort.property)))
  // Grouped by what Arrange names; the board's lanes too, unless it is a date, else by the board's own, a status or a choice.
  const by = columns.find((property) => property.id === settings.group && GROUPED.test(property.type)), groups = columns.filter((property) => GROUPED.test(property.type))
  const lanes = (by?.type !== 'date' && by) || columns.find((property) => property.id === one.table.views.find((view) => view.id === 'board')?.group)
  // The gallery's pictures: its first column of them; the calendar's and the timeline's dates: the column picked, else its first.
  const covers = columns.find((property) => property.type === 'picture'), dated = calendarOf(one.table)
  // The choice whose colours the cards, a calendar's rows and a timeline's bars take, as Arrange names it.
  const tints = columns.filter(({ type }) => type === 'status' || type === 'select'), tint = tints.find((property) => property.id === settings.colour)
  state.by = by
  state.calculate = calculate, state.frozen = settings.frozen ?? 0
  const kept = filterOf(one.table, settings), words = searchable(search.value.trim()), texts = words && indexOf(one, columns)
  const asked = { sort: sorted ? [{ property: sorted.property.id, direction: sorted.direction }] : [], locale: locale.value, names: one.names, me: meIn(one) }
  const rows = query(one.table, one.rows, { ...(kept.length && { filter: { and: kept } }), ...asked }).rows.filter((row) => !texts || texts.get(row.id)?.includes(words))
  // Each change made from the view as it is by then, so that one made before the last is drawn isn't lost: for everyone, or, where others work on the
  // collection too (Together's `others`) or something of the view is already this person's alone, for this person until they keep it.
  const view = (/** @type {(view: View) => Partial<View>} */ edit) => ((all) => (!whiteboard && (all[at] || slots('others').some((part) => part.holds(one.folder)))
    ? alone(one, at, { ...all[at], ...edit(viewOf(one.table, at, all)) }) : shape(one, { view: edit, of: at })))(yoursOf(one).peek())
  state.arrange = view
  // Sorted, a row moved by hand takes the rows' order as they show, which they are sorted by no more.
  state.order = sorted ? () => (view(() => ({ sort: undefined })), query(one.table, one.rows, asked).rows) : undefined
  /** The filter's rules: each a column, how it compares and with what. @param {(rules: Rule[]) => Rule[]} change */
  const filter = (change) => view((now) => ({ filter: { and: change((now.filter?.and ?? []).filter((rule) => columns.some((property) => property.id === rule.property))) } }))
  const ruled = html`${rules.length ? listed(rules.map((rule, i) => {
    const property = /** @type {Property} */ (columns.find((one) => one.id === rule.property)), set = (/** @type {Partial<Rule>} */ edit) => filter((all) => all.map((one, j) => (i === j ? { ...one, ...edit } : one)))
    return html`<div class="table-rule" role="group" aria-label=${t('tables.filter')}><select id=${`${id}-rule-${i}`} title=${t('tables.column')} .value=${live(rule.property)} @change=${(/** @type {Event} */ e) => set(ruleOn(/** @type {Property} */ (columns.find((one) => one.id === typed(e)))))}>${columns.map((one) => html`<option value=${one.id} ?selected=${one === property}>${one.name}</option>`)}</select>
      ${keyed(property.id, html`<select title=${t('tables.compare')} .value=${live(rule.op)} @change=${(/** @type {Event} */ e) => set({ op: /** @type {Rule['op']} */ (typed(e)) })}>${opsOf(property).map((op) => html`<option value=${op} ?selected=${op === rule.op}>${t(`tables.op.${DATED.test(property.type) && op.endsWith('-than') ? (op === 'less-than' ? 'before' : 'after') : op}`)}</option>`)}</select>
      ${rule.op.endsWith('empty') ? nothing : against(property, rule.value, (value) => set({ value }), `${id}-me`)}`)}
      <button type="button" class="icon-button" aria-label=${t('action.remove')} @click=${() => filter((all) => all.filter((_, j) => j !== i))}>${icons.trash}</button></div>`
  })) : nothing}<button type="button" @click=${() => filter((all) => [...all, ruleOn(columns[0])])}>${icons.plus}${t('tables.addFilter')}</button>`
  const sorting = listed(columns.map((property) => html`<div class="table-line" role="group" aria-label=${property.name}>${GLYPHS[property.type]}<span dir="auto">${property.name}</span>
    ${[['ascending', ascending], ['descending', descending]].map(([direction, glyph]) => html`<button type="button" id=${direction === 'ascending' ? `${id}-sort-${property.id}` : nothing} class="icon-button" aria-label=${t(`tables.${direction}`)}
      aria-pressed=${String(sorted?.property === property && sorted.direction === direction)} @click=${() => sort(state, property, /** @type {string} */ (direction))}>${glyph}</button>`)}</div>`))
  const off = columns.filter((property) => hidden.includes(property.id))
  /** Arrange pressed, never a chip, which would place its panel (WebKit freezes on an opener gone as it closes), then the keyboard on `field`. @param {string} field its id */
  const arrange = (field) => {
    const panel = /** @type {HTMLElement} */ (state.box.querySelector(`#${id}-arrange`))
    if (!panel.matches(':popover-open')) /** @type {HTMLElement} */ (state.box.querySelector(`[popovertarget="${id}-arrange"]`)).click()
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (panel.querySelector(`#${CSS.escape(field)}`))?.focus())
  }
  /** What is arranged, as a chip: a press opens Arrange on it, its × takes it away. @param {unknown} glyph @param {unknown} words @param {string} field @param {string} label @param {() => unknown} away */
  const chip = (glyph, words, field, label, away) => html`<li class="table-chip"><button type="button" @click=${() => arrange(field)}>${glyph}${words}</button><button type="button" class="icon-button" aria-label=${label} @click=${away}>${icons.close}</button></li>`
  const chips = [...(by ? [chip(GLYPHS[by.type], html`<span dir="auto">${by.name}</span>`, `${id}-group`, t('tables.unchip', { name: by.name }), () => view(() => ({ group: undefined })))] : []),
    ...kept.map((rule) => ((property, i) => chip(funnel, html`<span dir="auto">${property.name}</span>${rule.op === 'is' ? html`<span class="muted" dir="auto">${/** @type {{ me?: boolean } | null} */ (rule.value)?.me ? t('tables.me') : told(/** @type {Row} */ ({ cells: { [property.id]: rule.value } }), property, { locales: intlLocales(), labels: { yes: t('tables.yes'), no: t('tables.no') } })}</span>` : nothing}`,
      `${id}-rule-${i}`, t('tables.unchip', { name: property.name }), () => filter((all) => all.filter((_, j) => j !== i))))(/** @type {Property} */ (columns.find((one) => one.id === rule.property)), rules.indexOf(rule))),
    ...(tint ? [chip(icons.palette, html`<span dir="auto">${tint.name}</span>`, `${id}-colour`, t('tables.unchip', { name: tint.name }), () => view(() => ({ colour: undefined })))] : []),
    ...(off.length ? [chip(shut, t('tables.hidden', { count: off.length }), `${id}-shown-${off[0].id}`, t('tables.showAll'), () => view(() => ({ hidden: [] })))] : []),
    ...(sorted ? [chip(sorted.direction === 'descending' ? descending : ascending, html`<span dir="auto">${sorted.property.name}</span>`, `${id}-sort-${sorted.property.id}`, t('tables.unchip', { name: sorted.property.name }), () => view(() => ({ sort: undefined })))] : [])]
  const marked = unkept(one), born = !whiteboard && !one.table.kept && marked.length ? new Map(one.rows.map((row) => [row.id, row.created])) : null
  // A collection Jean made and filled, nothing of it accepted yet, is one decision: how many rows, no cell marked; a cell the person changes
  // meanwhile is theirs and changes nothing of it; from Jean's next change, its changes are marked as ever (D752).
  const made = Boolean(born) && one.rows.every((row) => row.created.by === 'jean') && marked.every((line) => born?.get(line.row)?.at === line.at)
  // The cells and rows Jean changed, as "row column" and by row.
  const fresh = new Set(made ? [] : marked.flatMap((line) => [line.row, ...Object.keys(line.set ?? {}).map((id) => `${line.row} ${id}`)]))
  const cells = marked.reduce((count, line) => count + Math.max(1, Object.keys(line.set ?? {}).length), 0)
  // The names its Person columns offer, and the row open as a sheet, while it is there.
  const people = columns.some(({ type }) => type === 'person') ? namesIn(one, columns) : [], opened = state.open.value && one.rows.find((row) => row.id === state.open.value)
  const count = made ? t('tables.made', { count: one.rows.length }) : t('tables.changed', { count: cells, name: assistantName() })
  // Shown as any layout, a whiteboard's notes as a table alone; one that lacks its column (lanes, pictures, dates) says which in the rows' place and
  // adds it. Narrow, a list of the rows' cards shows in the table's place until the table is picked, and in the board's (D757).
  const narrow = state.narrow.value && !whiteboard, asks = picked ? settings.type : as.value, wanted = !whiteboard && asks !== 'table' && asks in LAID ? asks : ''
  const lacks = /** @type {Record<string, string | false>} */ ({ board: !lanes && 'status', gallery: !covers && 'picture', calendar: !dated && 'date', timeline: !dated && 'date' })[wanted]
  const shows = wanted || (narrow && !state.grid.value ? 'list' : 'table'), way = narrow && wanted === 'board' ? 'list' : shows === 'table' ? '' : shows, ways = whiteboard ? [] : Object.keys(LAID)
  // What Search or Filter keep when it is nothing, in a status there before its words; one with no rows says so too.
  const none = lacks ? t('tables.needs', { kind: t(`tables.kind.${lacks}`) }) : !one.rows.length ? t('tables.empty') : rows.length ? '' : words ? t('tables.noMatch', { words: search.value.trim() }) : kept.length ? t('tables.noneKept') : ''
  /** Shown another way: the view picked's own, else in the address; a list is the table, narrow. @param {string} name */
  const show = (name) => { const type = /** @type {View['type']} */ (name === 'list' && narrow ? 'table' : name); state.grid.value = name === 'table'; if (picked) view(() => ({ type })); else as.value = type === 'table' ? '' : type }
  const title = /** @type {Property} */ (titleOf(one.table)), counted = (/** @type {number} */ count) => format('NumberFormat', intlLocales()).format(count), jean = assistantName()
  /** The view picked named, its name's field taking the keyboard: once its menu has closed, since the field takes its button's place (WebKit freezes on an opener gone as its menu closes). */
  const retitle = () => requestAnimationFrame(() => { state.titling.value = true; requestAnimationFrame(() => { const field = /** @type {HTMLInputElement | null} */ (state.box.querySelector('.table-titled')); field?.focus(); field?.select() }) })
  /**
   * What shows kept. A view kept, arranged by this person alone: as they arranged it, for everyone. Else a view of its own, picked: one Jean proposed, under
   * the name it has, with nothing of the collection's own arrangement; else under a name from what it keeps, its group or how it shows, then theirs to
   * write. @param {boolean} [fresh] a view of its own, whatever shows
   */
  const keep = async (fresh) => {
    if (own && mine && !fresh) return shape(one, { view: () => mine, of: at }).then(() => alone(one, at))
    const name = /** @type {string} */ ((offered && settings.name) || (kept.find((rule) => rule.op === 'is' && typeof rule.value === 'string')?.value ?? by?.name ?? t(`tables.${wanted || 'table'}`)))
    const table = await shape(one, { keep: { ...(offered && { group: undefined, colour: undefined, filter: undefined, hidden: undefined, sort: undefined }), ...mine, name, from: own ? at : 'table', type: /** @type {View['type']} */ (wanted || 'table') } })
    const made = table && keptViews(table).find((view) => !views.some((had) => had.id === view.id))
    if (!made) return
    if (mine) await alone(one, at)
    as.value = made.id
    if (!offered) retitle()
  }
  /** The name's field left with Enter, or with Escape as it was; the keys go back to the views' button. @param {KeyboardEvent} event */
  const titled = (event) => {
    const field = /** @type {HTMLInputElement} */ (event.currentTarget)
    if (event.isComposing || !/^(Enter|Escape)$/.test(event.key)) return
    event.stopPropagation()
    if (event.key === 'Escape') field.value = settings.name ?? ''
    field.blur()
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (state.box.querySelector('.table-kept'))?.focus())
  }
  // Tables' words for what is drawn outside this folder, and what each is given.
  const said = { add: t('tables.addRow'), unnamed: t('tables.unnamed'), wrong: t('tables.wrong'), subtotal: t('tables.subtotal'), changed: (/** @type {number} */ count) => t('tables.changed', { count, name: jean }), none: dated ? t('tables.none', { column: dated.date.name }) : '', date: t('tables.kind.date'), end: t('tables.end'),
    open: t('tables.open'), duplicate: t('tables.duplicate'), last: t('tables.lastChanges'), me: t('tables.me'), ask: t('tables.ask', { name: jean }), of: (/** @type {number} */ shown, /** @type {number} */ count) => t('tables.of', { shown: counted(shown), count: counted(count) }),
    about: (/** @type {Row} */ row) => t('tables.asked.row', { table: one.table.name, row: textOf(row, title) || t('tables.unnamed') }) }
  const given = { id, one, columns, rows, hidden, fresh, state, parts, covers, tint, words: said, by: wanted === 'board' ? lanes : way === 'gallery' || way === 'calendar' ? undefined : by }
  const inside = state.beside && !lacks && !way, top = html`<div class="table-bar">${state.beside || whiteboard ? nothing : html`<input class="table-name" dir="auto" title=${t('tables.tableName')} .value=${live(one.table.name)} @change=${(/** @type {Event} */ e) => shape(one, { name: typed(e) })}>`}
      ${whiteboard ? nothing : state.titling.value && own ? html`<input class="table-titled" dir="auto" title=${t('tables.viewName')} .value=${live(settings.name ?? '')} @change=${(/** @type {Event} */ e) => shape(one, { named: { id: at, name: typed(e) } })}
        @blur=${() => { state.titling.value = false }} @keydown=${titled}>` : html`<button type="button" class="table-kept" title=${t(`tables.${shows}`)} popovertarget=${`${id}-views`}>${LAID[shows]}<span dir="auto">${picked ? settings.name : t('tables.allRows')}</span>${rows.length < one.rows.length ? html`<span class="muted">${t('tables.of', { shown: counted(rows.length), count: counted(one.rows.length) })}</span>` : html`<span class="muted is-all">${counted(rows.length)}</span>`}${icons.chevron}</button>
        <div id=${`${id}-views`} class="menu table-menu" popover @focusout=${leaving}><h3>${t('tables.views')}</h3>${listed(ways.map((name) => html`<button type="button" aria-current=${String(shows === name)} popovertarget=${`${id}-views`} popovertargetaction="hide"
          @click=${() => show(name)}>${LAID[name]}${t(`tables.${name}`)}${shows === name ? icons.check : nothing}</button>`), [['', 'table', t('tables.allRows')], ...views.map((view) => [view.id, view.type, view.name]), ...proposed.map((key) => [key, yours[key].type, yours[key].name, assistantName()])].map(([to, type, name, from]) => html`<button type="button" aria-current=${String(to === (picked ? at : ''))}
          popovertarget=${`${id}-views`} popovertargetaction="hide" @click=${() => { as.value = /** @type {string} */ (to) }}>${LAID[/** @type {string} */ (type)] ?? LAID.table}<span dir="auto">${name}</span>${from ? html`<span class="menu-value" dir="auto">${from}</span>` : nothing}${to === (picked ? at : '') ? icons.check : nothing}</button>`),
          [option(`${id}-views`, icons.pin, t('tables.keepView'), () => keep(true)), ...(own ? [option(`${id}-views`, icons.compose, t('action.rename'), retitle), option(`${id}-views`, icons.trash, t('action.delete'), () => { as.value = ''; shape(one, { drop: at }) }, false, 'danger')] : [])])}</div>`}
      <div class="table-tools">${one.rows.length > 4 || search.value ? html`<label class="creations-find" for=${`${id}-find`}>${icons.search}<span class="visually-hidden">${t('tables.search')}</span><input id=${`${id}-find`} type="search" dir="auto" placeholder=${t('tables.search')} title=${t('tables.search')}
        .value=${live(search.value)} @input=${(/** @type {Event} */ e) => { search.value = typed(e) }} @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && search.value && !e.isComposing) { e.stopPropagation(); search.value = '' } }}></label>` : nothing}
        <button type="button" class="icon-button" aria-label=${t('tables.arrange')} popovertarget=${`${id}-arrange`}>${sliders}</button>
        <div id=${`${id}-arrange`} class="menu table-menu table-panel" popover @focusout=${leaving}>
          <h3><label for=${`${id}-group`}>${t('tables.groupBy')}</label></h3><div class="table-line"><select id=${`${id}-group`} .value=${live(by?.id ?? '')} @change=${(/** @type {Event} */ e) => view(() => ({ group: typed(e) || undefined }))}>
            <option value="">${t('tables.ungrouped')}</option>${groups.map((property) => html`<option value=${property.id} ?selected=${property === by}>${property.name}</option>`)}</select></div>
          ${tints.length ? html`<h3><label for=${`${id}-colour`}>${t('tables.colour')}</label></h3><div class="table-line"><select id=${`${id}-colour`} .value=${live(tint?.id ?? '')} @change=${(/** @type {Event} */ e) => view(() => ({ colour: typed(e) || undefined }))}>
            <option value="">—</option>${tints.map((property) => html`<option value=${property.id} ?selected=${property === tint}>${property.name}</option>`)}</select></div>` : nothing}
          <h3>${t('tables.filter')}</h3>${ruled}
          <h3 id=${`${id}-shown`}>${t('tables.shown')}</h3><div class="table-lines" role="group" aria-labelledby=${`${id}-shown`}>${listed(columns.map((property) => html`<label class="table-line" for=${`${id}-shown-${property.id}`}><input id=${`${id}-shown-${property.id}`} type="checkbox" .checked=${live(!hidden.includes(property.id))} ?disabled=${property === titleOf(one.table)}
            @change=${(/** @type {Event} */ e) => view(({ hidden = [] }) => ({ hidden: /** @type {HTMLInputElement} */ (e.target).checked ? hidden.filter((id) => id !== property.id) : [...hidden, property.id] }))}>${GLYPHS[property.type]}<span dir="auto">${property.name}</span></label>`))}</div>
          <h3>${t('tables.sort')}</h3>${sorting}${whiteboard ? nothing : html`<hr>${option(`${id}-arrange`, icons.pin, t('tables.keepView'), () => keep(true))}`}</div>
        ${whiteboard ? nothing : html`<button type="button" class="button small primary table-new" @click=${() => added(one, { [title.id]: null }, state)}>${icons.plus}<span>${t('tables.addRow')}</span></button>`}
      </div>${whiteboard ? nothing : laid('over', { one, open: state.openRow })}</div>
    ${chips.length ? html`<ul class="table-chips" aria-label=${t('tables.arranged')}>${chips}</ul>` : nothing}
    <div class=${mine ? 'table-yours' : 'table-yours is-quiet'}><span role="status">${mine ? (offered ? t('tool.offer', { name: settings.name ?? '' }) : t('tables.onlyYou')) : nothing}</span>${mine ? html`<button type="button" class="table-keep" @click=${() => keep()}>${t('tables.keep')}</button><button type="button" class="table-keep"
      @click=${() => { if (offered) as.value = ''; alone(one, at) }}>${t(offered ? 'offer.no' : 'tables.reset')}</button>` : nothing}</div>`
  return html`<p class="visually-hidden" role="status">${(state.reviewed ||= cells > 0) ? count : ''}</p>${marked.length ? reviewBar({
      label: t('tables.review'), count, go: cells > 1 && !made ? go : null, previous: t('tables.previous'), next: t('tables.next'),
      accept: decided(accept, one), reject: decided(reject, one), acceptAll: t('tables.acceptAll'), rejectAll: t('tables.rejectAll'),
    }) : nothing}
    ${inside ? nothing : top}
    ${lacks ? nothing : way ? laid(way, { ...given, ...dated, pick: (/** @type {{ date?: string, until?: string }} */ calendar) => shape(one, { calendar }) })
      : grid(one, columns, columns.filter((property) => !hidden.includes(property.id)), rows, calculate, fresh, state, said, inside ? html`<div class="table-top">${top}</div>` : nothing)}${columns.filter(({ type }) => type === 'select' || type === 'person').map((property) => html`<datalist id=${listOf(one, property)}>${(property.type === 'person' ? people : (property.options ?? []).map((option) => option.name)).map((name) => html`<option value=${name}></option>`)}</datalist>`)}
    ${people.length ? html`<datalist id=${`${id}-me`}>${[t('tables.me'), ...people].map((name) => html`<option value=${name}></option>`)}</datalist>` : nothing}
    ${opened ? laid('row', { ...given, row: opened }) : nothing}<div id=${`${id}-card`} class="menu table-menu" popover @focusout=${leaving}></div>
    <div class=${none ? 'table-none' : 'table-none is-quiet'}><p role="status" dir="auto">${none || nothing}</p>${lacks ? html`<button type="button" class="button" @click=${() => shape(one, { add: { name: t(`tables.kind.${lacks}`), type: lacks, options: lacks === 'status' ? steps() : undefined } }).then(() => /** @type {HTMLElement | null} */ (state.box.querySelector('.table-kept'))?.focus())}>${icons.plus}${t('tables.addColumn')}</button>`
      : words && one.rows.length && !rows.length ? html`<button type="button" class="button"
      @click=${() => { search.value = ''; /** @type {HTMLElement | null} */ (state.box.querySelector('.creations-find input'))?.focus() }}>${t('tables.clear')}</button>
      <button type="button" class="button" @click=${() => ask(one, t('tables.asked.show', { table: one.table.name, words: search.value.trim() }))}>${said.ask}</button>` : nothing}</div>`
}

/**
 * Jean's changes decided (D505), all of them or a row's: the keyboard goes on to the next row's Accept, or with none left to the view's tools.
 * @param {typeof accept} work @param {Loaded} one @param {string} [row]
 */
const decided = (work, one, row) => (/** @type {Event} */ e) => { const view = /** @type {Element} */ (e.currentTarget).closest('.table-view'); work(one, row).then(() => /** @type {HTMLElement | null | undefined} */ (view?.querySelector('.table-decide button') ?? view?.querySelector('.table-tools button'))?.focus()) }
/** A row's own Accept and Reject while Jean's changes to it wait. @param {Loaded} one @param {string} row */
const decide = (one, row) => html`<button type="button" class="icon-button" aria-label=${t('tables.accept')} @click=${decided(accept, one, row)}>${icons.check}</button><button type="button" class="icon-button" aria-label=${t('tables.reject')} @click=${decided(reject, one, row)}>${icons.close}</button>`

/**
 * The table: the columns shown, the rows the view keeps, each column's foot working out what `calculate` asks.
 * @param {Loaded} one @param {Property[]} columns @param {Property[]} shown @param {Row[]} rows @param {NonNullable<View['calculate']>} calculate @param {Set<string>} fresh @param {State} state
 * @param {{ ask: string, about: (row: Row) => string }} words @param {unknown} top
 */
function grid(one, columns, shown, rows, calculate, fresh, state, words, top) {
  const { box, naming, kinds, relating, list, by } = state, title = /** @type {Property} */ (titleOf(one.table)), most = Math.min(shown.length, 5), frozen = Math.min(state.frozen ?? 0, most)
  // The columns kept in view as the others scroll sideways, five at most, from the start: the divider after them, dragged to a column's end edge (the nearest),
  // or moved by the arrows, Home and End, as WAI-ARIA's window splitter is; a head's menu freezes up to it too (WCAG 2.5.7).
  const freeze = (/** @type {number} */ to) => to !== frozen && (state.frozen = to, state.arrange?.(() => ({ frozen: to || undefined })))
  /** @param {PointerEvent} e */
  const drag = (e) => {
    const handle = /** @type {HTMLElement} */ (e.currentTarget), table = /** @type {HTMLTableElement} */ (handle.closest('table')), rtl = getComputedStyle(table).direction === 'rtl'
    const ends = [...table.tHead?.rows[0].cells ?? []].slice(0, most + 1).map((cell) => ((rect) => (rtl ? rect.left : rect.right))(cell.getBoundingClientRect())), start = ends[0] - (table.tHead?.rows[0].cells[0].getBoundingClientRect().width ?? 0) * (rtl ? -1 : 1)
    let to = frozen
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('is-dragging')
    handle.onpointermove = (move) => { to = ends.reduce((best, end, k) => (Math.abs(end - move.clientX) < Math.abs(ends[best] - move.clientX) ? k : best), 0); table.style.setProperty('--frozen-end', `${Math.abs(ends[to] - start)}px`) }
    handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = handle.onpointerup = handle.onpointercancel = null; handle.classList.remove('is-dragging'); freeze(to) || state.edge?.() }
  }
  // As many decimals in each column of plain numbers as its longest has (D752).
  state.digits = new Map(shown.flatMap((property) => (property.type === 'number' && !property.format ? [[property.id, digitsOf(one.rows, property)]] : [])))
  // This collection first, then the others a relation can be to.
  const targets = [{ folder: one.folder, name: t('tables.thisCollection') }, ...state.collections.value.filter((other) => other.folder !== one.folder)]
  /** The keyboard to a field of the view once it is drawn, its text selected. @param {string} selector */
  const focus = (selector) => requestAnimationFrame(() => {
    const found = /** @type {HTMLInputElement | null} */ (box.querySelector(selector))
    found?.focus()
    found?.select?.()
  })
  const head = (/** @type {string} */ id) => `th[data-column="${CSS.escape(id)}"]`
  /** A column's name in a box in its head, the keyboard in it. @param {string} id */
  const rename = (id) => { naming.value = id; focus(`${head(id)} input`) }
  /** Enter or leaving the box renames its column, Escape doesn't; the keyboard goes back to its head. @param {KeyboardEvent | FocusEvent} event @param {Property} property */
  const named = (event, property) => {
    const key = event instanceof KeyboardEvent ? event.key : ''
    if (naming.peek() !== property.id || (event instanceof KeyboardEvent && (event.isComposing || !['Enter', 'Escape'].includes(key)))) return
    event.preventDefault()
    event.stopPropagation()
    const name = typed(event).trim()
    naming.value = ''
    if (key) focus(`${head(property.id)} .table-head`)
    if (key !== 'Escape' && name && name !== property.name) shape(one, { rename: { id: property.id, name } })
  }
  /**
   * A column of a kind, named as it, or a relation after the other collection it is to, added last or at a place among them all, its name then to change.
   * @param {string} type @param {number} [at] @param {string} [collection] a relation's
   */
  const added = async (type, at, collection) => {
    const table = await shape(one, { add: { name: (collection !== one.folder && targets.find((other) => other.folder === collection)?.name) || t(`tables.kind.${type}`), type, at, collection, options: type === 'status' ? steps() : undefined } })
    const made = table?.properties.find((property) => !one.table.properties.some((had) => had.id === property.id))
    if (made) rename(made.id)
  }
  /** A kind in the last head's menu, which adds a column of it. @param {string} type */
  const adds = (type) => html`<button type="button" popovertarget=${`${state.id}-add`} popovertargetaction="hide" @click=${() => added(type)}>${GLYPHS[type]}${t(`tables.kind.${type}`)}</button>`
  /** A row moved before or after another, as the rows' order. @param {string} id @param {string} to @param {boolean} after */
  const move = async (id, to, after) => {
    if (id === to || !one.rows.some((row) => row.id === id)) return
    const ids = (state.order?.() ?? one.rows).map((row) => row.id).filter((other) => other !== id)
    ids.splice(ids.indexOf(to) + (after ? 1 : 0), 0, id)
    await shape(one, { order: ids })
  }
  /** No line where a dragged row would go any more. */
  const left = () => { for (const row of box.querySelectorAll('[data-drop]')) delete /** @type {HTMLElement} */ (row).dataset.drop }
  /**
   * Where a row or a column dragged over this one goes, by what is dragged: before it over the half `first` says, after it over the other,
   * a line showing which. @param {string} kind @param {(event: DragEvent, bounds: DOMRect, at: HTMLElement) => boolean} first
   */
  const hover = (kind, first) => (/** @type {DragEvent} */ event) => {
    if (!event.dataTransfer?.types.includes(kind)) return
    event.preventDefault()
    const at = /** @type {HTMLElement} */ (event.currentTarget), before = first(event, at.getBoundingClientRect(), at)
    if (!at.dataset.drop) left()
    at.dataset.drop = before ? 'before' : 'after'
  }
  /** A row dragged over this one: before it over its first half. */
  const over = hover('text/x-row', (event, { top, height }) => event.clientY < top + height / 2)
  /** Its handle dragged, the row goes with the pointer. @param {DragEvent} event @param {string} id */
  const lift = (event, id) => {
    const row = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (event.currentTarget).closest('tr')), { left: x, top: y } = row.getBoundingClientRect()
    event.dataTransfer?.setData('text/x-row', id)
    event.dataTransfer?.setDragImage(row, event.clientX - x, event.clientY - y)
  }
  /** A row moved up or down by one, by the arrows on its handle or its menu, the keyboard on its handle. @param {number} i @param {number} by */
  const shove = (i, by) => { const [row, to] = [rows[i], by ? rows[i + by] : null]; return to && move(row.id, to.id, by > 0).then(() => focus(`tr[data-row="${CSS.escape(row.id)}"] .table-grip button`)) }
  /** @param {KeyboardEvent} event @param {number} i */
  const step = (event, i) => { if (shove(i, /** @type {Record<string, number>} */ ({ ArrowUp: -1, ArrowDown: 1 })[event.key] ?? 0)) event.preventDefault() }
  /** A row deleted, said with an Undo; the keyboard on the handle of the row in its place, else New row. @param {Row} row @param {number} i */
  const drop = async (row, i) => {
    if (!(await rid(one, row))) return
    requestAnimationFrame(() => { const all = box.querySelectorAll('tbody .table-grip button'); /** @type {HTMLElement | null} */ (all[Math.min(i, all.length - 1)] ?? box.querySelector('.table-add'))?.focus() })
  }
  /** A column dragged over this head: before it over the half its line starts in; taken on entering too, as WebKit asks of a place to drop. */
  const aside = hover('text/x-column', (event, { left: x, width }, th) => (event.clientX < x + width / 2) !== (getComputedStyle(th).direction === 'rtl'))
  /** A column moved before or after another. @param {string} id @param {string} to @param {boolean} after */
  const shift = (id, to, after) => to !== id && shape(one, { move: { id, to, after } })
  /** A row or a column dropped here, moved to the side of this one its line showed. @param {string} kind @param {(id: string, to: string, after: boolean) => unknown} go */
  const landing = (kind, go) => (/** @type {DragEvent} */ event, /** @type {string} */ to) => {
    const id = event.dataTransfer?.getData(kind), after = /** @type {HTMLElement} */ (event.currentTarget).dataset.drop === 'after'
    left()
    if (!id) return
    event.preventDefault()
    go(id, to, after)
  }
  /** A row dropped on another goes beside it, and into its group, taking its value, but for a month's, which no row takes by a drop (D752). @param {string} id @param {string} to @param {boolean} after */
  const placed = async (id, to, after) => {
    const [row, there] = [id, to].map((one) => rows.find((each) => each.id === one)), value = by && there && !DATED.test(by.type) ? valueOf(there, by) : undefined
    if (by && row && value !== undefined && canonical(value) !== canonical(valueOf(row, by)) && !(await edit(one, { row: id, set: { [by.id]: value } }))) return
    await move(id, to, after)
  }
  const dropped = landing('text/x-row', placed), put = landing('text/x-column', shift)
  /** A page of a column's menu: its actions, the kinds it can be, or the collections a relation can be to. @param {string} id @param {string} [column] @param {boolean} [relation] */
  const turn = (id, column = '', relation = false) => {
    kinds.value = column
    relating.value = relation
    if (relation) list()
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (box.querySelector(`#${id} ${column ? '[aria-current="true"]' : '.submenu'}`) ?? box.querySelector(`#${id} hr + ul button`))?.focus())
  }

  /** A column's menu showing its choices, each with the seven colours to pick its own from, or its actions again; the keyboard on the page's first row. @param {string} id @param {string} [column] */
  const choose = (id, column = '') => { state.choosing.value = column; focus(`#${id} button`) }
  /** A column's head, its menu under it, opened by a click or a right click, which Escape closes, leaving the pane; its name, which a long one cuts short on screen, whole in its tip. @param {Property} property @param {number} i */
  const heading = (property, i) => {
    const menu = `${state.id}-${i}`, place = one.table.properties.indexOf(property)
    const row = option.bind(null, menu)
    /** Moved before or after the column shown beside it, as far as it goes, the keyboard on its head. @param {Property | undefined} to @param {boolean} after */
    const moved = (to, after) => () => to && Promise.resolve(shift(property.id, to.id, after)).then(() => focus(`${head(property.id)} .table-head`))
    /** Deleted, said with an Undo and what still reads it (caps/compose), the keyboard on the head in its place. */
    const gone = () => shape(one, { remove: property.id }).then((table) => {
      if (!table) return
      notify(slots('touched').reduce((said, part) => part.said(said, one.folder, property.name), t('tables.columnDeleted', { name: property.name })), { label: t('memory.undo'), run: () => shape(one, { restore: property.id }) })
      requestAnimationFrame(() => { const all = box.querySelectorAll('thead .table-head'); /** @type {HTMLElement | undefined} */ (all[Math.min(i, all.length - 1)])?.focus() })
    })
    /** A kind, or a collection a relation is to, ticked when it is the column's. @param {unknown} glyph @param {unknown} label @param {boolean} on @param {() => Promise<unknown>} act */
    const pick = (glyph, label, on, act) => html`<button type="button" aria-current=${String(on)} popovertarget=${menu} popovertargetaction="hide" @click=${() => on || act().catch(() => reread(one))}>${glyph}${label}${on ? icons.check : nothing}</button>`
    const kind = (/** @type {string} */ type) => pick(GLYPHS[type], t(`tables.kind.${type}`), type === property.type, () => retype(one, property.id, type, undefined, type === 'status' ? steps(property) : undefined))
    const to = property.type === 'relation' ? property.collection : ''
    /**
     * A number written plain, as money or as a share of a hundred, each ticked when it is the column's; money asks its currency, beside it, the
     * menu staying open (D752). @param {Property} property @param {string} menu
     */
    const money = (property, menu) => {
      const as = (/** @type {'' | 'money' | 'percent'} */ format, /** @type {string} */ word) => html`<button type="button" aria-current=${String((property.format ?? '') === format)} popovertarget=${format === 'money' ? nothing : menu} popovertargetaction="hide"
        @click=${() => (property.format ?? '') === format || shape(one, { number: { id: property.id, format: format || undefined, currency: property.currency ?? localCurrency() } }).then(() => format === 'money' && focus(`#${menu} select`))}>${GLYPHS.number}${t(word)}${(property.format ?? '') === format ? icons.check : nothing}</button>`
      const names = new Intl.DisplayNames(intlLocales(), { type: 'currency' }), field = `${menu}-currency`
      return [as('', 'tables.plain'), as('money', 'tables.money'), ...(property.format === 'money' ? [html`<label class="table-line" for=${field}><span>${t('tables.currency')}</span><select id=${field} .value=${live(property.currency ?? '')}
        @change=${(/** @type {Event} */ e) => shape(one, { number: { id: property.id, format: 'money', currency: typed(e) } })}>${Intl.supportedValuesOf('currency').map((code) => html`<option value=${code} ?selected=${code === property.currency}>${names.of(code)} (${code})</option>`)}</select></label>`] : []), as('percent', 'tables.percent')]
    }
    const target = (/** @type {{ folder: string, name: string }} */ { folder, name }) => pick(GLYPHS.relation, html`<span dir="auto">${name}</span>`, folder === to, () => retype(one, property.id, 'relation', folder))
    // Dragged by its head (the button: WebKit drags nothing from inside one) to another's side; hidden from its menu as Settings' columns shown hide it.
    return html`<th scope="col" data-column=${property.id} @dragenter=${aside} @dragover=${aside} @drop=${(/** @type {DragEvent} */ e) => put(e, property.id)} @dragend=${left}>${naming.value === property.id
        ? html`<input dir="auto" title=${t('tables.columnName')} .value=${property.name}
          @keydown=${(/** @type {KeyboardEvent} */ e) => named(e, property)} @blur=${(/** @type {FocusEvent} */ e) => named(e, property)}>`
        : html`<button type="button" class="table-head" popovertarget=${menu} title=${property.name} draggable="true" @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData('text/x-column', property.id)} @contextmenu=${(/** @type {MouseEvent} */ e) => { e.preventDefault(); /** @type {HTMLElement} */ (e.currentTarget).click() }}>${GLYPHS[property.type]}<span dir="auto">${property.name}</span></button>`}
      <div id=${menu} class="menu table-menu" popover @focusout=${leaving}
        @toggle=${(/** @type {ToggleEvent} */ e) => { if (e.newState === 'closed' && kinds.peek() === property.id) kinds.value = ''; if (e.newState === 'closed' && state.choosing.peek() === property.id) state.choosing.value = '' }}>${state.choosing.value === property.id
        ? listed([html`<button type="button" class="back" @click=${() => choose(menu)}>${icons.back}${t('tables.colour')}</button>`], (property.options ?? []).map((option) => html`<div class="table-line table-hues" role="group" aria-label=${option.name}>${pill(property, option.name)}
          ${Array.from({ length: HUES }, (_, hue) => html`<button type="button" class="icon-button" aria-label=${t(`tables.hue${hue}`)} aria-pressed=${String(hueOf(property, option.name) === hue)}
            @click=${() => shape(one, { hue: { id: property.id, name: option.name, hue: option.hue === hue ? undefined : hue } })}><i class="table-dot" data-hue=${hue}></i></button>`)}</div>`))
        : kinds.value === property.id && relating.value
        ? listed([html`<button type="button" class="back" @click=${() => turn(menu, property.id)}>${icons.back}${t('tables.kind.relation')}</button>`], targets.map(target))
        : kinds.value === property.id
        ? listed([html`<button type="button" class="back" @click=${() => turn(menu)}>${icons.back}${t('tables.type')}</button>`], ([...KINDS, ...WORKED].includes(property.type) || to ? KINDS : [property.type, ...KINDS]).map(kind), ...(property.type === 'number' ? [money(property, menu)] : []), ...(property.type === 'date' ? [[html`<button type="button" aria-current=${String(Boolean(property.time))} popovertarget=${menu} popovertargetaction="hide"
            @click=${() => shape(one, { time: { id: property.id, on: !property.time } })}>${when}${t('tables.time')}${property.time ? icons.check : nothing}</button>`]] : []),
          [html`<button type="button" class="submenu" aria-current=${String(Boolean(to))} @click=${() => turn(menu, property.id, true)}>${GLYPHS.relation}${t('tables.kind.relation')}<span class="menu-value" dir="auto">${to
            && (targets.find((other) => other.folder === to)?.name ?? one.related?.get(to)?.table.name)}</span>${icons.chevron}</button>`], WORKED.map(kind))
        : listed([row(icons.compose, t('action.rename'), () => rename(property.id)),
          html`<button type="button" class="submenu" @click=${() => turn(menu, property.id)}>${GLYPHS[property.type]}${t('tables.type')} <span class="menu-value">${t(`tables.kind.${property.type}`)}</span>${icons.chevron}</button>`,
          ...(property.options?.length ? [html`<button type="button" class="submenu" @click=${() => choose(menu, property.id)}>${icons.palette}${t('tables.colour')}${icons.chevron}</button>`] : [])],
          ...((empty) => (!empty || [...WORKED, 'formula'].includes(property.type) ? [] : [[row(icons.brain, html`${t('tables.askFill', { name: assistantName() })}<span class="menu-value">${empty}</span>`, () => ask(one, t('tables.asked.fill', { table: one.table.name, column: property.name })))]]))(rows.length - Number(total(rows, property, 'count'))),
          [row(ascending, t('tables.ascending'), () => sort(state, property, 'ascending')), row(descending, t('tables.descending'), () => sort(state, property, 'descending'))],
          [row(icons.back, t('tables.insertStart'), () => added('text', place)), row(icons.arrow, t('tables.insertEnd'), () => added('text', place + 1))],
          [row(toStart, t('tables.moveStart'), moved(shown[i - 1], false), !i), row(toEnd, t('tables.moveEnd'), moved(shown[i + 1], true), i === shown.length - 1)],
          [row(icons.pin, t(i + 1 === frozen ? 'tables.unfreeze' : 'tables.freeze'), () => freeze(i + 1 === frozen ? 0 : i + 1), i >= most), row(shut, t('tables.hide'), () => state.arrange?.(({ hidden = [] }) => ({ hidden: [...hidden, property.id] })), property === title)],
          [row(icons.trash, t('action.delete'), gone, columns.length < 2, 'danger')])}</div>
    </th>`
  }

  /** A column's foot: what it works out over the rows shown, picked from its menu, none at first. @param {Property} property @param {number} i */
  const foot = (property, i) => {
    const menu = `${state.id}-foot-${i}`, how = calcOf(property, calculate), word = (/** @type {string} */ to) => (to === 'percent' && property.type === 'checkbox' ? 'ticked' : to || 'none')
    const ways = /** @type {('' | import('./query.js').Total)[]} */ (['', ...(NUMERIC.test(property.type) ? ['sum', 'average', 'min', 'max'] : []), 'count', 'percent'])
    return html`<td><button type="button" class="table-total" popovertarget=${menu}>${how ? html`<span class="muted">${t(`tables.calc.${word(how)}`)}</span>
      ${totalOf(rows, property, how, state.digits?.get(property.id))}` : t('tables.calculate')}</button>
      <div id=${menu} class="menu table-menu" popover>${listed(ways.map((to) => html`<button type="button"
        aria-current=${String(how === to)} popovertarget=${menu} popovertargetaction="hide" @click=${() => state.arrange?.((now) => ({ calculate: { ...now.calculate, [property.id]: /** @type {import('./query.js').Total} */ (to || 'none') } }))}>${t(`tables.calc.${word(to)}`)}${how === to ? icons.check : nothing}</button>`))}</div></td>`
  }

  const blank = { [columns[0].id]: columns[0].type === 'checkbox' ? false : null }
  const add = () => change(one, [{ set: blank }], 'user').then(([id]) => focus(`tr[data-row="${CSS.escape(id)}"] :is(input, select)`), () => notify(t('tables.wrong'), { alert: true }))
  /** A row right under another, a copy with the cells its columns take, or a new one whose first field takes the keyboard; undone, it goes. @param {Row} row @param {boolean} [copy] */
  const twin = async (row, copy = true) => {
    const cells = !copy ? {} : Object.fromEntries(columns.flatMap((property) => (property.id in row.cells && !checkCell(property, row.cells[property.id]) ? [[property.id, row.cells[property.id]]] : [])))
    const [id] = await change(one, [{ set: Object.keys(cells).length ? cells : blank }], 'user').catch(() => (notify(t('tables.wrong'), { alert: true }), [])), ids = one.rows.map((other) => other.id)
    ids.splice(ids.indexOf(row.id) + 1, 0, id)
    if (id) await reshapeTable(one, { order: ids }, false).catch(() => reread(one)).then(() => copy || focus(`tr[data-row="${CSS.escape(id)}"] :is(input, select)`))
  }
  /** The rows' one menu, drawn for the row whose handle opens it: opened as a sheet, a row under it or a copy, moved up or down, or deleted. @param {number} i */
  const rowMenu = (i) => { const row = rows[i], item = option.bind(null, `${state.id}-row`); render(listed([item(icons.fullscreen, t('tables.open'), () => state.openRow(row.id))], [item(icons.plus, t('tables.insertBelow'), () => twin(row, false)), item(icons.copy, t('tables.duplicate'), () => twin(row))],
    [item(up, t('tables.moveUp'), () => shove(i, -1), !i), item(down, t('tables.moveDown'), () => shove(i, 1), i === rows.length - 1)], [item(icons.brain, words.ask, () => ask(one, words.about(row)))], [item(icons.trash, t('action.delete'), () => drop(row, i), false, 'danger')]), /** @type {HTMLElement} */ (box.querySelector(`#${state.id}-row`))) }
  /** A cell's field takes the keyboard, the caret at the end of its words. @param {Element | null | undefined} td */
  const into = (td) => {
    const field = /** @type {HTMLInputElement | null | undefined} */ (td?.querySelector('input, select')), formula = /** @type {HTMLElement | null | undefined} */ (td?.querySelector('[data-formula]'))
    if (formula) return open(String(formula.dataset.formula))
    // A picture's or a files cell has no field: its menu opens.
    if (!field) return /** @type {HTMLElement | null | undefined} */ (td?.querySelector('.table-pick'))?.click()
    field.focus()
    try { field?.setSelectionRange(field.value.length, field.value.length) } catch {}
  }
  /** A Formula's dialog, drawn by caps/formula, fetched as first opened. @param {string} id */
  const open = (id) => { state.formula.value = id; state.wrong.value = false }
  const editing = columns.find((property) => property.type === 'formula' && property.id === state.formula.value)
  /**
   * A cell selected, its box taking the keyboard, or being changed, its field taking it: Enter changes the one selected, then keeps the change
   * and selects the cell under it; Escape leaves it as it was, selected; the arrows select the next, the end of a row going on to the start of the next.
   * @param {KeyboardEvent} event
   */
  const keys = (event) => {
    // The arrows stop at a group's edge: its cell is the keys' way across. A button in a cell, which opens its choices, keeps its own keys, as a link does.
    const at = /** @type {HTMLElement} */ (event.target), td = /** @type {HTMLElement | null} */ (at.closest(CELL)), cells = [...(td?.closest('tbody') ?? box).querySelectorAll(CELL)]
    if (!td || at.matches('button, a') || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    const [w, rtl] = [shown.length, getComputedStyle(td).direction === 'rtl'], by = at === td ? /** @type {Record<string, number>} */ ({ ArrowUp: -w, ArrowDown: w, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 })[event.key]
      : ({ Enter: w, Escape: 0 })[event.key]
    if (event.key === 'Escape' && at instanceof HTMLInputElement && before.has(at)) at.value = /** @type {string} */ (before.get(at))
    if (at === td && event.key === 'Enter') into(td)
    else if (by === undefined) return
    else /** @type {HTMLElement} */ (cells[cells.indexOf(td) + by] ?? td).focus()
    event.preventDefault()
    event.stopPropagation()
  }
  /** Files dragged over a picture's or a files cell are for it, not for the task's box. @param {DragEvent} event */
  const filesOver = (event) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(), event.stopPropagation() }
  /** Dropped on such a cell, or pasted while it has the keys, they are its own. @param {Row} row @param {Property} property */
  const filesIn = (row, property) => (/** @type {DragEvent | ClipboardEvent} */ event) => {
    const files = [...('dataTransfer' in event ? event.dataTransfer : event.clipboardData)?.files ?? []]
    // Cells copied from a spreadsheet come with their picture: they are the table's (`pasted`).
    if (files.length && !/\t/.test(/** @type {ClipboardEvent} */ (event).clipboardData?.getData('text/plain') ?? '')) event.preventDefault(), event.stopPropagation(), given(one, row, property, files)
  }
  /** Cells copied from a spreadsheet, pasted on a cell or in its field, fill from it, row by row (caps/paste, fetched then); other words pasted in a field are its own. @param {ClipboardEvent} event */
  const pasted = (event) => {
    const data = event.clipboardData, td = /** @type {HTMLTableCellElement | null} */ (/** @type {Element} */ (event.target).closest(CELL)), text = data?.getData('text/plain') ?? ''
    if (!td || !text.trim() || (event.target !== td && !/\t|<table/i.test(text + data?.getData('text/html')))) return
    event.preventDefault()
    import('../paste/paste.js').then(({ paste }) => paste({ one, text, columns: shown.slice(td.cellIndex - 1), rows: [.../** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('tbody tr[data-row]'))].map((tr) => String(tr.dataset.row)), from: String(td.parentElement?.dataset.row),
      words: { pasted: (count) => t('tables.pasted', { count }), wrong: t('tables.wrong'), yes: t('tables.yes'), no: t('tables.no') } }))
  }
  /** Each row's place among the rows shown, which its handle moves it by. */
  const place = new Map(rows.map((row, i) => [row.id, i]))
  /** A row, kept by its id as it moves, its group's too, the keys going with it. @param {Row} row */
  const line = (row) => ((i) => html`<tr data-row=${row.id} class=${fresh.has(row.id) ? 'is-jean' : ''}
        @dragover=${over} @drop=${(/** @type {DragEvent} */ e) => dropped(e, row.id)}>
        <td class="table-grip"><button type="button" class="icon-button" draggable="true" aria-label=${t('tables.moveRow')} aria-keyshortcuts="ArrowUp ArrowDown" popovertarget=${`${state.id}-row`} @click=${() => rowMenu(i)}
          @dragstart=${(/** @type {DragEvent} */ e) => lift(e, row.id)} @dragend=${left} @keydown=${(/** @type {KeyboardEvent} */ e) => step(e, i)}
          @contextmenu=${(/** @type {MouseEvent} */ e) => { e.preventDefault(); /** @type {HTMLElement} */ (e.currentTarget).click() }}></button></td>
        ${shown.map((property) => {
          const changed = fresh.has(`${row.id} ${property.id}`), tip = changed ? t('tables.changed', { count: 1, name: assistantName() }) : nothing, content = cell(one, row, property, state)
          // The column that names the rows heads its row, which a button at its end opens.
          const classes = `${changed ? 'is-jean ' : ''}${READS.test(property.type) ? 'is-read' : ''}`
          const takes = /^(picture|files)$/.test(property.type) ? filesIn(row, property) : undefined
          return property === title ? html`<th scope="row" tabindex="-1" class=${classes} title=${tip}>${content}<button type="button" class="icon-button table-pick" aria-label=${t('tables.open')} @click=${() => state.openRow(row.id)}>${icons.fullscreen}</button></th>` : html`<td tabindex="-1" class=${classes} title=${tip} @dragover=${takes && filesOver} @drop=${takes} @paste=${takes}>${content}</td>`
        })}<td class=${fresh.has(row.id) ? 'table-decide' : ''}>${fresh.has(row.id) ? decide(one, row.id) : nothing}</td>
      </tr>`)(/** @type {number} */ (place.get(row.id)))
  /** Where a row whose group's cell changed has gone, said, the keys on that cell again (D752). */
  state.follow = (id, value) => requestAnimationFrame(() => {
    const at = shown.findIndex((property) => property === by), cell = box.querySelector(`tr[data-row="${CSS.escape(id)}"]`)?.children[at + 1]
    ;/** @type {HTMLElement | null | undefined} */ (cell?.querySelector('input, select'))?.focus()
    if (by) notify(t('tables.movedTo', { group: groupName(value === '' ? null : value, by) }), { quiet: true })
  })
  /**
   * Rows, a group's under its head: its name and how many, folding it (folded, it still says its totals), and under each column whose foot
   * works something out, its subtotal; a row dropped on its head takes its value, but a month's. Find unfolds what it keeps.
   * @param {Row[]} list @param {{ value: unknown, rows: Row[] }} [group]
   */
  const body = (list, group) => {
    const key = String(group?.value), shut = Boolean(group) && state.folded.value.has(key) && !state.search.value
    const fold = () => { const all = new Set(state.folded.peek()); if (!all.delete(key)) all.add(key); state.folded.value = all }
    const onto = (/** @type {DragEvent} */ e) => { const id = e.dataTransfer?.getData('text/x-row'); left(); if (id && by && group) e.preventDefault(), edit(one, { row: id, set: { [by.id]: group.value } }) }
    return html`<tbody @dragleave=${(/** @type {DragEvent} */ e) => !box.contains(/** @type {Node | null} */ (e.relatedTarget)) && left()} @keydown=${keys}
        @click=${(/** @type {MouseEvent} */ e) => { const at = /** @type {HTMLInputElement} */ (e.target); if (at.matches(`${CELL}, [data-formula]`)) into(at.closest(CELL)); else if (/^date/.test(at.type)) try { at.showPicker() } catch {} }}
        @focusin=${(/** @type {FocusEvent} */ e) => e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && before.set(e.target, e.target.value)}>${group && by ? html`<tr class="table-group"
        @dragover=${(/** @type {DragEvent} */ e) => !DATED.test(by.type) && e.dataTransfer?.types.includes('text/x-row') && e.preventDefault()} @drop=${onto}><td class="table-grip"></td>
        <th scope="rowgroup"><button type="button" class="table-fold" aria-expanded=${String(!shut)} @click=${fold}>${icons.chevron}<span dir="auto">${groupName(group.value, by)}</span>
          <span class="muted">${format('NumberFormat', intlLocales()).format(list.length)}</span></button></th>${shown.slice(1).map((property) => ((how) => html`<td class="table-sub">${how ? html`<span class="visually-hidden">${t('tables.subtotal')}</span>${totalOf(list, property, how, state.digits?.get(property.id))}` : nothing}</td>`)(calcOf(property, calculate)))}<td></td></tr>` : nothing}${repeat(shut ? [] : list, (row) => row.id, line)}</tbody>`
  }
  return html`<div class="table-scroll" @paste=${pasted}>${top}<table class="table-grid" aria-label=${one.table.name} data-frozen=${frozen || nothing}>
      <thead><tr><td class="table-grip"><div class="table-freeze" role="separator" tabindex="0" aria-orientation="vertical" aria-label=${t('tables.frozen')} aria-valuemin="0" aria-valuemax=${most} aria-valuenow=${frozen} @pointerdown=${drag}
        @keydown=${(/** @type {KeyboardEvent} */ e) => ((to) => to >= 0 && to <= most && (e.preventDefault(), freeze(to)))(e.key === 'Home' ? 0 : e.key === 'End' ? most : e.key === (getComputedStyle(box).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight') ? (state.frozen ?? 0) + 1 : /^Arrow(Left|Right)$/.test(e.key) ? (state.frozen ?? 0) - 1 : -1)}></div></td>${shown.map(heading)}<th scope="col"><button type="button" class="table-add-column" aria-label=${t('tables.addColumn')} popovertarget=${`${state.id}-add`} @focus=${list} @pointerenter=${list}>+</button>
        <div id=${`${state.id}-add`} class="menu table-menu" popover @focusout=${leaving}>${listed(KINDS.map(adds),
          targets.map(({ folder, name }) => html`<button type="button" popovertarget=${`${state.id}-add`} popovertargetaction="hide" @click=${() => added('relation', undefined, folder)}>${GLYPHS.relation}${t('tables.kind.relation')} <span class="menu-value" dir="auto">${name}</span></button>`),
          WORKED.map(adds))}</div></th></tr></thead>
      ${by ? repeat(query(one.table, rows, { group: { property: by.id }, locale: locale.value, names: one.names }).groups ?? [], (group) => String(group.value), (group) => body(group.rows, group))
        : body(rows)}
      <tfoot><tr><td class="table-grip"></td><td colspan=${shown.length + 1}><button type="button" class="table-add" @click=${add}>${icons.plus}${t('tables.addRow')}</button></td></tr>
        <tr><td class="table-grip"></td>${shown.map(foot)}<td></td></tr></tfoot>
    </table></div><div class="table-fade" aria-hidden="true"></div><div id=${`${state.id}-row`} class="menu table-menu" popover></div><div id=${`${state.id}-pick`} class="menu table-menu table-picks" popover @focusout=${leaving}></div>
    ${editing ? laid('formula', { one, columns, property: editing, state, parts, words: { yours: t('tables.yourFormula'), hint: t('tables.formulaHint'), wrong: t('tables.formulaWrong'), save: t('tables.save') } }) : nothing}`
}

/**
 * A date with a time as its field takes it, 2026-11-20T14:30 here: one written with a zone, as a brain may, at this device's hour; one with no time, at
 * midnight, until it is given one. @param {unknown} value
 */
const clockOf = (value) => (typeof value !== 'string' || !value ? '' : !value.includes('T') ? `${value}T00:00` : /(Z|[+-]\d{2}:\d{2})$/.test(value) ? ((at) => (Number.isNaN(at.getTime()) ? '' : new Date(at.getTime() - at.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)))(new Date(value)) : value.slice(0, 16))

/**
 * A cell as its column's kind changes it: a box to tick, a number, a date, a step or a choice, a few
 * choices, text; what Jean works out, and files, as they are. Named by its column, in its tip too. A choice reads as its pill, in its colour,
 * several as theirs, with a button for their menu (`pick()`), by its id, the table's or a sheet's own; a person with their face; pictures small and files by
 * their names, with a button for their menu too (`filed()`).
 * @param {Loaded} one @param {Row} row @param {Property} property @param {State} state @param {string} [menu]
 */
function cell(one, row, property, state, menu = `${state.id}-pick`) {
  const value = valueOf(row, property)
  const set = (/** @type {unknown} */ next, /** @type {Event} */ event) => edit(one, { row: row.id, set: { [property.id]: next } }, event).then((done) => { if (done && state.by?.id === property.id) state.follow?.(row.id, next) })
  const read = (/** @type {Event} */ event) => /** @type {HTMLInputElement} */ (event.target)
  switch (property.type) {
    case 'checkbox': return html`<input type="checkbox" title=${property.name} .checked=${live(value === true)} @change=${(/** @type {Event} */ e) => set(read(e).checked, e)}>`
    case 'number': return html`${value === null ? nothing : reading(said(row, property, one.names, state.digits?.get(property.id)), 'is-amount')}<input type="number" dir="ltr" step="any" title=${property.name}
      data-money=${property.format === 'money' && property.currency ? new Intl.DisplayNames(intlLocales(), { type: 'currency' }).of(property.currency) : nothing} .value=${live(value === null ? '' : String(value))}
      @change=${(/** @type {Event} */ e) => set(read(e).value === '' ? null : read(e).valueAsNumber, e)}>`
    case 'date': { const timed = property.time || String(value ?? '').includes('T'); return html`${value ? reading(said(row, property, one.names), 'is-date') : nothing}<input type=${timed ? 'datetime-local' : 'date'} title=${property.name} .value=${live(timed ? clockOf(value) : String(value ?? '').slice(0, 10))} @change=${(/** @type {Event} */ e) => set(read(e).value || null, e)}>` }
    case 'status':
    case 'select': return html`${value ? reading(pill(property, value)) : nothing}${choice(one, row, property, state)}`
    case 'person': return html`${value ? reading(html`${face(String(value))}<span dir="auto">${value}</span>`) : nothing}${choice(one, row, property, state)}`
    case 'relation': return choice(one, row, property, state)
    case 'multi-select': return html`${Array.isArray(value) && value.length ? reading(value.map((name) => pill(property, name)), 'is-pills') : nothing}<input dir="auto" title=${property.name} .value=${live(Array.isArray(value) ? value.join(', ') : '')}
      @change=${(/** @type {Event} */ e) => set(read(e).value.split(/[,،、]/).map((one) => one.trim()).filter(Boolean), e)}><button type="button" class="icon-button table-pick" aria-label=${t('tables.choices')} popovertarget=${menu} @click=${() => pick(one, row, property, state, menu)}>${icons.chevron}</button>`
    case 'formula': return html`<span dir="auto" data-formula=${property.id}>${said(row, property, one.names)}</span>`
    case 'picture':
    case 'files': { const all = filesOf(value); return html`<div class="table-files">${all.map((file) => (property.type === 'picture' ? pictured(one, file) : html`<span class="table-file" dir="auto">${icons.attach}${file.name}</span>`))}</div><button type="button" class="icon-button table-pick"
      aria-label=${t(`tables.kind.${property.type}`)} title=${all.map((file) => file.name).join(', ') || nothing} popovertarget=${menu} @click=${() => filed(one, row, property, state, menu)}>${icons.chevron}</button>` }
    case 'created-by':
    case 'changed-by': return html`<span dir="auto">${textOf(row, property)}</span>`
    case 'created-at':
    case 'changed-at': return html`<time datetime=${String(value)}>${format('DateTimeFormat', intlLocales(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)))}</time>`
    default: {
      // What was typed stays while its column refuses it, marked, the form it takes said beside it, Enter keeping the keyboard on it and Escape
      // leaving the cell as it was; once it fits it is changed.
      const key = `${row.id} ${property.id}`, typed = state.refused.value.get(key), refused = (/** @type {string} */ text) => Boolean(text.trim() && checkCell(property, text.trim()))
      const hold = (/** @type {string} */ text = '', all = new Map(state.refused.peek())) => { if (text) all.set(key, text); else all.delete(key); state.refused.value = all }
      const wrong = typed !== undefined && refused(typed), help = `${state.id}-${row.id}-${property.id}`, text = textOf(row, property), link = property.type === 'link' && /^https?:\/\//i.test(text)
      // What a filled cell opens: a link its page, an email a letter, a phone a call.
      const to = wrong || !text ? '' : link ? text : property.type === 'email' ? `mailto:${text}` : property.type === 'phone' ? `tel:${text.replace(/[^\d+]/g, '')}` : ''
      return html`${wrong ? nothing : link ? reading(text.replace(/^https?:\/\/(www\.)?|\/$/gi, '')) : property.type === 'text' && text.length > 28 ? reading(text, 'is-text') : nothing}<input dir="auto" type=${({ link: 'url', email: 'email', phone: 'tel' })[/** @type {string} */ (property.type)] ?? 'text'} title=${property.name}
        aria-invalid=${wrong ? 'true' : nothing} aria-describedby=${wrong ? help : nothing} .value=${live(typed ?? textOf(row, property))}
        @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.isComposing) return; if (e.key === 'Enter' && refused(read(e).value)) { e.preventDefault(); e.stopPropagation(); hold(read(e).value) } else if (e.key === 'Escape' && typed !== undefined) { before.set(read(e), textOf(row, property)); hold() } }}
        @change=${async (/** @type {Event} */ e) => { const text = read(e).value; hold(text); if (!refused(text)) { await set(text.trim() || null, e); hold() } }}>${to ? html`<a class="icon-button table-pick" href=${to} target=${link ? '_blank' : nothing} rel="noopener noreferrer" aria-label=${t('tables.open')} title=${text}>${link ? icons.external : GLYPHS[property.type]}</a>` : nothing}${wrong ? html`<p id=${help} class="table-wrong" role="alert" dir="auto" ${ref(seen)}>${t(`tables.form.${property.type}`)}</p>` : nothing}`
    }
  }
}

/**
 * What a rule compares with, as its column's kind takes it: ticked or not, a choice, a number, a date, else text.
 * A person's offers the names its column knows after "Me", the person looking, whoever they are (query.js). @param {Property} property @param {unknown} value @param {(value: unknown) => void} set @param {string} people the id of that list
 */
function against(property, value, set, people) {
  const person = property.type === 'person', now = /** @type {{ me?: boolean } | null} */ (value)?.me ? t('tables.me') : String(value ?? '')
  const change = (/** @type {Event & { target: HTMLInputElement }} */ { target: field }) => set(property.type === 'checkbox' ? field.value === 'true' : field.type === 'number' && field.value ? field.valueAsNumber : person && field.value === t('tables.me') ? { me: true } : field.value)
  if (property.type === 'checkbox' || property.options) return html`<select title=${property.name} .value=${live(now)} @change=${change}>${(property.options
    ? [['', '—'], ...property.options.map(({ name }) => [name, name])] : [['true', t('tables.yes')], ['false', t('tables.no')]]).map(([id, name]) => html`<option value=${id} ?selected=${id === now}>${name}</option>`)}</select>`
  return html`<input dir="auto" type=${property.type === 'number' ? 'number' : DATED.test(property.type) ? 'date' : 'text'} list=${person ? people : nothing} title=${property.name} .value=${now} @change=${change}>`
}

/** The id of the list of a select's choices, one a column, drawn with the view, which its fields hold only in use (`choice()`). @param {Loaded} one @param {Property} property */
const listOf = (one, property) => `choices-${one.table.id}-${property.id}`

/**
 * A step to pick among a status's, a row among those of the collection a relation is to (`related()`), or a choice among a select's, where typing a
 * new one adds it (D491), as a name among those a Person's column knows (`namesIn()`). A select's field holds its column's list only with the pointer or the keyboard on it: in every row, the style Chromium
 * works out grows with their square, 100 s for eight such columns of 3,000 rows. Its row gone to another group, the keys follow it.
 * @param {Loaded} one @param {Row} row @param {Property} property @param {State} state
 */
function choice(one, row, property, state) {
  const value = /** @type {string | null} */ (valueOf(row, property)), next = (/** @type {Event} */ event) => /** @type {HTMLInputElement} */ (event.target).value.trim() || null
  const set = (/** @type {Event} */ event) => ((to) => edit(one, { row: row.id, set: { [property.id]: to } }, event).then((done) => { if (done && state.by?.id === property.id) state.follow?.(row.id, to) }))(next(event))
  if (property.type === 'relation') return related(one, property, value, set)
  if (property.type !== 'select' && property.type !== 'person') return html`<select title=${property.name} .value=${live((property.options ?? []).some(({ name }) => name === value) ? value : '')} @change=${set}>
      <option value="">—</option>${(property.options ?? []).map(({ name }) => html`<option value=${name} ?selected=${name === value}>${name}</option>`)}
    </select>`
  const on = (/** @type {Event} */ { currentTarget }) => /** @type {Element} */ (currentTarget).setAttribute('list', listOf(one, property))
  const off = (/** @type {Event} */ { type, currentTarget }) => { const field = /** @type {Element} */ (currentTarget); if (type === 'blur' ? !field.matches(':hover') : field !== document.activeElement) field.removeAttribute('list') }
  return html`<input dir="auto" title=${property.name} .value=${live(value ?? '')} @pointerenter=${on} @focus=${on} @pointerleave=${off} @blur=${off} @change=${set}>`
}

/**
 * A row picked among those of the collection a relation is to, by its name, one gone showing as none. Each row here holding each row there, 500 of
 * each would be 250,000 options: it holds the one picked, the others coming as the pointer presses it or the keyboard reaches it, its width kept
 * meanwhile, and going as the keyboard leaves it.
 * @param {Loaded} one @param {Property} property @param {string | null} value @param {(event: Event) => void} set
 */
function related(one, property, value, set) {
  const rows = one.related?.get(String(property.collection))?.rows ?? [], picked = rows.filter(({ id }) => id === value)
  const fill = (/** @type {HTMLSelectElement} */ select, /** @type {boolean} */ all) => { render(html`<option value="">—</option>${(all ? rows : picked).map(({ id }) => html`<option value=${id}>${one.names?.get(id) || t('tables.unnamed')}</option>`)}`, select); select.value = picked[0]?.id ?? ''; if (!all) select.style.inlineSize = '' }
  const open = (/** @type {Event} */ { currentTarget }) => { const select = /** @type {HTMLSelectElement} */ (currentTarget); if (!select.style.inlineSize) { select.style.inlineSize = `${select.getBoundingClientRect().width}px`; fill(select, true) } }
  return html`<select title=${property.name} ${ref((select) => select && fill(/** @type {HTMLSelectElement} */ (select), select === document.activeElement))} @mousedown=${open} @focus=${open} @blur=${(/** @type {Event} */ { currentTarget }) => fill(/** @type {HTMLSelectElement} */ (currentTarget), false)} @change=${set}></select>`
}

/** Each row's cells as Find reads them, as they are written and as they are said, made once for each copy read. @type {WeakMap<Row[], { locale: string, texts: Map<string, string> }>} */
const indexes = new WeakMap()
/** @param {Loaded} one @param {Property[]} columns */
const indexOf = (one, columns) => {
  const was = indexes.get(one.rows)
  if (was?.locale === locale.value) return was.texts
  const texts = new Map(one.rows.map((row) => [row.id, searchable(columns.map((property) => `${textOf(row, property, { names: one.names })} ${said(row, property, one.names)}`).join('\n'))]))
  indexes.set(one.rows, { locale: locale.value, texts })
  return texts
}
/** Each cell's words as said, kept for each copy of its row read: a draw for a letter in Find says none again. @type {WeakMap<Row, Map<string, string>>} */
const sayings = new WeakMap()
/** A cell as a card says it, in the user's language (./export.js). @param {Row} row @param {Property} property @param {Map<string, string>} [names] @param {number} [digits] */
const said = (row, property, names, digits) => {
  const kept = sayings.get(row) ?? /** @type {Map<string, string>} */ (sayings.set(row, new Map()).get(row)), key = `${locale.value} ${property.id} ${property.type} ${property.format} ${property.currency} ${digits}`
  if (!kept.has(key)) kept.set(key, told(row, property, { locales: intlLocales(), labels: { yes: t('tables.yes'), no: t('tables.no') }, names, digits }))
  return /** @type {string} */ (kept.get(key))
}
/**
 * A cell's reading, drawn over its field until the cell has the keys (D752), which alone shows the field: an amount as its column writes it,
 * a day in the user's words, a step as its pill. Seen, never read: its field is what the keys and a screen reader reach. @param {unknown} words @param {string} [kind]
 */
const reading = (words, kind = '') => html`<bdi class=${`table-read ${kind}`} aria-hidden="true">${words}</bdi>`
/** A choice as its pill, in its colour (`hueOf()`), a step in its group's look until one is picked. @param {Property} property @param {unknown} name */
const pill = (property, name) => html`<span class="table-pill" dir="auto" data-hue=${hueOf(property, name) ?? nothing} data-group=${property.options?.find((option) => option.name === name)?.group ?? nothing}>${name}</span>`
/** A person's face: their name's first letter on their colour, the same wherever the name is read. @param {string} name */
const face = (name) => html`<span class="table-face" data-hue=${hueFor(name)}>${[...name.trim()][0] ?? ''}</span>`
/**
 * The names a Person's field offers: those the collection's Person columns hold, then those other capabilities know of, the people worked with
 * on it and the people met (their `names` slot), and the person's own, as the language sorts them. @param {Loaded} one @param {Property[]} columns
 */
const namesIn = (one, columns) => [...new Set([...one.rows.flatMap((row) => columns.flatMap((property) => (property.type === 'person' ? [row.cells[property.id]] : []))),
  ...slots('names').flatMap((part) => part.of(one.folder)), meIn(one)].filter((name) => typeof name === 'string' && name.trim()))].sort((a, b) => a.localeCompare(b, intlLocales()))

/**
 * A cell's menu drawn again after a change of its own, from the collection, its row and its column as they are by then.
 * @param {typeof pick} draw @param {Row} row @param {Property} property @param {State} state @param {string} menu
 */
function again(draw, row, property, state, menu) {
  const now = state.now(), next = now?.rows.find(({ id }) => id === row.id), column = now?.table.properties.find(({ id }) => id === property.id)
  if (now && next && column) draw(now, next, column, state, menu)
}
/** A picture a cell names, read from the collection's folder once it is on the page (ui/shown.js). @param {Loaded} one @param {{ file: string, type?: string }} file */
const pictured = (one, file) => html`<app-shared uri=${`${one.folder}/${file.file}`} type=${file.type ?? nothing}></app-shared>`
/** Files given to a cell, kept with the collection (`attach()`); one it can't take, no picture or too big, is said. @param {Loaded} one @param {Row} row @param {Property} property @param {File[]} files */
const given = (one, row, property, files) => attach(one, row, property, files).then((left) => left > 0, () => true).then((left) => { if (left) notify(t('tables.wrong'), { alert: true }) })
/**
 * The menu of a picture's or a files cell, drawn for the cell whose button opens it: each file by its name, which opens it beside the task as any
 * file is, with what takes it away from the cell, then what adds some from the device; each change is the cell's, the menu then drawn again.
 * @param {Loaded} one @param {Row} row @param {Property} property @param {State} state @param {string} menu its id
 */
function filed(one, row, property, state, menu) {
  const box = /** @type {HTMLElement} */ (state.box.querySelector(`#${menu}`)), all = filesOf(valueOf(row, property)), picture = property.type === 'picture'
  const open = (/** @type {typeof all[number]} */ file) => {
    box.hidePopover()
    ;/** @type {HTMLDialogElement | null} */ (state.box.querySelector('dialog.table-row'))?.close()
    import('../../ui/preview.js').then(({ preview }) => preview({ uri: `${one.folder}/${file.file}`, name: file.name, title: file.name.replace(/\.[^.]+$/, '') || file.name, mimeType: file.type }, true))
  }
  const add = (/** @type {Event} */ event) => { const field = /** @type {HTMLInputElement} */ (event.target), files = [...field.files ?? []]; field.value = ''; given(one, row, property, files).then(() => again(filed, row, property, state, menu)) }
  render(listed(...[all.map((file, i) => html`<div class="table-line" role="group" aria-label=${file.name}><button type="button" class="table-file" @click=${() => open(file)}>${picture ? pictured(one, file) : icons.attach}<span dir="auto">${file.name}</span></button>
    <button type="button" class="icon-button" aria-label=${t('action.remove')} @click=${() => edit(one, { row: row.id, set: { [property.id]: all.filter((_, j) => j !== i) } }).then(() => again(filed, row, property, state, menu))}>${icons.trash}</button></div>`),
    [html`<label class="table-line table-file" for=${`${menu}-add`}>${icons.plus}${t(picture ? 'tables.addPicture' : 'tables.addFiles')}<input id=${`${menu}-add`} class="visually-hidden" type="file" multiple accept=${picture ? 'image/*' : nothing} @change=${add}></label>`]].filter((group) => group.length)), box)
}

/**
 * The menu of a Several choices' cell, drawn for the cell whose button opens it: each of its column's choices, ticked while the cell holds
 * it, and a field that adds one; each change is the cell's, the menu then drawn again from the collection as it is.
 * @param {Loaded} one @param {Row} row @param {Property} property @param {State} state @param {string} menu its id
 */
function pick(one, row, property, state, menu) {
  const box = /** @type {HTMLElement} */ (state.box.querySelector(`#${menu}`)), held = new Set(/** @type {unknown[]} */ (valueOf(row, property) ?? []))
  const ticked = () => [.../** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll('input:checked'))].map((field) => field.value)
  const set = (/** @type {string[]} */ names) => edit(one, { row: row.id, set: { [property.id]: names } }).then(() => again(pick, row, property, state, menu))
  const add = (/** @type {KeyboardEvent} */ event) => {
    const field = /** @type {HTMLInputElement} */ (event.target), name = field.value.trim()
    if (event.key !== 'Enter' || event.isComposing) return
    event.preventDefault()
    event.stopPropagation()
    if (name) { field.value = ''; set([...new Set([...ticked(), name])]) }
  }
  render(listed(...[(property.options ?? []).map((option, i) => html`<label class="table-line" for=${`${menu}-${i}`}><input id=${`${menu}-${i}`} type="checkbox" value=${option.name} .checked=${live(held.has(option.name))}
    @change=${() => set(ticked())}>${pill(property, option.name)}</label>`), [html`<input dir="auto" title=${t('tables.addChoice')} placeholder=${t('tables.addChoice')} @keydown=${add}>`]].filter((group) => group.length)), box)
}

/** A row made with the cells a layout gives it, which opens as a sheet, to be named. @param {Loaded} one @param {Record<string, unknown>} set @param {State} state */
const added = (one, set, state) => change(one, [{ set }], 'user').then(([id]) => id && state.openRow(id), () => notify(t('tables.wrong'), { alert: true }))
/** What the layouts, their cards and a row's sheet are drawn with, the view's own. */
export const parts = { cell, decide, totalOf, edit, pictured, added, pill, face, said, option, listed, rid, ask, leaving, glyphs: GLYPHS, reads: READS }

/** The layouts, a row's sheet and what shows over the rows (caps/over), each fetched as first shown, and those that have come. @type {Record<string, () => Promise<{ default: (given: any) => unknown }>>} */
const LAYOUTS = { over: () => import('../over/over.js'), board: () => import('../board/board.js'), gallery: () => import('../gallery/gallery.js'), calendar: () => import('../calendar/calendar.js'), timeline: () => import('../timeline/timeline.js'), list: () => import('../list/list.js'), row: () => import('../row/row.js'), formula: () => import('../formula/formula.js') }
const layouts = signal(/** @type {Record<string, (given: any) => unknown>} */ ({ over: (await LAYOUTS.over()).default }))
/**
 * A layout or a row's sheet, drawn by its own folder (caps/board, gallery, calendar, timeline, list, row) with what the view gives it: the collection,
 * its columns, the rows the view keeps, those Jean changed, the cards' parts and Tables' words; nothing until it has come. @param {string} way @param {object} given
 */
function laid(way, given) {
  if (!layouts.value[way]) return LAYOUTS[way]().then((module) => { layouts.value = { ...layouts.peek(), [way]: module.default } }), nothing
  return layouts.value[way](given)
}
