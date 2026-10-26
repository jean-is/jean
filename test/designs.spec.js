// Designs (D572), in Chromium and WebKit: offered, then Léa's invitation laid out from its facts three ways beside the conversation;
// its wrong weekday marked and fixed in place; its words changed as fields; a part moved with the keys and the move undone; More
// takes; the part the user points at changed by the brain, accepted (D505); and saved as its file, which holds the design and its
// faces, and as a picture, which carries the design too; printed two to a sheet; a shape, an ornament and a QR code added behind the
// words, arranged and duplicated; offered for an invitation written as a web page. In Arabic its words run right to left in Jean's own
// face; in Japanese the weekday in brackets is marked.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered } from './helpers.js'

/** The design on show, as the pane holds it. @param {import('@playwright/test').Page} page */
const shown = (page) => page.evaluate(async () => (await import('/caps/designs/designs.js')).shown.value?.design)

test('a design: offered, laid out three ways, its weekday fixed, finished by hand, a change of Jean’s accepted, and saved as a file and a picture', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make an invitation for Léa’s 7th birthday: Thursday 14 November at 3 pm, 12 rue des Lilas in Lyon')
  // Designs isn't found yet: the brain offers it, and the answer waits for the user.
  const offer = page.locator('.msg-jean .approval')
  await expect(offer).toContainText('Lay this out as a design you can change by hand, print and send?')
  await offer.getByRole('button', { name: 'Turn it on' }).click()
  await answered(page)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Here are three takes')
  // Its card under the answer names it as Creations does.
  await expect(page.locator('.msg-jean app-file .file-meta')).toContainText('Design')

  // Beside the conversation: a row of takes to pick, the first picked, the page drawn from the facts.
  await expect(page.locator('app-preview .pane-head h2')).toHaveText("Léa's invitation")
  const takes = page.getByRole('radiogroup', { name: 'Takes' })
  await expect.poll(() => takes.getByRole('radio').count()).toBeGreaterThan(3)
  await expect(takes.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true')
  const stage = page.locator('.design-stage .design-page')
  await expect(stage.locator('[data-part="title"] p')).toHaveText('Léa is 7!')

  // One mark on the date, whose weekday isn't its date's, and on the picture still to put in; its fix, in place.
  await page.getByRole('button', { name: 'Look at When' }).click()
  const fix = page.getByRole('dialog', { name: 'When' })
  await expect(fix).toContainText('The weekday doesn’t match the date.')
  await fix.getByRole('button', { name: 'Use “Saturday 14 November · 3 pm”' }).click()
  await expect(stage.locator('[data-part="when"] p')).toHaveText('Saturday 14 November · 3 pm')
  await expect(page.getByRole('button', { name: 'Look at When' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Look at Picture' })).toBeVisible()

  // The parts as fields: the title changed there, on the page at once.
  await page.locator('.design-bar').getByRole('button', { name: /^Parts/ }).click()
  await page.locator('.design-fields').getByLabel('Title').fill('Léa turns 7!')
  await expect(stage.locator('[data-part="title"] p')).toHaveText('Léa turns 7!')

  // A part moved with the keys, said to a screen reader, and the move undone.
  const before = (await shown(page))?.parts.find((part) => part.id === 'where')?.box
  await page.locator('[data-hit="where"]').focus()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.locator('.design [aria-live]')).toHaveText('Where moved')
  await expect.poll(async () => (await shown(page))?.parts.find((part) => part.id === 'where')?.box[1]).toBeCloseTo((before?.[1] ?? 0) + 50, 0)
  await page.locator('.design-bar').getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await shown(page))?.parts.find((part) => part.id === 'where')?.box).toEqual(before)

  // Let go with a click beside the page, the part gives the takes row back; scrolled to its end, it deals more, with no brain,
  // and one picked there keeps its deal, the words kept.
  await page.locator('.design-stage').click({ position: { x: 4, y: 4 } })
  await expect(page.locator('.design-part-bar')).toHaveCount(0)
  const dealt = await takes.getByRole('radio').count()
  await takes.evaluate((row) => row.scrollBy({ left: row.scrollWidth * (getComputedStyle(row).direction === 'rtl' ? -1 : 1) }))
  await expect.poll(() => takes.getByRole('radio').count()).toBeGreaterThan(dealt)
  await takes.getByRole('radio').nth(dealt).click()
  await expect.poll(async () => (await shown(page))?.deal).toBe(Math.floor(dealt / 3))
  await expect(takes.getByRole('radio').nth(dealt)).toHaveAttribute('aria-checked', 'true')
  await expect(stage.locator('[data-part="title"] p')).toHaveText('Léa turns 7!')

  // Pointed at, the title is changed by the brain: Jean's version shows, to accept. Picked, the page stays where it was, under
  // the pointer, its bar in the takes row's place.
  const top = (await stage.boundingBox())?.y
  await page.locator('[data-hit="title"]').click()
  await expect(page.locator('.design-part-bar')).toBeVisible()
  expect((await stage.boundingBox())?.y).toBe(top)
  await expect(takes).toBeHidden()
  await page.locator('.design-part-bar').getByRole('button', { name: 'Ask Jean' }).click()
  await expect(page.locator('#prompt')).toBeFocused()
  await page.locator('#prompt').fill('Make it say Léa turns seven!')
  await page.locator('#prompt').press('Enter')
  await answered(page, 2)
  const review = page.getByRole('region', { name: 'Suggested changes' })
  await expect(review).toContainText('1 change to review')
  await expect(stage.locator('[data-part="title"] p')).toHaveText('Léa turns seven!')
  await review.getByRole('button', { name: 'Accept all' }).click()
  await expect(review).toHaveCount(0)
  await expect.poll(async () => (await shown(page))?.parts.find((part) => part.id === 'title')?.text).toBe('Léa turns seven!')

  // Saved as its file: the drawing, the design inside it, and the faces its words use. The page has scrolled by now, and WebKit
  // places a menu anchored to a button as if it hadn't: back to the top.
  await page.evaluate(() => scrollTo(0, 0))
  const save = page.locator('app-preview .pane-head').getByRole('button', { name: 'Save' })
  await save.click()
  await expect(page.locator('#design-save')).toContainText(/things? to look at first/)
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#design-save').getByRole('button', { name: /^Design file/ }).click()])
  expect(file.suggestedFilename().normalize()).toBe("Léa's invitation.svg")
  const svg = await (await import('node:fs/promises')).readFile(/** @type {string} */ (await file.path()), 'utf8')
  expect(svg).toContain('<design xmlns="urn:design-file:1">')
  expect(svg).toMatch(/@font-face\{font-family:"\w+";src:url\(data:font\/woff2;base64,/)
  // Its words in the lines the view laid them out in.
  expect(svg).toMatch(/<text [^>]*>[^<]*seven!<\/text>/)
  // And as a picture, which carries the design, so a picture sent back opens editable.
  await save.click()
  const [picture] = await Promise.all([page.waitForEvent('download'), page.locator('#design-save').getByRole('button', { name: /^Picture PNG/ }).click()])
  expect(picture.suggestedFilename().normalize()).toBe("Léa's invitation.png")
  const png = await (await import('node:fs/promises')).readFile(/** @type {string} */ (await picture.path()))
  expect(png.includes(Buffer.from('iTXtdesign\0'))).toBe(true)
})

// Add (D586): a shape, an ornament and a QR code go behind the words, never over them; Arrange puts one in front or at the back, ⌘D
// duplicates it; a picture's frame goes round; and the file draws them all, as drawings of their own where they are.
test('Add puts a shape, an ornament and a QR code behind the words, Arrange brings one in front or duplicates it, a picture goes round, and the file draws them', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('designs')))
  await ask(page, 'Make an invitation for Léa’s 7th birthday')
  await answered(page)
  const ids = async () => (await shown(page))?.parts.map((part) => part.id) ?? []
  const stage = page.locator('.design-stage .design-page'), add = page.locator('#design-add'), arrange = page.locator('#design-arrange')
  const adding = async (/** @type {string} */ name) => { await page.locator('.design-bar').getByRole('button', { name: 'Add' }).click(); await add.getByRole('button', { name, exact: true }).click() }
  await adding('Circle')
  await expect(page.locator('.design [aria-live]')).toHaveText('Circle added')
  await expect.poll(ids).toContain('circle-1')
  expect((await ids()).indexOf('circle-1')).toBeLessThan((await ids()).indexOf('title'))
  // To the front, over the words; to the back, behind everything but the layout's own shapes.
  await page.locator('.design-part-bar').getByRole('button', { name: 'Arrange' }).click()
  await arrange.getByRole('menuitem', { name: 'To the front' }).click()
  await expect.poll(async () => (await ids()).at(-1)).toBe('circle-1')
  await page.locator('.design-part-bar').getByRole('button', { name: 'Arrange' }).click()
  await arrange.getByRole('menuitem', { name: 'To the back' }).click()
  await expect.poll(async () => (await ids()).find((id) => !id.startsWith('shape-'))).toBe('circle-1')

  // A right click on a part opens its menu at the pointer: what its bar does, Higher and Lower too; Bigger grows it, and Colour
  // opens the bar's own menu from there.
  const context = page.locator('#design-context'), title = page.locator('[data-hit="title"]'), width = async () => (await shown(page))?.parts.find((part) => part.id === 'title')?.box[2]
  await title.click({ button: 'right' })
  await expect(context).toBeVisible()
  expect(await context.getByRole('menuitem').allTextContents()).toEqual(['Ask Jean', 'Bigger', 'Smaller', 'Higher', 'Lower', 'Colour', 'Align', 'Duplicate', 'To the front', 'To the back', 'Delete'])
  const before = await width()
  await context.getByRole('menuitem', { name: 'Bigger' }).click()
  await expect(context).toBeHidden()
  await expect.poll(width).toBeGreaterThan(/** @type {number} */ (before))
  await title.click({ button: 'right' })
  await context.getByRole('menuitem', { name: 'Colour' }).click()
  await page.locator('#design-colour-title').getByRole('menuitemradio', { name: 'Accent', exact: true }).click()
  await expect.poll(async () => (await shown(page))?.parts.find((part) => part.id === 'title')?.color).toBe('accent')
  await expect(context).toBeHidden()

  // An ornament, drawn from its paths in the design's colours, then duplicated with ⌘D, a copy over it.
  await adding('Balloons')
  await expect(stage.locator('[data-part="balloons-1"] path')).toHaveCount(4)
  await page.locator('[data-hit="balloons-1"]').focus()
  await page.keyboard.press('ControlOrMeta+d')
  await expect.poll(ids).toContain('balloons-2')
  expect((await ids()).indexOf('balloons-2')).toBe((await ids()).indexOf('balloons-1') + 1)

  // A QR code asks at once what it opens, then draws it.
  await adding('QR code')
  await page.getByRole('dialog', { name: 'QR code' }).getByLabel('What the QR code opens').fill('https://example.com/lea')
  await page.keyboard.press('Enter')
  await expect(stage.locator('[data-part="qr-1"] path')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Look at QR code' })).toHaveCount(0)

  // The picture's frame, round.
  await page.locator('[data-hit="picture"]').click()
  await page.locator('.design-part-bar').getByRole('button', { name: 'Shape' }).click()
  await page.locator('#design-form').getByRole('menuitemradio', { name: 'Circle' }).click()
  await expect(stage.locator('[data-part="picture"]')).toHaveClass(/is-circle/)

  // The file: the circle an ellipse, the two ornaments and the QR code drawings of their own.
  const file = () => page.evaluate(async () => {
    const [{ shown: one }, { app }] = await Promise.all([import('/caps/designs/designs.js'), import('/ui/state.js')])
    return one.value ? app.fs.read(`${one.value.dir}/${one.value.path}`) : ''
  })
  await expect.poll(async () => (await file())?.match(/<svg x=/g)?.length).toBe(3)
  expect(await file()).toContain('<ellipse')
})

