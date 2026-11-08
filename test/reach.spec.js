// Connections, web search and live conversation (0.5). The version's done-when: Jean
// sums up the user's latest emails through a connection, with citations. The connection signs in
// with OAuth against a fake mail service (test/fixtures/fake-mail.js), in the browser.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openFromCase, connect, connectTile, openSettings, closeSettings, openTasks, withPolicy, MAIL_URL, GATEWAY_URL, BRAIN_URL } from './helpers.js'

/** @param {import('@playwright/test').Page} page */
const system = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.find((record) => record.meta?.prompt)?.meta?.prompt.system)

test('Jean sums up the latest emails through a connection, with citations', async ({ page }) => {
  await start(page)
  // The service wants a sign-in: Jean finds its sign-in server, registers, and comes back. Signing
  // in leaves the page, so in a private window (WebKit here) it comes before anything else.
  await connect(page, `${MAIL_URL}/mcp`)
  expect(new URL(page.url()).search, 'the code and state are gone from the address').toBe('')
  await connectFakeBrain(page)

  await ask(page, 'Summarise my latest emails')
  // Reading through a connection asks first, by default.
  const approval = page.locator('.approval')
  await expect(approval).toContainText('Mail: Search emails')
  await approval.locator('.button.primary').click()
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Your 3 latest emails')
  await expect(answer).toContainText('Croissants for Saturday')
  await expect(answer.locator('.cite')).toHaveCount(3)
  await expect(answer.locator('.cite').first()).toHaveAttribute('title', 'Croissants for Saturday')
  await page.locator('.read-list summary', { hasText: 'Sources' }).click()
  await expect(page.locator('.read-list li', { hasText: 'Invoice 2041 is due Friday' })).toBeVisible()
  // The tools were deferred: found with find_tools, never in the frozen prompt's tool list.
  expect(await system(page)).toContain('<connections>\n- Mail: mail_search_emails, mail_read_email, mail_send_email\n</connections>')
  await expect(page.locator('.activity-list')).toContainText('Looked for the right tool')
})

test('what Google’s services bring in goes only to brains whose service never trains on it, whoever asks (D440)', async ({ page }) => {
  // Gmail's API, as Google's would answer it: who is signed in, then two emails.
  const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me/'
  const emails = { m1: 'Croissants for Saturday', m2: 'Invoice 2041 is due Friday' }
  await page.route(`${GMAIL}**`, (route) => {
    const { pathname } = new URL(route.request().url())
    const id = /messages\/(\w+)$/.exec(pathname)?.[1]
    return route.fulfill({ json: pathname.endsWith('/profile') ? { emailAddress: 'ana@example.com' } : id
      ? { id, threadId: `t${id}`, snippet: 'See you then', payload: { headers: [{ name: 'Subject', value: emails[/** @type {'m1'} */ (id)] }, { name: 'From', value: 'Ana <ana@example.com>' }] } }
      : { messages: Object.keys(emails).map((each) => ({ id: each })) } })
  })
  // The fake brain stands behind Gemini's address, whose free tier trains on what it's sent, and behind OpenAI's, which doesn't.
  for (const base of ['https://generativelanguage.googleapis.com/v1beta/openai', 'https://api.openai.com/v1']) {
    await page.route(`${base}/**`, async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace(base, BRAIN_URL) }) }))
  }
  await start(page)
  const gemini = await page.evaluate(async (url) => {
    const [{ updateSettings }, { connectBrain }] = await Promise.all([import('/ui/state.js'), import('/ui/brains.js')])
    await updateSettings({ connections: [{ id: 'gmail', name: 'Gmail', url, auth: 'none' }] })
    return (await connectBrain({ provider: 'gemini', apiKey: 'test-key', model: 'fake-brain-1' })).id
  }, GMAIL)
  await turnOn(page, 'Connections')
  await expect(page.locator('app-settings [data-page="gmail"]')).toContainText('4 actions')
  await closeSettings(page)

  // Gemini's call to Gmail is refused, though allowed: the task is marked, and the picker offers no brain that may read it.
  await ask(page, 'Summarise my latest emails')
  await page.locator('.approval .button.primary').click()
  await expect(page.locator('.toast')).toContainText('This task used Google services')
  await expect(page.locator('#brain-menu')).toBeVisible()
  await expect(page.locator('#brain-menu button', { hasText: 'fake-brain-1' })).toHaveCount(0)
  const marked = () => page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records.some((record) => record.update?._meta?.limitedUse))
  expect(await marked()).toBe(true)
  await page.keyboard.press('Escape')

  // With OpenAI's key too, Auto answers with it, and the picker offers it alone.
  await page.evaluate(async () => (await import('/ui/brains.js')).connectBrain({ provider: 'openai', apiKey: 'test-key', model: 'fake-brain-1' }))
  await ask(page, 'Summarise my latest emails')
  await page.locator('.approval .button.primary').click()
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Your 2 latest emails')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Croissants for Saturday')
  await page.locator('.brain-chip').click()
  await expect(page.locator('#brain-menu button', { hasText: 'fake-brain-1' })).toHaveCount(1)
  await page.keyboard.press('Escape')

  // Gemini picked by hand: the task goes no further, and nothing reaches it.
  const answers = await page.locator('.msg-jean').count()
  await page.evaluate(async (id) => {
    const [{ updateSettings }, { useBrain }] = await Promise.all([import('/ui/state.js'), import('/ui/brains.js')])
    await updateSettings({ auto: false })
    await useBrain(id)
  }, gemini)
  const asked = []
  page.on('request', (request) => request.url().startsWith('https://generativelanguage.googleapis.com/') && request.method() === 'POST' && asked.push(request.url()))
  await ask(page, 'Thanks, and the next ones?')
  await expect(page.locator('.toast').last()).toContainText('This task used Google services')
  await expect(page.locator('.msg-jean .prose', { hasText: 'Your 2 latest emails' })).toHaveCount(1)
  expect(answers).toBeGreaterThan(0)
  expect(asked).toEqual([])
})

