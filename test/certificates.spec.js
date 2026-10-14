// Checking certificates (D274): the check page, which anyone opens, reads a certificate of an answer,
// its proof and files, says whether its seal holds, who sealed it and what it says, and reaches
// nothing outside Jean's own files; a certificate shared in a conversation brings check_certificate,
// whose card in the answer says the same, and knows this device's own seal. A picture's Content
// Credentials, read the same ways (D324).
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openTasks } from './helpers.js'
import { reply, logged, logPem } from './fixtures/tsa.js'

/** An answer's certificate and its proof, saved from its card. @param {import('@playwright/test').Page} page */
async function saved(page) {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const button = page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' })
  await expect(button).toHaveClass(/is-local/)
  await button.click()
  const card = page.locator('.receipt')
  await card.locator('.receipt-certify > summary').click()
  const [certificate] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Save the certificate' }).click()])
  const [proof] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Save the proof' }).click()])
  await page.keyboard.press('Escape')
  return { certificate: await readFile(await certificate.path(), 'utf8'), proof: await readFile(await proof.path(), 'utf8') }
}

/** @param {string} name @param {string} text */
const file = (name, text) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) })

for (const [lang, intact, broken, notNamed] of [
  ['en', 'Sealed, and unchanged since', 'Changed, or not sealed by the key it names', 'notes.txt isn’t a file it names'],
  ['ar', 'مختومة، ولم تتغير منذ ذلك الحين', 'تغيّرت، أو لم تُختم بالمفتاح الذي تذكره', 'notes.txt ليس ملفًا تذكره'],
  ['ja', '封印済みで、それ以降変更なし', '変更されているか、記された鍵で封印されていません', 'notes.txt は記載されたファイルではありません'],
]) {
  test(`the check page says whether a certificate’s seal holds, and with its proof shows the words (${lang})`, async ({ page, browser, baseURL }) => {
    const { certificate, proof } = await saved(page)
    const context = await browser.newContext({ locale: lang, baseURL })
    const checker = await context.newPage()
    const reached = new Set()
    checker.on('request', (request) => reached.add(new URL(request.url()).host))
    await checker.goto('check.html')
    await expect(checker.locator('html')).toHaveAttribute('lang', lang)
    const input = checker.locator('input[type="file"]')
    await input.setInputFiles([file('Certificate.json', certificate)])
    await expect(checker.locator('.receipt-verdict')).toHaveText(intact)
    // A change to what it says breaks its seal.
    const sealed = JSON.parse(certificate)
    const says = JSON.parse(Buffer.from(sealed.payload, 'base64url').toString())
    says.credentialSubject.where = 'cloud'
    await input.setInputFiles([file('Certificate.json', JSON.stringify({ ...sealed, payload: Buffer.from(JSON.stringify(says)).toString('base64url') }))])
    await expect(checker.locator('.receipt-verdict')).toHaveText(broken)
    // With its proof, the words, and a file it doesn't name.
    await input.setInputFiles([file('Certificate.json', certificate), file('Proof.sd-jwt', proof), file('notes.txt', 'notes')])
    await expect(checker.locator('.receipt-verdict')).toHaveText(intact)
    await expect(checker.locator('.receipt-checked q').first()).toHaveText('Hello')
    await expect(checker.locator('.receipt-checked')).toContainText(notNamed)
    // Nothing given, and no address in it, went anywhere but Jean's own files.
    expect([...reached]).toEqual([new URL(baseURL ?? '').host])
    await context.close()
  })
}

/** A picture C2PA's own tool signed with its test signer (test/c2pa.test.js), as given. @param {boolean} [changed] */
const signedPicture = async (changed = false) => {
  const buffer = await readFile(new URL('./fixtures/c2pa.png', import.meta.url))
  if (changed) buffer[buffer.length - 3] ^= 1
  return { name: 'c2pa.png', mimeType: 'image/png', buffer }
}

