// SPDX-License-Identifier: MIT
// Sources (caps/sources): over a collection's rows once Routines is found, a band that lists where its rows come from by themselves. Add a source
// asks what to read and when, and makes a routine, on, each morning at eight, whose request says what to read and names the collection by its
// place; its switch turns it off. In Arabic and Japanese, the band is in the language.
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

/** A collection beside the task, Routines found; its place. @param {import('@playwright/test').Page} page */
const bills = (page) => page.evaluate(async () => {
  const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
  await unlock('tables')
  await unlock('routines')
  const tables = await import('/caps/tables/tables.js')
  const folder = await tables.makeTable({ name: 'Bills', columns: [{ name: 'Bill', type: 'text' }, { name: 'Amount', type: 'number' }] }, app.projectDir)
  ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Bills', title: 'Bills' })
  return folder
})
/** The project's routines, as their files have them. @param {import('@playwright/test').Page} page */
const routines = (page) => page.evaluate(async () => (await (await import('/caps/routines/routines.js')).routines()).map((/** @type {any} */ { title, request, every, at, when, active }) => ({ title, request, every, at, when, active })))

test('a source is a routine that names the collection: made from the band, each morning, on, and turned off by its switch', async ({ page }) => {
  await start(page)
  const folder = await bills(page), band = page.locator('app-preview .sources')
  await expect(band.locator('h3')).toHaveText(/Sources\s*0/)
  await band.locator('h3 button').click()
  await expect(band.locator('.hint')).toHaveText('Rows a source adds wait here for you to accept them.')
  await band.getByRole('button', { name: 'Add a source' }).click()
  await band.getByLabel('What to read').fill('my emails labelled Invoices')
  await expect(band.getByLabel('When')).toHaveValue('morning')
  await band.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(band.locator('h3')).toHaveText(/Sources\s*1/)
  await expect(band.locator('li label')).toHaveText('Bills: my emails labelled Invoices')
  expect(await routines(page)).toEqual([{ title: 'Bills: my emails labelled Invoices', every: 'day', at: '08:00', when: undefined, active: true,
    request: `Read this: my emails labelled Invoices. For each one the collection “Bills” (${folder}) doesn’t hold yet, add a row to it with what it says. Change no other row.` }])
  // Its switch turns it off, as Routines' own does.
  await band.getByRole('switch').uncheck()
  await expect.poll(async () => (await routines(page))[0].active).toBe(false)
  // As a file is shared instead.
  await band.getByRole('button', { name: 'Add a source' }).click()
  await band.getByLabel('What to read').fill('a receipt')
  await band.getByLabel('When').selectOption('file')
  await band.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(band.locator('li')).toHaveCount(2)
  expect((await routines(page)).map(({ when }) => when).sort()).toEqual(['file', undefined])
})

for (const lang of ['ar', 'ja']) {
  test(`the band is in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/sources/${code}.json`)).json(), lang)
    await bills(page)
    const band = page.locator('app-preview .sources')
    await expect(band.locator('h3 button > span').first()).toHaveText(words['sources.head'])
    await band.locator('h3 button').click()
    await expect(band.locator('.sources-new')).toHaveText(words['sources.add'])
  })
}