test('a service Jean knows is read on its page, then connects with every server its one sign-in reaches (D344); those not reached yet wait apart, saying why', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'mail', name: 'Mail', url: `${MAIL_URL}/mcp`, servers: [`${MAIL_URL}/search/mcp`], scopes: ['mail.read'] }] })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  // With none connected, the section is the services to connect, by what they are for; one the policy adds is under Other.
  await expect(dialog.getByRole('heading', { name: 'Files and documents' })).toBeVisible()
  await expect(dialog.locator('section', { has: page.getByRole('heading', { name: 'Other' }) }).locator('.service strong', { hasText: /^Mail$/ })).toBeVisible()
  // Found by a product it includes.
  await dialog.locator('.connection-find').fill('jira')
  await expect(dialog.getByRole('heading', { name: '1 found' })).toBeVisible()
  await expect(dialog.locator('.services .service')).toHaveText([/Atlassian/])
  await dialog.locator('.connection-find').fill('')
  // Google's APIs (D349) and its Workspace servers (D344) wait for a gateway that holds Google's app, apart, with the gateway.
  for (const name of ['Gmail', 'Google Workspace', 'Microsoft 365', 'ServiceNow']) await expect(dialog.locator('.service', { hasText: name })).toHaveCount(0)
  await dialog.locator('[data-page="later"]').click()
  await expect(dialog.getByRole('heading', { name: 'Not from a browser yet' })).toBeVisible()
  for (const name of ['Gmail', 'Google Calendar', 'Google Drive', 'Google Workspace', 'Microsoft 365', 'ServiceNow']) await expect(dialog.locator('.service.is-soon', { hasText: name }).first()).toBeVisible()
  await dialog.locator('.back').click()
  // A tile opens its page, what Jean may do there and how it signs in; signing in leaves the page and comes back to its own.
  const tile = dialog.locator('.service').filter({ has: page.locator('strong', { hasText: /^Mail$/ }) })
  await tile.click()
  await expect(dialog.getByRole('heading', { name: 'Mail' })).toBeVisible()
  await expect(dialog.locator('.rules')).toContainText('Read and searchAsk me first')
  await dialog.getByRole('button', { name: 'Connect Mail' }).click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  const back = page.locator('app-settings dialog[open]')
  await expect(back.locator('.data-head')).toContainText('5 actions')
  await expect(back.locator('.rules li').first()).toContainText('Search emails · Read an email')
  // Its tile stays, ticked, its page saying another sign-in adds an account.
  await back.locator('.back').click()
  await back.getByRole('button', { name: 'Connect a service' }).click()
  await tile.click()
  await expect(back.locator('.settings-panel')).toContainText('Mail is connected already: this adds another account.')
})

test('a service that lists its tools to anyone but runs them only for someone signed in offers the sign-in once it refuses (D193)', async ({ page, browserName }) => {
  await start(page)
  await connectFakeBrain(page)
  // Its tools are listed without a sign-in, so it connects without one, as a service whose sign-in is optional does.
  await connect(page, `${MAIL_URL}/listed/mcp`)
  await ask(page, 'Summarise my latest emails')
  await page.locator('.approval .button.primary').click()
  // The call is refused: the brain reads that the user has to sign in, and the connection offers it.
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Mail needs the user to sign in')
  // What needs the user comes first, on Jean's pale yellow, with what does it.
  const settings = await openSettings(page, 'Connections')
  await expect(settings.locator('.connection-wait')).toContainText('Mail needs you to sign in again.')
  await expect(settings.locator('.data-rows')).toContainText('Needs you')
  await settings.locator('.connection-wait').getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  // Back where the sign-in started: Settings on the connection's page, over the conversation, whose opening
  // doesn't close it. (WebKit runs here like a private window: the conversation is gone on the way.)
  const back = page.locator('app-settings dialog[open]')
  await expect(back.locator('.data-head')).toContainText('3 actions')
  await expect(back.locator('.settings-nav [aria-current="page"]')).toContainText('Connections')
  expect(new URL(page.url()).hash).toMatch(browserName === 'webkit' ? /^#\/settings\/connections\/[0-9A-Z]{26}$/ : /^#\/c\/[0-9A-Z]{26}\/settings\/connections\/[0-9A-Z]{26}$/)
  // Signed in, its tools run. (A private window, as WebKit's here, forgets the brain on the way.)
  const read = () => page.evaluate(async () => {
    const tool = (await import('/ui/caps.js')).loaded.value.get('connections')?.tools?.find((one) => one.spec.name === 'mail_search_emails')
    const ctx = { signal: undefined, cite: (/** @type {any[]} */ sources) => sources.map((_, i) => i + 1) }
    return tool?.run({ limit: 1 }, /** @type {any} */ (ctx)).catch((/** @type {Error} */ error) => `failed: ${error.message}`)
  })
  await expect.poll(read).toMatch(/^Source \[1\]: Croissants for Saturday/m)
})

/** The names of the connections' tools the brain is given here. @param {import('@playwright/test').Page} page */
const tools = (page) => page.evaluate(async () => (await import('/ui/caps.js')).loaded.value.get('connections')?.tools?.map((tool) => tool.spec.name))

test('a service connects again for another account, each with a name of its own', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'mail', name: 'Mail', url: `${MAIL_URL}/open/mcp` }] })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  await connectTile(page, 'Mail')
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  await connectTile(page, 'Mail')
  await expect(page.locator('.toast')).toContainText('Mail 2 is connected')
  // Renamed on its page, then listed by its new name.
  await dialog.getByLabel('Name').fill('Mail at work')
  await dialog.getByLabel('Name').blur()
  await expect(dialog.locator('.data-head h2')).toHaveText('Mail at work')
  await dialog.locator('.back').click()
  await expect(dialog.locator('.data-rows strong')).toHaveText(['Mail', 'Mail at work'])
  await expect.poll(() => tools(page)).toEqual(['mail_search_emails', 'mail_read_email', 'mail_send_email', 'mail_at_work_search_emails', 'mail_at_work_read_email', 'mail_at_work_send_email'])
})

test('two accounts of a service are told apart by who signed in', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: the first account is gone when the second sign-in leaves the page')
  await withPolicy(page, { directory: [{ id: 'mail', name: 'Mail', url: `${MAIL_URL}/mcp` }] })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  await connectTile(page, 'Mail')
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  // Alone, it goes by its name; another account asks which, and the fake service signs in ben.
  await connectTile(page, 'Mail')
  await expect(page.locator('.toast')).toContainText('Mail (ben@example.com) is connected')
  await dialog.locator('.back').click()
  await expect(dialog.locator('.data-rows strong')).toHaveText(['Mail (ana@example.com)', 'Mail (ben@example.com)'])
  await expect.poll(() => tools(page)).toEqual(['mail_search_emails', 'mail_read_email', 'mail_send_email', 'mail_2_search_emails', 'mail_2_read_email', 'mail_2_send_email'])
})

