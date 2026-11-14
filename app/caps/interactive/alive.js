// SPDX-License-Identifier: MIT
// A page of parts on its own, live where it lands (./alone.js): never loaded by Jean, it runs in the page that left it, which holds its parts
// drawn as Jean drew them, each marked by its place among them. At each change of a field, a row a form adds to a table of the page or a head
// pressed, what they share is worked out again (./live.js) and written into the parts that show it: the figures, the cards' headings and
// words, the tables' rows, sorted by the head pressed, and the charts, drawn again by ECharts where the page holds it. Nothing is sent.
import { parse, all, figures, table, chart, number, option } from './parts.js'
import { shared } from './live.js'
import { localize } from '../charts/option.js'

/** @import { Part } from './parts.js' */

const root = /** @type {HTMLElement} */ (document.querySelector('app-parts')), lang = document.documentElement.lang
const { source = '', locales = [lang], dark = false, still = false } = JSON.parse(document.getElementById('parts')?.textContent ?? '{}')
const parts = parse(source) ?? [], list = all(parts), tables = list.filter((part) => part.tag === 'app-table')
/** What the user set in the fields, by label; the rows the forms added, by table; how each table is sorted, by its place. */
const [given, added, sorted] = [/** @type {Map<string, string | boolean>} */ (new Map()), /** @type {Map<string, string[][]>} */ (new Map()), /** @type {Map<number, { column: number, down: boolean }>} */ (new Map())]
const collator = new Intl.Collator(locales, { numeric: true })
/** @type {Promise<any> | null} */
let echarts = null

/** A row of cells, the first its row's head where the table names its rows, each in the class its column's head has. @param {unknown[]} cells @param {Element[]} heads @param {boolean} named */
function row(cells, heads, named) {
  const tr = document.createElement('tr')
  cells.forEach((cell, i) => {
    const one = tr.appendChild(document.createElement(i || !named ? 'td' : 'th'))
    if (!i && named) one.setAttribute('scope', 'row')
    one.className = /align-\S+/.exec(heads[i]?.className ?? '')?.[0] ?? ''
    one.append(Object.assign(document.createElement('bdi'), { textContent: String(cell ?? '') }))
  })
  return tr
}

/** A table's rows, sorted as its head says: an amount by its value, any other cell as the language sorts words. @param {Element} node @param {Part} part @param {number} at */
function rows(node, part, at) {
  const made = table(part), heads = [...node.querySelectorAll('thead th')], sort = sorted.get(at), named = node.querySelector('tbody th') !== null
  const amount = sort && /align-/.test(heads[sort.column]?.className ?? ''), by = (/** @type {string} */ a, /** @type {string} */ b) => (amount ? ((x, y) => (Number.isNaN(x) ? 1 : Number.isNaN(y) ? -1 : x - y))(number(a, lang), number(b, lang)) : collator.compare(a, b))
  heads.forEach((head, i) => { const words = head.querySelector('button') ?? head; words.textContent = made.heads[i] ?? ''; sort?.column === i ? head.setAttribute('aria-sort', sort.down ? 'descending' : 'ascending') : head.removeAttribute('aria-sort') })
  node.querySelector('tbody')?.replaceChildren(...(sort ? [...made.rows].sort((a, b) => by(a[sort.column], b[sort.column]) * (sort.down ? -1 : 1)) : made.rows).map((cells) => row(cells, heads, named)))
}

