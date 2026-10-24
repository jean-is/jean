// Slides (D200): with the Slides skill of Jean's own directory added, a ```marp block in an answer
// is a deck, shown a slide at a time: numbered, its settings drawn (a title in the middle, the
// colours swapped), its notes for the speaker never shown, paged with its buttons and keys, and
// copied as its source and the slide's picture at once, and printed one slide under another. While
// the answer writes it, the slide being written shows, then the first, unless the user has paged,
// even when the answer ends without the block's closing fence. The decks answers hold are slides among the creations, where
// Create's Presentation asks for one with Slides (D558).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, openTasks, nextCopy } from './helpers.js'

test('a deck shows a slide at a time once its skill is added, paged with its buttons and keys, and copied', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  await knows.locator('.ready-made .service', { hasText: 'Slides' }).click()
  await expect(knows.locator('.skill-steps')).toContainText('Marp')
  await knows.getByRole('button', { name: 'Add this skill' }).click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Slides”.')
  await page.keyboard.press('Escape')

  await ask(page, 'Make slides about the new oven')
  const deck = page.locator('.msg-jean app-slides').last()
  const slide = deck.locator('.slide.is-shown')
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 3')
  await expect(slide).toHaveClass(/\blead\b/)
  await expect(slide.getByRole('heading')).toHaveText('A second oven')
  await expect(slide.locator('footer')).toHaveText('Bakery · 2027')
  await expect(slide.locator('.slide-number')).toHaveText('1')
  await expect(deck.locator('.slides-where')).toHaveText('1 / 3')
  await expect(deck.getByRole('button', { name: 'Previous slide' })).toBeDisabled()

  await deck.getByRole('button', { name: 'Next slide' }).click()
  await expect(slide).toHaveAttribute('aria-label', 'Slide 2 of 3')
  await expect(slide).not.toHaveClass(/\blead\b/)
  await expect(slide.locator('table')).toContainText('€18,000')
  await expect(slide, 'the note for the speaker isn’t shown').not.toContainText('14 months')
  await deck.locator('.slides-stage').press('ArrowRight')
  await expect(slide).toHaveClass(/\binvert\b/)
  await expect(deck.getByRole('button', { name: 'Next slide' })).toBeDisabled()
  await deck.locator('.slides-stage').press('Home')
  await expect(deck.locator('.slides-where')).toHaveText('1 / 3')

  // Copy: the deck's source as text and the slide as a picture, at once.
  const copy = await nextCopy(page)
  await deck.getByRole('button', { name: 'Copy' }).click()
  const copied = await copy.read()
  expect(copied['text/plain']).toMatch(/^---\npaginate: true\n/)
  expect(copied['image/png']).toEqual([137, 80, 78, 71])
  // Printed, every slide shows, one under another, without the bar.
  await page.emulateMedia({ media: 'print' })
  await expect(deck.locator('.slides-bar')).toBeHidden()
  const printed = deck.locator('.slide')
  await expect(printed).toHaveCount(3)
  for (const each of await printed.all()) await expect(each).toBeVisible()
  const [first, second] = await Promise.all([printed.nth(0).boundingBox(), printed.nth(1).boundingBox()])
  expect(second?.y).toBeGreaterThanOrEqual(Number(first?.y) + Number(first?.height))
  await expect(printed.locator('footer')).toHaveText(['Bakery · 2027', 'Bakery · 2027', 'Bakery · 2027'])
  const footer = await printed.nth(0).locator('footer').boundingBox()
  expect(Number(footer?.y)).toBeLessThan(Number(first?.y) + Number(first?.height))
})

test('while its block is written, the slide being written shows, then the first, unless the user has paged', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    await app.fs.write('skills/slides/SKILL.md', '---\nname: slides\ndescription: Make slides.\nmetadata:\n  blocks: marp\n---\n# Slides\n')
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
  const block = '```marp\n# One\n\n---\n\n## Two\n\n---\n\n## Three\n```'
  const slide = page.locator('#written app-slides .slide.is-shown')

  await write(`Slides:\n\n${block.slice(0, block.indexOf('## Two') + 6)}`)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 2 of 2')
  await expect(slide.getByRole('heading')).toHaveText('Two')
  await write(`Slides:\n\n${block}\n\nThree slides.`)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 3')

  // An answer that ends without the closing fence, as a brain may write it, is whole all the same.
  await write(`Slides:\n\n${block.slice(0, -4)}`)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 3 of 3')
  await write(`Slides:\n\n${block.slice(0, -4)}`, false)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 3')

  // Paged while it is written, it stays where the user is.
  await write(`Slides:\n\n${block.slice(0, block.indexOf('## Two') + 6)}`)
  await page.locator('#written app-slides').getByRole('button', { name: 'Previous slide' }).click()
  await write(`Slides:\n\n${block}`)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 1 of 3')
  await page.locator('#written app-slides').getByRole('button', { name: 'Next slide' }).click()
  await write(`Slides:\n\n${block}\n\nThree slides.`)
  await expect(slide).toHaveAttribute('aria-label', 'Slide 2 of 3')
})