test('a service that answers no page waits for a gateway that relays to it (D191)', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'closed', name: 'Closed Mail', url: `${MAIL_URL}/closed/mcp`, ready: false }] })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  const waiting = dialog.locator('.service.is-soon', { hasText: 'Closed Mail' })
  await dialog.locator('[data-page="later"]').click()
  await expect(waiting).toBeVisible()
  await expect(dialog.locator('.data-head h2')).toBeFocused()
  await dialog.getByLabel('Gateway').fill(GATEWAY_URL)
  await dialog.getByLabel('Gateway').blur()
  await expect(waiting).toHaveCount(0)
  await dialog.locator('.back').click()
  await expect(dialog.locator('button.service', { hasText: 'Closed Mail' })).toBeEnabled()
  await dialog.locator('[data-page="later"]').click()
  await expect(dialog.locator('.data-head h2')).toBeFocused()
  await dialog.getByLabel('Gateway').fill('')
  await dialog.getByLabel('Gateway').blur()
  await expect(waiting).toBeVisible()
})

test('through the organisation’s gateway, which holds the app its sign-in registered, a service that answers no page connects (D191)', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'closed', name: 'Closed Mail', url: `${MAIL_URL}/closed/mcp`, ready: false }], urls: { gateway: GATEWAY_URL } })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  await dialog.locator('[data-page="later"]').click()
  await expect(dialog.getByLabel('Gateway')).toBeDisabled()
  await expect(dialog.locator('.settings-panel')).toContainText('Set by your organization')
  await connectTile(page, 'Closed Mail')
  await expect(page.locator('.toast')).toContainText('Closed Mail is connected')
  await expect(page.locator('app-settings dialog[open] .data-head')).toContainText('3 actions')
  await expect.poll(() => tools(page)).toContain('closed_mail_search_emails')
})

test('a connection kept to one project gives its tools there only', async ({ page }) => {
  await start(page)
  await connect(page, `${MAIL_URL}/open/mcp`)
  await turnOn(page, 'Projects')
  const project = page.locator('app-project-dialog dialog[open]')
  await project.locator('input[name="name"]').fill('Bakery')
  await project.locator('.button.primary').click()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Bakery')
  const settings = await openSettings(page, 'Connections')
  await settings.locator('.data-rows .item', { hasText: 'Mail' }).click()
  const where = settings.getByRole('group', { name: 'Used in' })
  await expect(where.getByLabel('Every project')).toBeChecked()
  await where.getByLabel('Every project').uncheck()
  // Kept to the project the user is in, which can't be unticked while it is the only one.
  await expect(where.getByLabel('Bakery')).toBeChecked()
  await expect(where.getByLabel('Bakery')).toBeDisabled()
  await settings.locator('.back').click()
  await expect(settings.locator('.data-rows .item', { hasText: 'Mail' })).toContainText('Bakery')
  await expect.poll(() => tools(page)).toHaveLength(3)
  await page.keyboard.press('Escape')
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu .project', { hasText: 'Jean' }).click()
  await expect(page.locator('app-projects .wordmark')).toHaveText('Jean')
  await expect.poll(() => tools(page)).toEqual([])
})

test('a service that can’t register Jean signs in with the client its organisation registered', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'mail', name: 'Mail', url: `${MAIL_URL}/fixed/mcp`, clientId: 'jean-test' }] })
  await start(page)
  await turnOn(page, 'Connections')
  await connectTile(page, 'Mail')
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  await expect(page.locator('app-settings dialog[open] .rules').first()).toContainText('Search emails')
})

/** What the user chose for each service, and the rules for every one. @param {import('@playwright/test').Page} page */
const chosen = (page) => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  return { services: app.settings.value.services ?? {}, rules: app.settings.value.rules }
})

test('what Jean may do in one service is that service’s alone: chosen on its page, or kept from a card, and taken back in Approvals', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await connect(page, `${MAIL_URL}/open/mcp`)
  // Reading there without asking, on its page, its row then saying so: the next request reads without a card.
  const settings = await openSettings(page, 'Connections')
  await settings.locator('.data-rows .item', { hasText: 'Mail' }).click()
  await settings.getByRole('radiogroup', { name: 'Read and search' }).getByText('Do it').click()
  await settings.locator('.back').click()
  await expect(settings.locator('.data-rows .item', { hasText: 'Mail' })).toContainText('Reads without asking')
  await closeSettings(page)
  await ask(page, 'Summarise my latest emails')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Your 3 latest emails')
  await expect(page.locator('.approval')).toHaveCount(0)
  // Back to the usual, nothing is kept for it.
  await (await openSettings(page, 'Connections')).locator('.data-rows .item', { hasText: 'Mail' }).click()
  await settings.getByRole('radiogroup', { name: 'Read and search' }).getByText('Ask me first').click()
  await expect.poll(async () => (await chosen(page)).services).toEqual({})
  await closeSettings(page)
  // A card's Always allow is kept for Mail alone, not for every service's reading, and says where it is changed.
  await ask(page, 'Summarise my latest emails')
  await page.locator('.approval').getByRole('button', { name: 'Always allow' }).click()
  await expect(page.locator('.toast')).toContainText('Kept for Mail alone.')
  await expect.poll(async () => Object.values((await chosen(page)).services)).toEqual([{ fetch: 'allow' }])
  expect((await chosen(page)).rules.fetch).toBeUndefined()
  // Approvals lists it among what is allowed without asking, with Stop, which takes it back.
  const approvals = await openSettings(page, 'Approvals')
  await approvals.locator('[data-page="exceptions"]').first().click()
  const kept = approvals.locator('.rules .setting', { hasText: 'Mail' })
  await expect(kept).toContainText('reads there without asking')
  await kept.getByRole('button', { name: 'Stop' }).click()
  await expect.poll(async () => (await chosen(page)).services).toEqual({})
})

test('a service with many actions shows three of them and how many more under its choice, opening to all of them, A to Z', async ({ page }) => {
  await start(page)
  await connect(page, `${MAIL_URL}/many/mcp`, 12)
  const settings = await openSettings(page, 'Connections')
  await settings.locator('.data-rows .item', { hasText: 'Mail' }).click()
  // Reading's eleven fold under three of them, its choice at the end of its name; acting's one is in a line, as few are.
  const reading = settings.locator('.connection-kinds > li', { hasText: 'Read and search' })
  await expect(reading.locator('summary > span:visible')).toHaveText('Search emails, Read an email, Search threads, and 8 more')
  await expect(reading.locator('.connection-actions li').first()).toBeHidden()
  await expect(settings.locator('.connection-kinds > li', { hasText: 'Write, send and change' }).locator('p')).toHaveText('Send an email')
  // Opened: how many, and every one by name, A to Z, without the full stop one ends in.
  await reading.locator('summary').click()
  await expect(reading.locator('summary > span:visible')).toHaveText('11 actions')
  await expect(reading.locator('.connection-actions li')).toHaveText(['Get the signature', 'List attachments', 'List contacts', 'List folders', 'List labels', 'Read a contact',
    'Read a thread', 'Read an attachment', 'Read an email', 'Search emails', 'Search threads'])
  // Chosen as before, for all of them.
  await reading.getByRole('radiogroup', { name: 'Read and search' }).getByText('Do it').click()
  await expect.poll(async () => Object.values((await chosen(page)).services)).toEqual([{ fetch: 'allow' }])
})

