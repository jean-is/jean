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

  // The directory, in Settings › Skills' Add a skill, past Visual answers, the room's from its first message: a tile for each of
  // Jean's own, read on its page before it is added.
  await turnOn(page, 'Skills')
  await page.keyboard.press('Escape')
  const knows = await openSettings(page, 'Skills')
  await expect(knows.locator('.skills .item', { hasText: 'Visual answers' })).toHaveCount(1)
  await knows.getByRole('button', { name: 'Add a skill' }).click()
  const tiles = knows.locator('.ready-made .service')
  await expect(tiles).toHaveCount(22)
  await tiles.filter({ hasText: 'Bars, lines, pies' }).click()
  await expect(page).toHaveURL(/\/settings\/skills\/add\/chart$/)
  await expect(knows.locator('.skill-head h2')).toBeFocused()
  await expect(knows).toContainText('Bars, lines, pies and more, drawn in answers')
  await expect(knows.locator('.skill-head .lede')).toHaveText('Ready-made')
  await expect(knows.locator('.skill-steps')).toContainText('fenced code block tagged')
  await knows.getByRole('button', { name: 'Add this skill' }).click()
  await expect(page.locator('.toast')).toContainText('Added the skill “Chart”.')
  // Then its own page: added by the user, its switch on, and no Delete: one of Jean's own is turned off instead.
  await expect(page).toHaveURL(/\/settings\/skills\/chart$/)
  await expect(knows.locator('.skill-head .lede')).toContainText('Ready-made · added on')
  await expect(knows.getByRole('switch', { name: 'Chart' })).toBeChecked()
  await expect(knows.getByRole('button', { name: 'Delete this skill' })).toHaveCount(0)
  await knows.locator('.back').click()
  await expect(knows.locator('.skills .item', { hasText: 'Chart' })).toContainText('Bars, lines, pies and more')
  await expect(knows.locator('.skills .item', { hasText: 'Chart' })).toBeFocused()
  await knows.getByRole('button', { name: 'Ready-made skills' }).click()
  await expect(tiles).toHaveCount(22)
  await expect(tiles.filter({ hasText: 'Bars, lines, pies' })).toContainText('Added')
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

  // Turning the skill off takes the widget away: the block is code again, and the skill stays, Off.
  const knowsAgain = await openSettings(page, 'Skills')
  await knowsAgain.locator('.skills .item', { hasText: 'Chart' }).click()
  await knowsAgain.getByRole('switch', { name: 'Chart' }).uncheck()
  await knowsAgain.locator('.back').click()
  await expect(knowsAgain.locator('.skills .item', { hasText: 'Chart' }).locator('.skill-from')).toHaveText('Off')
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

