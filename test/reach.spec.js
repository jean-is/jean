// Connections, web search and live conversation (0.5). The version's done-when: Jean
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
  for (const name of ['Gmail', 'Microsoft 365', 'Google Meet', 'ServiceNow']) await expect(dialog.getByRole('button', { name })).toBeDisabled()
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
  // Its tile stays, for another account, saying nothing more.
  await expect(back.getByRole('button', { name: 'Mail', exact: true })).toBeEnabled()
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
  await mail.getByRole('button', { name: 'Connect', exact: true }).click()
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

/** What web search declares now: its description, and the brain's own search it gives way to, if any. @param {import('@playwright/test').Page} page */
const webSearch = (page) => page.evaluate(async () => {
  const spec = (await import('/ui/caps.js')).contributions().tools.find((tool) => tool.spec.name === 'web_search')?.spec
  return { description: spec?.description, native: spec?.native ?? null }
})

test('web search reads the offline library, a source of its own at the Kiwix server named for it, for every brain (D254, D271)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Web search')
  // Its trophy leads to its section: a switch for each source, Wikipedia alone on at first.
  await page.locator('app-settings .plaque .button').click()
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings.getByRole('switch', { name: 'Wikipedia' })).toBeChecked()
  await expect(settings.getByRole('switch', { name: 'Vikidia' })).not.toBeChecked()
  await expect(settings.getByRole('switch', { name: 'An offline library' })).not.toBeChecked()
  // Wikipedia off, so that the library alone answers; the library on, which asks for its address, tried before it is kept.
  await settings.getByRole('switch', { name: 'Wikipedia' }).click()
  await settings.getByRole('switch', { name: 'An offline library' }).click()
  const field = settings.getByLabel('Address of the Kiwix server')
  // Plain HTTP elsewhere on the network, as a Kiwix Hotspot serves, is refused before any request: Jean's policy blocks it.
  const asked = /** @type {string[]} */ ([])
  page.on('request', (request) => asked.push(request.url()))
  await field.fill('http://192.0.2.1:4445/')
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.locator('.status.is-error')).toHaveText('Only a Kiwix server on this computer, or at an address that starts with https://, can be reached from here.')
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
  await expect(settings.locator('.library')).toHaveText('3 books')
  await expect(settings.locator('.list li', { hasText: '2,687,612 articles' })).toHaveText(/Wikipédia\s+French · 2,687,612 articles/)
  await expect(field).toHaveValue(`${MAIL_URL}/kiwix/`)
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

test('Wikipedia can be read from a Kiwix server, its Wikipedia books alone; Vikidia is a switch away; either leaves the brain’s own search aside (D271)', async ({ page }) => {
  await start(page)
  await turnOn(page, 'Web search')
  await page.locator('app-settings .plaque .button').click()
  const settings = page.locator('app-settings dialog[open]')
  expect((await webSearch(page)).native).toBe('web_search')
  await settings.getByText('Wikipedia from a Kiwix server').click()
  await settings.getByLabel('Address of the Kiwix server').fill(`${MAIL_URL}/kiwix/`)
  await settings.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(settings.locator('.library')).toHaveText('3 books')
  await expect.poll(() => webSearch(page)).toEqual({ native: null, description: 'Search Wikipedia (offline) for facts the conversation does not hold. Results are numbered sources to cite.' })
  // Removed, Wikipedia is read from the web again.
  await settings.getByRole('button', { name: 'Remove' }).click()
  await expect.poll(async () => (await webSearch(page)).native).toBe('web_search')
  await settings.getByRole('switch', { name: 'Vikidia' }).click()
  await expect.poll(() => webSearch(page)).toEqual({ native: null,
    description: 'Search the web (Wikipedia, in any language) and Vikidia (the encyclopedia for children) for facts the conversation does not hold. Results are numbered sources to cite.' })
  await expect(settings.locator('.list li', { hasText: 'Vikidia' })).toContainText('French, English, Spanish')
})

test('a page of Vikidia, whose site refuses to show inside another, opens in a tab at once, never tried beside the conversation (D271)', async ({ page }) => {
  await page.context().route('https://fr.vikidia.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Phare</title><p>Un phare guide les marins.</p>' }))
  await start(page)
  await page.evaluate(async () => {
    const { unlock } = await import('/ui/caps.js')
    await Promise.all([unlock('search'), unlock('browser')])
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
  await page.locator('app-settings .plaque .button').click()
  const settings = page.locator('app-settings dialog[open]')
  // A mailbox, whose search reads its emails, is connected too, once Connections is on.
  await page.evaluate(async (url) => (await import('/ui/state.js')).updateSettings({ connections: [{ id: '01K7MAIL000000000000000000', name: 'Mail', url: `${url}/open/mcp`, auth: 'none' }] }), MAIL_URL)
  const rows = settings.locator('.list li:not(:has(.switch))')
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
