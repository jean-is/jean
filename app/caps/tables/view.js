// A table's view beside the conversation (D491): the table on show (./tables.js) as a table, each cell changed
// in place as its column's kind asks, or as a board grouped by its status or a select, each card moved by its
// own choice or dragged to another lane. Jean's changes the user hasn't accepted are marked, under the bar over them (ui/review.js, D505).
// Its heads stay on top as its rows scroll, each its kind's glyph and its name, opening the column's menu: renamed in its head,
// made another kind, the rows sorted by it, a column added before or after it, or taken away (D494, D547); the last head adds one.
// A relation is to this collection or another of the project's, picked from Type's or the last head's list, and its cell picks a row there by its name (D560).
// A row is moved by its handle at its start, shown with the pointer or the keyboard on it: dragged, or with the arrows; a click or a right click on it
// opens its menu, to insert a row under it (D625), duplicate or delete it. A cell is selected or changed, ⌘Z undoing the user's last step and ⇧⌘Z doing it again (D620); a Formula's
// opens a dialog to write the column's formula in (D621). Its
// name changes above it, beside Search, which keeps the rows with its words in any cell as the Creations page's does, Filter, the rules a row meets to show, Sort, the
// rows sorted by a column once, and Settings: the layout, the columns shown, the filter and the sort; the table's foot works out a sum or
// a share for each column (D567). In the pane as in a document that holds it. lit-html, in Jean's own document, redrawn as the table
// changes here or by the brain.
import { html, svg, nothing, render } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { keyed } from 'lit-html/directives/keyed.js'
import { signal, effect } from '@preact/signals-core'
import { t, locale, intlLocales } from '../../core/i18n.js'
import { notify, assistantName } from '../../ui/state.js'
import { reviewBar } from '../../ui/review.js'
import { icons, icon } from '../../ui/menu-icons.js'
import { shown, change, unkept, accept, reject, reread, reshapeTable, retype, collections, undoStep } from './tables.js'
import { query, valueOf, total, filterOf } from './query.js'
import { titleOf, checkCell } from './table.js'
import { compile } from './formula.js'
import { textOf, said as told } from './export.js'
import { searchable } from '../../ui/mentions.js'

/** @import { Property, View, Rule } from './table.js' */
/** @import { Row } from './changes.js' */
/** @import { Loaded } from './tables.js' */
/** @import { Signal } from '@preact/signals-core' */
/**
 * What a view keeps while it is drawn: its box, whether it shows the board, the column whose name is being changed, the one whose
 * menu lists the kinds, whether it lists the collections a relation can be to then, the project's collections, read again by `list()`,
 * what its menus' ids start with, the words Search keeps the rows with (D567), and the Formula whose dialog is open, saying when its formula can't be read (D621).
 * @typedef {{ box: HTMLElement, board: Signal<boolean>, naming: Signal<string>, kinds: Signal<string>, relating: Signal<boolean>, collections: Signal<{ folder: string, name: string }[]>, list: () => void, id: string, search: Signal<string>, formula: Signal<string>, wrong: Signal<boolean> }} State
 */

/** The kinds of column the user adds or makes one, in the order they are offered. */
const KINDS = ['text', 'number', 'date', 'select', 'multi-select', 'checkbox', 'link', 'email', 'phone', 'formula']
/** Each kind's glyph, before its column's name (D547); one Jean works out shows who or when. */
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
  files: icons.attach,
  relation: icon(svg`<rect x="3.5" y="4" width="8" height="6" rx="2"/><rect x="12.5" y="14" width="8" height="6" rx="2"/><path d="M7.5 10v4.5a2.5 2.5 0 0 0 2.5 2.5h2.5"/>`, 'flip-rtl'),
  'created-by': who, 'changed-by': who, 'created-at': when, 'changed-at': when, formula: icon(svg`<path d="M13.5 4.5h-1a2.5 2.5 0 0 0-2.5 2.5v12.5M7 10h6M15 12.5l5 6M20 12.5l-5 6"/>`),
})
/** Filter's funnel, Sort's arrows and Settings' sliders (D567). */
const [funnel, arrows, sliders] = [icon(svg`<path d="M4.5 5.5h15l-6 7.5v5l-3 1.5V13Z"/>`), icon(svg`<path d="M8 19.5v-15M4.5 8 8 4.5 11.5 8M16 4.5v15M12.5 16l3.5 3.5 3.5-3.5"/>`),
  icon(svg`<path d="M4.5 7h7M15.5 7h4M4.5 17h4M12.5 17h7"/><circle cx="13.5" cy="7" r="2"/><circle cx="10.5" cy="17" r="2"/>`, 'flip-rtl')]
/** The kinds a rule compares as dates: before, after (D567). */
const DATED = /^(date|created-at|changed-at)$/
/** Sorting from A to Z, the bars growing; from Z to A; and a row's handle. */
const ascending = icon(svg`<path d="M7 19.5v-15M3.5 8 7 4.5 10.5 8M13.5 6.5h3M13.5 12h5M13.5 17.5h7"/>`, 'flip-rtl')
const descending = icon(svg`<path d="M7 4.5v15M3.5 16 7 19.5l3.5-3.5M13.5 6.5h7M13.5 12h5M13.5 17.5h3"/>`, 'flip-rtl')
const grip = icon(svg`<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>`)
/** The views drawn so far, whose menus' ids each start with its own number. */
let drawn = 0
/** What each field being changed held when it took the keyboard, for Escape to leave it so (D620). @type {WeakMap<HTMLInputElement, string>} */
const before = new WeakMap()

