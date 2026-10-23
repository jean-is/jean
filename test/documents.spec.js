// Documents (D485), in Chromium and WebKit: a Markdown file Jean keeps, open in the preview in its
// editor, ProseMirror in Jean's own document under its very policy, its Markdown written back byte for byte,
// what the brain hears of it, what an answer draws drawn in place, Jean's changes with Accept and Reject,
// the "/" menu, the bubble over a selection, blocks selected, moved and turned from the margin, their grip
// and its menu, a list's items as blocks, Japanese composition, Arabic, paste from Word and Google Docs read
// in a small sealed frame, the keys, Jean's theme, what a screen reader reads, focus, the clipboard and drag
// and drop, a phone; and Documents found as Jean writes a document again, then made and changed by the
// brain's own tools, and found again from another task, with @ in the box and by the brain, which reads one
// before it changes it.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start as begin, connectFakeBrain, ask, answered, openTasks, SHARE_URL } from './helpers.js'

const fixture = (/** @type {string} */ name) => readFile(new URL(`fixtures/editor/${name}`, import.meta.url), 'utf8')
const sample = () => fixture('jean-answer.md')
const PATH = 'documents/01JAQXDOC0000000000000000A-notes.md'

/** The editor on show, for the tests: its view and its Markdown, from Documents' own module. @param {import('@playwright/test').Page} page */
const reach = (page) => page.evaluate(async () => {
  const documents = await import('/caps/documents/documents.js')
  Object.defineProperty(globalThis, 'editor', { configurable: true, get: () => documents.shown?.editor })
})

/**
 * Jean in a language, Documents found, and a document open beside the conversation, once the file is open.
 * What its policy refuses, and what throws, is kept as `problems`, which the tests want empty.
 * @param {import('@playwright/test').Page} page @param {{ lang?: string, markdown?: string }} [options]
 */
