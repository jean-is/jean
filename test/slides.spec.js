// Slides (D591): with Jean's own Slides skill, a deck an answer writes is drawn by deck slide by slide as it comes, kept as a
// file of the project's once the answer ends and opened beside the conversation, where it is paged and presented, changed
// three ways (typing on a slide, as its Markdown, or by asking Jean, whose version is accepted or rejected slide by slide,
// D505), laid out again from its kit's Slide layout menu, and saved as PowerPoint, as a PDF, as its file and as a link; a chart is
// Charts' own and a diagram Pele's (D592). In Arabic and Japanese too. Its decks are among the creations (D558).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, answered, turnOn, openSettings, closeSettings, openTasks } from './helpers.js'
import { writeZip } from '../app/core/zip.js'

/** Jean's own Slides skill, added as the user adds it, by its name in the user's language. @param {import('@playwright/test').Page} page @param {string} [name] @param {string} [add] */
async function addSlides(page, name = 'Slides', add = 'Add this skill') {
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  await knows.locator('.ready-made .service', { hasText: name }).first().click()
  await expect(knows.locator('.skill-steps')).toContainText('Slidev')
  await knows.getByRole('button', { name: add }).click()
  await expect(page.locator('.toast')).toBeVisible()
  await page.keyboard.press('Escape')
}

/** The project's decks, as their files hold them. @param {import('@playwright/test').Page} page */
const files = (page) => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  const names = (await app.fs.list(`${app.projectDir}/decks`)).filter((entry) => entry.kind === 'file').map((entry) => entry.name)
  return Promise.all(names.map(async (name) => ({ name, page: String(await app.fs.read(`${app.projectDir}/decks/${name}`)), theirs: await app.fs.read(`${app.projectDir}/decks/.suggested/${name.replace(/\.deck\.html$/, '.md')}`) })))
})