test('a connection is disconnected from its page, asked there, what was chosen for it going too', async ({ page }) => {
  await start(page)
  await connect(page, `${MAIL_URL}/open/mcp`)
  const settings = await openSettings(page, 'Connections')
  await settings.locator('.data-rows .item', { hasText: 'Mail' }).click()
  await settings.getByRole('radiogroup', { name: 'Write, send and change' }).getByText('Never').click()
  await expect.poll(async () => Object.values((await chosen(page)).services)).toEqual([{ other: 'never' }])
  await settings.getByRole('button', { name: 'Disconnect' }).click()
  const asking = settings.getByRole('group', { name: 'Disconnect' })
  await expect(asking).toContainText('Disconnect Mail? Its key is deleted from your devices. Nothing changes in Mail itself.')
  await asking.getByRole('button', { name: 'Cancel' }).click()
  await expect(asking).toHaveCount(0)
  await settings.getByRole('button', { name: 'Disconnect' }).click()
  await asking.getByRole('button', { name: 'Disconnect' }).click()
  // None is left: the section is the services to connect again.
  await expect(settings.locator('.connection-find')).toBeVisible()
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.connections)).toEqual([])
  expect((await chosen(page)).services).toEqual({})
})

test('a connection that comes after Jean opened, from another tab or a sync, is asked what it offers as it comes', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('connections'))
  await page.evaluate(async (url) => (await import('/ui/state.js')).updateSettings({ connections: [{ id: '01K7MAIL000000000000000000', name: 'Mail', url: `${url}/open/mcp`, auth: 'none' }] }), MAIL_URL)
  const settings = await openSettings(page, 'Connections')
  await settings.locator('.data-rows .item', { hasText: 'Mail' }).click()
  await expect(settings.locator('.data-head')).toContainText('3 actions')
})

test('a service of the earlier MCP revision, reached from a script', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer in this tab')
  await page.keyboard.press('Escape')
  await connect(page, `${MAIL_URL}/legacy/mcp`)
  await ask(page, 'What are my latest emails?')
  // The sandbox starts first: as in computer.spec.js, that can take a while on a busy machine.
  await page.locator('.approval .button.primary').click({ timeout: 30_000 })
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Lunch on Thursday?', { timeout: 30_000 })
  await page.locator('.activity > summary').last().click()
  await expect(page.locator('.activity-list .is-nested')).toContainText('Mail: Search emails')
})