async function start(page, { lang = 'en', markdown } = {}) {
  const text = markdown ?? await sample()
  await page.addInitScript(() => {
    const problems = /** @type {string[]} */ ((/** @type {any} */ (globalThis).problems = []))
    document.addEventListener('securitypolicyviolation', (event) => problems.push(`${event.violatedDirective} ${event.blockedURI}`))
    addEventListener('error', (event) => problems.push(event.message))
  })
  // On a phone, the box doesn't take the keyboard at first, and English is the browser's language.
  if (lang !== 'en' || (page.viewportSize()?.width ?? 0) >= 600) await begin(page, lang)
  else {
    await page.goto('./')
    await expect(page.locator('.hero-question')).toBeVisible()
  }
  await page.evaluate(async ({ md, path }) => {
    const { app } = await import('/ui/state.js')
    await (await import('/ui/caps.js')).unlock('documents')
    await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: notes\nauthor: jean\n---\n${md}`)
    ;(await import('/ui/preview.js')).preview({ uri: path, name: 'notes.md', mimeType: 'text/markdown' })
  }, { md: text, path: PATH })
  await expect(page.locator('#doc')).toBeAttached()
  await reach(page)
  await expect.poll(() => markdownOf(page)).toBe(text)
  return { doc: page.locator('#doc') }
}

/** @param {import('@playwright/test').Page} page @returns {Promise<string[]>} */
const problems = (page) => page.evaluate(() => /** @type {any} */ (globalThis).problems)
/** @param {import('@playwright/test').Page} page @returns {Promise<string>} */
const markdownOf = (page) => page.evaluate(() => /** @type {any} */ (globalThis).editor.markdown())
/** What the file holds, but for its front matter. @param {import('@playwright/test').Page} page @param {string} [path] */
const saved = (page, path = PATH) => page.evaluate(async (at) => {
  const { app } = await import('/ui/state.js')
  return (await app.fs.read(`${app.projectDir}/${at}`))?.replace(/^---\n[\s\S]*?\n---\n/, '') ?? null
}, path)
/** What the brain reads with the next message of the document on show. @param {import('@playwright/test').Page} page */
const told = (page) => page.evaluate(async () => (await import('/ui/caps.js')).slots('modes').flatMap((mode) => mode.notes?.([]) ?? [])
  .find((note) => note.update?.sessionUpdate === '_system_note' && note.update.data.kind === 'document')?.update?.text ?? '')
/** A selection in the document: from some text, `offset` on, `length` long. @param {import('@playwright/test').Page} page @param {string} text @param {number} [offset] @param {number} [length] */
const place = (page, text, offset = 0, length = 0) => page.evaluate(async ([t, o, l]) => {
  const { TextSelection } = await import('#prosemirror')
  const { view } = /** @type {any} */ (globalThis).editor
  let at = -1
  view.state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => {
    const i = node.isText ? node.text.indexOf(t) : -1
    if (i >= 0 && at < 0) at = pos + i
    return at < 0
  })
  view.focus()
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at + Number(o), at + Number(o) + Number(l))))
  // The keyboard reaches the document a moment after it takes the focus from Jean's box.
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)))
}, /** @type {const} */ ([text, offset, length]))
/** @param {import('@playwright/test').Page} page @param {string} text @param {number} [offset] */
const caretAt = (page, text, offset = 0) => place(page, text, offset)
/** @param {import('@playwright/test').Page} page @param {string} text */
const selectText = (page, text) => place(page, text, 0, text.length)
/** The caret at a place of the document. @param {import('@playwright/test').Page} page @param {number} pos */
const at = (page, pos) => page.evaluate(async (p) => {
  const { TextSelection } = await import('#prosemirror')
  const { view } = /** @type {any} */ (globalThis).editor
  view.focus()
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, p)))
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)))
}, pos)
/** @param {import('@playwright/test').Page} page */
const selection = (page) => page.evaluate(async () => {
  // ProseMirror reads the browser's selection when it changes, a moment after a key.
  await new Promise((resolve) => setTimeout(resolve, 50))
  const { from, to } = /** @type {any} */ (globalThis).editor.view.state.selection
  return { from, to }
})
/** @param {import('@playwright/test').Page} page */
const kindOf = (page) => page.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.selection.toJSON().type)
/** Jean's suggestion of a new version, as its brain's suggest tool makes it. @param {import('@playwright/test').Page} page @param {string} markdown */
const suggest = (page, markdown, notes = /** @type {string[]} */ ([])) => page.evaluate(([text, words]) => /** @type {any} */ (globalThis).editor.suggest(text, words), /** @type {const} */ ([markdown, notes]))

test.describe('in Jean\'s own document', () => {
  test('the whole editor runs under Jean\'s policy: no frame, no policy of its own, no style attribute', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'One two three.\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n' })
    await expect(page.locator('app-preview iframe')).toHaveCount(0)
    expect(await doc.locator('td').nth(1).evaluate((td) => getComputedStyle(td).textAlign)).toBe('right')
    await selectText(page, 'two')
    await page.keyboard.press('ControlOrMeta+b')
    await selectText(page, 'three')
    await page.getByRole('toolbar', { name: 'Format' }).getByRole('button', { name: 'Italic' }).click()
    await at(page, await page.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.doc.firstChild.nodeSize - 1))
    await page.keyboard.press('Enter')
    await page.keyboard.type('/hea')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Plan')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Backspace')
    expect(await markdownOf(page)).toBe('One **two** *three*.\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n')
    await suggest(page, 'One **two** *three*, changed.\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n')
    await expect(doc.locator('.suggest-new')).toHaveText(', changed')
    await doc.locator('.suggest-accept').click()
    expect(await markdownOf(page)).toBe('One **two** *three*, changed.\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n')
    expect(await problems(page)).toEqual([])
  })

  test('the brain reads the document, what is selected in it, and ⌘S saves at once', async ({ page }) => {
    await start(page)
    expect(await told(page)).toContain('The document notes (documents/01JAQXDOC0000000000000000A-notes.md) is open beside the conversation. It reads:\n\n# Team offsite')
    await selectText(page, 'three files')
    await expect.poll(() => told(page)).toContain('Selected in notes:\n\n**three files**')
    await caretAt(page, 'three files')
    await expect.poll(() => told(page)).not.toContain('Selected in')
    // ⌘S saves at once, and never opens the browser's own Save dialog, nor Jean's copy of the task.
    await caretAt(page, 'Questions?')
    await page.keyboard.type('Any ')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => saved(page)).toContain('Any Questions?')
  })
})

test.describe('Markdown', () => {
  test('a file opened and saved untouched is the same file, and an edit changes only its line', async ({ page }) => {
    const text = await sample()
    const { doc } = await start(page)
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the week')
    await expect(doc.locator('table th')).toHaveCount(3)
    await expect(doc.locator('li[data-checked="true"] input[type=checkbox]')).toBeChecked()
    await caretAt(page, 'Keep receipts')
    await page.keyboard.type('Please: ')
    // Saved through Jean's storage, its front matter kept.
    await expect.poll(() => saved(page)).toContain('> Please: Keep receipts')
    const lines = /** @type {string} */ (await saved(page)).split('\n')
    const was = text.split('\n')
    expect(lines.filter((line, i) => line !== was[i])).toEqual(['> Please: Keep receipts: the finance team needs them by the 15th, and costs over 50 € need a reason.'])
    expect(await page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return (await app.fs.read(`${app.projectDir}/${path}`))?.split('\n').slice(0, 4) }, PATH)).toEqual(['---', 'format: 1', 'name: notes', 'author: jean'])
  })

  test('a task ticked in the document is ticked in the file', async ({ page }) => {
    const { doc } = await start(page)
    await doc.locator('li', { hasText: 'Train tickets' }).getByRole('checkbox', { name: 'Done' }).check()
    await expect.poll(() => saved(page)).toContain('- [x] Train tickets')
    await expect(doc.locator('li', { hasText: 'Train tickets' })).toHaveAttribute('data-checked', 'true')
  })

  test('what was typed last is saved when the preview closes at once', async ({ page }) => {
    await start(page, { markdown: 'One line.\n' })
    await caretAt(page, 'One line.', 9)
    await page.keyboard.type(' Two')
    await page.locator('app-preview .pane-head button').last().click()
    await expect(page.locator('#doc')).toHaveCount(0)
    await expect.poll(() => saved(page)).toBe('One line. Two\n')
  })
})

test.describe('suggestions', () => {
  test('Jean\'s changes show where they are, Jean\'s version with its words, accepted or rejected one by one (D505)', async ({ page }) => {
    const text = await sample()
    const { doc } = await start(page)
    expect(await suggest(page, text.replace('plan for the week', 'plan for the fortnight').replace('## Schedule\n', '## Schedule\n\nA line Jean adds.\n'), ['A longer stay', 'A line on the schedule']))
      .toBe('Shown as 2 changes for the person to accept or reject.')
    const review = page.getByRole('region', { name: 'Suggested changes' })
    await expect(review).toContainText('2 changes suggested by Jean')
    // Jean's version where each change is: a line changed, the words it changes tinted, Jean's own words under it; a line added, as new.
    const heading = doc.locator('.suggest.is-changed')
    await expect(heading.locator(':scope > h1')).toHaveText('Team offsite: plan for the fortnight')
    await expect(heading.locator('.suggest-new')).toHaveText('fortnight')
    await expect(heading.locator('.suggest-why')).toHaveText('A longer stay')
    await expect(doc.locator('.suggest.is-added p')).toHaveText('A line Jean adds.')
    await expect(doc.locator('.suggest.is-added .suggest-tag')).toHaveText('New')
    // The person's line it would replace is hidden, and shows under Before.
    await expect(doc.locator('h1.suggest-old')).toBeHidden()
    await heading.getByRole('button', { name: 'Before' }).click()
    await expect(heading.locator('.suggest-was')).toHaveText('Team offsite: plan for the week')
    // Nothing of a suggestion is in the file until it is accepted.
    expect(await markdownOf(page)).toBe(text)
    await heading.getByRole('button', { name: 'Accept' }).click()
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the fortnight')
    await expect(review).toContainText('A change suggested by Jean')
    // ⌘Z undoes a change accepted, as any edit.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the week')
    await doc.locator('.suggest.is-added').getByRole('button', { name: 'Reject' }).click()
    await expect(review).toBeHidden()
    expect(await markdownOf(page)).toBe(text)
    await expect.poll(() => told(page)).toContain('Of the changes suggested to notes, the user accepted 1 and rejected 1.')
  })

  test('the bar\'s arrows take the keyboard from one change to the next, Accept takes it on to the next, and Accept all takes the rest', async ({ page }) => {
    const text = await sample()
    const { doc } = await start(page)
    await suggest(page, text.replace('19:30', '20:00').replace('| Tuesday | 860 € |', '| Tuesday | 900 € |').replace('- [ ] Train tickets', '- [x] Train tickets'))
    const changes = doc.locator('.suggest')
    await expect(changes).toHaveCount(3)
    const review = page.getByRole('region', { name: 'Suggested changes' })
    await review.getByRole('button', { name: 'Next change' }).click()
    await expect(changes.nth(0).getByRole('button', { name: 'Accept' })).toBeFocused()
    await expect(review).toContainText('Change 1 of 3')
    await review.getByRole('button', { name: 'Next change' }).click()
    await expect(changes.nth(1).getByRole('button', { name: 'Accept' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(changes).toHaveCount(2)
    await expect(changes.nth(1).getByRole('button', { name: 'Accept' })).toBeFocused()
    await review.getByRole('button', { name: 'Accept all' }).click()
    await expect(changes).toHaveCount(0)
    const accepted = await markdownOf(page)
    expect(accepted).toContain('dinner at 20:00')
    expect(accepted).toContain('| Tuesday | 900 € | Malik |')
    expect(accepted).toContain('- [x] Train tickets')
  })

  test('the changes left to decide stay, with Jean\'s words, when the document closes and opens again, and nothing is left beside it once they are decided', async ({ page }) => {
    const text = await sample()
    const { doc } = await start(page)
    await suggest(page, text.replace('plan for the week', 'plan for the fortnight').replace('dinner at 19:30', 'dinner at 20:00'), ['A longer stay', 'A later dinner'])
    await doc.locator('.suggest').first().getByRole('button', { name: 'Accept' }).click()
    await expect(doc.locator('.suggest')).toHaveCount(1)
    await page.locator('app-preview').getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('#doc')).toHaveCount(0)
    await page.evaluate((path) => import('/ui/preview.js').then(({ preview }) => preview({ uri: path, name: 'notes.md', mimeType: 'text/markdown' })), PATH)
    await expect(page.locator('#doc .suggest')).toHaveCount(1)
    await expect(page.locator('#doc .suggest-why')).toHaveText('A later dinner')
    await expect(page.locator('#doc h1')).toHaveText('Team offsite: plan for the fortnight')
    await page.locator('#doc .suggest').getByRole('button', { name: 'Reject' }).click()
    await expect.poll(() => page.evaluate(async (path) => {
      const { app } = await import('/ui/state.js')
      return app.fs.exists(`${app.projectDir}/${path.replace('documents/', 'documents/.suggested/').replace(/\.md$/, '.json')}`)
    }, PATH)).toBe(false)
  })
})

test.describe('what an answer draws', () => {
  const SHAPES = '# Plan\n\nIntro.\n\n1. **Choose** the venue: by Monday.\n2. **Book** the train: for twelve.\n\n| | Lyon ★ | Lille |\n| --- | --- | --- |\n| Price | **€120** | €180 |\n| Time | 2 h | 1 h |\n\n'
    + '| Item | Cost |\n| --- | --- |\n| Rooms | 1,200 € |\n| Food | 300 € |\n\n> [!TIP]\n> Book early.\n\nA formula $x^2$ in a line.\n\nLast.\n'

  test('steps, a comparison, a note and a formula, as an answer draws them, and amounts at a column\'s end; their text once the caret is in them', async ({ page }) => {
    const { doc } = await start(page, { markdown: SHAPES })
    await expect(doc.locator('.drawn-form ol.steps > li')).toHaveCount(2)
    await expect(doc.locator('.drawn-form .table.is-compare')).toBeVisible()
    await expect(doc.locator('.drawn-form blockquote.callout.is-tip')).toBeVisible()
    await expect(doc.locator('.drawn-formula app-math')).toBeVisible()
    await expect(doc.locator('code.math')).toBeHidden()
    expect(await doc.locator('.tableWrapper').nth(1).locator('td').nth(1).evaluate((td) => getComputedStyle(td).textAlign)).toBe('right')
    // A click on the steps: their text, to change, then drawn again with the change once the caret leaves.
    await doc.locator('.drawn-form ol.steps').click()
    await expect(doc.locator('.drawn-form ol.steps')).toBeHidden()
    await expect(doc.locator('.drawn.is-editing > ol > li')).toHaveCount(2)
    expect(await page.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.selection.$head.parent.textContent)).toBe('Choose the venue: by Monday.')
    await caretAt(page, 'by Monday.', 10)
    await page.keyboard.type(' Soon.')
    await caretAt(page, 'Last.')
    await expect(doc.locator('.drawn-form ol.steps > li').first()).toContainText('by Monday. Soon.')
    expect(await markdownOf(page)).toBe(SHAPES.replace('by Monday.', 'by Monday. Soon.'))
    // The arrows go into a block drawn, from the line before it.
    await caretAt(page, 'Intro.', 6)
    await page.keyboard.press('ArrowDown')
    await expect(doc.locator('.drawn.is-editing > ol')).toBeVisible()
    expect(await page.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.selection.$head.parent.textContent)).toContain('Choose')
    // A click on the formula: its text.
    await doc.locator('.drawn-formula').click()
    await expect(doc.locator('code.math')).toHaveText('x^2')
    expect(await problems(page)).toEqual([])
  })

  test('a diagram, and a chart once a skill of the room writes charts', async ({ page }) => {
    const md = 'Intro.\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n```echarts\n{"xAxis":{"type":"category","data":["a","b"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}\n```\n\nLast.\n'
    const { doc } = await start(page, { markdown: md })
    await expect(doc.locator('.drawn.is-drawn .drawn-form svg').first()).toBeVisible()
    await expect(doc.locator('pre', { hasText: 'xAxis' })).toBeVisible()
    await page.evaluate(async () => { (await import('/ui/markdown.js')).declared.value = new Set(['echarts']) })
    await expect(doc.locator('.drawn-form app-chart')).toBeVisible()
    await expect(doc.locator('pre', { hasText: 'xAxis' })).toBeHidden()
    expect(await problems(page)).toEqual([])
  })

  test('a score and a diagram as tall as in an answer, with no room under them', async ({ page }) => {
    const blocks = '```abc\nX:1\nT:Scale\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |\n```\n\n```mermaid\ngraph LR\n  A --> B\n```\n'
    const { doc } = await start(page, { markdown: `Intro.\n\n${blocks}\nLast.\n` })
    await page.evaluate(async () => { (await import('/ui/markdown.js')).declared.value = new Set(['abc']) })
    await expect(doc.locator('.drawn-form app-score svg').first()).toBeVisible()
    await expect(doc.locator('.drawn-form figure svg').first()).toBeVisible()
    // The same blocks drawn by Jean's own renderer, as an answer is, as wide.
    await page.evaluate(async (text) => {
      const [{ markdown }, { render }] = await Promise.all([import('/ui/markdown.js'), import('lit-html')])
      const answer = Object.assign(document.createElement('div'), { className: 'prose answer-like' })
      answer.style.inlineSize = `${document.querySelector('#doc .drawn-form')?.clientWidth}px`
      document.body.append(answer)
      render(markdown(text), answer)
    }, blocks)
    await expect(page.locator('.answer-like app-score svg').first()).toBeVisible()
    await expect(page.locator('.answer-like figure svg').first()).toBeVisible()
    for (const widget of ['app-score', 'figure']) {
      const [inDocument, inAnswer] = await Promise.all([doc.locator(`.drawn-form ${widget}`).first(), page.locator(`.answer-like ${widget}`).first()].map(async (one) => (await one.boundingBox())?.height ?? 0))
      expect(Math.abs(inDocument - inAnswer), widget).toBeLessThan(2)
    }
  })

  test('Jean\'s changes draw it too: a chart changed, drawn as Jean would have it and as it is under Before; blocks added together one change, a block taken away another', async ({ page }) => {
    const chart = (/** @type {number} */ tuesday) => '```echarts\n' + JSON.stringify({ xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [120, tuesday] }] }) + '\n```'
    const md = `Intro.\n\n${chart(200)}\n\nMiddle.\n\n\`\`\`mermaid\ngraph LR\n  A --> B\n\`\`\`\n\nLast.\n`
    const { doc } = await start(page, { markdown: md })
    await page.evaluate(async () => { (await import('/ui/markdown.js')).declared.value = new Set(['echarts']) })
    await expect(doc.locator('.drawn-form app-chart')).toBeVisible()
    const drawn = (/** @type {import('@playwright/test').Locator} */ where) => where.locator('app-chart :is(canvas, svg), .diagram svg, figure svg').first()
    // A chart's numbers changed: Jean's version drawn, the chart as it is under Before, with Accept and Reject.
    await suggest(page, md.replace(chart(200), chart(340)))
    const change = doc.locator('.suggest.is-changed')
    await expect(drawn(change)).toBeVisible()
    await expect(doc.locator('pre', { hasText: 'xAxis' })).toBeHidden()
    await change.getByRole('button', { name: 'Before' }).click()
    await expect(drawn(change.locator('.suggest-was'))).toBeVisible()
    await change.getByRole('button', { name: 'Accept' }).click()
    await expect(doc.locator('.suggest')).toHaveCount(0)
    expect(await markdownOf(page)).toBe(md.replace(chart(200), chart(340)))
    // Accepted, it is drawn as it now is.
    await expect(doc.locator('.drawn-form app-chart')).toBeVisible()
    // Rejected, it stays as it was.
    await suggest(page, md.replace(chart(200), chart(500)))
    await doc.locator('.suggest').getByRole('button', { name: 'Reject' }).click()
    await expect(doc.locator('.suggest')).toHaveCount(0)
    expect(await markdownOf(page)).toBe(md.replace(chart(200), chart(340)))
    // A note and steps added together, one change, each drawn; a diagram taken away, another, drawn faded.
    await suggest(page, md.replace(chart(200), chart(340)).replace('Middle.\n\n', 'Middle.\n\n> [!NOTE]\n> Prices rise in May.\n\n1. **Book** the room.\n2. **Pay** the deposit.\n\n').replace(/```mermaid[\s\S]*?```\n\n/, ''))
    await expect(doc.locator('.suggest')).toHaveCount(2)
    await expect(doc.locator('.suggest.is-added blockquote.callout.is-note')).toContainText('Prices rise in May.')
    await expect(doc.locator('.suggest.is-added ol.steps > li')).toHaveCount(2)
    await expect(drawn(doc.locator('.suggest.is-gone'))).toBeVisible()
    await page.getByRole('button', { name: 'Accept all' }).click()
    await expect(doc.locator('.drawn-form blockquote.callout.is-note')).toBeVisible()
    await expect(doc.locator('.drawn-form ol.steps')).toBeVisible()
    expect(await problems(page)).toEqual([])
  })

  test('a block drawn is one block for its grip: selected whole, then removed', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'Intro.\n\n1. **Choose** the venue.\n2. **Book** the train.\n\nLast.\n' })
    await expect(doc.locator('.drawn-form')).toBeVisible()
    const at = /** @type {{ x: number, y: number }} */ (await doc.locator('.drawn-form').boundingBox())
    await page.mouse.move(at.x + 20, at.y + 6)
    const grip = page.locator('.block-handle')
    await expect(grip).toBeVisible()
    await grip.click()
    await expect(doc.locator('.block-selected')).toHaveCount(2)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Delete')
    expect(await markdownOf(page)).toBe('Intro.\n\nLast.\n')
  })
})