// An invitation the brain wrote as a web page, as one did in Japanese 7 times in 11 (D587): Designs is offered above the box, and a
// yes asks for the same thing as a design.
test('in a project with a colour, a design\'s first take wears the project\'s colours, which its Colours menu names; the others Designs\' own (D601)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const green = await page.evaluate(async () => {
    const [{ app }, { hexOf }, { readable }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/kit.js'), import('/ui/colour.js'), import('/ui/caps.js')])
    app.project.value = { ...app.project.value, data: { ...app.project.value.data, colour: 'oklch(0.74 0.17 150)' } }
    await unlock('designs')
    return readable(hexOf('oklch(0.74 0.17 150)'), '#ffffff')
  })
  await ask(page, 'Make an invitation for Léa’s 7th birthday')
  await answered(page)
  await expect.poll(async () => (await shown(page))?.take[1]).toBe('project')
  expect((await shown(page))?.colours.accent).toBe(green)
  expect(await page.evaluate(async () => { const [{ takesOf }, { book, shown }] = await Promise.all([import('/caps/designs/layout.js'), import('/caps/designs/designs.js')])
    return takesOf(book, /** @type {any} */ (shown.value).design, 0).slice(1).map((take) => take[1]) })).not.toContain('project')
  await page.locator('.design-bar').getByRole('button', { name: /Colours/ }).click()
  await expect(page.locator('#design-colours').getByRole('menuitemradio').first()).toHaveText("The project's colours")
  await expect(page.locator('#design-colours').getByRole('menuitemradio').first()).toHaveAttribute('aria-checked', 'true')
})

