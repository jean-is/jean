// SPDX-License-Identifier: MIT
// People (D727): two people, each in a browser context of their own, so their own storage, meet through the relay (relay/, D45). Ana,
// told the two ways while she has no one, invites from Settings › People, by a code to scan beside her; Bob opens the link, says who sent
// it and accepts; the six digits his screen shows are typed on Ana's; then each has the other, Ana's Jean naming Bob as she did, and where
// each reads. Both screens show the same three steps on the way. Chromium only: Playwright's WebKit keeps nothing, where no one is kept
// (test/playwright.config.js).
import { test, expect } from '@playwright/test'
import { start, openSettings, closeSettings, openTasks, RELAY_URL, SHARE_URL } from './helpers.js'

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
  await settings.getByLabel('The name you know them by').fill('Bob from the bakery')
  await settings.getByRole('button', { name: 'Show a code to scan' }).click()
  await bob.goto(await settings.getByTitle('The invitation’s link').inputValue())
  const there = bob.locator('app-settings dialog[open]')
  await there.getByLabel('Who sent you this?').fill('Ana')
  await there.getByRole('button', { name: 'Accept' }).click()
  const digits = there.locator('.digits')
  await expect(digits).toHaveText(/^\d{3} \d{3}$/)
  // Typed as Bob's screen shows them, a space between the halves: they go at the sixth digit, without Add.
  await settings.getByLabel('The six digits Bob from the bakery shows you or sends back').fill(String(await digits.textContent()))
  await expect.poll(() => peopleOf(ana)).toEqual([{ name: 'Bob from the bakery', said: 'Bob', waiting: false, reads: true }])
  await expect.poll(() => peopleOf(bob)).toEqual([{ name: 'Ana', said: 'Ana', waiting: false, reads: true }])
  await settings.getByRole('button', { name: 'Done' }).click()
  await bob.locator('app-settings dialog[open]').getByRole('button', { name: 'Done' }).click()
  await closeSettings(ana)
  await closeSettings(bob)
}

test('two people meet side by side: Bob’s six digits typed on Ana’s Jean, then each has the other', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  const settings = await peoplePage(ana)
  const none = settings.getByText('No one yet. Add someone beside you with a code they scan, or someone elsewhere with a link.')
  await expect(none).toBeVisible()
  await settings.getByRole('button', { name: 'Add a person' }).click()
  // The same three steps on both screens, the first under way; the field says what to type, and each way says when it fits.
  const steps = (/** @type {import('@playwright/test').Locator} */ at) => at.getByRole('list', { name: 'Adding a person' })
  await expect(steps(settings).getByRole('listitem')).toHaveText(['Invitation', 'Match the digits', 'Done'])
  await expect(steps(settings).locator('[aria-current="step"]')).toHaveText('Invitation')
  await expect(settings.getByLabel('The name you know them by')).toBeFocused()
  for (const name of ['Show a code to scan', 'Send a link']) await expect(settings.getByRole('button', { name })).toHaveAccessibleDescription('A code when they’re beside you, a link when they’re elsewhere.')
  await settings.getByLabel('The name you know them by').fill('Bob from the bakery')
  await settings.getByRole('button', { name: 'Show a code to scan' }).click()
  await expect(settings.getByRole('img', { name: 'The invitation as a QR code, for their phone’s camera' })).toBeVisible()
  const link = await settings.getByTitle('The invitation’s link').inputValue()
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:4180\/#\/meet\/[\w-]{43}\.[\w-]{22}$/)

  // Bob's Jean opens the link on People's page, and nothing goes before he says who sent it and accepts.
  await bob.goto(link)
  const there = bob.locator('app-settings dialog[open]')
  await expect(there.getByText('Someone invites you to send each other tasks with Jean.')).toBeVisible()
  await expect(there.getByLabel('Who sent you this?')).toBeFocused()
  await expect(steps(there).locator('[aria-current="step"]')).toHaveText('Invitation')
  await there.getByLabel('Who sent you this?').fill('Ana')
  await there.getByRole('button', { name: 'Accept' }).click()
  const digits = there.locator('.digits')
  await expect(digits).toHaveText(/^\d{3} \d{3}$/)
  await expect(there.getByText('Calls themselves Ana')).toBeVisible()
  await expect(steps(there).locator('[aria-current="step"]')).toHaveText('Match the digits')

  // Typed on Ana's Jean: Bob is in her people, waiting for his answer, which comes from his Jean on its own.
  await expect(settings.getByLabel('The six digits Bob from the bakery shows you or sends back')).toBeFocused()
  await expect(steps(settings).locator('[aria-current="step"]')).toHaveText('Match the digits')
  await settings.getByLabel('The six digits Bob from the bakery shows you or sends back').fill(String(await digits.textContent()))
  await expect(settings.locator('.people-said')).toHaveText('Bob from the bakery is in your people. Once they answer, you can send each other tasks.')
  await expect(there.locator('.people-said')).toHaveText('Ana is in your people now. You can send each other tasks.')
  // Done on both: every step ticked, none under way.
  for (const at of [settings, there]) {
    await expect(steps(at).locator('.is-done')).toHaveCount(3)
    await expect(steps(at).locator('[aria-current]')).toHaveCount(0)
  }
  await expect.poll(() => peopleOf(ana)).toEqual([{ name: 'Bob from the bakery', said: 'Bob', waiting: false, reads: true }])
  expect(await peopleOf(bob)).toEqual([{ name: 'Ana', said: 'Ana', waiting: false, reads: true }])
  await settings.getByRole('button', { name: 'Done' }).click()
  // His initial beside the name Ana gave him, which holds the one he gives himself, so it isn't said again.
  await expect(settings.locator('.people-flow .list li')).toContainText(['BBob from the bakery'])
  await expect(settings.locator('.people-flow .list li')).not.toContainText('Calls themselves')
  await expect(none).toHaveCount(0)
  await expect(steps(settings)).toHaveCount(0)
})