test.describe('found and used by the brain', () => {
  test('a document written again offers Documents; the brain then makes one, and its changes are accepted or rejected', async ({ page }) => {
    await begin(page)
    await connectFakeBrain(page)
    await ask(page, 'Call write with {"name":"Letter.md","content":"# Letter\\n\\nDear Ana,"}')
    await answered(page)
    await expect(page.locator('.offer')).toHaveCount(0)
    await ask(page, 'Call write with {"name":"Letter.md","content":"# Letter\\n\\nDear Ana, thank you."}')
    await answered(page, 2)
    const offer = page.locator('.offer')
    await expect(offer).toContainText('Keep documents like this one beside the conversation, to change them by hand and with Jean?')
    await offer.getByRole('button', { name: 'Keep documents' }).click()
    await expect(offer).toHaveCount(0)
    await ask(page, 'Call document with {"name":"Cover letter","markdown":"# Cover letter\\n\\nI am writing to apply for the post."}')
    await answered(page, 3)
    // It opens beside the conversation, in its editor, and its card is under the answer.
    await expect(page.locator('#doc h1')).toHaveText('Cover letter')
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Cover letter.md')
    await expect(page.locator('app-file').last()).toContainText('Cover letter.md')
    const path = await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      return `documents/${(await app.fs.list(`${app.projectDir}/documents`)).map((entry) => entry.name).find((name) => name.endsWith('-cover-letter.md'))}`
    })
    expect(path).toMatch(/^documents\/[0-9A-HJKMNP-TV-Z]{26}-cover-letter\.md$/)
    await ask(page, `Call suggest with ${JSON.stringify({ document: path, markdown: '# Cover letter\n\nI am writing to apply for the post of editor.' })}`)
    await answered(page, 4)
    await expect(page.locator('#doc .suggest-new')).toHaveText(' of editor')
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect.poll(() => saved(page, path)).toBe('# Cover letter\n\nI am writing to apply for the post of editor.\n')
  })

  test('a document made in one task opens from another: with @ in the box, and by the brain, which is told of it and reads it before it changes it', async ({ page }) => {
    await begin(page)
    await connectFakeBrain(page)
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('documents') })
    await ask(page, 'Call document with {"name":"Application","markdown":"# Application\\n\\nI am writing to apply for the post."}')
    await answered(page)
    const path = await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      return `documents/${(await app.fs.list(`${app.projectDir}/documents`)).map((entry) => entry.name).find((name) => name.endsWith('-application.md'))}`
    })
    /** The task on screen as the brain reads it: its prompt and notes. */
    const read = () => page.evaluate(async () => JSON.stringify((await import('/ui/state.js')).app.current.value?.records ?? []))
    const opened = () => expect(page.locator('#doc h1')).toHaveText('Application')

    // Another task: nothing is on show, and @ offers the project's creations first, by name.
    await page.locator('.wordmark').click()
    await expect(page.locator('.hero-question')).toBeVisible()
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
    const box = page.locator('#prompt')
    await box.pressSequentially('Make @app')
    await expect(page.locator('#complete .complete-heading').first()).toHaveText('Creations')
    await expect(page.locator('#complete [aria-selected="true"]')).toContainText('Application')
    await box.press('Enter')
    await expect(box).toHaveValue('Make @Application ')
    // It opens beside the conversation, and the box keeps the keyboard.
    await opened()
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Application.md')
    await expect(box).toBeFocused()
    await box.pressSequentially('shorter')
    await box.press('Enter')
    await answered(page)
    // The task's first message leaves it open; the brain read which documents the project keeps, which one @ named, and its text.
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Application.md')
    const records = await read()
    expect(records).toContain(`<documents>\\nsuggest with one that is not open beside the conversation opens it there, unchanged, and gives you its text.\\n- Application: ${path}\\n</documents>`)
    expect(records).toContain(`\\"@Application\\" is the document \\"Application\\", ${path}.`)
    expect(records).toContain(`The document Application (${path}) is open beside the conversation. It reads:\\n\\n# Application\\n\\nI am writing to apply for the post.`)

    // A third task: the brain changes it unseen, and it opens unchanged instead, its text for the brain to read; then the change is suggested.
    await page.locator('.wordmark').click()
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
    const change = `Call suggest with ${JSON.stringify({ document: path, markdown: '# Application\n\nI am writing to apply for the post of editor.' })}`
    await ask(page, change)
    await answered(page)
    await opened()
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Application is open beside the conversation now, unchanged. It reads:')
    await expect(page.locator('#doc .suggest')).toHaveCount(0)
    await ask(page, change)
    await answered(page, 2)
    await expect(page.locator('#doc .suggest-new')).toHaveText(' of editor')
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect.poll(() => saved(page, path)).toBe('# Application\n\nI am writing to apply for the post of editor.\n')
  })

  test('a task opened again from the tasks shows the document it had beside it as it was left, and none once it was closed', async ({ page }) => {
    await begin(page)
    await connectFakeBrain(page)
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('documents') })
    await ask(page, 'Call document with {"name":"Application","markdown":"# Application\\n\\nI am writing to apply for the post."}')
    await answered(page)
    await expect(page.locator('#doc h1')).toHaveText('Application')
    await page.locator('.wordmark').click()
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
    await ask(page, 'Hello there')
    await answered(page)
    const tasks = await openTasks(page)
    // The tasks' rows, not the creations' (D497).
    const made = tasks.locator('.history-item[aria-current]', { hasText: 'Application' })
    const other = tasks.locator('.history-item[aria-current]', { hasText: 'Hello there' })
    // Back in the task, the document is beside it again, in its address too; the other task had nothing beside it.
    await made.click()
    await expect(page.locator('#doc h1')).toHaveText('Application')
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Application.md')
    await expect(page).toHaveURL(/\?preview=documents\/[0-9A-HJKMNP-TV-Z]{26}-application\.md$/)
    await other.click()
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
    await made.click()
    await expect(page.locator('#doc h1')).toHaveText('Application')
    // Closed there, it stays closed when the task is opened again.
    await page.locator('app-preview').getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
    await other.click()
    await made.click()
    await expect(page.locator('.msg-jean .prose')).toHaveCount(1)
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
  })

  test('Creations, once there are some: the drawer\'s place shows the latest five beside it and opens their page, a card each, kept in the address; each opens beside the task (D497)', async ({ page }) => {
    await begin(page)
    await connectFakeBrain(page)
    await ask(page, 'Hello there')
    await answered(page)
    const tasks = await openTasks(page)
    const place = tasks.getByRole('button', { name: 'Creations', exact: true })
    await page.evaluate(async (all) => {
      const [{ app, refreshConversations }, { ulid }] = await Promise.all([import('/ui/state.js'), import('/core/ulid.js')])
      for (const [i, name] of all.entries()) {
        const at = new Date(Date.UTC(2026, 9, 1 + i)).toISOString()
        await app.fs.write(`${app.projectDir}/documents/${ulid()}-${name.toLowerCase()}.md`, `---\nformat: 1\nname: ${name}\nauthor: jean\ncreated: ${at}\nchanged: ${at}\n---\n# ${name}\n`)
      }
      await refreshConversations()
    }, ['Budget', 'Menu', 'Packing', 'Letter', 'Plan', 'Speech', 'Recipe'])
    // Nothing of them before Documents is found, even with documents in the project.
    await expect(place).toHaveCount(0)
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('documents') })
    await expect(place).toBeVisible()

    // The pointer resting on it: the latest five beside it, at its end; one picked opens beside the task.
    await place.hover()
    const latest = page.locator('.creations-latest:popover-open')
    await expect(latest.getByRole('button')).toHaveText(['Recipe', 'Speech', 'Plan', 'Letter', 'Packing'])
    const [from, beside] = await Promise.all([place.boundingBox(), latest.boundingBox()])
    expect(beside?.x).toBeGreaterThanOrEqual((from?.x ?? 0) + (from?.width ?? 0))
    await latest.getByRole('button', { name: 'Speech' }).click()
    await expect(latest).toHaveCount(0)
    await expect(page.locator('#doc h1')).toHaveText('Speech')

    // Pressed: their page, on a new task, a card each, the latest changed first, its start drawn, in the address, and again after a reload.
    await place.click()
    const cards = page.locator('app-creations .creation')
    await expect(page.locator('app-creations h1')).toHaveText('Creations')
    await expect(cards).toHaveCount(7)
    await expect(cards.first().getByRole('button')).toHaveText('Recipe')
    await expect(cards.first().locator('.creation-preview h3')).toHaveText('Recipe')
    await expect(page).toHaveURL(/#\/\?creations$/)
    // Where Jean's data doesn't last, as in Playwright's WebKit (a private window's), a reload would start empty.
    if (!(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value))) {
      await page.reload()
      await expect(cards).toHaveCount(7)
    }
    // A card picked, anywhere on it, opens beside the page, which stays.
    await cards.nth(2).click()
    await expect(page.locator('#doc h1')).toHaveText('Plan')
    await expect(page.locator('app-creations')).toBeVisible()
    await expect(page).toHaveURL(/\?creations&preview=documents\/[0-9A-HJKMNP-TV-Z]{26}-plan\.md$/)
    // A message sent makes a task of it, the creation still beside it; New task leaves the page too.
    await ask(page, 'Make it shorter')
    await answered(page)
    await expect(page.locator('app-creations')).toHaveCount(0)
    await expect(page.locator('#doc h1')).toHaveText('Plan')
    await place.click()
    await expect(cards).toHaveCount(7)
    await tasks.getByRole('button', { name: 'New task' }).click()
    await expect(page.locator('app-creations')).toHaveCount(0)
    await expect(page.locator('.hero-question')).toBeVisible()
  })

  test('Creations makes a new document, which goes by its title, and a new table, its name to type beside the task (D502)', async ({ page }) => {
    await begin(page)
    const tasks = await openTasks(page)
    const place = tasks.getByRole('button', { name: 'Creations', exact: true })
    await page.evaluate(async () => { const { unlock } = await import('/ui/caps.js'); await unlock('documents'); await unlock('tables') })
    // Found, with nothing made yet: the place is as wide as the drawer's others, and the page offers a new one of each.
    await place.click()
    const creations = page.locator('app-creations')
    await expect(creations.locator('.creation')).toHaveCount(0)
    const [own, other] = await Promise.all([place.boundingBox(), tasks.getByRole('button', { name: 'New task' }).boundingBox()])
    expect(own?.width).toBe(other?.width)
    await creations.getByRole('button', { name: 'New document' }).click()
    await expect(page.locator('#doc')).toBeFocused()
    await expect(creations.locator('.creation')).toHaveCount(1)
    await page.keyboard.type('Budget')
    await expect(page.locator('#doc h1')).toHaveText('Budget')
    /** The project's creations of a kind, by name, as Documents and Tables keep them. @param {string} id */
    const names = (id) => page.evaluate(async (cap) => (await (await import(`/caps/${cap}/${cap}.js`)).kept()).map((one) => one.name), id)
    await expect.poll(() => names('documents')).toEqual(['Budget'])
    await place.click()
    await expect(creations.getByRole('button', { name: 'Budget' })).toBeVisible()

    await creations.getByRole('button', { name: 'New collection' }).click()
    const name = page.locator('app-preview .table-name')
    await expect(name).toBeFocused()
    await page.keyboard.type('Trips')
    await page.keyboard.press('Tab')
    await expect.poll(() => names('tables')).toEqual(['Trips'])
    await expect(creations.locator('.creation')).toHaveCount(2)
  })
})

test.describe('Japanese input', () => {
  test('a composition through an IME, committed, and Enter that confirms it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright drives no IME in WebKit: its keyboard sends text, never a composition (to check by hand in Safari)')
    const { doc } = await start(page, { lang: 'ja', markdown: '日本語のメモ\n\nEnglish line.\n' })
    await page.evaluate(() => {
      const seen = /** @type {string[]} */ ((/** @type {any} */ (globalThis).seen = []))
      for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) document.getElementById('doc')?.addEventListener(type, (event) => seen.push(`${type}:${/** @type {CompositionEvent} */ (event).data}`))
    })
    await caretAt(page, 'メモ', 2)
    const cdp = await page.context().newCDPSession(page)
    for (const text of ['か', 'かい', 'かいぎ']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
    await cdp.send('Input.imeSetComposition', { text: '会議', selectionStart: 2, selectionEnd: 2 })
    // Enter confirms the conversion: a keydown during the composition (keyCode 229), never a new paragraph.
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 })
    await cdp.send('Input.insertText', { text: '会議' })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await expect(doc.locator('p').first()).toHaveText('日本語のメモ会議')
    await expect(doc.locator('p')).toHaveCount(2)
    const events = await page.evaluate(() => /** @type {any} */ (globalThis).seen)
    expect(events[0]).toBe('compositionstart:')
    expect(events.at(-1)).toBe('compositionend:会議')
    // In bold: what is composed takes the mark the caret has. A pause first, as a person makes between two words.
    await page.waitForTimeout(600)
    await page.keyboard.press('ControlOrMeta+b')
    await cdp.send('Input.imeSetComposition', { text: 'です', selectionStart: 2, selectionEnd: 2 })
    await cdp.send('Input.insertText', { text: 'です' })
    await expect.poll(() => markdownOf(page)).toBe('日本語のメモ会議**です**\n\nEnglish line.\n')
    // One ⌘Z takes back what was composed in one go.
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => markdownOf(page)).toBe('日本語のメモ会議\n\nEnglish line.\n')
    await cdp.detach()
  })
})

