// SPDX-License-Identifier: MIT
// A Formula's dialog, over the page (caps/tables/view.js fetches this folder as one is first opened): its column's name, then its formula's words, which take the
// keyboard, the caret at their end. As they are written, what the word being written may become is offered under them (the columns, then the functions, whose
// names hold it; ↑ ↓ and Enter or Tab take one), what is wrong is said where it is, with the name most likely meant, a press writing it in, and what the formula
// works out for the first rows shows beside their names. Under them, the columns and the functions by group, each as an example on this collection's own columns
// beside what it works out for the first row, a press writing it at the caret. Save, or ⌘Enter, keeps the formula once it can be read, the dialog then closing;
// Escape or Close leave it as it was. Its words are its own (locales/formula/), but for those the view gives, whose strings they are.
import { html, nothing, render } from 'lit-html'
import { ref } from 'lit-html/directives/ref.js'
import { t, tParts, useStrings, intlLocales } from '../../core/i18n.js'
import { styleSheet } from '../../ui/sheet.js'
import { icons } from '../../ui/menu-icons.js'
import { reshapeTable, reread } from '../tables/tables.js'
import { titleOf } from '../tables/table.js'
import { Unread } from '../tables/formula.js'
import { compile, result, FUNCTIONS } from './engine.js'

await Promise.all([import('../../ui/dialogs.js'), useStrings('formula'), styleSheet(new URL('formula.css', import.meta.url))])

/** @import { Property } from '../tables/table.js' */
/** @import { Loaded } from '../tables/tables.js' */
/** @typedef {{ name: string, column?: Property }} Offer */

/** The dialog open: its collection's columns, the formula's own left out, and its first rows. @type {{ columns: Property[], rows: Loaded['rows'], one?: Loaded }} */
let open = { columns: [], rows: [] }
/** What is offered for the word being written, and which of them ↑ ↓ are on. @type {Offer[]} */
let offers = []
let active = 0, quiet = false
const GROUPS = /** @type {const} */ (['logic', 'numbers', 'text', 'dates', 'lists'])

/** Each function written on this collection's own columns of the kinds it takes, else on values, so that what it works out says what it does. @param {Property[]} columns */
function examples(columns) {
  const of = (/** @type {RegExp} */ kind, /** @type {string} */ none) => columns.find((column) => kind.test(column.type))?.name ?? none
  const n = of(/^number$/, '12'), d = of(/^(date|created-at|changed-at)$/, 'today()'), w = of(/^(text|email|link|select|status)$/, '"…"'), l = of(/^(multi-select|person|files)$/, w)
  return /** @type {Record<string, string>} */ ({
    if: `if(${n} > 10, ${n}, 0)`, ifs: `ifs(${n} > 10, 3, ${n} > 5, 2, 1)`, and: `and(${n} > 1, ${n} < 10)`, or: `or(${n} < 1, ${n} > 10)`, not: `not(empty(${w}))`, empty: `empty(${w})`, ifempty: `ifempty(${w}, "–")`,
    sum: `sum(${n}, 1)`, average: `average(${n}, 10)`, min: `min(${n}, 10)`, max: `max(${n}, 10)`, round: `round(${n} / 3, 2)`, floor: `floor(${n} / 3)`, ceil: `ceil(${n} / 3)`, abs: `abs(${n} - 10)`, sqrt: `sqrt(${n})`, number: 'number("12.5")',
    concat: `concat(${w}, " ★")`, length: `length(${w})`, upper: `upper(${w})`, lower: `lower(${w})`, trim: `trim(${w})`, contains: `contains(${w}, " ")`, replace: `replace(${w}, " ", "-")`, left: `left(${w}, 3)`, right: `right(${w}, 3)`, text: `text(${n})`,
    today: 'today()', now: 'now()', date: 'date(2026, 12, 25)', dateadd: `dateadd(${d}, 7, "days")`, datediff: `datediff(${d}, today(), "days")`, year: `year(${d})`, month: `month(${d})`, day: `day(${d})`, weekday: `weekday(${d})`,
    count: `count(${l})`, join: `join(${l}, " / ")`, first: `first(${l})`, last: `last(${l})`,
  })
}

