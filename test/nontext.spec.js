// Non-text contrast (WCAG 2.2 AA, 1.4.11, D420): what tells a control or its state apart reads at 3:1
// against what is beside it, in every look, by night and by day, at rest and with the light at its
// brightest. The icon that is a button's only name, against the pixels behind it; a text box's frame,
// at rest and lit while it has the keyboard, and the mark on the Settings section and the task open:
// across each edge, its strongest pixel (a border, a bevel, a ring, or its fill) against the page just
// outside; and the ring the keyboard's focus draws, against what it covers. Pixels, as
// test/contrast.spec.js measures words: Chromium draws borders and shadows on whole pixels. Chromium only.
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, openTasks, closeTasks } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

test.skip(({ browserName }) => browserName !== 'chromium', 'pixels are compared in one engine')
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })

/**
 * What to measure on screen, and then the icons and words hidden. In the page.
 * @param {boolean} framesOnly only the text boxes' frames, the message box lit
 * @returns {{ glyphs: { name: string, colours: number[][], rect: number[] }[], frames: { name: string, bands: number[][] }[] }}
 */
function collect(framesOnly) {
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
  const shown = (element) => (!modal || modal.contains(element) || !!element.closest(':popover-open')) && element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  /** @param {Element} element */
  const opacity = (element) => { let o = 1; for (let e = /** @type {Element | null} */ (element); e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  /** @param {Element} element */
  const where = (element) => {
    const parts = []
    for (let e = /** @type {Element | null} */ (element); e && e !== document.body && parts.length < 3; e = e.parentElement) {
      parts.unshift(e.localName + [...e.classList].slice(0, 2).map((name) => `.${name}`).join(''))
    }
    return `${parts.join(' > ')} “${(element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}”`
  }
  /** Whether a point is in the window and nothing that takes the pointer covers it there. @param {Element} element @param {number} x @param {number} y */
  const seen = (element, x, y) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false
    const hit = document.elementFromPoint(x, y)
    return !hit || element.contains(hit) || hit.contains(element)
  }
  // The icons that are all a control shows of itself.
  const glyphs = []
  for (const svg of framesOnly ? [] : document.querySelectorAll('svg.icon')) {
    const control = svg.closest('button, a[href], summary, [role="button"]')
    if (!control || !shown(svg) || control.closest(':disabled, [aria-disabled="true"]') || /[\p{L}\p{N}]/u.test(/** @type {HTMLElement} */ (control).innerText)) continue
    const box = svg.getBoundingClientRect()
    if (!seen(control, (box.left + box.right) / 2, (box.top + box.bottom) / 2)) continue
    const fade = opacity(svg)
    const colours = new Set()
    for (const part of [svg, ...svg.querySelectorAll('*')]) {
      const style = getComputedStyle(part)
      if (style.stroke !== 'none' && parseFloat(style.strokeWidth) !== 0) colours.add(style.stroke)
      if (part !== svg && style.fill !== 'none') colours.add(style.fill)
    }
    glyphs.push({ name: where(control), rect: [box.left, box.top, box.right, box.bottom],
      colours: [...colours].map(rgba).map(([r, g, b, a]) => [r, g, b, a * fade]).filter((c) => c[3] > 0) })
  }
  // Text boxes (the message box's frame is the form around it, unless the box draws its own, as Classic's
  // sunken field) and the marks on what is open: every 4 pixels round, corners left out, the pixel 4
  // outside the edge, beyond a focus halo, against those from 3 outside to 6 inside.
  const frames = []
  /** @param {Element} field */
  const framed = (field) => { const style = getComputedStyle(field); return style.boxShadow !== 'none' || parseFloat(style.borderTopWidth) > 0 }
  const boxes = [...document.querySelectorAll('textarea, input:not([type="radio"], [type="checkbox"], [type="range"], [type="color"], [type="file"], [type="hidden"], .visually-hidden)')]
    .map((field) => (!framed(field) && field.closest('.composer')) || field)
  const marks = framesOnly ? [] : [...document.querySelectorAll('.settings-nav [aria-current="page"], .history-list li.is-current')]
  for (const element of [...new Set(boxes)].filter((box) => !framesOnly || box.matches('.composer, #prompt')).concat(marks)) {
    if (!shown(element)) continue
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const radius = Math.min(Math.max(parseFloat(style.borderTopLeftRadius) || 0, parseFloat(style.borderTopRightRadius) || 0), Math.min(box.width, box.height) / 2)
    const bands = []
    const edge = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ dx, /** @type {number} */ dy) => {
      // (dx, dy) points outwards; (x, y) is the edge's own pixel.
      const band = []
      for (let d = 4; d >= -6; d--) band.push(Math.round(x + dx * d), Math.round(y + dy * d))
      const [ox, oy] = band
      if (seen(element, band.at(-2), band.at(-1)) && ox >= 0 && oy >= 0 && ox < innerWidth && oy < innerHeight) bands.push(band)
    }
    for (let x = box.left + radius + 3; x < box.right - radius - 3; x += 4) { edge(x, box.top, 0, -1); edge(x, box.bottom - 1, 0, 1) }
    for (let y = box.top + radius + 3; y < box.bottom - radius - 3; y += 4) { edge(box.left, y, -1, 0); edge(box.right - 1, y, 1, 0) }
    if (bands.length) frames.push({ name: where(element), bands })
  }
  const hide = new CSSStyleSheet()
  hide.replaceSync(`@layer hidden {
    *, *::before, *::after, ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }
    svg.icon, .tip { visibility: hidden !important; }
    .hero-question { background: none !important; }
  }`)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, hide]
  return { glyphs, frames }
}

