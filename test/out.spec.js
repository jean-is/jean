// How what a pane shows leaves Jean (D683): one button just before Close, whose menu goes in one order, whatever opens there: to someone
// (Share, Send to an app, Copy), as a file (Download, the format most want first, its own file last), on paper, then the design system
// for what wears one. What a browser or this Jean can't do isn't there, and one way alone is the button itself. Each kind's own files
// and prints are tested with it (documents, tables, slides, designs, scores, games).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, turnOn, openSettings, SHARE_URL } from './helpers.js'

/** The system's sheet, as a browser with one has it, and what it was given. @param {import('@playwright/test').Page} page */
const withSheet = (page) => page.addInitScript(() => {
  Object.assign(navigator, { canShare: () => true, share: async (/** @type {ShareData} */ data) => { /** @type {any} */ (window).shared = { title: data.title, text: data.text, files: data.files?.map((file) => file.name) } } })
  window.print = () => { /** @type {any} */ (window).printed = document.documentElement.className }
})
/** Sharing by link, found. @param {import('@playwright/test').Page} page */
const withLinks = (page) => page.evaluate(async (host) => {
  const [{ app, updateSettings }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
  await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
  await unlock('share')
}, SHARE_URL)
const BUTTON = '.pane-head > [popovertarget^="out-"]'
/** Capabilities found, in any language. @param {import('@playwright/test').Page} page @param {string[]} ids */
const found = (page, ...ids) => page.evaluate(async (all) => { const { unlock } = await import('/ui/caps.js'); for (const id of all) await unlock(id) }, ids)
/** What the fake brain makes when asked to call a tool. @param {import('@playwright/test').Page} page @param {string} name @param {unknown} args @param {number} answers before */
const made = async (page, name, args, answers = 0) => { await ask(page, `Call ${name} with ${JSON.stringify(args)}`); await answered(page, answers + 1) }

/** A file kept in the project, opened beside the task. @param {import('@playwright/test').Page} page @param {string} name @param {string} mimeType @param {string} text */
const opened = (page, name, mimeType, text) => page.evaluate(async ([name, mimeType, text]) => {
  const [{ app }, { addFile }, { preview }] = await Promise.all([import('/ui/state.js'), import('/core/files.js'), import('/ui/preview.js')])
  const link = await addFile(app.fs, { projectDir: app.projectDir, name, mimeType, bytes: new TextEncoder().encode(text), pages: [text], by: 'jean' })
  preview({ uri: link.uri, name, title: name, mimeType }, true)
}, [name, mimeType, text])

test('a document and a collection leave the same way, in the same order, the button just before Close, and ⌘P prints what the pane shows', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await withSheet(page)
  await start(page)
  await connectFakeBrain(page)
  await withLinks(page)
  await found(page, 'documents', 'tables')
  await made(page, 'document', { name: 'Plan', markdown: '# Plan\n\nNorth bed: beans.' })
  const document = page.locator('app-preview:has(.document)')
  await expect(document.locator('#doc')).toContainText('North bed: beans.')
  const close = document.locator('.pane-head > button').last()
  await expect(close).toHaveAttribute('aria-label', 'Close')
  await expect(document.locator('.pane-head > button').nth(-2)).toHaveAttribute('aria-label', 'Share, download or print')
  await document.locator(BUTTON).click()
  const menu = document.locator('.out-menu')
  await expect(menu.locator('b')).toHaveText(['Share…', 'Send to an app…', 'Copy', 'Word', 'Markdown', 'Print or save as PDF', 'Design system'])
  await expect(menu.getByRole('group', { name: 'Download' }).locator('b')).toHaveText(['Word', 'Markdown'])
  // What a menu's row says: its name and what comes of it, a design system's page alone needing no words.
  await expect(menu.locator('button:has(small)')).toHaveCount(6)
  const bounds = await menu.boundingBox()
  expect((bounds?.x ?? -1) >= 0 && (bounds?.y ?? 0) + (bounds?.height ?? 0) <= (page.viewportSize()?.height ?? 0)).toBe(true)
  // Escape closes the menu alone.
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(document.locator('#doc')).toBeVisible()
  await document.locator(BUTTON).click()
  await menu.getByRole('button', { name: /^Copy/ }).click()
  await expect(page.locator('.toast')).toContainText('Copied')
  expect(await copied(page)).toEqual({ kinds: ['text/html', 'text/plain'], rich: expect.stringContaining('North bed: beans.') })
  await document.locator(BUTTON).click()
  // Its text to the system's sheet, as it is when pressed.
  await menu.getByRole('button', { name: /^Send to an app/ }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).shared)).toEqual({ title: 'Plan', text: expect.stringContaining('North bed: beans.') })
  // Share opens on what it shows, as an answer's does.
  await document.locator(BUTTON).click()
  await menu.getByRole('button', { name: /^Share/ }).click()
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  // ⌘P in the pane prints it, not the task beside it.
  await document.locator('#doc').click()
  await page.keyboard.press('ControlOrMeta+p')
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed)).toContain('is-printing-paper')
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))

  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js'), at = '2026-10-21T09:00:00.000Z', folder = 'collections/01K85Z1T00000000000000000P-costs'
    await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000P', name: 'Costs', author: 'user', created: at, changed: at,
      properties: [{ id: 'item', name: 'Item', type: 'text' }, { id: 'amount', name: 'Amount', type: 'number' }], views: [{ id: 'all', name: 'All', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, `${JSON.stringify({ row: '01K80000000000000000000001', set: { item: 'Seeds', amount: 12 }, at, by: 'user' })}\n`)
    ;(await import('/ui/preview.js')).preview({ uri: folder, name: 'Costs.xlsx', title: 'Costs' })
  })
  const table = page.locator('app-preview:has(app-table)')
  await table.locator(BUTTON).click()
  const rows = table.locator('.out-menu')
  await expect(rows.locator('b')).toHaveText(['Share…', 'Send to an app…', 'Copy', 'Excel', 'CSV', 'Print or save as PDF', 'Design system'])
  // Its rows as plain text, as every spreadsheet reads them.
  const [csv] = await Promise.all([page.waitForEvent('download'), rows.getByRole('button', { name: /^CSV/ }).click()])
  expect(csv.suggestedFilename()).toBe('Costs.csv')
  const chunks = []
  for await (const chunk of await csv.createReadStream()) chunks.push(chunk)
  expect(Buffer.concat(chunks).toString()).toContain('Seeds,12')
  // A link holds its rows, under its name; Copy puts them on the clipboard.
  await table.locator(BUTTON).click()
  await rows.getByRole('button', { name: /^Share/ }).click()
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  expect(await held(page)).toEqual({ text: expect.stringMatching(/### Costs[^]*\| Seeds \|/) })
  await page.keyboard.press('Escape')
  await table.locator(BUTTON).click()
  await rows.getByRole('button', { name: /^Copy/ }).click()
  await expect(page.locator('.toast').last()).toContainText('Copied')
  expect((await copied(page)).rich).toMatch(/<table[^]*Seeds/)
  // Its file to the sheet, its rows on paper, as it does for any kind.
  await table.locator(BUTTON).click()
  await rows.getByRole('button', { name: /^Send to an app/ }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).shared.files)).toEqual(['Costs.csv'])
  await table.locator(BUTTON).click()
  await rows.getByRole('button', { name: /^Print or save as PDF/ }).click()
  await expect.poll(() => page.locator('.paper-print h3').textContent()).toBe('Costs')
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.paper-print')).toHaveCount(0)
})