test('a deck asked for is drawn as it comes, kept as a file, opened beside, paged, changed three ways and saved as PowerPoint, PDF and its file', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await addSlides(page)
  await ask(page, 'Make slides about the new oven')
  await answered(page)
  // In the answer: the deck, a slide at a time, paged with its bar.
  const inline = page.locator('.msg-jean app-slides').last(), shown = inline.locator('.deck-slide.is-shown')
  await expect(shown).toHaveAttribute('aria-label', 'Slide 1 of 4')
  await expect(shown.getByRole('heading')).toHaveText('A second oven')
  // Kept as a file of the project's, Jean's few facts in its head, and open beside the conversation.
  await expect.poll(async () => (await files(page)).length).toBe(1)
  const [kept] = await files(page)
  expect(kept.name).toMatch(/^[0-9A-Z]{26}-a-second-oven\.deck\.html$/)
  expect(kept.page).toContain('<script type="text/markdown" id="deck">')
  expect(kept.page).toContain('<meta name="author" content="jean">')
  expect(kept.page).toMatch(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@codename\/deck@\d+\.\d+\.\d+\/dist\/deck\.js"><\/script>/)
  expect(kept.page, 'the kit it was drawn with').toMatch(/^kit: \{"name":"Jean","tokens":\{"paper":"#ffffff"/m)
  const beside = page.locator('app-preview app-slides.beside'), slide = beside.locator('.deck-slide.is-shown')
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('A second oven')
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 4')
  await expect(slide, 'Tilde never puts words on sunflower: the cover is on ink').toHaveAttribute('data-paper', 'ink')
  // Paged: two columns, a chart of Charts' own in SVG; a diagram Pele drew, a picture; a big number, its note for the speaker unseen.
  await beside.getByRole('button', { name: 'Next slide' }).click()
  await expect(slide).toHaveAttribute('data-layout', 'two-cols')
  await expect(slide.locator('[data-slot="right"] app-chart .chart svg')).toBeVisible()
  await beside.locator('.deck-stage').press('ArrowRight')
  await expect(slide.locator('.deck-diagram img')).toHaveAttribute('src', /^data:image\/svg\+xml/)
  await expect.poll(() => slide.locator('.deck-diagram img').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0)
  await beside.locator('.deck-stage').press('ArrowRight')
  await expect(slide).toHaveAttribute('data-layout', 'fact')
  await expect(slide).not.toContainText('18,000')

  // Changed by typing on a slide: its words, double-clicked, then Enter, go back into its Markdown and its file.
  await beside.locator('.deck-stage').press('Home')
  await slide.getByRole('heading').dblclick()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('A new oven')
  await page.keyboard.press('Enter')
  await expect(slide.getByRole('heading')).toHaveText('A new oven')
  await expect.poll(async () => (await files(page))[0].page).toContain('\n# A new oven\n')
  // As its Markdown, beside the slides (Source).
  await beside.getByRole('button', { name: 'Source' }).click()
  const text = beside.locator('textarea.deck-source')
  await expect(text).toBeVisible()
  await text.fill((await text.inputValue()).replace('Queues on Saturdays', 'Queues every Saturday'))
  await expect.poll(async () => (await files(page))[0].page).toContain('- Queues every Saturday')
  await beside.getByRole('button', { name: 'Source' }).click()
  // Its layouts named as Jean names them, those its own kit changes too (on Tilde, the cover is on ink, unnamed in its file).
  await beside.locator('.deck-stage').press('Home')
  // WebKit places an anchored menu as if the page weren't scrolled (as for Save, below).
  await page.evaluate(() => scrollTo(0, 0))
  await beside.getByRole('button', { name: 'Slide layout' }).click()
  const layouts = page.locator('#slides-layouts').getByRole('menuitemradio')
  expect((await layouts.allTextContents()).filter((name) => !/^[A-Z]/.test(name.trim())), 'no bare key such as cover').toEqual([])
  // A menu as Jean's are, its tick beside each name, and above its button: not the bar's buttons, stretched over the pane.
  await expect(layouts.first()).toHaveCSS('display', 'flex')
  const [menuBox, buttonBox] = await Promise.all([page.locator('#slides-layouts').boundingBox(), beside.getByRole('button', { name: 'Slide layout' }).boundingBox()])
  expect(Number(menuBox?.y) + Number(menuBox?.height)).toBeLessThanOrEqual(Number(buttonBox?.y))
  expect(Number(menuBox?.width)).toBeLessThan(320)
  await layouts.filter({ hasText: 'Cover' }).click()
  await expect(slide).toHaveAttribute('data-layout', 'cover')
  // Laid out again from the Slide layout menu, on the slide on show.
  await beside.locator('.deck-stage').press('End')
  await beside.getByRole('button', { name: 'Slide layout' }).click()
  await page.locator('#slides-layouts').getByRole('menuitemradio', { name: 'Statement' }).click()
  await expect(slide).toHaveAttribute('data-layout', 'statement')
  await expect.poll(async () => (await files(page))[0].page).toContain('layout: statement')
  // By asking Jean, with the deck on show: Jean's version, a slide changed, to accept.
  await beside.locator('.deck-stage').press('Home')
  await ask(page, 'Make it 150 croissants')
  await answered(page, 2)
  await expect(beside.locator('.review')).toContainText('1 change to review')
  await expect(slide).toHaveClass(/\bis-jean\b/)
  await expect(slide).toContainText('150 croissants a day')
  await expect(beside.locator('.slides-change')).toContainText('This slide, changed')
  await beside.locator('.slides-change').getByRole('button', { name: 'Before' }).click()
  await expect(slide).toContainText('120 croissants a day')
  await beside.locator('.slides-change').getByRole('button', { name: 'Accept' }).click()
  await expect(beside.locator('.review')).toHaveCount(0)
  await expect.poll(async () => (await files(page))[0]).toMatchObject({ theirs: null })
  const [changed] = await files(page)
  expect(changed.page).toContain('150 croissants a day')
  expect(changed.page, 'what the user changed by hand stays').toContain('# A new oven')
  expect(changed.page).toContain('layout: statement')
  // Its bar, made again once nothing is left to decide, and in another language, Jean's buttons in it: after the paging, full
  // screen by Play, the presenter's view, all slides, Slide layout, then Source.
  const bar = () => beside.locator('.deck-bar button').evaluateAll((buttons) => buttons.filter((one) => one.checkVisibility()).map((one) => one.getAttribute('aria-label')))
  await expect.poll(bar).toEqual(['Previous slide', 'Next slide', 'Present full screen', 'Presenter view', 'All slides', 'Slide layout', 'Source'])
  await expect(beside.getByRole('button', { name: 'Present full screen' }).locator('path')).toHaveAttribute('d', 'M8.5 5.5v13L19 12Z')
  for (const [lang, words] of [['fr', ['Diapositive précédente', 'Diapositive suivante', 'Présenter en plein écran', 'Vue présentateur', 'Toutes les diapositives', 'Disposition de la diapositive', 'Source']],
    ['en', ['Previous slide', 'Next slide', 'Present full screen', 'Presenter view', 'All slides', 'Slide layout', 'Source']]]) {
    await page.keyboard.press('ControlOrMeta+Comma')
    await page.locator('app-settings dialog[open] .settings-panel select').first().selectOption(String(lang))
    await closeSettings(page)
    await expect.poll(bar).toEqual(words)
    await expect(beside.locator('.deck-bar')).not.toContainText('null')
    await expect(beside.locator('.review'), 'what was accepted stays so').toHaveCount(0)
  }

  // Saved as PowerPoint, made in the browser: a file PowerPoint opens, a slide a slide, with its native chart.
  await beside.locator('.deck-stage').press('Home')
  // WebKit places an anchored menu as if the page weren't scrolled (tables.spec.js does the same).
  await page.evaluate(() => scrollTo(0, 0))
  await page.locator('app-preview .slides-save').click()
  const [pptx] = await Promise.all([page.waitForEvent('download'), page.locator('#slides-save').getByRole('button', { name: /^PowerPoint/ }).click()])
  expect(pptx.suggestedFilename()).toBe('A second oven.pptx')
  const zip = (await import('node:fs')).readFileSync(String(await pptx.path())).toString('latin1')
  expect(zip.startsWith('PK')).toBe(true)
  for (const part of ['ppt/slides/slide4.xml', 'ppt/charts/chart', 'ppt/notesSlides/notesSlide']) expect(zip).toContain(part)
  // Its file, a page any browser presents, its renderer linked, none of Jean's facts.
  await page.locator('app-preview .slides-save').click()
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#slides-save').getByRole('button', { name: /^Slides file/ }).click()])
  expect(file.suggestedFilename()).toBe('A second oven.deck.html')
  const html = (await import('node:fs')).readFileSync(String(await file.path()), 'utf8')
  expect(html).toContain('# A new oven')
  expect(html).not.toContain('<meta name="author"')
  // A PDF: printed alone, a slide a page, on a page of a slide's size, the room's own page given back.
  await page.evaluate(() => { window.print = () => { Object.assign(window, { printed: [document.documentElement.className, document.querySelectorAll('.deck-print .deck-stage > .deck-slide').length, document.adoptedStyleSheets.some((sheet) => /13\.333in/.test(sheet.cssRules[0]?.cssText ?? ''))] }); dispatchEvent(new Event('afterprint')) } })
  await page.locator('app-preview .slides-save').click()
  await page.locator('#slides-save').getByRole('button', { name: /^Print or save as PDF/ }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed)).toEqual([expect.stringContaining('is-printing-deck'), 4, true])
  await expect(page.locator('.deck-print')).toHaveCount(0)
})

test('deck\'s mind map and figures: drawn from a slide\'s lists and parts, a diagram in a node in the deck\'s colours at the share of its box its fence gives, named in Slide layout, and PowerPoint\'s own shapes (D615)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await addSlides(page)
  await ask(page, 'Make a mind map of the plan')
  await answered(page)
  const beside = page.locator('app-preview app-slides.beside'), slide = beside.locator('.deck-slide.is-shown')
  await expect(slide).toHaveAttribute('data-layout', 'mindmap')
  // The map: its root in the middle, a node for each heading and item, a pie in one, as Pele draws it in the deck's series, at half its box.
  const nodes = slide.locator('.deck-map-node')
  for (const words of ['What a second oven changes', 'Mornings', 'Croissants until noon', 'No queue at 7', 'Bread', 'A batch at noon']) await expect(nodes.filter({ hasText: words }).first()).toBeVisible()
  await expect(slide.locator('.deck-map-lines path')).toHaveCount(5)
  const pie = slide.locator('.deck-map-node .deck-diagram img')
  await expect.poll(() => pie.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0)
  expect(decodeURIComponent(String(await pie.getAttribute('src')))).toMatch(/--pele-series-1:\s*\S/)
  expect(await pie.evaluate((img) => /** @type {HTMLElement} */ (img).style.maxInlineSize)).toBe('50%')
  // Light or dark as the room is, once drawn too: every deck open, beside and in the answer, and the pie coloured again.
  const schemes = () => page.locator('app-slides .deck').evaluateAll((decks) => [...new Set(decks.map((deck) => /** @type {HTMLElement} */ (deck).dataset.scheme))])
  const light = await pie.getAttribute('src')
  await expect.poll(schemes).toEqual(['light'])
  await page.locator('#prompt').focus()
  await page.keyboard.press('ControlOrMeta+Shift+d')
  await expect.poll(schemes).toEqual(['dark'])
  await expect.poll(() => pie.getAttribute('src')).not.toBe(light)
  await page.keyboard.press('ControlOrMeta+Shift+d')
  await expect.poll(schemes).toEqual(['light'])
  // Key figures, each lead over what it counts; then two sides face to face.
  await beside.getByRole('button', { name: 'Next slide' }).click()
  await expect(slide).toHaveAttribute('data-layout', 'metrics')
  await expect(slide.locator('.deck-metric')).toHaveCount(3)
  await expect(slide.locator('.deck-metric').first()).toContainText('120')
  await beside.getByRole('button', { name: 'Next slide' }).click()
  await expect(slide).toHaveAttribute('data-layout', 'versus')
  await expect(slide.locator('.deck-part')).toHaveCount(2)
  // In Slide layout, by Jean's names for them, the one in use ticked.
  await page.evaluate(() => scrollTo(0, 0))
  await beside.getByRole('button', { name: 'Slide layout' }).click()
  const layouts = page.locator('#slides-layouts').getByRole('menuitemradio')
  await expect(layouts.filter({ hasText: 'Face to face' })).toHaveAttribute('aria-checked', 'true')
  const names = await layouts.allTextContents()
  for (const name of ['Mind map', 'Key figures', 'Timeline', 'Agenda', 'Contents', 'Mosaic', 'Matrix']) expect(names.map((one) => one.trim()), name).toContain(name)
  await beside.getByRole('button', { name: 'Slide layout' }).click()
  // Saved as PowerPoint, the deck's writer loaded only then: the map's words in boxes joined by curves, the figures' words.
  await page.locator('app-preview .slides-save').click()
  const [pptx] = await Promise.all([page.waitForEvent('download'), page.locator('#slides-save').getByRole('button', { name: /^PowerPoint/ }).click()])
  const { unzipSync, strFromU8 } = await import('fflate')
  const parts = unzipSync((await import('node:fs')).readFileSync(String(await pptx.path()))), slideXml = (/** @type {number} */ n) => strFromU8(parts[`ppt/slides/slide${n}.xml`])
  expect(slideXml(1)).toContain('No queue at 7')
  expect(slideXml(1).match(/<a:custGeom>/g)?.length).toBeGreaterThanOrEqual(5)
  expect(slideXml(2)).toContain('croissants a day')
  expect(slideXml(3)).toContain('Sold out by 10')
})