/** A result as the language writes it: a number, a day, yes or no, words; that it can't be worked out, for none. @param {unknown} value */
function said(value) {
  const day = /^\d{4}-\d\d-\d\d(T\d\d:\d\d)?$/.exec(String(value))
  if (value === null) return t('formula.cant')
  if (typeof value === 'boolean') return t(value ? 'formula.yes' : 'formula.no')
  if (typeof value === 'number') return new Intl.NumberFormat(intlLocales()).format(value)
  return day ? new Intl.DateTimeFormat(intlLocales(), { dateStyle: 'medium', ...(day[1] && { timeStyle: 'short' }) }).format(new Date(day[1] ? String(value) : `${value}T00:00`)) : String(value)
}

/** How many letters apart two words are, in any case (Levenshtein's distance). @param {string} a @param {string} b */
function apart(a, b) {
  [a, b] = [a.toLocaleLowerCase(), b.toLocaleLowerCase()]
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) row = row.reduce((next, _, j) => [...next, j ? Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1])) : i], /** @type {number[]} */ ([]))
  return row[b.length]
}
/** The column or function a word not known most likely meant: the nearest, a third of its letters apart at most. @param {string} word */
const meant = (word) => [...open.columns.map((column) => column.name), ...Object.keys(FUNCTIONS)].map((name) => /** @type {const} */ ([apart(word, name), name])).filter(([far]) => far <= Math.max(1, Math.floor(word.length / 3))).sort((a, b) => a[0] - b[0])[0]?.[1]