test('an invitation written as a web page offers Designs, and a yes lays it out as one', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Write the invitation for Léa’s 7th birthday as a web page')
  await answered(page)
  const offer = page.locator('.offer', { hasText: 'Lay this out as a design you can change by hand, print and send?' })
  await offer.getByRole('button', { name: 'Make designs' }).click()
  await answered(page, 2)
  await expect(page.locator('app-preview .pane-head h2')).toHaveText("Léa's invitation")
  await expect(page.getByText('Lay that out as a design.')).toBeVisible()
})

// On a phone the pane covers the conversation, whose box is out of reach under it: Ask Jean makes way for the box, and the next
// message still says the part pointed at. The part's sheet takes the design bar's place, Ask Jean first.
test('on a phone, a part’s sheet leads with Ask Jean, which makes way for the box, the part it points at said with the next message', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('designs')))
  await ask(page, 'Make an invitation for Léa’s 7th birthday')
  await answered(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-hit="where"]').click()
  const sheet = page.locator('.design-part-bar')
  await expect(page.locator('.design-bar')).toBeHidden()
  await expect(page.getByRole('radiogroup', { name: 'Takes' })).toBeVisible()
  await expect(sheet.getByRole('button').first()).toHaveAccessibleName(/^Ask Jean/)
  await expect(sheet.getByRole('button').first()).toHaveAccessibleDescription('Hold to talk, or tap to type')
  // One row, none of it out of sight.
  expect(await sheet.evaluate((bar) => [bar.scrollWidth <= bar.clientWidth, bar.clientHeight < 2 * Math.max(...[...bar.children].map((one) => one.getBoundingClientRect().height))])).toEqual([true, true])
  await sheet.getByRole('button', { name: /^Ask Jean/ }).click()
  await expect(page.locator('.design-stage')).toHaveCount(0)
  await expect(page.locator('#prompt')).toBeFocused()
  await expect(page.locator('.toast')).toContainText('Where pointed at')
  await page.locator('#prompt').fill('Make it say 12 rue des Roses, Lyon')
  await page.locator('#prompt').press('Enter')
  await answered(page, 2)
  await expect(page.getByRole('region', { name: 'Suggested changes' })).toContainText('1 change to review')
  await expect(page.locator('.design-stage [data-part="where"] p')).toHaveText('12 rue des Roses, Lyon')
})

