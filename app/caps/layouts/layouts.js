// Layouts (D215, D291): what an answer's Markdown shows it to be, laid out as that, from its structure
// alone (./shapes.js): a comparison as its options side by side, steps one after the other, notes set
// apart, a column of amounts at the end, a timeline, key figures, a checklist to tick, and the pictures
// sources gave (D35). Loaded with the first answer, never offered; until then, and for the others,
// ui/markdown.js shows them as they are. The same Markdown copies as it was.
import { html, nothing } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { shapes, blocks, inline, lex, cited } from '../../ui/markdown.js'
import { app, keepRecords } from '../../ui/state.js'
import { metaRecord } from '../../core/events.js'
import { styleSheet } from '../../ui/sheet.js'
import { t, dir, useStrings, intlLocales } from '../../core/i18n.js'
import { aligned, compared, marked, roomy, stepped, titled, sequenced, noted, timed, figured, ticked } from './shapes.js'

await Promise.all([useStrings('layouts'), styleSheet(new URL('layouts.css', import.meta.url))])

// A table that fits lets its head stay in view while its rows scroll by (D426, data-whole): one
// wider than the room scrolls sideways, and a box that scrolls holds a sticky head in. Each table is
// watched once (lit hands a shared ref every table again at each render), and both watching and telling
// wait for the next frame, so that neither happens while sizes are being told.
const fitting = new ResizeObserver((seen) => requestAnimationFrame(() => seen.forEach(({ target }) => {
  const box = /** @type {HTMLElement} */ (target.closest('.table'))
  if (!target.isConnected) fitting.unobserve(target)
  else box.toggleAttribute('data-whole', /** @type {HTMLElement} */ (box.firstElementChild).getBoundingClientRect().width < box.clientWidth + 1)
})))
// The head stays under the bar, as tall as each look and window make it.
const bar = document.querySelector('app-shell > .bar')
if (bar) new ResizeObserver(() => requestAnimationFrame(() => document.documentElement.style.setProperty('--stick', `${bar.getBoundingClientRect().height}px`))).observe(bar)
const watched = new WeakSet()
/** @param {Element | undefined} box */
function fits(box) {
  if (!box || watched.has(box)) return
  watched.add(box)
  requestAnimationFrame(() => [box, box.firstElementChild].forEach((part) => part && fitting.observe(part)))
}

/** Options as cards, the best of each row lit, the one recommended framed under its badge; any other table as it is, its amounts at the end. @param {any} token */
function table(token) {
  const shape = compared(token)
  if (!shape) {
    const align = aligned(token).map((side) => side && `align-${side}`)
    return html`<div class="table" tabindex="0" ${ref(fits)}><table>
      <thead><tr>${token.header.map((/** @type {any} */ cell, /** @type {number} */ i) => html`<th class=${align[i]}>${inline(cell.tokens)}</th>`)}</tr></thead>
      <tbody>${token.rows.map((/** @type {any[]} */ row) => html`<tr>${row.map((cell, i) => html`<td class=${align[i]}>${inline(cell.tokens)}</td>`)}</tr>`)}</tbody>
    </table></div>`
  }
  // The criteria, often in bold, are no option's best.
  /** @param {any} cell @param {number} i @param {boolean} [head] */
  const classes = (cell, i, head) => [token.align[i] && `align-${token.align[i]}`, i === shape.pick && 'is-pick', !head && i > 0 && marked(cell)].filter(Boolean).join(' ')
  return html`<div class="table is-compare ${roomy(token) ? 'is-roomy' : ''}" tabindex="0" ${ref(fits)}><table>
    <thead><tr>${token.header.map((/** @type {any} */ cell, /** @type {number} */ i) => html`<th class=${classes(cell, i, true)} data-pick=${i === shape.pick ? t('layouts.recommended') : nothing}>${inline(cell.tokens)}</th>`)}</tr></thead>
    <tbody>${token.rows.map((/** @type {any[]} */ row) => html`<tr>${row.map((cell, i) => html`<td class=${classes(cell, i)}>${inline(cell.tokens)}</td>`)}</tr>`)}</tbody>
  </table></div>`
}

/** Steps, each number in a ring, a title on a line of its own; a timeline, key figures, a checklist. @param {any} token */
const list = (token) => stepped(token) ? html`<ol class="steps" start=${token.start || 1}>${token.items.map(step)}</ol>`
  : timed(token) ? html`<ol class="timeline">${token.items.map((/** @type {any} */ item) => html`<li>${told(item, (when, rest) => html`<time>${when}</time><div>${rest}</div>`)}</li>`)}</ol>`
  : figured(token) ? html`<ul class="figures">${token.items.map((/** @type {any} */ item) => html`<li>${told(item, (number, rest) => html`<strong>${number}</strong><span>${rest}</span>`)}</li>`)}</ul>`
  : ticked(token) ? checklist(token) : null

