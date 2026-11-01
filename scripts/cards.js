// Draws the pictures a link to the brand's own site shows, one per language of its homepage (D682): the name on a
// browser tab, as Jean is one, with that page's promise under it, at Open Graph's size. No word sits on the sunflower
// (docs/design.md). Each PNG records the hash of the page it was drawn from, so the tests notice when a promise, a face or
// this drawing changes and the PNGs don't. What the display face can't write comes from the system's faces, as the
// site's titles do, so the pictures are this machine's, as the screenshots are.
// Needs Playwright's Chromium, as the e2e tests do (npx playwright install chromium).
// Usage: npm run cards
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BRAND } from '../app/brand.js'
import { dir } from '../app/core/i18n.js'
import { ICONS, languagesOf, wordsOf, xml } from '../site/site.js'
import { recordSource } from './icons.js'
import { cardOf } from './manifest.js'

const APP = fileURLToPath(new URL('../app', import.meta.url))
const SUN = '#f7c531'
const INK = '#141414'
const PAPER = '#f1f0ec'
const SOFT = '#a8a7a3'
/** The tab, on a 1200 × 630 card. */
const TAB = { start: 60, width: 636, top: 38, floor: 238, radius: 56, flare: 38, icon: 114 }
/** The words' largest size; a longer line is set smaller, and the other with it. */
const LARGEST = 104

/** The promise, broken after its first comma, whichever a language writes. @param {string} promise */
export function linesOf (promise) {
  const at = promise.search(/[,،、，]/)
  return at < 0 ? [promise] : [promise.slice(0, at + 1).trim(), promise.slice(at + 1).trim()]
}

/**
 * A card as a page. A line the display face can write is set in it; any other in the site's sans, whole, since a face
 * changing inside a line is worse than either.
 * @param {{ lang: string, promise: string, name: string, width: number, height: number, display: string, sans: string, favicon: string }} card
 */
function pageOf ({ lang, promise, name, width, height, display, sans, favicon }) {
  const rtl = dir(lang) === 'rtl'
  const x = (/** @type {number} */ at) => (rtl ? width - at : at)
  const { start, top, floor, radius, flare, icon } = TAB
  const end = start + TAB.width
  const middle = top + 100
  const tab = `M0 ${height}V${floor}H${start - flare}A${flare} ${flare} 0 0 0 ${start} ${floor - flare}V${top + radius}A${radius} ${radius} 0 0 1 ${start + radius} ${top}H${end - radius}A${radius} ${radius} 0 0 1 ${end} ${top + radius}V${floor - flare}A${flare} ${flare} 0 0 0 ${end + flare} ${floor}H${width}V${height}Z`
  /** One of the site's glyphs, centred here. @param {string} glyph @param {number} centre @param {number} scale @param {string} colour */
  const mark = (glyph, centre, scale, colour) => /* html */ `<g color="${colour}" transform="translate(${x(centre) - 12 * scale} ${middle - 12 * scale}) scale(${scale})">${glyph}</g>`
  const latin = /^[\p{Script=Latin}\p{Script=Common}]+$/u.test(promise)
  return /* html */ `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><meta charset="utf-8"><style>
  @font-face { font-family: Display; font-weight: 700; src: url(data:font/woff2;base64,${display}) format('woff2'); }
  * { margin: 0; }
  html, body { width: ${width}px; height: ${height}px; background: ${SUN}; overflow: hidden; }
  svg.card { position: absolute; inset: 0; display: block; }
  .icon { stroke-width: 2.4; stroke-linecap: round; }
  .words { position: absolute; inset-inline: ${start}px; inset-block: ${floor}px 0; display: flex; flex-direction: column; justify-content: center; padding-block-end: 12px;
    color: ${PAPER}; font: 700 ${LARGEST}px/1.14 ${latin ? 'Display, ' : ''}${sans}; }
  .words span { inline-size: fit-content; white-space: nowrap; }
</style>
<svg class="card" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <path d="${tab}" fill="${INK}"${rtl ? ` transform="translate(${width} 0) scale(-1 1)"` : ''}/>
  <image x="${rtl ? x(start + 48) - icon : start + 48}" y="${middle - icon / 2}" width="${icon}" height="${icon}" href="data:image/svg+xml;base64,${favicon}"/>
  <text x="${x(start + 196)}" y="${middle + 40}" font-family="Display" font-weight="700" font-size="128" fill="${PAPER}" direction="ltr" text-anchor="${rtl ? 'end' : 'start'}">${xml(name)}</text>
  ${mark(ICONS.close, start + 556, 3.3, SOFT)}
  ${mark(ICONS.plus, end + 106, 4.7, INK)}
</svg>
<p class="words">${linesOf(promise).map((line) => /* html */ `<span>${xml(line)}</span>`).join('')}</p></html>`
}

/** Every card as it should be drawn: its address in app/, its size, its page, and what the PNG records it came from. */
export async function cards () {
  const [display, favicon, style] = await Promise.all([readFile(join(APP, 'fonts/display.woff2')), readFile(join(APP, 'icons/favicon.svg')), readFile(join(APP, 'ui/style.css'), 'utf8')])
  const sans = /--sans:\s*([^;]+);/.exec(style)?.[1]
  if (!sans) throw new Error('app/ui/style.css has no --sans')
  return Promise.all((await languagesOf('home')).map(async (lang) => {
    const { promise } = /** @type {{ promise: string }} */ (await wordsOf('home', lang))
    const card = cardOf(lang, promise, BRAND)
    const page = pageOf({ lang, promise, name: BRAND.name, width: card.width, height: card.height, display: display.toString('base64'), sans, favicon: favicon.toString('base64') })
    return { ...card, lang, page, source: `scripts/cards.js sha256:${createHash('sha256').update(page).digest('hex')}` }
  }))
}

async function main () {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  try {
    for (const { src, width, height, lang, page: html, source } of await cards()) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.setContent(html)
      await page.evaluate(() => document.fonts.ready.then(() => true))
      const size = await page.evaluate(([largest, room]) => {
        const words = /** @type {HTMLElement} */ (document.querySelector('.words'))
        const fitted = Math.min(largest, Math.floor(largest * room / Math.max(...[...words.children].map((line) => line.getBoundingClientRect().width))))
        words.style.fontSize = `${fitted}px`
        return fitted
      }, [LARGEST, width - 2 * TAB.start])
      const png = recordSource(await page.screenshot({ type: 'png' }), source)
      await mkdir(dirname(join(APP, src)), { recursive: true })
      await writeFile(join(APP, src), png)
      await page.close()
      console.log(`cards: ${lang}, words at ${size}px, ${Math.round(png.length / 1024)} KB`)
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`cards: ${error.message}`)
    process.exit(1)
  })
}
