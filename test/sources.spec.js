// SPDX-License-Identifier: MIT
// Sources (caps/sources): over a collection's rows, a band that lists where its rows come from by themselves, once it has one; Add a source, from
// the collection's links menu once Routines is found and the collection is in the graph (a first source puts it there), shows it open on its form, which asks what to read and when, and makes a routine, on, each
// morning at eight, whose request says what to read and names the collection by its place; its switch turns it off. In Arabic and Japanese, the
// menu and the band are in the language.
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
/** A source as the brain makes one, a routine that names the collection, as a file is shared. @param {import('@playwright/test').Page} page @param {string} folder */
const first = (page, folder) => page.evaluate(async (folder) => {
  const [{ app }, { newRoutine, writeRoutine }] = await Promise.all([import('/ui/state.js'), import('/caps/routines/schedule.js')])
  await writeRoutine(app.fs, /** @type {any} */ (newRoutine('', { title: 'Bills: a receipt', request: `Read this: a receipt. For each one the collection “Bills” (${folder}) doesn’t hold yet, add a row to it with what it says. Change no other row.`, by: app.deviceId, when: 'file' })))
}, folder)
/** The collection opened beside the task again, its band reading its sources anew. @param {import('@playwright/test').Page} page @param {string} folder */
const again = (page, folder) => page.evaluate(async (folder) => {
  const { preview, unshow } = await import('/ui/preview.js')
  unshow(folder)
  await new Promise((resolve) => setTimeout(resolve, 50))
  preview({ uri: folder, name: 'Bills', title: 'Bills' })
}, folder)
/** The project's routines, as their files have them. @param {import('@playwright/test').Page} page */
const routines = (page) => page.evaluate(async () => (await (await import('/caps/routines/routines.js')).routines()).map((/** @type {any} */ { title, request, every, at, when, active }) => ({ title, request, every, at, when, active })))

test('a source is a routine that names the collection: begun from its links menu, made in the band, each morning, on, and turned off by its switch', async ({ page }) => {
  await start(page)
  const folder = await bills(page), band = page.locator('app-preview .sources'), links = page.getByRole('button', { name: 'Links with other creations' })
  // None yet: no band, and no links menu, the collection being in no graph.
  await expect(page.locator('app-preview .table-grid')).toBeVisible()
  await expect(band).toHaveCount(0)
  await expect(links).toHaveCount(0)
  // A first source, as the brain makes one, puts it in the graph: its head shows the links menu, whose Add a source shows the band open on its form.
  await first(page, folder)
  await again(page, folder)
  await links.click()
  await page.locator('.menu:popover-open').getByRole('group', { name: 'Sources' }).getByRole('button', { name: 'Add a source' }).click()
  await expect(band.getByLabel('What to read')).toBeFocused()
  await expect(band.locator('.hint')).toHaveText('Rows a source adds wait here for you to accept them.')
  await band.getByLabel('What to read').fill('my emails labelled Invoices')
  await expect(band.getByLabel('When')).toHaveValue('morning')
  await band.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(band.locator('h3')).toHaveText(/Sources\s*2/)
  await expect(band.locator('li label')).toHaveText(['Bills: a receipt', 'Bills: my emails labelled Invoices'])
  expect((await routines(page)).find(({ every }) => every)).toEqual({ title: 'Bills: my emails labelled Invoices', every: 'day', at: '08:00', when: undefined, active: true,
    request: `Read this: my emails labelled Invoices. For each one the collection “Bills” (${folder}) doesn’t hold yet, add a row to it with what it says. Change no other row.` })
  // Its switch turns it off, as Routines' own does.
  await band.locator('li').filter({ hasText: 'my emails labelled Invoices' }).getByRole('switch').uncheck()
  await expect.poll(async () => (await routines(page)).find(({ every }) => every)?.active).toBe(false)
  // As a file is shared instead, from the band itself.
  await band.getByRole('button', { name: 'Add a source' }).click()
  await band.getByLabel('What to read').fill('a letter')
  await band.getByLabel('When').selectOption('file')
  await band.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(band.locator('li')).toHaveCount(3)
  expect((await routines(page)).map(({ when }) => when).sort()).toEqual(['file', 'file', undefined])
})

for (const lang of ['ar', 'ja']) {
  test(`the band is in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/sources/${code}.json`)).json(), lang)
    const folder = await bills(page)
    await first(page, folder)
    await again(page, folder)
    const band = page.locator('app-preview .sources')
    await expect(page.locator('app-preview .table-grid')).toBeVisible()
    await page.locator('app-preview .pane-head button[popovertarget^="links-"]').click()
    await page.locator('.menu:popover-open').getByRole('group', { name: words['sources.head'] }).getByRole('button', { name: words['sources.add'] }).click()
    await expect(band.locator('h3 button > span').first()).toHaveText(words['sources.head'])
    await expect(band.getByLabel(words['sources.what'])).toBeFocused()
  })
}
