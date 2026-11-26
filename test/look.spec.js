// SPDX-License-Identifier: MIT
// To look at (caps/checks): over a collection's rows, what its own check found, with no brain: the same row twice, mended by Keep one; a choice
// written two ways, by Make them one; a number some rows lack, whose first row opens; a finding left shows no more, kept with the collection.
// Nothing shows once nothing is found. In Arabic and Japanese, the band is in the language.
import { test, expect, start } from './helpers.js'

/** A collection of invoices beside the task, with a row twice, a client written two ways and an amount lacking; its place. @param {import('@playwright/test').Page} page */
const invoices = (page) => page.evaluate(async () => {
  const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
  await unlock('tables')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Invoices', columns: [{ name: 'Invoice', type: 'text' }, { name: 'Client', type: 'select' }, { name: 'Amount', type: 'number' }] }, app.projectDir)
  const one = await tables.load(folder), [name, client, amount] = one.table.properties.map((/** @type {{ id: string }} */ property) => property.id)
  await tables.change(one, [['027', 'Nord', 1200], ['027', 'Nord', 1200], ['028', 'maison brune', 450], ['029', 'Maison Brune', null], ['030', 'Maison Brune', 90], ['031', 'Maison Brune', 5]].map(([invoice, who, sum]) => ({ set: { [name]: invoice, [client]: who, ...(sum !== null && { [amount]: sum }) } })), 'user')
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Invoices', title: 'Invoices' })
  return folder
})
/** The collection's rows as they are: each one's name and client. @param {import('@playwright/test').Page} page @param {string} folder */
const rows = (page, folder) => page.evaluate(async (place) => { const one = await (await import('/caps/tables/tables.js')).load(place), [name, client] = one.table.properties.map((/** @type {{ id: string }} */ property) => property.id)
  return one.rows.filter((/** @type {any} */ row) => !row.deleted).map((/** @type {any} */ row) => [row.cells[name], row.cells[client]]) }, folder)

test('what the check found shows over the rows, each finding mended by its button or left, and the band goes once nothing is found', async ({ page }) => {
  await start(page)
  const folder = await invoices(page), band = page.locator('app-preview .look')
  await expect(band.locator('h3')).toHaveText(/To look at\s*3/)
  await expect(band.locator('li p')).toHaveText(['The same row, more than once: 027', 'Client: one choice written two ways, “maison brune” and “Maison Brune”', 'Amount is empty in some rows: 1'])
  // Keep one deletes the copy; Make them one writes the way most rows have.
  await band.getByRole('button', { name: 'Keep one' }).click()
  await expect(band.locator('li')).toHaveCount(2)
  await band.getByRole('button', { name: 'Make them one' }).click()
  await expect(band.locator('li')).toHaveCount(1)
  expect(await rows(page, folder)).toEqual([['027', 'Nord'], ['028', 'Maison Brune'], ['029', 'Maison Brune'], ['030', 'Maison Brune'], ['031', 'Maison Brune']])
  // The row that lacks its amount opens; left, the finding and the band go, and stay gone.
  await band.getByRole('button', { name: 'Open the first' }).click()
  await expect(page.locator('dialog.table-row[open]')).toBeVisible()
  await page.keyboard.press('Escape')
  await band.getByRole('button', { name: 'Leave it' }).click()
  await expect(band).toHaveCount(0)
  await expect.poll(() => page.evaluate(async (place) => { const { app } = await import('/ui/state.js'); return JSON.parse((await app.fs.read(`${app.projectDir}/${place}/look.json`).catch(() => null)) ?? 'null')?.left?.length }, folder)).toBe(1)
})

for (const lang of ['ar', 'ja']) {
  test(`the band is in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/checks/${code}.json`)).json(), lang)
    await invoices(page)
    const band = page.locator('app-preview .look')
    await expect(band.locator('h3 span').first()).toHaveText(words['checks.head'])
    await expect(band.locator('li').first().getByRole('button').first()).toHaveText(words['checks.keep'])
    await expect(band.locator('.hint')).toHaveText(words['checks.says'])
  })
}