// Ask Jean held, on a phone: the pane makes way, the box listens until the finger lets go, wherever it is by then, and the words
// it heard wait there to send, the part pointed at said with them. The browser's recogniser is a fake that hears a sentence.
test('Ask Jean held listens until let go, its words in the box to send, the part pointed at changed', async ({ page }) => {
  await page.addInitScript(() => {
    class Recognition {
      static available = async () => 'available'
      static install = async () => false
      start() { setTimeout(() => /** @type {any} */ (this).onresult?.({ results: [[{ transcript: 'Make it say 12 rue des Roses, Lyon' }]] }), 50) }
      stop() { setTimeout(() => /** @type {any} */ (this).onend?.(), 10) }
    }
    Object.assign(window, { SpeechRecognition: Recognition, webkitSpeechRecognition: Recognition })
  })
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('designs')))
  await ask(page, 'Make an invitation for Léa’s 7th birthday')
  await answered(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-hit="where"]').click()
  await page.locator('.design-part-bar').getByRole('button', { name: /^Ask Jean/ }).hover()
  await page.mouse.down()
  const mic = page.locator('.composer-tools button[aria-keyshortcuts][aria-pressed]')
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#prompt')).toHaveValue('Make it say 12 rue des Roses, Lyon')
  await page.mouse.up()
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  await page.locator('#prompt').press('Enter')
  await answered(page, 2)
  await expect(page.locator('.design-stage [data-part="where"] p')).toHaveText('12 rue des Roses, Lyon')
})

