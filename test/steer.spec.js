// Steering (D365): what the user sends while a task works waits under its live answer, then its brain reads it before
// its next step, the work going on under it; × takes it back to the box, and a reload puts one not read yet back there.
// The fake brain counts slowly to five, a second a step, and stops when told to.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask } from './helpers.js'

/** @param {string} lang @returns {Promise<Record<string, string>>} */
const strings = async (lang) => JSON.parse(await readFile(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8'))

const SLOW = { en: 'Count slowly to five', ar: 'عدّ ببطء إلى خمسة', ja: 'ゆっくり五まで数えて' }
const STOP = { en: 'Stop now', ar: 'توقف الآن', ja: '止めてください' }

for (const lang of /** @type {const} */ (['en', 'ar', 'ja'])) {
  test(`what the user sends while a task works is read at its next step, and the work goes on under it (${lang})`, async ({ page }) => {
    const room = await strings(lang)
    await start(page, lang)
    await connectFakeBrain(page)
    await ask(page, SLOW[lang])
    const stop = page.locator('.composer .send.is-stop')
    await expect(stop).toBeVisible()
    // Words in the box make its button send: Enter steers, and the box is empty again, with Stop.
    await page.locator('#prompt').fill(STOP[lang])
    await expect(stop).toHaveCount(0)
    await page.locator('#prompt').press('Enter')
    const waiting = page.locator('.turns > .turn').last()
    await expect(waiting.locator('.msg-user')).toHaveText(STOP[lang])
    await expect(waiting.locator('.msg-user')).toHaveAttribute('dir', 'auto')
    await expect(waiting.locator('.msg-time')).toHaveText(room['steer.waiting'])
    await expect(page.locator('#prompt')).toHaveValue('')
    await expect(stop).toBeVisible()

    // Read before the next step: the request keeps the work done so far, and the answer comes under the steer.
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Stopping here, as you asked.')
    await expect(page.locator('.msg-time', { hasText: room['steer.waiting'] })).toHaveCount(0)
    const turns = page.locator('.turns > .turn')
    await expect(turns).toHaveCount(2)
    await expect(turns.nth(0).locator('.msg-user')).toHaveText(SLOW[lang])
    await expect(turns.nth(0).locator('.activity')).toBeVisible()
    await expect(turns.nth(1).locator('.msg-user')).toHaveText(STOP[lang])
    await expect(turns.nth(1).locator('.prose')).toContainText('Stopping here, as you asked.')
    // Kept as the user's own words, where they were read.
    expect(await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records
      .flatMap(({ update }) => (update?.sessionUpdate === 'user_message_chunk' && update._meta?.steer && update.content.type === 'text' ? [update.content.text] : [])))).toEqual([STOP[lang]])
  })
}

test('a steer taken back goes back to the box, and the task goes on without it (D365)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, SLOW.en)
  await expect(page.locator('.composer .send.is-stop')).toBeVisible()
  await ask(page, STOP.en)
  const waiting = page.locator('.turns > .turn').last()
  await expect(waiting.locator('.msg-time')).toHaveText('Read at the next step')
  await waiting.getByRole('button', { name: 'Take it back' }).click()
  await expect(page.locator('#prompt')).toHaveValue(STOP.en)
  await expect(page.locator('.msg-time', { hasText: 'Read at the next step' })).toHaveCount(0)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('I counted to five, slowly.', { timeout: 15_000 })
  await expect(page.locator('.msg-user')).toHaveCount(1)
})

test('a steer the page closed on before it was read comes back in the box (D365)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: nothing is kept for the next visit')
  await start(page)
  await connectFakeBrain(page)
  await ask(page, SLOW.en)
  // Sent once the first number is counted, while the second is.
  await expect(page.locator('.activity-list li[data-call^="call_"][data-status="completed"]')).toHaveCount(1)
  await ask(page, STOP.en)
  await expect(page.locator('.turns > .turn').last().locator('.msg-time')).toHaveText('Read at the next step')
  await page.reload()
  await expect(page.locator('.msg-user')).toHaveText(SLOW.en)
  await expect(page.locator('#prompt')).toHaveValue(STOP.en)
  // Sent now, it is the next request.
  await page.locator('#prompt').press('Enter')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Stopping here, as you asked.')
})