/**
 * The view's box, drawn from `source` while it holds a table: a pane's on show, or one a document holds.
 * @param {(() => void)[]} holds @param {Signal<Loaded | null>} [source]
 */
export function view(holds, source = shown) {
  const box = Object.assign(document.createElement('div'), { className: 'table-view' })
  /** @type {State} */
  const state = { box, board: signal(false), naming: signal(''), kinds: signal(''), relating: signal(false), collections: signal(/** @type {{ folder: string, name: string }[]} */ ([])), list: () => {}, id: `table-${++drawn}`, search: signal(''), formula: signal(''), wrong: signal(false) }
  state.list = () => { const dir = source.peek()?.dir; if (dir) collections(dir).then((all) => { state.collections.value = all }) }
  state.list()
  let reached = -1
  /** The bar's arrows: the keyboard to the field of the cell Jean changed after or before the last one gone to. @param {1 | -1} step */
  const go = (step) => {
    const fields = [...box.querySelectorAll('.is-jean :is(input, select)')]
    reached = reached < 0 ? (step > 0 ? 0 : fields.length - 1) : (reached + step + fields.length) % fields.length
    const field = /** @type {HTMLElement | undefined} */ (fields[reached])
    field?.focus()
  }
  holds.push(effect(() => { render(draw(source.value, state, go), box) }))
  // Escape closes a menu open in it alone, wherever the keyboard is, never the pane; ⌘Z undoes the user's last step and ⇧⌘Z does it again (D620),
  // but in a field being written in, whose own words they undo.
  box.addEventListener('keydown', (event) => {
    const one = source.peek(), undo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !/** @type {Element} */ (event.target).matches('input:not([type="checkbox"]), textarea')
    if ((event.key === 'Escape' && box.querySelector(':popover-open')) || (undo && one)) event.stopPropagation()
    if (undo && one) { event.preventDefault(); undoStep(one, event.shiftKey) }
  })
  // A menu the window doesn't hold whole by its head, as under a head the table's box cuts or in a short window, goes under or over the head,
  // where there is more room, no taller than that, its start moved in as far as it needs (D623): Chromium keeps it where it overflows, whatever its fallbacks.
  box.addEventListener('toggle', (event) => {
    const menu = /** @type {HTMLElement} */ (event.target), head = box.querySelector(`[popovertarget="${menu.id}"]`)?.getBoundingClientRect()
    if (/** @type {ToggleEvent} */ (event).newState !== 'open' || !menu.matches('.table-menu') || !head) return
    delete menu.dataset.placed
    const { left, right, top, bottom, width, height } = menu.getBoundingClientRect(), rtl = getComputedStyle(menu).direction === 'rtl', x = Math.max(8, Math.min(rtl ? head.right - width : head.left, innerWidth - width - 8))
    const room = Math.max(head.top, innerHeight - head.bottom) - 12, above = head.top > innerHeight - head.bottom
    for (const [name, px] of Object.entries({ '--at': rtl ? innerWidth - x - width : x, '--top': above ? head.top - 4 - Math.min(height, room) : head.bottom + 4, '--room': room })) menu.style.setProperty(name, `${px}px`)
    menu.toggleAttribute('data-placed', left < 0 || right > innerWidth || top < 0 || bottom > innerHeight)
  }, true)
  return box
}

/**
 * A change the user makes; one a column refuses is said, and its field shows the cell as it is again.
 * @param {Loaded} one @param {{ row?: string, set?: Record<string, unknown>, delete?: boolean }} edit @param {Event} [event]
 */
async function edit(one, edit, event) {
  try {
    await change(one, [edit], 'user')
  } catch {
    notify(t('tables.wrong'))
    await reread(one)
    event?.target instanceof HTMLElement && event.target.blur()
  }
}

/** @param {Loaded} one @param {Parameters<typeof reshapeTable>[1]} edit */
const shape = (one, edit) => reshapeTable(one, edit).catch(() => reread(one))
/** @param {Event} event */
const typed = (event) => /** @type {HTMLInputElement} */ (event.target).value
/** The rows in a column's order, from A to Z or from Z to A, empty cells last, kept as the rows' order (D547). @param {Loaded} one @param {Property} property @param {'ascending' | 'descending'} direction */
const sort = (one, property, direction) => shape(one, { order: query(one.table, one.rows, { sort: [{ property: property.id, direction }], locale: locale.value, names: one.names }).rows.map((row) => row.id) })
/** How a rule compares, as its column's kind allows (D567). @param {Property} property @returns {Rule['op'][]} */
const opsOf = ({ type }) => (type === 'checkbox' ? ['is'] : [...(type === 'number' || DATED.test(type) || type === 'select' || type === 'status' ? [] : /** @type {const} */ (['contains', 'does-not-contain'])),
  'is', 'is-not', ...(type === 'number' || DATED.test(type) ? /** @type {const} */ (['greater-than', 'less-than']) : []), 'is-empty', 'is-not-empty'])
/** A new rule on a column, its first way to compare, a box ticked. @param {Property} property @returns {Rule} */
const ruleOn = (property) => ({ property: property.id, op: opsOf(property)[0], ...(property.type === 'checkbox' && { value: true }) })