test('a task shared from its menu with only the people chosen: what goes shown first, then a card on their Jean, which opens it as theirs, from Ana, its chart drawn (D378)', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  await meetBeside(ana, bob)
  await ana.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Plan the trip' }), userRecord('Plan my trip to Lyon', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `Here is **the plan**.\n\n\`\`\`echarts\n${JSON.stringify({ xAxis: { type: 'category', data: ['Fri', 'Sat'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [2, 5] }] })}\n\`\`\`` } }, 0)])
    await refreshConversations()
  })
  const row = (await openTasks(ana)).locator('.history-list li:not([aria-hidden])', { hasText: 'Plan the trip' })
  const share = async () => {
    await row.hover()
    await row.getByRole('button', { name: 'More options' }).click()
    await row.getByRole('button', { name: 'Share…' }).click()
  }
  // Share, found with People: without a host for links, Share alone, so no tabs: who, nobody ticked yet, then the verbs.
  await share()
  const dialog = ana.locator('app-share-dialog dialog[open]')
  await expect(dialog.getByRole('tab')).toHaveCount(0)
  await expect(dialog.getByRole('checkbox', { name: 'Bob from the bakery' })).not.toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Send a copy' })).toBeDisabled()
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  // With one, two tabs, Share first, then Publish: a link anyone opens.
  await ana.evaluate(async (host) => { const { app, updateSettings } = await import('/ui/state.js'); await updateSettings({ urls: { ...app.settings.value.urls, share: host } }) }, SHARE_URL)
  await share()
  await expect(dialog.getByRole('tab')).toHaveText(['Share', 'Publish'])
  await expect(dialog.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true')
  await dialog.getByRole('tab', { name: 'Share' }).press('ArrowRight')
  await expect(dialog.getByRole('tab', { name: 'Publish' })).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Publish link' })).toBeVisible()
  await dialog.getByRole('tab', { name: 'Share' }).click()
  await expect(dialog.getByRole('button', { name: 'Publish link' })).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: 'Bob from the bakery' }).check()
  await expect(dialog.getByRole('button', { name: 'Add a person' })).toBeVisible()
  await expect(dialog.getByText('1 request and its answer')).toBeVisible()
  // Its size only once it is too large to go, and nothing on how long it waits.
  await expect(dialog.getByText('that can go at once')).toHaveCount(0)
  await expect(dialog.getByText('a week')).toHaveCount(0)
  await dialog.getByLabel('A few words for them').fill('For Monday')
  await dialog.getByRole('button', { name: 'Send a copy' }).click()
  await expect(dialog.locator('p[role="status"]')).toHaveText('Sent to Bob from the bakery.')
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  // The task's Share at its top says whom it went to.
  await ana.evaluate(async () => { const { app, openConversation } = await import('/ui/state.js'); await openConversation(String(app.conversations.value.find((one) => one.title === 'Plan the trip')?.path)) })
  await expect(ana.locator('.views').getByRole('button', { name: 'Sent to Bob from the bakery.' })).toBeVisible()

  // On Bob's Jean, a card: who sent what, their words; opened, it is a task of his, from Ana, her request without actions.
  const card = bob.locator('.people-card')
  await expect(card).toContainText('Ana sent you “Plan the trip”')
  await expect(card).toContainText('For Monday')
  await card.getByRole('button', { name: 'Open' }).click()
  await expect(bob.locator('app-conversation .since')).toContainText('From Ana')
  await expect(bob.locator('app-conversation .msg-user')).toHaveText('Plan my trip to Lyon')
  await expect(bob.locator('app-conversation .msg-actions.is-request')).toHaveCount(0)
  await expect(card).toHaveCount(0)
  // Bob never found charts: what Ana's answer holds comes with Jean's own skill that draws it, which the toast names.
  await expect(bob.locator('.toast')).toContainText('Added to your skills, to show in full what was shared with you: Chart.')
  await expect(bob.locator('app-conversation .msg-jean .prose app-chart .chart canvas')).toBeVisible()
  await expect(bob.locator('app-conversation .msg-jean .prose pre code')).toHaveCount(0)
})

