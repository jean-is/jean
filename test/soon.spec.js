// SPDX-License-Identifier: MIT
// Coming up (caps/soon): over the rows of a collection with a date, those due within two weeks and those late, none done; a row opens its sheet;
// a late one is said late and Chase it writes the start of a request in the box; its head folds it; its foot says when a notice comes, kept with
// the collection; and a notice, where the browser allows them, says the collection's name, the row's and how far its day is, once for its day.
// In Arabic and Japanese, the band is in the language.
import { test, expect, start } from './helpers.js'

/** A collection of invoices beside the task: one late, one due in four days, one paid and due in two, one far. @param {import('@playwright/test').Page} page */
const invoices = (page) => page.evaluate(async () => {
  const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js'), day = (/** @type {number} */ away) => { const on = new Date(); on.setDate(on.getDate() + away); return `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, '0')}-${String(on.getDate()).padStart(2, '0')}` }
  const folder = await tables.makeTable({ name: 'Invoices', columns: [{ name: 'Invoice', type: 'text' }, { name: 'Status', type: 'status', options: ['To send', 'Sent', 'Paid'] }, { name: 'Due', type: 'date' }] }, app.projectDir)
  const one = await tables.load(folder), [name, status, due] = one.table.properties.map((/** @type {{ id: string }} */ property) => property.id)
  await tables.change(one, [['2026-026', 'Sent', -8], ['2026-029', 'Sent', 4], ['2026-028', 'Paid', 2], ['2026-031', 'To send', 40]].map(([invoice, step, away]) => ({ set: { [name]: invoice, [status]: step, [due]: day(Number(away)) } })), 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Invoices', title: 'Invoices' })
  return folder
})

test('what is coming up shows over the rows; a row opens, a late one is chased, the band folds, and a notice comes once for a row\'s day', async ({ page }) => {
  // The browser's notices, allowed, kept for the test to read.
  await page.addInitScript(() => { Object.assign(window, { notices: [], Notification: class { static permission = 'granted'; static requestPermission = async () => 'granted'; constructor(/** @type {string} */ title, /** @type {{ body: string }} */ options) { /** @type {any} */ (window).notices.push([title, options.body]) } close() {} } }) })
  await start(page)
  const folder = await invoices(page), band = page.locator('app-preview .soon')
  // The late one first, then the one due; the paid one and the far one aren't coming up.
  await expect(band.locator('h3')).toHaveText(/Coming up\s*2/)
  await expect(band.locator('.soon-row b')).toHaveText(['2026-026', '2026-029'])
  await expect(band.locator('li').first().locator('.soon-when')).toContainText('Late')
  await expect(band.locator('li').first().locator('.soon-when')).toContainText('8 days ago')
  await expect(band.locator('li').nth(1).locator('.soon-when')).toContainText('in 4 days')
  await expect(band.getByRole('button', { name: 'Chase it' })).toHaveCount(1)
  // A row's name opens its sheet.
  await band.getByRole('button', { name: /2026-029/ }).click()
  await expect(page.locator('dialog.table-row[open]')).toBeVisible()
  await page.keyboard.press('Escape')
  // Chase it writes in the box, and sends nothing.
  await band.getByRole('button', { name: 'Chase it' }).click()
  await expect(page.locator('#prompt')).toHaveValue(/^Write a short message to chase “2026-026”, which was due on .+: $/)
  await expect(page.locator('#prompt')).toBeFocused()
  // Its head folds it.
  await band.locator('h3 button').click()
  await expect(band.locator('h3 button')).toHaveAttribute('aria-expanded', 'false')
  await expect(band.locator('li')).toHaveCount(0)
  await band.locator('h3 button').click()
  await expect(band.getByLabel('Tell me')).toHaveValue('1')
  // The day before, nothing is owed yet for a row four days away; a week before, it is told, once.
  const check = () => page.evaluate(async () => { await (await import('/caps/soon/tell.js')).check(); await new Promise((done) => setTimeout(done, 200)); return /** @type {any} */ (window).notices })
  expect(await check()).toEqual([])
  await band.getByLabel('Tell me').selectOption('7')
  await expect.poll(() => page.evaluate(async (place) => { const { app } = await import('/ui/state.js'); return JSON.parse((await app.fs.read(`${app.projectDir}/${place}/soon.json`).catch(() => null)) ?? 'null') }, folder)).toEqual({ format: 1, before: 7 })
  await expect.poll(check).toEqual([['Invoices', '2026-029, in 4 days']])
  expect(await check()).toEqual([['Invoices', '2026-029, in 4 days']])
  // Never: none, even for a day not told yet.
  await band.getByLabel('Tell me').selectOption('-1')
  await page.evaluate(async () => { const { app } = await import('/ui/state.js'); await app.fs.write(`${app.projectDir}/.cache/soon.json`, '[]') })
  expect(await check()).toEqual([['Invoices', '2026-029, in 4 days']])
})

for (const lang of ['ar', 'ja']) {
  test(`the band is in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/soon/${code}.json`)).json(), lang)
    await invoices(page)
    const band = page.locator('app-preview .soon')
    await expect(band.locator('h3 span').first()).toHaveText(words['soon.title'])
    await expect(band.locator('.soon-when strong')).toHaveText(words['soon.late'])
    await expect(band.locator('li').first().getByRole('button').last()).toHaveText(words['soon.chase'])
    await expect(band.locator('.soon-how label')).toHaveText(words['soon.tell'])
  })
}