/** What falls short of 3:1, given the photograph of the page without its words and icons. In the page. */
async function judge({ found, png }) {
  const linear = (/** @type {number} */ v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const luminance = (/** @type {number[]} */ [r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  const ratio = (/** @type {number[]} */ p, /** @type {number[]} */ q) => { const [hi, lo] = [luminance(p), luminance(q)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' }))
  const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height })
  const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }))
  context.drawImage(bitmap, 0, 0)
  const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height)
  document.adoptedStyleSheets = document.adoptedStyleSheets.slice(0, -1)
  const pixel = (/** @type {number} */ x, /** @type {number} */ y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2]] }
  const over = (/** @type {number[]} */ [r, g, b, a], /** @type {number[]} */ under) => [r, g, b].map((v, k) => v * a + under[k] * (1 - a))
  /** The weakest tenth: a mark is seen where it is faintest, a stray pixel ignored. @param {number[]} ratios */
  const weakest = (ratios) => ratios.sort((p, q) => p - q)[Math.floor(ratios.length / 10)]
  const short = []
  for (const { name, colours, rect: [x0, y0, x1, y1] } of found.glyphs) {
    const ratios = []
    for (let y = Math.ceil(y0); y < Math.floor(y1); y += 2) {
      for (let x = Math.ceil(x0); x < Math.floor(x1); x += 2) {
        const under = pixel(x, y)
        // An icon of two colours is read by the stronger.
        ratios.push(Math.max(...colours.map((colour) => ratio(over(colour, under), under))))
      }
    }
    if (ratios.length && weakest(ratios) < 2.98) short.push({ name: `icon ${name}`, ratio: weakest(ratios) })
  }
  for (const { name, bands } of found.frames) {
    const ratios = bands.map((band) => {
      const outside = pixel(band[0], band[1])
      let best = 1
      for (let i = 2; i < band.length; i += 2) best = Math.max(best, ratio(pixel(band[i], band[i + 1]), outside))
      return best
    })
    if (weakest(ratios) < 2.98) short.push({ name: `frame ${name}`, ratio: weakest(ratios) })
  }
  return short.map(({ name, ratio }) => ({ name, ratio: Math.round(ratio * 100) / 100 }))
}

/**
 * Photographs the page as it is now and adds what falls short to `failures` under `label`.
 * @param {import('@playwright/test').Page} page @param {string} label @param {Map<string, string>} failures @param {boolean} [framesOnly]
 */
async function measure(page, label, failures, framesOnly = false) {
  const found = await page.evaluate(collect, framesOnly)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const png = (await page.screenshot()).toString('base64')
  for (const { name, ratio } of await page.evaluate(judge, { found, png })) {
    const worst = failures.get(name)
    if (!worst || Number(worst.split(' ')[0]) > ratio) failures.set(name, `${ratio} < 3 ${label}`)
  }
}

/**
 * The ring each control the keyboard reaches draws, against what it covers: photographed focused, then
 * not, its box and a little round it, one of each kind of control. The message box's is its frame, lit.
 * @param {import('@playwright/test').Page} page @param {string} label @param {Map<string, string>} failures
 */