test('web search answers with sources that open', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Wikipedia's address comes from settings or policy; here, the fake service's stand-in.
  await page.evaluate(async (url) => (await import('/ui/state.js')).updateSettings({ urls: { wikipedia: `${url}/wiki/{lang}/w/api.php` } }), MAIL_URL)
  await turnOn(page, 'Web search')
  await page.keyboard.press('Escape')
  await page.route('https://upload.wikimedia.test/*', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"/>' }))
  const pictured = page.waitForRequest('https://upload.wikimedia.test/lighthouse.svg')
  await ask(page, 'Search the web for lighthouse pictures')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Here is what the web says')
  // A source's picture shows, asked for without saying from where; at an address the brain changed, its words (D35).
  await expect(answer.locator('img.picture')).toHaveAttribute('src', 'https://upload.wikimedia.test/lighthouse.svg')
  await expect(answer.locator('img.picture')).toHaveAttribute('alt', 'Lighthouse')
  await expect(answer.locator('.image-alt')).toHaveText('[Lighthouse, again]')
  expect((await pictured).headers().referer).toBeUndefined()
  // A web page's chip is a link (D140).
  await expect(answer.locator('a.cite')).toHaveCount(2)
  await expect(answer.locator('a.cite').first()).toHaveAttribute('href', /^https:\/\/en\.wikipedia\.org\/wiki\//)
  // On hover, it shows the site: its icon, asked for only then, its domain and the page's title (D210).
  await page.route('https://icons.duckduckgo.com/ip3/*', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>' }))
  const icon = page.waitForRequest('https://icons.duckduckgo.com/ip3/en.wikipedia.org.ico')
  const tip = answer.locator('.cite-tip').first()
  await expect(tip).toBeHidden()
  // Once the answer has ended: its end scrolls the page, which takes the source from under the pointer.
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await answer.locator('a.cite').first().hover()
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('en.wikipedia.org')
  await expect(tip).toContainText('Lighthouse')
  await icon
  await expect(page.locator('.activity-list')).toContainText('Searched the web · lighthouse')
})

test('Web search has a switch in + once it is found: off, a task started then has none, and one that had it is told and refused; on again, each is told (D304)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async (url) => (await import('/ui/state.js')).updateSettings({ urls: { wikipedia: `${url}/wiki/{lang}/w/api.php` } }), MAIL_URL)
  await turnOn(page, 'Web search')
  await page.keyboard.press('Escape')
  const toggle = page.locator('#add-menu').getByRole('switch', { name: 'Web search' })
  /** Turns it on or off from +, which stays open. @param {boolean} on */
  const turn = async (on) => {
    await page.locator('.composer .add').click()
    await expect(toggle).toHaveAttribute('aria-checked', String(!on))
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', String(on))
    await expect(page.locator('#add-menu')).toBeVisible()
    await page.keyboard.press('Escape')
  }
  /** Asks, then waits for its answer, the nth, to end. @param {string} text @param {number} n */
  const asked = async (text, n) => {
    await ask(page, text)
    await expect(page.locator('.msg-jean')).toHaveCount(n)
    await expect(page.locator('.msg-jean:not(.is-streaming)')).toHaveCount(n)
    await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  }
  /** What the task's brain was told of its tools since it started, and what it declares. */
  const told = () => page.evaluate(async () => {
    const records = (await import('/ui/state.js')).app.current.value?.records ?? []
    return {
      notes: records.flatMap(({ update }) => (update?.sessionUpdate === '_system_note' && ['switch', 'tools'].includes(update.data.kind) ? [update.data] : [])),
      declared: records.find((record) => record.meta?.prompt)?.meta?.prompt.state.tools.includes('web_search'),
      refused: records.some(({ update }) => update && 'rawOutput' in update && update.rawOutput === 'The user turned web_search off.'),
    }
  })
  const answer = page.locator('.msg-jean .prose').last()
  await asked('Search the web for lighthouse', 1)
  await expect(answer).toContainText('Here is what the web says')

  // Off: the task that had it keeps it declared, is told, and its search is refused.
  await turn(false)
  await asked('Search the web for lighthouse', 2)
  await expect(answer).toContainText('I found nothing on the web.')
  expect(await told()).toEqual({ notes: [{ kind: 'switch', off: ['web_search'] }], declared: true, refused: true })
  // A task started meanwhile has none.
  await (await openTasks(page)).locator('.place', { hasText: 'New task' }).click()
  await asked('Search the web for lighthouse', 1)
  await expect(answer).toContainText('Here is what I found')
  expect(await told()).toEqual({ notes: [], declared: false, refused: false })

  // On again: this task can find it, and the first one hears it is back.
  await turn(true)
  await asked('Thanks', 2)
  expect((await told()).notes).toEqual([{ kind: 'tools', added: ['web_search'] }])
  // The first task, the one less lately busy, once it shows: this one has two answers too.
  await (await openTasks(page)).locator('.history-item').last().click()
  await expect(answer).toContainText('I found nothing on the web.')
  await expect(page.locator('.msg-jean')).toHaveCount(2)
  await asked('Thanks', 3)
  expect((await told()).notes).toEqual([{ kind: 'switch', off: ['web_search'] }, { kind: 'switch', on: ['web_search'] }])
})

/** What web search declares now: its description, and the brain's own search it gives way to, if any. @param {import('@playwright/test').Page} page */
const webSearch = (page) => page.evaluate(async () => {
  const spec = (await import('/ui/caps.js')).contributions().tools.find((tool) => tool.spec.name === 'web_search')?.spec
  return { description: spec?.description, native: spec?.native ?? null }
})

test('web search reads the offline library, a source of its own at the Kiwix server named for it, for every brain (D254, D271)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Web search')
  // Its page leads to its section: a switch for Wikipedia and Vikidia, Wikipedia alone on at first, and the library's row.
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings.getByRole('switch', { name: 'Wikipedia' })).toBeChecked()
  await expect(settings.getByRole('switch', { name: 'Vikidia' })).not.toBeChecked()
  const library = settings.getByRole('button', { name: /^Offline library/ })
  await expect(library).toContainText('Not set up')
  // Wikipedia off, so that the library alone answers; the library's page, whose address is tried before it is kept.
  await settings.getByRole('switch', { name: 'Wikipedia' }).click()
  await library.click()
  await expect(settings.getByRole('heading', { name: 'Offline library' })).toBeFocused()
  await expect(settings.getByRole('switch', { name: 'Offline library' })).not.toBeChecked()
  const field = settings.getByLabel('Address of the Kiwix server')
  // What can be reached is said before anything is tried; plain HTTP elsewhere on the network, as a Kiwix Hotspot serves, is refused before any request: Jean's policy blocks it.
  const reach = 'Only a Kiwix server on this computer, or at an address that starts with https://, can be reached from here.'
  await expect(settings.locator('.hint')).toHaveText(reach)
  const asked = /** @type {string[]} */ ([])
  page.on('request', (request) => asked.push(request.url()))
  await field.fill('http://192.0.2.1:4445/')
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.locator('.status.is-error')).toHaveText(reach)
  // Nor can the page itself: index.html's policy is narrowed to this computer before anything Jean keeps is read (D260).
  await page.route('http://192.0.2.1:4445/**', (route) => route.fulfill({ body: 'reached' }))
  expect(await page.evaluate(() => fetch('http://192.0.2.1:4445/').then(() => 'reached', () => 'refused'))).toBe('refused')
  expect(asked.filter((url) => url.includes('192.0.2.1'))).toEqual([])
  await field.fill(`${MAIL_URL}/nothing/`)
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.locator('.status.is-error')).toHaveText('No Kiwix server answered at this address.')
  // The fake service's stand-in, by the address of a page in its reader: kept as the server's own.
  await field.fill(`${MAIL_URL}/kiwix/viewer#wikipedia_fr_all_mini_2025-10/Phare`)
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.locator('.library')).toHaveText('Answering')
  await expect(settings.getByRole('heading', { name: '3 books' })).toBeVisible()
  await expect(settings.locator('.list li', { hasText: '2,687,612 articles' })).toHaveText(/Wikipédia\s+French · 2,687,612 articles/)
  await expect(field).toHaveValue(`${MAIL_URL}/kiwix/`)
  // Kept, it is on; back on the section, its row says how many books and where, and the line who searches what.
  await expect(settings.getByRole('switch', { name: 'Offline library' })).toBeChecked()
  await settings.locator('.back').click()
  await expect(library).toContainText(`3 books · ${new URL(MAIL_URL).host}`)
  await expect(library).toBeFocused()
  await expect(settings.locator('.general-head .lede')).toHaveText('Every brain looks in the offline library.')
  await page.keyboard.press('Escape')
  expect(await webSearch(page), 'no brain’s own search takes its place').toEqual({ native: null,
    description: 'Search the offline library (Wikipedia and other books) for facts the conversation does not hold. Results are numbered sources to cite.' })
  await ask(page, 'Search the web for lighthouse')
  const answer = page.locator('.msg-jean .prose').last()
  // Each page's first paragraph, read from the page itself, rather than the search's snippet.
  await expect(answer).toContainText('A lighthouse is a tower designed to emit light')
  await expect(answer.locator('a.cite')).toHaveCount(2)
  await expect(answer.locator('a.cite').first()).toHaveAttribute('href', `${MAIL_URL}/kiwix/content/wikipedia_en_100_2026-08/Lighthouse`)
})

const OPEN = { 'access-control-allow-origin': '*' }
/** What Jean keeps of one file, to see where a key went. @param {import('@playwright/test').Page} page @param {string} path */
const kept = (page, path) => page.evaluate(async (file) => (await import('/ui/state.js')).app.fs.read(file), path)