// Printing, in Chromium, whose headless print makes a PDF: two A5s on one sheet of the region's paper turned sideways, Letter for English.
test('an A5 design prints two to a sheet of the region’s paper, turned sideways', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium prints to PDF headless')
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('designs')))
  await ask(page, 'Make an invitation for Léa’s 7th birthday')
  await answered(page)
  await page.evaluate(() => { window.print = () => {} })
  await page.locator('app-preview .pane-head').getByRole('button', { name: 'Save' }).click()
  await page.locator('#design-save').getByRole('button', { name: /^Print or save as PDF/ }).click()
  await expect(page.locator('.design-print .design-page')).toHaveCount(2)
  await page.emulateMedia({ media: 'print' })
  const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1')
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1)
  // Letter sideways, in points, as English's region, the United States, has it.
  expect(/\/MediaBox\s*\[([^\]]*)\]/.exec(pdf)?.[1].trim().split(/\s+/).map((n) => Math.round(Number(n)))).toEqual([0, 0, 792, 612])
})

for (const [lang, request, fixed] of /** @type {const} */ ([['ar', 'اصنع دعوة لعيد ميلاد ليا', 'السبت ١٤ نوفمبر · الساعة ٣ عصرًا'], ['ja', 'レアの誕生日の招待状をつくって', '11月14日（土）午後3時から']])) {
  test(`in ${lang}, a design’s words run as the language does, in its faces, and its wrong weekday is marked and fixed`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await page.evaluate(() => import('/ui/caps.js').then(({ unlock }) => unlock('designs')))
    await ask(page, request)
    await answered(page)
    const stage = page.locator('.design-stage .design-page')
    await expect(stage.locator('[data-part="title"] p')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    // Arabic in Jean's own face for its voice; Japanese in the device's.
    if (lang === 'ar') await expect.poll(() => page.evaluate(() => document.fonts.check('600 16px Friendly', 'ليا'))).toBe(true)
    await page.locator('.design-stage button.design-dot').first().click()
    await page.locator('.design-pop').getByRole('button').first().click()
    await expect(stage.locator('[data-part="when"] p')).toHaveText(fixed)
    // Undone back to Jean's layout, Undo keeps the keyboard, so ⇧⌘Z still reaches the design and redoes.
    const undo = page.locator('.design-bar > .icon-button').last()
    await undo.focus()
    await page.keyboard.press('Enter')
    await expect(stage.locator('[data-part="when"] p')).not.toHaveText(fixed)
    await expect(undo).toHaveAttribute('aria-disabled', 'true')
    await expect(undo).toBeFocused()
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(stage.locator('[data-part="when"] p')).toHaveText(fixed)
  })
}
