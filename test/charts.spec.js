// Charts (D196): a skill from Jean's own directory, read in Settings and added, declares ```echarts
// blocks; from then on they are widgets in the conversation, drawn by ECharts, copied as their
// source and their picture at once, and as a picture when the answer is copied. Until a skill of
// the room declares them, they stay code. While an answer writes one, it is drawn as far as it goes.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, turnOn, openSettings, nextCopy } from './helpers.js'

test('a chart is code until a skill declares it, then drawn in the answer, and copied with it as a picture', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Chart the croissants sold this week')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer.locator('pre code')).toContainText('"type":"bar"')
  await expect(answer.locator('app-chart')).toHaveCount(0)

  // The directory, in Settings › Skills: a tile for each skill not added yet, read before it is.
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  const tiles = knows.locator('.ready-made .service')
  await expect(tiles).toHaveCount(21)
  await tiles.filter({ hasText: 'Bars, lines, pies' }).click()
  const ready = page.locator('app-skill-ready dialog[open]')
  await expect(ready).toContainText('Bars, lines, pies and more, drawn in answers')
  await expect(ready).not.toContainText('From ')
  await expect(ready.locator('.skill-steps')).toContainText('fenced code block tagged')
  await ready.locator('.button.primary').click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Chart”.')
  await expect(knows.locator('.list summary', { hasText: 'Chart' })).toContainText('Bars, lines, pies and more')
  await expect(tiles).toHaveCount(20)
  const steps = await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('skills/chart/SKILL.md'))
  expect(steps).toContain('  blocks: echarts\n')
  expect(steps).toContain('  title-fr: Graphique\n')
  expect(steps).not.toContain('source:')
  await page.keyboard.press('Escape')

  // The answer already given is drawn now.
  const chart = answer.locator('app-chart')
  await expect(chart.locator('.chart canvas').first()).toBeVisible()
  await expect(chart.locator('.chart')).toHaveAttribute('aria-label', 'Croissants sold')
  // Copy: the block's source as text and the chart as a picture, at once.
  const copy = await nextCopy(page)
  await chart.getByRole('button', { name: 'Copy' }).click()
  const copied = await copy.read()
  expect(copied['text/plain']).toBe(await chart.getAttribute('source'))
  expect(copied['image/png']).toEqual([137, 80, 78, 71])
  await expect(page.locator('.toast')).toContainText('Copied')
  await expect(chart.getByRole('button', { name: 'Save as picture' })).toHaveCount(0)
  // Printed, the chart shows without its Copy.
  await page.emulateMedia({ media: 'print' })
  await expect(chart.locator('.drawn-foot')).toBeHidden()
  await expect(chart.locator('.chart canvas').first()).toBeVisible()
  await page.emulateMedia({ media: 'screen' })

  // Copying the answer: its Markdown as text, and as rich text with the chart as its picture.
  const whole = await nextCopy(page)
  await page.locator('.msg-jean').last().locator('app-made').getByRole('button', { name: 'Copy' }).click()
  const answerCopied = await whole.read()
  expect(answerCopied['text/plain']).toContain('```echarts\n{"title":{"text":"Croissants sold"}')
  expect(answerCopied['text/html']).toMatch(/<img [^>]*src="data:image\/png;base64,iVBORw0KGgo[^"]+"[^>]*alt="Croissants sold"/)
  expect(answerCopied['text/html']).toContain('Tuesday sold the most.')
  expect(answerCopied['text/html']).not.toContain('app-chart')
  await expect(page.locator('.toast')).toContainText('If its pictures don’t paste, copy each one with its own Copy.')

  // Deleting the skill takes the widget away: the block is code again.
  const knowsAgain = await openSettings(page, 'Skills')
  page.once('dialog', (dialog) => dialog.accept())
  await knowsAgain.locator('.list summary', { hasText: 'Chart' }).click()
  await knowsAgain.getByRole('button', { name: 'Delete' }).click()
  await expect(knowsAgain.locator('.ready-made .service')).toHaveCount(21)
  await page.keyboard.press('Escape')
  await expect(answer.locator('app-chart')).toHaveCount(0)
  await expect(answer.locator('pre code')).toContainText('"type":"bar"')
})

