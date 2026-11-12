// SPDX-License-Identifier: MIT
// A design system proposed from the person's own material (D740): on the design system's page from a logo, a brand guide as a
// PDF or a Word file, drawn in its previews and worn only once accepted; or by Jean in a task, from a logo shared, waiting there.
// Every kit proposed reads at AA by day and by night. In Arabic and Japanese too, from a guide written in each.
import { test, expect } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { start, connectFakeBrain, ask, answered, openSettings } from './helpers.js'
import { crc32 } from '../app/core/zip.js'
import { wordGuide, BRANDS } from './brands/fixtures.js'

/** A PNG, each pixel `at(x, y)` gives as RGBA. @param {number} width @param {number} height @param {(x: number, y: number) => number[]} at */
function png(width, height, at) {
  const row = width * 4 + 1, raw = Buffer.alloc(row * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(at(x, y), y * row + 1 + x * 4)
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0), out.write(type, 4, 'latin1'), data.copy(out, 8), out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0), head.writeUInt32BE(height, 4), head.set([8, 6], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
/** A guide as a PDF of an A4 page, a line each, in Helvetica (one of the standard fonts, which says nothing of the brand). @param {string[]} lines */
function pdf(lines) {
  const stream = `BT /F1 12 Tf 50 780 Td 16 TL ${lines.map((line) => `(${line}) '`).join(' ')} ET`
  return Buffer.from(`%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj
4 0 obj <</Length ${stream.length}>> stream
${stream}
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
trailer <</Root 1 0 R>>
%%EOF`)
}
/** A logo on nothing: a navy disc, a red bar. */
const LOGO = png(240, 120, (x, y) => ((x - 60) ** 2 + (y - 60) ** 2 < 48 ** 2 ? [29, 53, 87, 255] : x > 130 && x < 230 && y > 40 && y < 80 ? [230, 57, 70, 255] : [0, 0, 0, 0]))

/** A file of the person's, as JSON, or null. @param {import('@playwright/test').Page} page @param {string} path */
const json = (page, path) => page.evaluate(async (place) => JSON.parse(String(await (await import('/ui/state.js')).app.fs.read(place) ?? 'null')), path)
/** Where a kit proposed reads below AA (none), by day and by night, as brand.js checks it. @param {import('@playwright/test').Page} page @param {Record<string, any>} tokens */
const unreadable = (page, tokens) => page.evaluate(async (kit) => (await import('/caps/slides/brand.js')).unreadable(kit), tokens)
/** The design system's page, Slides loaded for it as a deck shown would. @param {import('@playwright/test').Page} page @param {string} name its row's */
async function kitPage(page, name, appearance = 'Appearance') {
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('slides'))
  const settings = await openSettings(page, appearance)
  await settings.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(settings.getByRole('heading', { name, exact: true })).toBeVisible()
  return settings
}