/** @param {Loaded | null} one @param {State} state @param {(step: 1 | -1) => void} go */
function draw(one, state, go) {
  if (!one) return nothing
  const { board, search } = state
  const columns = one.table.properties.filter((property) => !property.deleted)
  const lanes = one.table.views.find((view) => view.type === 'board' && columns.some((property) => property.id === view.group))
  // What the table view filters, hides and works out (D567): a rule on a column gone is dropped, one with nothing to compare with keeps every row.
  const settings = one.table.views.find((view) => view.type === 'table'), hidden = settings?.hidden ?? [], calculate = settings?.calculate ?? {}
  const rules = (settings?.filter?.and ?? []).filter((rule) => columns.some((property) => property.id === rule.property))
  const kept = filterOf(one.table), words = searchable(search.value.trim())
  const rows = query(one.table, one.rows, { ...(kept.length && { filter: { and: kept } }), locale: locale.value, names: one.names }).rows
    .filter((row) => !words || columns.some((property) => searchable(`${textOf(row, property, { names: one.names })} ${said(row, property, one.names)}`).includes(words)))
  // Each change made from the table view as it is by then, so that one made before the last is drawn isn't lost.
  const view = (/** @type {(view: View) => Partial<View>} */ edit) => shape(one, { view: edit })
  /** The filter's rules: each a column, how it compares and with what. @param {(rules: Rule[]) => Rule[]} change */
  const filter = (change) => view((now) => ({ filter: { and: change((now.filter?.and ?? []).filter((rule) => columns.some((property) => property.id === rule.property))) } }))
  const ruled = html`${rules.map((rule, i) => {
    const property = /** @type {Property} */ (columns.find((one) => one.id === rule.property)), set = (/** @type {Partial<Rule>} */ edit) => filter((all) => all.map((one, j) => (i === j ? { ...one, ...edit } : one)))
    return html`<div class="table-rule"><select aria-label=${t('tables.column')} .value=${live(rule.property)} @change=${(/** @type {Event} */ e) => set(ruleOn(/** @type {Property} */ (columns.find((one) => one.id === typed(e)))))}>${columns.map((one) => html`<option value=${one.id} ?selected=${one === property}>${one.name}</option>`)}</select>
      ${keyed(property.id, html`<select aria-label=${t('tables.compare')} .value=${live(rule.op)} @change=${(/** @type {Event} */ e) => set({ op: /** @type {Rule['op']} */ (typed(e)) })}>${opsOf(property).map((op) => html`<option value=${op} ?selected=${op === rule.op}>${t(`tables.op.${DATED.test(property.type) && op.endsWith('-than') ? (op === 'less-than' ? 'before' : 'after') : op}`)}</option>`)}</select>
      ${rule.op.endsWith('empty') ? nothing : against(property, rule.value, (value) => set({ value }))}`)}
      <button type="button" class="icon-button" aria-label=${t('action.remove')} @click=${() => filter((all) => all.filter((_, j) => j !== i))}>${icons.trash}</button></div>`
  })}<button type="button" @click=${() => filter((all) => [...all, ruleOn(columns[0])])}>${icons.plus}${t('tables.addFilter')}</button>`
  const sorting = html`${columns.map((property) => html`<div class="table-line" role="group" aria-label=${property.name}>${GLYPHS[property.type]}<span dir="auto">${property.name}</span>
    <button type="button" class="icon-button" aria-label=${t('tables.ascending')} @click=${() => sort(one, property, 'ascending')}>${ascending}</button><button type="button" class="icon-button" aria-label=${t('tables.descending')} @click=${() => sort(one, property, 'descending')}>${descending}</button></div>`)}`
  /** A tool of the bar, lit while what it sets holds, opening its menu. @param {string} name @param {string} label @param {unknown} glyph @param {unknown} content @param {boolean} [on] */
  const tool = (name, label, glyph, content, on = false) => html`<button type="button" class="icon-button" aria-label=${label} popovertarget=${`${state.id}-${name}`} ?data-on=${on}>${glyph}</button>
    <div id=${`${state.id}-${name}`} class="menu table-menu table-panel" popover>${content}</div>`
  const marked = unkept(one)
  // The cells and rows Jean changed, as "row column" and by row.
  const fresh = new Set(marked.flatMap((line) => [line.row, ...Object.keys(line.set ?? {}).map((id) => `${line.row} ${id}`)]))
  const cells = marked.reduce((count, line) => count + Math.max(1, Object.keys(line.set ?? {}).length), 0)
  // Search shows from five rows, as on the Creations page; Escape empties it, leaving the pane open.
  return html`${marked.length ? reviewBar({
      label: t('tables.review'), count: t('tables.changed', { count: cells, name: assistantName() }), go: cells > 1 ? go : null, previous: t('tables.previous'), next: t('tables.next'),
      accept: () => accept(one), reject: () => reject(one), acceptAll: t('tables.acceptAll'), rejectAll: t('tables.rejectAll'),
    }) : nothing}
    <div class="table-bar">
      <input class="table-name" dir="auto" aria-label=${t('tables.tableName')} .value=${live(one.table.name)} @change=${(/** @type {Event} */ e) => shape(one, { name: typed(e) })}>
      <div class="table-tools">${one.rows.length > 4 || search.value ? html`<label class="creations-find">${icons.search}<input type="search" dir="auto" placeholder=${t('tables.search')} aria-label=${t('tables.search')}
        .value=${live(search.value)} @input=${(/** @type {Event} */ e) => { search.value = typed(e) }} @keydown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && search.value && !e.isComposing) { e.stopPropagation(); search.value = '' } }}></label>` : nothing}
        ${tool('filter', t('tables.filter'), funnel, ruled, kept.length > 0)}${tool('sort', t('tables.sort'), arrows, sorting)}
        ${tool('settings', t('settings.title'), sliders, html`${lanes ? html`<h3>${t('tables.views')}</h3>${[false, true].map((on) => html`<button type="button" aria-current=${String(board.value === on)}
          @click=${() => { board.value = on }}>${on ? icons.board : icons.table}${t(on ? 'tables.board' : 'tables.table')}${board.value === on ? icons.check : nothing}</button>`)}` : nothing}
          <h3>${t('tables.shown')}</h3>${columns.map((property) => html`<label class="table-line"><input type="checkbox" .checked=${live(!hidden.includes(property.id))} ?disabled=${property === titleOf(one.table)}
            @change=${(/** @type {Event} */ e) => view(({ hidden = [] }) => ({ hidden: /** @type {HTMLInputElement} */ (e.target).checked ? hidden.filter((id) => id !== property.id) : [...hidden, property.id] }))}>${GLYPHS[property.type]}<span dir="auto">${property.name}</span></label>`)}
          <h3>${t('tables.filter')}</h3>${ruled}<h3>${t('tables.sort')}</h3>${sorting}`, hidden.length > 0)}
      </div></div>
    ${board.value && lanes ? lanesOf(one, lanes, columns, rows, hidden, fresh) : grid(one, columns, columns.filter((property) => !hidden.includes(property.id)), rows, calculate, fresh, state)}`
}