test('a word of two directions reads from its first letter, on a canvas, in its picture and on a slide, where the chart’s left-to-right box alone flips it', async ({ page }) => {
  await start(page, 'ar')
  const chart = (/** @type {string} */ id, /** @type {boolean} */ svg, /** @type {object} */ option) => page.evaluate(async ([id, svg, source]) => {
    await (await import('/ui/caps.js')).unlock('charts')
    const chart = Object.assign(document.createElement('app-chart'), { id })
    if (svg) chart.setAttribute('svg', '')
    chart.setAttribute('source', source)
    chart.style.cssText = 'display: block; position: fixed; inset: 0; z-index: 9'
    document.body.append(chart)
  }, /** @type {[string, boolean, string]} */ ([id, svg, JSON.stringify(option)]))

  // In SVG, a slide's: what stands in each word, left to right, by Range, which tells the truth in both engines.
  const words = /** @type {[string, ...string[]][]} */ ([['30 يومًا من الخبز', 'الخبز', '30'], ['الثالث Q3', 'Q3', 'الثالث'], ['خبز 40٪', '٪', '40', 'خبز'], ['فرن (2)', ')', '2', '(', 'فرن'], ['الربع 1', '1', 'الربع'], ['Q3 الثالث', 'Q3', 'الثالث'], ['30日の売上 Q3', '30', '売上', 'Q3']])
  await chart('slide', true, { title: { text: words[0][0] }, xAxis: { data: words.slice(1).map(([word]) => word), axisLabel: { interval: 0 } }, yAxis: {}, series: [{ type: 'bar', data: [1, 2, 3, 4, 5, 6] }] })
  const texts = page.locator('#slide svg text')
  await expect(texts.filter({ hasText: words[0][0] })).toBeVisible()
  for (const [word, ...parts] of words) {
    // Polled: WebKit's rects are all zero until its first layout.
    await expect.poll(() => texts.filter({ hasText: word }).first().evaluate((text, parts) => {
      const range = document.createRange(), node = /** @type {Text} */ (text.firstChild)
      return parts.map((part) => {
        range.setStart(node, node.data.indexOf(part))
        range.setEnd(node, node.data.indexOf(part) + part.length)
        const { left, width } = range.getBoundingClientRect()
        return { part, left, width }
      }).filter(({ width }) => width).sort((a, b) => a.left - b.left).map(({ part }) => part)
    }, parts), word).toEqual(parts)
  }

  // On a canvas, which has no Range: the side of the word its weight is on, the digits or the Latin far heavier than one letter of Arabic.
  await chart('answer', false, { series: [{ type: 'pie', data: [] }] })
  const side = (/** @type {string} */ word, /** @type {boolean} */ picture) => page.locator('#answer').evaluate(async (chart, [word, picture]) => {
    const option = JSON.stringify({ title: { text: word, left: 'center', top: 0 }, series: [{ type: 'pie', data: [] }] })
    if (chart.getAttribute('source') !== option) chart.setAttribute('source', option)
    await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)))
    /** @type {any} */
    let canvas = chart.querySelector('canvas')
    if (picture) {
      const drawn = await createImageBitmap(await /** @type {any} */ (chart).picture())
      canvas = Object.assign(document.createElement('canvas'), { width: drawn.width, height: drawn.height })
      canvas.getContext('2d').drawImage(drawn, 0, 0)
    }
    const { width } = canvas, seen = canvas.getContext('2d').getImageData(0, 0, width, canvas.height * 40 / chart.querySelector('.chart').clientHeight).data
    let first = width, last = 0, sum = 0, ink = 0
    for (let i = 0; i < seen.length; i += 4) {
      if (seen[i] > 127 || seen[i + 3] < 64) continue
      const x = (i / 4) % width
      first = Math.min(first, x)
      last = Math.max(last, x)
      sum += x
      ink++
    }
    return sum / ink > (first + last) / 2 ? 'right' : 'left'
  }, /** @type {[string, boolean]} */ ([word, picture]))
  for (const picture of [false, true]) {
    await expect.poll(() => side('88888 ا', picture), 'digits first').toBe('right')
    await expect.poll(() => side('ا WWWWWW', picture), 'Arabic, then Latin').toBe('left')
    await expect.poll(() => side('WWWWWW ا', picture), 'Latin, then Arabic').toBe('left')
  }
})

test('beside a chart, its numbers open as a table, a column for each series and its categories as row heads', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('charts'))
  await page.evaluate(() => {
    const chart = document.createElement('app-chart')
    chart.setAttribute('source', JSON.stringify({ title: { text: 'Sold' }, xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: { type: 'value' }, series: [{ name: 'Bread', type: 'bar', data: [3, 5] }, { name: 'Cakes', type: 'bar', data: [2, 4] }] }))
    document.querySelector('main')?.append(chart)
  })
  const data = page.locator('app-chart .chart-data')
  await data.locator('summary').click()
  await expect(data.locator('thead th[scope="col"]')).toHaveText(['Bread', 'Cakes'])
  await expect(data.locator('tbody th[scope="row"]')).toHaveText(['Mon', 'Tue'])
  await expect(data.locator('tbody tr').first().locator('td')).toHaveText(['3', '2'])
})
