// Notifications (D334): a task done while the user is in another tab or app offers them as the user
// comes back; accepted, the browser asks, and the next task done out of sight shows its title, never
// its answer. A click brings Jean back on that task, coming back takes away those still shown, and
// the switch in Settings › General turns them off. The browser's notifications are stood in for, and
// being elsewhere is the page without focus: the test sees what Jean asks of them.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, openTasks } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    /** @type {any[]} */
    const shown = (/** @type {any} */ (window).shown = [])
    class Notice {
      static permission = 'default'
      static requestPermission = async () => (Notice.permission = 'granted')
      /** @param {string} title @param {NotificationOptions} options */
      constructor(title, options) { Object.assign(this, { title, ...options, closed: false }); shown.push(this) }
      close() { Object.assign(this, { closed: true }); /** @type {any} */ (this).onclose?.() }
    }
    Object.defineProperty(window, 'Notification', { value: Notice })
  })
})

/** In another tab or app, as far as the page can tell. @param {import('@playwright/test').Page} page */
const leave = (page) => page.evaluate(() => { document.hasFocus = () => false })
/** Back on the page. @param {import('@playwright/test').Page} page */
const back = (page) => page.evaluate(() => { delete (/** @type {any} */ (document)).hasFocus; dispatchEvent(new Event('focus')) })
/** @param {import('@playwright/test').Page} page */
const shown = (page) => page.evaluate(() => /** @type {any} */ (window).shown.map(({ title, body, lang, dir, closed }) => ({ title, body, lang, dir, closed })))

/**
 * Asks while elsewhere and comes back once Jean has seen the task done: the user's return is said
 * again until the offer shows, since the task's end is heard a moment after its answer is.
 * @param {import('@playwright/test').Page} page @param {string} text @param {import('@playwright/test').Locator} offer
 */
async function doneWhileAway(page, text, offer) {
  await leave(page)
  await ask(page, text)
  await expect(async () => {
    await page.evaluate(() => dispatchEvent(new Event('focus')))
    await expect(offer).toBeVisible({ timeout: 300 })
  }).toPass()
  await back(page)
}

test('a task done out of sight offers notifications; on, the next one is told, and the switch turns them off', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const offer = page.locator('aside.offer')

  // Asked here, with the page in front: nothing is offered.
  await ask(page, 'Prepare holiday itinerary for Lisbon')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Prepare holiday itinerary for Lisbon')
  await expect(offer).toHaveCount(0)

  // Done while the user was elsewhere: as they come back, Jean offers to tell them next time.
  await doneWhileAway(page, 'And the museums worth seeing there', offer)
  await expect(offer).toContainText('A task finished while you were away. Want a notification next time?')
  // Under the task read to its end, it comes into view above the box rather than under it.
  const yes = offer.getByRole('button', { name: 'Notify me' })
  expect(await yes.evaluate((button) => { const box = button.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button })).toBe(true)
  await yes.click()
  await expect(offer).toHaveCount(0)
  expect(await page.evaluate(() => Notification.permission)).toBe('granted')

  // The next one done out of sight is told: its title, never its answer, in the user's language.
  await leave(page)
  await ask(page, 'Which neighbourhood should we stay in')
  await expect.poll(() => shown(page)).toEqual([{ title: 'Prepare holiday itinerary', body: 'Done. Your answer is ready.', lang: 'en', dir: 'ltr', closed: false }])
  await back(page)
  // Back on the page, what it said is stale.
  await expect.poll(async () => (await shown(page))[0].closed).toBe(true)

  // A click on one brings Jean back on its task, from another.
  const tasks = await openTasks(page)
  await tasks.locator('.place', { hasText: 'New task' }).click()
  await expect(page.locator('.hero-question')).toBeVisible()
  await page.evaluate(() => /** @type {any} */ (window).shown[0].onclick())
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Which neighbourhood should we stay in')

  // Its switch, in Settings › General, on; turned off, a task done out of sight is not told.
  const settings = await openSettings(page, 'General')
  const toggle = settings.getByRole('switch', { name: 'Notifications' })
  await expect(toggle).toBeChecked()
  await expect(settings.locator('.setting', { has: page.getByRole('switch', { name: 'Notifications' }) })).toContainText('When a task is done while you’re in another tab or app. Only its title shows.')
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await closeSettings(page)
  await leave(page)
  await ask(page, 'Thanks, that is all for today')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Thanks, that is all for today')
  await page.waitForTimeout(500)
  expect(await shown(page)).toHaveLength(1)
})

for (const [lang, title, body, dir] of [['ar', 'الإشعارات', 'تمّت. إجابتك جاهزة.', 'rtl'], ['ja', '通知', '完了しました。回答の準備ができています。', 'ltr']]) {
  test(`in ${lang}, the offer, the notification and its switch speak the user's language`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    const offer = page.locator('aside.offer')
    await doneWhileAway(page, 'Prepare holiday itinerary for Lisbon', offer)
    await offer.locator('.button.primary').click()
    await expect(offer).toHaveCount(0)
    await leave(page)
    await ask(page, 'Which neighbourhood should we stay in')
    await expect.poll(() => shown(page)).toEqual([{ title: 'Prepare holiday itinerary', body, lang, dir, closed: false }])
    await back(page)
    const settings = await openSettings(page)
    await expect(settings.getByRole('switch', { name: title })).toBeChecked()
  })
}
