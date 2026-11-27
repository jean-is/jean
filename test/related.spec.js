// SPDX-License-Identifier: MIT
// The rows that relate to a row, in its sheet (caps/row/related.js): a client's sheet lists the invoices whose Client is that row, how many, the
// total of their amounts as the column writes money, their names, and a button that opens their collection; a row nothing relates to says
// nothing. In Arabic and Japanese, the button is in the language.
import { test, expect, start } from './helpers.js'

/** Clients beside the task, and invoices related to them: two to the first client, none to the second. @param {import('@playwright/test').Page} page */
const clients = (page) => page.evaluate(async () => {
  const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Clients', columns: [{ name: 'Name', type: 'text' }] }, app.projectDir), one = await tables.load(folder)
  const [brune] = await tables.change(one, [{ set: { [one.table.properties[0].id]: 'Maison Brune' } }, { set: { [one.table.properties[0].id]: 'Atelier Nord' } }], 'user')
  const other = await tables.load(await tables.makeTable({ name: 'Invoices', columns: [{ name: 'Invoice', type: 'text' }, { name: 'Client', type: 'relation', collection: folder }, { name: 'Amount', type: 'number', format: 'money', currency: 'EUR' }] }, app.projectDir))
  const [name, client, amount] = other.table.properties.map((/** @type {{ id: string }} */ property) => property.id)
  await tables.change(other, [['2026-026', 1450], ['2026-029', 450]].map(([invoice, sum]) => ({ set: { [name]: invoice, [client]: brune, [amount]: sum } })), 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Clients', title: 'Clients' })
})
/** A row's sheet, opened from its handle's menu. @param {import('@playwright/test').Page} page @param {number} at */
const opened = async (page, at) => {
  const row = page.locator('.table-grid tbody tr[data-row]').nth(at)
  await row.hover()
  await row.locator('.table-handle, [aria-haspopup], button').first().click()
  await page.locator('.table-menu:popover-open button').first().click()
  const sheet = page.locator('dialog.table-row[open]')
  await expect(sheet).toBeVisible()
  return sheet
}

test('a client\'s sheet lists the invoices that relate to it, their total and their names, and opens their collection', async ({ page }) => {
  await start(page)
  await clients(page)
  const sheet = await opened(page, 0)
  await expect(sheet.locator('h3').first()).toHaveText(/Invoices\s*2/)
  await expect(sheet.locator('.row-sums div')).toHaveText([/Amount\s*€1,900\.00/])
  await expect(sheet.locator('.row-related li')).toHaveText(['2026-026', '2026-029'])
  // The other client has none: nothing is said.
  await page.keyboard.press('Escape')
  await expect((await opened(page, 1)).locator('.row-related')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await (await opened(page, 0)).getByRole('button', { name: 'Open Invoices' }).click()
  await expect(page.locator('dialog.table-row[open]')).toHaveCount(0)
  await expect(page.locator('app-preview .pane-name').last()).toHaveValue('Invoices')
})

for (const lang of ['ar', 'ja']) {
  test(`the button is in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/row/${code}.json`)).json(), lang)
    await clients(page)
    await expect((await opened(page, 0)).locator('.row-open')).toHaveText(words['row.open'].replace('{name}', 'Invoices'))
  })
}
