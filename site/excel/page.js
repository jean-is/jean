// AI for Excel (the job pages, job.js), at /excel and /fr/excel, for the reader who searched for AI to analyse a
// spreadsheet or write its formulas. Its Try is the sample spreadsheet in the box with the app's own question
// (?sample, ui/brains.js), and its replay that task, its numbers worked out here from app/caps/files/sales.csv as the
// computer works them out: each product's last month against its first. Its pane plays that task (D462): the program
// that works them out, what it gave back, and the answer with its chart.
import { readFile } from 'node:fs/promises'
import { felt, xml } from '../site.js'
import { job } from './job.js'

/** The sample spreadsheet's rows: month, product, units, revenue. */
const ROWS = (await readFile(new URL('../../app/caps/files/sales.csv', import.meta.url), 'utf8')).trim().split('\n').slice(1).map((line) => line.split(','))
const MONTHS = [...new Set(ROWS.map(([month]) => month))].sort()
const PRODUCTS = [...new Set(ROWS.map(([, product]) => product))]
const units = (/** @type {string} */ month, /** @type {string} */ product) => Number(ROWS.find((row) => row[0] === month && row[1] === product)?.[2])
/** Each product's units in the first month and the last, and its growth, as the sample's answer works them out. */
const GROWTH = PRODUCTS.map((product) => {
  const [first, last] = [units(MONTHS[0], product), units(/** @type {string} */ (MONTHS.at(-1)), product)]
  return { product, first, last, growth: last / first - 1 }
})
const BEST = [...GROWTH].sort((a, b) => b.growth - a.growth)[0]
/** A month of the sample, "2025-01", as a language says it: in full in a sentence, short over a column. */
const month = (/** @type {string} */ lang, /** @type {string} */ at, short = false) => new Intl.DateTimeFormat(lang, { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${at}-15T12:00:00Z`))

/** The program the computer runs on the sample, as the pane's demo shows it: the growth worked out as GROWTH is. @param {string} file */
const program = (file) => `const rows = csv(await file(${JSON.stringify(file)}))
const months = [...new Set(rows.map((row) => row.month))].sort()
const units = (month, product) => rows.find((row) => row.month === month && row.product === product).units
return [...new Set(rows.map((row) => row.product))].map((product) => {
  const [first, last] = [units(months[0], product), units(months.at(-1), product)]
  return { product, first, last, growth: last / first - 1 }
})`

/** The growth as bars from one line, the best one lit: the chart the answer draws, small. */
function chart () {
  const top = Math.max(...GROWTH.map(({ growth }) => growth))
  const bottom = Math.min(0, ...GROWTH.map(({ growth }) => growth))
  const zero = 12 + (88 * top) / (top - bottom)
  const bars = GROWTH.map(({ product, growth }, i) => {
    const height = (88 * Math.abs(growth)) / (top - bottom)
    return /* html */ `<rect class="${product === BEST.product ? 'is-best' : 'is-bar'}" x="${16 + i * 46}" y="${(growth >= 0 ? zero - height : zero).toFixed(1)}" width="30" height="${Math.max(height, 1.5).toFixed(1)}" rx="3"/>`
  }).join('')
  return /* html */ `<svg class="job-chart" viewBox="0 0 200 110" aria-hidden="true"><path class="is-axis" d="M8 ${zero.toFixed(1)}H192"/>${bars}</svg>`
}

export default job({
  addresses: { en: 'excel', fr: 'fr/excel' },
  into: 'sample',
  filled (kit) {
    const number = new Intl.NumberFormat(kit.lang)
    const percent = new Intl.NumberFormat(kit.lang, { style: 'percent', signDisplay: 'exceptZero' })
    return {
      params: { rows: number.format(ROWS.length), products: number.format(PRODUCTS.length), months: number.format(MONTHS.length), first: month(kit.lang, MONTHS[0]), last: month(kit.lang, /** @type {string} */ (MONTHS.at(-1))), growth: percent.format(BEST.growth) },
      names: { product: BEST.product },
    }
  },
  drawn (kit, { list }) {
    const number = new Intl.NumberFormat(kit.lang)
    const percent = new Intl.NumberFormat(kit.lang, { style: 'percent', signDisplay: 'exceptZero' })
    const [product, growth] = list('replay.columns')
    // What the computer worked out, each product's row, the best growth circled.
    const work = /* html */ `<table class="job-table">
      <thead><tr><th scope="col">${product}</th><th scope="col">${xml(month(kit.lang, MONTHS[0], true))}</th><th scope="col">${xml(month(kit.lang, /** @type {string} */ (MONTHS.at(-1)), true))}</th><th scope="col">${growth}</th></tr></thead>
      <tbody>${GROWTH.map((row) => /* html */ `
        <tr><th scope="row"><bdi>${xml(row.product)}</bdi></th><td>${number.format(row.first)}</td><td>${number.format(row.last)}</td><td>${row === BEST ? felt(percent.format(row.growth), 'circle') : percent.format(row.growth)}</td></tr>`).join('')}
      </tbody>
    </table>`
    return { pane: chart(), work, got: chart() }
  },
  demo (kit, text) {
    // The chart the answer draws: each product's growth in whole percents on its bar, as this language writes a percent.
    const percent = new Intl.NumberFormat(kit.lang, { style: 'percent' }).format(1).replace(/\d+/, '{c}')
    // Across, so each product's name has room in a narrow pane.
    const option = {
      grid: { containLabel: true, top: 8, bottom: 8, left: 8, right: 56 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', data: PRODUCTS, inverse: true },
      series: [{ name: /** @type {string[]} */ (kit.raw('replay.columns'))[1], type: 'bar', data: GROWTH.map(({ growth }) => Math.round(growth * 100)), label: { show: true, position: 'right', formatter: percent } }],
    }
    return {
      type: 'text/csv',
      code: program(text('replay.file')),
      output: JSON.stringify(GROWTH.map(({ product, first, last, growth }) => ({ product, first, last, growth: Number(growth.toFixed(3)) })), null, 2),
      answer: `${text('pane.answer')}\n\n\`\`\`echarts\n${JSON.stringify(option)}\n\`\`\``,
    }
  },
})