test('a schema asked for on the deck on show is made as a picture first, then put on its slides by its name: drawn, kept at its place in the project, and inside its file, its PDF and its PowerPoint', async ({ page }) => {
  // The fake brain is on this computer, so its picture goes through the check, which passes it, watermark and all (pictures.spec.js).
  await page.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript',
    body: 'self.onmessage = ({ data }) => self.postMessage(data.type === \'watermark\' ? { id: data.id, type: \'done\', bytes: data.bytes } : { id: data.id, type: \'done\', logits: [5, 0, 0, 0], areas: [] })' }))
  await start(page)
  await connectFakeBrain(page)
  await addSlides(page)
  await turnOn(page, 'Pictures and films')
  await page.keyboard.press('Escape')
  await ask(page, 'Make slides about the new oven')
  await answered(page)
  const beside = page.locator('app-preview app-slides.beside'), slide = beside.locator('.deck-slide.is-shown')
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 4')
  await ask(page, 'Ajoute un schéma du cycle de l\'eau')
  await answered(page, 2)
  // Made first, then drawn in the answer by the name it was made under: beside two points, and alone under its heading.
  await expect(page.locator('.msg-jean').last().locator('app-picture img')).toHaveJSProperty('naturalWidth', 96)
  const inline = page.locator('.msg-jean').last().locator('app-slides .deck-stage > .deck-slide')
  await expect(inline).toHaveCount(6)
  await expect(inline.nth(5).locator('.deck-picture img')).toHaveAttribute('src', /^blob:/)
  await expect(inline.nth(5).locator('.deck-picture img')).toHaveAttribute('alt', 'Le cycle de l\'eau')
  expect(await inline.nth(4).locator('.deck-image').evaluate((one) => /** @type {HTMLElement} */ (one).style.getPropertyValue('--deck-image'))).toMatch(/^url\("blob:/)
  // Kept as Jean's version of the deck, the picture at its place in the project from the deck's folder, its name gone.
  await expect.poll(async () => (await files(page))[0].theirs).toContain('![Le cycle de l\'eau](<../files/sha256-')
  const [waiting] = await files(page), place = /\.\.\/(files\/sha256-[\da-f]{64}\.png)/.exec(String(waiting.theirs))?.[1]
  expect(waiting.theirs).toContain(`\nimage: ../${place}\n`)
  expect(waiting.theirs).not.toContain('Cycle de l\'eau.png')
  expect(await page.evaluate(async (uri) => {
    const { app } = await import('/ui/state.js')
    return (await app.fs.readBytes(`${app.projectDir}/${uri}`))?.length
  }, place)).toBeGreaterThan(0)
  // Beside the task: two slides added, the picture on each, accepted into the user's deck.
  await expect(beside.locator('.review')).toContainText('2 changes to review')
  await beside.locator('.deck-stage').press('End')
  await expect(slide).toHaveAttribute('aria-label', 'Slide 6 of 6')
  await expect(slide.locator('.deck-picture img')).toHaveJSProperty('naturalWidth', 96)
  await beside.locator('.deck-stage').press('ArrowLeft')
  await expect(slide).toHaveAttribute('data-layout', 'image-right')
  await expect(slide).toHaveClass(/\bhas-image\b/)
  await beside.locator('.review').getByRole('button', { name: 'Accept all' }).click()
  await expect.poll(async () => (await files(page))[0]).toMatchObject({ theirs: null })
  expect((await files(page))[0].page).toContain(`![Le cycle de l'eau](<../${place}>)`)

  // Saved: its file holds the picture itself, twice, and no place in the project.
  await page.evaluate(() => scrollTo(0, 0))
  await page.locator('app-preview .slides-save').click()
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#slides-save').getByRole('button', { name: /^Slides file/ }).click()])
  const html = (await import('node:fs')).readFileSync(String(await file.path()), 'utf8')
  expect(html.match(/data:image\/png;base64,/g)).toHaveLength(2)
  expect(html).not.toContain('../files/')
  // PowerPoint: the picture beside the points and the one alone, each a picture of the file's.
  await page.locator('app-preview .slides-save').click()
  const [pptx] = await Promise.all([page.waitForEvent('download'), page.locator('#slides-save').getByRole('button', { name: /^PowerPoint/ }).click()])
  const { unzipSync, strFromU8 } = await import('fflate')
  const parts = unzipSync((await import('node:fs')).readFileSync(String(await pptx.path())))
  for (const n of [5, 6]) expect(strFromU8(parts[`ppt/slides/slide${n}.xml`]), `slide ${n}`).toContain('<p:pic>')
  // The PDF: both pictures drawn for the printer.
  await page.evaluate(() => { window.print = () => { Object.assign(window, { printed: [...document.querySelectorAll('.deck-print .deck-picture img')].map((img) => /** @type {HTMLImageElement} */ (img).naturalWidth).concat(document.querySelectorAll('.deck-print .has-image').length) }); dispatchEvent(new Event('afterprint')) } })
  await page.locator('app-preview .slides-save').click()
  await page.locator('#slides-save').getByRole('button', { name: /^Print or save as PDF/ }).click()
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed)).toEqual([96, 1])
})