test('the decks answers hold are slides among the creations, the newest of each name alone, its first slide on its card, opening beside the task, marked in its task, and Create\'s Presentation asks for one with Slides (D558)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const tasks = await openTasks(page)
  const place = tasks.getByRole('button', { name: 'Creations', exact: true })
  await place.click()
  const creations = page.locator('app-creations'), card = creations.locator('.creation')
  await expect(creations.locator('.creation-start b')).toHaveText(['Presentation', 'Score'])
  // Create, then Presentation: Jean's own Slides in the room, and a request in the box, its example selected for the user's own words.
  await creations.getByRole('button', { name: 'Create', exact: true }).click()
  await creations.locator('.creations-menu:popover-open').getByRole('button', { name: 'Presentation' }).click()
  const box = page.locator('#prompt')
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('Prepare a five-minute talk on the water cycle, as slides I can present.')
  expect(await box.evaluate((/** @type {HTMLTextAreaElement} */ area) => area.value.slice(area.selectionStart, area.selectionEnd))).toBe('a five-minute talk on the water cycle')
  expect(await page.evaluate(async () => (await (await import('/caps/skills/skills.js')).skills()).map((skill) => skill.name))).toEqual(['slides'])
  await page.keyboard.type('a talk on the new oven')
  await page.keyboard.press('Enter')
  await expect(page.locator('.msg-jean app-slides .slide.is-shown')).toHaveCount(1)
  // Written again in its task, as a brain writes a deck whole for each change, it is still one creation, the newest.
  await ask(page, 'Make the slides shorter')
  await expect(page.locator('.msg-jean app-slides')).toHaveCount(2)
  // On its card, named by its first heading, its first slide, without its bar.
  await place.click()
  await expect(card.locator('.creation-open')).toHaveText(['A second oven'])
  await expect(card.locator('.creation-preview .slide.is-shown')).toContainText('A second oven')
  await expect(card.locator('.creation-preview .slides-bar')).toBeHidden()
  // Picked, it opens beside the task, to page through and present, its Markdown for Download.
  await card.locator('.creation-open').click()
  const beside = page.locator('app-preview app-slides')
  await expect(beside.locator('.slides-where')).toHaveText('1 / 3')
  await beside.getByRole('button', { name: 'Next slide' }).click()
  await expect(beside.locator('.slide.is-shown')).toHaveAttribute('aria-label', 'Slide 2 of 3')
  await expect(page.locator('app-preview .pane-head h2')).toHaveText('A second oven.md')
  await expect(creations).toBeVisible()
  // Renamed by a record in its task, another like it asked for in the box, and taken off the page while its answers keep it.
  const menu = async () => { await card.click({ button: 'right' }); return creations.locator('.task-menu:popover-open') }
  await (await menu()).getByRole('button', { name: 'Rename' }).click()
  await page.keyboard.type('Oven talk')
  await page.keyboard.press('Enter')
  await expect(card.locator('.creation-open')).toHaveText(['Oven talk'])
  const decks = () => page.evaluate(async () => (await (await import('/ui/creations.js')).creationsHere()).map((one) => one.name))
  await expect.poll(decks).toEqual(['Oven talk'])
  await (await menu()).getByRole('button', { name: 'Another like this' }).click()
  await expect(box).toHaveValue('Make a presentation like “Oven talk”, but ')
  await box.fill('')
  await (await menu()).getByRole('button', { name: 'Remove from Creations' }).click()
  await expect(page.locator('.toast')).toContainText('“Oven talk” removed from Creations.')
  await expect(card).toHaveCount(0)
  await expect.poll(decks, { timeout: 8000 }).toEqual([])
  await tasks.locator('.history-item').first().click()
  await expect(page.locator('.msg-jean app-slides')).toHaveCount(2)
})
