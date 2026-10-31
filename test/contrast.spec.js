// Contrast (D325, WCAG 2.2 AA, 1.4.3): every word on screen against what is actually drawn behind it, in
// every look, by night and by day; in the room's own look at every step of its warmth, with the
// light at its brightest for each of Jean's moods and in each project's colour (D78). Pixels, not
// tokens: the light is a gradient under the text, and a look's panels are glass over it. The words
// are hidden, the page is photographed, and each one's colour is laid over the pixels it covered.
// Chromium only: what is measured is the style sheets, the same in every engine.
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, openTasks, closeTasks } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

test.skip(({ browserName }) => browserName !== 'chromium', 'pixels are compared in one engine')
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })

/** Jean's moods, each with its light at the brightest its animation reaches, and still at rest (ui/style.css). */
const MOODS = { idle: 0.42, listening: 0.62, thinking: 0.7, answering: 0.78 }
/** The projects' lights (caps/projects/projects.js): Jean's sunflower, its former water, Tilde's grey, then only the hue changes. */
const TINTS = ['oklch(0.845 0.161 88)', 'oklch(0.781 0.118 209)', 'oklch(0.74 0.012 90)', ...[150, 260, 295, 325, 355].map((hue) => `oklch(0.74 0.17 ${hue})`)]

/**
 * Every visible word's colour and box, and how large it is; then the words hidden. In the page.
 * @returns {{ text: string, where: string, colours: number[][], large: boolean, rects: number[][] }[]}
 */
