// What a page of parts shares (D670), so that what the user changes reaches all it touches at once, with nothing sent to a brain:
// its form's fields, by their labels; the values worked out from them (<app-values>, a line each, `Name = formula`), in Tables' formulas,
// which Jean reads itself, never with eval; `{formula}` in figures, a table's lines, a chart's, a card's heading and words, `{formula:2}`
// with that many decimals, said in the language; a table's `each="Year = 1..Years"`, which repeats the lines that hold one; `{sum Column}`
// and `{count}`, what a table of the page adds up to as it stands, the rows its forms added too; a chart's `from="its id"`, drawn from it by
// `by` and `sum`; a choice named as a table's column, which keeps the rows that hold it, one no row holds (All) keeping them all.
// What can't be worked out is a dash. A page with none of these stays as it was written. Pure, so Node's tests run it.
import { compile } from '../tables/formula.js'
import { all, form, lines, number, split, table } from './parts.js'

/** @import { Part } from './parts.js' */
/** What a form's fields, what they work out and a table's sums hold, by their names. @typedef {Record<string, any>} Cells */

const FORMULA = /\{([^{}]+)\}/g, HOLDS = /\{[^{}]+\}/, LIST = /\s*[,،、]\s*/
/** The parts whose lines may hold a formula: a diagram's braces are its own. */
const SPELLED = ['app-figures', 'app-table', 'app-chart', '#text']
/** The rows an `each` makes at most. */
const MOST = 600
/** A number as a chart's lines, and the brain, read one: a few decimals, whatever the language; none for what is no number. @param {number} value @param {string} [digits] */
const plain = (value, digits) => (Number.isFinite(value) ? String(Number(value.toFixed(digits ? Number(digits) : Math.abs(value) < 1 ? 4 : 2))) : '')
/** A line with what `say` makes of each formula's words and the decimals it asks for. @param {string} line @param {(text: string, digits?: string) => string} say */
const spelled = (line, say) => line.replace(FORMULA, (_, inner) => ((found) => say(found[1], found[2]))(/** @type {RegExpExecArray} */ (/^(.*?)(?::\s*(\d))?\s*$/s.exec(inner))))
/** @param {string} raw */
const read = (raw) => (raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw)

/**
 * What a page's parts share now, from what the user set (`given`, by each field's label) and the rows its forms added (`added`, by each
 * table's id): whether it shares anything, each part as it shows it, and what it now holds, in words for a brain.
 * @param {Part[]} parts @param {{ given: Map<string, string | boolean>, added: Map<string, string[][]>, lang: string, locales: string[] }} how
 * @returns {{ live: boolean, filled: (part: Part) => Part, now: () => string }}
 */