/** What Copy left on the clipboard: its kinds, and its rich text if it has any. @param {import('@playwright/test').Page} page */
const copied = (page) => page.evaluate(async () => { const [item] = await navigator.clipboard.read(); return { kinds: [...item.types].sort(), rich: item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '' } })
/** What the Share dialog is on. @param {import('@playwright/test').Page} page */
const held = (page) => page.evaluate(async () => (await import('/caps/share/share.js')).sharing.value?.item)
/** A way taken, its menu opened first. @param {import('@playwright/test').Locator} pane @param {RegExp} name */
const pick = async (pane, name) => { await pane.locator(BUTTON).click(); await pane.locator('.out-menu').getByRole('button', { name }).click() }
/** What a print holds, seen as the printer sees it, then the print over. @param {import('@playwright/test').Page} page @param {(sheet: import('@playwright/test').Locator) => Promise<void>} check */
async function onPaper(page, check) {
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed)).toBeTruthy()
  await page.emulateMedia({ media: 'print' })
  await check(page.locator('.paper-print'))
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => { dispatchEvent(new Event('afterprint')); /** @type {any} */ (window).printed = null })
}

test('a game: a link and the sheet give its page, its file downloads, and paper has its picture and its words', async ({ page }) => {
  await withSheet(page)
  await start(page)
  await withLinks(page)
  const place = 'games/01K85Z1T00000000000000000G-star.game.html'
  await page.evaluate(async (place) => {
    const [{ app }, { fileOf }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/caps/games/file.js'), import('/ui/caps.js')]), at = '2026-10-21T09:00:00.000Z'
    await unlock('games')
    await app.fs.write(`${app.projectDir}/${place}`, fileOf({ name: 'Star', card: 'Catch the stars.', code: 'host.state("title")', meta: { engine: 'none', actions: 'a', author: 'user', created: at, changed: at } }, 'en'))
    ;(await import('/ui/preview.js')).preview({ uri: place, name: 'Star.game.html', title: 'Star', mimeType: 'text/html' }, true)
  }, place)
  const pane = page.locator('app-preview:has(app-game)')
  await pane.locator(BUTTON).click()
  await expect(pane.locator('.out-menu b')).toHaveText(['Share…', 'Send to an app…', 'Game file', 'Print or save as PDF'])
  await page.keyboard.press('Escape')
  await pick(pane, /^Print or save as PDF/)
  await onPaper(page, async (sheet) => { await expect(sheet.locator('h1')).toHaveText('Star'); await expect(sheet.locator('p')).toHaveText('Catch the stars.') })
  await pick(pane, /^Send to an app/)
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).shared?.files)).toEqual(['Star.html'])
  await pick(pane, /^Share/)
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  expect(await held(page)).toEqual({ text: 'Catch the stars.', files: [{ uri: place, name: 'Star.game.html', mimeType: 'text/html' }] })
})