test('a search service on the user’s key: tried before it is kept, then every brain searches there, the key among the secrets alone (D671)', async ({ page }) => {
  const TAVILY = { query: 'lighthouse', results: [{ title: 'Lighthouses of Brittany', url: 'https://phares.example/bretagne', content: 'Brittany has the most lighthouses in France.' }], images: [], response_time: 1, answer: null }
  /** @type {any[]} */
  const asked = []
  await page.route('https://api.tavily.com/search', (route) => {
    asked.push({ key: route.request().headers().authorization, body: route.request().postDataJSON() })
    const known = route.request().headers().authorization === 'Bearer good-key'
    return route.fulfill({ status: known ? 200 : 401, headers: OPEN, json: known ? TAVILY : { detail: { error: 'Unauthorized: missing or invalid API key.' } } })
  })
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Web search')
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  // Wikipedia off, so that the service alone answers. Its row says it has no key; its page, what it takes, and its switch waits for a key.
  await settings.getByRole('switch', { name: 'Wikipedia' }).click()
  const row = settings.getByRole('button', { name: /^Tavily/ })
  await expect(row).toContainText('Not set up')
  // Each has its logo, loaded, on its row and on its page, before its title in either direction; Wikipedia and Vikidia too.
  for (const name of ['wikipedia', 'vikidia']) {
    const logo = settings.locator(`.list li:has(img[src$="/${name}.svg"])`).locator('img.is-logo')
    await expect.poll(() => logo.evaluate((image) => /** @type {HTMLImageElement} */ (image).naturalWidth)).toBeGreaterThan(0)
  }
  for (const [name, file] of [['Brave Search', 'brave'], ['Tavily', 'tavily'], ['Google Custom Search', 'google'], ['Kagi', 'kagi']]) {
    const logo = settings.getByRole('button', { name: new RegExp(`^${name}`) }).locator('img.is-logo')
    await expect(logo).toHaveAttribute('src', new RegExp(`/caps/connections/logos/${file}\\.svg$`))
    await expect.poll(() => logo.evaluate((image) => /** @type {HTMLImageElement} */ (image).naturalWidth)).toBeGreaterThan(0)
  }
  await row.click()
  await expect(settings.getByRole('heading', { name: 'Tavily' })).toBeFocused()
  await expect(settings.locator('.general-head img.is-logo')).toHaveAttribute('src', /tavily\.svg$/)
  await expect(settings.locator('.general-head .lede')).toHaveText('Your own Tavily account searches the whole web, for every brain. Your search words go to Tavily, which may charge for them, and your key stays on your own devices.')
  const toggle = settings.getByRole('switch', { name: 'Tavily' })
  await expect(toggle).toBeDisabled()
  await expect(settings.getByRole('link', { name: 'Get a key from Tavily' })).toHaveAttribute('rel', 'noopener noreferrer')
  // A key it refuses is said so of, and isn't kept.
  const field = settings.getByLabel('Key', { exact: true })
  await expect(field).toHaveAttribute('type', 'password')
  await field.fill('wrong-key')
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.locator('.status.is-error')).toHaveText('Tavily refused this key, or has no searches left on it.')
  await expect(toggle).not.toBeChecked()
  expect(await kept(page, '.secrets/keys.json') ?? '').not.toContain('wrong-key')
  // A key it knows is kept, and turns it on; the section says so, and the keyboard comes back to its row.
  await field.fill('good-key')
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(toggle).toBeChecked()
  await expect(settings.locator('.status.is-error')).toBeHidden()
  await expect(field).toHaveValue('')
  expect(JSON.parse(String(await kept(page, '.secrets/keys.json')))['search:tavily']).toBe('{"key":"good-key"}')
  expect(await kept(page, 'settings.json')).not.toContain('good-key')
  expect(asked.at(-1).body).toEqual({ query: 'lighthouse', max_results: 1, language: 'en' })
  await settings.locator('.back').click()
  await expect(row).toBeFocused()
  await expect(row).not.toContainText('Not set up')
  await expect(settings.locator('.general-head .lede')).toHaveText('Every brain looks in Tavily.')
  await page.keyboard.press('Escape')
  // Every brain searches there, none with a search of its own, and each page found is a source to cite.
  expect(await webSearch(page)).toEqual({ native: null, description: 'Search the web (Tavily) for facts the conversation does not hold. Results are numbered sources to cite.' })
  await ask(page, 'Search the web for lighthouse')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Brittany has the most lighthouses')
  await expect(answer.locator('a.cite').first()).toHaveAttribute('href', 'https://phares.example/bretagne')
  expect(asked.at(-1).body).toEqual({ query: 'lighthouse', max_results: 5, language: 'en' })
  // Removed, the key goes, and the service with it.
  await openSettings(page, 'Web search')
  await row.click()
  await settings.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(toggle).not.toBeChecked()
  await expect(toggle).toBeDisabled()
  expect(JSON.parse(String(await kept(page, '.secrets/keys.json')))['search:tavily']).toBeUndefined()
})

test('Google’s page says its service is ending and asks for its search engine, its key never in an address (D671)', async ({ page }) => {
  /** @type {URL[]} */
  const asked = []
  await page.route('https://www.googleapis.com/customsearch/v1**', (route) => {
    asked.push(new URL(route.request().url()))
    expect(route.request().headers()['x-goog-api-key']).toBe('good-key')
    return route.fulfill({ headers: OPEN, json: { items: [{ title: 'Lighthouse', link: 'https://example.test/a', snippet: 'A tower.' }] } })
  })
  await start(page)
  await turnOn(page, 'Web search')
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  await settings.getByRole('button', { name: /^Google Custom Search/ }).click()
  await expect(settings.locator('.hint').first()).toHaveText('Google gives no new keys, and ends this service on January 1, 2027.')
  await expect(settings.getByRole('link', { name: /Get a key/ })).toHaveCount(0)
  await settings.getByLabel('Key', { exact: true }).fill('good-key')
  await settings.getByLabel('Search engine ID').fill('engine-1')
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.getByRole('switch', { name: 'Google Custom Search' })).toBeChecked()
  expect(asked[0].searchParams.get('cx')).toBe('engine-1')
  expect(asked[0].href).not.toContain('good-key')
  expect(JSON.parse(String(await kept(page, '.secrets/keys.json')))['search:google']).toBe('{"key":"good-key","engine":"engine-1"}')
})

