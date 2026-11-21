// SPDX-License-Identifier: MIT
// A collection's own form (caps/collect): the columns a form can ask, what each is asked with, and the site of one page that asks them, whose
// replies a published site's script seals (caps/sites/replies.js, D751). A field's label is its column's name, which is how a reply finds its
// column again. Pure, so Node's tests run it.
import { titleOf } from '../tables/table.js'

/** @import { Table } from '../tables/table.js' */
/** A column a form can ask: its name, kind and choices, a date's time, and whether it is each row's name, always asked. @typedef {{ id: string, name: string, type: string, options: string[], time: boolean, title: boolean }} Field */
/**
 * What asks a field: a line or lines of words, a box, a few choices side by side or a list of them; its attributes, and its choices.
 * @typedef {{ as: 'input' | 'area' | 'tick' | 'radios' | 'select', id: string, name: string, attrs: Record<string, string | true>, options: string[] }} Part
 */

const ASKED = /^(text|number|date|select|checkbox|link|email|phone)$/
const TYPES = /** @type {Record<string, Record<string, string>>} */ ({ number: { type: 'number', step: 'any', inputmode: 'decimal' }, link: { type: 'url', autocomplete: 'url' }, email: { type: 'email', autocomplete: 'email' }, phone: { type: 'tel', autocomplete: 'tel' } })

/** The columns of a collection a form can ask, in their order: words, numbers, days, one choice, boxes, links, emails and phones. @param {Table} table @returns {Field[]} */
export const askable = (table) => ((title) => table.properties.filter((property) => !property.deleted && ASKED.test(property.type)).map((property) => ({ id: property.id, name: property.name, type: property.type,
  options: (property.options ?? []).map(({ name }) => name), time: Boolean(property.time), title: property === title })))(titleOf(table))

/**
 * What asks each field, named f0, f1… in order: the row's name on one line, which must be filled, other words on several, a box, a choice among five
 * at most side by side, among more in a list, with none yet as words, and the rest as its kind's field. @param {Field[]} fields @returns {Part[]}
 */
export const partsOf = (fields) => fields.map(({ name, type, options, time, title }, i) => {
  const id = `f${i}`, part = (/** @type {Part['as']} */ as, /** @type {Record<string, string | true>} */ attrs = {}) => ({ as, id, name, attrs: /** @type {Record<string, string | true>} */ ({ ...attrs, ...(title ? { required: true } : {}) }), options })
  return type === 'checkbox' ? part('tick', { value: 'true' }) : type === 'select' && options.length ? part(options.length > 5 ? 'select' : 'radios') : type === 'text' && !title ? part('area', { rows: '3' })
    : part('input', type === 'date' ? { type: time ? 'datetime-local' : 'date' } : TYPES[type] ?? {})
})

/** Words as HTML holds them. @param {string} text */
const esc = (text) => text.replace(/[&<>"']/g, (mark) => `&#${mark.charCodeAt(0)};`)
/** @param {Record<string, string | true>} attrs */
const said = (attrs) => Object.entries(attrs).map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${esc(value)}"`)).join('')

const STYLE = `:root { color-scheme: light dark; font: 1rem/1.5 system-ui, sans-serif; }
body { margin: 0; padding: 1.5rem 1rem; }
main { max-inline-size: 28rem; margin-inline: auto; }
h1 { margin-block: 0 1rem; font-size: 1.6rem; line-height: 1.2; }
form { display: grid; gap: 1rem; }
p, fieldset { display: grid; gap: 0.3rem; margin: 0; padding: 0; border: 0; }
label, legend { font-weight: 600; }
legend { padding: 0; margin-block-end: 0.3rem; }
label:has(input:is([type='radio'], [type='checkbox'])) { display: flex; align-items: center; gap: 0.5rem; font-weight: 400; }
input:not([type='radio'], [type='checkbox']), select, textarea { box-sizing: border-box; inline-size: 100%; min-block-size: 2.75rem; padding: 0.5rem 0.65rem; border: 1px solid; border-radius: 0.5rem; background: Canvas; color: CanvasText; font: inherit; }
input:is([type='radio'], [type='checkbox']) { inline-size: 1.2rem; block-size: 1.2rem; margin: 0; }
button { justify-self: start; min-block-size: 2.75rem; padding: 0.5rem 1.4rem; border: 0; border-radius: 999px; background: CanvasText; color: Canvas; font: inherit; font-weight: 600; cursor: pointer; }
:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
`

/**
 * The form's site, its files by their places: one page, in the language and the direction given, named after the collection, with a field for each
 * part under its column's name, a button, and the words it says once a reply went or didn't; and its style sheet.
 * @param {{ name: string, lang: string, dir: string, parts: Part[], words: { pick: string, send: string, sent: string, unsent: string } }} form @returns {Map<string, string>}
 */
export function pageOf({ name, lang, dir, parts, words }) {
  const field = (/** @type {Part} */ { as, id, name: label, attrs, options }) => (as === 'tick' ? `<p><label for="${id}"><input id="${id}" name="${id}" type="checkbox"${said(attrs)}> ${esc(label)}</label></p>`
    : as === 'radios' ? `<fieldset><legend>${esc(label)}</legend>${options.map((option, i) => `<label for="${id}-${i}"><input id="${id}-${i}" name="${id}" type="radio" value="${esc(option)}"${said(attrs)}> ${esc(option)}</label>`).join('')}</fieldset>`
    : `<p><label for="${id}">${esc(label)}</label>${as === 'select' ? `<select id="${id}" name="${id}"${said(attrs)}><option value="">${esc(words.pick)}</option>${options.map((option) => `<option>${esc(option)}</option>`).join('')}</select>`
      : as === 'area' ? `<textarea id="${id}" name="${id}"${said(attrs)}></textarea>` : `<input id="${id}" name="${id}"${said(attrs)}>`}</p>`)
  return new Map([['index.html', `<!doctype html>
<html lang="${esc(lang)}" dir="${esc(dir)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(name)}</title>
<link rel="stylesheet" href="form.css">
</head>
<body>
<main>
<h1>${esc(name)}</h1>
<form data-form="${esc(name)}">
${parts.map(field).join('\n')}
<button>${esc(words.send)}</button>
<p data-sent hidden>${esc(words.sent)}</p>
<p data-unsent hidden>${esc(words.unsent)}</p>
</form>
</main>
</body>
</html>
`], ['form.css', STYLE]])
}