test('while its block is written, the slide being written shows, then the first, unless the user has paged; fenced as Markdown, it is a deck too', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    await app.fs.write('skills/slides/SKILL.md', '---\nname: slides\ndescription: Make slides.\nmetadata:\n  blocks: deck, markdown\n---\n# Slides\n')
    const { unlock } = await import('/ui/caps.js')
    await unlock('skills')
    await (await import('/caps/skills/skills.js')).redeclare()
    await unlock('slides')
  })
  // An answer as the brain writes it, drawn again in the same place as more of it comes, then once it has ended.
  const write = (/** @type {string} */ text, still = true) => page.evaluate(async ([text, still]) => {
    const [{ render }, { markdown }] = await Promise.all([import('lit-html'), import('/ui/markdown.js')])
    const answer = document.querySelector('#written') ?? document.body.appendChild(Object.assign(document.createElement('article'), { id: 'written', className: 'msg msg-jean' }))
    answer.classList.toggle('is-streaming', Boolean(still))
    render(markdown(String(text), undefined, Boolean(still)), answer)
  }, [text, still])
  const block = '````deck\n# One\n\n---\n\n## Two\n\n---\n\n## Three\n````'
  const deck = page.locator('#written app-slides'), slide = deck.locator('.deck-slide.is-shown')

  await write(`Slides:\n\n${block.slice(0, block.indexOf('## Two') + 6)}`)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 2 of 2')
  await expect(slide.getByRole('heading')).toHaveText('Two')
  await write(`Slides:\n\n${block}\n\nThree slides.`, false)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 3')
  // Paged while it is written, it stays where the user is.
  await write(`Slides:\n\n${block.slice(0, block.indexOf('## Two') + 6)}`)
  await deck.getByRole('button', { name: 'Previous slide' }).click()
  await write(`Slides:\n\n${block}`)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 3')
  await deck.getByRole('button', { name: 'Next slide' }).click()
  await write(`Slides:\n\n${block}\n\nThree slides.`, false)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 2 of 3')
  // As brains fence one, as Markdown: a deck all the same, while a Markdown example without slides stays code.
  await page.evaluate(() => document.querySelector('#written')?.remove())
  await write('Slides:\n\n```markdown\n---\ntitle: Plan\n---\n\n# Plan\n\n---\n\n## Next\n```', false)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 2')
  await write('An example:\n\n```markdown\n# A heading\n\nSome *words*.\n```', false)
  await expect(deck).toHaveCount(0)
  await expect(page.locator('#written pre code')).toContainText('# A heading')
})

