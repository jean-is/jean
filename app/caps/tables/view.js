// A table's view beside the conversation (D491): the table on show (./tables.js) as a table, each cell changed
// in place as its column's kind asks, or as a board grouped by its status or a select, each card moved by its
// own choice or dragged to another lane. Jean's changes the user hasn't accepted are marked, under the bar over them (ui/review.js, D505).
// Its heads stay on top as its rows scroll, each its kind's glyph and its name, opening the column's menu: renamed in its head,
// made another kind, the rows sorted by it, a column added before or after it, or taken away (D494, D547); the last head adds one.
// A relation is to this collection or another of the project's, picked from Type's or the last head's list, and its cell picks a row there by its name (D560).
// A row is moved by its handle at its start, shown with the pointer or the keyboard on it: dragged, or with the arrows. Its
// name changes above it, in the pane as in a document that holds it. lit-html, in Jean's own document, redrawn as the table
// changes here or by the brain.
import { html, svg, nothing, render } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { t, locale, intlLocales } from '../../core/i18n.js'
import { notify, assistantName } from '../../ui/state.js'
import { reviewBar } from '../../ui/review.js'
import { icons, icon } from '../../ui/menu-icons.js'
import { shown, change, unkept, accept, reject, reread, reshapeTable, retype, collections } from './tables.js'
import { query, valueOf } from './query.js'
import { textOf } from './export.js'

/** @import { Property, View } from './table.js' */
/** @import { Row } from './changes.js' */
/** @import { Loaded } from './tables.js' */
/** @import { Signal } from '@preact/signals-core' */
/**
 * What a view keeps while it is drawn: its box, whether it shows the board, the column whose name is being changed, the one whose
 * menu lists the kinds, whether it lists the collections a relation can be to then, the project's collections, read again by `list()`,
 * and what its menus' ids start with.
 * @typedef {{ box: HTMLElement, board: Signal<boolean>, naming: Signal<string>, kinds: Signal<string>, relating: Signal<boolean>, collections: Signal<{ folder: string, name: string }[]>, list: () => void, id: string }} State
 */

/** The kinds of column the user adds or makes one, in the order they are offered. */
const KINDS = ['text', 'number', 'date', 'select', 'multi-select', 'checkbox', 'link', 'email', 'phone']
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
  'created-by': who, 'changed-by': who, 'created-at': when, 'changed-at': when,
})
/** Sorting from A to Z, the bars growing; from Z to A; and a row's handle. */
const ascending = icon(svg`<path d="M7 19.5v-15M3.5 8 7 4.5 10.5 8M13.5 6.5h3M13.5 12h5M13.5 17.5h7"/>`, 'flip-rtl')
const descending = icon(svg`<path d="M7 4.5v15M3.5 16 7 19.5l3.5-3.5M13.5 6.5h7M13.5 12h5M13.5 17.5h3"/>`, 'flip-rtl')
const grip = icon(svg`<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>`)
/** The views drawn so far, whose menus' ids each start with its own number. */
let drawn = 0

/**
 * The view's box, drawn from `source` while it holds a table: the preview's on show, or one a document holds.
 * @param {(() => void)[]} holds @param {Signal<Loaded | null>} [source]
 */