test('an answer goes back on its thread: only what Bob added, from his task’s menu, taken into the task Ana sent', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  await meetBeside(ana, bob)
  const path = await ana.evaluate(async () => {
    const [{ app, refreshConversations, openConversation }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }, { people, sendIt }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/caps/people/people.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Plan the trip' }), userRecord('Plan my trip to Lyon', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Here is the plan.' } }, 0)])
    await refreshConversations()
    await openConversation(path)
    await sendIt([people.value[0].fp], { path, title: 'Plan the trip' })
    return path
  })
  await bob.locator('.people-card').getByRole('button', { name: 'Open' }).click()
  await expect(bob.locator('app-conversation .since')).toContainText('From Ana')
  // Bob asks something of his own there, then sends back from its menu: to Ana, picked, and only his request goes.
  await bob.evaluate(async () => {
    const [{ app, openConversation }, { appendRecords }, { userRecord, envelope }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const here = String(app.current.value?.path)
    await appendRecords(app.fs, here, [userRecord('Make it shorter', app.deviceId), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Two days, then.' } }, 0)])
    await openConversation(here)
  })
  const row = (await openTasks(bob)).locator('.history-list li:not([aria-hidden])', { hasText: 'Plan the trip' })
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  await row.getByRole('button', { name: 'Send back to Ana' }).click()
  const dialog = bob.locator('app-share-dialog dialog[open]')
  await expect(dialog.getByRole('checkbox', { name: 'Ana' })).toBeChecked()
  await expect(dialog.getByText('1 request and its answer')).toBeVisible()
  await dialog.getByRole('button', { name: 'Send a copy' }).click()
  await expect(dialog.locator('p[role="status"]')).toHaveText('Sent to Ana.')

  // Ana's card says Bob answered; taken in, his answer is in her task, after a line from him, his request his.
  const card = ana.locator('.people-card')
  await expect(card).toContainText('Bob from the bakery answered “Plan the trip”')
  await card.getByRole('button', { name: 'Take in' }).click()
  await expect.poll(() => ana.evaluate(async () => (await import('/ui/state.js')).app.current.value?.path)).toBe(path)
  await expect(ana.locator('app-conversation .since')).toContainText('From Bob from the bakery')
  await expect(ana.locator('app-conversation .msg-user')).toHaveText(['Plan my trip to Lyon', 'Make it shorter'])
  await expect(ana.locator('app-conversation .msg-actions.is-request')).toHaveCount(1)
  await expect(card).toHaveCount(0)
})

test('someone removed from People goes from both sides', async ({ browser }) => {
  const [ana, bob] = await Promise.all([person(browser, 'Ana'), person(browser, 'Bob')])
  await meetBeside(ana, bob)
  const settings = await peoplePage(ana)
  ana.once('dialog', (asked) => asked.accept())
  await settings.locator('.people-flow .list li', { hasText: 'Bob from the bakery' }).getByRole('button', { name: 'Remove' }).click()
  await expect.poll(() => peopleOf(ana)).toEqual([])
  await expect.poll(() => peopleOf(bob)).toEqual([])
})

test('a closed Jean is nudged when something comes for its person (D736): its device kept beside the person mailbox, nothing in the nudge', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  // The browser's answer, which headless Chromium never gives, and its push service, which the fake mail's stands in for.
  await context.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' })
    PushManager.prototype.getSubscription = async () => null
    PushManager.prototype.subscribe = async () => /** @type {any} */ ({ endpoint: 'http://127.0.0.1:4182/push/bobs-phone', unsubscribe: async () => true })
  })
  const bob = await context.newPage()
  await start(bob)
  await bob.evaluate(async (relay) => {
    const { app, updateSettings } = await import('/ui/state.js')
    await updateSettings({ urls: { ...app.settings.value.urls, relay }, name: 'Bob' })
    await navigator.serviceWorker.ready
  }, RELAY_URL)
  const subscribed = bob.waitForResponse((response) => response.url().endsWith('/push') && response.request().method() === 'PUT')
  await bob.evaluate(async () => { await (await import('/ui/caps.js')).unlock('people') })
  expect((await subscribed).status()).toBe(200)
  const mailbox = await bob.evaluate(async () => JSON.parse(String(await (await import('/ui/secrets.js')).getSecret((await import('/ui/state.js')).app.fs, 'person'))).mailbox)
  expect(await bob.evaluate(async () => (await (await (await caches.open('app-push')).match(new URL('push.json', (await navigator.serviceWorker.ready).scope)))?.json())?.body))
    .toBe('Something came for you. Open Jean to see it.')

  // Bob's Jean closed, a letter comes: his phone is nudged, with nothing but the relay's signature.
  await bob.close()
  const nudges = () => fetch('http://127.0.0.1:4182/push/bobs-phone').then((response) => response.json())
  expect(await nudges()).toEqual([])
  const sent = await fetch(`${RELAY_URL}v1/m/${mailbox}`, { method: 'POST', headers: { origin: 'http://127.0.0.1:4180' }, body: 'sealed' })
  expect(sent.status).toBe(201)
  await expect.poll(nudges).toEqual([expect.stringMatching(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/)])
})
