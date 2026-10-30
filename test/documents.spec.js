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
import { readZip } from '../app/core/zip.js'
import { start as begin, connectFakeBrain, ask, answered, openTasks, openSettings, addProject, enterProject, SHARE_URL } from './helpers.js'

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
    ;(await import('/ui/preview.js')).preview({ uri: path, name: 'notes.md', title: 'notes', mimeType: 'text/markdown' })
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
    await page.evaluate((path) => import('/ui/preview.js').then(({ preview }) => preview({ uri: path, name: 'notes.md', title: 'notes', mimeType: 'text/markdown' })), PATH)
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
    await expect(doc.locator('.drawn.is-drawn .drawn-form app-diagram img').first()).toBeVisible()
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
    await expect(doc.locator('.drawn-form figure app-diagram img').first()).toBeVisible()
    // The same blocks drawn by Jean's own renderer, as an answer is, as wide.
    await page.evaluate(async (text) => {
      const [{ markdown }, { render }] = await Promise.all([import('/ui/markdown.js'), import('lit-html')])
      const answer = Object.assign(document.createElement('div'), { className: 'prose answer-like' })
      answer.style.inlineSize = `${document.querySelector('#doc .drawn-form')?.clientWidth}px`
      document.body.append(answer)
      render(markdown(text), answer)
    }, blocks)
    await expect(page.locator('.answer-like app-score svg').first()).toBeVisible()
    await expect(page.locator('.answer-like figure app-diagram img').first()).toBeVisible()
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
    const drawn = (/** @type {import('@playwright/test').Locator} */ where) => where.locator('app-chart :is(canvas, svg), .diagram img').first()
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
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Cover letter')
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
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Application')
    await expect(box).toBeFocused()
    await box.pressSequentially('shorter')
    await box.press('Enter')
    await answered(page)
    // The task's first message leaves it open; the brain read which documents the project keeps, which one @ named, and its text.
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Application')
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
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Application')
    await expect(page).toHaveURL(/\?split=row\(here,documents\/[0-9A-HJKMNP-TV-Z]{26}-application\.md\)$/)
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

  test('Creations, once there are some: the drawer\'s place opens their page, nothing beside it under the pointer, a card each, kept in the address; each opens beside the task (D497, D605)', async ({ page }) => {
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

    // The pointer resting on it shows nothing beside it (D605).
    await place.hover()
    await expect(page.locator('.menu:popover-open')).toHaveCount(0)

    // Pressed: their page, on a new task, a card each, the latest changed first, its start drawn, in the address, and again after a reload.
    await place.click()
    const cards = page.locator('app-creations .creation')
    await expect(page.locator('app-creations h1')).toHaveText('Creations')
    await expect(cards).toHaveCount(7)
    await expect(cards.first().locator('.creation-open')).toHaveText('Recipe')
    await expect(cards.first().locator('.creation-preview h3')).toHaveText('Recipe')
    await expect(page).toHaveURL(/#\/\?creations$/)
    // Where Jean's data doesn't last, as in Playwright's WebKit (a private window's), a reload would start empty.
    if (!(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value))) {
      // The drawer put away and opened again, kept open on this device, so that it loads with the page, before the room has its project.
      const toggle = page.locator('.sidebar-toggle')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await page.reload()
      await expect(cards).toHaveCount(7)
      // The first New task after the reload leaves the page, and the address with it.
      await tasks.getByRole('button', { name: 'New task' }).click()
      await expect(page.locator('app-creations')).toHaveCount(0)
      await expect(page).toHaveURL(/#\/$/)
      // So does one asked for while its cards are still read after a reload, slow as many tasks' scores are: the page doesn't come once they are.
      await place.click()
      await expect(page).toHaveURL(/#\/\?creations$/)
      const slow = '**/ui/creations-page.js', read = page.waitForResponse((response) => response.url().endsWith('/ui/creations-page.js'))
      await page.route(slow, async (route) => { await new Promise((resolve) => setTimeout(resolve, 2000)); await route.continue() })
      await page.reload()
      await expect(page.locator('.hero-question')).toBeVisible()
      await tasks.getByRole('button', { name: 'New task' }).click()
      await read
      await expect(page).toHaveURL(/#\/$/)
      await expect(page.locator('app-creations')).toHaveCount(0)
      await page.unroute(slow)
      await place.click()
      await expect(cards).toHaveCount(7)
    }
    // A card picked, anywhere on it, opens beside the page, which stays.
    await cards.nth(2).click()
    await expect(page.locator('#doc h1')).toHaveText('Plan')
    await expect(page.locator('app-creations')).toBeVisible()
    await expect(page).toHaveURL(/\?creations&split=row\(here,documents\/[0-9A-HJKMNP-TV-Z]{26}-plan\.md\)$/)
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

    // Another project keeps the page, on its own creations, none yet; back home, on these.
    await place.click()
    await expect(cards).toHaveCount(7)
    await addProject(page, 'Garden')
    await enterProject(page, 'Garden')
    await expect(page.locator('app-creations .creations-start')).toHaveClass(/is-empty/)
    await expect(cards).toHaveCount(0)
    await expect(page).toHaveURL(/#\/p\/[0-9A-HJKMNP-TV-Z]{26}\/\?creations$/)
    await enterProject(page, 'Jean')
    await expect(cards).toHaveCount(7)
    await expect(page).toHaveURL(/#\/\?creations$/)
  })

  test('Creations makes a new document, which goes by its title, and a new table, its name to type beside the task, each written once the user does something in it (D502, D544)', async ({ page }) => {
    await begin(page)
    const tasks = await openTasks(page)
    const place = tasks.getByRole('button', { name: 'Creations', exact: true })
    await page.evaluate(async () => { const { unlock } = await import('/ui/caps.js'); await unlock('documents'); await unlock('tables') })
    // Found, with nothing made yet: the place is as wide as the drawer's others, and the page has a card to start one of each (D544).
    await place.click()
    const creations = page.locator('app-creations')
    await expect(creations.locator('.creation')).toHaveCount(0)
    const [own, other] = await Promise.all([place.boundingBox(), tasks.getByRole('button', { name: 'New task' }).boundingBox()])
    expect(own?.width).toBe(other?.width)
    await expect(creations.locator('.creation-start b')).toHaveText(['Document', 'Collection'])
    // Nothing yet: each card unfolds into an empty one of its kind, with nothing to find or order (D544).
    await expect(creations.locator('.creations-start')).toHaveClass(/is-empty/)
    await expect(creations.locator('.creations-find, .creations-order')).toHaveCount(0)
    /** The project's creations of a kind, by name, as Documents and Tables keep them. @param {string} id */
    const names = (id) => page.evaluate(async (cap) => (await (await import(`/caps/${cap}/${cap}.js`)).kept()).map((one) => one.name), id)
    // Open beside the task, but nothing written until the user writes.
    await creations.getByRole('button', { name: /^Document/ }).click()
    await expect(page.locator('#doc')).toBeFocused()
    await page.waitForTimeout(500)
    expect(await names('documents')).toEqual([])
    await expect(creations.locator('.creation')).toHaveCount(0)
    await page.keyboard.type('Budget')
    await expect(page.locator('#doc h1')).toHaveText('Budget')
    await expect.poll(() => names('documents')).toEqual(['Budget'])
    await expect(creations.getByRole('button', { name: 'Budget' })).toBeVisible()
    // One: the cards fold, and one creation has no order yet.
    await expect(creations.locator('.creations-start')).not.toHaveClass(/is-empty/)
    await expect(creations.locator('.creations-order')).toHaveCount(0)

    // The bar's New makes one too.
    // Create, its menu naming each kind by its noun.
    await creations.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(creations.locator('.creations-menu:popover-open button')).toHaveText(['Document', 'Collection'])
    await creations.locator('.creations-menu:popover-open').getByRole('button', { name: 'Collection' }).click()
    const name = page.locator('app-preview .table-name')
    await expect(name).toBeFocused()
    await page.waitForTimeout(500)
    expect(await names('tables')).toEqual([])
    await page.keyboard.type('Trips')
    await page.keyboard.press('Tab')
    await expect.poll(() => names('tables')).toEqual(['Trips'])
    await expect(creations.locator('.creation')).toHaveCount(2)
    // Two can be ordered, and shown by kind, but there is nothing to find yet.
    await expect(creations.getByRole('button', { name: 'Sort by: Last changed' })).toBeVisible()
    await expect(creations.getByRole('button', { name: 'Show: All' })).toBeVisible()
    await expect(creations.locator('.creations-find')).toHaveCount(0)
  })

  test('on a wide page the cards to start one share a row, piled where it is too narrow, the ones after a card pointed at sliding away from it, and a narrower page, a file beside it too, or a touch screen keeps the cards\' columns (D571)', async ({ page, browserName }) => {
    await begin(page)
    await page.evaluate(async () => { const { unlock } = await import('/ui/caps.js'); for (const id of ['documents', 'tables', 'skills', 'pictures']) await unlock(id) })
    const tasks = await openTasks(page)
    await tasks.getByRole('button', { name: 'Creations', exact: true }).click()
    const row = page.locator('app-creations .creations-start'), starts = row.locator('.creation-start')
    await expect(starts).toHaveCount(6)
    const boxes = async () => /** @type {{ x: number, y: number, width: number }[]} */ (await Promise.all([row, ...await starts.all()].map((one) => one.boundingBox())))
    // A smaller desktop window: the cards' own columns, on two rows.
    await page.setViewportSize({ width: 1000, height: 720 })
    await expect.poll(async () => { const [, a, , , , , f] = await boxes(); return f.y > a.y }).toBe(true)
    // A window of 1,280 px, the drawer open: one row, each card but the last piled under the next, the last within the row.
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect.poll(async () => new Set((await boxes()).slice(1).map((one) => one.y)).size).toBe(1)
    const [line, first, second, , , , last] = await boxes()
    expect(second.x).toBeLessThan(first.x + first.width)
    expect(last.x + last.width).toBeLessThanOrEqual(line.x + line.width + 1)
    // Pointed at, a card stays where it is, the next sliding away to the row's gap after it, those after it each by its share so
    // that their steps stay even, the last staying put; the one before the last pointed at, the last slides on past the row's end.
    await starts.first().hover({ position: { x: 20, y: 20 } })
    await expect.poll(async () => { const [, one, two] = await boxes(); return Math.round(two.x - (one.x + one.width)) }).toBe(12)
    const [, one, two, three, four, five, end] = await boxes()
    expect([one.x, end.x]).toEqual([first.x, last.x])
    const steps = [three.x - two.x, four.x - three.x, five.x - four.x, end.x - five.x]
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1.5)
    await starts.nth(4).hover({ position: { x: 20, y: 20 } })
    await expect.poll(async () => { const [, , , , , pointed, after] = await boxes(); return Math.round(after.x - (pointed.x + pointed.width)) }).toBe(12)
    // The same window with a document beside the page: the page, not the window, is what is narrow, so two by two as on a phone;
    // closed, the row again.
    await starts.first().click()
    await expect(page.locator('#doc')).toBeFocused()
    await expect.poll(async () => { const [, a, b, c] = await boxes(); return [b.y === a.y && b.x !== a.x, c.y > a.y] }).toEqual([true, true])
    await page.locator('app-preview').getByRole('button', { name: 'Close' }).click()
    await expect.poll(async () => new Set((await boxes()).slice(1).map((one) => one.y)).size).toBe(1)
    // A touch screen, however wide: the cards' own columns, on two rows. Chromium can be told it is one; Playwright's WebKit can't.
    if (browserName === 'chromium') {
      await page.mouse.move(0, 0)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] })
      await page.setViewportSize({ width: 1360, height: 720 })
      await expect.poll(async () => { const [, a, , , , , f] = await boxes(); return f.y > a.y }).toBe(true)
    }
  })

  test('Creations are found by their words and kind, pinned first, renamed in place with their title line, duplicated, and deleted with five seconds to undo, from each card\'s menu (D544)', async ({ page }) => {
    await begin(page)
    await connectFakeBrain(page)
    const tasks = await openTasks(page)
    const place = tasks.getByRole('button', { name: 'Creations', exact: true })
    await page.evaluate(async (all) => {
      const [{ app }, { ulid }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/core/ulid.js'), import('/ui/caps.js')])
      for (const [i, name] of all.entries()) {
        const at = new Date(Date.now() - (all.length - i) * 60000).toISOString()
        await app.fs.write(`${app.projectDir}/documents/${ulid()}-${name.toLowerCase()}.md`, `---\nformat: 1\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# ${name}\n\nAbout the ${name.toLowerCase()}.\n`)
      }
      await unlock('documents')
      await unlock('tables')
      // Skills too, whose slides and scores the project holds none of yet.
      await unlock('skills')
      await (await import('/caps/tables/tables.js')).blank()
    }, ['Budget', 'Menu', 'Letter'])
    /** The project's documents, by name and by what their file says. */
    const files = () => page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      return Object.fromEntries(await Promise.all((await (await import('/caps/documents/documents.js')).kept()).map(async ({ name, path }) => [name, await app.fs.read(`${app.projectDir}/${path}`)])))
    })
    await place.click()
    const creations = page.locator('app-creations'), cards = creations.locator('.creation'), names = cards.locator('.creation-open')
    await expect(names).toHaveText(['New collection', 'Letter', 'Menu', 'Budget'])
    await expect(creations.locator('.creations-group')).toHaveText(['Today4'])

    // By kind, from Show's menu beside Sort's, every kind with its count, those with none too, the button marked while a kind is
    // picked; four have nothing to find among them, the search coming with a fifth (D544, D559).
    const show = creations.locator('.creations-kinds'), kind = (/** @type {string} */ name) => creations.locator('#creations-kinds').getByRole('menuitemradio', { name })
    await expect(show).toHaveAttribute('aria-label', 'Show: All')
    await show.click()
    await expect(kind('All 4')).toHaveAttribute('aria-checked', 'true')
    await expect(creations.locator('#creations-kinds [role="menuitemradio"]')).toHaveText(['All 4', 'Docs 3', 'Collections 1', 'Slides 0', 'Music 0'])
    await kind('Collections 1').click()
    await expect(show).toHaveAttribute('aria-label', 'Show: Collections')
    await expect(show).toHaveClass(/is-on/)
    await expect(names).toHaveText(['New collection'])
    await expect(page).toHaveURL(/#\/\?creations=tables$/)
    // Every kind's card to start one stays, whichever kind is picked.
    await expect(creations.locator('.creation-start b')).toHaveText(['Document', 'Collection', 'Slides', 'Score'])
    // A kind with none yet shows none, New making one of it.
    await show.click()
    await kind('Slides 0').click()
    await expect(show).toHaveAttribute('aria-label', 'Show: Slides')
    await expect(names).toHaveCount(0)
    await expect(creations.locator('.creations-bar').getByRole('button', { name: 'Create', exact: true })).toHaveAttribute('title', 'Slides')
    await show.click()
    await kind('All 4').click()
    await expect(show).not.toHaveClass(/is-on/)
    await expect(creations.locator('.creations-find')).toHaveCount(0)

    // Pinned: first, under its own heading, in its file, and in the drawer's Pinned with its kind's glyph, opening beside the task (D605).
    const menu = async (/** @type {string} */ name) => {
      await cards.filter({ hasText: name }).click({ button: 'right' })
      return creations.locator('.task-menu:popover-open')
    }
    await (await menu('Menu')).getByRole('button', { name: 'Pin' }).click()
    await expect(creations.locator('.creations-group')).toHaveText(['Pinned1', 'Today3'])
    await expect(names.first()).toHaveText('Menu')
    await expect.poll(async () => (await files()).Menu).toContain('pinned: true')
    // Pinned folds its cards, its count kept, and unfolds them, kept so on this device: across a reload where Jean's data lasts,
    // else with the page left and opened again (D651).
    const fold = creations.getByRole('heading', { name: /^Pinned/ }).getByRole('button')
    await fold.click()
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(creations.locator('.creations-group')).toHaveText(['Pinned1', 'Today3'])
    await expect(names).toHaveText(['New collection', 'Letter', 'Budget'])
    if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) {
      await tasks.getByRole('button', { name: 'New task' }).click()
      await expect(creations).toHaveCount(0)
      await place.click()
    } else await page.reload()
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(names).toHaveText(['New collection', 'Letter', 'Budget'])
    await fold.click()
    await expect(names).toHaveText(['Menu', 'New collection', 'Letter', 'Budget'])
    const pinned = tasks.locator('.history-list li', { hasText: 'Menu' })
    await expect(tasks.locator('.sidebar-heading')).toHaveText(['Pinned', 'Tasks'])
    expect(await pinned.locator('.history-item .icon').innerHTML()).toBe(await cards.filter({ hasText: 'Menu' }).locator('.creation-open .icon').innerHTML())
    await pinned.locator('.history-item').click()
    await expect(page.locator('#doc h1')).toHaveText('Menu')

    // Renamed in place: Enter keeps it, its title line too, even open beside the task; Escape doesn't.
    await cards.filter({ hasText: 'Budget' }).locator('.creation-open').click()
    await expect(page.locator('#doc h1')).toHaveText('Budget')
    await (await menu('Budget')).getByRole('button', { name: 'Rename' }).click()
    const box = creations.locator('.creation-rename')
    await expect(box).toBeFocused()
    await expect(box).toHaveValue('Budget')
    await page.keyboard.type('Budget 2027')
    await page.keyboard.press('Enter')
    await expect(names.filter({ hasText: 'Budget 2027' })).toBeFocused()
    await expect(page.locator('#doc h1')).toHaveText('Budget 2027')
    await expect.poll(async () => (await files())['Budget 2027']).toContain('# Budget 2027\n')
    await (await menu('Letter')).getByRole('button', { name: 'Rename' }).click()
    await page.keyboard.type('Note')
    await page.keyboard.press('Escape')
    await expect(names.filter({ hasText: 'Letter' })).toHaveCount(1)

    // Duplicated: the copy first under Today, its name selected for one of its own, its title line with it.
    await (await menu('Letter')).getByRole('button', { name: 'Duplicate' }).click()
    await expect(box).toBeFocused()
    await expect(box).toHaveValue('Letter (copy)')
    await page.keyboard.type('Letter to Anna')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await files())['Letter to Anna']).toContain('# Letter to Anna\n\nAbout the letter.')
    await expect(names).toHaveText(['Menu', 'Letter to Anna', 'Budget 2027', 'New collection', 'Letter'])

    // Five: found by their words, case aside, the search a round button until it has the keyboard; nothing found says so and clears.
    const find = creations.getByRole('searchbox', { name: 'Find a creation' }), round = await creations.locator('.creations-find').boundingBox()
    expect(Math.abs((round?.width ?? 0) - (round?.height ?? 0))).toBeLessThan(2)
    await creations.locator('.creations-find').click()
    await expect(find).toBeFocused()
    await expect.poll(async () => (await creations.locator('.creations-find').boundingBox())?.width).toBeGreaterThan(200)
    await find.fill('ABOUT THE MENU')
    await expect(names).toHaveText(['Menu'])
    await expect(creations.locator('.creation-start')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/\?creations=all\/changed\/ABOUT%20THE%20MENU(&|$)/)
    await find.fill('passport')
    await expect(creations.locator('.creations-none')).toContainText('No creation matches “passport”.')
    await creations.getByRole('button', { name: 'Clear' }).click()
    await expect(names).toHaveCount(5)
    await expect(page).toHaveURL(/#\/\?creations(&|$)/)

    // Deleted: off the page at once, back with Undo; deleted again, gone from the project five seconds later.
    await (await menu('Letter to Anna')).getByRole('button', { name: 'Delete' }).click()
    await expect(names).toHaveCount(4)
    await expect(page.locator('.toast')).toContainText('“Letter to Anna” deleted.')
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
    await expect(names).toHaveCount(5)
    await (await menu('Letter to Anna')).getByRole('button', { name: 'Delete' }).click()
    await expect(names).toHaveCount(4)
    expect(Object.keys(await files())).toContain('Letter to Anna')
    await expect.poll(async () => Object.keys(await files()), { timeout: 8000 }).not.toContain('Letter to Anna')
    await expect(creations.locator('.creations-find')).toHaveCount(0)

    // By name, in the language's order, those pinned still first; a kind picked, New is that kind's own.
    await creations.getByRole('button', { name: 'Sort by: Last changed' }).click()
    await creations.getByRole('menuitemradio', { name: 'Name' }).click()
    await expect(names).toHaveText(['Menu', 'Budget 2027', 'Letter', 'New collection'])
    await show.click()
    await kind('Docs 3').click()
    await expect(show).toHaveAttribute('aria-label', 'Show: Docs')
    await expect(creations.locator('.creations-bar').getByRole('button', { name: 'Create', exact: true })).toHaveAttribute('title', 'Document')
    await expect(creations.locator('.creation-start b')).toHaveText(['Document', 'Collection', 'Slides', 'Score'])

    // In the address as the page shows them (D220), and only there: opened again from the drawer after a task, the page is as it
    // first shows; Back to it shows it as it was, and so does a reload.
    await expect(page).toHaveURL(/#\/\?creations=documents\/name(&|$)/)
    await names.filter({ hasText: 'Letter' }).click()
    await ask(page, 'Make it shorter')
    await answered(page)
    await place.click()
    await expect(page).toHaveURL(/[?&]creations(&|$)/)
    await expect(show).toHaveAttribute('aria-label', 'Show: All')
    await expect(creations.getByRole('button', { name: 'Sort by: Last changed' })).toBeVisible()
    await page.goBack()
    await expect(creations).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/[?&]creations=documents\/name(&|$)/)
    await expect(show).toHaveAttribute('aria-label', 'Show: Docs')
    await expect(creations.getByRole('button', { name: 'Sort by: Name' })).toBeVisible()
    await expect(names).toHaveText(['Menu', 'Budget 2027', 'Letter'])
    if (!(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value))) {
      await page.reload()
      await expect(show).toHaveAttribute('aria-label', 'Show: Docs')
      await expect(names).toHaveText(['Menu', 'Budget 2027', 'Letter'])
    }

    // Unpinned from its menu in the drawer: gone from Pinned, and from the page's (D605).
    const drawer = await openTasks(page)
    const row = drawer.locator('.history-list li', { hasText: 'Menu' })
    await row.hover()
    await row.getByRole('button', { name: 'More options' }).click()
    await row.getByRole('button', { name: 'Unpin' }).click()
    await expect(drawer.locator('.sidebar-heading')).toHaveText(['Tasks'])
    await expect(creations.locator('.creations-group')).toHaveCount(0)
    await expect(names).toHaveText(['Budget 2027', 'Letter', 'Menu'])
  })

  test('hundreds of creations: each group draws only the cards in view, as long as all of them, the far ones drawn as they are scrolled to, and a copy of the last one\'s name box takes the keyboard at the top (D627)', async ({ page }) => {
    await begin(page)
    const tasks = await openTasks(page)
    await page.evaluate(async () => {
      const [{ app }, { ulid }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/core/ulid.js'), import('/ui/caps.js')])
      await Promise.all(Array.from({ length: 400 }, (_, i) => {
        const at = new Date(Date.now() - i * 7 * 36e5).toISOString()
        return app.fs.write(`${app.projectDir}/documents/${ulid()}-note-${i}.md`, `---\nformat: 1\nname: Note ${i}\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# Note ${i}\n`)
      }))
      await unlock('documents')
    })
    await tasks.getByRole('button', { name: 'Creations', exact: true }).click()
    const creations = page.locator('app-creations'), cards = creations.locator('.creation'), names = cards.locator('.creation-open span')
    await expect(names.first()).toHaveText('Note 0')
    // Every group's head, with its count, but only the cards in view and a screen either side, each saying its place in its group.
    const counts = await creations.locator('.creations-group span').allTextContents()
    expect(counts.reduce((sum, one) => sum + Number(one.replace(/\D/g, '')), 0)).toBe(400)
    expect(await cards.count()).toBeLessThan(120)
    await expect(cards.first()).toHaveAttribute('aria-posinset', '1')
    await expect(cards.first()).toHaveAttribute('aria-setsize', counts[0])
    // As long as all of them: at the page's end, the oldest, its preview drawn.
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    const oldest = cards.filter({ hasText: 'Note 399' })
    await expect(oldest).toBeInViewport()
    await expect(oldest.locator('.creation-preview')).toContainText('Note 399')
    await expect(names.filter({ hasText: /^Note 0$/ })).toHaveCount(0)
    // Its copy goes first under Today, drawn there at once, its name in a box that takes the keyboard.
    await oldest.getByRole('button', { name: 'More options' }).click()
    await page.locator('#creation-menu').getByRole('button', { name: 'Duplicate' }).click()
    const box = creations.locator('.creation-rename')
    await expect(box).toBeFocused()
    await expect(box).toHaveValue(/Note 399/)
    await expect(box).toBeInViewport()
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

  test('the empty line the caret is on says what "/" adds, while the document has the keyboard, never in a list (D650)', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'First.\n\n- one\n' })
    const hint = (/** @type {import('@playwright/test').Locator} */ line) => line.evaluate((p) => getComputedStyle(p, '::before').content)
    await caretAt(page, 'First.', 6)
    await expect.poll(() => hint(doc.locator('p').first())).toBe('none')
    await page.keyboard.press('Enter')
    const line = page.locator('#doc > p').nth(1)
    await expect.poll(() => hint(line)).toBe('"Type / to add a list, a table, a chart…"')
    // On one line, inside the line's own width.
    expect(await line.evaluate((p) => [getComputedStyle(p, '::before').whiteSpace, getComputedStyle(p, '::before').textOverflow])).toEqual(['nowrap', 'ellipsis'])
    await page.keyboard.type('/')
    await expect.poll(() => hint(line)).toBe('none')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Backspace')
    await expect.poll(() => hint(line)).not.toBe('none')
    // Gone with the keyboard, and from a list's new item.
    await doc.evaluate((element) => element.blur())
    await expect.poll(() => hint(line)).toBe('none')
    await caretAt(page, 'one', 3)
    await page.keyboard.press('Enter')
    await expect.poll(() => hint(doc.locator('li p').nth(1))).toBe('none')
    expect(await doc.locator('[data-placeholder]:not(h1)').count()).toBe(0)
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
    // The line made before it, after the title, empty (D574).
    await at(page, 3)
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
    await expect.poll(() => markdownOf(page)).toMatch(/\n```table\ncollections\/[0-9A-HJKMNP-TV-Z]{26}-new-collection\n```\n$/)
    const kept = () => page.evaluate(async () => {
      const tables = await import('/caps/tables/tables.js')
      const [first] = await tables.kept()
      const one = await tables.load(first.path)
      return { name: one?.table.name, columns: one?.table.properties.map((property) => `${property.name} (${property.type})`), rows: one?.rows.map((row) => row.cells) }
    })
    // It starts with one empty row, its first field taking the keyboard, to write in at once.
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.locator('tbody').getByLabel('Name', { exact: true })).toBeFocused()
    await page.keyboard.type('Lisbon')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await kept()).rows).toEqual([{ name: 'Lisbon' }])
    // Changed in place, as in the pane: its name, a column of a kind named at once.
    await table.getByLabel('Collection name').fill('Stays')
    await table.getByLabel('Collection name').press('Tab')
    await table.getByLabel('Add a column').selectOption('Date')
    await expect(table.locator('thead input')).toBeFocused()
    await page.keyboard.type('Arrival')
    await page.keyboard.press('Tab')
    await table.locator('tbody').getByLabel('Arrival', { exact: true }).fill('2026-11-03')
    await table.locator('tbody').getByLabel('Arrival', { exact: true }).press('Tab')
    await expect.poll(kept).toEqual({ name: 'Stays', columns: ['Name (text)', 'Arrival (date)'], rows: [{ name: 'Lisbon', date: '2026-11-03' }] })
    // Still drawn: what was done in it never took the caret into its text.
    await expect(table.locator('.table-grid')).toBeVisible()
    expect(await problems(page)).toEqual([])
  })

  test('an existing collection found by its name after the slash, and held where the line is (D510)', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'Trip.\n' })
    const menu = page.getByRole('listbox')
    // Two collections the project keeps, made before, one with a row.
    const [jobs] = await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      await (await import('/ui/caps.js')).unlock('tables')
      return Promise.all([['01K85Z1T00000000000000000A', 'Job applications', 'jobs'], ['01K85Z1T00000000000000000B', 'Reading list', 'reading']].map(async ([id, name, slug]) => {
        const folder = `collections/${id}-${slug}`
        const at = '2026-10-21T09:00:00.000Z'
        await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id, name, author: 'user', created: at, changed: at, properties: [{ id: 'name', name: 'Name', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
        await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, slug === 'jobs' ? `${JSON.stringify({ row: '01K80000000000000000000001', set: { name: 'Atelier Lune' }, at, by: 'user' })}\n` : '')
        return folder
      }))
    })
    await caretAt(page, 'Trip.', 5)
    await page.keyboard.press('Enter')
    // "/" alone offers what a line can become, none of them.
    await page.keyboard.type('/')
    await expect(menu.getByRole('option', { name: 'New collection' })).toBeVisible()
    await expect(menu.getByRole('option', { name: 'Job applications' })).toHaveCount(0)
    // Some of its name, and it is there, alone.
    await page.keyboard.type('job')
    await expect(menu.getByRole('option')).toHaveText([/Job applications/])
    await page.keyboard.press('Enter')
    const table = doc.locator('.drawn-form app-table')
    await expect(table.getByLabel('Collection name')).toHaveValue('Job applications')
    await expect(table.locator('tbody tr').first().getByLabel('Name', { exact: true })).toHaveValue('Atelier Lune')
    await expect.poll(() => markdownOf(page)).toBe(`Trip.\n\n\`\`\`table\n${jobs}\n\`\`\`\n`)
    // "Collection" offers a new one, then those the project keeps, the latest made first.
    await page.keyboard.type('/collection')
    await expect(menu.getByRole('option')).toHaveText([/New collection/, /Reading list/, /Job applications/])
    await page.keyboard.press('Escape')
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
    await start(page, { markdown: '# Notes\n\n## A heading of the document\n\nA paragraph.\n\n- An item\n' })
    for (const selector of ['#doc > h2', '#doc > p', '#doc li']) {
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
    // The first block, under the title, can't move up: its Move up is off (D574).
    await caretAt(page, 'Second paragraph')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+F10')
    await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Move down' })).toBeFocused()
  })

  test('the grip\'s menu offers all that "/" does: what the block can become, and the rest added below it, in an empty line\'s place, after a list (D650)', async ({ page }) => {
    const { doc } = await start(page, { markdown: DOC })
    const menu = page.getByRole('menu', { name: 'Block options' })
    const names = (/** @type {import('@playwright/test').Locator} */ items) => items.evaluateAll((all) => all.map((one) => one.lastChild?.textContent ?? '').sort())
    // What "/" offers on a line, but Text, which a paragraph is already.
    await caretAt(page, 'Last paragraph.', 15)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    const offered = await names(page.getByRole('listbox', { name: 'Turn into' }).getByRole('option'))
    await page.keyboard.press('Escape')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await (await gripOf(page, page.locator('#doc > p').nth(0))).click()
    const add = menu.getByRole('group', { name: 'Add below' })
    expect(await names(menu.locator('[role="group"] [role="menuitem"]'))).toEqual(offered.filter((name) => name !== 'Text'))
    await expect(menu.locator('.block-menu-head')).toHaveText(['Turn into', 'Add below'])
    // Below a paragraph, a divider, the caret on the line after it; ⌘Z takes it all back at once.
    await add.getByRole('menuitem', { name: 'Divider' }).click()
    expect(await markdownOf(page)).toBe('# Plan\n\nFirst paragraph.\n\n---\n\nSecond paragraph.\n\n- one\n- two\n\nLast paragraph.\n')
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('doc')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await markdownOf(page)).toBe(DOC)
    // In place of an empty line, and after a list, from an item of it.
    await caretAt(page, 'Last paragraph.', 15)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+F10')
    await add.getByRole('menuitem', { name: 'Callout' }).click()
    await page.keyboard.type('Pack light.')
    await (await gripOf(page, doc.locator('li').first())).click()
    await add.getByRole('menuitem', { name: 'Divider' }).click()
    await expect.poll(() => markdownOf(page)).toBe('# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- one\n- two\n\n---\n\nLast paragraph.\n\n> 💡 Pack light.\n')
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
    // Past the first screen's, under the title.
    const count = await page.locator('#doc > .block-selected').count()
    expect(count).toBeGreaterThan(15)
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
    // At the top, under the title, there is nothing more to take (D574).
    await caretAt(page, 'First')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+ArrowUp')
    await expect(selected).toHaveText(['First paragraph.'])
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
    // Under the title, they move no higher (D574).
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    expect(await markdownOf(page)).toBe(DOC)
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    expect(await markdownOf(page)).toBe('# Plan\n\n- one\n- two\n\nFirst paragraph.\n\nSecond paragraph.\n\nLast paragraph.\n')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
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
    // Beside the title's short text, inside its box: the blocks under it, the title being none (D574).
    await drag(page, { x: heading.x + heading.width - 30, y: heading.y + heading.height / 2 }, { x: heading.x + heading.width - 60, y: second.y + 6 })
    await expect(page.locator('#doc > .block-selected')).toHaveText(['First paragraph.', 'Second paragraph.'])
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

  test('a click anywhere under the text, down to the pane\'s foot, puts the caret at its end, on a line of its own under a block drawn, which stays drawn', async ({ page }) => {
    const markdown = '# Notes\n\nThe last line.\n\n$$\na^2 + b^2 = c^2\n$$\n'
    await start(page, { markdown })
    const pane = await boxOf(page.locator('app-preview .view'))
    // A second click where the first was is the browser's (a double click), so each is elsewhere.
    const under = (/** @type {number} */ x) => page.mouse.click(pane.x + x, pane.y + pane.height - 10)
    /** Where the caret is: whether at the document's end, and the line it is on. */
    const caret = () => page.evaluate(() => { const { selection, doc } = /** @type {any} */ (globalThis).editor.view.state; return [selection.empty && selection.from === doc.content.size - 1, selection.$from.parent.type.name, selection.$from.parent.textContent] })
    await under(30)
    expect(await caret()).toEqual([true, 'paragraph', ''])
    await expect(page.locator('#doc .drawn')).toHaveClass(/is-drawn/)
    await expect(page.locator('#doc .drawn')).not.toHaveClass(/is-editing/)
    expect(await markdownOf(page)).toBe(markdown)
    await page.keyboard.type('Done.')
    await caretAt(page, 'Notes')
    // Under a line of text, the caret at its end, and no line more.
    await under(90)
    expect(await caret()).toEqual([true, 'paragraph', 'Done.'])
    await expect.poll(() => markdownOf(page)).toBe(`${markdown}\nDone.\n`)
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
    await expect(page.locator('#doc > .block-selected')).toHaveCount(2)
    expect(await kindOf(page)).toBe('block')
    const line = page.locator('#doc > p').nth(1)
    const grip = await gripOf(page, line)
    expect((await boxOf(grip)).x).toBeGreaterThanOrEqual((await boxOf(line)).x + (await boxOf(line)).width)
    await grip.click()
    // The menu of every block under the title, selected: nowhere to move them, so the first kind to turn them into takes the keyboard.
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

  test('where a block dragged goes shows in the look\'s colour, at 3:1 or more against the page, by night and by day', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await start(page, { markdown: 'First.\n\nSecond.\n' })
    /** The line over the first word, and its contrast against what is behind the document, each layer's colour over the one under it. */
    const contrast = () => page.evaluate(() => {
      const { view } = /** @type {any} */ (globalThis).editor
      const at = view.coordsAtPos(1)
      view.dom.dispatchEvent(new DragEvent('dragover', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true, clientX: at.left, clientY: (at.top + at.bottom) / 2 }))
      const context = /** @type {OffscreenCanvasRenderingContext2D} */ (new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true }))
      const rgba = (/** @type {Element} */ element) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = getComputedStyle(element).backgroundColor
        context.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
        return [r, g, b, a / 255]
      }
      const layers = []
      for (let element = view.dom; element; element = element.parentElement) layers.unshift(rgba(element))
      const under = layers.reduce((below, [r, g, b, a]) => [r, g, b].map((v, k) => v * a + below[k] * (1 - a)), [255, 255, 255])
      const line = rgba(/** @type {Element} */ (document.querySelector('.prosemirror-dropcursor-inline, .prosemirror-dropcursor-block')))
      const luminance = (/** @type {number[]} */ rgb) => rgb.slice(0, 3).map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, k) => sum + c * [0.2126, 0.7152, 0.0722][k], 0)
      const [hi, lo] = [luminance(line), luminance(under)].sort((p, q) => q - p)
      return (hi + 0.05) / (lo + 0.05)
    })
    expect(await contrast()).toBeGreaterThanOrEqual(3)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(contrast).toBeGreaterThanOrEqual(3)
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
  test('a new document\'s first line is its title, a heading of the first level, and an empty document stays empty', async ({ page }) => {
    const { doc } = await start(page, { markdown: '' })
    const title = doc.locator(':scope > h1:only-child')
    await expect(title).toHaveCount(1)
    expect(await title.evaluate((h1) => parseFloat(getComputedStyle(h1).fontSize))).toBeGreaterThan(24)
    // Empty, it says what it is for (D574), in the softer ink, and not once something is typed.
    // (WebKit gives the rule's empty data-ask too: "" "New document".)
    expect(await title.evaluate((h1) => getComputedStyle(h1, '::before').content.replace(/^"" /, ''))).toBe('"New document"')
    // Closed untouched, its file is as empty as it was.
    await page.locator('app-preview .pane-head button').last().click()
    await expect(page.locator('#doc')).toHaveCount(0)
    expect(await saved(page)).toBe('')
    await start(page, { markdown: '' })
    await at(page, 1)
    await page.keyboard.type('Plan')
    await expect(doc.locator(':scope > h1')).toHaveText('Plan')
    expect(await doc.locator(':scope > h1').evaluate((h1) => getComputedStyle(h1, '::before').content)).toBe('none')
    await page.keyboard.press('Enter')
    await page.keyboard.type('First step.')
    expect(await markdownOf(page)).toBe('# Plan\n\nFirst step.\n')
  })

  test('the first line is always the title, text alone: no "/" nor Markdown\'s kinds there, no marks nor line breaks, nothing before it, a picture pasted in it and a block let go on it going after it (D574)', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'First.\n\nSecond.\n' })
    // A document without one opens on an empty title, which isn't written.
    const title = doc.locator(':scope > h1:first-child')
    await expect(title).toHaveText('')
    await at(page, 1)
    await page.keyboard.type('/')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await page.keyboard.press('Backspace')
    await page.keyboard.type('- Plan')
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.type(' bold')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('!')
    await expect(title).toHaveText('- Plan bold!')
    await expect(title.locator('strong, br')).toHaveCount(0)
    expect(await markdownOf(page)).toBe('# - Plan bold!\n\nFirst.\n\nSecond.\n')
    // It is no block: Escape selects none, and no grip shows beside it.
    await page.keyboard.press('Escape')
    await expect(page.locator('.block-selected')).toHaveCount(0)
    const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await title.boundingBox())
    await page.mouse.move(box.x + 20, box.y + box.height / 2)
    await expect(page.locator('.block-handle')).toBeHidden()
    // A picture pasted in it goes on a line after it.
    await at(page, 3)
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(32, 18)
      ;/** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d')).fillRect(0, 0, 32, 18)
      const data = new DataTransfer()
      data.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })], 'image.png', { type: 'image/png' }))
      ;/** @type {any} */ (globalThis).editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect.poll(() => markdownOf(page)).toMatch(/^# - Plan bold!\n\n!\[\]\(\.\.\/files\/sha256-[\da-f]{64}\.png\)\n\nFirst\.\n\nSecond\.\n$/)
    // A block dragged by its grip onto it goes after it.
    const second = /** @type {{ x: number, y: number, width: number, height: number }} */ (await doc.locator('p', { hasText: 'Second.' }).boundingBox())
    await page.mouse.move(second.x + 20, second.y + second.height / 2)
    const grip = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('.block-handle').boundingBox())
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 10, box.y + 4, { steps: 12 })
    await page.mouse.up()
    await expect.poll(() => markdownOf(page)).toMatch(/^# - Plan bold!\n\nSecond\.\n\n!\[\]/)
    // Everything selected and deleted leaves an empty title, and an empty file.
    await at(page, 3)
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Delete')
    await expect(doc.locator(':scope > *')).toHaveCount(1)
    await expect(title).toHaveText('')
    expect(await markdownOf(page)).toBe('')
    expect(await problems(page)).toEqual([])
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
      ;(await import('/ui/preview.js')).preview({ uri: path, name: 'notes.md', title: 'notes', mimeType: 'text/markdown' })
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
    await expect(page.locator('app-preview .preview #slash-menu')).toBeVisible()
    // Escape would leave full screen, as browsers have it there: the slash taken back closes the menu.
    await page.keyboard.press('Backspace')
    await head.getByRole('button', { name: 'Exit full screen' }).click()
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
    await expect(page.locator('body > #slash-menu')).toHaveCount(1)
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

  test('what is pasted runs nothing and loads nothing but its pictures, without cookies nor the page\'s address, in Jean\'s own origin (D573)', async ({ page }) => {
    const requests = /** @type {string[]} */ ([])
    page.on('request', async (request) => { if (!(await request.headerValue('referer')) && !(await request.headerValue('cookie'))) requests.push(request.url()) })
    await page.addInitScript(() => addEventListener('message', ({ data }) => { if (typeof data === 'string') (/** @type {any} */ (globalThis).pwned ??= []).push(data) }))
    await start(page, { markdown: 'Start.\n' })
    await caretAt(page, 'Start.', 6)
    const hostile = '<p>Hi <img src="https://attacker.example/x.png" onerror="parent.postMessage(\'pwned\',\'*\')"><script>parent.postMessage(\'pwned2\',\'*\')</script><a href="javascript:parent.postMessage(\'pwned3\',\'*\')">click</a> <a href="https://ok.example/">ok</a><svg onload="parent.postMessage(\'pwned4\',\'*\')"></svg><iframe src="https://attacker.example/"></iframe><style>body { display: none }</style></p>'
    await paste(page, hostile, 'Hi click ok')
    await expect.poll(() => markdownOf(page)).toContain('[ok](https://ok.example/)')
    await page.locator('#doc').click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(500)
    // Its picture, fetched to be kept and drawn from its address, with neither; never its frame.
    expect([...new Set(requests.filter((url) => url.includes('attacker.example')))]).toEqual(['https://attacker.example/x.png'])
    expect(await page.evaluate(() => /** @type {any} */ (globalThis).pwned ?? [])).toEqual([])
    const text = await markdownOf(page)
    expect(text).toContain('[ok](https://ok.example/)')
    expect(text).not.toContain('javascript:')
    await expect(page.locator('body')).toBeVisible()
    expect(await problems(page)).toEqual([])
  })

  test('pictures pasted with words are kept too: fetched with no cookies nor the page\'s address and kept as the project\'s files, else drawn from where the user brought them, which the document remembers; another address is its words (D573)', async ({ page }) => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    // One site lets other sites read its pictures, the other shows them but refuses the read.
    await page.route('https://pictures.example/**', (route) => (route.request().url().endsWith('closed.png') && route.request().resourceType() === 'fetch' ? route.abort()
      : route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } })))
    await start(page, { markdown: 'Start.\n' })
    await caretAt(page, 'Start.', 6)
    await paste(page, '<p>Words <img src="https://pictures.example/open.png" alt="Open"> and <img src="https://pictures.example/closed.png" alt="Closed"></p>', 'Words and')
    await expect.poll(() => markdownOf(page)).toMatch(/^Start\.Words !\[Open\]\(\.\.\/files\/sha256-[\da-f]{64}\.png\) and !\[Closed\]\(https:\/\/pictures\.example\/closed\.png\)\n$/)
    await expect(page.locator('#doc app-shared.picture img')).toHaveAttribute('src', /^blob:/)
    await expect(page.locator('#doc img.picture[src="https://pictures.example/closed.png"]')).toHaveAttribute('referrerpolicy', 'no-referrer')
    await expect.poll(() => page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return (await app.fs.read(`${app.projectDir}/${path}`)) ?? '' }, PATH)).toContain('pictures: "https://pictures.example/closed.png"')
    // Jean's version drawing one from elsewhere draws its words.
    await suggest(page, `${await markdownOf(page)}\n![Else](https://elsewhere.example/y.png)\n`)
    await expect(page.locator('#doc .image-alt', { hasText: 'Else' })).toBeVisible()
    await expect(page.locator('#doc img[src*="elsewhere.example"]')).toHaveCount(0)
    expect(await problems(page)).toEqual([])
  })

  test('a picture pasted as a page copies one, as itself and as its address, is kept as the project\'s file and drawn, named as the page names it, nothing loaded from the address; copied, it pastes as a picture again (D573)', async ({ page }) => {
    const requests = /** @type {string[]} */ ([])
    page.on('request', (request) => requests.push(request.url()))
    await start(page, { markdown: 'Start.\n' })
    await caretAt(page, 'Start.', 6)
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(32, 18), context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
      context.fillStyle = '#d97757'
      context.fillRect(0, 0, 32, 18)
      const data = new DataTransfer()
      data.setData('text/html', '<meta charset="utf-8"><img src="https://pictures.example/_next/image?url=card.png&w=3840&q=75" alt="An orange card"/>')
      data.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })], 'image.png', { type: 'image/png' }))
      ;/** @type {any} */ (globalThis).editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    const PICTURE = /!\[An orange card\]\(\.\.\/(files\/sha256-[\da-f]{64}\.png)\)/
    await expect.poll(() => markdownOf(page)).toMatch(new RegExp(`^Start\\.${PICTURE.source}\\n$`))
    const uri = PICTURE.exec(await markdownOf(page))?.[1]
    expect(await page.evaluate(async (at) => { const { app } = await import('/ui/state.js'); return (await app.fs.readBytes(`${app.projectDir}/${at}`))?.length ?? 0 }, uri)).toBeGreaterThan(0)
    const picture = page.locator('#doc app-shared.picture')
    await expect(picture).toHaveAttribute('aria-label', 'An orange card')
    await expect(picture.locator('img')).toHaveAttribute('src', /^blob:/)
    await expect.poll(() => picture.locator('img').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBe(32)
    // Copied, the line pastes again with its picture, read in the sealed frame as any HTML.
    await page.evaluate(async () => {
      const { TextSelection } = await import('#prosemirror')
      const { view } = /** @type {any} */ (globalThis).editor
      const data = new DataTransfer()
      data.setData('text/html', view.serializeForClipboard(view.state.doc.slice(view.state.doc.firstChild.nodeSize + 1, view.state.doc.content.size - 1)).dom.innerHTML)
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
      view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect(picture).toHaveCount(2)
    expect(await markdownOf(page)).toBe(`Start.![An orange card](../${uri})Start.![An orange card](../${uri})\n`)
    expect(requests.filter((url) => url.includes('pictures.example'))).toEqual([])
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
  test('⌘B, ⌘I, ⌘Z and ⌘⇧Z, the document\'s alone: ⌘B leaves the drawer be, in the text and in the title, and opens it from elsewhere', async ({ page }) => {
    await start(page, { markdown: 'One two three.\n' })
    const drawer = () => page.locator('.sidebar-toggle').getAttribute('aria-expanded')
    const was = await drawer()
    await selectText(page, 'two')
    await page.keyboard.press('ControlOrMeta+b')
    expect(await markdownOf(page)).toBe('One **two** three.\n')
    await page.waitForTimeout(200)
    expect(await drawer()).toBe(was)
    await at(page, 1)
    await page.keyboard.press('ControlOrMeta+b')
    await page.waitForTimeout(200)
    expect(await drawer()).toBe(was)
    await page.locator('#prompt').focus()
    await page.keyboard.press('ControlOrMeta+b')
    await expect.poll(drawer).not.toBe(was)
    await page.keyboard.press('ControlOrMeta+b')
    await expect.poll(drawer).toBe(was)
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

test.describe('references and tags', () => {
  /** A document called Budget and a collection called Trips, kept by the project. @param {import('@playwright/test').Page} page */
  const keep = (page) => page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const [budget, trips, at] = ['documents/01JAQXDOC0000000000000000B-budget.md', 'collections/01K85Z1T00000000000000000A-trips', '2026-10-21T09:00:00.000Z']
    await app.fs.write(`${app.projectDir}/${budget}`, `---\nformat: 1\nname: Budget\nauthor: user\nchanged: ${at}\n---\n# Budget\n\nRent.\n`)
    await app.fs.write(`${app.projectDir}/${trips}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000A', name: 'Trips', author: 'user', created: at, changed: at, properties: [{ id: 'name', name: 'Name', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${trips}/changes.jsonl`, '')
    await (await import('/ui/caps.js')).unlock('tables')
    return [budget, trips]
  })

  test('"[[" offers the project\'s creations by name: one picked is referred to, as Obsidian writes it, and a click or Enter on it opens it; a collection is drawn where the line is, as "/" puts one (D575)', async ({ page }) => {
    await start(page, { markdown: '# Notes\n\nSee \n' })
    const [budget, trips] = await keep(page)
    const menu = page.getByRole('listbox', { name: 'Creations' })
    await caretAt(page, 'See ', 4)
    await page.keyboard.type('[[')
    await expect(menu.getByRole('option', { name: /Budget/ })).toBeVisible()
    // Escape leaves what was typed.
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('[[bud')
    await expect(menu.getByRole('option')).toHaveText([/Budget/])
    await page.keyboard.press('Enter')
    await expect.poll(() => markdownOf(page)).toBe(`# Notes\n\nSee [[${budget}|Budget]]\n`)
    const ref = page.locator('#doc .ref')
    await expect(ref).toHaveText('Budget')
    await page.keyboard.press('Enter')
    await page.keyboard.type('[[trips')
    await page.keyboard.press('Enter')
    await expect(page.locator('#doc .drawn-form app-table').getByLabel('Collection name')).toHaveValue('Trips')
    await expect.poll(() => markdownOf(page)).toBe(`# Notes\n\nSee [[${budget}|Budget]]\n\n\`\`\`table\n${trips}\n\`\`\`\n`)
    // Enter on it, selected, opens it beside the task, and so does a click.
    await page.evaluate(async () => {
      const { NodeSelection } = await import('#prosemirror')
      const { view } = /** @type {any} */ (globalThis).editor
      view.state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => { if (node.type.name === 'ref') view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))) })
      view.focus()
    })
    await page.keyboard.press('Enter')
    // Beside the one being written, which writing in it kept (D635).
    await expect(page.locator('#doc h1', { hasText: 'Budget' })).toBeVisible()
    await page.goBack().catch(() => {})
    expect(await problems(page)).toEqual([])
  })

  test('#name in a line is a tag, drawn as one, the file as typed, which a click looks for among the creations; not in the title, in code or a link, of digits alone or inside a word (D576)', async ({ page }) => {
    const markdown = '# Plan #not\n\nTrip #paris and #2027-trip, #1984, C#, `#code` and [#link](https://e.x) #東京 #مدينة\n'
    const { doc } = await start(page, { markdown })
    await expect(doc.locator('.tag')).toHaveText(['#paris', '#2027-trip', '#東京', '#مدينة'])
    expect(await markdownOf(page)).toBe(markdown)
    await caretAt(page, 'Trip', 0)
    await page.keyboard.type('#todo ')
    await expect(doc.locator('.tag').first()).toHaveText('#todo')
    await expect.poll(() => markdownOf(page)).toBe(markdown.replace('Trip', '#todo Trip'))
    // A click on one opens Creations' page finding it, # and all: this document, not another without it.
    await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      await app.fs.write(`${app.projectDir}/documents/01JAQXDOC0000000000000000B-budget.md`, '---\nformat: 1\nname: Budget\nauthor: user\n---\n# Budget\n\nParis, rent.\n')
    })
    await doc.locator('.tag', { hasText: '#paris' }).click()
    await expect(page.locator('app-creations input[type="search"]')).toHaveValue('#paris')
    await expect(page.locator('app-creations .creation')).toHaveCount(1)
    await expect(page.locator(`app-creations .creation[data-path="${PATH}"]`)).toBeVisible()
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

  test('a collection dragged from Creations is held between the blocks where it is let go, drawn as its view (D573)', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'First.\n\nSecond.\n' })
    // Two collections the project keeps, one with a row.
    const [folder, other] = await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      const at = '2026-10-21T09:00:00.000Z'
      const places = await Promise.all([['01K85Z1T00000000000000000A', 'Trips', 'trips'], ['01K85Z1T00000000000000000B', 'Reading list', 'reading']].map(async ([id, name, slug]) => {
        const place = `collections/${id}-${slug}`
        await app.fs.write(`${app.projectDir}/${place}/collection.json`, JSON.stringify({ format: 1, id, name, author: 'user', created: at, changed: at, properties: [{ id: 'name', name: 'Name', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
        await app.fs.write(`${app.projectDir}/${place}/changes.jsonl`, slug === 'trips' ? `${JSON.stringify({ row: '01K80000000000000000000001', set: { name: 'Lisbon' }, at, by: 'user' })}\n` : '')
        return place
      }))
      await (await import('/ui/caps.js')).unlock('tables')
      return places
    })
    await (await openTasks(page)).getByRole('button', { name: 'Creations', exact: true }).click()
    const card = (/** @type {string} */ path) => page.locator(`app-creations .creation[data-path="${path}"]`)
    // Each kind's cards come as they are read, the latest first: all three in place, nothing moves under the drag.
    await expect(page.locator('app-creations .creation')).toHaveCount(3)
    for (const path of [folder, other, PATH]) await expect(card(path)).toHaveAttribute('draggable', 'true')
    // Let go over the first half of the first line, it goes before it, the caret at that line's start. The mouse drags it in small steps, as a hand
    // does, from near its top, which the message box floating over the page's foot doesn't cover, nudged first so that the drag starts there.
    await card(folder).hover({ position: { x: 40, y: 30 } })
    const [from, first] = /** @type {{ x: number, y: number }[]} */ (await Promise.all([card(folder).boundingBox(), doc.locator('p').first().boundingBox()]))
    await page.mouse.down()
    await page.mouse.move(from.x + 50, from.y + 40, { steps: 2 })
    await page.mouse.move(first.x + 4, first.y + 4, { steps: 12 })
    await page.mouse.up()
    await expect(doc.locator('.drawn-form app-table').getByLabel('Collection name')).toHaveValue('Trips')
    await expect.poll(() => markdownOf(page)).toBe(`\`\`\`table\n${folder}\n\`\`\`\n\nFirst.\n\nSecond.\n`)
    expect(await page.evaluate(() => { const { $from } = /** @type {any} */ (globalThis).editor.view.state.selection; return [$from.parent.textContent, $from.parentOffset] })).toEqual(['First.', 0])
    // Over the last line's end, after it, on a line of its own: the card's own dragstart fills what the drop brings (a second drag of
    // Playwright's mouse, right after one, sometimes never starts).
    await page.evaluate((path) => {
      const data = new DataTransfer(), line = /** @type {Element} */ (document.querySelector('#doc > p:last-of-type')).getBoundingClientRect()
      document.querySelector(`app-creations .creation[data-path="${path}"]`)?.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }))
      const at = { dataTransfer: data, bubbles: true, cancelable: true, clientX: line.right - 4, clientY: line.top + line.height / 2 }
      for (const type of ['dragover', 'drop']) document.elementFromPoint(at.clientX, at.clientY)?.dispatchEvent(new DragEvent(type, at))
    }, other)
    await expect(doc.locator('.drawn-form app-table').nth(1).getByLabel('Collection name')).toHaveValue('Reading list')
    await expect.poll(() => markdownOf(page)).toBe(`\`\`\`table\n${folder}\n\`\`\`\n\nFirst.\n\nSecond.\n\n\`\`\`table\n${other}\n\`\`\`\n`)
    // The caret on a new line after it, which the file doesn't keep while it is empty.
    expect(await page.evaluate(() => { const { selection, doc } = /** @type {any} */ (globalThis).editor.view.state; return [selection.from === doc.content.size - 1, selection.$from.parent.textContent] })).toEqual([true, ''])
    // Any other creation is a reference to it, where it is let go in a line, or on a line of its own after the title (D575).
    await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      await app.fs.write(`${app.projectDir}/documents/01JAQXDOC0000000000000000B-budget.md`, '---\nformat: 1\nname: Budget\nauthor: user\n---\n# Budget\n')
      ;(await import('/ui/creations.js')).reread()
    })
    const budget = 'documents/01JAQXDOC0000000000000000B-budget.md'
    await expect(card(budget)).toHaveAttribute('draggable', 'true')
    for (const [selector, x] of /** @type {const} */ ([['#doc > p:first-of-type', 'end'], ['#doc > h1', 'start']])) {
      await page.evaluate(([path, at, side]) => {
        // In view, as a hand lets go only where it sees: a drop before scrolled the document under its pane's head.
        /** @type {Element} */ (document.querySelector(at)).scrollIntoView({ block: 'nearest' })
        const data = new DataTransfer(), line = /** @type {Element} */ (document.querySelector(at)).getBoundingClientRect()
        document.querySelector(`app-creations .creation[data-path="${path}"]`)?.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }))
        const point = { dataTransfer: data, bubbles: true, cancelable: true, clientX: side === 'end' ? line.right - 2 : line.left + 2, clientY: line.top + line.height / 2 }
        for (const type of ['dragover', 'drop']) document.elementFromPoint(point.clientX, point.clientY)?.dispatchEvent(new DragEvent(type, point))
      }, [budget, selector, x])
    }
    await expect.poll(() => markdownOf(page)).toBe(`[[${budget}|Budget]]\n\n\`\`\`table\n${folder}\n\`\`\`\n\nFirst.[[${budget}|Budget]]\n\nSecond.\n\n\`\`\`table\n${other}\n\`\`\`\n`)
    // WebKit says so, now and then, when two collections' views settle in one frame: no error.
    expect((await problems(page)).filter((one) => !one.startsWith('ResizeObserver loop'))).toEqual([])
  })

  test('a picture Jean made, dragged from Creations or picked after "[[", goes in as itself, its file\'s place from the document\'s folder (D573, D575)', async ({ page }) => {
    const { doc } = await start(page, { markdown: 'First.\n\nSecond.\n' })
    const uri = await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      const canvas = new OffscreenCanvas(32, 18)
      ;/** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d')).fillRect(0, 0, 32, 18)
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
      const link = await (await import('/core/files.js')).addFile(app.fs, { projectDir: app.projectDir, name: 'a-black-card.png', mimeType: 'image/png', bytes, pages: ['A black card'], by: 'jean' })
      await (await import('/ui/caps.js')).unlock('pictures')
      return link.uri
    })
    await (await openTasks(page)).getByRole('button', { name: 'Creations', exact: true }).click()
    await expect(page.locator(`app-creations .creation[data-path="${uri}"]`)).toHaveAttribute('draggable', 'true')
    // Let go over the last line's end: after it, on a line of its own.
    await page.evaluate((path) => {
      const data = new DataTransfer(), line = /** @type {Element} */ (document.querySelector('#doc > p:last-of-type')).getBoundingClientRect()
      document.querySelector(`app-creations .creation[data-path="${path}"]`)?.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }))
      const at = { dataTransfer: data, bubbles: true, cancelable: true, clientX: line.right - 2, clientY: line.top + line.height / 2 }
      for (const type of ['dragover', 'drop']) document.elementFromPoint(at.clientX, at.clientY)?.dispatchEvent(new DragEvent(type, at))
    }, uri)
    const picture = `![A black card](../${uri})`
    await expect.poll(() => markdownOf(page)).toBe(`First.\n\nSecond.\n\n${picture}\n`)
    await expect(doc.locator('app-shared.picture img')).toHaveAttribute('src', /^blob:/)
    // "[[" offers it among the creations, and draws it where the line is.
    await caretAt(page, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('[[black')
    await expect(page.getByRole('listbox', { name: 'Creations' }).getByRole('option')).toHaveText([/A black card/])
    await page.keyboard.press('Enter')
    await expect.poll(() => markdownOf(page)).toBe(`First.\n\n${picture}\n\nSecond.\n\n${picture}\n`)
    await expect(doc.locator('app-shared.picture img')).toHaveCount(2)
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

test.describe('out in the look here (D663)', () => {
  const LOGO = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" fill="#2dd4bf"/></svg>').toString('base64')}`
  const DOT = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg=='
  const KIT = { tokens: { primary: '#2dd4bf', ink: '#223344', fonts: { heading: ['Georgia'], body: ['Verdana', 'sans-serif'] }, logo: LOGO, logoAt: 'bottom-start' } }

  /**
   * A document open, with a picture of the project's, and the person's design system.
   * @param {import('@playwright/test').Page} page @param {{ lang?: string, author?: string }} [options]
   */
  async function dressed(page, { lang = 'en', author = 'jean' } = {}) {
    await page.addInitScript(() => {
      const problems = /** @type {string[]} */ ((/** @type {any} */ (globalThis).problems = []))
      document.addEventListener('securitypolicyviolation', (event) => problems.push(`${event.violatedDirective} ${event.blockedURI}`))
      addEventListener('error', (event) => problems.push(event.message))
      ;/** @type {any} */ (window).printed = []
      window.print = () => { /** @type {any} */ (window).printed.push(document.querySelector('.paper-print')?.textContent ?? 'the task') }
    })
    await begin(page, lang)
    await page.evaluate(async ({ dot, path, kit, by }) => {
      const { app } = await import('/ui/state.js')
      await (await import('/ui/caps.js')).unlock('documents')
      await (await import('/ui/kit.js')).keepKit(null, kit)
      const { uri } = await (await import('/core/files.js')).addFile(app.fs, { projectDir: app.projectDir, name: 'dot.png', mimeType: 'image/png', bytes: Uint8Array.from(atob(dot), (c) => c.charCodeAt(0)), pages: [''], by: 'user' })
      const words = `# Plan\n\nSee [[documents/other.md|the budget]], and \`[[ kept ]]\`.\n\n![A dot](../${uri})\n\n| Item | Cost |\n| --- | --- |\n| Rent | 1200 |\n`
      await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: notes\nauthor: ${by}\n---\n${words}`)
      ;(await import('/ui/preview.js')).preview({ uri: path, name: 'notes.md', title: 'notes', mimeType: 'text/markdown' })
    }, { dot: DOT, path: PATH, kit: KIT, by: author })
    await expect(page.locator('#doc app-shared img')).toBeVisible()
    await reach(page)
    // What a browser says of Jean's page before this, WebKit's style attributes, is no concern here.
    return /** @type {string[]} */ (await problems(page))
  }

  /** Saves it as Word from its menu, and reads the file's parts. @param {import('@playwright/test').Page} page */
  async function word(page) {
    await page.locator('.preview .pane-head > .icon-button[popovertarget^="save-"]').click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.preview .answer-menu button').first().click()])
    const chunks = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk)
    const files = readZip(new Uint8Array(Buffer.concat(chunks)))
    const xml = Object.fromEntries(await Promise.all(files.filter((one) => /\.(xml|rels)$/.test(one.name)).map(async (one) => [one.name, new TextDecoder().decode(await one.read())])))
    return { name: download.suggestedFilename(), xml, paths: files.map((one) => one.name) }
  }

  test('as Word from Save, in the design system: its colours and faces, its logo in its corner, its picture inside, a reference by its name; as Markdown as ever', async ({ page }) => {
    const before = await dressed(page)
    const { name, xml, paths } = await word(page)
    expect(name).toBe('notes.docx')
    const colour = await page.evaluate(async () => (await import('/ui/colour.js')).readable('#2dd4bf', '#ffffff'))
    expect(xml['word/styles.xml']).toContain(`<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Arial"/><w:b/><w:bCs/><w:color w:val="${colour.slice(1)}"/>`)
    expect(xml['word/styles.xml']).toContain('<w:rPrDefault><w:rPr><w:rFonts w:ascii="Verdana" w:hAnsi="Verdana" w:cs="Arial"/><w:color w:val="223344"/>')
    expect(xml['word/document.xml']).toContain('<w:footerReference w:type="default" r:id="rIdLogo"/>')
    expect(xml['word/footer.xml']).toContain('<w:jc w:val="left"/>')
    expect(paths).toEqual(expect.arrayContaining(['word/media/logo.png', 'word/media/picture1.png']))
    expect(xml['word/document.xml']).toContain('descr="A dot"')
    expect(xml['word/document.xml']).toContain('the budget')
    expect(xml['word/document.xml']).toContain('[[ kept ]]')
    expect(xml['word/document.xml']).not.toContain('documents/other.md')
    expect(paths).toContain('docProps/custom.xml')
    await page.locator('.preview .pane-head > .icon-button[popovertarget^="save-"]').click()
    const [markdown] = await Promise.all([page.waitForEvent('download'), page.locator('.preview .answer-menu').getByRole('button', { name: 'Save notes.md' }).click()])
    expect(markdown.suggestedFilename()).toBe('notes.md')
    expect(await problems(page)).toEqual(before)
  })

  test('what the user wrote themself says nothing of a trained model in Word, and a look changed reaches the next file', async ({ page }) => {
    await dressed(page, { author: 'user' })
    expect((await word(page)).paths).not.toContain('docProps/custom.xml')
    await page.evaluate(async () => (await import('/ui/kit.js')).keepKit(null, null))
    const { xml, paths } = await word(page)
    expect(xml['word/styles.xml']).toContain('<w:rFonts w:ascii="Calibri"')
    expect(paths).not.toContain('word/media/logo.png')
  })

  test('printed alone from Save or with ⌘P: only the document on paper, in the design system, its logo on its corner\'s side, without what Jean suggests; then gone', async ({ page }) => {
    const before = await dressed(page)
    await suggest(page, (await markdownOf(page)).replace('# Plan', '# Plan\n\nAn extra line of Jean\'s.'))
    await expect(page.locator('#doc .suggest')).toHaveCount(1)
    await page.locator('.preview .pane-head > .icon-button[popovertarget^="save-"]').click()
    await page.locator('.preview .answer-menu').getByRole('button', { name: 'Print' }).click()
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed.length)).toBe(1)
    const printed = await page.evaluate(() => /** @type {any} */ (window).printed[0])
    expect(printed).toContain('the budget')
    expect(printed).not.toContain('An extra line')
    await page.emulateMedia({ media: 'print' })
    const sheet = page.locator('.paper-print')
    const [r, g, b] = await page.evaluate(async () => { const hex = (await import('/ui/colour.js')).readable('#2dd4bf', '#ffffff'); return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) })
    await expect.poll(() => sheet.locator('h1').evaluate((one) => getComputedStyle(one).color)).toBe(`rgb(${r}, ${g}, ${b})`)
    expect(await sheet.locator('h1').evaluate((one) => getComputedStyle(one).fontFamily)).toContain('Georgia')
    expect(await sheet.locator('.doc p').first().evaluate((one) => getComputedStyle(one).color)).toBe('rgb(34, 51, 68)')
    expect(await sheet.locator('.doc').evaluate((one) => getComputedStyle(one).fontFamily)).toContain('Verdana')
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('app-shared img')).toBeVisible()
    await expect(sheet.locator('> .doc + .paper-logo.bottom-start')).toBeVisible()
    await expect(page.locator('app-shell')).toBeHidden()
    await page.evaluate(() => dispatchEvent(new Event('afterprint')))
    await expect(sheet).toHaveCount(0)
    await page.emulateMedia({ media: 'screen' })
    await expect(page.locator('#doc .suggest')).toHaveCount(1)
    // The keys, from inside the document.
    await page.locator('#doc p').first().click()
    await page.keyboard.press('ControlOrMeta+p')
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed.length)).toBe(2)
    await page.evaluate(() => dispatchEvent(new Event('afterprint')))
    expect(await problems(page)).toEqual(before)
  })

  test('what it draws: as a picture in Word, in place of its code, and drawn once more, once, on paper; code it doesn\'t draw stays code', async ({ page }) => {
    const before = await dressed(page)
    await page.evaluate(async () => { (await import('/ui/markdown.js')).declared.value = new Set(['echarts']) })
    const chart = '{"animation":false,"xAxis":{"type":"category","data":["a","b"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}'
    await suggest(page, `${await markdownOf(page)}\n\`\`\`mermaid\ngraph LR\n  A --> B\n\`\`\`\n\n\`\`\`echarts\n${chart}\n\`\`\`\n\n\`\`\`js\nlet kept = 1\n\`\`\`\n`)
    await page.locator('.review').getByRole('button', { name: 'Accept all' }).click()
    await expect(page.locator('#doc .drawn-form app-diagram img')).toBeVisible()
    await expect(page.locator('#doc .drawn-form app-chart [role="img"]')).toBeVisible()
    const { xml, paths } = await word(page)
    expect(paths).toEqual(expect.arrayContaining(['word/media/picture1.png', 'word/media/picture2.png', 'word/media/picture3.png']))
    expect(xml['word/document.xml']).not.toContain('graph LR')
    expect(xml['word/document.xml']).not.toContain('xAxis')
    expect(xml['word/document.xml']).toContain('let kept = 1')
    await page.locator('.preview .pane-head > .icon-button[popovertarget^="save-"]').click()
    await page.locator('.preview .answer-menu button').last().click()
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed.length)).toBe(1)
    await page.emulateMedia({ media: 'print' })
    const sheet = page.locator('.paper-print')
    await expect(sheet.locator('app-diagram img')).toHaveCount(1)
    await expect(sheet.locator('app-diagram img')).toBeVisible()
    await expect(sheet.locator('app-chart [role="img"]')).toHaveCount(1)
    await expect(sheet.locator('app-chart [role="img"]')).toBeVisible()
    // As wide as the paper: the words and the chart, which keeps its proportions; between a Word file's margins, only while it prints.
    const margin = () => page.evaluate(() => document.adoptedStyleSheets.flatMap((one) => [...one.cssRules]).filter((rule) => rule instanceof CSSPageRule).map((rule) => /** @type {CSSPageRule} */ (rule).style.getPropertyValue('margin-top')))
    expect(await margin()).toEqual(['2.54cm'])
    await page.setViewportSize({ width: 1000, height: 700 })
    const box = await sheet.evaluate((one) => {
      const width = (/** @type {string} */ what) => /** @type {HTMLElement} */ (one.querySelector(what)).getBoundingClientRect().width, chart = /** @type {HTMLElement} */ (one.querySelector('.chart'))
      return { page: document.documentElement.clientWidth, sheet: width(':scope > .doc'), words: width('p'), canvas: width('canvas'), chart: chart.getBoundingClientRect().width, ratio: chart.getBoundingClientRect().width / chart.getBoundingClientRect().height, given: chart.style.aspectRatio }
    })
    expect(box.sheet).toBe(box.page)
    expect(box.words).toBe(box.page)
    expect(box.canvas).toBeCloseTo(box.chart, 0)
    const [wide, tall] = box.given.split('/').map(Number)
    expect(box.ratio).toBeCloseTo(wide / tall, 1)
    await page.evaluate(() => dispatchEvent(new Event('afterprint')))
    expect(await margin()).toEqual([])
    expect(await problems(page)).toEqual(before)
  })

  test('in its pane, on the design system\'s paper by day and by night, its words in its colours and faces, its logo in its corner, a day\'s logo on a plate by night; gone with the kit (D664)', async ({ page }) => {
    const before = await dressed(page)
    const tokens = { ...KIT.tokens, paper: '#fdf6e3', logoAt: 'top-end', dark: { paper: '#101820', ink: '#e8eef4', primary: '#7fdfd0' } }
    await page.evaluate(async (kit) => (await import('/ui/kit.js')).keepKit(null, { tokens: kit }), tokens)
    const view = page.locator('.view:has(> .document)'), mine = (/** @type {string} */ what, /** @type {string} */ property, /** @type {string} [pseudo] */ pseudo) => view.locator(what).first().evaluate((one, [name, at]) => getComputedStyle(one, at || undefined).getPropertyValue(name), [property, pseudo ?? ''])
    const rgb = (/** @type {string} */ hex) => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`
    const day = await page.evaluate(async () => (await import('/ui/colour.js')).readable('#2dd4bf', '#fdf6e3'))
    await expect.poll(() => view.evaluate((one) => getComputedStyle(one).backgroundColor)).toBe('rgb(253, 246, 227)')
    expect(await mine('h1', 'color')).toBe(rgb(day))
    expect(await mine('h1', 'font-family')).toContain('Georgia')
    expect(await mine('#doc p', 'color')).toBe('rgb(34, 51, 68)')
    expect(await mine('#doc', 'font-family')).toContain('Verdana')
    expect(await mine('#doc .ref', 'color')).toBe(rgb(day))
    expect(await mine('.doc-wrap', 'background-image', '::before')).toContain('data:image/svg+xml')
    expect(await mine('.doc-wrap', 'background-color', '::before')).toBe('rgba(0, 0, 0, 0)')
    await page.evaluate(async () => { (await import('/ui/state.js')).app.chosenTheme.value = 'dark' })
    const night = await page.evaluate(async () => (await import('/ui/colour.js')).readable('#7fdfd0', '#101820'))
    await expect.poll(() => view.evaluate((one) => getComputedStyle(one).backgroundColor)).toBe('rgb(16, 24, 32)')
    expect(await mine('h1', 'color')).toBe(rgb(night))
    expect(await mine('#doc p', 'color')).toBe('rgb(232, 238, 244)')
    expect(await mine('.doc-wrap', 'background-color', '::before')).toBe('rgb(255, 255, 255)')
    await page.evaluate(async () => { (await import('/ui/state.js')).app.chosenTheme.value = 'light' })
    // Only a colour: the room's own paper and words, the colour deepened to read on them.
    const room = await view.evaluate(async (one) => { await (await import('/ui/kit.js')).keepKit(null, { tokens: { primary: '#2dd4bf' } }); await new Promise((resolve) => setTimeout(resolve, 200)); return getComputedStyle(one).backgroundColor })
    expect(room).not.toBe('rgb(253, 246, 227)')
    await page.evaluate(async () => (await import('/ui/kit.js')).keepKit(null, null))
    await expect.poll(() => mine('.doc-wrap', 'content', '::before')).toBe('none')
    expect(await problems(page)).toEqual(before)
  })

  test('a collection it holds goes as its rows: real ones in Word, a table on paper with nothing to change them by (D664)', async ({ page, browserName }) => {
    await dressed(page)
    const folder = 'collections/01K85Z1T00000000000000000Q-jobs'
    await page.evaluate(async ({ folder }) => {
      const { app } = await import('/ui/state.js'), at = '2026-10-21T09:00:00.000Z'
      await (await import('/ui/caps.js')).unlock('tables')
      await app.fs.write(`${app.projectDir}/${folder}/collection.json`, JSON.stringify({ format: 1, id: '01K85Z1T00000000000000000Q', name: 'Job applications', author: 'user', created: at, changed: at, properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'pay', name: 'Pay', type: 'number' }], views: [{ id: 'all', name: 'All', type: 'table' }] }))
      await app.fs.write(`${app.projectDir}/${folder}/changes.jsonl`, `${JSON.stringify({ row: '01K80000000000000000000001', set: { name: 'Atelier | *Lune*', pay: 3100 }, at, by: 'user' })}\n`)
    }, { folder })
    await suggest(page, `${await markdownOf(page)}\n\`\`\`table\n${folder}\n\`\`\`\n`)
    await page.locator('.review').getByRole('button', { name: 'Accept all' }).click()
    await expect(page.locator('#doc .drawn-form app-table .table-grid')).toBeVisible()
    // Playwright's WebKit refuses every <select> a style attribute it doesn't have, as a collection's view holds some and draws them again.
    const refused = async (/** @type {string[]} */ all) => all.filter((one) => browserName !== 'webkit' || !one.startsWith('style-src-attr'))
    const before = await refused(await problems(page)), { xml } = await word(page), doc = xml['word/document.xml']
    expect(doc).not.toContain(folder)
    expect(doc).toContain('<w:pStyle w:val="Heading3"/>')
    expect(doc).toContain('Job applications')
    expect(doc.replace(/<[^>]+>/g, '')).toContain('Atelier | *Lune*')
    expect(doc).toContain('<w:tbl>')
    await page.locator('.preview .pane-head > .icon-button[popovertarget^="save-"]').click()
    await page.locator('.preview .answer-menu button').last().click()
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed.length)).toBe(1)
    await page.emulateMedia({ media: 'print' })
    const sheet = page.locator('.paper-print')
    await expect(sheet.locator('h3')).toHaveText('Job applications')
    await expect(sheet.locator('table').last().locator('td')).toHaveText(['Atelier | *Lune*', new Intl.NumberFormat('en').format(3100)])
    await expect(sheet.locator('app-table, button, .table-tools')).toHaveCount(0)
    await page.evaluate(() => dispatchEvent(new Event('afterprint')))
    expect(await refused(await problems(page))).toEqual(before)
  })

  test('Settings offers the design system once Documents is found, Slides still unfound, once whatever else is found; it speaks of all, draws a page beside the deck, and marks what only slides show (D664)', async ({ page }) => {
    await begin(page)
    const settings = await openSettings(page, 'Appearance')
    const row = settings.getByRole('button', { name: /^Design system/ })
    await expect(row).toHaveCount(0)
    const loaded = () => page.evaluate(async () => (await import('/ui/caps.js')).loaded.peek().has('slides'))
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('documents') })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('documents, collections and slides')
    await row.click()
    await expect(settings.getByRole('heading', { name: 'Design system' })).toBeVisible()
    await expect(settings.locator('.kit-preview .deck-slide').first()).toBeAttached()
    await expect(settings.locator('.kit-sheet b')).toBeVisible()
    expect(await loaded()).toBe(false)
    await expect(settings.getByText('Slides only')).toHaveCount(2)
    await expect(settings.getByText('Printed pages and Word files stay white.')).toBeVisible()
    // The page of paper follows the colours as they are written, white whatever the kit's paper, its logo in its corner.
    await settings.getByRole('textbox', { name: /Main colour/ }).first().fill('#b4005a')
    await settings.getByRole('textbox', { name: /Main colour/ }).first().press('Tab')
    await settings.getByRole('textbox', { name: /Paper/ }).first().fill('#101820')
    await settings.getByRole('textbox', { name: /Paper/ }).first().press('Tab')
    await expect.poll(() => settings.locator('.kit-sheet b').evaluate((one) => getComputedStyle(one).color)).toBe('rgb(180, 0, 90)')
    expect(await settings.locator('.kit-sheet').evaluate((one) => getComputedStyle(one).backgroundColor)).toBe('rgb(255, 255, 255)')
    await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('slides'); await (await import('/ui/caps.js')).unlock('tables') })
    await settings.getByRole('button', { name: 'Appearance' }).first().click()
    await expect(settings.getByRole('button', { name: /^Design system/ })).toHaveCount(1)
  })

  for (const lang of ['ar', 'ja']) test(`in ${lang}: Save's menu in its words, the file made, the print drawn`, async ({ page }) => {
    const before = await dressed(page, { lang })
    expect((await word(page)).paths).toContain('word/footer.xml')
    await page.locator('.preview .pane-head > .icon-button[popovertarget^="save-"]').click()
    const items = page.locator('.preview .answer-menu button')
    await expect(items).toHaveCount(3)
    expect(await items.first().textContent()).not.toMatch(/made\.|Download/)
    await items.last().click()
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).printed.length)).toBe(1)
    await page.evaluate(() => dispatchEvent(new Event('afterprint')))
    expect(await problems(page)).toEqual(before)
  })
})