export function shared(parts, { given, added, lang, locales }) {
  const list = all(parts), own = list.filter((part) => part.tag === 'app-table' && !part.attrs.from), fields = list.filter((part) => part.tag === 'app-form' && !part.attrs.to).flatMap(form)
  const worked = list.filter((part) => part.tag === 'app-values').flatMap(lines).map((line) => split(line, '=')), heads = own.flatMap((part) => table(part).heads), counted = own.flatMap((part) => (part.attrs.each ? [split(part.attrs.each, '=')[0]] : []))
  const source = (/** @type {Part} */ part) => own.find((one) => one.attrs.id && one.attrs.id === part.attrs.from), choice = (/** @type {string} */ head) => fields.some((field) => field.kind === 'choice' && field.label === head)
  const live = worked.length > 0 || counted.length > 0 || list.some((part) => source(part)) || heads.some(choice) || (fields.length > 0 && list.some((part) => SPELLED.includes(part.tag) && HOLDS.test(part.text)))
  // A field is read by its label or its first words, as brains shorten them (`Weight` for `Weight (kg)`).
  const columns = /** @type {any[]} */ ([...fields.map(({ label }) => label), ...worked.map(([name]) => name), ...counted, ...heads.map((head) => `sum ${head}`), 'count'].map((name) => ({ id: name, name, type: 'live' }))
    .concat(fields.flatMap(({ label }) => label.split(/\s+/).slice(0, -1).map((_, i, words) => ({ id: label, name: words.slice(0, i + 1).join(' '), type: 'live' })))))
  const readers = /** @type {Map<string, (cells: Cells) => any>} */ (new Map()), formats = /** @type {Map<string, Intl.NumberFormat>} */ (new Map())
  const reader = (/** @type {string} */ text) => { try { return compile(text.replace(/[{}]/g, ''), columns) } catch { return () => NaN } }
  /** What a formula comes to; NaN where it can't be read or worked out. @param {string} text @param {Cells} cells */
  const value = (text, cells) => /** @type {(cells: Cells) => any} */ (readers.get(text) ?? readers.set(text, reader(text)).get(text))(cells)
  /** A result in the page's words. @param {any} got @param {string} [digits] @param {boolean} [bare] with no marks between thousands */
  const said = (got, digits, bare) => (typeof got === 'boolean' ? (got ? '✓' : '') : typeof got !== 'number' ? String(got) : !Number.isFinite(got) ? '—' : /** @type {Intl.NumberFormat} */ (formats.get(`${digits}${bare}`)
    ?? formats.set(`${digits}${bare}`, new Intl.NumberFormat(locales, { maximumFractionDigits: digits ? Number(digits) : 2, minimumFractionDigits: digits ? Number(digits) : 0, useGrouping: !bare, signDisplay: 'negative' })).get(`${digits}${bare}`)).format(got))
  /** A line with each formula worked out, an `each`'s own name as it is written. @param {string} line @param {Cells} cells @param {string} [name] */
  const spell = (line, cells, name) => (live ? spelled(line, (text, digits) => said(value(text, cells), digits, text.trim() === name)) : line)
  const base = /** @type {Cells} */ (Object.fromEntries(fields.map(({ label, kind, start, choices }) => ((raw) => [label, typeof raw === 'boolean' ? raw : /^(yes|no)$/.test(kind) ? (raw ? /^(yes|on|true|✓)$/i.test(raw) : kind === 'yes')
    : /^(number|range)$/.test(kind) ? (raw === '' ? NaN : number(raw, lang, true)) : read(raw)])(given.get(label) ?? (start || choices?.[0] || '')))))
  /** The fields, the tables' sums, and each value worked out, as often as there are values, so that one written before what it reads sees it. @param {Cells} [extra] */
  const work = (extra) => { const cells = { ...base, ...extra }; for (const _ of worked) for (const [name, text] of worked) cells[name] = value(text, cells); return cells }
  /** The name an `each` gives, and the values it goes over: `from..to..step`, or a list. @param {string} each @returns {[string, any[]]} */
  const steps = (each) => {
    const [name, over] = split(each, '='), cells = work(), [from, to, by = 1] = over.split('..').map((text) => value(text, cells))
    return [name, !over.includes('..') ? over.split(LIST).map(read) : by > 0 ? Array.from({ length: Math.min(MOST, Math.max(0, Math.floor((to - from) / by + 1e-9) + 1 || 0)) }, (_, i) => from + i * by) : []]
  }
  /** A table of the page: its lines worked out, the rows its forms added, those a choice named as a column keeps. @param {Part} part */
  const tabled = (part) => {
    const [head = '', ...rest] = lines(part), [name, over] = part.attrs.each ? steps(part.attrs.each) : ['', []], cells = work()
    const made = table({ ...part, text: [spell(head, cells), ...rest.flatMap((line) => (part.attrs.each && HOLDS.test(line) ? over.map((at) => spell(line, work({ [name]: at }), name)) : [spell(line, cells)]))].join('\n') })
    return { name, over, heads: made.heads, rows: made.heads.reduce((kept, head, i) => ((now) => (kept.some((row) => row[i] === now) ? kept.filter((row) => row[i] === now) : kept))(choice(head) ? String(base[head]) : null),
      [...made.rows, ...(added.get(part.attrs.id ?? '') ?? []).map((row) => row.map((cell) => cell.replaceAll('|', '¦')))]) }
  }
  const total = (/** @type {string[][]} */ rows, /** @type {number} */ column) => rows.reduce((sum, row) => sum + (number(row[column] ?? '', lang) || 0), 0)
  // Those with no formula first, as those that have one may read what these add up to.
  const shown = new Map([...own].sort((a, b) => Number(Boolean(a.attrs.each) || HOLDS.test(a.text)) - Number(Boolean(b.attrs.each) || HOLDS.test(b.text))).map((part) => {
    const drawn = tabled(part)
    drawn.heads.forEach((head, i) => { base[`sum ${head}`] ??= total(drawn.rows, i) })
    base.count ??= drawn.rows.length
    return [part, drawn]
  }))
  const cells = work()
  /**
   * A chart of a table of the page: for each value of its `by`, the first column unless it says, the sum of each column its `sum` names, or how
   * many; a `sum` that names a value rather than a column, as brains write, that value at each of the table's `each`.
   * @param {Part} part @param {ReturnType<typeof tabled>} of
   */
  const tally = (part, { heads, rows, name: step, over }) => {
    const column = (/** @type {string} */ name) => heads.findIndex((head) => head.toLocaleLowerCase() === name.toLocaleLowerCase()), at = Math.max(0, column(part.attrs.by ?? '')), labels = [...new Set(rows.map((row) => row[at]))]
    const of = (/** @type {string} */ label) => rows.filter((row) => row[at] === label), sums = part.attrs.sum?.split(LIST) ?? []
    return !labels.length ? '' : [labels.join(' | '), ...sums.map((name) => `${name}: ${labels.map((label, i) => plain(column(name) < 0 ? value(name, work({ [step]: over[i] })) : total(of(label), column(name)))).join(', ')}`), ...(sums.length ? [] : [`${heads[at]}: ${labels.map((label) => of(label).length).join(', ')}`])].join('\n')
  }
  /** @param {Part} part @returns {Part} */
  const filled = (part) => {
    const drawn = shown.get(part), from = source(part)
    if (drawn) return { ...part, text: [drawn.heads, ...drawn.rows].map((row) => row.join(' | ')).join('\n') }
    if (!live) return part
    if (part.tag === 'app-card') return { ...part, attrs: { ...part.attrs, heading: spell(part.attrs.heading ?? '', cells) } }
    if (part.tag === 'app-chart') return { ...part, text: from ? tally(part, /** @type {any} */ (shown.get(from))) : lines(part).map((line, i) => (i ? spelled(line, (text, digits) => plain(value(text, cells), digits)) : spell(line, cells))).join('\n') }
    return SPELLED.includes(part.tag) ? { ...part, text: spell(part.text, cells) } : part
  }
  const now = () => [...fields.map(({ label }) => [label, base[label]]), ...worked.map(([name]) => [name, cells[name]])].map(([name, held]) => [name, typeof held === 'number' ? plain(held) : held]).filter(([, held]) => held !== '').map(([name, held]) => `${name}: ${held}`)
    .concat([...added].map(([id, rows]) => `${id}, added: ${rows.map((row) => row.join(' | ')).join('; ')}`)).join('; ')
  return { live, filled, now }
}
