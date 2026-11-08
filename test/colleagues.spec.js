// Colleagues (D731): at work, where the organisation's own relay lists the people its sign-in names, Ana and Bob, each signed in to the
// fake organisation in a browser context of their own, are listed there as Jean starts; Ana finds Bob in Settings › People and adds him,
// with no meeting, and sends him a task from Share; his Jean takes her first letter through the list and shows its card, from her as
// the list names her. Chromium only: Playwright's WebKit keeps nothing, where no one is kept (test/playwright.config.js).
import { test, expect } from '@playwright/test'
import { start, openSettings, closeSettings, openTasks, withPolicy, RELAY_URL } from './helpers.js'
import { POLICY, fakeIssuer, fakeGateway } from './fixtures/fake-issuer.js'

/** @typedef {import('@playwright/test').Page} Page */

/** Signed in to the organisation, whose policy names its relay and has People ahead, as IT turns colleagues on. @param {import('@playwright/test').Browser} browser @param {Record<string, unknown>} [claims] */
async function colleague(browser, claims = {}, lang = 'en') {
  const page = await (await browser.newContext()).newPage()
  const issuer = await fakeIssuer(page, { claims })
  await fakeGateway(page, issuer)
  await withPolicy(page, { ...POLICY, urls: { relay: RELAY_URL }, capabilities: { preUnlock: ['people'] } })
  await start(page, lang)
  // Listed on the relay, as each start lists the device.
  await expect.poll(() => page.evaluate(async () => (await import('/ui/opfs.js')).mine('app.listed')).then((key) => page.evaluate((one) => localStorage.getItem(one), key))).not.toBeNull()
  return page
}
/** Ana and Bob, as the organisation names them, their own in each run: the relay keeps who it listed for the whole run. */
const named = () => ((run) => ({ ana: { sub: `sub-ana-${run}`, preferred_username: `ana.${run}@acme.example` }, bob: { sub: `sub-bob-${run}`, name: 'Bob Dupont', preferred_username: `bob.${run}@acme.example` } }))(`${test.info().workerIndex}-${test.info().repeatEachIndex}-${Date.now()}`)
/** The people a Jean keeps, as People shows them, a colleague's devices as one. @param {Page} page */
const groupsOf = (page) => page.evaluate(async () => (await import('/caps/people/people.js')).groups.value.map(({ name, account, fps, asking }) => ({ name, account, devices: fps.length, asking })))

test('at work, a colleague found on the organisation’s list is added with no meeting, sent a task, and their Jean takes it from them as the list names them', async ({ browser }) => {
  const who = named()
  const [ana, bob] = await Promise.all([colleague(browser, who.ana), colleague(browser, who.bob)])
  // Ana finds Bob by a few words of his name, and adds him.
  const settings = await openSettings(ana, 'People')
  await settings.getByLabel('Find a colleague').fill('bo')
  await settings.getByRole('button', { name: 'Search' }).click()
  await expect(settings.getByRole('listitem').filter({ hasText: 'Bob Dupont' }), 'three letters at least').toHaveCount(0)
  await settings.getByLabel('Find a colleague').fill('nobody here')
  await settings.getByRole('button', { name: 'Search' }).click()
  await expect(settings.getByText('No one by that name at your organisation uses Jean yet.')).toBeVisible()
  await settings.getByLabel('Find a colleague').fill('dupont')
  await settings.getByRole('button', { name: 'Search' }).click()
  const found = settings.getByRole('listitem').filter({ hasText: who.bob.preferred_username })
  await expect(found).toContainText('Bob Dupont')
  await found.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(found.getByRole('button', { name: 'Added' })).toBeDisabled()
  await expect.poll(() => groupsOf(ana)).toEqual([{ name: 'Bob Dupont', account: who.bob.preferred_username, devices: 1, asking: false }])
  await closeSettings(ana)

  // A task, sent from Share to Bob, the only one she can send to.
  await ana.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Budget 2027' }), userRecord('Draft the budget', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is **the budget**.' } }, 0)])
    await refreshConversations()
  })
  const row = (await openTasks(ana)).locator('.history-list li:not([aria-hidden])', { hasText: 'Budget 2027' })
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  await row.getByRole('button', { name: 'Share…' }).click()
  const dialog = ana.locator('app-share-dialog dialog[open]')
  await expect(dialog.getByRole('radio', { name: 'Bob Dupont' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog.locator('p[role="status"]')).toHaveText('Sent to Bob Dupont.')
  await dialog.getByRole('button', { name: 'Done' }).click()

  // Bob never added Ana: his Jean looked her up by the mailbox her letter gave, kept her as the list names her, and shows what she sent.
  const card = bob.locator('.people-card')
  await expect(card).toContainText('Ana Martín sent you “Budget 2027”')
  await expect.poll(() => groupsOf(bob)).toEqual([{ name: 'Ana Martín', account: who.ana.preferred_username, devices: 1, asking: false }])
  await card.getByRole('button', { name: 'Open' }).click()
  await expect(bob.locator('.msg-user')).toHaveText('Draft the budget')
})

test('the colleague finder reads in Arabic and Japanese', async ({ browser }) => {
  for (const lang of ['ar', 'ja']) {
    const page = await colleague(browser, named().ana, lang)
    await page.evaluate(async () => (await import('/ui/dialogs.js')).openSettings('people'))
    const finder = page.locator('app-settings dialog[open] #people-find')
    await expect(finder).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr')
    await finder.fill('nobody here')
    await finder.press('Enter')
    await expect(page.locator('app-settings dialog[open] .people-flow p.hint[role="status"]')).not.toBeEmpty()
    await page.context().close()
  }
})