test('a service that refuses browsers says so until a gateway reaches it, then goes through it (D671)', async ({ page }) => {
  const GATEWAY = 'https://gateway.test/'
  let hosts = ['slack.com']
  /** @type {any[]} */
  const relayed = []
  await page.route(`${GATEWAY}**`, (route) => {
    const target = new URL(route.request().url()).searchParams.get('url')
    if (!target) return route.fulfill({ headers: OPEN, json: { format: 1, hosts, clients: {} } })
    relayed.push({ target, key: route.request().headers().authorization, body: route.request().postDataJSON() })
    return route.fulfill({ headers: OPEN, json: { meta: {}, data: { search: [{ url: 'https://example.test/a', title: 'Lighthouse', snippet: 'A <b>tower</b>.' }] } } })
  })
  await start(page)
  await turnOn(page, 'Web search')
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  // None named: its row and its page say so, with nothing to type, and the way to where a gateway is named.
  const row = settings.getByRole('button', { name: /^Kagi/ })
  await expect(row).toContainText('Needs a gateway')
  await expect(settings.getByRole('button', { name: /^Tavily/ })).not.toContainText('Needs a gateway')
  await row.click()
  await expect(settings.locator('.hint')).toHaveText('A browser can’t reach Kagi on its own: it takes a gateway that relays to it. The gateway’s address goes in Connections.')
  await expect(settings.getByLabel('Key', { exact: true })).toHaveCount(0)
  await settings.getByRole('button', { name: 'Connections', exact: true }).click()
  await expect(settings.getByLabel('Gateway')).toBeVisible()
  // One that doesn't relay to it reaches it no better.
  await page.evaluate(async (address) => (await import('/ui/state.js')).updateSettings({ urls: { gateway: address } }), GATEWAY)
  await settings.locator('.settings-nav button', { hasText: 'Web search' }).click()
  await expect(row).toContainText('Needs a gateway')
  // One that does: its key is tried through it, and each search goes through it.
  hosts = ['kagi.com']
  await settings.locator('.settings-nav button', { hasText: 'Connections' }).click()
  await settings.locator('.settings-nav button', { hasText: 'Web search' }).click()
  await expect(row).toContainText('Not set up')
  await row.click()
  await settings.getByLabel('Key', { exact: true }).fill('good-key')
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.getByRole('switch', { name: 'Kagi' })).toBeChecked()
  expect(relayed).toEqual([{ target: 'https://kagi.com/api/v1/search', key: 'Bearer good-key', body: { query: 'lighthouse', limit: 1 } }])
})

test('an organisation’s sources leave only the services it names, locked (D671)', async ({ page }) => {
  await withPolicy(page, { searches: ['wikipedia', 'tavily'] })
  await start(page)
  await turnOn(page, 'Web search')
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings.getByRole('button', { name: /^Brave Search/ })).toHaveCount(0)
  await settings.getByRole('button', { name: /^Tavily/ }).click()
  await expect(settings.getByRole('switch', { name: 'Tavily' })).toBeDisabled()
  await expect(settings.getByText('Set by your organization')).toBeVisible()
})

for (const [who, policy] of /** @type {const} */ ([['with Connections refused', { capabilities: { deny: ['connections'] } }], ['for a child', { child: true }]])) {
  test(`${who}, no search service is offered (D671)`, async ({ page }) => {
    await withPolicy(page, policy)
    await start(page)
    await turnOn(page, 'Web search')
    await openFromCase(page)
    const settings = page.locator('app-settings dialog[open]')
    await expect(settings.getByRole('switch', { name: 'Wikipedia' })).toBeVisible()
    await expect(settings.getByRole('button', { name: /^Tavily/ })).toHaveCount(0)
  })
}

for (const [lang, dir] of [['ar', 'rtl'], ['ja', 'ltr']]) {
  test(`a search service’s page in another language: its name and key as they are, nothing wider than the panel (${lang}, D671)`, async ({ page }) => {
    await start(page, lang)
    await page.evaluate(async () => {
      await (await import('/ui/caps.js')).unlock('web-search')
      const { app } = await import('/ui/state.js')
      app.section.value = 'web-search/brave'
      app.dialog.value = 'settings'
    })
    const settings = page.locator('app-settings dialog[open]')
    await expect(page.locator('html')).toHaveAttribute('dir', dir)
    await expect(settings.locator('#source-title')).toHaveText('Brave Search')
    const [logo, title] = await Promise.all([settings.locator('.general-head img.is-logo'), settings.locator('#source-title')].map((part) => part.boundingBox()))
    expect(dir === 'rtl' ? Number(logo?.x) > Number(title?.x) : Number(logo?.x) < Number(title?.x), 'its logo comes first').toBe(true)
    await expect(settings.locator('.hint')).toContainText('Brave Search')
    await page.evaluate(async () => { (await import('/ui/state.js')).app.section.value = 'web-search/tavily' })
    await expect(settings.locator('input[name="key"]')).toHaveAttribute('dir', 'ltr')
    await expect(settings.locator('.general-head .lede')).toContainText('Tavily')
    const label = await page.evaluate(async () => (await import('/core/i18n.js')).t('search.key'))
    await expect(settings.locator('form label')).toContainText(label)
    const panel = settings.locator('.settings-panel')
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
  })
}

test('Wikipedia can be read from the library’s Kiwix server, its Wikipedia books alone; Vikidia is a switch away; either leaves the brain’s own search aside (D271)', async ({ page }) => {
  await start(page)
  await turnOn(page, 'Web search')
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  expect((await webSearch(page)).native).toBe('web_search')
  await settings.getByRole('button', { name: /^Offline library/ }).click()
  // Its page puts the keyboard on its title a frame later: an address typed before goes there, and the field stays empty.
  await expect(settings.getByRole('heading', { name: 'Offline library' })).toBeFocused()
  await settings.getByLabel('Address of the Kiwix server').fill(`${MAIL_URL}/kiwix/`)
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.getByRole('heading', { name: '3 books' })).toBeVisible()
  // The library off and Wikipedia read from its server: Wikipedia's books alone.
  await settings.getByRole('switch', { name: 'Offline library' }).click()
  const here = settings.getByRole('switch', { name: 'Read Wikipedia from here' })
  await expect(here.locator('xpath=..')).toContainText('In place of the web’s, in English and French')
  await here.click()
  await expect.poll(() => webSearch(page)).toEqual({ native: null, description: 'Search Wikipedia (offline) for facts the conversation does not hold. Results are numbered sources to cite.' })
  await settings.locator('.back').click()
  await expect(settings.locator('.list li', { hasText: 'Vikidia' }).first()).toContainText('in your language and 14 others')
  await expect(settings.getByRole('switch', { name: 'Wikipedia' }).locator('xpath=..')).toContainText('From the offline library, in English and French')
  await expect(settings.getByRole('button', { name: /^Offline library/ })).toContainText('Off')
  // Removed, the library goes, and Wikipedia is read from the web again.
  await settings.getByRole('button', { name: /^Offline library/ }).click()
  await settings.getByRole('button', { name: 'Remove' }).click()
  await expect.poll(async () => (await webSearch(page)).native).toBe('web_search')
  await settings.locator('.back').click()
  await settings.getByRole('switch', { name: 'Vikidia' }).click()
  await expect.poll(() => webSearch(page)).toEqual({ native: null,
    description: 'Search the web (Wikipedia, in any language) and Vikidia (the encyclopedia for children) for facts the conversation does not hold. Results are numbered sources to cite.' })
})

