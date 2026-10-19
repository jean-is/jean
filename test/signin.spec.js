// Signing in with the organisation's account (D385): at work, policy names the identity provider and
// the gateway's brain; Jean signs in at the first visit, the gateway gets the token, which renews,
// and Settings › Brains says who is signed in, to sign out.
import { test, expect } from '@playwright/test'
import { start, ask, openSettings, closeSettings, openTasks, withPolicy } from './helpers.js'
import { POLICY, fakeIssuer, fakeGateway, redirect } from './fixtures/fake-issuer.js'

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

test('Jean signs in with the organisation’s account at the first visit, and its gateway answers with the token', async ({ page }) => {
  const issuer = await fakeIssuer(page)
  const seen = await fakeGateway(page, issuer)
  await withPolicy(page, POLICY)
  await start(page)
  // Jean left for the identity provider and came back, with PKCE, the gateway's scope and who signs in, with their name.
  expect(issuer.authorized).toHaveLength(1)
  const [asked] = issuer.authorized
  expect(asked.get('client_id')).toBe('jean-at-acme')
  expect(asked.get('code_challenge_method')).toBe('S256')
  expect(asked.get('scope')?.split(' ')).toEqual(['api://ai-gateway/chat', 'profile', 'openid', 'email', 'offline_access'])
  expect(new URL(page.url()).search, 'the code and state are gone from the address').toBe('')
  // The gateway's brain needs no step before the first answer.
  await ask(page, 'Hello')
  await answered(page)
  expect(seen.length).toBeGreaterThan(0)
  expect(new Set(seen)).toEqual(new Set(['Bearer access-1']))
  // The drawer's foot calls the person what the account does (D150).
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
  // Signing out goes to the identity provider, which comes back to sign in afresh.
  await (await openSettings(page, 'Brains')).getByRole('button', { name: 'Sign out' }).click()
  await expect.poll(() => issuer.authorized.length).toBe(2)
  const [out] = issuer.signedOut
  expect(out.get('client_id')).toBe('jean-at-acme')
  // Back to Jean's own address, its page and no more.
  expect(out.get('post_logout_redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  await expect(page.locator('#prompt')).toBeVisible()
})

test('the token renews before it ends; a renewal refused asks to sign in again, from a toast', async ({ page, browserName }) => {
  // Two minutes: always about to end, so each time the page shows Jean renews it.
  const issuer = await fakeIssuer(page, { expiresIn: 120 })
  const seen = await fakeGateway(page, issuer)
  await withPolicy(page, POLICY)
  await start(page)
  await ask(page, 'Hello')
  await answered(page)
  expect(seen.at(-1)).toBe('Bearer access-1')
  await shown(page)
  await expect.poll(() => issuer.asked.map((form) => form.get('grant_type'))).toEqual(['authorization_code', 'refresh_token'])
  expect(issuer.asked[1].get('refresh_token')).toBe('refresh-1')
  await expect.poll(() => key(page)).toBe('access-2')
  await ask(page, 'Hello again')
  await answered(page, 2)
  expect(seen.at(-1)).toBe('Bearer access-2')
  // Refused, the tokens go, and the toast offers to sign in, which keeps what was typed.
  issuer.refusing = true
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
