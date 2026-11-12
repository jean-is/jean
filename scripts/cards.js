// SPDX-License-Identifier: MIT
// Draws the pictures a link to the brand's own site shows, one per language of its homepage (D682): the name on a
// browser tab, as Jean is one, with that page's promise under it, at Open Graph's size. And the one a link to a share
// shows, the same for every share: a link, with no word and no name (host/card.png, D361). No word sits on the sunflower
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
import { CARD } from '../host/host.js'
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

/** What every card is drawn with: the display face, the mark, the site's sans. */
async function faces () {
  const [display, favicon, style] = await Promise.all([readFile(join(APP, 'fonts/display.woff2')), readFile(join(APP, 'icons/favicon.svg')), readFile(join(APP, 'ui/style.css'), 'utf8')])
  const sans = /--sans:\s*([^;]+);/.exec(style)?.[1]
  if (!sans) throw new Error('app/ui/style.css has no --sans')
  return { display: display.toString('base64'), favicon: favicon.toString('base64'), sans }
}

/** Where the share host's card is kept: `npm run host` puts it in the viewer the host is given (D361). */
export const HOST_CARD = fileURLToPath(new URL('../host/card.png', import.meta.url))

/**
 * The card a link to a share shows, the same for every share and every host, since the host can't read one: a link, with
 * no word to translate and no name.
 */
export async function hostCard () {
  const { width, height } = CARD
  const page = /* html */ `<!doctype html>
<html><meta charset="utf-8"><style>* { margin: 0; } html, body { width: ${width}px; height: ${height}px; background: ${INK}; overflow: hidden; } svg { display: block; }</style>
<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${width / 2 - 132} ${height / 2 - 132}) scale(11)" fill="none" stroke="${PAPER}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13.5a3.5 3.5 0 0 0 4.95 0l3.54-3.54a3.5 3.5 0 0 0-4.95-4.95l-1.06 1.06M14 10.5a3.5 3.5 0 0 0-4.95 0l-3.54 3.54a3.5 3.5 0 0 0 4.95 4.95l1.06-1.06"/>
  </g>
</svg></html>`
  return { ...CARD, lang: 'share', file: HOST_CARD, page, source: `scripts/cards.js sha256:${createHash('sha256').update(page).digest('hex')}` }
}

/** Every card as it should be drawn: its address in app/, its size, its page, and what the PNG records it came from. */
export async function cards () {
  const { display, favicon, sans } = await faces()
  return Promise.all((await languagesOf('home')).map(async (lang) => {
    const { promise } = /** @type {{ promise: string }} */ (await wordsOf('home', lang))
    const card = cardOf(lang, promise, BRAND)
    const page = pageOf({ lang, promise, name: BRAND.name, width: card.width, height: card.height, display, sans, favicon })
    return { ...card, lang, file: join(APP, card.src), page, source: `scripts/cards.js sha256:${createHash('sha256').update(page).digest('hex')}` }
  }))
}

async function main () {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const { sans } = await faces()
  try {
    for (const { file, width, height, lang, page: html, source } of [...await cards(), await hostCard()]) {
      const page = await browser.newPage({ viewport: { width, height } })
      await page.setContent(html)
      await page.evaluate(() => document.fonts.ready.then(() => true))
      const size = await page.evaluate(({ largest, room, sans }) => {
        const words = /** @type {HTMLElement | null} */ (document.querySelector('.words'))
        if (!words) return 0
        // A letter the display face lacks, as Polish's ą or Romanian's ț, is drawn by whichever face follows it, as wide as
        // that face makes it: such words are set in the site's sans, whole.
        const pen = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'))
        const wide = (/** @type {string} */ letter, /** @type {string} */ after) => { pen.font = `700 100px Display, ${after}`; return pen.measureText(letter).width }
        if ([...words.textContent ?? ''].some((letter) => wide(letter, 'monospace') !== wide(letter, 'serif'))) words.style.fontFamily = sans
        const fitted = Math.min(largest, Math.floor(largest * room / Math.max(...[...words.children].map((line) => line.getBoundingClientRect().width))))
        words.style.fontSize = `${fitted}px`
        return fitted
      }, { largest: LARGEST, room: width - 2 * TAB.start, sans })
      const png = recordSource(await page.screenshot({ type: 'png' }), source)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, png)
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