test('an app: a link holds its block, its page downloads, and paper has it as it shows', async ({ page }) => {
  await withSheet(page)
  await start(page)
  await connectFakeBrain(page)
  await withLinks(page)
  await page.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/ui/caps.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Tips' }), userRecord('Make a tip calculator', app.deviceId), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '```html\n<!doctype html><title>Tips</title><h1>Tips</h1><p>15%</p>\n```' } })])
    await refreshConversations()
    await unlock('interactive')
    const { apps } = await import('/caps/interactive/apps.js'), [one] = await apps.kept()
    await apps.open(one)
  })
  const pane = page.locator('app-preview')
  await expect(pane.locator('iframe')).toBeVisible()
  await pane.locator(BUTTON).click()
  const menu = pane.locator('.out-menu')
  await expect(menu.locator('b')).toHaveText(['Share…', 'Send to an app…', 'Web page', 'Print or save as PDF'])
  const [file] = await Promise.all([page.waitForEvent('download'), menu.getByRole('button', { name: /^Web page/ }).click()])
  expect(file.suggestedFilename()).toBe('Tips.html')
  await pick(pane, /^Print or save as PDF/)
  await onPaper(page, async (sheet) => { await expect(sheet.locator('iframe')).toBeVisible() })
  await pick(pane, /^Share/)
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  expect(await held(page)).toEqual({ text: expect.stringMatching(/^```html\n<!doctype html>[^]*\n```$/) })
})

test('a design: what to look at first comes before all, and a link holds its picture, kept among the project’s files', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await withSheet(page)
  await start(page)
  await connectFakeBrain(page)
  await withLinks(page)
  await ask(page, 'Make an invitation for Léa’s 7th birthday: Thursday 14 November at 3 pm, 12 rue des Lilas in Lyon')
  await page.locator('.msg-jean .approval').getByRole('button', { name: 'Turn it on' }).click()
  await answered(page)
  const pane = page.locator('app-preview:has(.design)')
  await pane.locator(BUTTON).click()
  await expect(pane.locator('.out-menu b')).toHaveText([/things? to look at first/, 'Share…', 'Send to an app…', 'Copy', 'Picture', 'Picture as a post', 'Picture as a story', 'Design file', 'Print or save as PDF'])
  await pane.locator('.out-menu').getByRole('button', { name: /^Copy/ }).click()
  await expect(page.locator('.toast').last()).toContainText('Copied')
  expect((await copied(page)).kinds).toEqual(['image/png', 'text/plain'])
  await pick(pane, /^Share/)
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  expect(await held(page)).toEqual({ picture: expect.objectContaining({ uri: expect.stringMatching(/^files\/sha256-[\da-f]+\.png$/), name: "Léa's invitation.png", mimeType: 'image/png' }), description: expect.stringContaining('Léa is 7!') })
})

test('a deck: the slide on show copied, its file to the sheet, and a link that holds it as it is', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await withSheet(page)
  await start(page)
  await connectFakeBrain(page)
  await withLinks(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  await knows.locator('.ready-made .service', { hasText: 'Slides' }).first().click()
  await knows.getByRole('button', { name: 'Add this skill' }).click()
  await page.keyboard.press('Escape')
  await ask(page, 'Make slides about the new oven')
  await answered(page)
  const pane = page.locator('app-preview:has(app-slides)')
  await expect(pane.locator('.deck-slide.is-shown')).toBeVisible()
  await pane.locator(BUTTON).click()
  await expect(pane.locator('.out-menu b')).toHaveText(['Share…', 'Send to an app…', 'Copy', 'PowerPoint', 'Slides file', 'Print or save as PDF', 'Design system'])
  await pane.locator('.out-menu').getByRole('button', { name: /^Copy/ }).click()
  await expect(page.locator('.toast').last()).toContainText('Copied')
  expect((await copied(page)).kinds).toEqual(['image/png', 'text/plain'])
  await pick(pane, /^Send to an app/)
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).shared?.files)).toEqual(['A second oven.deck.html'])
  await pick(pane, /^Share/)
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  expect(await held(page)).toEqual({ text: expect.stringMatching(/^````deck\n[^]*A second oven[^]*\n````$/) })
})