test('the decks kept are slides among the creations: their first slide on their card, opening beside the task, renamed, copied and deleted, and Create\'s Slides asks for one with the Slides skill (D558)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'the same menu as a document’s (documents.spec.js)')
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const tasks = await openTasks(page)
  const place = tasks.getByRole('button', { name: 'Creations', exact: true })
  await place.click()
  const creations = page.locator('app-creations'), card = creations.locator('.creation')
  await expect(creations.locator('.creation-start b')).toHaveText(['Slides', 'Score'])
  // Create, then Slides: Jean's own Slides skill in the room, and a request in the box, its example selected for the user's own words.
  await creations.getByRole('button', { name: 'Create', exact: true }).click()
  await creations.locator('.creations-menu:popover-open').getByRole('button', { name: 'Slides' }).click()
  const box = page.locator('#prompt')
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('Prepare a five-minute talk on the water cycle, as slides I can present.')
  expect(await page.evaluate(async () => (await (await import('/caps/skills/skills.js')).skills()).map((skill) => skill.name))).toEqual(['slides'])
  await page.keyboard.type('a talk on the new oven')
  await page.keyboard.press('Enter')
  await answered(page)
  await expect(page.locator('app-preview app-slides.beside .deck-slide.is-shown')).toHaveAttribute('aria-label', 'Slide 1 of 4')
  // On its card, named by its title, its first slide, without its bar.
  await place.click()
  await expect(card.locator('.creation-open')).toHaveText(['A second oven'])
  await expect(card.locator('.creation-preview .deck-slide.is-shown')).toContainText('A second oven')
  await expect(card.locator('.creation-preview .deck-bar')).toBeHidden()
  // Renamed: its title, in its Markdown and its page; copied, the user's; deleted, its file gone.
  const menu = async (/** @type {number} */ n = 0) => { await card.nth(n).click({ button: 'right' }); return creations.locator('.task-menu:popover-open') }
  await (await menu()).getByRole('button', { name: 'Rename' }).click()
  await page.keyboard.type('Oven talk')
  await page.keyboard.press('Enter')
  await expect(card.locator('.creation-open')).toHaveText(['Oven talk'])
  await expect.poll(async () => (await files(page)).map((one) => /<title>(.*)<\/title>/.exec(one.page)?.[1])).toEqual(['Oven talk'])
  expect((await files(page))[0].page).toContain('title: "Oven talk"')
  await (await menu()).getByRole('button', { name: 'Duplicate' }).click()
  await expect(creations.getByRole('textbox', { name: 'Rename' })).toHaveValue('Oven talk (copy)')
  await page.keyboard.press('Enter')
  await expect(card).toHaveCount(2)
  await expect.poll(async () => (await files(page)).filter((one) => one.page.includes('<meta name="author" content="user">')).length).toBe(1)
  // Picked, it opens beside the task.
  await card.first().locator('.creation-open').click()
  await expect(page.locator('app-preview app-slides.beside .deck-slide.is-shown')).toBeVisible()
  await (await menu(1)).getByRole('button', { name: 'Delete' }).click()
  await expect(card).toHaveCount(1)
  await expect.poll(async () => (await files(page)).length, { timeout: 8000 }).toBe(1)
})

for (const [lang, request, title, next] of /** @type {const} */ ([
  ['ar', 'اصنع شرائح عن الفرن الجديد', 'فرن ثانٍ', 'الشريحة التالية'],
  ['ja', '新しいオーブンのスライドを作って', '二台目のオーブン', '次のスライド'],
])) {
  test(`in ${lang === 'ar' ? 'Arabic' : 'Japanese'}, a deck asked for is kept in its language, read ${lang === 'ar' ? 'right to left' : 'upright'}, and saved as PowerPoint the same`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    // Jean's own Slides in the room, as a request for one brings it (D401); the English test adds it in Settings.
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('skills'); await (await import('/caps/skills/skills.js')).bring(['slides']) })
    await ask(page, request)
    await answered(page)
    const beside = page.locator('app-preview app-slides.beside'), slide = beside.locator('.deck-slide.is-shown')
    await expect(beside.locator('.deck')).toHaveAttribute('lang', lang)
    await expect(beside.locator('.deck')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    await expect(slide.getByRole('heading')).toHaveText(title)
    const [kept] = await files(page), cover = lang === 'ar' ? 'الغلاف' : '表紙'
    expect(kept.page).toContain(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`)
    // The cover's layout named in its language in the Slide layout menu, though its file's kit changes it unnamed.
    await beside.getByRole('button', { name: lang === 'ar' ? 'تخطيط الشريحة' : 'スライドのレイアウト' }).click()
    await expect(page.locator('#slides-layouts').getByRole('menuitemradio', { name: cover })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#slides-layouts').getByRole('menuitemradio', { name: lang === 'ar' ? 'خريطة ذهنية' : 'マインドマップ' }), "deck's mind map named in its language").toHaveCount(1)
    await page.locator('#slides-layouts').getByRole('menuitemradio', { name: cover }).click()
    expect(kept.page).toContain(`<title>${title}</title>`)
    // Its bar in the user's language; paged the way the page reads.
    await beside.getByRole('button', { name: next }).click()
    await expect(slide).toHaveAttribute('data-layout', 'two-cols')
    // Bold beside the punctuation of Chinese, Japanese and Korean, as answers read it, through the lexer Slides gives deck.
    if (lang === 'ja') await expect(slide.locator('strong')).toHaveText('オーブン1台（今のまま）')
    const [left, right] = await Promise.all(['default', 'right'].map((name) => slide.locator(`[data-slot="${name}"]`).boundingBox()))
    expect(Number(left?.x) > Number(right?.x), 'the first column on the side the language starts from').toBe(lang === 'ar')
    await beside.getByRole('button', { name: next }).click()
    await expect.poll(() => slide.locator('.deck-diagram img').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0)
    // Saved as PowerPoint: right to left in Arabic, its words its language's.
    await page.evaluate(() => scrollTo(0, 0))
    await page.locator('app-preview .slides-save').click()
    const [pptx] = await Promise.all([page.waitForEvent('download'), page.locator('#slides-save button', { hasText: 'PowerPoint' }).click()])
    expect(pptx.suggestedFilename().normalize(), "WebKit gives it decomposed, as macOS names files").toBe(`${title}.pptx`)
    const { unzipSync, strFromU8 } = await import('fflate')
    const parts = unzipSync((await import('node:fs')).readFileSync(String(await pptx.path())))
    const first = strFromU8(parts['ppt/slides/slide1.xml'])
    expect(first).toContain(title)
    expect(first.includes('rtl="1"')).toBe(lang === 'ar')
    const names = Object.keys(parts).filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map((name) => /<p:cSld name="([^"]*)"/.exec(strFromU8(parts[name]))?.[1] ?? '')
    expect(names.some((name) => name.startsWith(cover)), `PowerPoint's layouts named in its language too: ${names}`).toBe(true)
    expect(names.filter((name) => /^(cover|intro|end)\b/.test(name))).toEqual([])
    expect(Object.keys(parts).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name))).toHaveLength(1)
  })
}