export function view(holds, source = shown) {
  const box = Object.assign(document.createElement('div'), { className: 'table-view' })
  /** @type {State} */
  const state = { box, board: signal(false), naming: signal(''), kinds: signal(''), relating: signal(false), collections: signal(/** @type {{ folder: string, name: string }[]} */ ([])), list: () => {}, id: `table-${++drawn}` }
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

/** @param {Loaded | null} one @param {State} state @param {(step: 1 | -1) => void} go */
function draw(one, state, go) {
  if (!one) return nothing
  const { board } = state
  const columns = one.table.properties.filter((property) => !property.deleted)
  const lanes = one.table.views.find((view) => view.type === 'board' && columns.some((property) => property.id === view.group))
  const marked = unkept(one)
  // The cells and rows Jean changed, as "row column" and by row.
  const fresh = new Set(marked.flatMap((line) => [line.row, ...Object.keys(line.set ?? {}).map((id) => `${line.row} ${id}`)]))
  const cells = marked.reduce((count, line) => count + Math.max(1, Object.keys(line.set ?? {}).length), 0)
  return html`${marked.length ? reviewBar({
      label: t('tables.review'), count: t('tables.changed', { count: cells, name: assistantName() }), go: cells > 1 ? go : null, previous: t('tables.previous'), next: t('tables.next'),
      accept: () => accept(one), reject: () => reject(one), acceptAll: t('tables.acceptAll'), rejectAll: t('tables.rejectAll'),
    }) : nothing}
    <div class="table-bar">
      <input class="table-name" dir="auto" aria-label=${t('tables.tableName')} .value=${live(one.table.name)} @change=${(/** @type {Event} */ e) => shape(one, { name: typed(e) })}>
      ${lanes ? html`<div class="table-modes" role="group" aria-label=${t('tables.views')}>
        <button type="button" class="button subtle" aria-pressed=${String(!board.value)} @click=${() => { board.value = false }}>${t('tables.table')}</button>
        <button type="button" class="button subtle" aria-pressed=${String(board.value)} @click=${() => { board.value = true }}>${t('tables.board')}</button>
      </div>` : nothing}
    </div>
    ${board.value && lanes ? lanesOf(one, lanes, columns, fresh) : grid(one, columns, fresh, state)}`
}

/** @param {Loaded} one @param {Property[]} columns @param {Set<string>} fresh @param {State} state */
function grid(one, columns, fresh, state) {
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
  /** The rows in a column's order, from A to Z or from Z to A, empty cells last, kept as the rows' order. @param {Property} property @param {'ascending' | 'descending'} direction */
  const sort = (property, direction) => shape(one, { order: query(one.table, one.rows, { sort: [{ property: property.id, direction }], locale: locale.value, names: one.names }).rows.map((row) => row.id) })
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
    const by = /** @type {Record<string, number>} */ ({ ArrowUp: -1, ArrowDown: 1 })[event.key], [row, to] = [one.rows[i], by && one.rows[i + by]]
    if (!to) return
    event.preventDefault()
    move(row.id, to.id, by > 0).then(() => focus(`tr[data-row="${CSS.escape(row.id)}"] .table-grip button`))
  }
  /** A page of a column's menu: its actions, the kinds it can be, or the collections a relation can be to. @param {string} id @param {string} [column] @param {boolean} [relation] */
  const turn = (id, column = '', relation = false) => {
    kinds.value = column
    relating.value = relation
    if (relation) list()
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (box.querySelector(`#${id} ${column ? '[aria-current="true"]' : '.submenu'}`) ?? box.querySelector(`#${id} hr + button`))?.focus())
  }

  /** A column's head, its menu under it, which Escape closes, leaving the pane; its name, which a long one cuts short on screen, whole in its tip. @param {Property} property @param {number} i */
  const heading = (property, i) => {
    const menu = `${state.id}-${i}`, place = one.table.properties.indexOf(property)
    const row = (/** @type {unknown} */ glyph, /** @type {string} */ label, /** @type {() => unknown} */ act) => html`<button type="button" popovertarget=${menu} popovertargetaction="hide" @click=${act}>${glyph}${label}</button>`
    /** A kind, or a collection a relation is to, ticked when it is the column's. @param {unknown} glyph @param {unknown} label @param {boolean} on @param {() => Promise<unknown>} act */
    const pick = (glyph, label, on, act) => html`<button type="button" aria-current=${String(on)} popovertarget=${menu} popovertargetaction="hide" @click=${() => on || act().catch(() => reread(one))}>${glyph}${label}${on ? icons.check : nothing}</button>`
    const kind = (/** @type {string} */ type) => pick(GLYPHS[type], t(`tables.kind.${type}`), type === property.type, () => retype(one, property.id, type))
    const to = property.type === 'relation' ? property.collection : ''
    const target = (/** @type {{ folder: string, name: string }} */ { folder, name }) => pick(GLYPHS.relation, html`<span dir="auto">${name}</span>`, folder === to, () => retype(one, property.id, 'relation', folder))
    return html`<th scope="col" data-column=${property.id}>${naming.value === property.id
        ? html`<input dir="auto" aria-label=${t('tables.columnName')} .value=${property.name}
          @keydown=${(/** @type {KeyboardEvent} */ e) => named(e, property)} @blur=${(/** @type {FocusEvent} */ e) => named(e, property)}>`
        : html`<button type="button" class="table-head" popovertarget=${menu} title=${property.name}>${GLYPHS[property.type]}<span dir="auto">${property.name}</span></button>`}
      <div id=${menu} class="menu table-menu" popover @keydown=${(/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && e.stopPropagation()}
        @toggle=${(/** @type {ToggleEvent} */ e) => { if (e.newState === 'closed' && kinds.peek() === property.id) kinds.value = '' }}>${kinds.value === property.id && relating.value
        ? html`<button type="button" class="back" @click=${() => turn(menu, property.id)}>${icons.back}${t('tables.kind.relation')}</button><hr>${targets.map(target)}`
        : kinds.value === property.id
        ? html`<button type="button" class="back" @click=${() => turn(menu)}>${icons.back}${t('tables.type')}</button><hr>
          ${(KINDS.includes(property.type) || to ? KINDS : [property.type, ...KINDS]).map(kind)}<hr>
          <button type="button" class="submenu" aria-current=${String(Boolean(to))} @click=${() => turn(menu, property.id, true)}>${GLYPHS.relation}${t('tables.kind.relation')}<span class="menu-value" dir="auto">${to
            && (targets.find((other) => other.folder === to)?.name ?? one.related?.get(to)?.table.name)}</span>${icons.chevron}</button>`
        : html`${row(icons.compose, t('action.rename'), () => rename(property.id))}
          <button type="button" class="submenu" @click=${() => turn(menu, property.id)}>${GLYPHS[property.type]}${t('tables.type')}<span class="menu-value">${t(`tables.kind.${property.type}`)}</span>${icons.chevron}</button><hr>
          ${row(ascending, t('tables.ascending'), () => sort(property, 'ascending'))}${row(descending, t('tables.descending'), () => sort(property, 'descending'))}<hr>
          ${row(icons.back, t('tables.insertStart'), () => added('text', place))}${row(icons.arrow, t('tables.insertEnd'), () => added('text', place + 1))}<hr>
          <button type="button" class="danger" popovertarget=${menu} popovertargetaction="hide" ?disabled=${columns.length < 2} @click=${() => shape(one, { remove: property.id })}>${icons.trash}${t('action.delete')}</button>`}</div>
    </th>`
  }

  const add = () => edit(one, { set: { [columns[0].id]: columns[0].type === 'checkbox' ? false : null } }).then(() => focus('tbody tr:last-child :is(input, select)'))
  return html`<div class="table-scroll"><table class="table-grid">
      <thead><tr><td class="table-grip"></td>${columns.map(heading)}<th scope="col"><select class="table-add-column" aria-label=${t('tables.addColumn')} @change=${column} @focus=${list} @pointerenter=${list}>
        <option value="">+</option>${KINDS.map((type) => html`<option value=${type}>${t(`tables.kind.${type}`)}</option>`)}
        <optgroup label=${t('tables.kind.relation')}>${targets.map(({ folder, name }) => html`<option value=${`relation ${folder}`}>${name}</option>`)}</optgroup>
      </select></th></tr></thead>
      <tbody @dragleave=${(/** @type {DragEvent} */ e) => !box.contains(/** @type {Node | null} */ (e.relatedTarget)) && left()}>${one.rows.map((row, i) => html`<tr data-row=${row.id} class=${fresh.has(row.id) ? 'is-jean' : ''}
        @dragover=${over} @drop=${(/** @type {DragEvent} */ e) => dropped(e, row.id)}>
        <td class="table-grip"><button type="button" class="icon-button" draggable="true" aria-label=${t('tables.moveRow')} aria-keyshortcuts="ArrowUp ArrowDown"
          @dragstart=${(/** @type {DragEvent} */ e) => lift(e, row.id)} @dragend=${left} @keydown=${(/** @type {KeyboardEvent} */ e) => step(e, i)}>${grip}</button></td>
        ${columns.map((property) => html`<td class=${fresh.has(`${row.id} ${property.id}`) ? 'is-jean' : ''}>${cell(one, row, property)}</td>`)}
        <td><button type="button" class="icon-button" aria-label=${t('tables.deleteRow')} @click=${() => edit(one, { row: row.id, delete: true })}>${icons.trash}</button></td>
      </tr>`)}</tbody>
    </table></div>
    ${one.rows.length ? nothing : html`<p class="muted small">${t('tables.empty')}</p>`}
    <button type="button" class="button subtle table-add" @click=${add}>${icons.plus} ${t('tables.addRow')}</button>`
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

