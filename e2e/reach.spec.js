// Connections, web search, pictures and live conversation (0.5). The version's done-when: Jean
// sums up the user's latest emails through a connection, with citations. The connection signs in
// with OAuth against a fake mail service (test/fixtures/fake-mail.js), in the browser.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, connect, openSettings, MAIL_URL, GATEWAY_URL } from './helpers.js'

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

/**
 * Serves Jean with an organisation's policy (docs/enterprise.md), as `<meta name="app-policy">`
 * does, so it is still there when the sign-in comes back.
 * @param {import('@playwright/test').Page} page @param {any} policy
 */
async function withPolicy(page, policy) {
  await page.route((url) => url.pathname === '/policy.json', (route) => route.fulfill({ json: policy }))
  // Added once the page is parsed, before its modules run. (Rewriting the page itself would make
  // Chromium treat it as a public site, which may not reach the fake service on this computer.)
  await page.addInitScript(() => document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') document.head.append(Object.assign(document.createElement('meta'), { name: 'app-policy', content: 'policy.json' }))
  }, { once: true }))
}

test('a service Jean knows connects in one click; those not reached yet are there, disabled', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'mail', name: 'Mail', url: `${MAIL_URL}/mcp` }] })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  await expect(dialog.getByRole('button', { name: 'Notion' })).toBeEnabled()
  for (const name of ['Gmail', 'Microsoft 365', 'Google Meet']) await expect(dialog.getByRole('button', { name })).toBeDisabled()
  // Any other service is behind the + at the top.
  await expect(dialog.locator('#connection-add')).toHaveCount(0)
  await expect(dialog.locator('.panel-head .icon-button')).toHaveAttribute('aria-expanded', 'false')
  // Signing in leaves the page and comes back to Settings' Connections.
  await dialog.getByRole('button', { name: 'Mail', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  const back = page.locator('app-settings dialog[open]')
  const mail = back.locator('.connection')
  await expect(mail).toContainText('3 actions')
  await mail.locator('summary').click()
  await expect(mail.locator('.chips li')).toHaveText(['Search emails', 'Read an email', 'Send an email'])
  // Its tile stays, for another account.
  await expect(back.getByRole('button', { name: /^Mail/ })).toContainText('Another account')
})

test('a service that lists its tools to anyone but runs them only for someone signed in offers the sign-in once it refuses (D193)', async ({ page, browserName }) => {
  await start(page)
  await connectFakeBrain(page)
  // Its tools are listed without a sign-in, so it connects without one, as a service whose sign-in is optional does.
  await connect(page, `${MAIL_URL}/listed/mcp`)
  await ask(page, 'Summarise my latest emails')
  await page.locator('.approval .button.primary').click()
  // The call is refused: the brain reads that the user has to sign in, and the connection offers it.
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Mail needs the user to sign in first')
  const mail = (await openSettings(page, 'Connections')).locator('.connection')
  await expect(mail).toContainText('This service needs you to sign in')
  await mail.getByRole('button', { name: 'Connect' }).click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  // Back where the sign-in started: Settings on Connections, over the conversation, whose opening
  // doesn't close it. (WebKit runs here like a private window: the conversation is gone on the way.)
  const back = page.locator('app-settings dialog[open]')
  await expect(back.locator('.connection')).toContainText('3 actions')
  await expect(back.locator('.settings-nav [aria-current="page"]')).toContainText('Connections')
  expect(new URL(page.url()).hash).toMatch(browserName === 'webkit' ? /^#\/settings\/connections$/ : /^#\/c\/[0-9A-Z]{26}\/settings\/connections$/)
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
  await dialog.getByRole('button', { name: 'Mail', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  await dialog.getByRole('button', { name: /^Mail/ }).click()
  await expect(page.locator('.toast')).toContainText('Mail 2 is connected')
  const accounts = dialog.locator('.connection')
  await expect(accounts).toHaveCount(2)
  await accounts.nth(1).locator('summary').click()
  await accounts.nth(1).getByLabel('Name').fill('Mail at work')
  await accounts.nth(1).getByLabel('Name').blur()
  await expect(accounts.nth(1).locator('summary')).toContainText('Mail at work')
  await expect.poll(() => tools(page)).toEqual(['mail_search_emails', 'mail_read_email', 'mail_send_email', 'mail_at_work_search_emails', 'mail_at_work_read_email', 'mail_at_work_send_email'])
})

test('a service that answers no page waits for a gateway that relays to it (D191)', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'closed', name: 'Closed Mail', url: `${MAIL_URL}/closed/mcp`, ready: false }] })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  const tile = dialog.getByRole('button', { name: 'Closed Mail' })
  await expect(tile).toBeDisabled()
  await dialog.locator('summary', { hasText: 'Gateway' }).click()
  await dialog.getByLabel('Gateway').fill(GATEWAY_URL)
  await dialog.getByLabel('Gateway').blur()
  await expect(tile).toBeEnabled()
  await dialog.getByLabel('Gateway').fill('')
  await dialog.getByLabel('Gateway').blur()
  await expect(tile).toBeDisabled()
})

