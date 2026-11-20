// SPDX-License-Identifier: MIT
// A new collection, begun with no brain (caps/begin): Create's Collection opens a dialog that asks what to keep track of; a starting point makes its
// collections, one related to the other, and opens the last beside the task; a file's columns are listed with the kind guessed for each, a kind
// picked that would leave cells empty says how many, and Make the collection writes it with its rows; a file that can't be read is said; describing
// it writes the start of a request in the box. At 320 px nothing is cut. In Arabic and Japanese, the dialog and what it makes are in the language.
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

/** Create's Collection, as the Creations page presses it. @param {import('@playwright/test').Page} page */
const create = async (page) => {
  await page.evaluate(async () => { const { unlock, slots } = await import('/ui/caps.js'); await unlock('tables'); await slots('creations').find((/** @type {{ id: string }} */ kind) => kind.id === 'tables').make() })
  const dialog = page.locator('dialog.begin')
  await expect(dialog).toBeVisible()
  return dialog
}
/** The project's collections, the latest first: each one's name, its columns' names and kinds, and its rows' cells in its columns' order. @param {import('@playwright/test').Page} page */
const kept = (page) => page.evaluate(async () => {
  const tables = await import('/caps/tables/tables.js')
  return Promise.all((await tables.kept()).map(async ({ path }) => ((one) => one && { name: one.table.name, columns: one.table.properties.map((/** @type {any} */ property) => [property.name, property.type]),
    rows: one.rows.map((/** @type {any} */ row) => one.table.properties.map((/** @type {any} */ property) => row.cells[property.id] ?? null)) })(await tables.load(path))))
})
const CSV = 'Invoice,Client,Amount,Due,Paid\n2026-029,Nord,"$1,200.00",11/24/2026,yes\n2026-030,Brune,$450,12/02/2026,no\n2026-031,Nord,$2650.50,12/15/2026,partly\n2026-032,Nord,$90,,no\n'

test('a starting point makes its collections, each invoice related to its client, and opens the last; Empty makes one to name, as before', async ({ page }) => {
  await start(page)
  const dialog = await create(page)
  await expect(dialog.locator('h2')).toHaveText('New collection')
  await expect(dialog.locator('.begin-starts b')).toHaveText(['Job applications', 'Spending', 'Clients and invoices', 'Things to do', 'Stock', 'Empty'])
  await expect(dialog.locator('[data-start="todo"] span')).toHaveText('Task, Status, Who, Due')
  await dialog.locator('[data-start="clients"]').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('app-preview .pane-name')).toHaveValue('Invoices')
  const [invoices, clients] = await kept(page)
  expect(clients).toEqual({ name: 'Clients', columns: [['Name', 'text'], ['Contact', 'person'], ['Email', 'email']], rows: [] })
  expect(invoices).toEqual({ name: 'Invoices', columns: [['Invoice', 'text'], ['Client', 'relation'], ['Amount', 'number'], ['Status', 'status'], ['Due', 'date']], rows: [] })
  // Empty: one beside the task, its name taking the keyboard, written only once it is changed.
  await (await create(page)).locator('[data-start="empty"]').click()
  await expect(page.locator('app-preview .pane-name')).toBeFocused()
  expect((await kept(page)).length).toBe(2)
})

test('a file: its columns with the kind guessed for each, a kind that would leave cells empty saying how many, then the collection with its rows; one that can\'t be read is said', async ({ page }) => {
  await start(page)
  const dialog = await create(page), input = dialog.locator('#begin-input'), kinds = dialog.locator('.begin-columns select')
  await expect(dialog.getByRole('button', { name: 'Make the collection' })).toHaveCount(0)
  // What isn't text is said, nothing listed.
  await input.setInputFiles({ name: 'photo.csv', mimeType: 'text/csv', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13, 0, 1, 2, 0]) })
  await expect(dialog.getByRole('alert')).toHaveText('This file couldn’t be read. Try a CSV file or an Excel workbook.')
  await input.setInputFiles({ name: 'invoices-2026.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  await expect(dialog.getByRole('alert')).toHaveText('')
  await expect(dialog.getByRole('status')).toHaveText('Rows: 4. Check each column’s kind.')
  await expect(dialog.locator('.begin-columns tbody th')).toHaveText(['Invoice', 'Client', 'Amount', 'Due', 'Paid'])
  // One cell that says "partly" keeps Paid as words, so nothing is lost; made a box, it says the cell it would leave empty.
  expect(await kinds.evaluateAll((all) => all.map((one) => /** @type {HTMLSelectElement} */ (one).value))).toEqual(['text', 'select', 'number', 'date', 'text'])
  await expect(dialog.locator('.begin-off')).toHaveCount(0)
  await dialog.getByTitle('Kind of Paid').selectOption('checkbox')
  await expect(dialog.locator('.is-off .begin-off')).toHaveText('Cells that aren’t this kind, left empty: 1')
  // At a phone's width, the dialog stays in the window and its columns scroll in their own box.
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await dialog.evaluate((box) => { const { left, right } = box.getBoundingClientRect(); return left >= 0 && right <= innerWidth && box.scrollWidth <= box.clientWidth })).toBe(true)
  await page.setViewportSize({ width: 1280, height: 800 })
  await dialog.getByRole('button', { name: 'Make the collection' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('app-preview .pane-name')).toHaveValue('invoices-2026')
  const [made] = await kept(page)
  expect(made?.columns).toEqual([['Invoice', 'text'], ['Client', 'select'], ['Amount', 'number'], ['Due', 'date'], ['Paid', 'checkbox']])
  expect(made?.rows).toEqual([['2026-029', 'Nord', 1200, '2026-11-24', true], ['2026-030', 'Brune', 450, '2026-12-02', false], ['2026-031', 'Nord', 2650.5, '2026-12-15', null], ['2026-032', 'Nord', 90, null, false]])
  // Its amounts are money, in the currency the file names.
  await expect(page.locator('app-preview')).toContainText('$1,200')
})

test('describing it instead writes the start of a request in the box, never sent', async ({ page }) => {
  await start(page)
  const dialog = await create(page)
  await dialog.getByRole('button', { name: /^Or describe it to / }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('#prompt')).toHaveValue('Make a collection to keep track of: ')
  await expect(page.locator('#prompt')).toBeFocused()
  expect(await kept(page)).toEqual([])
})

for (const [lang, title, name, direction] of /** @type {const} */ ([['ar', 'مجموعة جديدة', 'ar', 'rtl'], ['ja', '新しいコレクション', 'ja', 'ltr']])) {
  test(`the dialog and what a starting point makes are in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const dialog = await create(page)
    await expect(dialog.locator('h2')).toHaveText(title)
    expect(await dialog.evaluate((box) => getComputedStyle(box).direction)).toBe(direction)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/begin/${code}.json`)).json(), name)
    await expect(dialog.locator('[data-start="todo"] b')).toHaveText(words['begin.start.todo'])
    await dialog.locator('[data-start="todo"]').click()
    await expect(page.locator('app-preview .pane-name')).toHaveValue(words['begin.start.todo'])
    expect((await kept(page))[0]?.columns.map(([column]) => column)).toEqual([words['begin.col.task'], words['begin.kind.status'], words['begin.col.who'], words['begin.col.due']])
  })
}
