// Signing in with the organisation's account (D385): at work, policy names the identity provider and
// the gateway's brain; Jean signs in at the first visit, the gateway gets the token, its MCP servers too, which renews,
// Settings › Brains says who is signed in, and signing out, from the person's menu, stays so until asked.
import { test, expect } from '@playwright/test'
import { start, ask, openSettings, closeSettings, openTasks, openProfile, turnOn, withPolicy, MAIL_URL } from './helpers.js'
import { POLICY, TOOLS, fakeIssuer, fakeGateway, fakeTools, redirect } from './fixtures/fake-issuer.js'

/** The task's answers, all written. @param {import('@playwright/test').Page} page @param {number} [count] */
const answered = async (page, count = 1) => {
  await expect(page.locator('.msg-jean .prose')).toHaveCount(count)
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
}
/** The key the gateway's brain is sent, as Jean keeps it. @param {import('@playwright/test').Page} page */
const key = (page) => page.evaluate(async () => {
  const [{ getSecret }, { app }] = await Promise.all([import('/ui/secrets.js'), import('/ui/state.js')])
  return getSecret(app.fs, 'corp')
})
/** The page shows again, which has Jean renew a token that is about to end. @param {import('@playwright/test').Page} page */
const shown = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
/** The organisation's tokens, as Jean keeps them. @param {import('@playwright/test').Page} page */
const kept = (page) => page.evaluate(async () => {
  const [{ getSecret }, { app }] = await Promise.all([import('/ui/secrets.js'), import('/ui/state.js')])
  return JSON.parse(await getSecret(app.fs, 'signin') ?? 'null')
})
/** Time passes until the token is about to end, as the person reads or is away. @param {import('@playwright/test').Page} page */
const ending = (page) => page.evaluate(async () => {
  const [{ getSecret, setSecret }, { app }] = await Promise.all([import('/ui/secrets.js'), import('/ui/state.js')])
  await setSecret(app.fs, 'signin', JSON.stringify({ ...JSON.parse(await getSecret(app.fs, 'signin') ?? '{}'), renewAt: Date.now() }))
})

