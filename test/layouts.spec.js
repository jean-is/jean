// Layouts (D215): a comparison in an answer shows its options side by side, the best of each row lit
// and the one recommended framed under its badge; numbered items that start in bold are steps, a
// GitHub alert and a quote that starts with an emoji are notes; a column of amounts lines up at the
// end. Copied, the answer is still the Markdown it was, and rich text with its table, list and quotes.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, nextCopy } from './helpers.js'

test('a comparison, steps and notes are laid out as what they are, and copy as they were', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Compare the phone plans')
  const answer = page.locator('.msg-jean .prose').last()
  const compare = answer.locator('.table.is-compare')
  await expect(compare.locator('th.is-pick')).toHaveText('Orange ★')
  await expect(compare.locator('th.is-pick')).toHaveAttribute('data-pick', 'Recommended')
  // Its frame closes over its head, the head's row being no last row of the table's.
  await expect(compare.locator('th.is-pick')).toHaveCSS('box-shadow', / 0px 2px 0px 0px inset/)
  await expect(compare.locator('th.is-pick')).not.toHaveCSS('box-shadow', / 0px -2px 0px 0px inset/)
  // The best of each row, in bold; the criteria, in bold too, are none.
  await expect(compare.locator('td.is-best')).toHaveText(['€360', '200 GB', 'None'])
  await expect(compare.locator('td.is-yes')).toHaveCount(2)
  await expect(compare.locator('td.is-no')).toHaveCount(1)
  // Each option is a card: its cells on a ground of their own, the criteria on none.
  await expect(compare.locator('td').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(compare.locator('td').nth(1)).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  // Three plans fit the text: the criteria in line with it, the cards' spacing reaching past it, the cards of one width,
  // measured once the answer is written: until then, the table may be drawn again.
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const [text, cards] = await Promise.all([answer.boundingBox(), compare.locator('table').boundingBox()])
  expect(Math.abs((cards?.x ?? 0) + 8 - (text?.x ?? 0))).toBeLessThan(2)
  expect(Math.abs((cards?.width ?? 0) - 16 - (text?.width ?? 0))).toBeLessThan(2)
  const widths = await compare.locator('th').evaluateAll((cells) => cells.slice(1).map((cell) => cell.getBoundingClientRect().width))
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1)
  // While its rows scroll by, its head stays under the bar (D426).
  await expect(compare).toHaveAttribute('data-whole', '')
  await compare.evaluate((box) => window.scrollBy(0, box.getBoundingClientRect().top + 40))
  const [bar, head] = await Promise.all([page.locator('app-shell > .bar').boundingBox(), compare.locator('th.is-pick').boundingBox()])
  expect(Math.abs((head?.y ?? 0) - (bar?.height ?? 0))).toBeLessThan(1)
  // Steps: a title on a line of its own where a colon or a dash follows it, the words that start a sentence in it.
  const steps = answer.locator('ol.steps > li')
  await expect(steps).toHaveCount(3)
  await expect(steps.first().locator('strong')).toHaveCSS('display', 'block')
  await expect(steps.first().locator('.end')).toBeHidden()
  await expect(steps.nth(2).locator('strong')).toHaveCSS('display', 'inline')
  await expect(answer.locator('blockquote.callout.is-warning .callout-title')).toHaveText('Warning')
  await expect(answer.locator('blockquote.callout.is-tip')).toContainText('Tip: ask Orange')
  // A table of records stays a table, its amounts at the end, their heads too.
  await expect(answer.locator('.table:not(.is-compare) .align-right')).toHaveCount(6)
  const copy = await nextCopy(page)
  await page.locator('.msg-jean').last().locator('app-made').getByRole('button', { name: 'Copy' }).click()
  const copied = await copy.read()
  expect(copied['text/plain']).toContain('| | Free | Orange ★ | SFR |')
  expect(copied['text/html']).toMatch(/<td class="is-pick is-best"><strong>€360<\/strong><\/td>/)
  expect(copied['text/html']).toMatch(/Get your number's code<\/strong><span class="end">: <\/span>call 3179/)
})

test('steps written apart, each a paragraph that starts in bold with its number, are one list of steps', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Steps to buy a phone')
  const answer = page.locator('.msg-jean .prose').last()
  // A long answer: its closing words come last.
  await expect(answer.locator(':scope > p').last()).toContainText('If you tell me your budget', { timeout: 20_000 })
  const steps = answer.locator('ol.steps > li')
  await expect(steps).toHaveCount(7)
  await expect(steps.first().locator('strong').first()).toHaveText('Choose new or used.')
  await expect(steps.first().locator('ul > li')).toHaveCount(2)
  // A step whose bold words start a sentence keeps them in it; the closing words stay out of the last step.
  await expect(steps.nth(3).locator('strong')).toHaveCSS('display', 'inline')
  await expect(steps.last().locator('ul > li')).toHaveCount(2)
})

