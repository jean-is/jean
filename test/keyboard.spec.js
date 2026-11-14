// SPDX-License-Identifier: MIT
// A keyboard on the screen over the box (ui/keyboard.js). A car's browser, a wide touchscreen with no mouse, says
// nothing of its keyboard: a box touched rises under the bar while it has the keys, its / menu under it, and goes back
// when they leave it, in a new task as in one under way. Where the browser says what the keyboard leaves, the window
// shorter or what is seen of it, the box sits just above it. With a mouse, none of it loads.
import { test, expect } from '@playwright/test'
import { connectFakeBrain, ask, answered } from './helpers.js'

/** The box's top and bottom, and the bar's bottom, as drawn. @param {import('@playwright/test').Page} page */
const places = (page) => page.evaluate(() => {
  const box = /** @type {Element} */ (document.querySelector('app-shell form.composer')).getBoundingClientRect()
  return { top: box.top, bottom: box.bottom, bar: /** @type {Element} */ (document.querySelector('app-shell > .bar')).getBoundingClientRect().bottom }
})

/** Where the box rests, without any keyboard. @param {import('@playwright/test').Page} page */
const resting = (page) => expect.poll(() => page.locator('app-shell form.composer').evaluate((form) => /** @type {HTMLElement} */ (form).style.translate)).toBe('')

test.describe('on a touchscreen whose browser says nothing of its keyboard', () => {
  test.use({ viewport: { width: 1280, height: 760 }, hasTouch: true })

  test('the box touched rises under the bar while it has the keys, its / menu under it, and goes back after', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('.hero-question')).toBeVisible()
    // The box doesn't take the keys by itself on a touchscreen; it is under the question, the window being wide.
    await expect(page.locator('#prompt')).not.toBeFocused()
    await expect(page.locator('html')).toHaveAttribute('data-centred', '')
    const before = await places(page)
    expect(before.top).toBeGreaterThan(300)

    await page.locator('#prompt').tap()
    await expect(page.locator('#prompt')).toBeFocused()
    await expect.poll(async () => { const now = await places(page); return Math.round(now.top - now.bar) }).toBe(8)
    await expect(page.locator('app-shell form.composer')).toHaveAttribute('data-risen', '')
    // What is written, all of it, stays in sight under the bar.
    await page.keyboard.type('A long request to take back, word by word')
    await expect.poll(async () => { const now = await places(page); return Math.round(now.top - now.bar) }).toBe(8)
    // The / menu opens under the box, where there is room, not above it, off the window.
    await page.locator('#prompt').fill('')
    await page.keyboard.type('/')
    const menu = page.locator('app-shell .complete')
    await expect(menu).toBeVisible()
    const [box, list] = await Promise.all([places(page), menu.boundingBox()])
    expect(list?.y).toBeGreaterThan(box.bottom)
    await page.keyboard.press('Escape')

    // Touched elsewhere, the box lets the keys go, and goes back to its place.
    await page.locator('.hero-question').tap()
    await expect(page.locator('#prompt')).not.toBeFocused()
    await expect.poll(async () => Math.round((await places(page)).top)).toBe(Math.round(before.top))
    await resting(page)
    await expect(page.locator('app-shell form.composer')).not.toHaveAttribute('data-risen')
  })

  test('in a task under way, the box at the foot rises under the bar too, and a box touched again stays there', async ({ page }) => {
    await page.goto('./')
    await connectFakeBrain(page)
    await page.locator('#prompt').tap()
    await ask(page, 'Hello')
    await answered(page)
    await page.locator('.msg-jean .prose').last().tap()
    await expect(page.locator('#prompt')).not.toBeFocused()
    await resting(page)
    const before = await places(page)
    expect(before.bottom).toBeGreaterThan(600)

    await page.locator('#prompt').tap()
    await expect.poll(async () => { const now = await places(page); return Math.round(now.top - now.bar) }).toBe(8)
    // Touched again, as when its keyboard comes back, it stays where it is.
    await page.locator('#prompt').tap()
    await page.waitForTimeout(900)
    const again = await places(page)
    expect(Math.round(again.top - again.bar)).toBe(8)
  })

  test('where the browser says its keyboard took part of the window, the box sits just above it instead', async ({ page }) => {
    await page.goto('./')
    await connectFakeBrain(page)
    await page.locator('#prompt').tap()
    await ask(page, 'Hello')
    await answered(page)
    await page.locator('.msg-jean .prose').last().tap()

    // The window shorter, as a phone's is under its keyboard: the box at its foot, as the room puts it, nothing assumed.
    await page.locator('#prompt').tap()
    await page.setViewportSize({ width: 1280, height: 420 })
    await page.waitForTimeout(900)
    const shorter = await places(page)
    expect(shorter.bottom).toBeLessThanOrEqual(420)
    expect(shorter.bottom).toBeGreaterThan(380)
    await resting(page)
    await page.locator('.msg-jean .prose').last().tap()
    await page.setViewportSize({ width: 1280, height: 760 })

    // What is seen of the window shorter, the window as tall, as a keyboard over the page that the browser tells of.
    await page.evaluate(() => {
      const seen = /** @type {VisualViewport} */ (visualViewport)
      Object.defineProperty(seen, 'height', { configurable: true, get: () => 400 })
    })
    await page.locator('#prompt').tap()
    await page.evaluate(() => /** @type {VisualViewport} */ (visualViewport).dispatchEvent(new Event('resize')))
    await expect.poll(async () => Math.round((await places(page)).bottom)).toBe(392)
    await page.waitForTimeout(900)
    expect(Math.round((await places(page)).bottom)).toBe(392)
    await expect(page.locator('app-shell form.composer')).not.toHaveAttribute('data-risen')
  })
})

test('with a mouse, nothing of it loads, and the box stays where it is', async ({ page }) => {
  const asked = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (request.url().endsWith('/ui/keyboard.js')) asked.push(request.url()) })
  await page.goto('./')
  await expect(page.locator('#prompt')).toBeFocused()
  await page.locator('#prompt').click()
  await page.waitForTimeout(900)
  await resting(page)
  expect(asked).toEqual([])
})
