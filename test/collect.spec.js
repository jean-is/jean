// SPDX-License-Identifier: MIT
// Collect replies (caps/collect): Share's third tab for a collection, where the host offers sites. The columns a form can ask, each ticked, the
// row's name always, beside the form as people will see it; Put the form online makes it a site of one page and opens Publish's dialog; a
// visitor's reply, sealed in their browser (D751), comes into the same collection as a row, by its columns' names, and makes no other
// collection. In Arabic and Japanese, the tab and its panel are in the language.
import { test, expect, start, SHARE_URL } from './helpers.js'

/** A collection of sign-ups, beside the task, and Share's dialog opened on it, the share host named. @param {import('@playwright/test').Page} page */
const shared = async (page, again = false) => {
  if (!again) await page.evaluate(async (host) => {
    const [{ app, updateSettings }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    await unlock('tables')
    await unlock('share')
    const tables = await import('/caps/tables/tables.js')
    const folder = await tables.makeTable({ name: 'Workshop sign-ups', columns: [{ name: 'Name', type: 'text' }, { name: 'Email', type: 'email' }, { name: 'Session', type: 'select', options: ['5 Dec', '12 Dec'] },
      { name: 'Places', type: 'number' }, { name: 'Paid', type: 'checkbox' }, { name: 'Who', type: 'person' }] }, app.projectDir)
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Workshop sign-ups', title: 'Workshop sign-ups' })
  }, SHARE_URL)
  await page.locator('app-preview .pane-head .icon-group > [popovertarget^="out-"]').click()
  await page.locator('app-preview .out-menu').getByRole('button', { name: /^Share/ }).click()
  const dialog = page.locator('app-share-dialog dialog[open]')
  await expect(dialog).toBeVisible()
  return dialog
}
/** The project's collections: each one's name and its rows' cells in its columns' order, with who made each change. @param {import('@playwright/test').Page} page */
const kept = (page) => page.evaluate(async () => {
  const tables = await import('/caps/tables/tables.js')
  return Promise.all((await tables.collections()).map(async ({ folder }) => ((one) => one && { name: one.table.name, columns: one.table.properties.length,
    rows: one.rows.map((/** @type {any} */ row) => one.table.properties.map((/** @type {any} */ property) => row.cells[property.id] ?? null)), by: one.lines.map((/** @type {any} */ line) => line.by) })(await tables.load(folder))))
})

test('a collection\'s form goes online from Share, and a visitor\'s reply comes into the collection as a row, sealed on its way', async ({ page, context, browserName }) => {
  const name = `signups-${browserName}-${test.info().retry}-${test.info().repeatEachIndex}`, address = `http://${name}.localhost:4185/`
  await start(page)
  const share = await shared(page), tab = share.getByRole('tab', { name: 'Collect replies' })
  // Beside Publish, reached by the arrows too; the row's name always asked, a person's column not one a form can ask.
  await expect(share.getByRole('tab')).toHaveText(['Publish', 'Collect replies'])
  await share.getByRole('tab', { name: 'Publish' }).press('ArrowRight')
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(tab).toBeFocused()
  await expect(share.locator('.collect li bdi')).toHaveText(['Name', 'Email', 'Session', 'Places', 'Paid'])
  await expect(share.getByLabel('Name')).toBeDisabled()
  await expect(share.locator('.collect li').first()).toContainText('Always asked')
  // A column unticked leaves the form people will see.
  await expect(share.locator('.collect-see .collect-field')).toHaveCount(5)
  await share.getByLabel('Paid').uncheck()
  await expect(share.locator('.collect-see .collect-field')).toHaveCount(4)
  await share.getByRole('button', { name: 'Put the form online' }).click()

  // Publish's dialog, as any site's: where replies go, its address, its recovery code.
  const dialog = page.locator('dialog.site-publish')
  await expect(dialog).toContainText('What visitors send with its form comes here, into a collection.')
  await dialog.getByLabel('Address').fill(name)
  await expect(dialog.locator('#publish-said')).toHaveText('This address is free.')
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
  await dialog.getByLabel('I’ve kept it somewhere safe').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()

  // A visitor fills it in: each field under its column's name, what they send sealed, the page saying so.
  const visit = await context.newPage(), posted = /** @type {string[]} */ ([])
  visit.on('request', (one) => { if (one.method() === 'POST') posted.push(one.postData() ?? '') })
  await visit.goto(address)
  await expect(visit.locator('h1')).toHaveText('Workshop sign-ups')
  await expect(visit.getByLabel('Paid')).toHaveCount(0)
  await visit.getByLabel('Name').fill('Amina')
  await visit.getByLabel('Email').fill('amina@example.org')
  await visit.getByLabel('12 Dec').check()
  await visit.getByLabel('Places').fill('2')
  await visit.getByRole('button', { name: 'Send' }).click()
  await expect(visit.getByRole('status')).toHaveText('Thank you. Your reply was sent.')
  expect(posted).toHaveLength(1)
  expect(posted[0]).not.toContain('Amina')
  await visit.close()

  // Collected as the dialog opens again: a row of the same collection, by the visitor, each cell as its column takes it; no other collection, no new column.
  await (await shared(page, true)).getByRole('tab', { name: 'Collect replies' }).click()
  await page.locator('app-share-dialog').getByRole('button', { name: 'Put the form online' }).click()
  await expect(page.locator('.toast')).toContainText('1 new reply to Workshop sign-ups.')
  const all = await kept(page), made = all.find((one) => one?.rows.length)
  expect(all.map((one) => one?.name)).toEqual(['Workshop sign-ups'])
  expect([made?.columns, made?.rows, made?.by]).toEqual([6, [['Amina', 'amina@example.org', '12 Dec', 2, null, null]], ['visitor']])
})

for (const lang of ['ar', 'ja']) {
  test(`the tab and its panel are in the language (${lang})`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async (code) => (await fetch(`/locales/collect/${code}.json`)).json(), lang)
    await page.evaluate(async (host) => {
      const [{ app, updateSettings }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
      await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
      await unlock('tables')
      await unlock('share')
      const tables = await import('/caps/tables/tables.js')
      const folder = await tables.makeTable({ name: 'Trips', columns: [{ name: 'Name', type: 'text' }, { name: 'When', type: 'date' }] }, app.projectDir)
      await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Trips', item: { text: 'Trips' }, thing: { kind: 'collection', uri: folder } })
    }, SHARE_URL)
    const tab = page.locator('app-share-dialog [role=tab]').last()
    await expect(tab).toHaveText(words['collect.tab'])
    await tab.click()
    await expect(page.locator('app-share-dialog legend')).toHaveText(words['collect.asks'])
    await expect(page.locator('app-share-dialog .collect-send')).toHaveText(words['collect.send'])
    await expect(page.locator('app-share-dialog .dialog-foot .primary')).toContainText(words['collect.online'])
  })
}
