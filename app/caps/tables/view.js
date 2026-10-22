// A table's view beside the conversation (D491): the table on show (./tables.js) as a table, each cell changed
// in place as its column's kind asks, or as a board grouped by its status or a select, each card moved by its
// own choice or dragged to another lane. Jean's changes the user hasn't kept are marked, with Keep and Undo.
// lit-html, in Jean's own document, redrawn as the table changes here or by the brain.
import { html, nothing, render } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { signal, effect } from '@preact/signals-core'
import { t, locale } from '../../core/i18n.js'
import { notify } from '../../ui/state.js'
import { icons } from '../../ui/menu-icons.js'
import { shown, change, unkept, keep, undoJean } from './tables.js'
import { query, valueOf } from './query.js'
import { textOf } from './export.js'

/** @import { Property, View } from './table.js' */
/** @import { Row } from './changes.js' */
/** @import { Loaded } from './tables.js' */

/** The view's box, drawn while the table is on show. @param {(() => void)[]} holds */
export function view(holds) {
  const box = Object.assign(document.createElement('div'), { className: 'table-view' })
  const board = signal(false)
  holds.push(effect(() => { render(draw(shown.value, board), box) }))
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
    shown.value = { ...one }
    event?.target instanceof HTMLElement && event.target.blur()
  }
}

/** @param {Loaded | null} one @param {import('@preact/signals-core').Signal<boolean>} board */
function draw(one, board) {
  if (!one) return nothing
  const columns = one.table.properties.filter((property) => !property.deleted)
  const lanes = one.table.views.find((view) => view.type === 'board')
  const marked = unkept(one)
  // The cells and rows Jean changed, as "row column" and by row.
  const fresh = new Set(marked.flatMap((line) => [line.row, ...Object.keys(line.set ?? {}).map((id) => `${line.row} ${id}`)]))
  const cells = marked.reduce((count, line) => count + Math.max(1, Object.keys(line.set ?? {}).length), 0)
  return html`<div class="table-bar">
      ${lanes ? html`<div class="table-modes" role="group" aria-label=${t('tables.views')}>
        <button type="button" class="button subtle" aria-pressed=${String(!board.value)} @click=${() => { board.value = false }}>${t('tables.table')}</button>
        <button type="button" class="button subtle" aria-pressed=${String(board.value)} @click=${() => { board.value = true }}>${t('tables.board')}</button>
      </div>` : nothing}
      ${marked.length ? html`<div class="table-review" role="status">
        <span>${t('tables.changed', { count: cells })}</span>
        <button type="button" class="button subtle" @click=${() => keep(one)}>${icons.check} ${t('tables.keep')}</button>
        <button type="button" class="button subtle" @click=${() => undoJean(one)}>${t('tables.undo')}</button>
      </div>` : nothing}
    </div>
    ${board.value && lanes ? lanesOf(one, lanes, columns, fresh) : grid(one, columns, fresh)}`
}

/** @param {Loaded} one @param {Property[]} columns @param {Set<string>} fresh */
function grid(one, columns, fresh) {
  const add = async () => {
    await edit(one, { set: { [columns[0].id]: columns[0].type === 'checkbox' ? false : null } })
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector('.table-grid tbody tr:last-child :is(input, select)'))?.focus())
  }
  return html`<div class="table-scroll"><table class="table-grid">
      <thead><tr>${columns.map((property) => html`<th scope="col" dir="auto">${property.name}</th>`)}<th scope="col"><span class="visually-hidden">${t('tables.actions')}</span></th></tr></thead>
      <tbody>${one.rows.map((row) => html`<tr class=${fresh.has(row.id) ? 'is-jean' : ''}>
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
    case 'select': return choice(one, row, property)
    case 'multi-select': return html`<input dir="auto" aria-label=${label} .value=${live(Array.isArray(value) ? value.join(', ') : '')}
      @change=${(/** @type {Event} */ e) => set(read(e).value.split(/[,،、]/).map((one) => one.trim()).filter(Boolean), e)}>`
    case 'files':
    case 'created-by':
    case 'changed-by': return html`<span dir="auto">${textOf(row, property)}</span>`
    case 'created-at':
    case 'changed-at': return html`<time datetime=${String(value)}>${new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)))}</time>`
    default: return html`<input dir="auto" type=${({ link: 'url', email: 'email', phone: 'tel' })[/** @type {string} */ (property.type)] ?? 'text'} aria-label=${label}
      .value=${live(textOf(row, property))} @change=${(/** @type {Event} */ e) => set(read(e).value.trim() || null, e)}>`
  }
}

/**
 * A step to pick among a status's, or a choice among a select's, where typing a new one adds it (D491).
 * @param {Loaded} one @param {Row} row @param {Property} property
 */
function choice(one, row, property) {
  const value = /** @type {string | null} */ (valueOf(row, property))
  const set = (/** @type {Event} */ event) => edit(one, { row: row.id, set: { [property.id]: /** @type {HTMLInputElement} */ (event.target).value.trim() || null } }, event)
  const options = property.options ?? []
  if (property.type === 'status') return html`<select aria-label=${property.name} .value=${live(value ?? '')} @change=${set}>
      <option value="">—</option>${options.map((option) => html`<option value=${option.name} ?selected=${option.name === value}>${option.name}</option>`)}
    </select>`
  const list = `choices-${one.table.id}-${property.id}`
  return html`<input dir="auto" list=${list} aria-label=${property.name} .value=${live(value ?? '')} @change=${set}>
    <datalist id=${list}>${options.map((option) => html`<option value=${option.name}></option>`)}</datalist>`
}

/**
 * A cell as a card says it: a date and a number as the language writes them, a box as a word.
 * @param {Row} row @param {Property} property
 */
function said(row, property) {
  const value = valueOf(row, property)
  if (property.type === 'date' && typeof value === 'string') {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', ...(value.includes('T') && { timeStyle: 'short' }) }).format(new Date(value.includes('T') ? value : `${value}T00:00`))
  }
  return typeof value === 'number' ? new Intl.NumberFormat(locale.value).format(value) : textOf(row, property, { labels: { yes: t('tables.yes'), no: t('tables.no') } })
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
      <h3><span dir="auto">${name}</span> <span class="muted">${new Intl.NumberFormat(locale.value).format(rows.length)}</span></h3>
      ${rows.map((row) => html`<article class=${`table-card${fresh.has(row.id) ? ' is-jean' : ''}`} draggable="true"
        @dragstart=${(/** @type {DragEvent} */ e) => e.dataTransfer?.setData('text/x-row', row.id)}>
        <strong dir="auto">${textOf(row, title) || '—'}</strong>
        ${others.map((property) => (valueOf(row, property) === null ? nothing : html`<span class="table-field"><span class="muted" dir="auto">${property.name}</span> <span dir="auto">${said(row, property)}</span></span>`))}
        ${choice(one, row, by)}
      </article>`)}
    </section>`
  })}</div>`
}