/** A chart drawn again by ECharts, the same one at each change, in the page's type and its language's numbers, still where Jean's Motion was; its numbers as a table under it. @param {HTMLElement & { chart?: any }} node @param {Part} part */
async function drawChart(node, part) {
  const box = /** @type {HTMLElement | null} */ (node.querySelector('.chart')), made = /** @type {any} */ (option(chart(part, lang)))
  const values = [made.series].flat(), axis = [made.xAxis, made.yAxis].flat().find((one) => Array.isArray(one?.data))?.data, body = node.querySelector('.chart-data tbody')
  body?.replaceChildren(...Array.from({ length: Math.max(0, ...values.map((one) => one.data.length)) }, (_, i) => row([axis?.[i] ?? values[0].data[i]?.name ?? i + 1, ...values.map((/** @type {any} */ one) => one.data[i]?.value ?? one.data[i])], [], true)))
  if (!box) return
  const { init } = await (echarts ??= import('echarts'))
  if (!node.chart) (box.replaceChildren(), (node.chart = init(box, dark ? 'dark' : null, { renderer: 'svg' })), new ResizeObserver(() => node.chart.resize()).observe(box))
  node.chart.setOption({ ...localize(made, new Intl.NumberFormat(locales).format), textStyle: { fontFamily: getComputedStyle(box).fontFamily }, backgroundColor: 'transparent', animation: !still })
}

/** Each part that shows what the page shares, as it now stands. */
function draw() {
  const state = shared(parts, { given, added, lang, locales })
  list.forEach((part, at) => {
    const nodes = [...root.querySelectorAll(`[data-part="${at}"]`)], [node] = nodes, shown = state.filled(part)
    if (!node) return
    if (part.tag === 'app-figures') figures(shown).forEach(([value, words], i) => { const [strong, span] = node.children[i]?.children ?? []; if (strong && span) (strong.textContent = value, span.textContent = words) })
    else if (part.tag === 'app-card') { const head = node.querySelector(':scope > h4'); if (head) head.textContent = shown.attrs.heading ?? '' }
    else if (part.tag === '#text') shown.text.trim().split(/\n\s*\n/).forEach((said, i) => { if (nodes[i]) nodes[i].textContent = said.replace(/\s*\n\s*/g, ' ') })
    else if (part.tag === 'app-table') rows(node, shown, at)
    else if (part.tag === 'app-chart' && state.live) void drawChart(/** @type {HTMLElement} */ (node), shown)
  })
}

/** The form a field is in, and its part. @param {EventTarget | null} target */
const formOf = (target) => ((form) => ({ form, part: form ? list[Number(form.getAttribute('data-part'))] : undefined }))(/** @type {HTMLFormElement | null | undefined} */ (/** @type {Element} */ (target).closest?.('form[data-part]')))
/** Whether a form adds a row to a table of the page. @param {Part | undefined} part */
const adds = (part) => Boolean(part?.attrs.to) && tables.some((one) => one.attrs.id === part?.attrs.to)

root.addEventListener('input', ({ target }) => {
  const field = /** @type {HTMLInputElement} */ (target), { form, part } = formOf(target)
  if (!form || adds(part) || !field.name) return
  // A slider and its number are one field.
  for (const twin of form.querySelectorAll(`[name="${CSS.escape(field.name)}"]`)) if (twin !== field) /** @type {HTMLInputElement} */ (twin).value = field.value
  given.set(field.name, field.type === 'checkbox' ? field.checked : field.value)
  draw()
})
root.addEventListener('submit', (event) => {
  event.preventDefault()
  const { form, part } = formOf(event.target), to = part?.attrs.to ?? ''
  if (!form || !adds(part)) return
  const values = [.../** @type {NodeListOf<HTMLInputElement>} */ (form.querySelectorAll('input:not([type=range]), select, textarea'))].map((input) => (input.type === 'checkbox' ? (input.checked ? '✓' : '') : input.value.trim()))
  added.set(to, [...(added.get(to) ?? []), values])
  form.reset()
  draw()
})
root.addEventListener('click', ({ target }) => {
  const button = /** @type {Element} */ (target).closest?.('th .sorts'), node = button?.closest('[data-part]'), head = button?.closest('th')
  if (!button || !node || !head) return
  const at = Number(node.getAttribute('data-part')), column = [...(head.parentElement?.children ?? [])].indexOf(head), sort = sorted.get(at)
  sorted.set(at, { column, down: sort?.column === column && !sort.down })
  draw()
})
// Its charts, drawn by ECharts at once where the page holds it: their tips, and their size following the page's.
if (shared(parts, { given, added, lang, locales }).live) draw()
