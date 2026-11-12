// SPDX-License-Identifier: MIT
// AI for diagrams (the job pages, ../excel/job.js), at /diagrams and /fr/schemas, for the reader who searched for a free
// AI that draws a flowchart, a mind map or a timeline. "Visual answers" is what Jean calls them, and its eyebrow says so,
// but searched, "visual" means pictures, so its address and title say what people type. Its Try sends a sample process
// with ?q= (ui/app.js), and its pane plays the flowchart that comes back. Under the promise, what else Jean draws, each
// in its own demo: a loan whose sliders work there and then, as Jean works out a page of parts itself (D670), a mind map
// of a report, a plan's key figures, timeline and checklist, /excel's chart, and a map as a sketch, as a demo reaches no
// map service (D291).
import { demoFiles, demoFrame } from '../demo.js'
import { ICONS, felt, xml } from '../site.js'
import { job } from '../excel/job.js'

/** The stops the sketch shows, as a map would place them: longitude and latitude. */
const STOPS = [[4.84, 45.76], [5.37, 43.3], [7.26, 43.7]]
const place = (/** @type {number[]} */ [lon, lat]) => [Math.round((lon - 3.6) * 72), Math.round((46.4 - lat) * 72)]

/** A map as a sketch: the land to the sea's edge, and the stops on their route. @param {string[]} names @param {string} alt */
function sketch (names, alt) {
  const [lyon, marseille, nice] = STOPS.map(place)
  const stops = [lyon, marseille, nice].map(([x, y], i) => /* html */ `<circle class="is-stop" cx="${x}" cy="${y}" r="6"/><text x="${i === 1 ? x - 12 : x + 12}" y="${i === 1 ? y - 8 : y + 5}"${i === 1 ? ' text-anchor="end"' : ''}>${xml(names[i])}</text>`).join('')
  return /* html */ `<svg class="job-map" viewBox="0 -110 320 420" role="img" aria-label="${xml(alt)}"><path class="is-land" d="M0 -110H320V186C300 188 280 192 263 200C235 214 205 240 168 238C150 238 140 230 127 228C95 226 50 204 20 204C12 204 6 208 0 212Z"/><path class="is-coast" d="M320 186C300 188 280 192 263 200C235 214 205 240 168 238C150 238 140 230 127 228C95 226 50 204 20 204C12 204 6 208 0 212"/><path class="is-route" d="M${lyon[0]} ${lyon[1]}C95 90 118 150 ${marseille[0]} ${marseille[1]}C165 232 225 226 ${nice[0]} ${nice[1]}"/>${stops}</svg>`
}

/** The sample process as a flowchart, as Visual answers writes one, each box in the page's words. @param {(key: string) => string} text */
function flowchart (text) {
  const box = (/** @type {string} */ key) => JSON.stringify(text(`flow.${key}`))
  return `flowchart TD
  A([${box('ask')}]) --> B{${box('under')}}
  B -->|${box('yes')}| C[${box('refund')}]
  B -->|${box('no')}| D[${box('check')}]
  D --> E{${box('fine')}}
  E -->|${box('yes')}| C
  E -->|${box('no')}| F[${box('credit')}]`
}

/** A report's themes as a mind map, as Visual answers writes one. @param {string} root @param {string[][]} branches */
const mindMap = (root, branches) => `mindmap\n  root((${root}))\n${branches.map(([branch, ...leaves]) => `    ${branch}\n${leaves.map((leaf) => `      ${leaf}`).join('\n')}`).join('\n')}`

/**
 * The loan as a page of parts, Visual answers' own example, which Jean works out at each change (D670). Its fields' first
 * words name them in its formulas; what it works out keeps names of its own, which never show.
 * @param {(key: string) => string} text @param {(key: string) => string[]} texts
 */