test('Copy puts the chart’s source and its picture on the clipboard itself, and the answer’s rich text holds the picture', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium lets a test read the clipboard')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    await app.fs.write('skills/chart/SKILL.md', '---\nname: chart\ndescription: Draw charts.\nmetadata:\n  blocks: echarts\n---\n# Chart\n')
    await (await import('/ui/caps.js')).unlock('skills')
    await (await import('/caps/skills/skills.js')).redeclare()
  })
  await ask(page, 'Chart the croissants sold this week')
  const chart = page.locator('.msg-jean app-chart')
  await expect(chart.locator('.chart canvas').first()).toBeVisible()
  await chart.getByRole('button', { name: 'Copy' }).click()
  await expect(page.locator('.toast')).toContainText('Copied')
  const held = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    return { types: [...item.types].sort(), text: await (await item.getType('text/plain')).text(), size: (await item.getType('image/png')).size }
  })
  expect(held.types).toEqual(['image/png', 'text/plain'])
  expect(held.text).toContain('"Croissants sold"')
  expect(held.size).toBeGreaterThan(1000)

  // The answer: its Markdown, and rich text whose picture survives the browser's own cleaning.
  await page.locator('.msg-jean').last().locator('app-made').getByRole('button', { name: 'Copy' }).click()
  await expect.poll(() => page.evaluate(async () => [...(await navigator.clipboard.read())[0].types].sort())).toEqual(['text/html', 'text/plain'])
  const rich = await page.evaluate(async () => (await (await navigator.clipboard.read())[0].getType('text/html')).text())
  expect(rich).toMatch(/<img [^>]*src="data:image\/png;base64,/)
})

test('while its block is written, the chart is drawn as far as it goes, then to its end on the same chart', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    await app.fs.write('skills/chart/SKILL.md', '---\nname: chart\ndescription: Draw charts.\nmetadata:\n  blocks: echarts\n---\n# Chart\n')
    const { unlock } = await import('/ui/caps.js')
    await unlock('skills')
    await (await import('/caps/skills/skills.js')).redeclare()
    await unlock('charts')
  })
  // An answer as the brain writes it, drawn again in the same place as more of it comes.
  const write = (/** @type {string} */ text) => page.evaluate(async (text) => {
    const [{ render }, { markdown }] = await Promise.all([import('lit-html'), import('/ui/markdown.js')])
    const answer = document.querySelector('#written') ?? document.body.appendChild(Object.assign(document.createElement('article'), { id: 'written', className: 'msg msg-jean is-streaming' }))
    render(markdown(text, undefined, true), answer)
  }, text)
  const block = '```echarts\n{"title":{"text":"Croissants sold"},"xAxis":{"type":"category","data":["Mon","Tue","Wed"]},"yAxis":{"type":"value"},"series":[{"name":"Croissants","type":"bar","data":[120,1250.5,90]}]}\n```'
  const answer = page.locator('#written')
  const chart = answer.locator('app-chart')
  const drawn = () => chart.evaluate((element) => /** @type {any} */ (element).option?.series[0].data)

  // A fence still on its first line shows nothing yet, not an empty block of code.
  await write('Here are the sales:\n\n```echar')
  await expect(answer).toContainText('Here are the sales:')
  await expect(answer.locator('pre, app-chart')).toHaveCount(0)
  await write(`Here are the sales:\n\n${block.slice(0, block.indexOf('"series"'))}`)
  await expect(chart).toHaveAttribute('open', '')
  await expect(chart.locator('.while')).toHaveText('Drawing the chart…')
  // Cut in the middle of 1250.5: what is whole is drawn, and the half-written number isn't.
  await write(`Here are the sales:\n\n${block.slice(0, block.indexOf('1250') + 2)}`)
  await expect(chart.locator('.chart canvas').first()).toBeVisible()
  expect(await drawn()).toEqual([120])
  await chart.evaluate((element) => { /** @type {any} */ (window).first = /** @type {any} */ (element).chart })
  await write(`Here are the sales:\n\n${block}\n\nTuesday sold the most.`)
  await expect(chart).not.toHaveAttribute('open')
  expect(await drawn()).toEqual([120, 1250.5, 90])
  expect(await chart.evaluate((element) => /** @type {any} */ (element).chart === /** @type {any} */ (window).first)).toBe(true)
})