test.describe('Arabic and English', () => {
  const MIXED = 'مرحبا بالعالم، هذا Jean يكتب 2026 تقريرا.\n\nHello world, then مرحبا in the middle.\n'

  test('each paragraph takes its own direction, and the caret moves as the text reads', async ({ page }) => {
    const { doc } = await start(page, { lang: 'ar', markdown: MIXED })
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl')
    expect(await doc.locator('p').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).direction))).toEqual(['rtl', 'ltr'])
    // At the start of the Arabic paragraph, ArrowLeft goes forward into it, as it reads.
    await caretAt(page, 'مرحبا')
    const begin = (await selection(page)).from
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
    expect((await selection(page)).from).toBe(begin + 3)
    await page.keyboard.press('ArrowRight')
    expect((await selection(page)).from).toBe(begin + 2)
    // In the English paragraph, ArrowRight goes forward.
    await caretAt(page, 'Hello')
    const english = (await selection(page)).from
    await page.keyboard.press('ArrowRight')
    expect((await selection(page)).from).toBe(english + 1)
    // Typing both, and a word selected with Shift+arrows made bold.
    await caretAt(page, 'middle.', 7)
    await page.keyboard.insertText(' نص عربي and English')
    await caretAt(page, 'Jean')
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
    const { from, to } = await selection(page)
    const chosen = await page.evaluate(([a, b]) => /** @type {any} */ (globalThis).editor.view.state.doc.textBetween(a, b), [from, to])
    await page.keyboard.press('ControlOrMeta+b')
    const text = await markdownOf(page)
    expect(text).toContain(`**${chosen.trim()}**`)
    expect(text).toContain('Hello world, then مرحبا in the middle. نص عربي and English\n')
  })

  test('a list or a quote takes its first letter\'s direction, its bullets and boxes on that side', async ({ page }) => {
    const { doc } = await start(page, { lang: 'ar', markdown: '- أول\n- [ ] مهمة\n\n> اقتباس\n\n- First\n- Second\n' })
    const sides = await doc.locator(':scope > .drawn > :is(ul, blockquote)').evaluateAll((all) => all.map((box) => getComputedStyle(box).direction))
    expect(sides).toEqual(['rtl', 'rtl', 'ltr'])
    // The task's box is at the line's start, on the right.
    const [item, box] = await Promise.all([doc.locator('li[data-checked]').boundingBox(), doc.locator('li[data-checked] input').boundingBox()])
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan((item?.x ?? 0) + (item?.width ?? 0) - 40)
  })

  test('a new line reads as the document does, right to left, until its first letter', async ({ page }) => {
    const { doc } = await start(page, { lang: 'ar', markdown: MIXED })
    await caretAt(page, 'تقريرا.', 7)
    await page.keyboard.press('Enter')
    await expect(doc.locator('p').nth(1)).toHaveAttribute('dir', 'rtl')
    await page.keyboard.insertText('Hello')
    await expect(doc.locator('p').nth(1)).toHaveAttribute('dir', 'auto')
    await expect.poll(() => doc.locator('p').nth(1).evaluate((p) => getComputedStyle(p).direction)).toBe('ltr')
  })
})

test.describe('the slash menu', () => {
  /** @param {import('@playwright/test').Page} page */
  const pointed = (page) => page.evaluate(() => document.getElementById('doc')?.getAttribute('aria-activedescendant') ?? null)

  test('"/" at a line\'s start offers what the line can become, narrowed as one types', async ({ page }) => {
    await start(page, { markdown: 'First.\n' })
    const menu = page.getByRole('listbox', { name: 'Turn into' })
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('option')).toHaveCount(20)
    await expect(menu.getByRole('option', { name: 'Text' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.type('hea')
    await expect(menu.getByRole('option')).toHaveCount(3)
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('option', { name: 'Heading 2' })).toHaveAttribute('aria-selected', 'true')
    expect(await pointed(page)).toBe('slash-1')
    await expect(page.locator('.document [aria-live]')).toHaveText('Heading 2, 2 of 3')
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    expect(await pointed(page)).toBeNull()
    await page.keyboard.type('Plan')
    expect(await markdownOf(page)).toBe('First.\n\n## Plan\n')
  })

  test('it offers what an answer draws: a formula, a page, a diagram and a map, and a chart or a score once a skill of the room writes them', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'First.\n' })
    const menu = page.getByRole('listbox', { name: 'Turn into' })
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    for (const name of ['Formula', 'Page', 'Diagram', 'Map']) await expect(menu.getByRole('option', { name })).toBeVisible()
    await expect(menu.getByRole('option', { name: 'Chart' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Backspace')
    // A skill that writes charts and scores: the menu offers them, each drawn at once, the caret on the line after it.
    await page.evaluate(async () => { (await import('/ui/markdown.js')).declared.value = new Set(['echarts', 'abc']) })
    await page.keyboard.type('/bar')
    await expect(menu.getByRole('option')).toHaveCount(1)
    await expect(menu.getByRole('option', { name: 'Chart' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(doc.locator('.drawn-form app-chart')).toBeVisible()
    await page.keyboard.type('After.')
    expect(await markdownOf(page)).toMatch(/^First\.\n\n```echarts\n\{"xAxis".*\}\n```\n\nAfter\.\n$/s)
    expect(await problems(page)).toEqual([])
    // (abcjs adds a style element of its own, which Jean's policy refuses, in an answer too: the score is drawn all the same.)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/music')
    await page.keyboard.press('Enter')
    await expect(doc.locator('.drawn-form app-score svg').first()).toBeVisible()
  })

  test('Escape leaves the slash as text, and a slash inside a line opens nothing', async ({ page }) => {
    await start(page, { markdown: 'First.\n' })
    const menu = page.getByRole('listbox')
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await page.keyboard.type('usr/bin and/or')
    await expect(menu).toBeHidden()
    expect(await markdownOf(page)).toBe('First.\n\n/usr/bin and/or\n')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/zzz')
    await expect(menu).toContainText('No results')
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
  })

  test('"---" alone on a line is a divider, as in Markdown; Backspace makes it text again', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'First.\n' })
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('---')
    await expect(doc.locator('hr')).toHaveCount(1)
    await page.keyboard.type('Next')
    expect(await markdownOf(page)).toBe('First.\n\n---\n\nNext\n')
    // Typed at once after it, Backspace gives the dashes back; inside a line they stay dashes.
    await caretAt(page, 'Next', 4)
    await page.keyboard.press('Enter')
    await page.keyboard.type('***')
    await expect(doc.locator('hr')).toHaveCount(2)
    await page.keyboard.press('Backspace')
    await expect(doc.locator('hr')).toHaveCount(1)
    await page.keyboard.type(' and a-b---c')
    expect(await markdownOf(page)).toBe('First.\n\n---\n\nNext\n\n\\*\\*\\* and a-b---c\n')
  })

  test('2, 3 or 4 columns side by side, each holding its own blocks, written as Pandoc writes them and read back as they were, right to left in Arabic (D501)', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'First.\n' })
    const menu = page.getByRole('listbox')
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/col')
    await expect(menu.getByRole('option', { name: /^\d columns$/ })).toHaveCount(3)
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('3 col')
    await expect(menu.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Enter')
    const columns = doc.locator('.columns > .column')
    await expect(columns).toHaveCount(3)
    await page.keyboard.type('Left')
    await page.keyboard.press('Enter')
    await page.keyboard.type('- one')
    await columns.nth(1).click()
    await page.keyboard.type('Middle')
    // Nothing crosses from one column to the next: Backspace at a column's start, or Delete at its end, leaves them as they are.
    await caretAt(page, 'Middle', 0)
    await page.keyboard.press('Backspace')
    await caretAt(page, 'one', 3)
    await page.keyboard.press('Delete')
    await expect(columns).toHaveText(['Leftone', 'Middle', ''])
    // Side by side once Layouts' style sheet, which the editor loads, lays them out: the first, then the next after it in the document's direction.
    /** @param {1 | -1} dir */
    const besides = (dir) => Promise.all([columns.nth(0).boundingBox(), columns.nth(1).boundingBox()])
      .then(([one, two]) => Boolean(one && two && one.y === two.y && (dir > 0 ? two.x >= one.x + one.width : one.x >= two.x + two.width)))
    await expect.poll(() => besides(1)).toBe(true)
    expect(await markdownOf(page)).toBe('First.\n\n:::: columns\n::: column\nLeft\n\n- one\n:::\n\n::: column\nMiddle\n:::\n\n::: column\n:::\n::::\n')
    // Inside a column, "/" offers what a line can become, never another block of its own.
    await caretAt(page, 'Middle', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(menu.getByRole('option', { name: 'Heading 1' })).toBeVisible()
    await expect(menu.getByRole('option', { name: /columns|Divider|Table/ })).toHaveCount(0)

    // A file's columns, in Arabic: the first on the right, the file written back as it was.
    const arabic = ':::: columns\n::: column\nالأول\n:::\n\n::: column\nالثاني\n:::\n::::\n'
    await start(page, { lang: 'ar', markdown: arabic })
    await expect.poll(() => besides(-1)).toBe(true)
    expect(await markdownOf(page)).toBe(arabic)
  })

  test('a to-do list that goes on with Enter, a table chosen with a click, a divider', async ({ page }) => {
    await start(page, { markdown: 'First.\n' })
    const menu = page.getByRole('listbox')
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/todo')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Buy milk')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Call Ana')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/tab')
    await menu.getByRole('option', { name: 'Table' }).click()
    await page.keyboard.type('Who')
    await page.keyboard.press('Tab')
    await page.keyboard.type('What')
    await caretAt(page, 'First.', 0)
    await page.keyboard.press('Enter')
    await at(page, 1)
    await page.keyboard.type('/div')
    await page.keyboard.press('Enter')
    expect(await markdownOf(page)).toBe('---\n\nFirst.\n\n- [ ] Buy milk\n- [ ] Call Ana\n\n| Who | What |\n| --- | --- |\n|  |  |\n')
  })

  test('Text first, a callout, a web bookmark titled from its page, and a table view once Tables is found, with one empty row its first field takes the keyboard in, drawn and changed in place (D494)', async ({ page }) => {
    // The page a bookmark is made of, which lets other sites read it.
    await page.route('https://example.test/**', (route) => route.fulfill({ contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html><head><title>Lisbon &amp; Porto</title></head></html>' }))
    const { doc } = await start(page, { markdown: 'Trip.\n' })
    const menu = page.getByRole('listbox')
    await caretAt(page, 'Trip.', 5)
    await page.keyboard.press('Enter')
    // Text, first, leaves a line of text as it is.
    await page.keyboard.type('/')
    await expect(menu.getByRole('option').first()).toHaveText(/Text/)
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    // A callout: a quote that starts with an emoji, drawn as an answer draws a note once the caret leaves it.
    await page.keyboard.type('/callout')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Pack light.')
    await caretAt(page, 'Trip.', 0)
    await expect(doc.locator('.drawn-form .callout.is-tip')).toContainText('Pack light.')
    // A web bookmark: the line asks for an address; given, it is a card, its title read from the page.
    await at(page, await page.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.doc.content.size - 1))
    await page.keyboard.type('/web')
    await page.keyboard.press('Enter')
    await expect(doc.locator('p.is-asking')).toHaveAttribute('data-ask', 'Paste a web address, then press Enter')
    await page.keyboard.type('example.test/trip')
    await page.keyboard.press('Enter')
    await expect(doc.locator('p.bookmark a')).toHaveText('Lisbon & Porto')
    await expect(doc.locator('p.bookmark .bookmark-site')).toHaveText('example.test')
    await expect.poll(() => markdownOf(page)).toBe('Trip.\n\n> 💡 Pack light.\n\n[Lisbon & Porto](https://example.test/trip)\n')
    // A table view isn't offered before Tables is found; then it makes a table, drawn where the line is.
    await page.keyboard.press('Enter')
    await page.keyboard.type('/table')
    await expect(menu.getByRole('option')).toHaveText([/Table/])
    await page.keyboard.press('Escape')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('tables') })
    await page.keyboard.type('/table view')
    await page.keyboard.press('Enter')
    const table = doc.locator('.drawn-form app-table')
    await expect(table.locator('.table-grid')).toBeVisible()
    await expect.poll(() => markdownOf(page)).toMatch(/\n```table\ntables\/[0-9A-HJKMNP-TV-Z]{26}-new-collection\n```\n$/)
    const kept = () => page.evaluate(async () => {
      const tables = await import('/caps/tables/tables.js')
      const [first] = await tables.kept()
      const one = await tables.load(first.path)
      return { name: one?.table.name, columns: one?.table.properties.map((property) => `${property.name} (${property.type})`), rows: one?.rows.map((row) => row.cells) }
    })
    // It starts with one empty row, its first field taking the keyboard, to write in at once.
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.getByLabel('Name', { exact: true })).toBeFocused()
    await page.keyboard.type('Lisbon')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await kept()).rows).toEqual([{ name: 'Lisbon' }])
    // Changed in place, as in the pane: its name, a column of a kind named at once.
    await table.getByLabel('Collection name').fill('Stays')
    await table.getByLabel('Collection name').press('Tab')
    await table.getByLabel('Add a column').selectOption('Date')
    await expect(table.locator('thead input').nth(1)).toBeFocused()
    await page.keyboard.type('Arrival')
    await page.keyboard.press('Tab')
    await table.getByLabel('Arrival', { exact: true }).fill('2026-11-03')
    await table.getByLabel('Arrival', { exact: true }).press('Tab')
    await expect.poll(kept).toEqual({ name: 'Stays', columns: ['Name (text)', 'Arrival (date)'], rows: [{ name: 'Lisbon', date: '2026-11-03' }] })
    // Still drawn: what was done in it never took the caret into its text.
    await expect(table.locator('.table-grid')).toBeVisible()
    expect(await problems(page)).toEqual([])
  })

  test('in Japanese: the full-width ／ a Japanese keyboard types opens it, and Japanese names narrow it', async ({ page, browserName }) => {
    await start(page, { lang: 'ja', markdown: 'メモ\n' })
    const menu = page.getByRole('listbox', { name: 'ブロックの種類' })
    await caretAt(page, 'メモ', 2)
    await page.keyboard.press('Enter')
    if (browserName === 'chromium') {
      // Through the IME, as a Japanese keyboard types it.
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', { text: '／', selectionStart: 1, selectionEnd: 1 })
      await cdp.send('Input.insertText', { text: '／' })
      await expect(menu).toBeVisible()
      for (const text of ['み', 'みだ', 'みだし', '見出し']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
      await cdp.send('Input.insertText', { text: '見出し' })
      await cdp.detach()
    } else {
      // Typed without a composition, which Playwright can't make in WebKit.
      await page.keyboard.insertText('／')
      await expect(menu).toBeVisible()
      await page.keyboard.insertText('見出し')
    }
    await expect(menu.getByRole('option')).toHaveCount(3)
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('タイトル')
    expect(await markdownOf(page)).toBe('メモ\n\n# タイトル\n')
  })

  test('in Arabic: its names, right to left, at the line\'s start on the right', async ({ page }) => {
    await start(page, { lang: 'ar', markdown: 'سطر أول.\n' })
    const menu = page.getByRole('listbox', { name: 'تحويل إلى' })
    await caretAt(page, 'سطر أول.', 8)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveCSS('direction', 'rtl')
    await expect(menu.getByRole('option', { name: 'قائمة مهام' })).toBeVisible()
    const box = /** @type {{ x: number, width: number }} */ (await menu.boundingBox())
    const line = /** @type {{ x: number, width: number }} */ (await page.locator('#doc p').nth(1).boundingBox())
    // Its right edge under the slash, where the line starts.
    expect(Math.abs(box.x + box.width - (line.x + line.width))).toBeLessThan(24)
  })
})

