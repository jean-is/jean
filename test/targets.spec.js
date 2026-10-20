// Target size (WCAG 2.2 AA, 2.5.8): everything the pointer can press is at least 24 by 24 CSS pixels,
// or far enough from the others that a 24-pixel circle centred on it meets no other target and no
// other small one's circle. No exception taken, not even for links in a line of text. The first
// screen, a conversation with an answer, its + menu, the user's menu, Settings and the tasks, in
// every look, on a laptop and on a phone. Chromium only: what is measured is the style sheets.
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openProfile, openSettings, closeSettings, openTasks } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

test.skip(({ browserName }) => browserName !== 'chromium', 'the same style sheets in every engine')

/** The targets too small and too close to another, and how many were measured. In the page. */
function crowded() {
  const modal = document.querySelector(':modal')
  /** @param {Element} element */
  const where = (element) => {
    const parts = []
    for (let e = /** @type {Element | null} */ (element); e && e !== document.body && parts.length < 3; e = e.parentElement) {
      parts.unshift(e.localName + [...e.classList].slice(0, 2).map((name) => `.${name}`).join(''))
    }
    return `${parts.join(' > ')} “${(/** @type {HTMLElement} */ (element).innerText || element.getAttribute('aria-label') || '').trim().slice(0, 30)}”`
  }
  const targets = []
  for (const element of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"], [role="option"], [role="menuitem"]')) {
    if (modal && !modal.contains(element) && !element.closest(':popover-open')) continue
    if (element.closest('.visually-hidden') || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const rect = element.getBoundingClientRect()
    if (rect.width >= 1 && rect.height >= 1) targets.push({ element, rect, centre: [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2] })
  }
  const small = targets.filter(({ rect }) => rect.width < 23.95 || rect.height < 23.95)
  /** Whether a 24-pixel circle at (x, y) meets a box. @param {number[]} centre @param {DOMRect} rect */
  const meets = ([x, y], rect) => Math.max(rect.left - x, 0, x - rect.right) ** 2 + Math.max(rect.top - y, 0, y - rect.bottom) ** 2 < 144 - 0.01
  const found = []
  for (const target of small) {
    // A target inside another (a button in a summary) is pressed with it.
    const others = targets.filter((other) => other !== target && !other.element.contains(target.element) && !target.element.contains(other.element))
    const near = others.filter((other) => meets(target.centre, other.rect) || (small.includes(other) && Math.hypot(target.centre[0] - other.centre[0], target.centre[1] - other.centre[1]) < 24 - 0.01))
    if (near.length) found.push(`${Math.round(target.rect.width)}×${Math.round(target.rect.height)} ${where(target.element)}, beside ${near.map((other) => where(other.element)).join(', ')}`)
  }
  return { count: targets.length, found }
}

/**
 * Measures the page as it is now, adding what is crowded to `failures` under `label`.
 * @param {import('@playwright/test').Page} page @param {string} label @param {Set<string>} failures
 */
async function audit(page, label, failures) {
  const { count, found } = await page.evaluate(crowded)
  expect(count, `targets measured in ${label}`).toBeGreaterThan(3)
  for (const item of found) failures.add(`${label}: ${item}`)
}

const PLANS = { en: 'Compare the phone plans', ar: 'قارن باقات الهاتف', ja: '携帯プランを比べて' }
const SIZES = { laptop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }
// Every look in English on a laptop; Tilde, where Jean starts, on a phone and right to left and in Japanese.
const RUNS = [...Object.keys(LOOKS).map((look) => [look, 'en', 'laptop']), ...['en', 'ar', 'ja'].map((lang) => ['tilde', lang, 'phone']), ['tilde', 'ar', 'laptop'], ['tilde', 'ja', 'laptop']]

for (const [look, lang, size] of RUNS) {
  test(`every target is 24 pixels or spaced in ${look} (${lang}) on a ${size}`, async ({ page }) => {
    await page.setViewportSize(SIZES[/** @type {keyof typeof SIZES} */ (size)])
    const failures = new Set()
    await start(page, lang)
    await page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id }), look)
    await audit(page, 'welcome', failures)
    await connectFakeBrain(page)
    await ask(page, PLANS[/** @type {keyof typeof PLANS} */ (lang)])
    await expect(page.locator('.msg-jean:not(.is-streaming) .prose .table.is-compare')).toBeVisible()
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await audit(page, 'conversation', failures)
    await page.locator('.composer .add').click()
    await expect(page.locator('#add-menu')).toBeVisible()
    await audit(page, '+ menu', failures)
    await page.keyboard.press('Escape')
    await openProfile(page)
    await audit(page, 'your menu', failures)
    await page.keyboard.press('Escape')
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