/** The word being written before the caret, from the last operator, bracket, comma or quote, which offers are found by; none in words in quotes. @param {HTMLTextAreaElement} field */
function writing(field) {
  const before = field.value.slice(0, field.selectionStart), word = /[^-+*/%^(),=<>&!"']*$/u.exec(before)?.[0].trimStart() ?? ''
  return field.selectionStart === field.selectionEnd && (before.match(/["']/g) ?? []).length % 2 === 0 && /^[\p{L}_]/u.test(word) ? word : ''
}
/** The columns, then the functions, whose names start with the word, then those that hold it; none once it is the one name it can be. @param {string} word @returns {Offer[]} */
function offered(word) {
  const low = word.toLocaleLowerCase(), all = [...open.columns.map((column) => ({ name: column.name, column })), ...Object.keys(FUNCTIONS).map((name) => ({ name }))]
  const found = [...all.filter((one) => one.name.toLocaleLowerCase().startsWith(low)), ...all.filter((one) => !one.name.toLocaleLowerCase().startsWith(low) && one.name.toLocaleLowerCase().includes(low))]
  return low && !(found.length === 1 && found[0].name.toLocaleLowerCase() === low) ? found.slice(0, 6) : []
}

/** Words written at the caret over what is selected, or `from` there; a function's brackets with the caret between them. @param {HTMLTextAreaElement} field @param {string} words @param {number} [from] */
function put(field, words, from = field.selectionStart) {
  field.focus()
  field.setRangeText(words, from, field.selectionEnd, 'end')
  if (words.endsWith('()') && FUNCTIONS[words.slice(0, -2)]?.max !== 0) field.selectionStart = field.selectionEnd = field.selectionEnd - 1
  field.dispatchEvent(new Event('input', { bubbles: true }))
}
/** The offer chosen written over the word being written. @param {HTMLTextAreaElement} field @param {Offer} offer */
const take = (field, offer) => put(field, offer.column ? offer.name : `${offer.name}()`, field.selectionStart - writing(field).length)

/** What is said under the words as they change: what is offered, what is wrong and where, else what the first rows work out. @param {HTMLDialogElement} dialog */
function live(dialog) {
  const field = /** @type {HTMLTextAreaElement} */ (dialog.querySelector('textarea')), source = field.value
  offers = quiet ? [] : offered(writing(field))
  active = Math.min(active, Math.max(0, offers.length - 1))
  for (const [name, value] of [['aria-controls', 'formula-offers'], ['aria-activedescendant', `formula-offer-${active}`]]) offers.length ? field.setAttribute(name, value) : field.removeAttribute(name)
  /** @type {import('./engine.js').Part | null} */
  let part = null
  /** @type {Unread | null} */
  let wrong = null
  try { part = source.trim() ? compile(source, open.columns) : null } catch (error) { wrong = error instanceof Unread ? error : null }
  // A word still being written, with names it may become, is no mistake yet.
  if (offers.length && wrong?.why === 'word' && wrong.at + wrong.word.length === field.selectionStart) wrong = null
  const title = open.one && titleOf(open.one.table), mark = wrong && ((wrong.word ? source.slice(wrong.at, wrong.at + wrong.word.length) : /^\S*/u.exec(source.slice(wrong.at))?.[0]) || ' '), at = wrong?.at ?? 0, word = wrong?.word ?? ''
  const like = wrong?.why === 'word' && meant(word)
  const why = wrong && tParts(`formula.${wrong.why}`, { word: html`<bdi>${word}</bdi>`, use: html`<code dir="ltr">${examples(open.columns)[word.toLowerCase()] ?? `${word}()`}</code>` })
  render(html`${offers.length ? html`<ul id="formula-offers" class="formula-offers" role="listbox" aria-label=${t('formula.offers')}>${offers.map((offer, i) => html`<li id=${`formula-offer-${i}`} role="option" aria-selected=${String(i === active)}
      @mousedown=${(/** @type {Event} */ e) => { e.preventDefault(); take(field, offer) }}><code dir="auto">${offer.column ? offer.name : `${offer.name}()`}</code><span class="muted small">${offer.column ? t('formula.column') : t(`formula.${FUNCTIONS[offer.name].group}`)}</span></li>`)}</ul>` : nothing}
    <div class="formula-said" role="status">${wrong ? html`<p><code dir="ltr">${source.slice(0, wrong.at)}<mark>${mark}</mark>${source.slice(wrong.at + (mark?.length ?? 0))}</code></p><p>${why}${like ? html` ${tParts('formula.like', { name: html`<button type="button" class="link-button" @click=${() => (field.setSelectionRange(at, at + word.length), put(field, like))}>${like}</button>` })}` : nothing}</p>` : nothing}</div>
    ${part && !wrong ? html`<section class="formula-results"><h3>${t('formula.results')}</h3>${open.rows.length ? html`<dl>${open.rows.slice(0, 3).map((row) => html`<dt dir="auto">${title ? String(row.cells[title.id] ?? '') || '–' : '–'}</dt><dd dir="auto">${said(result(/** @type {import('./engine.js').Part} */ (part), row.cells))}</dd>`)}</dl>` : html`<p class="muted small">${t('formula.noRows')}</p>`}</section>` : nothing}`,
  /** @type {HTMLElement} */ (dialog.querySelector('.formula-live')))
}

/** Shown once it is on the page, as it is first drawn, its words taking the keyboard, the caret at their end. */
const shown = ref((dialog) => queueMicrotask(() => {
  if (!(dialog instanceof HTMLDialogElement) || !dialog.isConnected || dialog.open) return
  dialog.showModal()
  const words = dialog.querySelector('textarea')
  words?.focus()
  words?.setSelectionRange(words.value.length, words.value.length)
  live(dialog)
}))

/** @param {{ one: Loaded, columns: Property[], property: Property, state: import('../tables/view.js').State, parts: typeof import('../tables/view.js').parts, words: { yours: string, hint: string, wrong: string, save: string } }} given */
export default function formula({ one, columns, property, state, parts, words }) {
  open = { one, columns: columns.filter((column) => column.id !== property.id && !column.deleted), rows: one.rows }
  const all = examples(open.columns), first = open.rows[0]
  /** What an example works out for the first row, as the language writes it; nothing without a row. @param {string} example */
  const tried = (example) => { try { return first ? said(result(compile(example, open.columns), first.cells)) : '' } catch { return '' } }
  /** @param {SubmitEvent} event */
  const save = (event) => {
    const text = /** @type {HTMLFormElement} */ (event.target).querySelector('textarea')?.value.trim() ?? ''
    try { if (text) compile(text, columns) } catch { event.preventDefault(); state.wrong.value = true; return }
    if (text !== (property.formula ?? '')) reshapeTable(one, { formula: { id: property.id, text } }).catch(() => reread(one))
  }
  /** @param {KeyboardEvent} e */
  const keys = (e) => {
    const field = /** @type {HTMLTextAreaElement} */ (e.currentTarget), dialog = /** @type {HTMLDialogElement} */ (field.closest('dialog'))
    if (e.isComposing) return
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return e.preventDefault(), field.form?.requestSubmit()
    if (!offers.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') active = (active + (e.key === 'ArrowDown' ? 1 : offers.length - 1)) % offers.length
    else if (e.key === 'Enter' || e.key === 'Tab') take(field, offers[active])
    else if (e.key === 'Escape') quiet = true
    else return
    e.preventDefault()
    live(dialog)
  }
  return html`<dialog class="sheet table-formula" aria-label=${property.name} ${shown} @close=${() => { state.formula.value = '' }} @keydown=${(/** @type {KeyboardEvent} */ e) => e.key === 'Escape' && e.stopPropagation()}>
    <form method="dialog" @submit=${save}>
      <header class="dialog-head"><h2 dir="auto">${parts.glyphs.formula}${property.name}</h2><button type="button" class="icon-button" aria-label=${t('action.close')} @click=${(/** @type {Event} */ e) => /** @type {Element} */ (e.currentTarget).closest('dialog')?.close()}>${icons.close}</button></header>
      <textarea dir="auto" rows="3" spellcheck="false" title=${property.name} placeholder=${words.yours} aria-autocomplete="list" .value=${property.formula ?? ''} @keydown=${keys}
        @input=${(/** @type {Event} */ e) => { state.wrong.value = false; active = 0; quiet = false; live(/** @type {HTMLDialogElement} */ (/** @type {Element} */ (e.target).closest('dialog'))) }}
        @click=${(/** @type {Event} */ e) => live(/** @type {HTMLDialogElement} */ (/** @type {Element} */ (e.target).closest('dialog')))}></textarea>
      <div class="formula-live"></div>${state.wrong.value ? html`<p class="table-formula-wrong" role="alert">${words.wrong}</p>` : nothing}
      <details class="formula-help"><summary>${t('formula.functions')}</summary><p class="muted small">${words.hint}</p>
        ${[['columns', open.columns.map((column) => column.name)], ...GROUPS.map((group) => [group, Object.keys(FUNCTIONS).filter((name) => FUNCTIONS[name].group === group).map((name) => all[name])])].map(([group, list]) => list.length ? html`<h3>${t(`formula.${group}`)}</h3>
          <ul>${/** @type {string[]} */ (list).map((example) => html`<li><button type="button" @click=${(/** @type {Event} */ e) => put(/** @type {HTMLTextAreaElement} */ (/** @type {Element} */ (e.currentTarget).closest('form')?.querySelector('textarea')), example)}><code dir="ltr">${example}</code><span class="muted small" dir="auto">${tried(example)}</span></button></li>`)}</ul>` : nothing)}
      </details>
      <footer class="dialog-foot"><button class="button primary">${words.save}</button></footer>
    </form></dialog>`
}