test.describe('the bubble over a selection', () => {
  /** @param {import('@playwright/test').Page} page */
  const bubbleOf = (page) => page.getByRole('toolbar', { name: 'Format' })
  /** @param {import('@playwright/test').Page} page @param {string} text */
  const box = (page, text) => page.evaluate((t) => {
    const { view } = /** @type {any} */ (globalThis).editor
    let at = -1
    view.state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => { const i = node.isText ? node.text.indexOf(t) : -1; if (i >= 0 && at < 0) at = pos + i; return at < 0 })
    const [a, b] = [view.coordsAtPos(at), view.coordsAtPos(at + t.length)]
    return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) }
  }, text)

  test('it shows over text selected, and its buttons put marks on and take them off', async ({ page }) => {
    await start(page, { markdown: '# Notes\n\nOne two three.\n\nAnother line.\n' })
    const bubble = bubbleOf(page)
    await expect(bubble).toBeHidden()
    await selectText(page, 'One')
    await expect(bubble).toBeVisible()
    // Above the selection.
    const bubbleBox = /** @type {{ y: number, height: number }} */ (await bubble.boundingBox())
    expect(bubbleBox.y + bubbleBox.height).toBeLessThanOrEqual((await box(page, 'One')).top)
    await bubble.getByRole('button', { name: 'Bold' }).click()
    await expect(bubble.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    await selectText(page, 'two')
    await bubble.getByRole('button', { name: 'Italic' }).click()
    await selectText(page, 'three')
    await bubble.getByRole('button', { name: 'Strikethrough' }).click()
    expect(await markdownOf(page)).toBe('# Notes\n\n**One** *two* ~~three~~.\n\nAnother line.\n')
    // All of it bold: pressed, and a press takes it off; part of it: not pressed, and a press puts it on all.
    await selectText(page, 'One')
    await expect(bubble.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    await bubble.getByRole('button', { name: 'Bold' }).click()
    await place(page, 'One', 0, 'One **two'.length - 2)
    await expect(bubble.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false')
    await bubble.getByRole('button', { name: 'Italic' }).click()
    expect(await markdownOf(page)).toBe('# Notes\n\n*One two* ~~three~~.\n\nAnother line.\n')
    // The caret alone, or the keyboard in Jean's box: no bubble.
    await caretAt(page, 'Another')
    await expect(bubble).toBeHidden()
    await selectText(page, 'Another')
    await expect(bubble).toBeVisible()
    await page.locator('#prompt').click()
    await expect(bubble).toBeHidden()
  })

  test('a selection made with the mouse: the bubble comes when the button is let go', async ({ page }) => {
    await start(page, { markdown: 'Drag across these words to select them.\n' })
    const bubble = bubbleOf(page)
    const line = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#doc p').boundingBox())
    await page.mouse.move(line.x + 2, line.y + line.height / 2)
    await page.mouse.down()
    await page.mouse.move(line.x + line.width * 0.5, line.y + line.height / 2, { steps: 5 })
    await expect(bubble).toBeHidden()
    await page.mouse.up()
    await expect(bubble).toBeVisible()
  })

  test('a link: typed, made safe, refused when it would run, removed; ⌘K opens it', async ({ page }) => {
    await start(page, { markdown: 'One two three.\n' })
    const bubble = bubbleOf(page)
    const address = bubble.getByRole('textbox', { name: 'Link address' })
    await selectText(page, 'two')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(address).toBeFocused()
    await page.keyboard.type('example.com/plan')
    await page.keyboard.press('Enter')
    expect(await markdownOf(page)).toBe('One [two](https://example.com/plan) three.\n')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('doc')
    await selectText(page, 'three')
    await bubble.getByRole('button', { name: 'Link' }).click()
    await page.keyboard.type('javascript:alert(1)')
    await page.keyboard.press('Enter')
    await expect(address).toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Escape')
    await expect(bubble.getByRole('button', { name: 'Link' })).toBeFocused()
    expect(await markdownOf(page)).toBe('One [two](https://example.com/plan) three.\n')
    await selectText(page, 'two')
    await expect(bubble.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true')
    await bubble.getByRole('button', { name: 'Link' }).click()
    await expect(address).toHaveValue('https://example.com/plan')
    await bubble.getByRole('button', { name: 'Remove link' }).click()
    expect(await markdownOf(page)).toBe('One two three.\n')
  })

  test('from the keyboard: Shift+arrows, then Alt+F10 or Tab into it, arrows along it, Escape back', async ({ page }) => {
    await start(page, { markdown: 'One two three.\n' })
    const bubble = bubbleOf(page)
    await caretAt(page, 'two')
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight')
    await expect.poll(async () => { const { from, to } = await selection(page); return to - from }).toBe(3)
    await expect(bubble).toBeVisible()
    await expect(bubble).toHaveAttribute('aria-keyshortcuts', 'Alt+F10')
    await page.keyboard.press('Alt+F10')
    await expect(bubble.getByRole('button', { name: 'Bold' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(bubble.getByRole('button', { name: 'Italic' })).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await markdownOf(page)).toBe('One *two* three.\n')
    // ⌘B in the bubble acts as in the document.
    await page.keyboard.press('ControlOrMeta+b')
    expect(await markdownOf(page)).toBe('One ***two*** three.\n')
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('doc')
    expect(await page.evaluate(() => { const { from, to } = /** @type {any} */ (globalThis).editor.view.state.selection; return to - from })).toBe(3)
    // Tab goes back to where the arrows were.
    await page.keyboard.press('Tab')
    await expect(bubble.getByRole('button', { name: 'Italic' })).toBeFocused()
    await page.keyboard.press('Escape')
    // Escape in the document, once the bubble is back over the selection, hides it, until the selection changes.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('doc')
    await expect(bubble).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(bubble).toBeHidden()
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(bubble).toBeVisible()
  })

  test('none over code, and none while the slash menu is open', async ({ page }) => {
    await start(page, { markdown: '```\ncode here\n```\n\nText.\n' })
    await selectText(page, 'code')
    await expect(bubbleOf(page)).toBeHidden()
    await caretAt(page, 'Text.', 5)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(bubbleOf(page)).toBeHidden()
  })

  test('in Arabic: its names, right to left, its arrows too', async ({ page }) => {
    await start(page, { lang: 'ar', markdown: 'مرحبا بالعالم، هذا Jean يكتب.\n' })
    const bubble = page.getByRole('toolbar', { name: 'التنسيق' })
    await selectText(page, 'بالعالم')
    await expect(bubble).toBeVisible()
    await expect(bubble).toHaveCSS('direction', 'rtl')
    const bold = bubble.getByRole('button', { name: 'غامق' })
    const italic = bubble.getByRole('button', { name: 'مائل' })
    expect((await bold.boundingBox())?.x ?? 0).toBeGreaterThan((await italic.boundingBox())?.x ?? 0)
    await page.keyboard.press('Alt+F10')
    await expect(bold).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(italic).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await markdownOf(page)).toBe('مرحبا *بالعالم*، هذا Jean يكتب.\n')
  })
})

test.describe('blocks', () => {
  const DOC = '# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- one\n- two\n\nLast paragraph.\n'
  /** @param {import('@playwright/test').Locator} locator */
  const boxOf = async (locator) => /** @type {{ x: number, y: number, width: number, height: number }} */ (await locator.boundingBox())
  /** Hovers a block and gives its grip, once it shows. @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} block */
  const gripOf = async (page, block) => {
    const at = await boxOf(block)
    await page.mouse.move(at.x + 20, at.y + 6)
    const grip = page.locator('.block-handle')
    await expect(grip).toBeVisible()
    return grip
  }
  /** Drags with the mouse, by small steps, as a hand does. @param {import('@playwright/test').Page} page @param {{ x: number, y: number }} from @param {{ x: number, y: number }} to */
  const drag = async (page, from, to) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await page.mouse.up()
  }
  /** The document's margin, where the line starts. @param {import('@playwright/test').Page} page */
  const margin = async (page) => (await boxOf(page.locator('.doc-wrap'))).x + 6

  test('a drag from the margin selects the blocks it crosses; Delete removes them, ⌘Z brings them back', async ({ page }) => {
    await start(page, { markdown: DOC })
    const x = await margin(page)
    const first = await boxOf(page.locator('#doc > p').nth(0))
    const second = await boxOf(page.locator('#doc > p').nth(1))
    await page.mouse.move(x, first.y + 4)
    await page.mouse.down()
    await page.mouse.move(x + 54, second.y + second.height - 4, { steps: 6 })
    await expect(page.locator('.marquee')).toBeVisible()
    await page.mouse.up()
    await expect(page.locator('.marquee')).toBeHidden()
    await expect(page.locator('#doc > .block-selected')).toHaveCount(2)
    await expect(page.locator('.document [aria-live]')).toHaveText('2 blocks selected')
    await expect(page.getByRole('toolbar', { name: 'Format' })).toBeHidden()
    // The brain is told what is selected, as of any selection.
    await expect.poll(() => told(page)).toContain('Selected in notes:\n\nFirst paragraph.\n\nSecond paragraph.')
    await page.keyboard.press('Backspace')
    expect(await markdownOf(page)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph.\n')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await markdownOf(page)).toBe(DOC)
    await expect(page.locator('#doc > .block-selected')).toHaveCount(2)
  })

  test('a list\'s items are blocks of their own: selected one by one, moved among the list and out of it', async ({ page }) => {
    await start(page, { markdown: DOC })
    const x = await margin(page)
    const one = await boxOf(page.locator('#doc li').nth(0))
    // A rectangle across the second paragraph's end and the list's first item takes that item alone of the list.
    const second = await boxOf(page.locator('#doc > p').nth(1))
    await drag(page, { x, y: second.y + second.height - 4 }, { x: x + 54, y: one.y + one.height / 2 })
    await expect(page.locator('.block-selected')).toHaveText(['Second paragraph.', 'one'])
    // From the keyboard: Escape on the second item, up to the first, moved down past it, then out of the list below.
    await caretAt(page, 'two')
    await page.keyboard.press('Escape')
    await expect(page.locator('.block-selected')).toHaveText(['two'])
    await page.keyboard.press('ArrowUp')
    await expect(page.locator('.block-selected')).toHaveText(['one'])
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    expect(await markdownOf(page)).toBe('# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- two\n- one\n\nLast paragraph.\n')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    expect(await markdownOf(page)).toBe('# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- two\n\nLast paragraph.\n\n- one\n')
    await expect(page.locator('.block-selected')).toHaveText(['one'])
    // Moved back up past the paragraph, then next to its old list, it joins it again.
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    expect(await markdownOf(page)).toBe('# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- two\n- one\n\nLast paragraph.\n')
  })

  test('two lists of a kind moved next to each other stay two lists in the file', async ({ page }) => {
    await start(page, { markdown: '- a\n- b\n\nMiddle.\n\n- c\n' })
    await caretAt(page, 'Middle.')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    const text = await markdownOf(page)
    expect(text).toBe('- a\n- b\n\n* c\n\nMiddle.\n')
    await expect.poll(() => saved(page)).toBe(text)
  })

  test('a click in the margin puts the caret on that line', async ({ page }) => {
    await start(page, { markdown: DOC })
    const second = await boxOf(page.locator('#doc > p').nth(1))
    await page.mouse.click(await margin(page), second.y + second.height / 2)
    expect(await page.evaluate(() => { const { selection } = /** @type {any} */ (globalThis).editor.view.state; return [selection.empty, selection.$from.parent.textContent] })).toEqual([true, 'Second paragraph.'])
    await expect(page.locator('.block-selected')).toHaveCount(0)
  })

  test('the grip is centred on its block\'s first line, a heading\'s or a paragraph\'s', async ({ page }) => {
    await start(page, { markdown: '# A heading of the document\n\nA paragraph.\n\n- An item\n' })
    for (const selector of ['#doc > h1', '#doc > p', '#doc li']) {
      const line = await boxOf(page.locator(selector))
      const grip = await boxOf(await gripOf(page, page.locator(selector)))
      expect(Math.abs(grip.y + grip.height / 2 - (line.y + line.height / 2)), selector).toBeLessThan(3)
    }
  })

  test('the grip beside a block: a click selects it and opens its menu, a drag moves it', async ({ page }) => {
    await start(page, { markdown: DOC })
    const last = page.locator('#doc > p', { hasText: 'Last paragraph.' })
    const grip = await gripOf(page, last)
    const gripAt = await boxOf(grip)
    expect(gripAt.x + gripAt.width).toBeLessThanOrEqual((await boxOf(last)).x)
    await expect(grip).toHaveAccessibleName('Drag to move, click for options')
    await grip.click()
    await expect(page.locator('#doc > .block-selected')).toHaveText(['Last paragraph.'])
    const menu = page.getByRole('menu', { name: 'Block options' })
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    const again = await boxOf(await gripOf(page, last))
    const first = await boxOf(page.locator('#doc > p').nth(0))
    await drag(page, { x: again.x + again.width / 2, y: again.y + again.height / 2 }, { x: first.x + 8, y: first.y + 3 })
    await expect.poll(() => markdownOf(page)).toBe('# Plan\n\nLast paragraph.\n\nFirst paragraph.\n\nSecond paragraph.\n\n- one\n- two\n')
  })

  test('the grip\'s menu moves, turns and deletes blocks with no drag (WCAG 2.5.7), from the keyboard too', async ({ page }) => {
    await start(page, { markdown: DOC })
    const menu = page.getByRole('menu', { name: 'Block options' })
    await (await gripOf(page, page.locator('#doc > p').nth(1))).click()
    await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeFocused()
    await menu.getByRole('menuitem', { name: 'Move up' }).click()
    expect(await markdownOf(page)).toBe('# Plan\n\nSecond paragraph.\n\nFirst paragraph.\n\n- one\n- two\n\nLast paragraph.\n')
    await expect(page.locator('#doc > .block-selected')).toHaveText(['Second paragraph.'])
    // Turned into a heading, the blocks still selected; then into a list.
    await (await gripOf(page, page.locator('#doc > p').nth(0))).click()
    // What a paragraph can become: all but text.
    await expect(menu.getByRole('group', { name: 'Turn into' }).getByRole('menuitem')).toHaveCount(8)
    await menu.getByRole('menuitem', { name: 'Heading 2' }).click()
    expect(await markdownOf(page)).toContain('# Plan\n\n## Second paragraph.\n\nFirst paragraph.')
    await expect(page.locator('#doc > .block-selected')).toHaveText(['Second paragraph.'])
    // From the keyboard: Escape on a line, Shift+F10, the arrows, Enter.
    await caretAt(page, 'Last')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+F10')
    await expect(menu).toBeVisible()
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await markdownOf(page)).toBe('# Plan\n\n## Second paragraph.\n\nFirst paragraph.\n\n- one\n- two\n')
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('doc')
    // The first block can't move up: its Move up is off.
    await caretAt(page, 'Plan')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+F10')
    await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Move down' })).toBeFocused()
  })

  test('the blocks selected move together, by the grip of any of them', async ({ page }) => {
    await start(page, { markdown: DOC })
    const x = await margin(page)
    const first = await boxOf(page.locator('#doc > p').nth(0))
    const second = await boxOf(page.locator('#doc > p').nth(1))
    await drag(page, { x, y: first.y + 4 }, { x: x + 54, y: second.y + 6 })
    await expect(page.locator('#doc > .block-selected')).toHaveCount(2)
    const grip = await gripOf(page, page.locator('#doc > p').nth(1))
    const gripAt = await boxOf(grip)
    const last = await boxOf(page.locator('#doc > p', { hasText: 'Last paragraph.' }))
    await drag(page, { x: gripAt.x + gripAt.width / 2, y: gripAt.y + gripAt.height / 2 }, { x: last.x + last.width - 10, y: last.y + last.height - 3 })
    await expect.poll(() => markdownOf(page)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph.\n\nFirst paragraph.\n\nSecond paragraph.\n')
  })

  test('a rectangle drawn to the pane\'s foot scrolls it, and selects the blocks it reaches', async ({ page }) => {
    const lines = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}.`)
    await start(page, { markdown: `${lines.join('\n\n')}\n` })
    const x = await margin(page)
    const view = await boxOf(page.locator('app-preview .view'))
    const first = await boxOf(page.locator('#doc > p').nth(0))
    await page.mouse.move(x, first.y + 4)
    await page.mouse.down()
    await page.mouse.move(x + 40, view.y + view.height - 6, { steps: 8 })
    await expect.poll(() => page.locator('app-preview .view').evaluate((pane) => pane.scrollTop)).toBeGreaterThan(200)
    await page.mouse.up()
    const count = await page.locator('#doc > .block-selected').count()
    expect(count).toBeGreaterThan(20)
    await expect(page.locator('#doc > .block-selected').first()).toHaveText('Paragraph 1.')
  })

  test('Shift+arrows grow a single block either way: up from the block Escape selected, then down past it', async ({ page }) => {
    await start(page, { markdown: DOC })
    const selected = page.locator('.block-selected')
    await caretAt(page, 'two')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+ArrowUp')
    await expect(selected).toHaveText(['one', 'two'])
    await page.keyboard.press('Shift+ArrowUp')
    await expect(selected).toHaveText(['Second paragraph.', 'one', 'two'])
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(selected).toHaveText(['two'])
    await page.keyboard.press('Shift+ArrowDown')
    await expect(selected).toHaveText(['two', 'Last paragraph.'])
    // At the top, there is nothing more to take.
    await caretAt(page, 'Plan')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+ArrowUp')
    await expect(selected).toHaveText(['Plan'])
  })

  test('from the keyboard: Escape selects the block, arrows, Shift+arrows, ⌘⇧↑ ⌘⇧↓, Delete, and back to the text', async ({ page }) => {
    await start(page, { markdown: DOC })
    const selected = page.locator('#doc > .block-selected')
    await caretAt(page, 'Second')
    await page.keyboard.press('Escape')
    await expect(selected).toHaveText(['Second paragraph.'])
    await page.keyboard.press('ArrowUp')
    await expect(selected).toHaveText(['First paragraph.'])
    await page.keyboard.press('Shift+ArrowDown')
    await expect(selected).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    expect(await markdownOf(page)).toBe('First paragraph.\n\nSecond paragraph.\n\n# Plan\n\n- one\n- two\n\nLast paragraph.\n')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    expect(await markdownOf(page)).toBe(DOC)
    await expect(selected).toHaveCount(2)
    // A letter typed over blocks replaces nothing.
    await page.keyboard.type('x')
    expect(await markdownOf(page)).toBe(DOC)
    await page.keyboard.press('Delete')
    expect(await markdownOf(page)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph.\n')
    // Escape twice: the block, then the text again, the caret at its end.
    await caretAt(page, 'Last')
    await page.keyboard.press('Escape')
    await expect(page.locator('.block-selected')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('.block-selected')).toHaveCount(0)
    await page.keyboard.type(' Done')
    expect(await markdownOf(page)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph. Done\n')
  })

  test('a drag from off the text inside a block, beside a heading or past a line\'s end, selects blocks, not text', async ({ page }) => {
    await start(page, { markdown: DOC })
    const heading = await boxOf(page.locator('#doc > h1'))
    const second = await boxOf(page.locator('#doc > p').nth(1))
    // Beside the heading's short text, inside its box.
    await drag(page, { x: heading.x + heading.width - 30, y: heading.y + heading.height / 2 }, { x: heading.x + heading.width - 60, y: second.y + 6 })
    await expect(page.locator('#doc > .block-selected')).toHaveCount(3)
    expect(await kindOf(page)).toBe('block')
    await expect(page.getByRole('toolbar', { name: 'Format' })).toBeHidden()
    // Past the end of a paragraph's line, upwards.
    const first = await boxOf(page.locator('#doc > p').nth(0))
    await drag(page, { x: second.x + second.width - 20, y: second.y + second.height / 2 }, { x: second.x + second.width - 40, y: first.y + 4 })
    await expect(page.locator('#doc > .block-selected')).toHaveText(['First paragraph.', 'Second paragraph.'])
  })

  test('a click off the text puts the caret at the line\'s end; a drag on the text still selects text', async ({ page }) => {
    await start(page, { markdown: DOC })
    const at = await boxOf(page.locator('#doc > p').nth(0))
    await page.mouse.click(at.x + at.width - 20, at.y + at.height / 2)
    expect(await page.evaluate(() => { const { selection } = /** @type {any} */ (globalThis).editor.view.state; return [selection.toJSON().type, selection.empty, selection.$from.parentOffset, selection.$from.parent.textContent] })).toEqual(['text', true, 16, 'First paragraph.'])
    await expect(page.locator('.block-selected')).toHaveCount(0)
    // From the text itself, a drag selects text, as ever, and the bubble comes.
    await drag(page, { x: at.x + 2, y: at.y + at.height / 2 }, { x: at.x + 60, y: at.y + at.height / 2 })
    expect(await kindOf(page)).toBe('text')
    await expect(page.locator('.block-selected')).toHaveCount(0)
    await expect(page.getByRole('toolbar', { name: 'Format' })).toBeVisible()
  })

  test('a double click off the text is the browser\'s, and a table\'s cells and code keep their own drags', async ({ page }) => {
    await start(page, { markdown: '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```\ncode\nmore code\n```\n\nAfter the table.\n' })
    const cell = await boxOf(page.locator('#doc td').first())
    const other = await boxOf(page.locator('#doc td').nth(1))
    await drag(page, { x: cell.x + cell.width - 8, y: cell.y + cell.height / 2 }, { x: other.x + other.width - 8, y: other.y + other.height / 2 })
    await expect(page.locator('#doc > .block-selected')).toHaveCount(0)
    const code = await boxOf(page.locator('#doc pre'))
    await drag(page, { x: code.x + code.width - 10, y: code.y + 12 }, { x: code.x + 20, y: code.y + code.height - 10 })
    await expect(page.locator('#doc > .block-selected')).toHaveCount(0)
    const after = await boxOf(page.locator('#doc > p'))
    await page.mouse.dblclick(after.x + after.width - 20, after.y + after.height / 2)
    await expect(page.locator('.block-selected')).toHaveCount(0)
    expect(await page.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.selection.$from.parent.textContent)).toBe('After the table.')
  })

  test('in Arabic: beside a heading\'s text on its left, where the line ends; the grip on the right', async ({ page }) => {
    await start(page, { lang: 'ar', markdown: '# عنوان\n\nسطر أول.\n\nسطر ثان.\n' })
    const heading = await boxOf(page.locator('#doc > h1'))
    const second = await boxOf(page.locator('#doc > p').nth(1))
    await drag(page, { x: heading.x + 30, y: heading.y + heading.height / 2 }, { x: heading.x + 60, y: second.y + 6 })
    await expect(page.locator('#doc > .block-selected')).toHaveCount(3)
    expect(await kindOf(page)).toBe('block')
    const line = page.locator('#doc > p').nth(1)
    const grip = await gripOf(page, line)
    expect((await boxOf(grip)).x).toBeGreaterThanOrEqual((await boxOf(line)).x + (await boxOf(line)).width)
    await grip.click()
    // The menu of the whole document, selected: nowhere to move it, so the first kind to turn it into takes the keyboard.
    const menu = page.getByRole('menu', { name: 'خيارات الكتلة' })
    await expect(menu.getByRole('menuitem', { name: 'نقل للأعلى' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'نقل للأسفل' })).toBeDisabled()
    await expect(menu.getByRole('group', { name: 'تحويل إلى' }).getByRole('menuitem').first()).toBeFocused()
    await expect(menu).toHaveCSS('direction', 'rtl')
  })

  test('a block\'s highlight comes and goes in 150 ms, at once with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await start(page, { markdown: DOC })
    const block = page.locator('#doc > p').first()
    const timing = () => block.evaluate((p) => { const style = getComputedStyle(p); return { property: style.transitionProperty, duration: style.transitionDuration } })
    expect(await timing()).toEqual({ property: 'background-color, box-shadow', duration: '0.15s, 0.15s' })
    // The transitions themselves, running as the block is selected, then done.
    await caretAt(page, 'First')
    await page.keyboard.press('Escape')
    const running = await block.evaluate((p) => p.getAnimations().map((a) => [/** @type {CSSTransition} */ (a).transitionProperty, a.effect?.getTiming().duration]).sort())
    expect(running).toEqual([['background-color', 150], ['box-shadow', 150]])
    await expect.poll(() => block.evaluate((p) => p.getAnimations().length)).toBe(0)
    await expect(block).toHaveClass(/block-selected/)
    // And going away the same way.
    await page.keyboard.press('Escape')
    expect(await block.evaluate((p) => p.getAnimations().length)).toBe(2)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect((await timing()).duration).toBe('0s')
    await page.keyboard.press('Escape')
    expect(await block.evaluate((p) => p.getAnimations().length)).toBe(0)
  })
})

test.describe('theme', () => {
  /** The document as the room has it: light or dark, and the pane's ink. @param {import('@playwright/test').Page} page */
  const looks = async (page) => {
    const ink = await page.locator('app-preview .pane').evaluate((pane) => getComputedStyle(pane).color)
    const [scheme, text] = await page.locator('#doc').evaluate((doc) => [getComputedStyle(doc).colorScheme, getComputedStyle(doc).color])
    return { scheme, room: text === ink }
  }

  test('the document is dark when Jean is, by the system\'s setting, and follows its change, in the room\'s colours', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await start(page)
    expect(await looks(page)).toEqual({ scheme: 'dark', room: true })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => looks(page)).toEqual({ scheme: 'light', room: true })
  })

  test('Jean\'s own theme wins over the system\'s', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await start(page)
    await page.locator('#prompt').focus()
    await page.keyboard.press('ControlOrMeta+Shift+d')
    await expect.poll(() => looks(page)).toEqual({ scheme: 'dark', room: true })
  })
})

test.describe('the title and the pane', () => {
  test('the first line, empty, is the title: what is typed there is a heading of the first level, and an empty document stays empty', async ({ page }) => {
    const { doc } = await start(page, { markdown: '' })
    const title = doc.locator(':scope > p.is-title')
    await expect(title).toHaveCount(1)
    expect(await title.evaluate((p) => parseFloat(getComputedStyle(p).fontSize))).toBeGreaterThan(24)
    // Closed untouched, its file is as empty as it was.
    await page.locator('app-preview .pane-head button').last().click()
    await expect(page.locator('#doc')).toHaveCount(0)
    expect(await saved(page)).toBe('')
    await start(page, { markdown: '' })
    await at(page, 1)
    await page.keyboard.type('Plan')
    await expect(doc.locator(':scope > h1')).toHaveText('Plan')
    await page.keyboard.press('Enter')
    await page.keyboard.type('First step.')
    expect(await markdownOf(page)).toBe('# Plan\n\nFirst step.\n')
  })

  test('a document is shared as it is when Share is pressed, once sharing is found, in a task', async ({ page }) => {
    await begin(page)
    await connectFakeBrain(page)
    await ask(page, 'Hello')
    await answered(page)
    await page.evaluate(async ([host, path]) => {
      const [{ app, updateSettings }, caps] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')])
      await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
      await caps.unlock('share')
      await caps.unlock('documents')
      await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: notes\nauthor: jean\n---\n# Notes\n\nFirst.\n`)
      ;(await import('/ui/preview.js')).preview({ uri: path, name: 'notes.md', mimeType: 'text/markdown' })
    }, [SHARE_URL, PATH])
    await expect(page.locator('#doc h1')).toHaveText('Notes')
    await reach(page)
    await caretAt(page, 'First.', 6)
    await page.keyboard.type(' Second.')
    await page.locator('app-preview .pane-head').getByRole('button', { name: 'Share…' }).click()
    await expect(page.locator('app-share-dialog dialog[open]')).toBeVisible()
    expect(await page.evaluate(async () => (await import('/caps/share/share.js')).sharing.value?.item)).toEqual({ text: '# Notes\n\nFirst. Second.\n' })
  })

  test('full screen: the pane alone, and what floats over the document with it', async ({ page }) => {
    await start(page, { markdown: 'First.\n' })
    const head = page.locator('app-preview .pane-head')
    await head.getByRole('button', { name: 'Full screen' }).click()
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.matches('.preview') ?? false)).toBe(true)
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(page.locator('app-preview .preview .slash')).toBeVisible()
    // Escape would leave full screen, as browsers have it there: the slash taken back closes the menu.
    await page.keyboard.press('Backspace')
    await head.getByRole('button', { name: 'Exit full screen' }).click()
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
    await expect(page.locator('body > .slash')).toHaveCount(1)
  })
})

