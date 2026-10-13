// Checking certificates (D274): the check page, which anyone opens, reads a certificate of an answer,
// its proof and files, says whether its seal holds, who sealed it and what it says, and reaches
// nothing outside Jean's own files; a certificate shared in a conversation brings check_certificate,
// whose card in the answer says the same, and knows this device's own seal.
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
  await card.locator('summary').click()
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
  await card.locator('summary').click()
  // Nothing goes out until the user says so, where the card says what goes where.
  const date = card.getByRole('checkbox', { name: 'Date them with timestamp.sigstore.dev' })
  const log = card.getByRole('checkbox', { name: 'Record them in a public log, rekor.sigstore.dev: public and permanent' })
  await expect(date).not.toBeChecked()
  await date.check()
  await log.check()
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Save the certificate' }).click()])
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(sent).toEqual(['timestamp', 'log'])
  expect(saved.header.etsiU).toHaveLength(1)
  expect(saved.sigstore.mediaType).toBe('application/vnd.dev.sigstore.bundle.v0.3+json')
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
