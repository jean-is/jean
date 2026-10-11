// Pages in answers (D289): a ```html block is a page that runs in the answer, in every room, in a
// frame of the preview's kind (scripts only, nothing to or from the internet), shown as it is
// written, in the room's colours and the user's language, as tall as it is. A click on its button
// sends the user's next message; it can chart with the ECharts Jean lends it; Copy gives its source;
// with Run its code off, it is code.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings } from './helpers.js'

/** The language, picked in Settings as start() picks it. @param {import('@playwright/test').Page} page @param {string} lang */
async function speak(page, lang) {
  const settings = await openSettings(page)
  await settings.locator('.settings-panel select').first().selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await closeSettings(page)
}

test('a page runs in the answer as it is written, sends what it works out on a click, and follows the language', async ({ page }) => {
  const leaks = /** @type {string[]} */ ([])
  page.on('response', (response) => { if (response.url().includes('/leak')) leaks.push(response.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make me a bill splitter')

  // Its frame begins while the answer writes it, and is the one that holds the whole page.
  const writing = page.locator('.msg-jean.is-streaming app-page iframe')
  await expect(writing).toHaveCount(1)
  await writing.evaluate((element) => { element.dataset.begun = '' })
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const answer = page.locator('.msg-jean .prose').last()
  const frame = answer.locator('app-page iframe')
  await expect(frame).toHaveAttribute('data-begun', '')

  // In an opaque frame, scripts only, named for those who can't see it, as tall as the page.
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(frame).toHaveAttribute('title', 'Interactive page')
  const inside = frame.contentFrame()
  await expect(inside.locator('#each')).toHaveText('30')
  const tall = await inside.locator('html').evaluate((element) => /** @type {HTMLElement} */ (element).offsetHeight)
  await expect.poll(() => frame.evaluate((element) => element.clientHeight)).toBe(tall)
  await expect(inside.locator('html')).toHaveAttribute('dir', 'ltr')
  const text = await inside.locator('p').first().evaluate((element) => getComputedStyle(element).color)
  const soft = await page.evaluate(() => { const probe = document.createElement('p'); probe.style.color = 'var(--ink-soft)'; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color })
  expect(text).toBe(soft)

  // Typed, worked out in the page; sent on a click as the user's next message.
  await inside.locator('#people').fill('3')
  await expect(inside.locator('#each')).toHaveText('40')
  await inside.getByRole('button', { name: 'Ask how to round it' }).click()
  await expect(page.locator('.msg-user').last()).toHaveText('Each of us pays 40. How should we round it?')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)

  // Copy: its source.
  const first = page.locator('.msg-jean .prose app-page').first()
  await page.evaluate(() => { /** @type {any} */ (window).copied = new Promise((resolve) => { navigator.clipboard.writeText = async (text) => resolve(text) }) })
  await first.hover()
  await first.getByRole('button', { name: 'Copy' }).click()
  expect(await page.evaluate(() => /** @type {any} */ (window).copied)).toBe(await first.getAttribute('source'))
  expect(leaks).toEqual([])

  // Right to left in Arabic, and in Japanese: the page is written again in the user's language.
  await speak(page, 'ar')
  await expect(first.locator('iframe').contentFrame().locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(first.locator('iframe')).toHaveAttribute('title', 'صفحة تفاعلية')
  await speak(page, 'ja')
  await expect(first.locator('iframe').contentFrame().locator('html')).toHaveAttribute('lang', 'ja')
  await expect(first.locator('iframe').contentFrame().locator('#each')).toHaveText('30')

  // Web pages' code off: it is code again.
  await speak(page, 'en')
  const settings = await openSettings(page, 'Approvals')
  await settings.getByRole('switch', { name: 'Run its code' }).click()
  await closeSettings(page)
  await expect(first.locator('iframe')).toHaveCount(0)
  await expect(first.locator('pre code')).toContainText('sendPrompt(')
})

test('a page charts with the ECharts Jean lends it, with nothing from the internet', async ({ page }) => {
  const outside = /** @type {string[]} */ ([])
  page.on('request', (request) => { if (!/^(data|blob):|^http:\/\/(127\.0\.0\.1|localhost):418/.test(request.url())) outside.push(request.url()) })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make me a sales explorer')
  const inside = page.locator('.msg-jean app-page iframe').last().contentFrame()
  await expect(inside.locator('#chart canvas')).toBeVisible()
  await inside.locator('#region').selectOption('South')
  await expect(inside.locator('#chart canvas')).toBeVisible()
  expect(outside).toEqual([])
})
