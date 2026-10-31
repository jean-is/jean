// Reflow and resized text (WCAG 2.2 AA, 1.4.10 and 1.4.4): at 320 by 256 CSS pixels, a 1280 by 1024
// screen zoomed to 400%, and with the browser's text at 200%, nothing is lost: the page never scrolls
// sideways (a table or a strip of buttons may, in a box of its own), no words are cut, and every line
// can be scrolled into view, out from under the header and the box. The first screen, a conversation
// with an answer, Settings and the tasks, in every look. Chromium only: what is measured is the style
// sheets, the same in every engine; the text's size is the browser's own setting, which Chromium's
// protocol sets.
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, openTasks } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

test.skip(({ browserName }) => browserName !== 'chromium', 'the same style sheets in every engine')

/**
 * What is lost: lines outside the window, sideways, and not in a box that scrolls on its own; words
 * cut by their box, other than a control's own label ended with an ellipsis (its name is still
 * whole, and what it opens says it); lines that can't be brought into view. In the page.
 */
function lost() {
  const doc = /** @type {HTMLElement} */ (document.scrollingElement)
  const modal = document.querySelector(':modal')
  /** @param {Element} element */
  const where = (element) => {
    const parts = []
    for (let e = /** @type {Element | null} */ (element); e && e !== document.body && parts.length < 3; e = e.parentElement) {
      parts.unshift(e.localName + [...e.classList].slice(0, 2).map((name) => `.${name}`).join(''))
    }
    return parts.join(' > ')
  }
  /** @param {Element} element */
  const shown = (element) => (!modal || modal.contains(element) || !!element.closest(':popover-open')) && element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  /** @param {Element} element */
  const scroller = (element) => {
    for (let e = element.parentElement; e; e = e.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth) return e
    }
    return null
  }
  const found = []
  if (doc.scrollWidth > doc.clientWidth) found.push(`the page scrolls sideways by ${doc.scrollWidth - doc.clientWidth} px`)
  // The link to the box shows only when the keyboard reaches it.
  const lines = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement
    if (element && node.nodeValue?.trim() && shown(element) && !element.closest('.visually-hidden, [aria-hidden="true"], .skip')) lines.push(/** @type {Text} */ (node))
  }
  for (const node of lines) {
    const element = /** @type {Element} */ (node.parentElement)
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()].filter((rect) => rect.width >= 1)
    if (rects.some((rect) => rect.right > innerWidth + 1 || rect.left < -1) && !scroller(element)) found.push(`outside: ${where(element)} “${node.nodeValue?.trim().slice(0, 30)}”`)
  }
  for (const element of document.querySelectorAll('body *')) {
    if (!shown(element) || element.closest('.visually-hidden')) continue
    const style = getComputedStyle(element)
    if (!['hidden', 'clip'].includes(style.overflowX) || element.scrollWidth <= element.clientWidth + 1 || !element.textContent?.trim()) continue
    if (style.textOverflow === 'ellipsis' && element.closest('button, a')) continue
    found.push(`cut: ${where(element)} “${element.textContent.trim().slice(0, 30)}”`)
  }
  for (const node of lines) {
    const element = /** @type {Element} */ (node.parentElement)
    const range = document.createRange()
    range.selectNodeContents(node)
    // Seen: in the window, and what is there at its middle is it.
    const seen = () => [...range.getClientRects()].filter((rect) => rect.width >= 1).some((rect) => {
      const x = Math.min(Math.max((rect.left + rect.right) / 2, 1), innerWidth - 1), y = Math.min(Math.max((rect.top + rect.bottom) / 2, 1), innerHeight - 1)
      const hit = document.elementFromPoint(x, y)
      return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && !!hit && (element.contains(hit) || hit.contains(element))
    })
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    let ok = seen()
    // Not at the middle of the window: the page scrolled so the line's middle is at each height in turn.
    for (let y = 2; !ok && y < innerHeight; y += 6) {
      const rect = range.getClientRects()[0]
      if (!rect) break
      doc.scrollBy(0, (rect.top + rect.bottom) / 2 - y)
      ok = seen()
    }
    if (!ok) found.push(`out of reach: ${where(element)} “${node.nodeValue?.trim().slice(0, 30)}”`)
  }
  doc.scrollTo(0, 0)
  return found
}

/**
 * Measures the page as it is now, adding what is lost to `failures` under `label`.
 * @param {import('@playwright/test').Page} page @param {string} label @param {Set<string>} failures
 */
async function audit(page, label, failures) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  for (const item of await page.evaluate(lost)) failures.add(`${label}: ${item}`)
}

const PLANS = { en: 'Compare the phone plans', ar: 'قارن باقات الهاتف', ja: '携帯プランを比べて' }
// 1280 by 1024 at 400%; and with the text at 200%, on a laptop's window and in the same window zoomed to 200%.
const SIZES = { reflow: { width: 320, height: 256, text: 1 }, text: { width: 1280, height: 800, text: 2 }, zoom: { width: 640, height: 400, text: 1 } }
// Every look in English at 320 px; large text in Tilde, where Jean starts, Mondrian, whose thick lines take the most room,
// and Terminal, whose letters do; Tilde right to left and in Japanese, and zoomed.
const RUNS = [
  ...Object.keys(LOOKS).map((look) => [look, 'en', 'reflow']),
  ...['tilde', 'mondrian', 'terminal'].map((look) => [look, 'en', 'text']),
  ...['ar', 'ja'].flatMap((lang) => [['tilde', lang, 'reflow'], ['tilde', lang, 'text']]),
  ['tilde', 'en', 'zoom'],
]

for (const [look, lang, size] of RUNS) {
  const { width, height, text } = SIZES[/** @type {keyof typeof SIZES} */ (size)]
  test(`nothing is lost in ${look} (${lang}) at ${width} by ${height}${text > 1 ? `, text at ${text * 100}%` : ''}`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height })
    if (text > 1) {
      const session = await page.context().newCDPSession(page)
      await session.send('Page.setFontSizes', { fontSizes: { standard: 16 * text, fixed: 13 * text } })
    }
    const failures = new Set()
    await start(page, lang)
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(16 * text)
    await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
    await audit(page, 'welcome', failures)
    await connectFakeBrain(page)
    await ask(page, PLANS[/** @type {keyof typeof PLANS} */ (lang)])
    await expect(page.locator('.msg-jean:not(.is-streaming) .prose .table.is-compare')).toBeVisible()
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await audit(page, 'conversation', failures)
    const dialogs = JSON.parse(readFileSync(new URL(`../app/locales/dialogs/${lang}.json`, import.meta.url), 'utf8'))
    for (const section of ['settings.general', 'settings.capabilities'].map((key) => dialogs[key])) {
      await openSettings(page, section)
      await audit(page, `Settings › ${section}`, failures)
      await closeSettings(page)
    }
    await openTasks(page)
    await audit(page, 'tasks', failures)
    expect([...failures].sort()).toEqual([])
  })
}