/**
 * A cell as a card says it: a date and a number as the language writes them, a box as a word, a relation's row by its name.
 * @param {Row} row @param {Property} property @param {Map<string, string>} [names]
 */
function said(row, property, names) {
  const value = valueOf(row, property)
  if (property.type === 'date' && typeof value === 'string') {
    return new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium', ...(value.includes('T') && { timeStyle: 'short' }) }).format(new Date(value.includes('T') ? value : `${value}T00:00`))
  }
  return typeof value === 'number' ? new Intl.NumberFormat(intlLocales()).format(value) : textOf(row, property, { labels: { yes: t('tables.yes'), no: t('tables.no') }, names })
}

/**
 * The board: a lane for each step or choice, in their order, then one for rows with none; each card its row's
 * name, two of its other cells, and its own step or choice to move it; dragged, it moves to the lane it is dropped in.
 * @param {Loaded} one @param {View} lanes @param {Property[]} columns @param {Set<string>} fresh
 */
function lanesOf(one, lanes, columns, fresh) {
  const by = columns.find((property) => property.id === lanes.group)
  if (!by) return nothing
  const { groups = [] } = query(one.table, one.rows, { group: { property: by.id }, locale: locale.value })
  const title = columns.find((property) => property.type === 'text') ?? columns[0]
  const others = columns.filter((property) => property !== title && property !== by).slice(0, 2)
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
