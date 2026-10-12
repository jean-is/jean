// Plugins (D296): read before they are added, run in a sandbox of their own, drawing with Jean's
// elements and hooking Jean's events, but only within the rights the user granted.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings } from './helpers.js'

const FIXTURE = new URL('./fixtures/plugins/word-count/', import.meta.url)

/** Serves the test plugin at https://plugins.test/word-count/, its manifest changed as given. @param {import('@playwright/test').Page} page @param {Record<string, unknown>} [change] */
async function serve(page, change = {}) {
  const manifest = { ...JSON.parse(await readFile(new URL('plugin.json', FIXTURE), 'utf8')), ...change }
  const code = await readFile(new URL('main.js', FIXTURE), 'utf8')
  await page.route('https://plugins.test/word-count/**', (route) => route.fulfill({
    headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' },
    body: route.request().url().endsWith('plugin.json') ? JSON.stringify(manifest) : code,
  }))
}

/** Reads the plugin at its address and adds it, from Settings › Plugins. @param {import('@playwright/test').Page} page */
async function add(page) {
  const settings = await openSettings(page, 'Plugins')
  await settings.getByLabel('The address of a plugin').fill('https://plugins.test/word-count')
  await settings.getByRole('button', { name: 'Look at it' }).click()
  const card = settings.locator('.plugin-card')
  await expect(card.locator('h4')).toContainText('Word count')
  await expect(card).toContainText('By Ada')
  await expect(card).toContainText('From plugins.test')
  await card.getByRole('button', { name: 'Add it' }).click()
  await expect(page.locator('.toast')).toContainText('Word count is added.')
  return settings
}

test('a plugin read from its address is added, runs apart, draws under each answer and above the box, keeps its data, and refuses only with the right', async ({ page }) => {
  await serve(page)
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Plugins')
  await closeSettings(page)
  const settings = await add(page)
  const row = settings.locator('.setting.plugin')
  await expect(row).toContainText('Show you short messages')
  await expect(row.getByRole('switch', { name: 'Word count' })).toBeChecked()
  await closeSettings(page)

  // Its code runs in an opaque frame of its own, never Jean's origin.
  await expect(page.locator('iframe[sandbox="allow-scripts"][src$="sandbox.html"]')).toHaveCount(1)

  await ask(page, 'Hello there')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(1)
  // It counts the answer's own words, as written: under it, and above the box, where it keeps the last count.
  await expect(page.locator('.msg-jean .plugin-answer')).toHaveText(/^\d+ words$/)
  const band = page.locator('.plugin-above')
  await expect(band).toContainText(/Last answer: [1-9]\d* words/)
  const words = Number(/Last answer: (\d+) words/.exec(await band.innerText())?.[1])
  expect(await page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('plugins/word-count/data.json') ?? '{}'))).toEqual({ last: words })
  await band.getByRole('button', { name: 'Reset' }).click()
  await expect(band).toContainText('Last answer: 0 words')
  await expect(page.locator('.toast')).toContainText('Word count: Reset.')

  // With the right to refuse, it keeps files as they are.
  await ask(page, 'Make me a web page for the bakery')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Word count keeps files as they are.')

  // Added again without that right, its refusal counts for nothing.
  await page.unroute('https://plugins.test/word-count/**')
  await serve(page, { rights: ['watch', 'draw'] })
  await add(page)
  await closeSettings(page)
  await ask(page, 'Make me a web page for the bakery')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(3)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Done: Bakery.html')

  // Turned off, it stops, and draws nothing more.
  const again = await openSettings(page, 'Plugins')
  await again.getByRole('switch', { name: 'Word count' }).uncheck()
  await expect(page.locator('iframe[sandbox="allow-scripts"][src$="sandbox.html"]')).toHaveCount(0)
  await closeSettings(page)
  await expect(page.locator('.plugin-above')).toHaveCount(0)
})
