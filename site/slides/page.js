// AI for slides (the job pages, ../excel/job.js), at /slides and /fr/diapos, for the reader who searched for a free AI
// that makes a PowerPoint. Its Try sends sample notes with ?q= (ui/app.js): asked for slides, the brain reads Jean's own
// Slides skill (D401) and writes the deck in the answer; asked again, a PowerPoint file comes from the computer
// (the directory's PowerPoint skill, D201). The notes' figures are filled in here, and the growth the deck shows is
// worked out from them.
import { job } from '../excel/job.js'

/** Sales in each of the first three quarters, as the sample notes give them. */
const QUARTERS = [142_000, 164_000, 184_000]
const GROWTH = /** @type {number} */ (QUARTERS.at(-1)) / QUARTERS[QUARTERS.length - 2] - 1

/** A slide: its title, and the quarters as bars, the last lit. */
const PANE = /* html */ `<svg class="job-drawn" viewBox="0 0 200 112" aria-hidden="true"><rect class="is-paper" x="8" y="6" width="184" height="100" rx="5"/><rect class="is-title" x="22" y="18" width="92" height="8" rx="4"/>${
  QUARTERS.map((sales, i) => {
    const height = (62 * sales) / Math.max(...QUARTERS)
    return /* html */ `<rect class="${i === QUARTERS.length - 1 ? 'is-lit' : 'is-bar'}" x="${42 + i * 44}" y="${(94 - height).toFixed(1)}" width="28" height="${height.toFixed(1)}" rx="3"/>`
  }).join('')}<path class="is-axis" d="M28 94H178"/></svg>`

export default job({
  addresses: { en: 'slides', fr: 'fr/diapos' },
  into: 'ask',
  filled (kit) {
    const money = new Intl.NumberFormat(kit.lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const [q1, q2, q3] = QUARTERS.map((sales) => money.format(sales))
    return { params: { q1, q2, q3, growth: new Intl.NumberFormat(kit.lang, { style: 'percent', signDisplay: 'exceptZero' }).format(GROWTH) } }
  },
  drawn (kit, { list }) {
    // The deck it wrote, a card a slide, each with its title.
    const titles = list('replay.slides')
    if (titles.length !== 5) throw new Error(`site/slides/${kit.lang}.json: replay.slides is the deck's five titles`)
    const got = /* html */ `<ol class="job-deck">${titles.map((title, i) => /* html */ `<li${i ? '' : ' class="is-lead"'} dir="auto">${title}</li>`).join('')}</ol>`
    return { pane: PANE, got }
  },
})