test('Jean signs in with the organisation’s account at the first visit, and its gateway answers with the token', async ({ page }) => {
  const issuer = await fakeIssuer(page)
  const seen = await fakeGateway(page, issuer)
  await withPolicy(page, POLICY)
  await start(page)
  // Jean left for the identity provider and came back, with PKCE, asking for what policy names: who signs in, their
  // name and email, renewals and the gateway's scope.
  expect(issuer.authorized).toHaveLength(1)
  const [asked] = issuer.authorized
  expect(asked.get('client_id')).toBe('jean-at-acme')
  expect(asked.get('code_challenge_method')).toBe('S256')
  expect(asked.get('scope')?.split(' ')).toEqual(['openid', 'profile', 'email', 'offline_access', 'api://ai-gateway/chat'])
  expect(new URL(page.url()).search, 'the code and state are gone from the address').toBe('')
  // The gateway's brain needs no step before the first answer.
  await ask(page, 'Hello')
  await answered(page)
  expect(seen.length).toBeGreaterThan(0)
  expect(new Set(seen)).toEqual(new Set(['Bearer access-1']))
  // The drawer's foot calls the person what the account does.
  await openTasks(page)
  await expect(page.locator('app-inbox .profile-name')).toHaveText('Ana Martín')
  // Settings › Brains says who, and the brain is the organisation's.
  const settings = await openSettings(page, 'Brains')
  await expect(settings.getByText('Signed in as ana@acme.example')).toBeVisible()
  // A first name of their own, set in About you, comes first.
  await settings.locator('.settings-nav button', { hasText: 'About you' }).click()
  await settings.locator('.you-name').fill('Annie')
  await settings.locator('.you-name').press('Tab')
  await closeSettings(page)
  await expect(page.locator('app-inbox .profile-name')).toHaveText('Annie')
  // Sign out is in the person's menu. It goes to the identity provider and comes back to a screen that stays.
  await (await openProfile(page)).getByRole('button', { name: 'Sign out' }).click()
  const card = page.locator('#curtain main')
  await expect(card).toContainText('You’re signed out.')
  await expect(card).toContainText('What is kept here stays on this device.')
  await expect(card.getByRole('button', { name: 'Sign in' })).toBeFocused()
  await expect(page.locator('app-shell')).toHaveCount(0)
  const [out] = issuer.signedOut
  expect(out.get('client_id')).toBe('jean-at-acme')
  // Back to Jean's own address, its page and no more.
  expect(out.get('post_logout_redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  // It stays, whatever reloads it: Jean doesn't sign in again until asked.
  await page.reload()
  await expect(card).toContainText('You’re signed out.')
  expect(issuer.authorized).toHaveLength(1)
  await card.getByRole('button', { name: 'Sign in' }).click()
  await expect.poll(() => issuer.authorized.length).toBe(2)
  await expect(page.locator('#prompt')).toBeVisible()
  await expect(page.locator('#curtain')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('#prompt')).toBeVisible()
  expect(issuer.authorized).toHaveLength(2)
})

test('policy’s scopes are all the sign-in asks for: with `openid` alone, its ID token names nobody, and Sign out stays in the person’s menu (D696)', async ({ page }) => {
  const issuer = await fakeIssuer(page, { claims: { preferred_username: undefined, name: undefined } })
  await fakeGateway(page, issuer)
  await withPolicy(page, { ...POLICY, signIn: { ...POLICY.signIn, scopes: ['openid'] } })
  await start(page)
  expect(issuer.authorized.map((asked) => asked.get('scope'))).toEqual(['openid'])
  await (await openProfile(page)).getByRole('button', { name: 'Sign out' }).click()
  await expect(page.locator('#curtain main')).toContainText('You’re signed out.')
})

test('signing out signs out every tab and locks with it; the curtain goes to the identity provider and greets the person back', async ({ page, context }) => {
  const issuer = await fakeIssuer(page)
  await fakeGateway(page, issuer)
  await withPolicy(page, POLICY)
  // What each page's curtain says, from its first frame.
  await page.addInitScript(() => {
    const said = /** @type {any} */ (globalThis).said$ = /** @type {string[]} */ ([])
    const look = () => {
      const name = document.querySelector('#curtain > h1')?.textContent
      if (name && said.at(-1) !== name) said.push(name)
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })
  await start(page)
  // Back from signing in, by the name the sign-in gave.
  await page.reload()
  await expect(page.locator('#prompt')).toBeVisible()
  await page.evaluate(() => { sessionStorage.setItem('app.curtain', JSON.stringify({ name: 'Jean', initial: '' })); location.reload() })
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (globalThis).said$).catch(() => [])).toEqual(['Jean', 'Ana Martín'])
  await expect(page.locator('#curtain')).toHaveCount(0)

  // With a lock, signing out locks: every tab, and the signed-out screen comes after it.
  await turnOn(page, 'Lock')
  await closeSettings(page)
  const settings = await openSettings(page, 'Your data')
  await settings.locator('[data-part="lock"]').click()
  const part = settings.locator('.lock-part')
  await part.getByRole('button', { name: 'Use a password' }).click()
  await part.getByLabel('Password', { exact: true }).fill('a long and happy password')
  await part.getByLabel('The same password again').fill('a long and happy password')
  await part.getByRole('button', { name: 'Next' }).click()
  const code = String(await part.locator('.lock-code').textContent())
  await part.getByLabel('Type its last four characters').fill(code.replace(/-/g, '').slice(-4))
  await part.getByRole('button', { name: 'Set a lock' }).click()
  await closeSettings(page)
  const other = await context.newPage()
  await other.goto('./')
  await expect(other.locator('#prompt')).toBeVisible()

  await (await openProfile(page)).getByRole('button', { name: 'Sign out' }).click()
  const field = page.locator('main.lock .lock-box input').first()
  await expect(field).toBeVisible()
  await expect(other.locator('main.lock .lock-box input').first()).toBeVisible()
  await field.fill('a long and happy password')
  await field.press('Enter')
  const card = page.locator('#curtain main')
  await expect(card).toContainText('You’re signed out.')
  // With a lock on it, nothing needs saying of what stays here.
  await expect(card).not.toContainText('stays on this device')
  expect(issuer.authorized).toHaveLength(1)
})

test('the token renews half its life before it ends, five minutes at most; a renewal refused asks to sign in again, from a toast', async ({ page, browserName }) => {
  // Two minutes: it renews one minute before it ends, and once it is about to, when the page shows again.
  const issuer = await fakeIssuer(page, { expiresIn: 120 })
  const seen = await fakeGateway(page, issuer)
  await withPolicy(page, POLICY)
  await start(page)
  const { expiresAt, renewAt } = await kept(page)
  expect(expiresAt - renewAt).toBeGreaterThan(59_000)
  expect(expiresAt - renewAt).toBeLessThanOrEqual(60_000)
  await ask(page, 'Hello')
  await answered(page)
  expect(seen.at(-1)).toBe('Bearer access-1')
  await shown(page)
  expect(await page.evaluate(() => import('/caps/signin/signin.js').then((signin) => signin.token())), 'not yet').toBe('access-1')
  expect(issuer.asked).toHaveLength(1)
  await ending(page)
  await shown(page)
  await expect.poll(() => issuer.asked.map((form) => form.get('grant_type'))).toEqual(['authorization_code', 'refresh_token'])
  expect(issuer.asked[1].get('refresh_token')).toBe('refresh-1')
  await expect.poll(() => key(page)).toBe('access-2')
  await ask(page, 'Hello again')
  await answered(page, 2)
  expect(seen.at(-1)).toBe('Bearer access-2')
  // Refused, the tokens go, and the toast offers to sign in, which keeps what was typed.
  issuer.refusing = true
  await ending(page)
  await shown(page)
  const toast = page.locator('.toast')
  await expect(toast).toContainText('Sign in with your organization’s account to get answers.')
  await page.locator('#prompt').fill('Still there?')
  await toast.getByRole('button', { name: 'Sign in' }).click()
  await expect.poll(() => issuer.authorized.length).toBe(2)
  await expect(page.locator('#prompt')).toHaveValue('Still there?')
  issuer.refusing = false
  await page.locator('#prompt').press('Enter')
  // The task is there again, with its two answers, where storage lasts (Playwright's WebKit has no OPFS).
  await answered(page, browserName === 'webkit' ? 1 : 3)
  expect(seen.at(-1)).toBe(`Bearer ${issuer.current}`)
})

test('a sign-in that comes back refused asks again from a toast, never in a loop', async ({ page }) => {
  const issuer = await fakeIssuer(page)
  await fakeGateway(page, issuer)
  // The identity provider refuses the first sign-in (the user isn't assigned to Jean's app).
  await page.route((url) => url.pathname === '/tenant-1/oauth2/v2.0/authorize', async (route) => {
    const url = new URL(route.request().url())
    issuer.authorized.push(url.searchParams)
    const back = new URL(url.searchParams.get('redirect_uri') ?? '')
    back.search = new URLSearchParams({ error: 'access_denied', error_description: 'AADSTS50105', state: url.searchParams.get('state') ?? '' }).toString()
    await redirect(route, back.href)
  }, { times: 1 })
  await withPolicy(page, POLICY)
  await page.goto('./')
  await expect(page.locator('.toast')).toContainText('Sign in with your organization’s account to get answers.')
  await expect(page.locator('#prompt')).toBeVisible()
  expect(issuer.authorized).toHaveLength(1)
  await page.locator('.toast').getByRole('button', { name: 'Sign in' }).click()
  await expect.poll(() => issuer.authorized.length).toBe(2)
  await expect(page.locator('#prompt')).toBeVisible()
  expect(issuer.current).toBe('access-1')
})

test('a connection of the organisation’s can take the same token, as its gateway’s MCP servers do; refused, Sign in goes through the organisation’s sign-in again', async ({ page }) => {
  const issuer = await fakeIssuer(page)
  await fakeGateway(page, issuer)
  const seen = await fakeTools(page, issuer)
  await withPolicy(page, { ...POLICY, capabilities: { preUnlock: ['connections'] }, connections: [{ id: 'tools', name: 'Acme tools', url: TOOLS, auth: 'oidc' }] })
  await start(page)
  const settings = await openSettings(page, 'Connections')
  await settings.locator('.data-rows button', { hasText: 'Acme tools' }).click()
  await expect(settings.locator('.connection-kinds')).toContainText('Find a customer')
  // Its account is the person's, as the organisation's sign-in says.
  await expect(settings.locator('li.setting', { hasText: 'Account' })).toContainText('ana@acme.example')
  expect(new Set(seen)).toEqual(new Set(['Bearer access-1']))
  // The gateway no longer takes the token Jean holds.
  issuer.current = 'revoked'
  await page.evaluate(() => import('/caps/connections/connections.js').then((connections) => connections.list()))
  const waiting = settings.locator('.connection-wait')
  await expect(waiting).toContainText('Acme tools needs you to sign in again.')
  await waiting.getByRole('button', { name: 'Sign in' }).click()
  await expect.poll(() => issuer.authorized.length).toBe(2)
  // Back where the person was, on the connection's page, its actions there again.
  await expect(page.locator('#curtain')).toHaveCount(0)
  await expect(settings.locator('.connection-kinds')).toContainText('Find a customer')
  await expect(waiting).toHaveCount(0)
  expect(seen.at(-1)).toBe('Bearer access-2')
})

test('back from a connection’s own sign-in as the organisation’s can’t renew, Jean keeps the connection, then signs in again, never leaving before', async ({ page }) => {
  // Five minutes, as Keycloak's access tokens last unless set otherwise.
  const issuer = await fakeIssuer(page, { expiresIn: 300 })
  const seen = await fakeGateway(page, issuer)
  await withPolicy(page, POLICY)
  await start(page)
  // While the person signs in to the service, the organisation's token comes to renew, which its identity provider refuses.
  await ending(page)
  issuer.refusing = true
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  await dialog.getByRole('button', { name: /^Another service, by its address/ }).click()
  await expect(dialog.locator('.data-head h2')).toBeFocused()
  await dialog.locator('input[name="url"]').fill(`${MAIL_URL}/mcp`)
  await dialog.locator('input[name="name"]').fill('Mail')
  await dialog.locator('#connection-add .button.primary').click()
  // The service's code becomes its tokens and the connection is kept; then Jean leaves for the organisation's sign-in, and comes back to it.
  await expect.poll(() => issuer.authorized.length).toBe(2)
  await expect(page.locator('#curtain')).toHaveCount(0)
  await expect(dialog.locator('.data-head')).toContainText('3 actions')
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.connections?.map(({ name, auth }) => ({ name, auth })))).toEqual([{ name: 'Mail', auth: 'oauth' }])
  expect(issuer.asked.map((form) => form.get('grant_type'))).toEqual(['authorization_code', 'refresh_token', 'authorization_code'])
  await expect.poll(() => key(page)).toBe('access-3')
  expect(new URL(page.url()).search, 'the code and state are gone from the address').toBe('')
  issuer.refusing = false
  await closeSettings(page)
  await ask(page, 'Hello')
  await answered(page)
  expect(seen.at(-1)).toBe('Bearer access-3')
})