test.describe('paste', () => {
  /** A paste, its HTML read in the small sealed frame, a moment later. @param {import('@playwright/test').Page} page @param {string} html @param {string} text */
  const paste = (page, html, text) => page.evaluate(([h, t]) => {
    const data = new DataTransfer()
    data.setData('text/html', h)
    data.setData('text/plain', t)
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    const { view } = /** @type {any} */ (globalThis).editor
    view.dom.dispatchEvent(event)
    return event.defaultPrevented
  }, [html, text])

  const EXPECTED = '# Quarterly report\n\nThe **revenue** grew by *12\u00a0%* in the [third quarter](https://example.com/q3).\n\n- First point\n- Second point\n  - Nested point\n\n1. Step one\n2. Step two\n\n| Region | Sales |\n| --- | --- |\n| North | 1,200 |\n| South | 950 |\n'

  test('from Word: its heading, emphasis, link, lists and table', async ({ page }) => {
    await start(page, { markdown: '' })
    await at(page, 1)
    expect(await paste(page, await fixture('word.html'), 'Quarterly report')).toBe(true)
    await expect.poll(() => markdownOf(page)).toBe(EXPECTED)
    expect(await problems(page)).toEqual([])
  })

  test('from Google Docs: the same, from its spans and its lists inside lists', async ({ page }) => {
    await start(page, { markdown: '' })
    await at(page, 1)
    expect(await paste(page, await fixture('gdocs.html'), 'Quarterly report')).toBe(true)
    await expect.poll(() => markdownOf(page)).toBe(EXPECTED.replace('12 %', '12 %'))
  })

  test('what is pasted runs nothing and loads nothing, in Jean\'s own origin', async ({ page }) => {
    const requests = /** @type {string[]} */ ([])
    page.on('request', (request) => requests.push(request.url()))
    await page.addInitScript(() => addEventListener('message', ({ data }) => { if (typeof data === 'string') (/** @type {any} */ (globalThis).pwned ??= []).push(data) }))
    await start(page, { markdown: 'Start.\n' })
    await caretAt(page, 'Start.', 6)
    const hostile = '<p>Hi <img src="https://attacker.example/x.png" onerror="parent.postMessage(\'pwned\',\'*\')"><script>parent.postMessage(\'pwned2\',\'*\')</script><a href="javascript:parent.postMessage(\'pwned3\',\'*\')">click</a> <a href="https://ok.example/">ok</a><svg onload="parent.postMessage(\'pwned4\',\'*\')"></svg><iframe src="https://attacker.example/"></iframe><style>body { display: none }</style></p>'
    await paste(page, hostile, 'Hi click ok')
    await expect.poll(() => markdownOf(page)).toContain('[ok](https://ok.example/)')
    await page.locator('#doc').click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(500)
    expect(requests.filter((url) => url.includes('attacker.example'))).toEqual([])
    expect(await page.evaluate(() => /** @type {any} */ (globalThis).pwned ?? [])).toEqual([])
    const text = await markdownOf(page)
    expect(text).toContain('[ok](https://ok.example/)')
    expect(text).not.toContain('javascript:')
    await expect(page.locator('body')).toBeVisible()
    expect(await problems(page)).toEqual([])
  })

  test('⌘V pastes what the system clipboard holds into the document', async ({ page, browserName, context }) => {
    test.skip(browserName !== 'chromium', 'Playwright grants clipboard access to Chromium only; WebKit\'s pastes are covered by the paste events above')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { doc } = await start(page, { markdown: 'Start.\n' })
    await page.evaluate(async (html) => {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['Quarterly report'], { type: 'text/plain' }) })])
    }, await fixture('gdocs.html'))
    await doc.click()
    await caretAt(page, 'Start.', 6)
    await page.keyboard.press('ControlOrMeta+v')
    await expect.poll(() => markdownOf(page)).toContain('- Second point\n  - Nested point')
    expect(await markdownOf(page)).toContain('**revenue**')
  })

  test('copying from the document and pasting in Jean\'s box', async ({ page, browserName, context }) => {
    test.skip(browserName !== 'chromium', 'Playwright grants clipboard access to Chromium only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await start(page)
    await selectText(page, 'Here is the plan')
    await page.keyboard.press('ControlOrMeta+c')
    await page.locator('#prompt').click()
    await page.keyboard.press('ControlOrMeta+v')
    await expect(page.locator('#prompt')).toHaveValue('Here is the plan')
  })
})

