// Things Jean made (0.2): an answer copied as rich text; in its More options, shared, downloaded as a
// web page or a Word document, its table as CSV the way this locale's spreadsheets read it, and
// printed alone (D409). Files the brain writes (D119): a Word document from the first message on,
// changed in place, and a spreadsheet written from a script.
import { test, expect } from '@playwright/test'
import { readZip } from '../app/core/zip.js'
import { start, connectFakeBrain, ask, turnOn, SALES } from './helpers.js'
import { extractPages } from '../app/caps/files/extract.js'

test.beforeEach(async ({ page }) => {
  // The clipboard, the printer and the share sheet are the browser's: record what reaches them.
  await page.addInitScript(() => {
    const seen = /** @type {any} */ (window)
    seen.copied = null
    seen.printed = null
    seen.shared = null
    seen.print = () => { seen.printed = document.querySelectorAll('.no-print').length }
    Object.defineProperty(navigator, 'share', { value: async (/** @type {ShareData} */ data) => { seen.shared = data } })
    Object.defineProperty(navigator.clipboard, 'write', {
      value: async (/** @type {ClipboardItem[]} */ items) => {
        const item = items[0]
        seen.copied = Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await (await item.getType(type)).text()])))
      },
    })
  })
})

test('an answer copied with its formatting; in its More options, shared, as a web page, a Word document, its table as CSV, and printed alone', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  const answer = page.locator('.msg-jean').last()
  await expect(answer.locator('.prose')).toContainText('Anything else?')
  // Copy first; More options last, before the time, with the other ways to take the answer away.
  const actions = answer.locator('.msg-actions')
  await expect(actions.locator('> :first-child').getByRole('button')).toHaveAccessibleName('Copy')
  await expect(actions.locator('> :nth-last-child(2)').getByRole('button')).toHaveAccessibleName('More options')
  const menu = answer.locator('.answer-menu')
  const more = async () => {
    await actions.getByRole('button', { name: 'More options' }).click()
    await expect(menu).toBeVisible()
    return menu
  }
  expect(await (await more()).getByRole('button').allTextContents())
    .toEqual(['Share', 'Download as a web page', 'Download as a Word document', 'Download the table as a spreadsheet (CSV)', 'Print'])
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  await actions.getByRole('button', { name: 'Copy' }).click()
  await expect(page.locator('.toast')).toContainText('Copied')
  const copied = await page.evaluate(() => /** @type {any} */ (window).copied)
  expect(copied['text/html']).toContain('<strong>carefully</strong>')
  expect(copied['text/html']).toContain('<table>')
  expect(copied['text/html']).not.toContain('<!--')
  expect(copied['text/plain']).toContain('| Read | done |')

  const csv = await saved(page, await more(), 'Download the table as a spreadsheet (CSV)')
  expect(csv.name).toBe('Table 1.csv')
  expect(csv.bytes.toString('utf8')).toBe('﻿Step,Status\r\nRead,done\r\nAnswer,done\r\n')
  await expect(menu).toBeHidden()

  // As a web page named after its task, the answer alone in it, drawn as a saved task is; as a Word document, its table a table.
  const web = await saved(page, await more(), 'Download as a web page')
  expect(web.name).toMatch(/^[^/\\]+\.html$/)
  const records = (/<script type="application\/jsonl">\n([^]*?)<\/script>/.exec(web.bytes.toString('utf8'))?.[1] ?? '').trim().split('\n').map((line) => JSON.parse(line))
  expect(records.map((record) => record.update?.sessionUpdate ?? record.kind)).toEqual(['conversation', 'agent_message_chunk'])
  expect(records[1].update.content.text).toContain('Then, I worked it out **carefully**.')
  const word = await saved(page, await more(), 'Download as a Word document')
  expect(word.name).toBe(web.name.replace(/html$/, 'docx'))
  expect(word.text).toContain('Then, I worked it out carefully.')
  expect(word.text).toContain('| Read | done |')

  // Printed alone: on paper, the answer after the mark, without its request or the task's title, until the print dialog closes.
  // Printing says light, as Chromium's does, and a dark screen stays dark.
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(() => {
    const seen = /** @type {any} */ (window)
    seen.themes = []
    new MutationObserver(() => seen.themes.push(document.documentElement.dataset.theme)).observe(document.documentElement, { attributeFilter: ['data-theme'] })
  })
  await (await more()).getByRole('button', { name: 'Print' }).click()
  expect(await page.evaluate(() => /** @type {any} */ (window).printed)).toBeGreaterThan(0)
  // Printing, then light, and after it dark, then the screen, never the screen in light: in one step,
  // WebKit may say either first.
  await page.emulateMedia({ media: 'print' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(answer.locator('.prose')).toBeVisible()
  await expect(menu).toBeHidden()
  await expect(page.locator('.msg-user')).toBeHidden()
  await expect(page.locator('.conversation-title')).toBeHidden()
  await expect(page.locator('.print-mark')).toBeVisible()
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.no-print')).toHaveCount(0)
  await expect(page.locator('.msg-user')).toBeVisible()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ media: 'screen' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => /** @type {any} */ (window).themes)).not.toContain('light')

  // Shared through the system's sheet, as Copy's text, with the task's title.
  await (await more()).getByRole('button', { name: 'Share', exact: true }).click()
  const shared = await page.evaluate(() => /** @type {any} */ (window).shared)
  expect(shared.text).toContain('| Read | done |')
  expect(shared.title).toBeTruthy()
})

