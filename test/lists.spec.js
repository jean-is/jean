// The EU's trusted lists as the organisation's anchors (D439, ee/): with `trust` naming the List of Trusted Lists and
// the Official Journal's certificates, the check page reads the LOTL and the member state's list a certificate's
// authority is in, off the page in a worker, checks their signatures, and says the seal is qualified while that list
// granted its authority; a list changed after it was signed gives nothing, and the card then says nothing of trust
// rather than that no authority vouches. Jean itself keeps the lists it read in .cache/. On localhost no key is needed.
import { test, expect } from '@playwright/test'
import { start, withPolicy } from './helpers.js'
import { authority, issue, ocspAnswer, QUALIFIED } from './fixtures/ca.js'
import { signed, lotl, memberList } from './fixtures/lists.js'
import { makeSeal, seal, thumbprint, ISSUER } from '../app/caps/receipt/certificate.js'
import { revocation, lasting } from '../app/ee/lasting.js'

const LOTL = 'https://lists.fake.example/eu-lotl.xml'
const FR = 'https://lists.fake.example/tl-fr.xml'
const CORS = { 'access-control-allow-origin': '*' }
/** @param {Uint8Array} der */
const base64 = (der) => Buffer.from(der).toString('base64')
/** @param {Uint8Array} der */
const pem = (der) => `-----BEGIN CERTIFICATE-----\n${base64(der).match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`

const journal = await authority('LOTL signer')
const operator = await authority('French list operator', { country: 'FR' })
const qualifiedCA = await authority('Qualified Seal CA', { country: 'FR', ocsp: 'http://ocsp.qtsp.fake.example/ca' })
const policy = { trust: [{ lotl: LOTL, signers: [pem(journal.certificate)] }] }

// The organisation's qualified seal, certified by an authority France's list grants, sealed and made lasting here.
const own = await makeSeal(new Date('2026-01-01T00:00:00Z'))
const leaf = await issue({ spki: new Uint8Array(await crypto.subtle.exportKey('spki', own.keys.publicKey)), subject: 'Acme SA', country: 'FR', issuer: qualifiedCA, ocsp: 'http://ocsp.qtsp.fake.example/seal', usages: ['1.3.6.1.5.5.7.3.36'], statements: QUALIFIED })
const sealed = await seal({ type: ['VerifiableCredential'], issuer: ISSUER + await thumbprint(own.keys.publicKey) }, { ...own, certificate: leaf, chain: [] }, new Date('2026-10-19T10:00:00Z'))
const answered = async (/** @type {string} */ address, /** @type {RequestInit} */ init) => new Response(await ocspAnswer(new Uint8Array(await new Response(init.body).arrayBuffer()), { signer: qualifiedCA }))
const certificate = JSON.stringify(lasting(sealed, [leaf, qualifiedCA.certificate], await revocation([[leaf, qualifiedCA.certificate]], answered)))

/** The lists' host, answering browsers: France's list as signed, or changed after; what was asked. @param {import('@playwright/test').Page} page @param {{ tampered?: boolean }} [given] */
async function lists(page, { tampered = false } = {}) {
  const asked = /** @type {string[]} */ ([])
  const french = await signed(memberList({ territory: 'FR', issued: '2026-10-01T00:00:00Z', services: [{ name: 'Qualified Seal CA', certificate: qualifiedCA.certificate, statuses: [{ from: '2026-03-01T00:00:00Z', status: tampered ? 'withdrawn' : 'granted' }] }] }), operator)
  const served = { [LOTL]: await signed(lotl({ issued: '2026-10-15T00:00:00Z', announced: [journal.certificate], lists: [{ territory: 'FR', location: FR, signers: [operator.certificate] }] }), journal), [FR]: tampered ? french.replace('Svcstatus/withdrawn', 'Svcstatus/granted') : french }
  await page.route('https://lists.fake.example/**', (route) => {
    asked.push(route.request().url())
    return route.fulfill({ headers: { ...CORS, 'content-type': 'application/xml' }, body: served[route.request().url()] ?? '' })
  })
  return asked
}

for (const lang of ['en', 'ar', 'ja']) {
  test(`the check page reads the EU's trusted lists off the page and says a seal its member state's list grants is qualified (${lang})`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: lang, baseURL })
    const page = await context.newPage()
    const asked = await lists(page)
    await withPolicy(page, policy)
    await page.goto('check')
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await page.locator('input[type="file"]').setInputFiles([{ name: 'Certificate.json', mimeType: 'application/json', buffer: Buffer.from(certificate) }])
    const [trusted, line] = /** @type {Record<string, string[]>} */ ({ en: ['Certified by an authority your organization trusts', 'A qualified seal under EU law'], ar: ['وثّقته جهة تثق بها مؤسستك', 'ختم مؤهَّل بموجب قانون الاتحاد الأوروبي'], ja: ['組織が信頼する認証局が証明', 'EU法に基づく適格な封印'] })[lang]
    const row = page.locator('.receipt-checked .receipt-list').filter({ hasText: trusted })
    await expect(row).toContainText('Qualified Seal CA')
    await expect(row.locator('dd').last()).toHaveText(line)
    // The LOTL, then France's list only, the one country the certificate's names give.
    expect(asked).toEqual([LOTL, FR])
    await context.close()
  })
}

test('a member state’s list changed after it was signed gives nothing, and the check page then says nothing of trust', async ({ page }) => {
  const asked = await lists(page, { tampered: true })
  await withPolicy(page, policy)
  await page.goto('check')
  await page.locator('input[type="file"]').setInputFiles([{ name: 'Certificate.json', mimeType: 'application/json', buffer: Buffer.from(certificate) }])
  await expect(page.locator('.receipt-checked')).toContainText('A key certified by Qualified Seal CA')
  await expect.poll(() => asked).toEqual([LOTL, FR])
  await expect(page.locator('.receipt-checked')).not.toContainText('your organization trusts')
  await expect(page.locator('.receipt-checked')).not.toContainText('qualified seal')
})

test('Jean keeps the lists it read in .cache/, and reads them again for a seal made after it read them', async ({ page }) => {
  const asked = await lists(page)
  await withPolicy(page, policy)
  await start(page)
  const judged = (/** @type {string} */ at) => page.evaluate(async ([text, at]) => {
    const { app } = await import('./ui/state.js')
    const trust = await (await import('./caps/enterprise/enterprise.js')).trust(app.policy, app.fs)
    const said = await trust?.(JSON.parse(text), new Date(at))
    return { said, kept: (await app.fs.list('.cache/lists')).length }
  }, [certificate, at])
  expect(await judged('2026-10-19T10:00:00Z')).toEqual({ said: { status: 'trusted', name: 'Qualified Seal CA', qualified: true }, kept: 1 })
  expect(await judged('2026-10-19T10:00:00Z')).toMatchObject({ said: { status: 'trusted' } })
  expect(asked).toEqual([LOTL, FR])
  // A seal said to be made after the lists were read: they can't say what was granted then, so they are read again.
  expect(await judged(new Date(Date.now() + 3_600_000).toISOString())).toMatchObject({ said: { status: 'trusted' } })
  expect(asked).toEqual([LOTL, FR, LOTL, FR])
})
