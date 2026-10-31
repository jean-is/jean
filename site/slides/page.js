// AI for slides (the job pages, ../excel/job.js), at /slides and /fr/diapos, for the reader who searched for a free AI
// that makes a PowerPoint. Its Try sends sample notes with ?q= (ui/app.js): asked for slides, the brain reads Jean's own
// Slides skill (D401) and writes the deck in the answer, which Jean keeps beside the task, to present and to save as a
// PowerPoint file (D591). The notes' figures are filled in here, and what the deck works out from them is too.
// Its pane plays that task: the deck in the answer, each slide on the layout that shows its point, its words the page's.
import { job } from '../excel/job.js'

/** Sales in each of the first three quarters, and what each of the two new clients bought, as the sample notes give them. */
const QUARTERS = [142_000, 164_000, 184_000]
const CLIENTS = [11_000, 7_000]
const WON = CLIENTS[0] + CLIENTS[1]
const GROWTH = QUARTERS[2] / QUARTERS[1] - 1

/** Euros, whole, as a language writes them. @param {import('../site.js').Kit} kit */
const amount = (kit) => new Intl.NumberFormat(kit.lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format

/** The cover's picture: a sun over hills that climb as the quarters do, it in the corner the title leaves, the rest dark enough for the title's white words. */
const COVER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(/* html */ `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#18171b"/><circle cx="1400" cy="170" r="115" fill="#f7c531"/><path d="M0 700C320 680 560 620 820 540S1300 380 1600 330V900H0Z" fill="#56503f"/><path d="M0 800C380 780 720 720 1020 640S1420 540 1600 500V900H0Z" fill="#3a372f"/></svg>`)}`

/** A slide: its title, and the quarters as bars, the last lit. */
const PANE = /* html */ `<svg class="job-drawn" viewBox="0 0 200 112" aria-hidden="true"><rect class="is-paper" x="8" y="6" width="184" height="100" rx="5"/><rect class="is-title" x="22" y="18" width="92" height="8" rx="4"/>${
  QUARTERS.map((sales, i) => {
    const height = (62 * sales) / Math.max(...QUARTERS)
    return /* html */ `<rect class="${i === QUARTERS.length - 1 ? 'is-lit' : 'is-bar'}" x="${42 + i * 44}" y="${(94 - height).toFixed(1)}" width="28" height="${height.toFixed(1)}" rx="3"/>`
  }).join('')}<path class="is-axis" d="M28 94H178"/></svg>`

export default job({
  addresses: { en: 'slides', fr: 'fr/diapos', ko: 'ko/slides' },
  into: 'ask',
  filled (kit) {
    const money = amount(kit), [first, , last] = QUARTERS
    const change = new Intl.NumberFormat(kit.lang, { style: 'percent', signDisplay: 'exceptZero' })
    const [q1, q2, q3] = QUARTERS.map(money)
    const [c1, c2] = CLIENTS.map(money)
    // A key figure's lead is large and its column narrow: what it sold, short.
    const sold = new Intl.NumberFormat(kit.lang, { style: 'currency', currency: 'EUR', notation: 'compact', maximumSignificantDigits: 3 }).format(last)
    return { params: { q1, q2, q3, c1, c2, sold, clients: money(WON), growth: change.format(GROWTH), since: change.format(last / first - 1), share: new Intl.NumberFormat(kit.lang, { style: 'percent' }).format(WON / (last - QUARTERS[1])) } }
  },
  drawn (kit, { list }) {
    // The deck it wrote, a card a slide, each with its title.
    const titles = list('replay.slides')
    if (titles.length !== 6) throw new Error(`site/slides/${kit.lang}.json: replay.slides is the deck's six titles`)
    const got = /* html */ `<ol class="job-deck">${titles.map((title, i) => /* html */ `<li${i ? '' : ' class="is-lead"'} dir="auto">${title}</li>`).join('')}</ol>`
    return { pane: PANE, got }
  },
  demo (kit, { text, texts }) {
    // As Jean's Slides skill writes a deck: the first slide the lead, a point a slide, its title saying it, on the layout that shows it.
    const [cover, figures, quarters, clients, launch, next] = texts('replay.slides')
    const slide = (/** @type {string} */ layout, /** @type {string} */ body) => `---\nlayout: ${layout}\n---\n\n${body}`
    const items = (/** @type {string} */ key, marker = '-') => texts(key).map((item) => `${marker} ${item}`).join('\n')
    // The quarters as bars, each with its sales, the last lit.
    const bars = QUARTERS.map((value, i) => ({ value, label: { show: true, position: 'top', fontSize: 18, opacity: 1, formatter: amount(kit)(value) }, ...(i < QUARTERS.length - 1 && { itemStyle: { opacity: 0.45 } }) }))
    const chart = { grid: { top: 28, bottom: 28, left: 8, right: 8 }, xAxis: { type: 'category', data: texts('deck.quarters'), axisLabel: { fontSize: 18 } }, yAxis: { show: false }, series: [{ type: 'bar', name: text('deck.sales'), data: bars, barWidth: '55%' }] }
    const slides = [
      `---\nlayout: cover\nimage: "${COVER}"\nalt: "${text('deck.alt')}"\n---\n\n# ${cover}\n\n${text('deck.when')}`,
      slide('metrics', `## ${figures}\n\n${items('deck.figures')}`),
      slide('default', `## ${quarters}\n\n\`\`\`echarts\n${JSON.stringify(chart)}\n\`\`\``),
      slide('bento', `## ${clients}\n\n${items('deck.clients')}`),
      slide('timeline', `## ${launch}\n\n${items('deck.launch')}`),
      slide('process', `## ${next}\n\n${items('deck.next', '1.')}`),
    ]
    return { answer: `${text('pane.answer')}\n\n\`\`\`\`deck\n${slides.join('\n\n')}\n\`\`\`\`` }
  },
})