test('a design system proposed on its page from a logo, drawn in its previews and worn once accepted; one from a PDF guide rejected leaves it as it was', async ({ page }) => {
  await start(page)
  const settings = await kitPage(page, 'Design system')
  await settings.locator('#kit-propose').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO })
  // Proposed, waiting beside the kit: its navy the main colour, its red among a chart's, its logo the picture itself; nothing worn yet.
  await expect(settings.locator('.kit-proposed [role="status"]')).toContainText('Proposed from logo.png.')
  const proposed = await json(page, '.suggested/kit.json')
  expect(proposed).toMatchObject({ name: 'logo', from: ['logo.png'], tokens: { paper: '#ffffff', primary: '#1d3557', series: ['#1d3557', '#e63946'], logo: expect.stringMatching(/^data:image\/png;base64,iVBOR/) } })
  expect(await unreadable(page, proposed.tokens)).toEqual([])
  expect(await json(page, 'kit.json')).toBeNull()
  await expect(settings.locator('.kit-preview.deck, .kit-preview .deck').first()).toHaveCSS('--deck-fill', '#1d3557')
  await expect(settings.locator('.kit-preview .deck-slide.is-shown .deck-logo').first()).toBeAttached()
  // Accepted: the kit's, the proposal let go.
  await settings.locator('.kit-proposed').getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(settings.locator('.kit-proposed')).toHaveCount(0)
  await expect.poll(async () => (await json(page, 'kit.json'))?.tokens?.primary).toBe('#1d3557')
  expect(await json(page, '.suggested/kit.json')).toBeNull()
  await expect(settings.getByRole('textbox', { name: 'Main colour: rgb() or #hex' }).first()).toHaveValue('#1d3557')
  // A guide as a PDF: its codes in its order, its faces by what each is for; rejected, the kit stays as it was.
  const kept = await json(page, 'kit.json')
  await settings.locator('#kit-propose').setInputFiles({ name: 'Guide.pdf', mimeType: 'application/pdf', buffer: pdf(['Colours', 'Primary #7A1F3D', 'Accent #C9A227', 'Typography', 'Headings: Baskerville Bold', 'Body text: Optima Regular']) })
  await expect(settings.locator('.kit-proposed [role="status"]')).toContainText('Proposed from Guide.pdf.')
  expect((await json(page, '.suggested/kit.json')).tokens).toMatchObject({ primary: '#7a1f3d', fonts: { heading: ['Baskerville'], body: ['Optima'] } })
  await expect(settings.locator('.kit-preview.deck, .kit-preview .deck').first()).toHaveCSS('--deck-fill', '#7a1f3d')
  await settings.locator('.kit-proposed').getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(settings.locator('.kit-proposed')).toHaveCount(0)
  expect(await json(page, '.suggested/kit.json')).toBeNull()
  expect(await json(page, 'kit.json')).toEqual(kept)
  await expect(settings.locator('.kit-preview.deck, .kit-preview .deck').first()).toHaveCSS('--deck-fill', '#1d3557')
  // What isn't brand material says so.
  await settings.locator('#kit-propose').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: png(8, 8, () => [0, 0, 0, 0]) })
  await expect(settings.locator('.hint[role="status"]')).toContainText('No colours found in it')
})

test('from a task: a logo shared, Jean proposes a design system, which waits on its page until the person accepts it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Acme logo.png', mimeType: 'image/png', buffer: LOGO })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Call brand_look with {"files":["Acme logo.png"],"name":"Acme"}')
  await answered(page)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('waiting in Settings')
  const toast = page.locator('.toast')
  await expect(toast).toContainText('A design system from what you shared is waiting for you to accept or reject it.')
  await toast.getByRole('button', { name: 'See it' }).click()
  const settings = page.locator('app-settings')
  await expect(settings.locator('.kit-proposed [role="status"]')).toContainText('Proposed from Acme logo.png.')
  // The task's project is the person's home: the proposal is for their design system, worn nowhere until accepted.
  expect(await json(page, 'kit.json')).toBeNull()
  await settings.locator('.kit-proposed').getByRole('button', { name: 'Accept', exact: true }).click()
  await expect.poll(async () => (await json(page, 'kit.json'))).toMatchObject({ name: 'Acme', tokens: { primary: '#1d3557' } })
})

for (const lang of /** @type {const} */ (['ar', 'ja'])) {
  test(`in ${lang === 'ar' ? 'Arabic' : 'Japanese'}, a design system proposed from a Word guide written in it: its colours, its faces and its logo, accepted in its words`, async ({ page }) => {
    const brand = /** @type {import('./brands/fixtures.js').Brand} */ (BRANDS.find((one) => one.lang === lang && one.guide === 'docx'))
    const words = { ar: { appearance: 'المظهر', kit: 'نظام التصميم', proposed: 'مقترح من', accept: 'قبول' }, ja: { appearance: '外観', kit: 'デザインシステム', proposed: 'からの提案です', accept: '承認' } }[lang]
    await start(page, lang)
    const settings = await kitPage(page, words.kit, words.appearance)
    await settings.locator('#kit-propose').setInputFiles({ name: `${brand.id}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(await wordGuide(brand, LOGO)) })
    await expect(settings.locator('.kit-proposed [role="status"]')).toContainText(words.proposed)
    const proposed = await json(page, '.suggested/kit.json')
    expect(proposed.tokens).toMatchObject({ primary: brand.primary.toLowerCase(), ink: brand.ink.toLowerCase(), fonts: { heading: [brand.heading], body: [brand.body] }, logo: expect.stringMatching(/^data:image\/png/) })
    expect(await unreadable(page, proposed.tokens)).toEqual([])
    await settings.locator('.kit-proposed').getByRole('button', { name: words.accept, exact: true }).click()
    await expect.poll(async () => (await json(page, 'kit.json'))?.tokens?.fonts).toEqual({ heading: [brand.heading], body: [brand.body] })
  })
}
