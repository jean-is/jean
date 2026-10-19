// The page that checks a site (policy.html, D415): what the policy index.html names holds that this version
// doesn't read or reads otherwise, the addresses it names, refused by the site's own Content-Security-Policy
// or answering when tried, what ee/ says of its key, and how the server sends Jean's files; then a policy.json
// chosen there; in English, Arabic and Japanese.
import { test, expect } from '@playwright/test'

/** A policy with a typo, a part not read, a wrong value and two addresses, one the fake brain's. */
const POLICY = {
  brains: [{ id: 'corp', provider: 'custom', api: 'openai', baseURL: 'http://127.0.0.1:4181/v1', model: 'fake', label: 'Corp' }],
  capabilites: { deny: ['computer'] },
  rules: { fetch: 'deny' },
  urls: { modelWeights: 'https://mirror.corp.example/hf/' },
  key: 'eyJ.trial.key',
}

/**
 * policy.html on a site whose index.html names policy.json, which holds `policy`, and whose own header holds `csp`.
 * @param {import('@playwright/test').Page} page @param {unknown} policy @param {string} [csp]
 */
async function site(page, policy, csp) {
  await page.route(/\/index\.html\?\d+$/, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('</head>', '<meta name="app-policy" content="policy.json">\n</head>') })
  })
  await page.route('**/policy.json', (route) => route.fulfill({ json: policy }))
  if (csp) await page.route((url) => url.pathname === '/', async (route) => route.fulfill({ response: await route.fetch(), headers: { 'content-security-policy': csp } }))
  await page.goto('policy.html')
}

test('policy.html says what a policy holds that this version doesn’t read, tries its addresses, and says how the server sends each file', async ({ page }) => {
  await site(page, POLICY)
  await expect(page.getByRole('heading', { name: 'Check this site', level: 1 })).toBeVisible()
  await expect(page.getByText('index.html names policy.json.')).toBeVisible()
  const parts = page.locator('section').first().locator('li')
  await expect(parts.filter({ hasText: 'capabilites' })).toContainText('Not read by this version. Did you mean capabilities?')
  await expect(parts.filter({ hasText: 'rules.fetch' })).toContainText('Should be "allow", "ask", or "never".')
  await expect(parts).toHaveCount(2)

  // On this computer, ee/ needs no key: what it says of one comes from ee/ itself.
  await expect(page.getByText('No key is needed on this computer.')).toBeVisible()

  const addresses = page.locator('section', { has: page.getByRole('heading', { name: 'Addresses' }) }).locator('li')
  await expect(addresses).toHaveText([/brains\[0\]\.baseURL\s+http:\/\/127\.0\.0\.1:4181\/v1/, /urls\.modelWeights\s+https:\/\/mirror\.corp\.example\/hf\//])
  await page.getByRole('button', { name: 'Try each address' }).click()
  await expect(addresses.first()).toContainText('Answers (200).')
  await expect(addresses.last()).toContainText('No answer this site may read')

  // npm run dev's server sends no-cache and the types, and answers the pages without .html, but not the rest of the set.
  const server = page.locator('section', { has: page.getByRole('heading', { name: 'The server' }) }).locator('li')
  await expect(server.filter({ hasText: 'cache-control: no-cache' })).toContainText('Sent')
  await expect(server.filter({ hasText: 'x-content-type-options: nosniff' })).toContainText('Not sent')
  for (const line of ['.mjs text/javascript', '.wasm application/wasm', '.webmanifest application/manifest+json', /^\/privacy/, /^\/fr\/privacy/]) await expect(server.filter({ hasText: line })).toContainText('Sent')

  // A policy.json chosen here, before it goes up: not JSON, then fine.
  const choose = page.getByLabel('Check another policy.json')
  await choose.setInputFiles({ name: 'draft.json', mimeType: 'application/json', buffer: Buffer.from('{ "brains": [ }') })
  await expect(page.getByText('draft.json, chosen here, checked against this site.')).toBeVisible()
  await expect(page.getByText('This isn’t JSON:')).toBeVisible()
  await choose.setInputFiles({ name: 'fixed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ rules: { fetch: 'ask' }, lock: 'required' })) })
  await expect(page.getByText('Every part is one this version reads, in the shape it reads it.')).toBeVisible()
  await expect(page.getByText('The policy names no address.')).toBeVisible()
})

test('policy.html says which addresses the site’s own header refuses, in Arabic and Japanese', async ({ browser }) => {
  for (const [lang, title, refused] of [
    ['ar', 'افحص هذا الموقع', 'ترفضه ترويسة Content-Security-Policy لهذا الموقع.'],
    ['ja', 'このサイトを確認', 'このサイトの Content-Security-Policy ヘッダーが拒否しています。'],
  ]) {
    const context = await browser.newContext({ locale: lang })
    const page = await context.newPage()
    await site(page, { brains: POLICY.brains }, "frame-ancestors 'self'; connect-src 'self'")
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    await expect(page.locator('section li').filter({ hasText: '127.0.0.1:4181' })).toContainText(refused)
    await context.close()
  }
})