test.describe('keys', () => {
  test('⌘B, ⌘I, ⌘Z and ⌘⇧Z', async ({ page }) => {
    await start(page, { markdown: 'One two three.\n' })
    await selectText(page, 'two')
    await page.keyboard.press('ControlOrMeta+b')
    expect(await markdownOf(page)).toBe('One **two** three.\n')
    await selectText(page, 'three')
    await page.keyboard.press('ControlOrMeta+i')
    expect(await markdownOf(page)).toBe('One **two** *three*.\n')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await markdownOf(page)).toBe('One **two** three.\n')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await markdownOf(page)).toBe('One two three.\n')
    await page.keyboard.press('ControlOrMeta+Shift+z')
    expect(await markdownOf(page)).toBe('One **two** three.\n')
  })

  test('Tab indents a list\'s item, moves through a table, and otherwise leaves the editor', async ({ page, browserName }) => {
    await start(page, { markdown: '- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.\n' })
    await caretAt(page, 'two')
    await page.keyboard.press('Tab')
    expect(await markdownOf(page)).toContain('- one\n  - two')
    await page.keyboard.press('Shift+Tab')
    expect(await markdownOf(page)).toContain('- one\n- two')
    // Tab on the first item, which can't go deeper, stays in the list.
    await caretAt(page, 'one')
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('doc')
    // Tab selects the next cell's text, as a spreadsheet does: what is typed replaces it.
    await caretAt(page, 'a')
    await page.keyboard.press('Tab')
    await page.keyboard.type('B')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1!')
    // From the last cell, Tab adds a row.
    await caretAt(page, '2', 1)
    await page.keyboard.press('Tab')
    await page.keyboard.type('3')
    expect(await markdownOf(page)).toContain('| a | B |\n| --- | --- |\n| 1! | 2 |\n| 3 |  |')
    // WebKit on a Mac moves the focus on ⌥Tab only, as Safari does unless Full Keyboard Access is on.
    await caretAt(page, 'After.')
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
    await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('doc')
    expect(await markdownOf(page)).toContain('\nAfter.\n')
  })

  test('the browser\'s Format menu (iOS\'s B I U) makes text bold', async ({ page }) => {
    await start(page, { markdown: 'One two.\n' })
    await selectText(page, 'two')
    await page.evaluate(() => /** @type {any} */ (globalThis).editor.view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'formatBold', bubbles: true, cancelable: true })))
    expect(await markdownOf(page)).toBe('One **two**.\n')
  })

  test('Jean\'s own keys reach Jean: ⌘, from the document, Escape from the review bar', async ({ page }) => {
    const text = await sample()
    await start(page)
    await caretAt(page, 'Questions?')
    // Escape is the document's: it selects the block, and the preview stays.
    await page.keyboard.press('Escape')
    await expect(page.locator('.block-selected')).toHaveCount(1)
    await expect(page.locator('#doc')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+Comma')
    await expect(page.locator('app-settings dialog[open]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
    await suggest(page, text.replace('plan for the week', 'plan for the fortnight'))
    await page.getByRole('button', { name: 'Accept all' }).focus()
    await page.keyboard.press('Escape')
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
  })
})

test.describe('focus', () => {
  test('Tab goes from Jean into the document, through the review bar when it shows, and back', async ({ page, browserName }) => {
    await start(page, { markdown: 'A paragraph.\n' })
    const [tab, back] = browserName === 'webkit' ? ['Alt+Tab', 'Alt+Shift+Tab'] : ['Tab', 'Shift+Tab']
    const close = page.locator('app-preview .pane-head button').last()
    await close.focus()
    await page.keyboard.press(tab)
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('doc')
    await page.keyboard.press(back)
    await expect(close).toBeFocused()
    await suggest(page, 'A paragraph, changed.\n')
    // The bar first, with no arrows for one change; then the document, then the change's own row.
    await page.keyboard.press(tab)
    await expect(page.getByRole('button', { name: 'Accept all' })).toBeFocused()
    await page.keyboard.press(tab)
    await page.keyboard.press(tab)
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('doc')
    await page.keyboard.press(tab)
    await expect(page.locator('#doc .suggest-row').getByRole('button', { name: 'Before' })).toBeFocused()
  })
})

test.describe('drag and drop', () => {
  test('a piece of Jean\'s answer dragged into the document', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright brings a drag in from outside the page through Chromium\'s DevTools only')
    const { doc } = await start(page, { markdown: 'First.\n\nSecond.\n' })
    const target = /** @type {{ x: number, y: number, width: number, height: number }} */ (await doc.locator('p').last().boundingBox())
    // A drag the browser brings in, as one from Jean's conversation or another program: its data and where it is let go.
    const cdp = await page.context().newCDPSession(page)
    const data = { items: [{ mimeType: 'text/html', data: '<p>Jean\'s answer: <strong>a bold claim</strong>.</p>' }, { mimeType: 'text/plain', data: 'a bold claim' }], dragOperationsMask: 1 }
    for (const type of /** @type {const} */ (['dragEnter', 'dragOver', 'drop'])) await cdp.send('Input.dispatchDragEvent', { type, x: target.x + target.width - 2, y: target.y + target.height / 2, data })
    await cdp.detach()
    await expect.poll(() => markdownOf(page)).toContain('**a bold claim**')
  })

  test('HTML dropped from elsewhere is read in the small sealed frame too', async ({ page }) => {
    await start(page, { markdown: 'First.\n\nSecond.\n' })
    await page.evaluate(() => {
      const { view } = /** @type {any} */ (globalThis).editor
      const data = new DataTransfer()
      data.setData('text/html', 'Jean\'s answer: <strong>a bold claim</strong>.')
      const at = view.coordsAtPos(view.state.doc.content.size - 1)
      view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: at.left, clientY: (at.top + at.bottom) / 2 }))
    })
    await expect.poll(() => markdownOf(page)).toContain('**a bold claim**')
    expect(await problems(page)).toEqual([])
  })

  test('a file dropped on the document is handed to Jean, which shares it in the conversation', async ({ page }) => {
    await start(page, { markdown: 'Text.\n' })
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.items.add(new File(['# A file'], 'dropped.md', { type: 'text/markdown' }))
      const dom = /** @type {HTMLElement} */ (document.getElementById('doc'))
      const rect = dom.getBoundingClientRect()
      dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }))
    })
    await expect(page.locator('app-composer .attachments')).toContainText('dropped.md')
    expect(await markdownOf(page)).toBe('Text.\n')
  })
})