export function loan (text, texts) {
  const [amount, rate, years] = texts('page.fields')
  const [Amount, Rate, Years] = [amount, rate, years].map((field) => field.split(' ')[0])
  const [year, left] = texts('page.heads')
  const money = (/** @type {string} */ formula) => text('page.money').replace('#', `{${formula}}`)
  return `<app-form>
${amount}: 1000..100000..500 = 15000
${rate}: 0.1..15..0.1 = 4.9
${years}: 1..10 = 5
</app-form>
<app-values>
Monthly = ${Rate} / 1200
Payment = ${Amount} * Monthly / (1 - (1 + Monthly) ^ (-12 * ${Years}))
Balance = ${Amount} * (1 + Monthly) ^ (12 * Y) - Payment * ((1 + Monthly) ^ (12 * Y) - 1) / Monthly
</app-values>
<app-figures>
${money('Payment:2')} | ${text('page.month')}
${money(`Payment * 12 * ${Years} - ${Amount}:2`)} | ${text('page.interest')}
</app-figures>
<app-cards>
<app-card heading="${text('page.chart')}">
<app-chart kind="area" from="plan" by="${year}" sum="${left}"></app-chart>
</app-card>
<app-card heading="${text('page.table')}">
<app-table id="plan" each="Y = 0..${Years}">
${year} | ${left}
{Y} | ${money('Balance:0')}
</app-table>
</app-card>
</app-cards>`
}

export default job({
  addresses: { en: 'diagrams', fr: 'fr/schemas', ko: 'ko/diagrams' },
  into: 'ask',
  tall: true,
  exact: [ICONS.app, ICONS.computer, ICONS.clock],
  // What an AI on this computer, a map and a picture can't do, under the task; the AI behind it, what it understood, its formulas and where work lives, under what makes it one to trust.
  limits: { task: [3, 4, 5], trust: [0, 1, 2, 6] },
  filled (kit) {
    const money = new Intl.NumberFormat(kit.lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format
    const percent = new Intl.NumberFormat(kit.lang, { style: 'percent', maximumFractionDigits: 1 }).format
    return { params: { limit: money(50), big: money(500), amount: money(15_000), rate: percent(0.049) } }
  },
  drawn: () => ({ pane: '' }),
  demo: (kit, { text }) => ({ answer: `\`\`\`mermaid\n${flowchart(text)}\n\`\`\`\n\n${text('pane.answer')}` }),
  tasks (kit, { text, texts }) {
    const brain = text('demo.brain')
    const lines = (/** @type {string} */ key) => texts(key).map((line) => `- ${line}`).join('\n')
    const branches = /** @type {string[][]} */ (kit.raw('mind.branches'))
    return {
      ...demoFiles(kit, { brain, asked: text('page.ask'), answer: `\`\`\`html\n${loan(text, texts)}\n\`\`\`\n\n${text('page.answer')}` }, 'diagrams/page'),
      ...demoFiles(kit, { brain, file: { name: text('mind.file'), type: 'application/pdf' }, asked: text('mind.ask'), answer: `\`\`\`mermaid\n${mindMap(text('mind.root'), branches)}\n\`\`\`\n\n${text('mind.answer')}` }, 'diagrams/mind-map'),
      ...demoFiles(kit, { brain, asked: text('plan.ask'), answer: `${lines('plan.figures')}\n\n${text('plan.weeks')}\n\n${lines('plan.dates')}\n\n${text('plan.left')}\n\n${lines('plan.todo')}` }, 'diagrams/plan'),
    }
  },
  shows (kit, { say, text }) {
    const frame = (/** @type {string} */ page, /** @type {string} */ title) => demoFrame(kit, false, { page, title, play: '' })
    const card = (/** @type {string} */ key, /** @type {string} */ shown, more = '', wide = false) => /* html */ `<li${wide ? ' class="is-wide"' : ''}><h4>${say(`${key}.title`)}</h4><p>${wide ? felt(say(`${key}.try`), 'under') : ''} ${say(`${key}.text`)}${more}</p><div class="job-shown">${shown}</div></li>`
    const excel = kit.link('excel')
    return /* html */ `<section class="site-block" aria-labelledby="job-shows">
  <header><h3 id="job-shows">${say('shows.title')}</h3><p class="site-why">${say('shows.why')}</p></header>
  <ul class="job-shows">
    ${card('page', frame('diagrams/page', text('page.frame')), '', true)}
    ${card('mind', frame('diagrams/mind-map', text('mind.frame')))}
    ${card('plan', frame('diagrams/plan', text('plan.frame')))}
    ${card('chart', frame('excel', text('chart.frame')), excel ? /* html */ ` <a href="${excel}">${say('chart.more')}</a>` : '')}
    ${card('places', sketch(/** @type {string[]} */ (kit.raw('places.names')), text('places.alt')))}
  </ul>
</section>`
  },
})