test('the sections of the groups the person is in apply from the first sign-in: a group’s own brain gets the token, and Settings says whose (D429)', async ({ page }) => {
  // Entra's way: a security group by its object id, and an app role by its value.
  const issuer = await fakeIssuer(page, { claims: { groups: ['5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07'], roles: ['Jean.Reader'] } })
  const seen = await fakeGateway(page, issuer)
  await withPolicy(page, { ...POLICY, groups: [
    { id: '5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07', name: 'Legal', policy: { brains: [{ ...POLICY.brains[0], id: 'legal', label: 'Acme AI for Legal' }] } },
    { id: 'b2f0d9a4-7e1c-4a55-8c3d-1f6e9a2b7c40', name: 'Sales', policy: { rules: { fetch: 'never' } } },
    { id: 'Jean.Reader', policy: { instructions: 'Answer briefly.' } },
  ] })
  await start(page)
  const policy = await page.evaluate(async () => (await import('/ui/state.js')).app.policy)
  expect(policy.brains.map((/** @type {{ id: string }} */ brain) => brain.id)).toEqual(['legal'])
  expect(policy.instructions).toBe('Answer briefly.')
  expect(policy.rules, 'a group the person isn’t in sets nothing').toBeUndefined()
  // The group's brain, not the organisation's, gets the token as its key before the first answer.
  await ask(page, 'Hello')
  await answered(page)
  expect(new Set(seen)).toEqual(new Set(['Bearer access-1']))
  expect(await page.evaluate(async () => {
    const [{ getSecret }, { app }] = await Promise.all([import('/ui/secrets.js'), import('/ui/state.js')])
    return getSecret(app.fs, 'legal')
  })).toBe('access-1')
  const settings = await openSettings(page, 'Brains')
  await expect(settings.getByText('Signed in as ana@acme.example')).toBeVisible()
  await expect(settings.getByText('You get your organization’s settings for Legal.')).toBeVisible()
})

test('a sign-in with more groups than its token holds stops Jean with a message for IT, since no one can tell whose sections apply (D429)', async ({ page }) => {
  const issuer = await fakeIssuer(page, { claims: { _claim_names: { groups: 'src1' }, _claim_sources: { src1: { endpoint: 'https://graph.windows.net/tenant-1/users/ana/getMemberObjects' } } } })
  await fakeGateway(page, issuer)
  await withPolicy(page, { ...POLICY, groups: [{ id: '5a8e2c41-0b7d-4c1e-9f3a-6d2b8e4f1a07', name: 'Legal', policy: { rules: { fetch: 'never' } } }] })
  await page.goto('./')
  await expect(page.locator('main.lock')).toContainText('This page can’t open: your account is in more groups than your organization’s sign-in can pass on. Tell your IT team.')
  await expect(page.locator('#prompt')).toHaveCount(0)
})
