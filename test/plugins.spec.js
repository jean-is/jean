// Plugins (D296): read before they are added, run in a sandbox of their own, drawing with Jean's
// elements and hooking Jean's events, but only within the rights the user granted.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask, turnOn, openSettings, closeSettings } from './helpers.js'

const FIXTURE = new URL('./fixtures/plugins/word-count/', import.meta.url)

/**
 * Serves the test plugin at https://plugins.test/word-count/, its manifest changed as given, and its code if given.
 * @param {import('@playwright/test').Page} page @param {Record<string, unknown>} [change] @param {string} [main]
 */
async function serve(page, change = {}, main) {
  const manifest = { ...JSON.parse(await readFile(new URL('plugin.json', FIXTURE), 'utf8')), ...change }
  const code = main ?? await readFile(new URL('main.js', FIXTURE), 'utf8')
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

/** What the plugin keeps, in its data.json. @param {import('@playwright/test').Page} page */
const kept = (page) => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('plugins/word-count/data.json') ?? '{}'))

test('a plugin read from its address is added, runs apart, draws under each answer and above the box, keeps its data, follows the records and what going back removes, and refuses only with the right, which the activity names', async ({ page }) => {
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
  expect(await kept(page)).toEqual({ last: words })
  await band.getByRole('button', { name: 'Reset' }).click()
  await expect(band).toContainText('Last answer: 0 words')
  await expect(page.locator('.toast')).toContainText('Word count: Reset.')

  // With the right to refuse, it keeps files as they are.
  await ask(page, 'Make me a web page for the bakery')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Word count keeps files as they are.')
  // It follows the records kept, each refusal saying whose it was, and so does the activity.
  await expect.poll(async () => (await kept(page)).stopped?.by).toBe('word-count')
  const activity = page.locator('.msg-jean').last().locator('.activity')
  await activity.locator('summary').first().click()
  const refused = activity.locator('.activity-list li[data-status="failed"]')
  await refused.locator('summary').click()
  await expect(refused.locator('.step-facts')).toContainText('Refused by Word count')
  // Going back to the request, it hears what was removed, once (D188).
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.msg-actions.is-request').last().getByRole('button', { name: 'Try again' }).click()
  await expect.poll(async () => (await kept(page)).removed).toBeGreaterThan(1)
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

test('with ?safe no plugin runs until the user leaves safe mode, and one that keeps failing is turned off and says so (D307)', async ({ page }) => {
  // It fails on each record Jean keeps, a request and its answer make three, and draws 2,500 words in its row.
  await serve(page, {}, "export function register(on, $) { on('record', () => { throw new Error('Broken') }); $.slot('settings', () => Array(50).fill(Array(50).fill('word'))) }")
  await start(page)
  await page.goto('./?safe')
  await expect(page.locator('.hero-question')).toBeVisible()
  await connectFakeBrain(page)
  await turnOn(page, 'Plugins')
  await closeSettings(page)
  const settings = await add(page)
  const frames = page.locator('iframe[sandbox="allow-scripts"][src$="sandbox.html"]')
  await expect(settings).toContainText('Safe mode: no plugin runs during this visit.')
  await expect(settings.getByRole('switch', { name: 'Word count' })).toBeChecked()
  await expect(frames).toHaveCount(0)

  // Out of safe mode, without a reload, it runs.
  await settings.getByRole('button', { name: 'Leave safe mode' }).click()
  await expect(settings).not.toContainText('Safe mode')
  expect(new URL(page.url()).searchParams.has('safe')).toBe(false)
  await expect(frames).toHaveCount(1)
  // What it draws stops at 500 of Jean's elements.
  const row = settings.locator('.setting.plugin')
  await expect(row.getByText('word', { exact: true }).first()).toBeVisible()
  expect(await row.getByText('word', { exact: true }).count()).toBeLessThan(500)
  await closeSettings(page)

  await ask(page, 'Hello there')
  await expect(page.locator('.toast')).toContainText('Word count kept failing, so it is turned off.')
  await expect(frames).toHaveCount(0)
  await openSettings(page, 'Plugins')
  await expect(row).toContainText('It kept failing, so it was turned off.')
  await expect(row.getByRole('switch', { name: 'Word count' })).not.toBeChecked()
  // Turned on again, it runs, and the line goes.
  await row.getByRole('switch', { name: 'Word count' }).check()
  await expect(frames).toHaveCount(1)
  await expect(row).not.toContainText('It kept failing')
})