test('in French, a table downloads with semicolons, as Excel reads it there', async ({ page }) => {
  await start(page, 'fr')
  const csv = await page.evaluate(async () => {
    const { toCSV } = await import('/caps/made/made.js')
    return toCSV([['Région', 'Total'], ['Nord', '2540,5']], 'fr')
  })
  expect(csv).toBe('﻿Région;Total\r\nNord;"2540,5"\r\n')
})

test('a Word document from the first message, saved, then changed', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write the bakery plan as a Word document')
  const first = page.locator('.msg-jean').first()
  await expect(first.locator('.prose')).toContainText('Bakery plan.docx is under this answer')
  await expect(first.locator('app-file')).toHaveCount(1)
  await first.locator('.activity > summary').click()
  await expect(first.locator('.activity-list')).toContainText('Create Bakery plan.docx')
  const plan = await saved(page, first, 'Save Bakery plan.docx')
  expect(plan.name).toBe('Bakery plan.docx')
  expect(plan.text).toContain('# Bakery plan\nBake 120 croissants\nDeliver them\n| Day | Croissants |\n| Saturday | 120 |')
  // It says a trained model made it, in its document properties (D324).
  const custom = readZip(new Uint8Array(plan.bytes)).find((entry) => entry.name === 'docProps/custom.xml')
  expect(new TextDecoder().decode(await custom?.read())).toContain('name="DigitalSourceType"><vt:lpwstr>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</vt:lpwstr>')

  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  await ask(page, 'Add a step to it')
  const second = page.locator('.msg-jean').nth(1)
  await expect(second.locator('.prose')).toContainText('Bakery plan.docx is under this answer')
  expect((await saved(page, second, 'Save Bakery plan.docx')).text).toContain('Deliver them\nSell the rest')
  // The first answer keeps the version it made, and each card says which it is (D164).
  expect((await saved(page, first, 'Save Bakery plan.docx')).text).not.toContain('Sell the rest')
  await expect(first.locator('app-file .file-meta')).toContainText('Version 1')
  await expect(second.locator('app-file .file-meta')).toContainText('Version 2')
  await first.getByRole('button', { name: 'Open Bakery plan.docx' }).click()
  await expect(page.locator('app-preview').getByRole('combobox', { name: 'Versions' }).locator('option:checked')).toHaveText('Version 1')
  const drawn = page.frameLocator('app-preview iframe').locator('main')
  await expect(drawn).toContainText('Deliver them', { timeout: 15_000 })
  await expect(drawn).not.toContainText('Sell the rest')
})

test('a spreadsheet written by a script, with exact totals', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) })
  await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
  await ask(page, 'Make the totals by region a spreadsheet')
  const answer = page.locator('.msg-jean').last()
  // The sandbox starts first: as in computer.spec.js, that can take a while on a busy machine.
  await expect(answer.locator('.prose')).toContainText('2540', { timeout: 30_000 })
  const totals = await saved(page, answer, 'Save Totals.xlsx')
  expect(totals.text).toBe('Sheet: Totals\nregion\tsales\nNorth\t2540\nSouth\t1960\nEast\t1515')
  // The script's write shows under the calculation.
  await answer.locator('.activity > summary').click()
  await expect(answer.locator('.activity-list li.is-nested')).toContainText(['Create Totals.xlsx'])
})