test('through the organisation’s gateway, which holds the app its sign-in registered, a service that answers no page connects (D191)', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'closed', name: 'Closed Mail', url: `${MAIL_URL}/closed/mcp`, ready: false }], urls: { gateway: GATEWAY_URL } })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  await dialog.locator('summary', { hasText: 'Gateway' }).click()
  await expect(dialog.getByLabel('Gateway')).toBeDisabled()
  await expect(dialog.locator('details.other', { hasText: 'Gateway' })).toContainText('Set by your organization')
  await dialog.getByRole('button', { name: 'Closed Mail' }).click()
  await expect(page.locator('.toast')).toContainText('Closed Mail is connected')
  await expect(page.locator('app-settings dialog[open] .connection')).toContainText('3 actions')
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
  const mail = (await openSettings(page, 'Connections')).locator('.connection')
  await mail.locator('summary').click()
  const where = mail.getByRole('group', { name: 'Used in' })
  await expect(where.getByLabel('Every project')).toBeChecked()
  await where.getByLabel('Every project').uncheck()
  // Kept to the project the user is in, which can't be unticked while it is the only one.
  await expect(where.getByLabel('Bakery')).toBeChecked()
  await expect(where.getByLabel('Bakery')).toBeDisabled()
  await expect(mail.locator('summary')).toContainText('3 actions · Bakery')
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
  await page.locator('app-settings dialog[open]').getByRole('button', { name: 'Mail', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  await expect(page.locator('app-settings dialog[open] .connection')).toContainText('Search emails')
})

test('a service of the earlier MCP revision, reached from a script', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
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
  await ask(page, 'Search the web for lighthouse')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Here is what the web says')
  // A web page's chip is a link (D140).
  await expect(answer.locator('a.cite')).toHaveCount(2)
  await expect(answer.locator('a.cite').first()).toHaveAttribute('href', /^https:\/\/en\.wikipedia\.org\/wiki\//)
  // On hover, it shows the site: its icon, asked for only then, its domain and the page's title (D210).
  await page.route('https://icons.duckduckgo.com/ip3/*', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>' }))
  const icon = page.waitForRequest('https://icons.duckduckgo.com/ip3/en.wikipedia.org.ico')
  const tip = answer.locator('.cite-tip').first()
  await expect(tip).toBeHidden()
  await answer.locator('a.cite').first().hover()
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('en.wikipedia.org')
  await expect(tip).toContainText('Lighthouse')
  await icon
  await expect(page.locator('.activity-list')).toContainText('Searched the web · lighthouse')
})

test('a script draws a picture with models.image, kept in the project', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await ask(page, 'Draw a lighthouse at dusk')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is your picture.', { timeout: 30_000 })
  const picture = page.locator('app-image img')
  await expect(picture).toHaveJSProperty('naturalWidth', 96)
  await expect(picture).toHaveAttribute('alt', 'Draw a lighthouse at dusk')
  await expect(page.locator('app-image a[download]')).toHaveAttribute('download', 'draw-a-lighthouse-at-dusk.png')
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