async function rings(page, label, failures) {
  await page.evaluate(() => {
    const quiet = /** @type {any} */ (window).quiet ??= new CSSStyleSheet()
    quiet.replaceSync('.tip { display: none !important; }')
    if (!document.adoptedStyleSheets.includes(quiet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, quiet]
    Object.assign(window, { first: null })
  })
  const seen = new Set()
  for (let stop = 0; stop < 80; stop++) {
    await page.keyboard.press('Tab')
    const found = await page.evaluate((stop) => {
      const focused = document.activeElement
      if (!focused || focused === document.body) return null
      const first = /** @type {any} */ (window).first ??= focused
      const box = focused.getBoundingClientRect()
      const kind = `${focused.localName}.${[...focused.classList].join('.')}[${focused.getAttribute('role') ?? ''}]`
      const clip = { x: Math.max(0, Math.floor(box.left - 6)), y: Math.max(0, Math.floor(box.top - 6)) }
      Object.assign(clip, { width: Math.min(innerWidth, Math.ceil(box.right + 6)) - clip.x, height: Math.min(innerHeight, Math.ceil(box.bottom + 6)) - clip.y })
      return { kind, clip, back: first === focused && stop > 0, prompt: focused.id === 'prompt', name: `${kind} “${(focused.getAttribute('aria-label') ?? focused.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}”`,
        perimeter: 2 * (Math.min(box.width, innerWidth) + Math.min(box.height, innerHeight)), visible: clip.width > 0 && clip.height > 0 && focused.matches(':focus-visible') }
    }, stop)
    if (!found) continue
    if (found.back) break
    if (seen.has(found.kind) || found.prompt || !found.visible) { seen.add(found.kind); continue }
    seen.add(found.kind)
    const focused = (await page.screenshot({ clip: found.clip })).toString('base64')
    await page.evaluate(() => { /** @type {any} */ (window).was = document.activeElement; /** @type {HTMLElement} */ (document.activeElement).blur() })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const plain = (await page.screenshot({ clip: found.clip })).toString('base64')
    await page.evaluate(() => /** @type {any} */ (window).was.focus())
    const strong = await page.evaluate(async ({ focused, plain }) => {
      const linear = (/** @type {number} */ v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      const luminance = (/** @type {number[]} */ [r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
      const ratio = (/** @type {number[]} */ p, /** @type {number[]} */ q) => { const [hi, lo] = [luminance(p), luminance(q)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
      const read = async (/** @type {string} */ png) => {
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' }))
        const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height })
        const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }))
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data
      }
      const [a, b] = [await read(focused), await read(plain)]
      let count = 0
      for (let i = 0; i < a.length; i += 4) if (ratio([a[i], a[i + 1], a[i + 2]], [b[i], b[i + 1], b[i + 2]]) >= 2.98) count++
      return count
    }, { focused, plain })
    // A ring round the box, at least half of it drawn (a dotted one), where every pixel drawn stands out.
    if (strong < found.perimeter * 0.5) failures.set(`ring ${found.name}`, `${strong} of ${Math.round(found.perimeter)} px ${label}`)
  }
}

/** The room's light held at its brightest, as Jean answers, or let go. @param {import('@playwright/test').Page} page @param {boolean} on */
async function brightest(page, on) {
  await page.evaluate((on) => {
    const held = /** @type {any} */ (window).held ??= new CSSStyleSheet()
    if (!document.adoptedStyleSheets.includes(held)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, held]
    held.replaceSync(on ? '.room { animation: none !important; --light: 0.78 !important; }' : '')
    document.documentElement.dataset.presence = on ? 'answering' : 'idle'
  }, on)
}

/** Both schemes of one screen: at rest, the message box lit, the light at its brightest where it shows, then the rings. */
async function screen(page, label, failures) {
  for (const scheme of /** @type {const} */ (['dark', 'light'])) {
    await page.emulateMedia({ colorScheme: scheme })
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
    await page.mouse.move(0, 0)
    await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur())
    await measure(page, `${label} ${scheme}`, failures)
    const prompt = page.locator('#prompt')
    if (await prompt.isVisible() && !(await page.locator(':modal').count())) {
      await prompt.focus()
      await measure(page, `${label} ${scheme}, the box lit`, failures, true)
      await prompt.blur()
    }
    const lit = await page.locator('.room').evaluate((room) => getComputedStyle(room).display !== 'none' && getComputedStyle(room).backgroundImage !== 'none')
    if (lit) {
      await brightest(page, true)
      await measure(page, `${label} ${scheme}, the light at its brightest`, failures)
      await brightest(page, false)
    }
    await rings(page, `${label} ${scheme}`, failures)
  }
}

const PLANS = { en: 'Compare the phone plans', ar: 'قارن باقات الهاتف', ja: '携帯プランを比べて' }
// Every look in English; Tilde, where Jean starts, and the room, whose light this is, right to left and in Japanese.
const RUNS = [...Object.keys(LOOKS).map((look) => [look, 'en']), ['tilde', 'ar'], ['tilde', 'ja'], ['room', 'ar'], ['room', 'ja']]

for (const [look, lang] of RUNS) {
  test(`what tells controls apart reads at 3:1 in ${look} (${lang}), by night and by day`, async ({ page }) => {
    test.setTimeout(240_000)
    const failures = new Map()
    await start(page, lang)
    await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
    await page.waitForFunction((look) => look === 'room' || [...document.styleSheets].some((sheet) => sheet.href?.endsWith(`ui/looks/${look}.css`)), look)
    await screen(page, `${look} welcome`, failures)
    await connectFakeBrain(page)
    await ask(page, PLANS[/** @type {keyof typeof PLANS} */ (lang)])
    await expect(page.locator('.msg-jean .prose .table.is-compare')).toBeVisible()
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-presence', 'idle')
    await screen(page, `${look} conversation`, failures)
    // Settings: General, and About you, whose name and instructions are text boxes.
    const dialogs = JSON.parse(readFileSync(new URL(`../app/locales/dialogs/${lang}.json`, import.meta.url), 'utf8'))
    for (const section of ['settings.general', 'settings.you'].map((key) => dialogs[key])) {
      await openSettings(page, section)
      await screen(page, `${look} Settings › ${section}`, failures)
      await closeSettings(page)
    }
    await openTasks(page)
    await screen(page, `${look} tasks`, failures)
    await closeTasks(page).catch(() => {})
    expect([...failures].map(([key, value]) => `${value}: ${key}`).sort()).toEqual([])
  })
}