/**
 * The table: the columns shown, the rows the view keeps, each column's foot working out what `calculate` asks (D567).
 * @param {Loaded} one @param {Property[]} columns @param {Property[]} shown @param {Row[]} rows @param {NonNullable<View['calculate']>} calculate @param {Set<string>} fresh @param {State} state
 */
function grid(one, columns, shown, rows, calculate, fresh, state) {
  const { box, naming, kinds, relating, list } = state
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
    const table = await shape(one, { add: { name: (collection !== one.folder && targets.find((other) => other.folder === collection)?.name) || t(`tables.kind.${type}`), type, at, collection } })
    const made = table?.properties.find((property) => !one.table.properties.some((had) => had.id === property.id))
    if (made) rename(made.id)
  }
  /** The kind picked in the last head's list, a relation's as "relation <its collection>". @param {Event} event */
  const column = (event) => {
    const [type, collection] = typed(event).split(' ')
    ;/** @type {HTMLSelectElement} */ (event.target).value = ''
    if (type) added(type, undefined, collection)
  }
  /** A row moved before or after another, as the rows' order. @param {string} id @param {string} to @param {boolean} after */
  const move = async (id, to, after) => {
    const ids = one.rows.map((row) => row.id).filter((other) => other !== id)
    if (id === to || ids.length === one.rows.length) return
    ids.splice(ids.indexOf(to) + (after ? 1 : 0), 0, id)
    await shape(one, { order: ids })
  }
  /** No line where a dragged row would go any more. */
  const left = () => { for (const row of box.querySelectorAll('[data-drop]')) delete /** @type {HTMLElement} */ (row).dataset.drop }
  /** Where a row dragged over this one goes: before it over its first half, after it over the other, a line showing which. @param {DragEvent} event */
  const over = (event) => {
    if (!event.dataTransfer?.types.includes('text/x-row')) return
    event.preventDefault()
    const row = /** @type {HTMLElement} */ (event.currentTarget), { top, height } = row.getBoundingClientRect()
    if (!row.dataset.drop) left()
    row.dataset.drop = event.clientY < top + height / 2 ? 'before' : 'after'
  }
  /** @param {DragEvent} event @param {string} to */
  const dropped = (event, to) => {
    const id = event.dataTransfer?.getData('text/x-row'), after = /** @type {HTMLElement} */ (event.currentTarget).dataset.drop === 'after'
    left()
    if (!id) return
    event.preventDefault()
    move(id, to, after)
  }
  /** Its handle dragged, the row goes with the pointer. @param {DragEvent} event @param {string} id */
  const lift = (event, id) => {
    const row = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (event.currentTarget).closest('tr')), { left: x, top: y } = row.getBoundingClientRect()
    event.dataTransfer?.setData('text/x-row', id)
    event.dataTransfer?.setDragImage(row, event.clientX - x, event.clientY - y)
  }
  /** The arrows move a row by one, the keyboard staying on its handle. @param {KeyboardEvent} event @param {number} i */
  const step = (event, i) => {
    const by = /** @type {Record<string, number>} */ ({ ArrowUp: -1, ArrowDown: 1 })[event.key], [row, to] = [rows[i], by && rows[i + by]]
    if (!to) return
    event.preventDefault()
    move(row.id, to.id, by > 0).then(() => focus(`tr[data-row="${CSS.escape(row.id)}"] .table-grip button`))
  }
  /** Where a column dragged over this head goes: before it over the half its line starts in, after it over the other, a line showing which; taken on
   * entering too, as WebKit asks of a place to drop. @param {DragEvent} event */
  const aside = (event) => {
    if (!event.dataTransfer?.types.includes('text/x-column')) return
    event.preventDefault()
    const th = /** @type {HTMLElement} */ (event.currentTarget), { left: x, width } = th.getBoundingClientRect()
    if (!th.dataset.drop) left()
    th.dataset.drop = (event.clientX < x + width / 2) !== (getComputedStyle(th).direction === 'rtl') ? 'before' : 'after'
  }
  /** A column moved before or after another (D580). @param {string} id @param {string | undefined} to @param {boolean} after */
  const shift = (id, to, after) => to && to !== id && shape(one, { move: { id, to, after } })
  /** @param {DragEvent} event @param {string} to */
  const put = (event, to) => {
    const id = event.dataTransfer?.getData('text/x-column'), after = /** @type {HTMLElement} */ (event.currentTarget).dataset.drop === 'after'
    left()
    if (!id) return
    event.preventDefault()
    shift(id, to, after)
  }
  /** A page of a column's menu: its actions, the kinds it can be, or the collections a relation can be to. @param {string} id @param {string} [column] @param {boolean} [relation] */
  const turn = (id, column = '', relation = false) => {
    kinds.value = column
    relating.value = relation
    if (relation) list()
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (box.querySelector(`#${id} ${column ? '[aria-current="true"]' : '.submenu'}`) ?? box.querySelector(`#${id} hr + button`))?.focus())
  }

  /** A column's head, its menu under it, opened by a click or a right click, which Escape closes, leaving the pane; its name, which a long one cuts short on screen, whole in its tip. @param {Property} property @param {number} i */
  const heading = (property, i) => {
    const menu = `${state.id}-${i}`, place = one.table.properties.indexOf(property)
    const row = (/** @type {unknown} */ glyph, /** @type {string} */ label, /** @type {() => unknown} */ act) => html`<button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${act}>${glyph}${label}</button>`
    /** A kind, or a collection a relation is to, ticked when it is the column's. @param {unknown} glyph @param {unknown} label @param {boolean} on @param {() => Promise<unknown>} act */
    const pick = (glyph, label, on, act) => html`<button type="button" aria-current=${String(on)} popovertarget=${menu} popovertargetaction="hide" @click=${() => on || act().catch(() => reread(one))}>${glyph}${label}${on ? icons.check : nothing}</button>`
    const kind = (/** @type {string} */ type) => pick(GLYPHS[type], t(`tables.kind.${type}`), type === property.type, () => retype(one, property.id, type))
    const to = property.type === 'relation' ? property.collection : ''
    const target = (/** @type {{ folder: string, name: string }} */ { folder, name }) => pick(GLYPHS.relation, html`<span dir="auto">${name}</span>`, folder === to, () => retype(one, property.id, 'relation', folder))
    // Dragged by its head (the button: WebKit drags nothing from inside one) to another's side, or moved one place from its menu, so that
    // moving needs no drag (WCAG 2.5.7).
    return html`<th scope="col" data-column=${property.id} @dragenter=${aside} @dragover=${aside} @drop=${(/** @type {DragEvent} */ e) => put(e, property.id)} @dragend=${left}>${naming.value === property.id
        ? html`<input dir="auto" aria-label=${t('tables.columnName')} .value=${property.name}
          @keydown=${(/** @type {KeyboardEvent} */ e) => named(e, property)} @blur=${(/** @type {FocusEvent} */ e) => named(e, property)}>`
        : html`<button type="button" class="table-head" popovertarget=${menu} title=${property.name} draggable="true" @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData('text/x-column', property.id)} @contextmenu=${(/** @type {MouseEvent} */ e) => { e.preventDefault(); /** @type {HTMLElement} */ (e.currentTarget).click() }}>${GLYPHS[property.type]}<span dir="auto">${property.name}</span></button>`}
      <div id=${menu} class="menu table-menu" popover
        @toggle=${(/** @type {ToggleEvent} */ e) => { if (e.newState === 'closed' && kinds.peek() === property.id) kinds.value = '' }}>${kinds.value === property.id && relating.value
        ? html`<button type="button" class="back" @click=${() => turn(menu, property.id)}>${icons.back}${t('tables.kind.relation')}</button><hr>${targets.map(target)}`
        : kinds.value === property.id
        ? html`<button type="button" class="back" @click=${() => turn(menu)}>${icons.back}${t('tables.type')}</button><hr>
          ${(KINDS.includes(property.type) || to ? KINDS : [property.type, ...KINDS]).map(kind)}<hr>
          <button type="button" class="submenu" aria-current=${String(Boolean(to))} @click=${() => turn(menu, property.id, true)}>${GLYPHS.relation}${t('tables.kind.relation')}<span class="menu-value" dir="auto">${to
            && (targets.find((other) => other.folder === to)?.name ?? one.related?.get(to)?.table.name)}</span>${icons.chevron}</button>`
        : html`${row(icons.compose, t('action.rename'), () => rename(property.id))}
          <button type="button" class="submenu" @click=${() => turn(menu, property.id)}>${GLYPHS[property.type]}${t('tables.type')}<span class="menu-value">${t(`tables.kind.${property.type}`)}</span>${icons.chevron}</button><hr>
          ${row(ascending, t('tables.ascending'), () => sort(one, property, 'ascending'))}${row(descending, t('tables.descending'), () => sort(one, property, 'descending'))}<hr>
          ${row(icons.back, t('tables.insertStart'), () => added('text', place))}${row(icons.arrow, t('tables.insertEnd'), () => added('text', place + 1))}<hr>
          ${[-1, 1].map((by) => html`<button type="button" popovertarget=${menu} popovertargetaction="hide" ?disabled=${!shown[i + by]} @click=${() => shift(property.id, shown[i + by]?.id, by > 0)}>${by < 0 ? icons.back : icons.arrow}${t(by < 0 ? 'tables.moveStart' : 'tables.moveEnd')}</button>`)}<hr>
          <button type="button" class="danger" popovertarget=${menu} popovertargetaction="hide" ?disabled=${columns.length < 2} @click=${() => shape(one, { remove: property.id })}>${icons.trash}${t('action.delete')}</button>`}</div>
    </th>`
  }

  /** A column's foot: what it works out over the rows shown, picked from its menu, none at first (D567). @param {Property} property @param {number} i */
  const foot = (property, i) => {
    const menu = `${state.id}-foot-${i}`, how = calculate[property.id] ?? '', word = (/** @type {string} */ to) => (to === 'percent' && property.type === 'checkbox' ? 'ticked' : to || 'none')
    return html`<td><button type="button" class="table-total" popovertarget=${menu}>${how ? html`<span class="muted">${t(`tables.calc.${word(how)}`)}</span>
      ${new Intl.NumberFormat(intlLocales(), how === 'sum' ? {} : { style: 'percent' }).format(total(rows, property, how))}` : t('tables.calculate')}</button>
      <div id=${menu} class="menu table-menu" popover>${(/** @type {const} */ (['', 'sum', 'percent'])).filter((to) => to !== 'sum' || property.type === 'number' || property.type === 'formula').map((to) => html`<button type="button"
        aria-current=${String(how === to)} popovertarget=${menu} popovertargetaction="hide" @click=${() => shape(one, { view: (now) => ({ calculate: { ...now.calculate, [property.id]: to || undefined } }) })}>${t(`tables.calc.${word(to)}`)}${how === to ? icons.check : nothing}</button>`)}</div></td>`
  }

  const blank = { [columns[0].id]: columns[0].type === 'checkbox' ? false : null }, add = () => edit(one, { set: blank }).then(() => focus('tbody tr:last-child :is(input, select)'))
  /** A row right under another, a copy with the cells its columns take, or a new one whose first field takes the keyboard; undone, it goes (D620, D625). @param {Row} row @param {boolean} [copy] */
  const twin = async (row, copy = true) => {
    const cells = !copy ? {} : Object.fromEntries(columns.flatMap((property) => (property.id in row.cells && !checkCell(property, row.cells[property.id]) ? [[property.id, row.cells[property.id]]] : [])))
    const [id] = await change(one, [{ set: Object.keys(cells).length ? cells : blank }], 'user').catch(() => (notify(t('tables.wrong')), [])), ids = one.rows.map((other) => other.id)
    ids.splice(ids.indexOf(row.id) + 1, 0, id)
    if (id) await reshapeTable(one, { order: ids }, false).catch(() => reread(one)).then(() => copy || focus(`tr[data-row="${CSS.escape(id)}"] :is(input, select)`))
  }
  /** A cell's field takes the keyboard, the caret at the end of its words. @param {Element | null | undefined} td */
  const into = (td) => {
    const field = /** @type {HTMLInputElement | null | undefined} */ (td?.querySelector('input, select')), formula = /** @type {HTMLElement | null | undefined} */ (td?.querySelector('[data-formula]'))
    if (formula) return open(String(formula.dataset.formula))
    field?.focus()
    try { field?.setSelectionRange(field.value.length, field.value.length) } catch {}
  }
  /** A Formula's dialog, over the page, its formula's words taking the keyboard, the caret at their end (D621). @param {string} id */
  const open = (id) => {
    state.formula.value = id
    state.wrong.value = false
    requestAnimationFrame(() => import('../../ui/dialogs.js').then(() => {
      const dialog = /** @type {HTMLDialogElement | null} */ (box.querySelector('dialog.table-formula')), words = dialog?.querySelector('textarea')
      dialog?.showModal()
      words?.focus()
      words?.setSelectionRange(words.value.length, words.value.length)
    }))
  }
  /** Save keeps the formula once it can be read, the dialog then closing; Escape or Close leave it as it was. @param {SubmitEvent} event @param {Property} property */
  const save = (event, property) => {
    const text = /** @type {HTMLFormElement} */ (event.target).querySelector('textarea')?.value.trim() ?? ''
    try { if (text) compile(text, columns) } catch { event.preventDefault(); state.wrong.value = true; return }
    if (text !== (property.formula ?? '')) shape(one, { formula: { id: property.id, text } })
  }
  const editing = columns.find((property) => property.type === 'formula' && property.id === state.formula.value)
  /**
   * A cell selected, its box taking the keyboard, or being changed, its field taking it (D620): Enter changes the one selected, then keeps the change
   * and selects the cell under it; Escape leaves it as it was, selected; the arrows select the next, the end of a row going on to the start of the next.
   * @param {KeyboardEvent} event
   */
  const keys = (event) => {
    const at = /** @type {HTMLElement} */ (event.target), td = /** @type {HTMLElement | null} */ (at.closest('td[tabindex]')), cells = [...box.querySelectorAll('tbody td[tabindex]')]
    if (!td || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    const [w, rtl] = [shown.length, getComputedStyle(td).direction === 'rtl'], by = at === td ? /** @type {Record<string, number>} */ ({ ArrowUp: -w, ArrowDown: w, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 })[event.key]
      : ({ Enter: w, Escape: 0 })[event.key]
    if (event.key === 'Escape' && at instanceof HTMLInputElement && before.has(at)) at.value = /** @type {string} */ (before.get(at))
    if (at === td && event.key === 'Enter') into(td)
    else if (by === undefined) return
    else /** @type {HTMLElement} */ (cells[cells.indexOf(td) + by] ?? td).focus()
    event.preventDefault()
    event.stopPropagation()
  }
  return html`<div class="table-scroll"><table class="table-grid">
      <thead><tr><td class="table-grip"></td>${shown.map(heading)}<th scope="col"><select class="table-add-column" aria-label=${t('tables.addColumn')} @change=${column} @focus=${list} @pointerenter=${list}>
        <option value="">+</option>${KINDS.map((type) => html`<option value=${type}>${t(`tables.kind.${type}`)}</option>`)}
        <optgroup label=${t('tables.kind.relation')}>${targets.map(({ folder, name }) => html`<option value=${`relation ${folder}`}>${name}</option>`)}</optgroup>
      </select></th></tr></thead>
      <tbody @dragleave=${(/** @type {DragEvent} */ e) => !box.contains(/** @type {Node | null} */ (e.relatedTarget)) && left()} @keydown=${keys}
        @click=${(/** @type {MouseEvent} */ e) => /** @type {Element} */ (e.target).matches('td[tabindex], [data-formula]') && into(/** @type {Element} */ (e.target).closest('td'))}
        @focusin=${(/** @type {FocusEvent} */ e) => e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && before.set(e.target, e.target.value)}>${rows.map((row, i) => html`<tr data-row=${row.id} class=${fresh.has(row.id) ? 'is-jean' : ''}
        @dragover=${over} @drop=${(/** @type {DragEvent} */ e) => dropped(e, row.id)}>
        <td class="table-grip"><button type="button" class="icon-button" draggable="true" aria-label=${t('tables.moveRow')} aria-keyshortcuts="ArrowUp ArrowDown" popovertarget=${`${state.id}-row-${i}`}
          @dragstart=${(/** @type {DragEvent} */ e) => lift(e, row.id)} @dragend=${left} @keydown=${(/** @type {KeyboardEvent} */ e) => step(e, i)}
          @contextmenu=${(/** @type {MouseEvent} */ e) => { e.preventDefault(); /** @type {HTMLElement} */ (e.currentTarget).click() }}>${grip}</button>
          <div id=${`${state.id}-row-${i}`} class="menu table-menu" popover><button type="button" popovertarget=${`${state.id}-row-${i}`} popovertargetaction="hide" @click=${() => twin(row, false)}>${icons.plus}${t('tables.insertBelow')}</button>
            <button type="button" popovertarget=${`${state.id}-row-${i}`} popovertargetaction="hide" @click=${() => twin(row)}>${icons.copy}${t('tables.duplicate')}</button>
            <button type="button" class="danger" popovertarget=${`${state.id}-row-${i}`} popovertargetaction="hide" @click=${() => edit(one, { row: row.id, delete: true })}>${icons.trash}${t('action.delete')}</button></div></td>
        ${shown.map((property) => html`<td tabindex="-1" class=${fresh.has(`${row.id} ${property.id}`) ? 'is-jean' : ''}>${cell(one, row, property)}</td>`)}<td></td>
      </tr>`)}</tbody>
      <tfoot><tr><td class="table-grip"></td><td colspan=${shown.length + 1}><button type="button" class="table-add" @click=${add}>${icons.plus}${t('tables.addRow')}</button></td></tr>
        <tr><td class="table-grip"></td>${shown.map(foot)}<td></td></tr></tfoot>
    </table></div>
    ${editing ? html`<dialog class="sheet table-formula" aria-label=${editing.name} @close=${() => { state.formula.value = '' }} @keydown=${(/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && e.stopPropagation()}>
      <form method="dialog" @submit=${(/** @type {SubmitEvent} */ e) => save(e, editing)}>
        <header class="dialog-head"><h2 dir="auto">${GLYPHS.formula}${editing.name}</h2><button type="button" class="icon-button" aria-label=${t('action.close')} @click=${() => /** @type {HTMLDialogElement | null} */ (box.querySelector('dialog.table-formula'))?.close()}>${icons.close}</button></header>
        <textarea dir="auto" rows="4" spellcheck="false" aria-label=${editing.name} placeholder=${t('tables.yourFormula')} .value=${editing.formula ?? ''} @input=${() => { state.wrong.value = false }}></textarea>
        <p class="muted small">${t('tables.formulaHint')}</p>${state.wrong.value ? html`<p class="table-formula-wrong" role="alert">${t('tables.formulaWrong')}</p>` : nothing}
        <footer class="dialog-foot"><button class="button primary">${t('tables.save')}</button></footer>
      </form></dialog>` : nothing}
    ${!one.rows.length ? html`<p class="muted small">${t('tables.empty')}</p>` : rows.length || !state.search.value.trim() ? nothing
      : html`<p class="creations-none">${t('tables.noMatch', { words: state.search.value.trim() })}<button class="button" @click=${() => { state.search.value = ''; /** @type {HTMLElement | null} */ (state.box.querySelector('.creations-find input'))?.focus() }}>${t('tables.clear')}</button></p>`}`
}

/**
 * A cell as its column's kind changes it: a box to tick, a number, a date, a step or a choice, a few
 * choices, text; what Jean works out, and files, as they are.
 * @param {Loaded} one @param {Row} row @param {Property} property
 */
function cell(one, row, property) {
  const value = valueOf(row, property)
  const set = (/** @type {unknown} */ next, /** @type {Event} */ event) => edit(one, { row: row.id, set: { [property.id]: next } }, event)
  const read = (/** @type {Event} */ event) => /** @type {HTMLInputElement} */ (event.target)
  const label = property.name
  switch (property.type) {
    case 'checkbox': return html`<input type="checkbox" aria-label=${label} .checked=${live(value === true)} @change=${(/** @type {Event} */ e) => set(read(e).checked, e)}>`
    case 'number': return html`<input type="number" step="any" aria-label=${label} .value=${live(value === null ? '' : String(value))}
      @change=${(/** @type {Event} */ e) => set(read(e).value === '' ? null : read(e).valueAsNumber, e)}>`
    case 'date': return html`<input type="date" aria-label=${label} .value=${live(String(value ?? '').slice(0, 10))} @change=${(/** @type {Event} */ e) => set(read(e).value || null, e)}>`
    case 'status':
    case 'relation':
    case 'select': return choice(one, row, property)
    case 'multi-select': return html`<input dir="auto" aria-label=${label} .value=${live(Array.isArray(value) ? value.join(', ') : '')}
      @change=${(/** @type {Event} */ e) => set(read(e).value.split(/[,،、]/).map((one) => one.trim()).filter(Boolean), e)}>`
    case 'formula': return html`<span dir="auto" data-formula=${property.id}>${said(row, property, one.names)}</span>`
    case 'files':
    case 'created-by':
    case 'changed-by': return html`<span dir="auto">${textOf(row, property)}</span>`
    case 'created-at':
    case 'changed-at': return html`<time datetime=${String(value)}>${new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)))}</time>`
    default: return html`<input dir="auto" type=${({ link: 'url', email: 'email', phone: 'tel' })[/** @type {string} */ (property.type)] ?? 'text'} aria-label=${label}
      .value=${live(textOf(row, property))} @change=${(/** @type {Event} */ e) => set(read(e).value.trim() || null, e)}>`
  }
}

/**
 * What a rule compares with, as its column's kind takes it (D567): ticked or not, a choice, a number, a date, else text.
 * @param {Property} property @param {unknown} value @param {(value: unknown) => void} set
 */
function against(property, value, set) {
  const now = String(value ?? ''), change = (/** @type {Event & { target: HTMLInputElement }} */ { target: field }) => set(property.type === 'checkbox' ? field.value === 'true' : field.type === 'number' && field.value ? field.valueAsNumber : field.value)
  if (property.type === 'checkbox' || property.options) return html`<select aria-label=${property.name} .value=${live(now)} @change=${change}>${(property.options
    ? [['', '—'], ...property.options.map(({ name }) => [name, name])] : [['true', t('tables.yes')], ['false', t('tables.no')]]).map(([id, name]) => html`<option value=${id} ?selected=${id === now}>${name}</option>`)}</select>`
  return html`<input dir="auto" type=${property.type === 'number' ? 'number' : DATED.test(property.type) ? 'date' : 'text'} aria-label=${property.name} .value=${now} @change=${change}>`
}

/**
 * A step to pick among a status's, a row among those of the collection a relation is to, by its name, one gone showing as none (D560),
 * or a choice among a select's, where typing a new one adds it (D491).
 * @param {Loaded} one @param {Row} row @param {Property} property
 */
function choice(one, row, property) {
  const value = /** @type {string | null} */ (valueOf(row, property))
  const set = (/** @type {Event} */ event) => edit(one, { row: row.id, set: { [property.id]: /** @type {HTMLInputElement} */ (event.target).value.trim() || null } }, event)
  const options = property.options ?? []
  const picks = property.type === 'relation' ? (one.related?.get(String(property.collection))?.rows ?? []).map((other) => [other.id, one.names?.get(other.id) || t('tables.unnamed')])
    : options.map((option) => [option.name, option.name])
  if (property.type !== 'select') return html`<select aria-label=${property.name} .value=${live(picks.some(([id]) => id === value) ? value : '')} @change=${set}>
      <option value="">—</option>${picks.map(([id, name]) => html`<option value=${id} ?selected=${id === value}>${name}</option>`)}
    </select>`
  const list = `choices-${one.table.id}-${property.id}`
  return html`<input dir="auto" list=${list} aria-label=${property.name} .value=${live(value ?? '')} @change=${set}>
    <datalist id=${list}>${options.map((option) => html`<option value=${option.name}></option>`)}</datalist>`
}

/** A cell as a card says it, in the user's language (./export.js). @param {Row} row @param {Property} property @param {Map<string, string>} [names] */
const said = (row, property, names) => told(row, property, { locales: intlLocales(), labels: { yes: t('tables.yes'), no: t('tables.no') }, names })

/**
 * The board: a lane for each step or choice, in their order, then one for rows with none, of the rows the view keeps; each card its row's
 * name, two of its other cells shown, and its own step or choice to move it; dragged, it moves to the lane it is dropped in.
 * @param {Loaded} one @param {View} lanes @param {Property[]} columns @param {Row[]} rows @param {string[]} hidden @param {Set<string>} fresh
 */
function lanesOf(one, lanes, columns, rows, hidden, fresh) {
  const by = columns.find((property) => property.id === lanes.group)
  if (!by) return nothing
  const { groups = [] } = query(one.table, rows, { group: { property: by.id }, locale: locale.value })
  const title = columns.find((property) => property.type === 'text') ?? columns[0]
  const others = columns.filter((property) => property !== title && property !== by && !hidden.includes(property.id)).slice(0, 2)
  const drop = (/** @type {unknown} */ value) => (/** @type {DragEvent} */ event) => {
    event.preventDefault()
    const row = event.dataTransfer?.getData('text/x-row')
    if (row) edit(one, { row, set: { [by.id]: value } })
  }
  return html`<div class="table-board">${groups.map(({ value, rows }) => {
    const name = value === null ? t('tables.none', { column: by.name }) : String(value)
    return html`<section class="table-lane" aria-label=${name} @dragover=${(/** @type {DragEvent} */ e) => e.preventDefault()} @drop=${drop(value)}>
      <h3><span dir="auto">${name}</span> <span class="muted">${new Intl.NumberFormat(intlLocales()).format(rows.length)}</span></h3>
      ${rows.map((row) => html`<article class=${`table-card${fresh.has(row.id) ? ' is-jean' : ''}`} draggable="true"
        @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData('text/x-row', row.id)}>
        <strong dir="auto">${textOf(row, title) || '—'}</strong>
        ${others.map((property) => (valueOf(row, property, one.names) === null ? nothing : html`<span class="table-field"><span class="muted" dir="auto">${property.name}</span> <span dir="auto">${said(row, property, one.names)}</span></span>`))}
        ${choice(one, row, by)}
      </article>`)}
    </section>`
  })}</div>`
}