test('Settings › Web search says who searches where for the brains here, and its switch is the one in + (D304)', async ({ page }) => {
  await start(page)
  // A brain whose provider searches the web itself, answering under Auto, and one on this device.
  await page.evaluate(async () => (await import('/ui/state.js')).updateSettings({ auto: true, activeBrain: '01K7CLAUDE0000000000000000', brains: [
    { id: '01K7CLAUDE0000000000000000', provider: 'anthropic', api: 'anthropic', baseURL: 'https://api.anthropic.com/v1', model: 'claude-opus-5-5' },
    { id: '01K7DEVICE0000000000000000', provider: 'device', api: 'device', baseURL: '', model: 'gemma' }] }))
  await turnOn(page, 'Web search')
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  const said = settings.locator('.general-head .lede')
  await expect(said).toHaveText('The brain that answers searches the whole web itself.Other brains look in Wikipedia.')
  // Another source on, every brain searches what is on.
  await settings.getByRole('switch', { name: 'Vikidia' }).click()
  await expect(said).toHaveText('Every brain looks in Wikipedia and Vikidia.With Wikipedia alone, the brain that answers searches the whole web again.')
  await settings.getByRole('switch', { name: 'Vikidia' }).click()
  // Its switch is +'s: off here, off there, and the other way round.
  await settings.getByRole('switch', { name: 'Web search' }).click()
  await expect(said).toHaveText('Web search is off: tasks you start now search nowhere, not even with a brain’s own search.')
  await page.keyboard.press('Escape')
  await page.locator('.composer .add').click()
  const toggle = page.locator('#add-menu').getByRole('switch', { name: 'Web search' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await page.keyboard.press('Escape')
  await page.evaluate(async () => (await import('/ui/dialogs.js')).openSettings('web-search'))
  await expect(settings.getByRole('switch', { name: 'Web search' })).toBeChecked()
})

test('a page of Vikidia, whose site refuses to show inside another, opens in a tab at once, never tried beside the conversation (D271)', async ({ page }) => {
  await page.context().route('https://fr.vikidia.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Phare</title><p>Un phare guide les marins.</p>' }))
  await start(page)
  await page.evaluate(async () => {
    const { unlock } = await import('/ui/caps.js')
    await Promise.all([unlock('web-search'), unlock('browser')])
  })
  const click = () => page.evaluate(async () => (await import('/caps/browser/browser.js')).visit('https://fr.vikidia.org/wiki/Phare', { click: true }))
  // The pane closed, a click opens the tab alone.
  const [tab] = await Promise.all([page.waitForEvent('popup'), click()])
  expect(tab.url()).toBe('https://fr.vikidia.org/wiki/Phare')
  const pane = page.locator('app-browser')
  await expect(pane.locator('aside')).toHaveCount(0)
  // Open, it says why, with no way to try it here.
  await page.evaluate(async () => (await import('/caps/browser/browser.js')).show())
  await Promise.all([page.waitForEvent('popup'), click()])
  await expect(pane.getByRole('heading', { name: 'fr.vikidia.org opens in a tab of its own' })).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Try here again' })).toHaveCount(0)
  await expect(pane.locator('.browser-host')).toBeHidden()
})

test('Settings › Web search lists the connections that search the web, as their tools say, and offers those Jean knows (D271)', async ({ page }) => {
  // Exa, at the fake service, which has its two tools and asks for no sign-in.
  await withPolicy(page, { directory: [{ id: 'exa', url: `${MAIL_URL}/search/mcp` }] })
  await start(page)
  await turnOn(page, 'Web search')
  await openFromCase(page)
  const settings = page.locator('app-settings dialog[open]')
  // A mailbox, whose search reads its emails, is connected too, once Connections is on.
  await page.evaluate(async (url) => (await import('/ui/state.js')).updateSettings({ connections: [{ id: '01K7MAIL000000000000000000', name: 'Mail', url: `${url}/open/mcp`, auth: 'none' }] }), MAIL_URL)
  const rows = settings.locator('section', { has: page.getByRole('heading', { name: 'Search services' }) }).locator('li')
  await expect(rows).toHaveCount(1)
  await expect(rows.locator('img.is-logo')).toHaveAttribute('src', /\/caps\/connections\/logos\/exa\.svg$/)
  // A click connects it, Connections turned on for it; then its tools say it searches, and it is offered no more.
  await rows.getByRole('button', { name: 'Connect Exa' }).click()
  await expect(page.locator('.toast')).toContainText('Exa is connected')
  await expect(rows).toHaveCount(1)
  await expect(rows).toHaveText(/^\s*Exa\s+web_search_exa\s*$/)
  await expect(settings.locator('.settings-nav')).toContainText('Connections')
})

for (const [lang, dir] of [['en', 'ltr'], ['ar', 'rtl'], ['ja', 'ltr']]) {
  test(`live conversation is offered to people who dictate (${lang})`, async ({ page }) => {
    await start(page, lang)
    await page.evaluate(async () => (await import('/ui/state.js')).updateSettings({ dictated: 3 }))
    await expect(page.locator('aside.offer')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', dir)
    await page.locator('aside.offer .button.subtle').click()
    await expect(page.locator('aside.offer')).toBeHidden()
    // Once on, it is the box's button while the box is empty, and send once something is typed
    // (starting it needs a microphone and a download, D123).
    await page.evaluate(async () => (await import('/ui/caps.js')).unlock('live'))
    const button = page.locator('.composer .send')
    const label = await page.evaluate(async () => (await import('/core/i18n.js')).t('live.start'))
    await expect(button).toHaveAttribute('aria-label', label)
    await page.locator('#prompt').fill('Hello')
    await expect(button).not.toHaveAttribute('aria-label', label)
  })
}

test('an offer for something already on never shows while it loads again', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit runs here like a private window: nothing is kept for the next visit')
  await start(page)
  // On from Settings, so the offer was never answered.
  await page.evaluate(async () => {
    await (await import('/ui/caps.js')).unlock('live')
    await (await import('/ui/state.js')).updateSettings({ dictated: 3 })
  })
  await page.addInitScript(() => new MutationObserver(() => {
    if (document.querySelector('aside.offer')) Object.assign(window, { offered: true })
  }).observe(document, { childList: true, subtree: true }))
  await page.reload()
  await expect(page.locator('.hero-question')).toBeVisible()
  expect(await page.evaluate(async () => {
    await (await import('/ui/state.js')).app.ready
    return (await import('/ui/caps.js')).loaded.value.has('live')
  })).toBe(true)
  expect(await page.evaluate(() => 'offered' in window)).toBe(false)
})