function measure() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
  const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }))
  /** A CSS colour as sRGB 0–255 and alpha 0–1. @param {string} colour */
  const rgba = (colour) => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = '#000'
    context.fillStyle = colour
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const modal = document.querySelector(':modal')
  /** @param {Element} element */
  const opacity = (element) => { let o = 1; for (let e = /** @type {Element | null} */ (element); e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  /** @param {Element} element */
  const where = (element) => {
    const parts = []
    for (let e = /** @type {Element | null} */ (element); e && e !== document.body && parts.length < 4; e = e.parentElement) {
      parts.unshift(e.localName + (e.id ? `#${e.id}` : '') + [...e.classList].slice(0, 2).map((name) => `.${name}`).join(''))
    }
    return parts.join(' > ')
  }
  /** The part of a box its scrolling and clipping ancestors leave in view, none of a line they cut. @param {Element} element @param {DOMRect} rect */
  const visible = (element, rect) => {
    let [x0, y0, x1, y1] = [rect.left, rect.top, rect.right, rect.bottom]
    for (let e = element.parentElement; e; e = e.parentElement) {
      const style = getComputedStyle(e)
      if (style.overflowX === 'visible' && style.overflowY === 'visible' && style.clipPath === 'none') continue
      // A box clips what overflows it at its padding's edge, inside its border.
      const box = e.getBoundingClientRect(), left = box.left + e.clientLeft, top = box.top + e.clientTop
      ;[x0, y0, x1, y1] = [Math.max(x0, left), Math.max(y0, top), Math.min(x1, left + e.clientWidth), Math.min(y1, top + e.clientHeight)]
    }
    ;[x0, y0, x1, y1] = [Math.max(x0, 0), Math.max(y0, 0), Math.min(x1, innerWidth), Math.min(y1, innerHeight)]
    // A line cut by the edge of what scrolls is read once scrolled to, whole: what shows of it is no word to judge.
    return x1 - x0 >= 2 && y1 - y0 >= Math.max(4, rect.height - 1) ? [x0, y0, x1, y1] : null
  }
  /** Whether nothing that takes the pointer covers the middle of a box. @param {Element} element @param {number[]} r */
  const uncovered = (element, [x0, y0, x1, y1]) => {
    const hit = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2)
    return !hit || element.contains(hit) || hit.contains(element)
  }
  const found = []
  /** @param {Element} element @param {DOMRect[]} rects @param {string} text @param {string[]} colours */
  const add = (element, rects, text, colours) => {
    if (modal && !modal.contains(element) && !element.closest(':popover-open')) return
    if (element.closest(':disabled, [aria-disabled="true"], .visually-hidden')) return
    const style = getComputedStyle(element)
    const size = parseFloat(style.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
    const fade = opacity(element)
    const kept = rects.map((rect) => visible(element, rect)).filter((r) => r !== null && uncovered(element, r))
    if (!kept.length || fade < 0.05) return
    found.push({ text: text.trim().slice(0, 40), where: where(element), large, rects: kept,
      colours: colours.map(rgba).map(([r, g, b, a]) => [r, g, b, a * fade]).filter((c) => c[3] > 0) })
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement
    if (!element || !node.nodeValue?.trim() || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const style = getComputedStyle(element)
    // Words painted by a gradient (background-clip: text) are as strong as its weakest colour.
    const painted = [style.backgroundClip, style.webkitBackgroundClip].includes('text')
    const colours = painted ? [...style.backgroundImage.matchAll(/(?:oklch|oklab|rgba?|hsla?|color|lab|lch)\([^()]*\)/g)].map((m) => m[0]) : [style.webkitTextFillColor || style.color]
    const range = document.createRange()
    range.selectNodeContents(node)
    add(element, [...range.getClientRects()], node.nodeValue, colours)
  }
  // A box's placeholder, while it shows.
  for (const box of document.querySelectorAll('input:placeholder-shown, textarea:placeholder-shown')) {
    if (!box.checkVisibility()) continue
    const style = getComputedStyle(box)
    const rect = box.getBoundingClientRect()
    const inset = new DOMRect(rect.left + parseFloat(style.paddingInlineStart), rect.top + parseFloat(style.paddingBlockStart), Math.min(rect.width / 2, 200), parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4)
    add(box, [inset], box.getAttribute('placeholder') ?? '', [getComputedStyle(box, '::placeholder').color])
  }
  const hide = new CSSStyleSheet()
  // In a layer: an important declaration in a layer outweighs any unlayered one, whatever its selector.
  hide.replaceSync(`@layer hidden {
    *, *::before, *::after, ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }
    .hero-question, .check.is-running span { background: none !important; }
  }`)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, hide]
  return found
}

/** The words that fall short, given the photograph of the page without them. In the page. */
async function judge({ found, png }) {
  // Decoded here: the page's policy fetches nothing from data: (connect-src).
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' }))
  const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height })
  const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }))
  context.drawImage(bitmap, 0, 0)
  const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height)
  document.adoptedStyleSheets = document.adoptedStyleSheets.slice(0, -1)
  const linear = (/** @type {number} */ v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const luminance = (/** @type {number[]} */ [r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  const short = []
  for (const item of found) {
    const ratios = []
    for (const [x0, y0, x1, y1] of item.rects) {
      for (let y = Math.ceil(y0); y < Math.floor(y1); y += 2) {
        for (let x = Math.ceil(x0); x < Math.floor(x1); x += 2) {
          const i = (y * width + x) * 4
          const under = [data[i], data[i + 1], data[i + 2]]
          for (const [r, g, b, a] of item.colours) {
            const over = [r, g, b].map((v, k) => v * a + under[k] * (1 - a))
            const [hi, lo] = [luminance(over), luminance(under)].sort((p, q) => q - p)
            ratios.push((hi + 0.05) / (lo + 0.05))
          }
        }
      }
    }
    if (!ratios.length) continue
    // The weakest tenth: a word over a gradient is read where it is faintest, a stray line under it ignored.
    const ratio = ratios.sort((p, q) => p - q)[Math.floor(ratios.length / 10)]
    const need = item.large ? 3 : 4.5
    if (ratio < need - 0.02) short.push({ text: item.text, where: item.where, ratio: Math.round(ratio * 100) / 100, need })
  }
  return short
}

/**
 * Measures the page as it is now, adding what falls short to `failures` under `label`.
 * @param {import('@playwright/test').Page} page @param {string} label @param {Map<string, string>} failures
 */
async function audit(page, label, failures) {
  const found = await page.evaluate(measure)
  expect(found.length, `words measured in ${label}`).toBeGreaterThan(5)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const png = (await page.screenshot()).toString('base64')
  for (const { text, where, ratio, need } of await page.evaluate(judge, { found, png })) {
    const key = `${where} “${text}”`
    const worst = failures.get(key)
    if (!worst || Number(worst.split(' ')[0]) > ratio) failures.set(key, `${ratio} < ${need} ${label}`)
  }
}

/** The room's light held at a mood's brightest, its warmth and its colour set as ui/app.js sets them (CSSOM). */
async function light(page, { mood = 'idle', warmth = null, tint = null } = {}) {
  await page.evaluate(({ mood, brightest, warmth, tint }) => {
    const root = document.documentElement
    /** @type {any} */ const held = (window.held ??= new CSSStyleSheet())
    if (!document.adoptedStyleSheets.includes(held)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, held]
    held.replaceSync(`.room { animation: none !important; --light: ${brightest} !important; }`)
    root.dataset.presence = mood
    if (warmth !== null) root.style.setProperty('--warmth', String(warmth))
    if (tint) root.style.setProperty('--tint', tint)
    else root.style.removeProperty('--tint')
  }, { mood, brightest: MOODS[mood], warmth, tint })
}

/** Whether this look shows the room's light at all. @param {import('@playwright/test').Page} page */
const lit = (page) => page.locator('.room').evaluate((room) => getComputedStyle(room).display !== 'none' && getComputedStyle(room).backgroundImage !== 'none')

/** By night or by day, once the page follows the device (ui/app.js). @param {import('@playwright/test').Page} page @param {'dark' | 'light'} scheme */
async function daylight(page, scheme) {
  await page.emulateMedia({ colorScheme: scheme })
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
}

/**
 * Every mood, by night and by day, in this look; the room's warmth and the projects' colours where they show.
 * @param {number[]} warmths the room's steps: every one, or its first and last, between which its paper moves in a line
 */
async function everyStage(page, look, screen, failures, warmths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  for (const scheme of /** @type {const} */ (['dark', 'light'])) {
    await daylight(page, scheme)
    const shows = await lit(page)
    for (const warmth of look === 'room' ? warmths : [null]) {
      for (const mood of shows ? Object.keys(MOODS) : ['idle']) {
        await light(page, { mood, warmth })
        await audit(page, `${look} ${scheme} ${screen} ${mood}${warmth === null ? '' : ` warmth ${warmth}`}`, failures)
      }
    }
    if (shows) {
      for (const tint of TINTS) {
        await light(page, { mood: 'answering', warmth: 9, tint })
        await audit(page, `${look} ${scheme} ${screen} answering in ${tint}`, failures)
      }
    }
    await light(page)
  }
}

/** The comparison the fake brain answers with a table, in the languages it knows it in. */
const PLANS = { en: 'Compare the phone plans', ar: 'قارن باقات الهاتف', ja: '携帯プランを比べて' }
// Every look in English, a language changing the words but not their colours; Tilde, where Jean starts, right to left, whose
// lines the light reaches from the other side; and the room with more contrast asked for (prefers-contrast: more).
const RUNS = [...Object.keys(LOOKS).map((look) => [look, 'en']), ['tilde', 'ar'], ['room', 'en', 'more']]

for (const [look, lang, contrast = 'no-preference'] of RUNS) {
  test(`every word reads at AA in ${look} (${lang}${contrast === 'more' ? ', more contrast' : ''}), by night and by day, at every stage of the light`, async ({ page }) => {
    test.setTimeout(look === 'room' ? 480_000 : 180_000)
    const failures = new Map()
    const warmths = lang === 'en' && contrast !== 'more' ? undefined : [0, 9]
    await page.emulateMedia({ contrast: /** @type {'more' | 'no-preference'} */ (contrast) })
    await start(page, lang)
    await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
    if (look === 'room') await expect(page.locator('html')).not.toHaveAttribute('data-look')
    else await expect(page.locator('html')).toHaveAttribute('data-look', look)
    // The first visit: the welcome, no brain yet.
    await everyStage(page, look, 'welcome', failures, warmths)
    expect(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches)).toBe(contrast === 'more')
    // A conversation: a request, an answer with a table, its buttons and the line under the box.
    await connectFakeBrain(page)
    await ask(page, PLANS[lang])
    await expect(page.locator('.msg-jean:not(.is-streaming) .prose .table.is-compare')).toBeVisible()
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await everyStage(page, look, 'conversation', failures, warmths)
    // Settings, and the tasks in the drawer.
    const dialogs = JSON.parse(readFileSync(new URL(`../app/locales/dialogs/${lang}.json`, import.meta.url), 'utf8'))
    for (const section of ['settings.general', 'settings.capabilities'].map((key) => dialogs[key])) {
      await openSettings(page, section)
      for (const scheme of /** @type {const} */ (['dark', 'light'])) {
        await daylight(page, scheme)
        await audit(page, `${look} ${scheme} Settings › ${section}`, failures)
      }
      await closeSettings(page)
    }
    await openTasks(page)
    for (const scheme of /** @type {const} */ (['dark', 'light'])) {
      await daylight(page, scheme)
      await audit(page, `${look} ${scheme} tasks`, failures)
    }
    await closeTasks(page).catch(() => {})
    expect([...failures].map(([key, value]) => `${value}: ${key}`).sort()).toEqual([])
  })
}