test('a table wider than the text takes the room beside it on a wide screen, centred, and stays in the column on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, "The half year's sales")
  const answer = page.locator('.msg-jean .prose').first()
  await expect(answer).toContainText('The North-East grew fastest.')
  const box = async (/** @type {import('@playwright/test').Locator} */ locator) => /** @type {{ x: number, width: number }} */ (await locator.boundingBox())
  const text = await box(answer)
  const wide = await box(answer.locator('table'))
  expect(wide.width).toBeGreaterThan(text.width + 40)
  expect(Math.abs(wide.x + wide.width / 2 - (text.x + text.width / 2))).toBeLessThan(2)
  await expect(answer.locator('.table')).toHaveAttribute('data-whole', '')
  // On a phone, the table stays in the column and scrolls, its numbers whole, its head with it.
  await page.setViewportSize({ width: 390, height: 800 })
  await expect(page.locator('html')).not.toHaveAttribute('data-sidebar')
  await expect(answer.locator('.table')).not.toHaveAttribute('data-whole')
  const narrow = await box(answer)
  expect(Math.abs((await box(answer.locator('.table'))).width - narrow.width)).toBeLessThan(2)
  expect((await box(answer.locator('table'))).width).toBeGreaterThan(narrow.width)
})

test('a comparison’s options are cards of one width, as wide as the text or, when they say much, the room beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await start(page, 'fr')
  await connectFakeBrain(page)
  await ask(page, "Compare l'iPhone et le Pixel")
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Le Pixel coûte bien moins cher.', { timeout: 20_000 })
  const [text, iphone, pixel] = await Promise.all([answer.boundingBox(), answer.locator('th').nth(1).boundingBox(), answer.locator('th').nth(2).boundingBox()])
  expect(Math.abs((iphone?.width ?? 0) - (pixel?.width ?? 0))).toBeLessThan(1)
  expect((pixel?.x ?? 0) + (pixel?.width ?? 0) - (text?.x ?? 0) - (text?.width ?? 0)).toBeGreaterThan(40)
})

test('in Japanese, a full-width colon ends a step’s title, and a note is titled in Japanese', async ({ page }) => {
  await start(page, 'ja')
  await connectFakeBrain(page)
  await ask(page, '携帯プランを比べて')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer.locator('ol.steps > li').first().locator('.end')).toHaveText('：')
  await expect(answer.locator('blockquote.callout.is-warning .callout-title')).toHaveText('警告')
  await expect(answer.locator('th.is-pick')).toHaveAttribute('data-pick', 'おすすめ')
})

test('a timeline, key figures and a checklist are laid out as what they are, and what is ticked is kept in the conversation (D291)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Plan my Saturday')
  const answer = page.locator('.msg-jean .prose').last()
  // Numbers in bold, each with a few words, make key figures.
  await expect(answer.locator('.figures > li')).toHaveCount(3)
  await expect(answer.locator('.figures strong')).toHaveText(['3', '€45', '12'])
  // Times in bold make a timeline, a range among them; what joins a time to its line is left out.
  const timeline = answer.locator('.timeline')
  await expect(timeline.locator('time')).toHaveText(['08:30', '09:00–10:30', '11:00'])
  await expect(timeline.locator('li > div').first()).toHaveText('Leave home, with the bags')
  // A checklist: what the answer ticked, then the user's ticks, counted on a bar and kept as a meta record.
  const checklist = answer.locator('.checklist')
  await expect(checklist.locator('.checklist-count')).toContainText('1 of 3')
  await expect(checklist.locator('li.is-done')).toHaveText('Cash')
  await checklist.getByRole('checkbox', { name: 'Shopping bags' }).check()
  await expect(checklist.locator('.checklist-count')).toContainText('2 of 3')
  await expect(checklist.locator('progress')).toHaveJSProperty('value', 2)
  await checklist.getByRole('checkbox', { name: 'Cash' }).uncheck()
  await expect(checklist.locator('li.is-done')).toHaveText('Shopping bags')
  const ticks = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const path = /** @type {any} */ (app.current.peek()).path
    return (await app.fs.read(path)).trim().split('\n').map((line) => JSON.parse(line).meta?.ticks).filter(Boolean)
  })
  expect(ticks.at(-1)).toEqual({ list: 'Shopping bags\nCash\nThe list', done: [0] })
})