/**
 * An item's bold start, its words alone, and the rest of it, what joins them left out. @param {any} item
 * @param {(lead: unknown, rest: unknown) => unknown} draw
 */
function told(item, draw) {
  const [first, ...more] = item.tokens
  const title = titled(first.tokens)
  return draw(inline(first.tokens[0].tokens), [inline(title ? title.rest : first.tokens.slice(1)), more.map((/** @type {any} */ token) => blocks([token]))])
}

/** A list's own name, from what it holds, for the ticks kept for it. @param {any} token */
const named = (token) => token.items.map((/** @type {any} */ item) => item.text).join('\n')

/**
 * A checklist: each thing to do ticked, struck through, and how many are done, with a bar. What is
 * ticked is kept in the conversation, a meta record for the list (its items' words), the latest winning.
 * @param {any} token
 */
function checklist(token) {
  const list = named(token)
  /** @param {import('../../core/types.js').Envelope[]} records */
  const doneIn = (records) => new Set(/** @type {number[]} */ (records.findLast((record) => record.meta?.ticks?.list === list)?.meta?.ticks.done
    ?? token.items.flatMap((/** @type {any} */ item, /** @type {number} */ i) => (item.checked ? [i] : []))))
  const done = doneIn(app.current.value?.records ?? [])
  const count = new Intl.NumberFormat(intlLocales())
  // Shown at once, from the ticks of the moment, then kept, in the order they were made.
  /** @param {number} i @param {boolean} on */
  const tick = (i, on) => {
    const conversation = app.current.peek()
    if (!conversation) return
    const record = metaRecord(app.deviceId, { ticks: { list, done: [...doneIn(conversation.records)].filter((other) => other !== i).concat(on ? [i] : []).sort((a, b) => a - b) } })
    app.current.value = { ...conversation, records: [...conversation.records, record] }
    keepRecords(conversation.path, [record]).catch((error) => console.warn("Ticks", error))
  }
  return html`<div class="checklist">
    <p class="checklist-count"><span dir=${dir()}>${t('layouts.ticked', { done: count.format(done.size), total: count.format(token.items.length) })}</span><progress max=${token.items.length} .value=${done.size}></progress></p>
    <ul>${token.items.map((/** @type {any} */ item, /** @type {number} */ i) => html`<li class=${done.has(i) ? 'is-done' : ''}><label>
      <input type="checkbox" .checked=${done.has(i)} @change=${(/** @type {Event} */ e) => tick(i, /** @type {HTMLInputElement} */ (e.target).checked)}>
      <span>${item.tokens.map((/** @type {any} */ part) => (part.type === 'checkbox' ? nothing : part.type === 'text' ? inline(part.tokens ?? [part]) : blocks([part])))}</span>
    </label></li>`)}</ul>
  </div>`
}

/** @param {any} item */
function step(item) {
  const [first, ...rest] = item.tokens
  const title = titled(first.tokens)
  const lead = title ? html`${inline(first.tokens.slice(0, 1))}<span class="end">${title.end}</span>${inline(title.rest)}` : inline(first.tokens)
  return html`<li>${first.type === 'paragraph' ? html`<p>${lead}</p>` : lead}${rest.map((/** @type {any} */ token) => (token.type === 'text' ? inline(token.tokens ?? [token]) : blocks([token])))}</li>`
}

/** A note, in its kind's colour, titled with the kind's name or its own words. @param {any} token */
function blockquote(token) {
  const note = noted(token)
  if (!note) return null
  return html`<blockquote class="callout is-${note.kind}">${note.text === undefined ? blocks(token.tokens)
    : html`<p class="callout-title">${note.title ? inline(/** @type {any} */ (lex(note.title)[0])?.tokens) : t(`layouts.${note.kind}`)}</p>${blocks(lex(note.text))}`}</blockquote>`
}

/** An address as it reads, escaped or not. @param {string} address */
function unescaped(address) {
  try {
    return decodeURI(address)
  } catch {
    return address
  }
}

/**
 * A picture a source gave, at the address it gave, or one the user shared, by its name (D35): never
 * an address the brain wrote, which injected words could have filled with what the conversation
 * holds. One that doesn't load goes. Any other picture stays its words. @param {any} token
 */
function image(token) {
  const href = unescaped(token.href)
  const source = [...(cited?.values() ?? [])].find(({ name, picture, file }) => {
    const address = file ? name : picture
    return address !== undefined && unescaped(address) === href
  })
  if (source?.file) import('../../ui/shown.js')
  return source?.file ? html`<app-shared class="picture" role="img" aria-label=${token.text} uri=${source.file.uri} type=${source.file.mimeType ?? ''}></app-shared>`
    : source ? html`<img class="picture" src=${source.picture} alt=${token.text} referrerpolicy="no-referrer" loading="lazy" @error=${(/** @type {Event} */ e) => /** @type {HTMLElement} */ (e.target).remove()}>`
    : null
}

shapes.value = { table, list, blockquote, image, blocks: sequenced }
