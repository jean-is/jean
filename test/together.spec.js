// Together (D733): Ana and Bob work on one collection, each in a browser context of their own, so their own storage, through the relay
// on 4187, which keeps journals (test/playwright.config.js). Ana makes a link from Share's "Work on it together"; Bob opens it, gives the
// name the others see and joins; a row each adds reaches the other's copy; Ana removes Bob, who keeps what he had. Chromium only:
// Playwright's WebKit keeps nothing (test/playwright.config.js).
import { test, expect } from '@playwright/test'
import { start, RELAY_URL, SHARE_URL } from './helpers.js'

/** @typedef {import('@playwright/test').Page} Page */

/** A person's Jean: a context of its own, the relay named, and the name its profile goes by. @param {import('@playwright/test').Browser} browser @param {string} name */
async function person(browser, name, lang = 'en') {
  const page = await (await browser.newContext()).newPage()
  await start(page, lang)
  await page.evaluate(async ([relay, share, name]) => {
    const { app, updateSettings } = await import('/ui/state.js')
    await updateSettings({ urls: { ...app.settings.value.urls, relay, share }, name })
  }, [RELAY_URL, SHARE_URL, name])
  return page
}

/** Expenses, a collection of Ana's project with two rows; its folder. @param {Page} page */
const expenses = (page) => page.evaluate(async () => {
  const [{ app }, { createTable, folderOf }, { stamp, stringifyChanges }, { ulid }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/caps/tables/table.js'), import('/caps/tables/changes.js'), import('/core/ulid.js'), import('/ui/caps.js')])
  const table = createTable({ name: 'Expenses', columns: [{ name: 'Item', type: 'text' }, { name: 'Amount', type: 'number' }] }, { id: ulid(), author: 'user', at: new Date().toISOString() })
  const place = folderOf(table)
  await app.fs.write(`${app.projectDir}/${place}/collection.json`, `${JSON.stringify(table, null, 2)}\n`)
  await app.fs.write(`${app.projectDir}/${place}/changes.jsonl`, stringifyChanges(stamp([], [{ row: ulid(), set: { item: 'Flights', amount: 96 } }, { row: ulid(), set: { item: 'Flat', amount: 138 } }], { by: 'user' })))
  await unlock('tables')
  await unlock('share')
  return place
})
/** The collection's items, as its copy here folds them. @param {Page} page @param {string} folder */
const items = (page, folder) => page.evaluate(async (folder) => ((await (await import('/caps/tables/tables.js')).load(folder))?.rows ?? []).map((row) => String(row.cells.item)).sort(), folder)
/** A row the person adds, as the collection's own change. @param {Page} page @param {string} folder @param {string} item */
const add = (page, folder, item) => page.evaluate(async ([folder, item]) => {
  const { load, change } = await import('/caps/tables/tables.js')
  await change(/** @type {any} */ (await load(folder)), [{ set: { item, amount: 1 } }], 'user')
}, [folder, item])

test('Ana and Bob work on a collection together: a link and a name, each one’s rows reaching the other, and Bob, removed, keeps his copy', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const folder = await expenses(ana)
  // Share asks how, beside a copy: working on it together, whose pane Together draws.
  await ana.evaluate(async (folder) => {
    const { app } = await import('/ui/state.js')
    await (await import('/caps/share/share.js')).openShare({ path: `${app.projectDir}/conversations/`, title: 'Expenses', item: { text: '' }, thing: { kind: 'collection', uri: folder } }, null)
  }, folder)
  const sharing = ana.locator('app-share-dialog dialog[open]')
  await sharing.getByText('Work on it together', { exact: true }).click()
  await expect(sharing.getByLabel('Anyone with the link')).toHaveValue('edit')
  await sharing.getByRole('button', { name: 'Start' }).click()
  const link = await sharing.getByTitle('Link').inputValue()
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/join\/[\w-]{22}\.0\.[\w-]{43}\.[\w-]{43}\.[\w-]{43}$/)
  await sharing.getByRole('button', { name: 'Close' }).click()

  // Bob opens it: one question, the name the others see; then the collection is his too, its pane open.
  await bob.goto(link)
  const joining = bob.locator('app-together-dialog dialog[open]')
  await joining.getByLabel('Your name, as the others will see it').fill('Bob')
  await joining.getByRole('button', { name: 'Join' }).click()
  await expect.poll(() => items(bob, folder)).toEqual(['Flat', 'Flights'])
  await expect(bob.locator('aside.pane.preview h2')).toHaveText('Expenses')
  await expect(ana.locator('app-toasts')).toContainText('Bob joined with the link')

  // Each one's row reaches the other's copy, and Ana sees Bob here.
  await add(bob, folder, 'Taxi')
  await expect.poll(() => items(ana, folder)).toEqual(['Flat', 'Flights', 'Taxi'])
  await add(ana, folder, 'Museum')
  await expect.poll(() => items(bob, folder)).toEqual(['Flat', 'Flights', 'Museum', 'Taxi'])
  await ana.evaluate(async (folder) => {
    const { metaOf } = await import('/caps/tables/tables.js')
    ;(await import('/ui/preview.js')).preview({ uri: folder, .../** @type {any} */ (await metaOf(folder)) })
  }, folder)
  await expect(ana.getByRole('button', { name: 'Here now: Bob' })).toBeVisible()

  // Ana removes Bob: the others would move to a new link; Bob is told, and keeps what he had.
  await ana.getByRole('button', { name: 'Here now: Bob' }).click()
  const people = ana.locator('app-together-dialog dialog[open]')
  await expect(people.locator('li')).toHaveCount(2)
  await people.getByRole('button', { name: 'Remove' }).click()
  await expect(bob.locator('app-toasts')).toContainText('You’re no longer in “Expenses”. What you have stays yours.')
  await expect.poll(() => bob.evaluate(async () => Object.keys(await (await import('/ui/secrets.js')).secretsWhere((await import('/ui/state.js')).app.fs, (id) => id.startsWith('circle:'))).length)).toBe(0)
  expect(await items(bob, folder)).toEqual(['Flat', 'Flights', 'Museum', 'Taxi'])
  // Ana's own row goes on into the journal she moved to, which Bob no longer reads.
  await add(ana, folder, 'Dinner')
  await bob.waitForTimeout(1_000)
  expect(await items(bob, folder)).toEqual(['Flat', 'Flights', 'Museum', 'Taxi'])
})
