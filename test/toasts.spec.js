// Toasts: each one closes, with its own button or swiped aside either way, the new version's too; a swipe cut short
// brings it back, and its buttons stay buttons. In Arabic and Japanese once.
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

/** Where a toast's words begin, clear of its buttons. @param {import('@playwright/test').Locator} toast */
const grip = (toast) => toast.evaluate((element) => {
  const box = element.getBoundingClientRect()
  return { x: getComputedStyle(element).direction === 'rtl' ? box.right - 8 : box.left + 8, y: box.top + box.height / 2, width: box.width }
})

/** Drags a toast across by `by` pixels, in `ms` or at once. @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} toast @param {number} by @param {number} [ms] */
async function swipe(page, toast, by, ms = 0) {
  const { x, y } = await grip(toast)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + by, y, { steps: 8 })
  if (ms) await page.waitForTimeout(ms)
  await page.mouse.up()
}

for (const lang of ['en', 'ar', 'ja']) {
  test(`a toast closes with its button or swiped aside, the new version's too, and comes back from a short swipe (${lang})`, async ({ page }) => {
    const strings = JSON.parse(readFileSync(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8'))
    // In English it slides away and back; in the others, with less motion, it goes and comes back at once.
    if (lang === 'en') await page.emulateMedia({ reducedMotion: 'no-preference' })
    await start(page, lang)
    await page.evaluate(() => import('/ui/swipe.js'))
    const toasts = page.locator('app-toasts .toast'), close = { name: strings['action.close'], exact: true }

    // Its own button, beside Undo.
    await page.evaluate(async () => (await import('/ui/state.js')).notify('Saved', { label: 'Undo', run: () => {}, undo: true }, 60e3))
    await expect(toasts).toHaveCount(1)
    await toasts.getByRole('button', close).click()
    await expect(toasts).toHaveCount(0)

    // The new version's, which stays until it is let in or put away.
    await page.evaluate(async () => { (await import('/ui/state.js')).app.updateReady.value = /** @type {ServiceWorker} */ (/** @type {unknown} */ ({})) })
    const update = toasts.filter({ hasText: strings['update.ready'].replace('{name}', 'Jean') })
    await expect(update).toBeVisible()
    await expect(update.getByRole('button', { name: strings['update.reload'] })).toBeVisible()
    await expect(update.getByRole('button', close)).toBeVisible()
    // Slowly, short of a third of its width, it comes back where it was, once it had arrived.
    await update.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
    const { width } = await grip(update), was = (await update.boundingBox())?.x
    await swipe(page, update, -width / 6, 500)
    await expect.poll(async () => (await update.boundingBox())?.x).toBeCloseTo(was ?? 0, 0)
    await expect.poll(() => update.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
    // Past it, it goes, and the version waits for the next time Jean opens.
    await swipe(page, update, -width / 2)
    await expect(toasts).toHaveCount(0)
    expect(await page.evaluate(async () => (await import('/ui/state.js')).app.updateReady.value)).toBeNull()

    // The other way, a toast with no button but its own goes too.
    await page.evaluate(async () => (await import('/ui/state.js')).notify('Copied', undefined, 60e3))
    await expect(toasts).toHaveCount(1)
    await swipe(page, toasts, (await grip(toasts)).width / 2)
    await expect(toasts).toHaveCount(0)
    expect(await page.evaluate(async () => (await import('/ui/state.js')).app.toast.value)).toBeNull()

    // A press on its button is a press, never a swipe.
    await page.evaluate(async () => (await import('/ui/state.js')).notify('Saved', { label: 'Undo', run: () => { document.documentElement.dataset.undone = '' } }, 60e3))
    await toasts.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-undone', '')
  })
}