test('in the organisation\'s or the project\'s look, a Word document\'s headings and its table\'s head line take its colour and its voice\'s faces, and so does an answer printed (D601)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  const answer = page.locator('.msg-jean').last()
  await expect(answer.locator('.prose')).toContainText('Anything else?')
  // The organisation's kit, which policy brings, a colour too light to read on white, and a voice.
  const colour = await page.evaluate(async () => {
    const [{ app }, { readable }] = await Promise.all([import('/ui/state.js'), import('/ui/colour.js')])
    Object.assign(app.policy, { kit: { tokens: { primary: '#2dd4bf', voice: 'elegant' } } })
    app.project.value = { ...app.project.value }
    return readable('#2dd4bf', '#ffffff')
  })
  await answer.locator('.msg-actions').getByRole('button', { name: 'More options' }).click()
  const word = await saved(page, answer.locator('.answer-menu'), 'Download as a Word document')
  const xml = Object.fromEntries(await Promise.all(readZip(new Uint8Array(word.bytes)).map(async (entry) => [entry.name, new TextDecoder().decode(await entry.read())])))
  expect(xml['word/styles.xml']).toContain(`<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Arial"/><w:b/><w:bCs/><w:color w:val="${colour.slice(1)}"/>`)
  expect(xml['word/document.xml']).toContain(`<w:bottom w:val="single" w:sz="12" w:space="0" w:color="${colour.slice(1)}"/>`)
  // On paper, the table's head line in its colour, darker than the light one given so that it reads.
  await page.emulateMedia({ media: 'print' })
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16))
  await expect.poll(() => answer.locator('.prose th').first().evaluate((th) => getComputedStyle(th).borderBottomColor)).toBe(`rgb(${r}, ${g}, ${b})`)
  await page.emulateMedia({ media: 'screen' })
  expect(await answer.locator('.prose th').first().evaluate((th) => getComputedStyle(th).borderBottomColor)).not.toBe(`rgb(${r}, ${g}, ${b})`)
})

test('an answer printed with the design system\'s logo has it in place of Jean\'s mark, its words in its ink and own fonts; a Word file made has them too (D663)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  const answer = page.locator('.msg-jean').last()
  await expect(answer.locator('.prose')).toContainText('Anything else?')
  await page.evaluate(async () => {
    await (await import('/ui/kit.js')).keepKit(null, { tokens: { ink: '#223344', fonts: { heading: ['Georgia'], body: ['Verdana'] }, logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==' } })
  })
  await answer.locator('.msg-actions').getByRole('button', { name: 'More options' }).click()
  const word = await saved(page, answer.locator('.answer-menu'), 'Download as a Word document')
  const paths = readZip(new Uint8Array(word.bytes)).map((entry) => entry.name)
  expect(paths).toEqual(expect.arrayContaining(['word/header.xml', 'word/media/logo.png']))
  await page.evaluate(async () => (await import('/caps/made/paper.js')).dress())
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.print-mark .paper-logo')).toBeVisible()
  await expect(page.locator('.print-mark app-persona')).toBeHidden()
  expect(await answer.locator('.prose').evaluate((prose) => [getComputedStyle(prose).color, getComputedStyle(prose).fontFamily])).toEqual(['rgb(34, 51, 68)', expect.stringContaining('Verdana')])
  // Taken away, Jean's mark comes back.
  await page.evaluate(async () => { await (await import('/ui/kit.js')).keepKit(null, null); await (await import('/caps/made/paper.js')).dress() })
  await expect(page.locator('.print-mark .paper-logo')).toHaveCount(0)
  await expect(page.locator('.print-mark app-persona')).toBeVisible()
})

/**
 * Saves a file from under an answer, and reads it back as Jean reads a shared file.
 * @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} answer @param {string} button
 */
async function saved(page, answer, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), answer.getByRole('button', { name: button }).click()])
  const name = download.suggestedFilename()
  const bytes = await streamBytes(download)
  return { name, bytes, text: (await extractPages(name, new Uint8Array(bytes)) ?? []).join('\n') }
}

/** @param {import('@playwright/test').Download} download */
async function streamBytes(download) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks)
}