test.describe('accessibility', () => {
  test('what a screen reader reads in the document', async ({ page }) => {
    const text = await sample()
    await start(page)
    await suggest(page, text.replace('plan for the week', 'plan for the fortnight'))
    await expect(page.locator('.document')).toMatchAriaSnapshot(`
      - region "Suggested changes":
        - paragraph: A change suggested by Jean
        - button "Accept all"
        - button "Reject all"
      - 'textbox "Document: notes"':
        - 'heading "Team offsite: plan for the fortnight" [level=1]'
        - group "A change suggested by Jean":
          - button "Before"
          - button "Accept"
          - button "Reject"
        - paragraph:
          - text: Here is the plan, built from the
          - strong: three files
        - table:
          - rowgroup:
            - row "Day Budget Owner":
              - columnheader "Day"
        - list:
          - listitem:
            - checkbox "Done" [checked]
            - paragraph: Venue booked
    `)
    const editor = page.getByRole('textbox', { name: 'Document: notes' })
    await expect(editor).toHaveAttribute('aria-multiline', 'true')
    await expect(editor.getByRole('heading', { level: 2 })).toHaveCount(6)
    await expect(editor.getByRole('table')).toHaveCount(1)
    await expect(editor.getByRole('columnheader')).toHaveCount(3)
    await expect(editor.getByRole('list')).toHaveCount(4)
    await expect(editor.getByRole('checkbox', { name: 'Done' })).toHaveCount(3)
  })

  test('Chromium\'s own accessibility tree holds the document, in the page\'s', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP is Chromium\'s')
    await start(page, { markdown: '# Title\n\nSome **bold** text.\n' })
    const cdp = await page.context().newCDPSession(page)
    const tree = await cdp.send('Accessibility.getFullAXTree')
    const roles = tree.nodes.filter((n) => !n.ignored).map((n) => `${n.role?.value}:${n.name?.value ?? ''}`)
    expect(roles).toContain('textbox:Document: notes')
    expect(roles).toContain('heading:Title')
    await cdp.detach()
  })
})

test.describe('a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

  test('the document fits, a tap puts the caret, typing, the "/" menu, the bubble and Accept work', async ({ page }) => {
    const { doc } = await start(page)
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(widths.scroll).toBeLessThanOrEqual(widths.client)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const frameAt = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('.document').boundingBox())
    expect(frameAt.width).toBeGreaterThan((page.viewportSize()?.width ?? 0) - 40)
    // A wide table scrolls in its own box.
    const table = await page.evaluate(() => { const wrap = /** @type {HTMLElement} */ (document.querySelector('.tableWrapper')); return { overflow: getComputedStyle(wrap).overflowX, inside: wrap.getBoundingClientRect().right <= document.documentElement.clientWidth + 1 } })
    expect(table).toEqual({ overflow: 'auto', inside: true })
    await doc.locator('p', { hasText: 'Questions?' }).tap()
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('doc')
    await page.keyboard.insertText('Tapped. ')
    await expect.poll(() => markdownOf(page)).toMatch(/Tapped\. /)
    // "/" on a line of its own: the menu fits on the screen, each choice a finger wide.
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('/')
    const menu = page.getByRole('listbox')
    await expect(menu).toBeVisible()
    const view = /** @type {{ width: number, height: number }} */ (page.viewportSize())
    const menuAt = /** @type {{ x: number, y: number, width: number, height: number }} */ (await menu.boundingBox())
    expect(menuAt.x).toBeGreaterThanOrEqual(frameAt.x)
    expect(menuAt.x + menuAt.width).toBeLessThanOrEqual(Math.min(view.width, frameAt.x + frameAt.width) + 1)
    for (const option of await menu.getByRole('option').all()) {
      const box = await option.boundingBox()
      if (box) expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await menu.getByRole('option', { name: 'To-do list' }).tap()
    await page.keyboard.insertText('Pack')
    await expect.poll(() => markdownOf(page)).toContain('- [ ] Pack')
    // A selection, as the handles leave it: the bubble below it, where the system's menu isn't, each button a finger wide.
    await selectText(page, 'Pack')
    await page.evaluate(() => { const { view } = /** @type {any} */ (globalThis).editor; document.querySelector('app-preview .view')?.scrollBy(0, view.coordsAtPos(view.state.selection.from).top - 120) })
    const bubble = page.getByRole('toolbar', { name: 'Format' })
    await expect(bubble).toBeVisible()
    const below = await page.evaluate(() => { const { view } = /** @type {any} */ (globalThis).editor; return view.coordsAtPos(view.state.selection.to).bottom })
    await expect.poll(async () => (await bubble.boundingBox())?.y ?? 0).toBeGreaterThan(below)
    for (const button of await bubble.getByRole('button').all()) expect(Math.min(...Object.values(/** @type {{ width: number, height: number }} */ (await button.boundingBox())).slice(2))).toBeGreaterThanOrEqual(44)
    await bubble.getByRole('button', { name: 'Bold' }).tap()
    await expect.poll(() => markdownOf(page)).toContain('- [ ] **Pack**')
    await suggest(page, (await markdownOf(page)).replace('plan for the week', 'plan for the fortnight'))
    const accept = doc.locator('.suggest-accept')
    const box = /** @type {{ width: number, height: number }} */ (await accept.boundingBox())
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40)
    await accept.tap()
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the fortnight')
  })

  test('blocks on a phone: the grip beside the block the caret is in, a finger wide; a tap selects it and opens its menu', async ({ page }) => {
    const { doc } = await start(page, { markdown: '# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n' })
    const grip = page.locator('.block-handle')
    await expect(grip).toBeHidden()
    await doc.locator('p', { hasText: 'Second' }).tap()
    await expect(grip).toBeVisible()
    const at = /** @type {{ x: number, y: number, width: number, height: number }} */ (await grip.boundingBox())
    expect(Math.min(at.width, at.height)).toBeGreaterThanOrEqual(44)
    expect(at.x).toBeGreaterThanOrEqual((await page.locator('.document').boundingBox())?.x ?? 0)
    await grip.tap()
    await expect(page.locator('#doc > .block-selected')).toHaveText(['Second paragraph.'])
    const menu = page.getByRole('menu', { name: 'Block options' })
    for (const item of await menu.getByRole('menuitem').all()) expect((await item.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await menu.getByRole('menuitem', { name: 'Move up' }).tap()
    expect(await markdownOf(page)).toBe('# Plan\n\nSecond paragraph.\n\nFirst paragraph.\n')
  })
})