test('a project\'s new look is offered to its decks kept, as Jean\'s version: in the new look, Before, accepted or rejected, offered once (D601)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await addSlides(page)
  await ask(page, 'Make slides about the new oven')
  await answered(page)
  await expect.poll(async () => (await files(page)).length).toBe(1)
  const beside = page.locator('app-preview app-slides.beside'), line = beside.locator('.slides-change')
  await expect(beside.locator('.deck-slide.is-shown')).toBeVisible()
  await expect(line).toHaveCount(0)
  // The project takes a colour; its deck, opened again, wears it as Jean's version.
  const colour = (/** @type {string} */ css) => page.evaluate(async (given) => {
    const [{ app }, { hexOf }] = await Promise.all([import('/ui/state.js'), import('/ui/kit.js')])
    app.project.value = { ...app.project.value, data: { ...app.project.value.data, colour: given } }
    return hexOf(given)
  }, css)
  const { name: deck } = (await files(page))[0]
  const reopen = () => page.evaluate(async (name) => {
    const { preview, unshow } = await import('/ui/preview.js')
    unshow(`decks/${name}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
    preview({ uri: `decks/${name}`, name: 'A second oven', title: 'A second oven', mimeType: 'text/html' })
  }, deck)
  const kitOf = (/** @type {string} */ text) => JSON.parse(/^kit: (.*)$/m.exec(text)?.[1] ?? '{}').tokens?.primary
  const green = await colour('oklch(0.74 0.17 150)')
  await reopen()
  await expect(line).toHaveText(/The project's new look/)
  await expect(beside.locator('.review')).toHaveCount(0)
  // Opened on the first slide where the colour shows, past a cover on ink that looks the same in either.
  const shown = beside.locator('.deck-slide.is-shown')
  await expect(shown).toHaveAttribute('aria-label', 'Slide 2 of 4')
  await expect(beside.locator('.deck-slide').first()).toHaveAttribute('data-paper', 'ink')
  expect(kitOf(String((await files(page))[0].theirs))).toBe(green)
  const before = line.getByRole('button', { name: 'Before' })
  await before.click()
  await expect(before).toHaveAttribute('aria-pressed', 'true')
  await before.click()
  await line.getByRole('button', { name: 'Accept' }).click()
  await expect(line).toHaveCount(0)
  await expect.poll(async () => kitOf((await files(page))[0].page)).toBe(green)
  expect((await files(page))[0].theirs).toBeNull()
  await reopen()
  await expect(beside.locator('.deck-slide.is-shown')).toBeVisible()
  await expect(line).toHaveCount(0)
  // Another colour, rejected: the deck keeps the look it had, and isn't offered it again.
  await colour('oklch(0.74 0.17 260)')
  await reopen()
  await expect(line).toHaveText(/The project's new look/)
  await line.getByRole('button', { name: 'Reject' }).click()
  await expect(line).toHaveCount(0)
  await expect.poll(async () => (await files(page))[0].theirs).toBeNull()
  expect(kitOf((await files(page))[0].page)).toBe(green)
  await reopen()
  await expect(beside.locator('.deck-slide.is-shown')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(line).toHaveCount(0)
})

test('a design system: Jean\'s own and a project\'s, its colours written or picked, logo and layouts, a kit and a PowerPoint template brought in with its art, saved as a file; decks drawn with it (D602, D606)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await addSlides(page)
  const settings = await openSettings(page, 'Appearance')
  await settings.getByRole('button', { name: /^Design system/ }).click()
  await expect(settings.getByRole('heading', { name: 'Design system' })).toBeVisible()
  const kit = (/** @type {string} */ path) => page.evaluate(async (place) => JSON.parse(String(await (await import('/ui/state.js')).app.fs.read(place) ?? 'null')), path)
  // Its colours written as rgb() or rgba(), kept as written, the picker showing them; one that isn't a colour said so, kept in its field.
  const main = settings.getByRole('textbox', { name: 'Main colour: rgb() or #hex' }).first()
  await main.fill('rgb(15, 118, 110)')
  await main.press('Enter')
  await expect.poll(async () => (await kit('kit.json'))?.tokens?.primary).toBe('rgb(15, 118, 110)')
  await expect(settings.getByRole('listitem').filter({ hasText: 'Main colour' }).first().locator('input[type="color"]')).toHaveValue('#0f766e')
  await settings.getByRole('textbox', { name: 'Quiet words: rgb() or #hex' }).first().fill('rgba(0, 0, 0, 0.6)')
  await settings.getByRole('textbox', { name: 'Quiet words: rgb() or #hex' }).first().press('Enter')
  await expect.poll(async () => (await kit('kit.json'))?.tokens?.muted).toBe('rgba(0, 0, 0, 0.6)')
  await main.fill('teal, more or less')
  await main.press('Enter')
  await expect(settings.locator('.hint[role="status"]')).toContainText('That isn\'t a colour')
  await expect(main).toHaveValue('teal, more or less')
  await expect(main).toHaveAttribute('aria-invalid', 'true')
  expect((await kit('kit.json'))?.tokens?.primary).toBe('rgb(15, 118, 110)')
  // Picked, its main colour; a logo, a layout of deck's turned off, and one of its own as a grid of named parts.
  await settings.getByRole('listitem').filter({ hasText: 'Main colour' }).first().locator('input[type="color"]').fill('#0f766e')
  await expect.poll(async () => (await kit('kit.json'))?.tokens?.primary).toBe('#0f766e')
  await expect(main).toHaveValue('#0f766e')
  await expect(main).toHaveAttribute('aria-invalid', 'false')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  await settings.locator('.kit-logo:not(.is-dark) input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect.poll(async () => (await kit('kit.json'))?.tokens?.logo).toMatch(/^data:image\/png;base64,iVBOR/)
  await expect(settings.locator('.kit-preview .deck-slide.is-shown .deck-logo').first()).toBeAttached()
  // The deck beside shows each layout with words written as it wants them, so that each draws what it is for: its figure, the contents, a picture, a quote.
  const preview = settings.locator('.kit-preview')
  for (const [layout, part, count] of /** @type {[string, string, number][]} */ ([['steps', '.deck-card', 4], ['metrics', '.deck-metric', 3], ['timeline', '.deck-dot', 4], ['process', '.deck-chevron', 4], ['agenda', '.deck-row', 4], ['pyramid', '.deck-level', 4], ['bento', '.deck-tile', 4], ['versus', '.deck-part', 2], ['matrix', '.deck-part', 4], ['summary', '.deck-contents .deck-row', 6]])) await expect(preview.locator(`.deck-layout-${layout} ${part}`)).toHaveCount(count)
  await expect(preview.locator('.deck-layout-metrics .deck-lead').first()).toHaveText('92%')
  await expect(preview.locator('.deck-layout-agenda .deck-lead').first()).toHaveText(/^9:00/)
  await expect(preview.locator('.deck-layout-timeline .deck-lead').first()).toHaveText('Jan')
  await expect(preview.locator('.deck-layout-image-left.has-image .deck-image')).toBeAttached()
  await expect(preview.locator('.deck-layout-quote blockquote')).toContainText('Small steps')
  await settings.getByRole('switch', { name: 'Picture', exact: true }).uncheck()
  await settings.getByRole('button', { name: 'New layout' }).click()
  await settings.getByLabel('Name', { exact: true }).fill('Three numbers')
  await settings.getByLabel('Grid', { exact: true }).fill('default default default\none two three')
  await settings.getByRole('button', { name: 'Keep' }).click()
  await expect.poll(async () => (await kit('kit.json'))?.layouts).toMatchObject({ image: false, 'three-numbers': { slots: ['default', 'one', 'two', 'three'], label: { en: 'Three numbers' } } })
  await expect(preview.locator('.deck-layout-three-numbers [data-slot="two"]')).toContainText('Plan')
  // A grid whose parts aren't rectangles says so, and keeps nothing.
  await settings.getByRole('button', { name: 'New layout' }).click()
  await settings.getByLabel('Name', { exact: true }).fill('Broken')
  await settings.getByLabel('Grid', { exact: true }).fill('default one\none default')
  await settings.getByRole('button', { name: 'Keep' }).click()
  await expect(settings.locator('.hint[role="status"]')).toContainText('can\'t be laid out')
  await settings.getByRole('button', { name: 'Cancel' }).click()
  // A kit brought in, then a PowerPoint template, its theme, logo and layouts; and the kit saved as a file.
  await settings.locator('.kit-files input[type="file"]').setInputFiles({ name: 'acme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ name: 'Acme', tokens: { primary: '#e30613', voice: 'bold' }, layouts: { roadmap: { label: 'Roadmap', lists: 'timeline' } } })) })
  await expect(settings.locator('.hint[role="status"]')).toHaveText('Brought in from acme.json.')
  await expect(preview.locator('.deck-layout-roadmap .deck-dot'), 'a kit\'s own figure').toHaveCount(4)
  await expect.poll(async () => (await kit('kit.json'))?.tokens).toMatchObject({ primary: '#e30613', voice: 'bold', logo: expect.stringMatching(/^data:image\/png/) })
  const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
  const ph = (/** @type {string} */ type, /** @type {number[]} */ box) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${box[0]}" y="${box[1]}"/><a:ext cx="${box[2]}" cy="${box[3]}"/></a:xfrm></p:spPr></p:sp>`
  const text = (/** @type {string} */ name, /** @type {string} */ content) => ({ name, bytes: new TextEncoder().encode(content) })
  const template = await writeZip([text('ppt/presentation.xml', `<p:presentation ${P}><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`),
    text('ppt/theme/theme1.xml', `<a:theme ${P}><a:themeElements><a:clrScheme name="T"><a:dk1><a:srgbClr val="102030"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="7048E8"/></a:accent1></a:clrScheme><a:fontScheme name="T"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Verdana"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`),
    // A band in its accent across the master's top: art under each of its layouts.
    text('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster ${P}><p:cSld><p:spTree>${ph('title', [838200, 365125, 10515600, 1325563])}<p:sp><p:nvSpPr><p:cNvPr id="3" name="Band"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
      + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="254000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld></p:sldMaster>'),
    text('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'),
    text('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout ${P}><p:cSld name="Side by Side"><p:spTree>${ph('title', [838200, 365125, 10515600, 1325563])}${ph('body', [838200, 1825625, 5181600, 4351338])}${ph('body', [6172200, 1825625, 5181600, 4351338])}</p:spTree></p:cSld></p:sldLayout>`)])
  await settings.locator('.kit-files input[type="file"]').setInputFiles({ name: 'Company.potx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.template', buffer: Buffer.from(template) })
  await expect(settings.locator('.hint[role="status"]')).toHaveText('Brought in from Company.potx.')
  await expect.poll(async () => (await kit('kit.json'))?.tokens).toMatchObject({ primary: '#7048e8', fonts: { heading: expect.arrayContaining(['Georgia']), body: expect.arrayContaining(['Verdana']) } })
  expect((await kit('kit.json'))?.layouts?.['side-by-side']?.slots).toEqual(['default', 'left', 'right'])
  const brought = await kit('kit.json')
  expect(brought?.layouts?.['side-by-side']?.art).toEqual(Object.keys(brought?.pictures ?? {}))
  expect(decodeURIComponent(Object.values(brought?.pictures ?? {})[0] ?? '')).toContain('fill="#7048e8"')
  await expect(settings.locator('.kit-layouts')).toContainText('Side by Side')
  await expect(settings.locator('.kit-preview .deck-slide.has-art img.deck-art').first()).toBeAttached()
  expect(await settings.locator('.kit-preview .deck-slide.has-art img.deck-art').first().evaluate((img) => /** @type {HTMLImageElement} */ (img).decode().then(() => /** @type {HTMLImageElement} */ (img).naturalWidth))).toBeGreaterThan(0)
  const [download] = await Promise.all([page.waitForEvent('download'), settings.getByRole('button', { name: 'Save as a file' }).click()])
  expect(download.suggestedFilename()).toBe('Company.json')
  // A project's own, over Jean's.
  await page.evaluate(async () => (await import('/ui/dialogs.js')).openSettings('appearance/kit-project'))
  await settings.getByRole('listitem').filter({ hasText: 'Main colour' }).first().locator('input[type="color"]').fill('#b45309')
  const here = await page.evaluate(async () => (await import('/ui/state.js')).app.projectDir)
  await expect.poll(async () => (await kit(`${here}/kit.json`))?.tokens?.primary).toBe('#b45309')
  await page.keyboard.press('Escape')
  // A deck made now is drawn with them: the project's colour, Jean's logo and the template's layouts, kept in its file.
  await ask(page, 'Make slides about the new oven')
  await answered(page)
  await expect.poll(async () => (await files(page)).length).toBe(1)
  const copy = JSON.parse(/^kit: (.*)$/m.exec((await files(page))[0].page)?.[1] ?? '{}')
  expect(copy.tokens).toMatchObject({ primary: '#b45309', logo: expect.stringMatching(/^data:image\/png/) })
  expect(copy.layouts).toMatchObject({ image: false, 'side-by-side': { slots: ['default', 'left', 'right'], art: Object.keys(brought?.pictures ?? {}) } })
  expect(copy.pictures).toEqual(brought?.pictures)
  await expect(page.locator('app-preview app-slides.beside .deck-slide.is-shown .deck-logo').first()).toBeAttached()
})

test('a copy of Jean\'s own skill added before follows Jean: written again as the directory has it now, kept off if it was', async ({ page }) => {
  await start(page)
  const read = (/** @type {string} */ name) => page.evaluate(async (named) => (await import('/ui/state.js')).app.fs.read(`skills/${named}/SKILL.md`), name)
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    // As Jean's Slides and PowerPoint were added before decks: Marp, and the computer; the PowerPoint one turned off. And one of the user's own.
    await app.fs.write('skills/slides/SKILL.md', '---\nname: slides\ndescription: "Make slides in Marp."\nmetadata:\n  format: "1"\n  author: jean\n  blocks: marp\n  title-en: "Slides"\n  text-en: "Decks written in answers"\n---\n# Slides\n\nWrite the deck in Marp\'s Markdown.\n')
    await app.fs.write('skills/pptx/SKILL.md', '---\nname: pptx\ndescription: "Make a PowerPoint on the computer."\nmetadata:\n  format: "1"\n  author: jean\n  off: true\n  title-en: "PowerPoint"\n  text-en: "Old"\n---\n# PowerPoint\n\nInstall pptxgenjs in ~.\n')
    await app.fs.write('skills/minutes/SKILL.md', '---\nname: minutes\ndescription: "Write the minutes."\nmetadata:\n  format: "1"\n---\n# Minutes\n\nMy own steps.\n')
    await (await import('/ui/caps.js')).unlock('skills')
    await (await import('/caps/skills/skills.js')).redeclare()
  })
  const slides = await read('slides')
  expect(slides).toContain('Write the deck in Slidev\'s Markdown, in one fenced code block tagged `deck`')
  expect(slides).toContain('text-en: Presentations ready to show, change and export to PowerPoint')
  expect(slides).not.toContain('Marp')
  expect(await page.evaluate(async () => [...(await import('/ui/markdown.js')).declared.peek()])).toEqual(expect.arrayContaining(['deck', 'markdown']))
  const pptx = await read('pptx')
  expect(pptx).toContain('as for slides')
  expect(pptx, 'still off, as the user left it').toMatch(/^ {2}off: true$/m)
  expect(await read('minutes'), 'one of the user\'s own stays theirs').toContain('My own steps.')
  expect(await page.evaluate(async () => {
    const { app } = await import('/ui/state.js'), write = app.fs.write, written = /** @type {string[]} */ ([])
    app.fs.write = (/** @type {string} */ path, /** @type {any[]} */ ...rest) => { written.push(path); return write.call(app.fs, path, ...rest) }
    await (await import('/caps/skills/skills.js')).redeclare().finally(() => { app.fs.write = write })
    return written
  }), 'followed, it reads as the directory has it').toEqual([])
  // Changed by Jean at the user's word, it is theirs: named by its heading, and no longer written again.
  await page.evaluate(async () => {
    const { loaded } = await import('/ui/caps.js')
    const tool = loaded.value.get('skills')?.tools?.find((one) => one.spec.name === 'save_skill')
    await tool?.run({ name: 'slides', description: 'Make my slides.', example: 'Slides on the trip', steps: '# My slides\n\nTwo slides at most.' }, /** @type {any} */ ({ signal: new AbortController().signal }))
    await (await import('/caps/skills/skills.js')).redeclare()
  })
  expect(await read('slides')).toContain('Two slides at most.')
  expect(await read('slides')).not.toContain('title-en')
})
