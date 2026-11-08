// People (D727): two people, each in a browser context of their own, so their own storage, meet through the relay (relay/, D45). Ana
// invites from Settings › People, by a code to scan beside her; Bob opens the link, says who sent it and accepts; the six digits his
// screen shows are typed on Ana's; then each has the other, Ana's Jean naming Bob as she did, and where each reads. Chromium only:
// Playwright's WebKit keeps nothing, where no one is kept (test/playwright.config.js).
import { test, expect } from '@playwright/test'
import { start, openSettings, closeSettings, openTasks, RELAY_URL } from './helpers.js'

/** @typedef {import('@playwright/test').Page} Page */

/** A person's Jean: a context of its own, in its language, the relay named, and the name its profile goes by. @param {import('@playwright/test').Browser} browser @param {string} name */
async function person(browser, name, lang = 'en') {
  const page = await (await browser.newContext()).newPage()
  await start(page, lang)
  await page.evaluate(async ([relay, name]) => {
    const { app, updateSettings } = await import('/ui/state.js')
    await updateSettings({ urls: { ...app.settings.value.urls, relay }, name })
  }, [RELAY_URL, name])
  return page
}
/** People found, as a capability found by the person is, and its section opened from Settings' menu. @param {Page} page */
async function peoplePage(page) {
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('people') })
  const settings = await openSettings(page, 'People')
  await expect(settings.locator('.data-head h2')).toHaveText('People')
  return settings
}
/** The people a Jean keeps, as People reads them. @param {Page} page */
const peopleOf = (page) => page.evaluate(async () => (await import('/caps/people/people.js')).people.value.map(({ name, said, waiting, mailbox }) => ({ name, said, waiting: Boolean(waiting), reads: Boolean(mailbox) })))

/** Ana adds Bob side by side, as the first test shows; each then has the other. @param {Page} ana @param {Page} bob */
async function meetBeside(ana, bob) {
  const settings = await peoplePage(ana)
  await settings.getByRole('button', { name: 'Add a person' }).click()
  await settings.getByLabel('Who is it for?').fill('Bob from the bakery')
  await settings.getByRole('button', { name: 'Show a code to scan' }).click()
  await bob.goto(await settings.getByTitle('The invitation’s link').inputValue())
  const there = bob.locator('app-settings dialog[open]')
  await there.getByLabel('Who sent you this?').fill('Ana')
  await there.getByRole('button', { name: 'Accept' }).click()
  const digits = there.locator('.people-digits')
  await expect(digits).toHaveText(/^\d{3} \d{3}$/)
  await settings.getByLabel('The six digits Bob from the bakery shows you or sends back').fill(String(await digits.textContent()))
  await settings.getByRole('button', { name: 'Add' }).click()
  await expect.poll(() => peopleOf(ana)).toEqual([{ name: 'Bob from the bakery', said: 'Bob', waiting: false, reads: true }])
  await expect.poll(() => peopleOf(bob)).toEqual([{ name: 'Ana', said: 'Ana', waiting: false, reads: true }])
  await closeSettings(ana)
  await closeSettings(bob)
}

test('two people meet side by side: Bob’s six digits typed on Ana’s Jean, then each has the other', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const settings = await peoplePage(ana)
  await settings.getByRole('button', { name: 'Add a person' }).click()
  await settings.getByLabel('Who is it for?').fill('Bob from the bakery')
  await settings.getByRole('button', { name: 'Show a code to scan' }).click()
  await expect(settings.getByRole('img', { name: 'The invitation as a QR code, for their phone’s camera' })).toBeVisible()
  const link = await settings.getByTitle('The invitation’s link').inputValue()
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/meet\/[\w-]{43}\.[\w-]{22}$/)

  // Bob's Jean opens the link on People's page, and nothing goes before he says who sent it and accepts.
  await bob.goto(link)
  const there = bob.locator('app-settings dialog[open]')
  await expect(there.getByText('Someone invites you to send each other tasks with Jean.')).toBeVisible()
  await there.getByLabel('Who sent you this?').fill('Ana')
  await there.getByRole('button', { name: 'Accept' }).click()
  const digits = there.locator('.people-digits')
  await expect(digits).toHaveText(/^\d{3} \d{3}$/)
  await expect(there.getByText('Calls themselves Ana')).toBeVisible()

  // Typed on Ana's Jean: Bob is in her people, waiting for his answer, which comes from his Jean on its own.
  await settings.getByLabel('The six digits Bob from the bakery shows you or sends back').fill(String(await digits.textContent()))
  await settings.getByRole('button', { name: 'Add' }).click()
  await expect(settings.locator('.people-said')).toHaveText('Bob from the bakery is in your people. Once they answer, you can send each other tasks.')
  await expect(there.locator('.people-said')).toHaveText('Ana is in your people now. You can send each other tasks.')
  await expect.poll(() => peopleOf(ana)).toEqual([{ name: 'Bob from the bakery', said: 'Bob', waiting: false, reads: true }])
  expect(await peopleOf(bob)).toEqual([{ name: 'Ana', said: 'Ana', waiting: false, reads: true }])
  await settings.getByRole('button', { name: 'Done' }).click()
  await expect(settings.locator('.people-flow .list li')).toContainText(['Bob from the bakery'])
  await expect(settings.locator('.people-flow .list li')).toContainText(['Calls themselves Bob'])
})

test('a task sent from its menu to someone met: what goes shown first, then a card on their Jean, which opens it as theirs, from Ana', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  await meetBeside(ana, bob)
  await ana.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Plan the trip' }), userRecord('Plan my trip to Lyon', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is **the plan**.' } }, 0)])
    await refreshConversations()
  })
  const row = (await openTasks(ana)).locator('.history-list li:not([aria-hidden])', { hasText: 'Plan the trip' })
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  await row.getByRole('button', { name: 'Send to…' }).click()
  const dialog = ana.locator('app-people-send dialog[open]')
  await expect(dialog.getByRole('radio', { name: 'Bob from the bakery' })).toBeChecked()
  await expect(dialog.getByText('1 request and its answer')).toBeVisible()
  await expect(dialog.getByText('They have a week to open it.')).toBeVisible()
  await dialog.getByLabel('A few words for them').fill('For Monday')
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog.locator('p[role="status"]')).toHaveText('Sent to Bob from the bakery.')

  // On Bob's Jean, a card: who sent what, their words; opened, it is a task of his, from Ana, her request without actions.
  const card = bob.locator('.people-card')
  await expect(card).toContainText('Ana sent you “Plan the trip”')
  await expect(card).toContainText('For Monday')
  await card.getByRole('button', { name: 'Open' }).click()
  await expect(bob.locator('app-conversation .since')).toContainText('From Ana')
  await expect(bob.locator('app-conversation .msg-user')).toHaveText('Plan my trip to Lyon')
  await expect(bob.locator('app-conversation .msg-actions.is-request')).toHaveCount(0)
  await expect(card).toHaveCount(0)
})