for (const [lang, holds, ai, broken] of [
  ['en', 'c2pa.png carries a signed record of how it was made, unchanged since', 'It says AI made it', 'c2pa.png carries a record of how it was made that doesn’t hold: changed since, or not signed by the key it names'],
  ['ar', 'يحمل c2pa.png سجلًا موقّعًا لكيفية صنعه، لم يتغيّر منذ ذلك الحين', 'يذكر السجل أن الذكاء الاصطناعي صنعه', 'يحمل c2pa.png سجلًا لكيفية صنعه لا يصمد: تغيّر منذ ذلك الحين، أو لم يُوقَّع بالمفتاح الذي يذكره'],
  ['ja', 'c2pa.png には作られた経緯の署名付き記録があり、その後変更されていません', 'AI が作ったと記されています', 'c2pa.png の作られた経緯の記録は成り立ちません。その後変更されたか、記された鍵で署名されていません'],
]) {
  test(`the check page reads a picture’s Content Credentials: whether they hold, who signed them, and that AI made it (D324, ${lang})`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: lang, baseURL })
    const checker = await context.newPage()
    await checker.goto('check.html')
    const input = checker.locator('input[type="file"]')
    await input.setInputFiles([await signedPicture()])
    const card = checker.locator('.receipt-checked')
    await expect(card.locator('.receipt-verdict')).toHaveText(holds)
    await expect(card.locator('.receipt-note')).toHaveText(ai)
    await expect(card).toContainText('C2PA Test Signing Cert')
    await expect(card).toContainText('Test Maker')
    // A byte changed since, and they no longer hold.
    await input.setInputFiles([await signedPicture(true)])
    await expect(card.locator('.receipt-verdict')).toHaveText(broken)
    await context.close()
  })
}

test('a picture with Content Credentials shared in a conversation brings what checks them, which says what they say (D324)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles([await signedPicture()])
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Does this picture carry a certificate?')
  const card = page.locator('app-certificate .receipt-checked')
  await expect(card.locator('.receipt-verdict')).toHaveText('c2pa.png carries a signed record of how it was made, unchanged since')
  await expect(card).toContainText('A key certified by Intermediate CA')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('c2pa.png: its Content Credentials hold; signed by C2PA Test Signing Cert, certified by Intermediate CA')
})

// TrustMark's 100 bits for 61, as its decoder reads them in a watermarked picture; and naught, as in one without.
const WATERMARKED = [...'0100101001010010100101001010010100101001010010100101001010010'].map(Number)

for (const [lang, watermarked, said] of [['en', true, 'It carries an invisible watermark'], ['ar', true, 'يحمل علامة مائية خفية'], ['ja', false, '見えない透かしは見つかりませんでした']]) {
  test(`asked, the check looks for a picture’s invisible watermark too, whose bits TrustMark’s decoder reads (D324, ${lang})`, async ({ page }) => {
    const { payloadOf } = await import('../app/caps/pictures/watermark.js')
    const bits = watermarked ? payloadOf(WATERMARKED) : new Array(100).fill(0)
    // SD-Turbo's worker, where the decoder runs.
    await page.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript',
      body: `self.onmessage = ({ data }) => self.postMessage({ id: data.id, type: 'done', bits: ${JSON.stringify(bits)} })` }))
    await start(page, lang)
    await connectFakeBrain(page)
    await page.locator('.composer input[type="file"]').setInputFiles([await signedPicture()])
    await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
    await ask(page, 'Does this picture carry a certificate or a watermark?')
    await expect(page.locator('app-certificate .receipt-checked .receipt-note')).toContainText(said)
    // The brain hears the same.
    await expect(page.locator('.msg-jean .prose').last()).toContainText(watermarked ? 'its invisible watermark: TrustMark\'s' : 'its invisible watermark: none found')
  })
}

for (const lang of ['en', 'ar', 'ja']) {
  test(`the check page reads a picture’s watermark with the decoder this device keeps, never fetched, and says when it can’t (D324, ${lang})`, async ({ browser, baseURL }) => {
    const { payloadOf, DECODER } = await import('../app/caps/pictures/watermark.js')
    const { BRAND } = await import('../app/brand.js')
    const strings = JSON.parse(await readFile(new URL(`../app/locales/certificates/${lang}.json`, import.meta.url), 'utf8'))
    const context = await browser.newContext({ locale: lang, baseURL })
    const reached = new Set()
    context.on('request', (request) => reached.add(new URL(request.url()).host))
    const checker = await context.newPage()
    // SD-Turbo's worker, where the decoder runs, reading TrustMark's 100 bits for 61.
    const bits = payloadOf(WATERMARKED)
    await checker.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript',
      body: `self.onmessage = ({ data }) => self.postMessage({ id: data.id, type: 'done', bits: ${JSON.stringify(bits)} })` }))
    await checker.goto('check.html')
    const input = checker.locator('input[type="file"]')
    // Without the decoder on this device, what lets the page look.
    await input.setInputFiles([await signedPicture()])
    await expect(checker.locator('main > .receipt-note').last()).toHaveText(strings['certificates.watermark.unread'].replace('{name}', BRAND.name))
    // With it, kept where Jean keeps it, the watermark is read.
    await checker.evaluate(async (path) => (await caches.open('transformers-cache')).put(`https://huggingface.co/${path}`, new Response('kept')), DECODER[0])
    await input.setInputFiles([await signedPicture()])
    await expect(checker.locator('.receipt-checked .receipt-note')).toContainText(strings['certificates.watermark.found'])
    await expect(checker.locator('main > .receipt-note')).toHaveCount(1)
    // Nothing went anywhere but Jean's own files.
    expect([...reached]).toEqual([new URL(baseURL ?? '').host])
    await context.close()
  })
}

