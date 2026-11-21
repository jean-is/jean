// SPDX-License-Identifier: MIT
// Summary (caps/sum): over the rows of a collection with three rows or more and a number, a status or a choice, a band whose head says how many
// rows and the total of its first number, as its column writes money, and opens the shares by its status and by month, each a line with a
// meter; it follows the rows as they change. In Arabic and Japanese, the band is in the language.
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

/** A collection of invoices beside the task; its place. @param {import('@playwright/test').Page} page */
const invoices = (page) => page.evaluate(async () => {
  const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Invoices', columns: [{ name: 'Invoice', type: 'text' }, { name: 'Amount', type: 'number', format: 'money', currency: 'EUR' }, { name: 'Status', type: 'status', options: ['To send', 'Sent', 'Paid'] }, { name: 'Due', type: 'date' }] }, app.projectDir)
  const one = await tables.load(folder), [name, amount, status, due] = one.table.properties.map((/** @type {{ id: string }} */ property) => property.id)
  await tables.change(one, [['026', 1450, 'Sent', '2026-10-12'], ['027', 1200, 'Paid', '2026-10-14'], ['028', 450, 'Paid', '2026-11-02'], ['029', 900, 'To send', '2026-11-24']].map(([invoice, sum, step, day]) => ({ set: { [name]: invoice, [amount]: sum, [status]: step, [due]: day } })), 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Invoices', title: 'Invoices' })
  return folder
})

test('a collection\'s summary: its rows and its total in its head, its shares by status and by month once opened, following the rows', async ({ page }) => {
  await start(page)
  const folder = await invoices(page), band = page.locator('app-preview .sum'), head = band.locator('h3 button')
  await expect(head).toHaveAttribute('aria-expanded', 'false')
  await expect(band.locator('.sum-figure')).toHaveText([/Rows\s*4/, /Amount, total\s*€4,000\.00/])
  await expect(band.locator('.sum-bars')).toHaveCount(0)
  await head.click()
  await expect(band.locator('h4')).toHaveText(['Status', 'Due'])
  await expect(band.locator('.sum-bars').first().locator('li')).toHaveText([/To send\s*€900\.00/, /Sent\s*€1,450\.00/, /Paid\s*€1,650\.00/])
  await expect(band.locator('.sum-bars').nth(1).locator('li')).toHaveText([/Oct 2026\s*€2,650\.00/, /Nov 2026\s*€1,350\.00/])
  expect(await band.locator('.sum-bars').first().locator('meter').evaluateAll((all) => all.map((one) => [/** @type {HTMLMeterElement} */ (one).value, /** @type {HTMLMeterElement} */ (one).max]))).toEqual([[900, 1650], [1450, 1650], [1650, 1650]])
  // A row added is counted at once.
  await page.evaluate(async (place) => { const tables = await import('/caps/tables/tables.js'), one = await tables.load(place); await tables.change(one, [{ set: { [one.table.properties[1].id]: 1000 } }], 'user') }, folder)
  await expect(band.locator('.sum-figure')).toHaveText([/Rows\s*5/, /€5,000\.00/])
})

for (const lang of ['ar', 'ja']) {
  test(`the band is in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/sum/${code}.json`)).json(), lang)
    await invoices(page)
    const band = page.locator('app-preview .sum')
    await expect(band.locator('h3 button > span').first()).toHaveText(words['sum.title'])
    await expect(band.locator('.sum-figure small').first()).toHaveText(words['sum.rows'])
  })
}
