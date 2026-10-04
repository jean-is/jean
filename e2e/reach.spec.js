// Connections, web search, pictures and live conversation (0.5). The version's done-when: Jean
// sums up the user's latest emails through a connection, with citations. The connection signs in
// with OAuth against a fake mail service (test/fixtures/fake-mail.js), in the browser.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, connect, MAIL_URL } from './helpers.js'

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

test('a service Jean knows connects in one click; the ones not available yet are only listed', async ({ page }) => {
  await withPolicy(page, { directory: [{ id: 'mail', name: 'Mail', url: `${MAIL_URL}/mcp` }] })
  await start(page)
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  await expect(dialog.getByRole('button', { name: 'Notion', exact: true })).toBeVisible()
  await expect(dialog.locator('.is-later')).toContainText('Gmail')
  await expect(dialog.locator('.is-later')).toContainText('Microsoft 365')
  await expect(dialog.locator('.is-later button')).toHaveCount(0)
  await expect(dialog.locator('details.other')).not.toHaveAttribute('open')
  // Signing in leaves the page and comes back to Settings' Connections.
  await dialog.getByRole('button', { name: 'Mail', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  const back = page.locator('app-settings dialog[open]')
  await expect(back.locator('.connection')).toContainText('Search emails · Read an email · Send an email')
  await expect(back.getByRole('button', { name: 'Mail', exact: true })).toHaveCount(0)
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
  await turnOn(page, 'Calculations')
  await page.keyboard.press('Escape')
  await connect(page, `${MAIL_URL}/legacy/mcp`)
  await ask(page, 'What are my latest emails?')
  // The sandbox starts first: as in compute.spec.js, that can take a while on a busy machine.
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
  await expect(answer.locator('button.cite')).toHaveCount(2)
  await expect(answer.locator('button.cite').first()).toHaveAttribute('title', 'Lighthouse')
  await expect(page.locator('.activity-list')).toContainText('Searched the web · lighthouse')
})

test('a script draws a picture with models.image, kept in the project', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Calculations')
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