test('a certificate shared in a conversation brings what checks it, and its card knows this device’s seal', async ({ page }) => {
  const { certificate, proof } = await saved(page)
  await (await openTasks(page)).locator('.place', { hasText: 'New task' }).click()
  await expect(page.locator('.msg-jean')).toHaveCount(0)
  await page.locator('.composer input[type="file"]').setInputFiles([file('Certificate.json', certificate), file('Proof.sd-jwt', proof)])
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(2)
  await ask(page, 'Is this certificate genuine?')
  const card = page.locator('app-certificate .receipt-checked')
  await expect(card.locator('.receipt-verdict')).toHaveText('Sealed, and unchanged since')
  await expect(card).toContainText('This device')
  await expect(card.locator('q').first()).toHaveText('Hello')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Intact: sealed by this device')
})

test('witnesses date a certificate and a public log records it once the user chooses so, and the check page says by whom (D276)', async ({ page, browser, baseURL }) => {
  // A whole answer, then the check page in a context of its own: under a full run's load, WebKit needs more than a minute.
  test.setTimeout(90_000)
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' }
  /** @type {string[]} */
  const sent = []
  await page.route('https://timestamp.sigstore.dev/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    sent.push('timestamp')
    return route.fulfill({ headers: { ...cors, 'content-type': 'application/timestamp-reply' }, body: Buffer.from(await reply(new Uint8Array(route.request().postDataBuffer() ?? []))) })
  })
  await page.route('https://rekor.sigstore.dev/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (request.url().endsWith('/publicKey')) return route.fulfill({ headers: cors, body: logPem })
    sent.push('log')
    return route.fulfill({ status: 201, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(await logged(request.postDataJSON())) })
  })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const button = page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' })
  await expect(button).toHaveClass(/is-local/)
  await button.click()
  const card = page.locator('.receipt')
  await card.locator('.receipt-certify > summary').click()
  // Nothing goes out until the user says so, where the card says what goes where, one click under the files.
  const date = card.getByRole('checkbox', { name: 'Date them with timestamp.sigstore.dev' })
  const log = card.getByRole('checkbox', { name: 'Record them in a public log, rekor.sigstore.dev: public and permanent' })
  await expect(date).toBeHidden()
  await card.getByText('More options').click()
  await expect(date).not.toBeChecked()
  await date.check()
  await log.check()
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Save the certificate' }).click()])
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(sent).toEqual(['timestamp', 'log'])
  expect(saved.header.etsiU).toHaveLength(1)
  expect(saved.sigstore.mediaType).toBe('application/vnd.dev.sigstore.bundle.v0.3+json')
  // Chosen, they show unasked as the certificate unfolds again: nothing goes out unseen.
  await page.keyboard.press('Escape')
  await button.click()
  await card.locator('.receipt-certify > summary').click()
  await expect(date).toBeVisible()
  await expect(log).toBeChecked()
  const context = await browser.newContext({ baseURL })
  const checker = await context.newPage()
  await checker.goto('check.html')
  await checker.locator('input[type="file"]').setInputFiles([file('Certificate.json', JSON.stringify(saved))])
  const checked = checker.locator('.receipt-checked')
  await expect(checked.locator('.receipt-verdict')).toHaveText('Sealed, and unchanged since')
  await expect(checked).toContainText('Dated by Test TSA')
  await expect(checked).toContainText(/In a public log, entry [\d,]+/)
  await context.close()
})
