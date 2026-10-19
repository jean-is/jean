// The organisation's authorities and places (D434, ee/): with policy's `seal`, its EST service certifies the key
// this device seals with, so a saved certificate carries the authority's chain and, once sealed, what checks it
// later (JAdES B-LT); Settings › Your data names the authority; with `trust`, the check page served beside that
// policy says one of the organisation's authorities vouches for the seal. With `jurisdictions`, only policy's brains
// within its places are offered, and Settings › Brains says where requests stay. On localhost no key is needed.
import { readFile } from 'node:fs/promises'
import { X509Certificate } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, withPolicy, openSettings, BRAIN_URL } from './helpers.js'
import { authority, issue, requested, certsOnly, ocspAnswer } from './fixtures/ca.js'

const EST = 'https://ca.fake.example/.well-known/est'
const OCSP = 'https://ocsp.fake.example'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' }
/** @param {Uint8Array} der */
const base64 = (der) => Buffer.from(der).toString('base64')
/** @param {Uint8Array} der */
const pem = (der) => `-----BEGIN CERTIFICATE-----\n${base64(der).match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`

const root = await authority('Acme Root CA')
const issuing = await authority('Acme Issuing CA', { issuer: root, ocsp: `${OCSP}/root` })

/** The organisation's EST service and OCSP responders, as the page's routes, and what each was asked. @param {import('@playwright/test').Page} page */
async function authorities(page) {
  const asked = /** @type {string[]} */ ([])
  await page.route('https://ca.fake.example/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const { pathname } = new URL(request.url())
    asked.push(pathname)
    if (pathname.endsWith('/simpleenroll')) {
      const { spki, signed } = await requested(Buffer.from(request.postData() ?? '', 'base64'))
      if (!signed) return route.fulfill({ status: 400, headers: CORS })
      const leaf = await issue({ spki, subject: 'Seal', issuer: issuing, ocsp: `${OCSP}/issuing`, usages: ['1.3.6.1.5.5.7.3.36'] })
      return route.fulfill({ headers: { ...CORS, 'content-type': 'application/pkcs7-mime; smime-type=certs-only' }, body: base64(certsOnly([leaf])) })
    }
    if (pathname.endsWith('/cacerts')) return route.fulfill({ headers: CORS, body: base64(certsOnly([issuing.certificate, root.certificate])) })
    return route.fulfill({ status: 404, headers: CORS })
  })
  await page.route(`${OCSP}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    asked.push(request.url())
    const answer = await ocspAnswer(new Uint8Array(request.postDataBuffer() ?? []), { signer: request.url().endsWith('/root') ? root : issuing })
    return route.fulfill({ headers: { ...CORS, 'content-type': 'application/ocsp-response' }, body: Buffer.from(answer) })
  })
  return asked
}

test('the organisation’s authority certifies the seal: a certificate carries its chain and what checks it later, and the check page says the organisation trusts it', async ({ page, browser, baseURL }) => {
  const asked = await authorities(page)
  const policy = { seal: { est: EST }, trust: [pem(root.certificate)] }
  await withPolicy(page, policy)
  await start(page)
  // Certified at the start, before any certificate.
  await expect.poll(() => asked.filter((path) => path.endsWith('/simpleenroll')).length).toBe(1)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' }).click()
  const card = page.locator('.receipt')
  await card.locator('.receipt-certify > summary').click()
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Save the certificate' }).click()])
  const certificate = await readFile(await download.path(), 'utf8')
  const saved = JSON.parse(certificate)
  const header = JSON.parse(Buffer.from(saved.protected, 'base64url').toString())
  // The authority's certificate for this device's key, then the chain above it but its root.
  expect(header.x5c).toHaveLength(2)
  const [leaf, above] = header.x5c.map((/** @type {string} */ der) => new X509Certificate(Buffer.from(der, 'base64')))
  expect(leaf.issuer).toContain('CN=Acme Issuing CA')
  expect(leaf.verify(above.publicKey)).toBe(true)
  // Once sealed, the chain and what each authority said of its certificate, asked of their responders.
  expect(saved.header.etsiU.map((/** @type {object} */ one) => Object.keys(one)[0])).toEqual(['xVals', 'rVals'])
  expect(saved.header.etsiU[1].rVals.ocspVals).toHaveLength(2)
  expect(asked.filter((address) => address.startsWith(OCSP))).toEqual([`${OCSP}/issuing`, `${OCSP}/root`])
  // Asked once, kept since.
  expect(asked.filter((path) => path.endsWith('/simpleenroll'))).toHaveLength(1)
  await page.keyboard.press('Escape')
  const settings = await openSettings(page, 'Your data')
  await expect(settings).toContainText('Sealed for your organization')
  await expect(settings).toContainText('Your organization’s authority, Acme Issuing CA, certifies the key this device seals your certificates with, until January 1, 2030.')
  // The check page beside that policy says the organisation trusts the seal, in English, Arabic and Japanese.
  for (const [lang, trusted] of [['en', 'Certified by an authority your organization trusts'], ['ar', 'وثّقته جهة تثق بها مؤسستك'], ['ja', '組織が信頼する認証局が証明']]) {
    const context = await browser.newContext({ locale: lang, baseURL })
    const checker = await context.newPage()
    await withPolicy(checker, policy)
    await checker.goto('check')
    await expect(checker.locator('html')).toHaveAttribute('lang', lang)
    await checker.locator('input[type="file"]').setInputFiles([{ name: 'Certificate.json', mimeType: 'application/json', buffer: Buffer.from(certificate) }])
    const row = checker.locator('.receipt-checked .receipt-list').filter({ hasText: trusted })
    await expect(row).toContainText('Acme Root CA')
    await context.close()
  }
})

for (const [lang, section, line] of [
  ['en', 'Brains', 'Your organization keeps requests to brains within these places:'],
  ['ar', 'العقول', 'تُبقي مؤسستك الطلبات الموجّهة إلى العقول في هذه الأماكن:'],
  ['ja', '頭脳', '組織は頭脳へのリクエストを次の場所にとどめています：'],
]) {
  test(`with jurisdictions, only policy’s brains within its places are offered, and Settings › Brains says where requests stay (${lang})`, async ({ page }) => {
    const brain = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ jurisdiction) => ({ id, provider: 'custom', api: 'openai', baseURL: `https://${id}.fake.example/v1`, model: 'fake', label, jurisdiction })
    // Each brain's address leads to the fake brain; one asked as the test ends finds the page gone.
    await page.route(/^https:\/\/(paris|virginia)\.fake\.example\//, async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace(/^https:\/\/\w+\.fake\.example\/v1/, BRAIN_URL) }) }).catch(() => {}))
    const reached = new Set()
    page.on('request', (request) => reached.add(new URL(request.url()).host))
    await withPolicy(page, { jurisdictions: ['EU'], brains: [brain('virginia', 'Virginia', 'US'), brain('paris', 'Paris', 'FR')] })
    await start(page, lang)
    const settings = await openSettings(page, section)
    await expect(settings).toContainText(line)
    await expect(settings).toContainText('paris.fake.example')
    await expect(settings).not.toContainText('virginia.fake.example')
    if (lang !== 'en') return
    await page.keyboard.press('Escape')
    await ask(page, 'Hello')
    await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
    expect(reached.has('paris.fake.example')).toBe(true)
    expect(reached.has('virginia.fake.example')).toBe(false)
  })
}

test('jurisdictions that keep no brains of policy’s own stop Jean with a message for IT, since the person’s would go anywhere', async ({ page }) => {
  await withPolicy(page, { jurisdictions: ['EU'] })
  await page.goto('./')
  await expect(page.locator('main.lock')).toContainText('Tell your IT team.')
})