test('a picture prints alone, a film doesn’t print, and a file with only its Download has the button itself, which says so', async ({ page }) => {
  await start(page)
  await page.evaluate(() => { window.print = () => { /** @type {any} */ (window).printed = true }; Object.assign(navigator, { canShare: undefined }) })
  // One way alone: no menu of one.
  await opened(page, 'Notes.txt', 'text/plain', 'Some words')
  const pane = page.locator('app-preview')
  const [file] = await Promise.all([page.waitForEvent('download'), pane.getByRole('button', { name: 'Download Notes.txt' }).click()])
  expect(file.suggestedFilename()).toBe('Notes.txt')
  await expect(pane.locator('.out-menu')).toHaveCount(0)
  await page.evaluate(async () => (await import('/ui/preview.js')).unshow(document.querySelector('app-preview')?.uri))
  // A picture: on paper too, so a menu, whose tip says what it holds.
  await opened(page, 'Dot.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>')
  await expect(pane.locator(BUTTON)).toHaveAttribute('aria-label', 'Download or print')
  await pane.locator(BUTTON).click()
  await expect(pane.locator('.out-menu b')).toHaveText(['Dot.svg', 'Print or save as PDF'])
  await pane.locator('.out-menu').getByRole('button', { name: /^Print or save as PDF/ }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed)).toBe(true)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.paper-print app-shared img')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => dispatchEvent(new Event('afterprint')))
  await page.evaluate(async () => (await import('/ui/preview.js')).unshow(document.querySelector('app-preview')?.uri))
  // Found, Share joins it, and a film has no paper to go on.
  await withLinks(page)
  await opened(page, 'Walk.mp4', 'video/mp4', 'not really a film')
  await expect(pane.locator(BUTTON)).toHaveAttribute('aria-label', 'Share or download')
  await pane.locator(BUTTON).click()
  await expect(pane.locator('.out-menu b')).toHaveText(['Share…', 'Walk.mp4'])
})

for (const [lang, tip, words] of [['ar', 'مشاركة أو تنزيل أو طباعة', ['إرسال إلى تطبيق…', 'نسخ', 'Word', 'Markdown']], ['ja', '共有、ダウンロード、印刷', ['ほかのアプリに送る…', 'コピー', 'Word', 'Markdown']]]) {
  test(`in ${lang}, its menu opens under its button, inside the window, in the language's direction`, async ({ page }) => {
    await withSheet(page)
    await start(page, String(lang))
    await connectFakeBrain(page)
    await found(page, 'documents')
    await made(page, 'document', { name: 'Plan', markdown: '# Plan\n\nNorth bed.' })
    const pane = page.locator('app-preview:has(.document)'), button = pane.locator(BUTTON)
    await expect(button).toHaveAttribute('aria-label', String(tip))
    await button.click()
    const menu = pane.locator('.out-menu'), { x, width, height, y } = /** @type {NonNullable<Awaited<ReturnType<typeof menu.boundingBox>>>} */ (await menu.boundingBox())
    await expect(menu.locator('b').first()).toHaveText(words[0])
    for (const word of words) await expect(menu.locator('b', { hasText: word })).toBeVisible()
    const window = /** @type {{ width: number, height: number }} */ (page.viewportSize())
    expect(x >= 0 && x + width <= window.width && y >= 0 && y + height <= window.height).toBe(true)
    // Under its button, from the side the button is on.
    const from = /** @type {NonNullable<Awaited<ReturnType<typeof button.boundingBox>>>} */ (await button.boundingBox())
    expect(y).toBeGreaterThanOrEqual(from.y + from.height - 1)
    expect(lang === 'ar' ? Math.abs(x - from.x) : Math.abs(x + width - from.x - from.width)).toBeLessThan(24)
    expect(await menu.evaluate((one) => getComputedStyle(one).direction)).toBe(lang === 'ar' ? 'rtl' : 'ltr')
  })
}

test('asked for in an answer and opened beside it, a picture’s link holds the picture alone', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await answered(page)
  await withLinks(page)
  await opened(page, 'Dot.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>')
  const pane = page.locator('app-preview')
  await pane.locator(BUTTON).click()
  await pane.locator('.out-menu').getByRole('button', { name: /^Share/ }).click()
  await expect(page.locator('app-share-dialog dialog')).toBeVisible()
  const item = await page.evaluate(async () => (await import('/caps/share/share.js')).sharing.value?.item)
  expect(item).toEqual({ picture: expect.objectContaining({ name: 'Dot.svg', mimeType: 'image/svg+xml' }), description: 'Dot.svg' })
})
