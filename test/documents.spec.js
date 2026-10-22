// Documents you keep (D485), in Chromium and WebKit: a Markdown file Jean keeps, open in the preview in its
// editor, ProseMirror in an opaque frame framed as preview.html frames a page, its Markdown written back
// byte for byte, its MCP Apps messages with Jean, Jean's suggestions with Keep and Undo, the "/" menu, the
// bubble over a selection, blocks selected, moved and turned from the margin, their grip and its menu, a
// list's items as blocks, Japanese composition, Arabic, paste from Word and Google Docs, the keys, Jean's
// theme, what a screen reader reads, focus, the clipboard and drag and drop across the frame, a phone; and
// Documents found as Jean writes a document again, then made and changed by the brain's own tools.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start as begin, connectFakeBrain, ask, answered } from './helpers.js'

const fixture = (/** @type {string} */ name) => readFile(new URL(`fixtures/editor/${name}`, import.meta.url), 'utf8')
const sample = () => fixture('jean-answer.md')
const PATH = 'documents/01JAQXDOC0000000000000000A-notes.md'
const FRAME = 'app-preview iframe.is-document'

/**
 * Jean in a language, Documents found, and a document open beside the conversation; the editor's frame
 * and its document once the file is open. @param {import('@playwright/test').Page} page
 * @param {{ lang?: string, markdown?: string }} [options]
 */
async function start(page, { lang = 'en', markdown } = {}) {
  const text = markdown ?? await sample()
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
  const inner = /** @type {import('@playwright/test').Frame} */ (await (await page.locator(FRAME).elementHandle())?.contentFrame())
  await inner.waitForFunction(() => /** @type {any} */ (globalThis).editor && document.getElementById('doc'))
  await expect.poll(() => markdownOf(inner)).toBe(text)
  const frame = page.frameLocator(FRAME)
  return { inner, frame, doc: frame.locator('#doc') }
}

/** @param {import('@playwright/test').Frame} inner @returns {Promise<string>} */
const markdownOf = (inner) => inner.evaluate(() => /** @type {any} */ (globalThis).editor.markdown())
/** What the file holds, but for its front matter. @param {import('@playwright/test').Page} page @param {string} [path] */
const saved = (page, path = PATH) => page.evaluate(async (at) => {
  const { app } = await import('/ui/state.js')
  return (await app.fs.read(`${app.projectDir}/${at}`))?.replace(/^---\n[\s\S]*?\n---\n/, '') ?? null
}, path)
/** What the brain reads with the next message of the document on show. @param {import('@playwright/test').Page} page */
const told = (page) => page.evaluate(async () => (await import('/ui/caps.js')).slots('modes').flatMap((mode) => mode.notes?.([]) ?? [])
  .find((note) => note.update?.sessionUpdate === '_system_note' && note.update.data.kind === 'document')?.update?.text ?? '')
/** A selection in the frame: from some text, `offset` on, `length` long. @param {import('@playwright/test').Frame} inner @param {string} text @param {number} [offset] @param {number} [length] */
const place = (inner, text, offset = 0, length = 0) => inner.evaluate(async ([t, o, l]) => {
  const { TextSelection } = await import('prosemirror-state')
  const { view } = /** @type {any} */ (globalThis).editor
  let at = -1
  view.state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => {
    const i = node.isText ? node.text.indexOf(t) : -1
    if (i >= 0 && at < 0) at = pos + i
    return at < 0
  })
  view.focus()
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at + Number(o), at + Number(o) + Number(l))))
  // The keyboard reaches the frame a moment after it takes the focus from Jean's box.
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)))
}, /** @type {const} */ ([text, offset, length]))
/** @param {import('@playwright/test').Frame} inner @param {string} text @param {number} [offset] */
const caretAt = (inner, text, offset = 0) => place(inner, text, offset)
/** @param {import('@playwright/test').Frame} inner @param {string} text */
const selectText = (inner, text) => place(inner, text, 0, text.length)
/** The caret at a place of the document. @param {import('@playwright/test').Frame} inner @param {number} pos */
const at = (inner, pos) => inner.evaluate(async (p) => {
  const { TextSelection } = await import('prosemirror-state')
  const { view } = /** @type {any} */ (globalThis).editor
  view.focus()
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, p)))
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 20)))
}, pos)
/** @param {import('@playwright/test').Frame} inner */
const selection = (inner) => inner.evaluate(async () => {
  // ProseMirror reads the browser's selection when it changes, a moment after a key.
  await new Promise((resolve) => setTimeout(resolve, 50))
  const { from, to } = /** @type {any} */ (globalThis).editor.view.state.selection
  return { from, to }
})
/** @param {import('@playwright/test').Frame} inner */
const kindOf = (inner) => inner.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.selection.toJSON().type)
/** Jean's suggestion of a new version, as its brain's suggest tool makes it. @param {import('@playwright/test').Page} page @param {string} markdown */
const suggest = (page, markdown) => page.evaluate(async ({ text }) => {
  const frame = /** @type {HTMLIFrameElement} */ (document.querySelector('app-preview iframe.is-document'))
  return new Promise((resolve) => {
    addEventListener('message', function heard({ data, source }) {
      if (source === frame.contentWindow && data?.id === 9001) removeEventListener('message', heard), resolve(data.result)
    })
    frame.contentWindow?.postMessage({ jsonrpc: '2.0', id: 9001, method: 'tools/call', params: { name: 'suggest', arguments: { markdown: text } } }, '*')
  })
}, { text: markdown })

test.describe('the frame', () => {
  test('is opaque and sealed, framed as preview.html frames a page', async ({ page }) => {
    /** @type {import('@playwright/test').Request[]} */
    const requests = []
    page.on('request', (request) => requests.push(request))
    const { inner } = await start(page)
    expect(await page.locator(FRAME).getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    const seen = await inner.evaluate(async () => ({
      origin: globalThis.origin,
      parent: (() => { try { return Boolean(parent.document) } catch { return 'blocked' } })(),
      storage: (() => { try { return typeof localStorage.length } catch (error) { return /** @type {Error} */ (error).name } })(),
      fetch: await fetch('/index.html').then(() => 'reached', (error) => error.name),
    }))
    expect(seen).toEqual({ origin: 'null', parent: 'blocked', storage: 'SecurityError', fetch: 'TypeError' })
    // Every module came as data: the frame asked for nothing but the relay.
    expect(requests.filter((request) => request.frame() === inner && !request.url().endsWith('/preview.html')).map((request) => request.url())).toEqual([])
  })
})

test.describe('Markdown', () => {
  test('a file opened and saved untouched is the same file, and an edit changes only its line', async ({ page }) => {
    const text = await sample()
    const { inner, doc } = await start(page)
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the week')
    await expect(doc.locator('table th')).toHaveCount(3)
    await expect(doc.locator('li[data-checked="true"] input[type=checkbox]')).toBeChecked()
    await caretAt(inner, 'Keep receipts')
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
    const { inner } = await start(page, { markdown: 'One line.\n' })
    await caretAt(inner, 'One line.', 9)
    await page.keyboard.type(' Two')
    await page.locator('app-preview .pane-head button').last().click()
    await expect(page.locator(FRAME)).toHaveCount(0)
    await expect.poll(() => saved(page)).toBe('One line. Two\n')
  })
})

test.describe('messages', () => {
  test('MCP Apps: initialize, tools, save, the selection told to the brain', async ({ page }) => {
    await page.addInitScript(() => addEventListener('message', ({ data }) => { if (data?.jsonrpc) (/** @type {any} */ (globalThis).heard ??= []).push(data) }))
    const { inner } = await start(page)
    const methods = await page.evaluate(() => /** @type {any} */ (globalThis).heard.map((/** @type {any} */ m) => m.method ?? 'response'))
    expect(methods.slice(0, 3)).toEqual(['ui/initialize', 'ui/notifications/initialized', 'response'])
    const tools = await page.evaluate(() => new Promise((resolve) => {
      const frame = /** @type {HTMLIFrameElement} */ (document.querySelector('app-preview iframe.is-document'))
      addEventListener('message', ({ data }) => { if (data?.id === 77) resolve(data.result) })
      frame.contentWindow?.postMessage({ jsonrpc: '2.0', id: 77, method: 'tools/list' }, '*')
    }))
    expect(/** @type {any} */ (tools).tools.map((/** @type {any} */ tool) => tool.name)).toEqual(['open', 'suggest', 'read'])
    // The brain reads the document as it is, and what is selected in it.
    expect(await told(page)).toContain('The document notes (documents/01JAQXDOC0000000000000000A-notes.md) is open beside the conversation. It reads:\n\n# Team offsite')
    await selectText(inner, 'three files')
    await expect.poll(() => told(page)).toContain('Selected in notes:\n\n**three files**')
    await caretAt(inner, 'three files')
    await expect.poll(() => told(page)).not.toContain('Selected in')
    // ⌘S saves at once, and never opens the browser's own Save dialog, nor Jean's copy of the task.
    await caretAt(inner, 'Questions?')
    await page.keyboard.type('Any ')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => saved(page)).toContain('Any Questions?')
  })
})

test.describe('suggestions', () => {
  test('Jean\'s change shows as marked suggestions, kept or undone one by one', async ({ page }) => {
    const text = await sample()
    const { inner, frame, doc } = await start(page)
    const result = /** @type {any} */ (await suggest(page, text.replace('plan for the week', 'plan for the fortnight').replace('## Schedule\n', '## Schedule\n\nA line Jean adds.\n')))
    expect(result.structuredContent.changes).toBe(2)
    const review = frame.getByRole('region', { name: 'Suggested changes' })
    await expect(review).toBeVisible()
    await expect(review).toContainText('2 changes suggested by Jean')
    await expect(doc.locator('h1 del.suggest-del')).toHaveText('week')
    await expect(doc.locator('h1 ins.suggest-ins')).toHaveText('fortnight')
    await expect(doc.locator('.suggest-block ins')).toHaveText('A line Jean adds.')
    // Nothing of a suggestion is in the file until it is kept.
    expect(await markdownOf(inner)).toBe(text)
    await review.getByRole('button', { name: 'Keep', exact: true }).click()
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the fortnight')
    await expect(review).toContainText('A change suggested by Jean')
    // ⌘Z undoes a change kept, as any edit.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the week')
    await review.getByRole('button', { name: 'Undo change' }).click()
    await expect(review).toBeHidden()
    expect(await markdownOf(inner)).toBe(text)
    await expect.poll(() => told(page)).toContain('Of the changes suggested to notes, the user kept 1 and undid 1.')
  })

  test('Keep beside a change, with a pointer, and Keep all', async ({ page }) => {
    const text = await sample()
    const { inner, frame, doc } = await start(page)
    await suggest(page, text.replace('19:30', '20:00').replace('| Tuesday | 860 € |', '| Tuesday | 900 € |').replace('- [ ] Train tickets', '- [x] Train tickets'))
    await expect(doc.locator('.suggest-actions')).toHaveCount(3)
    await doc.locator('.suggest-keep').first().click()
    await expect(doc.locator('.suggest-actions')).toHaveCount(2)
    await frame.getByRole('button', { name: 'Keep all' }).click()
    await expect(doc.locator('.suggest-actions')).toHaveCount(0)
    const kept = await markdownOf(inner)
    expect(kept).toContain('dinner at 20:00')
    expect(kept).toContain('| Tuesday | 900 € | Malik |')
    expect(kept).toContain('- [x] Train tickets')
  })
})

test.describe('found and used by the brain', () => {
  test('a document written again offers Documents; the brain then makes one, and its changes are kept or undone', async ({ page }) => {
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
    const inner = /** @type {import('@playwright/test').Frame} */ (await (await page.locator(FRAME).elementHandle())?.contentFrame())
    await inner.waitForFunction(() => document.querySelector('#doc h1')?.textContent === 'Cover letter')
    await expect(page.locator('app-preview .pane-head h2')).toHaveText('Cover letter.md')
    await expect(page.locator('app-file').last()).toContainText('Cover letter.md')
    const path = await page.evaluate(async () => {
      const { app } = await import('/ui/state.js')
      return `documents/${(await app.fs.list(`${app.projectDir}/documents`)).map((entry) => entry.name).find((name) => name.endsWith('-cover-letter.md'))}`
    })
    expect(path).toMatch(/^documents\/[0-9A-HJKMNP-TV-Z]{26}-cover-letter\.md$/)
    await ask(page, `Call suggest with ${JSON.stringify({ document: path, markdown: '# Cover letter\n\nI am writing to apply for the post of editor.' })}`)
    await answered(page, 4)
    const frame = page.frameLocator(FRAME)
    await expect(frame.locator('#doc ins.suggest-ins')).toHaveText(' of editor')
    await frame.getByRole('button', { name: 'Keep', exact: true }).click()
    await expect.poll(() => saved(page, path)).toBe('# Cover letter\n\nI am writing to apply for the post of editor.\n')
  })
})

test.describe('Japanese input', () => {
  test('a composition through an IME, committed, and Enter that confirms it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright drives no IME in WebKit: its keyboard sends text, never a composition (to check by hand in Safari)')
    const { inner, doc } = await start(page, { lang: 'ja', markdown: '日本語のメモ\n\nEnglish line.\n' })
    await inner.evaluate(() => {
      const seen = /** @type {string[]} */ ((/** @type {any} */ (globalThis).seen = []))
      for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) document.getElementById('doc')?.addEventListener(type, (event) => seen.push(`${type}:${/** @type {CompositionEvent} */ (event).data}`))
    })
    await caretAt(inner, 'メモ', 2)
    const cdp = await page.context().newCDPSession(page)
    for (const text of ['か', 'かい', 'かいぎ']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
    await cdp.send('Input.imeSetComposition', { text: '会議', selectionStart: 2, selectionEnd: 2 })
    // Enter confirms the conversion: a keydown during the composition (keyCode 229), never a new paragraph.
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 })
    await cdp.send('Input.insertText', { text: '会議' })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await expect(doc.locator('p').first()).toHaveText('日本語のメモ会議')
    await expect(doc.locator('p')).toHaveCount(2)
    const events = await inner.evaluate(() => /** @type {any} */ (globalThis).seen)
    expect(events[0]).toBe('compositionstart:')
    expect(events.at(-1)).toBe('compositionend:会議')
    // In bold: what is composed takes the mark the caret has. A pause first, as a person makes between two words.
    await page.waitForTimeout(600)
    await page.keyboard.press('ControlOrMeta+b')
    await cdp.send('Input.imeSetComposition', { text: 'です', selectionStart: 2, selectionEnd: 2 })
    await cdp.send('Input.insertText', { text: 'です' })
    await expect.poll(() => markdownOf(inner)).toBe('日本語のメモ会議**です**\n\nEnglish line.\n')
    // One ⌘Z takes back what was composed in one go.
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => markdownOf(inner)).toBe('日本語のメモ会議\n\nEnglish line.\n')
    await cdp.detach()
  })
})

test.describe('Arabic and English', () => {
  const MIXED = 'مرحبا بالعالم، هذا Jean يكتب 2026 تقريرا.\n\nHello world, then مرحبا in the middle.\n'

  test('each paragraph takes its own direction, and the caret moves as the text reads', async ({ page }) => {
    const { inner, doc } = await start(page, { lang: 'ar', markdown: MIXED })
    expect(await inner.evaluate(() => document.documentElement.dir)).toBe('rtl')
    expect(await doc.locator('p').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).direction))).toEqual(['rtl', 'ltr'])
    // At the start of the Arabic paragraph, ArrowLeft goes forward into it, as it reads.
    await caretAt(inner, 'مرحبا')
    const begin = (await selection(inner)).from
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
    expect((await selection(inner)).from).toBe(begin + 3)
    await page.keyboard.press('ArrowRight')
    expect((await selection(inner)).from).toBe(begin + 2)
    // In the English paragraph, ArrowRight goes forward.
    await caretAt(inner, 'Hello')
    const english = (await selection(inner)).from
    await page.keyboard.press('ArrowRight')
    expect((await selection(inner)).from).toBe(english + 1)
    // Typing both, and a word selected with Shift+arrows made bold.
    await caretAt(inner, 'middle.', 7)
    await page.keyboard.insertText(' نص عربي and English')
    await caretAt(inner, 'Jean')
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
    const { from, to } = await selection(inner)
    const chosen = await inner.evaluate(([a, b]) => /** @type {any} */ (globalThis).editor.view.state.doc.textBetween(a, b), [from, to])
    await page.keyboard.press('ControlOrMeta+b')
    const text = await markdownOf(inner)
    expect(text).toContain(`**${chosen.trim()}**`)
    expect(text).toContain('Hello world, then مرحبا in the middle. نص عربي and English\n')
  })

  test('a list or a quote takes its first letter\'s direction, its bullets and boxes on that side', async ({ page }) => {
    const { doc } = await start(page, { lang: 'ar', markdown: '- أول\n- [ ] مهمة\n\n> اقتباس\n\n- First\n- Second\n' })
    const sides = await doc.locator(':scope > ul, :scope > blockquote').evaluateAll((all) => all.map((box) => getComputedStyle(box).direction))
    expect(sides).toEqual(['rtl', 'rtl', 'ltr'])
    // The task's box is at the line's start, on the right.
    const [item, box] = await Promise.all([doc.locator('li[data-checked]').boundingBox(), doc.locator('li[data-checked] input').boundingBox()])
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan((item?.x ?? 0) + (item?.width ?? 0) - 40)
  })

  test('a new line reads as the document does, right to left, until its first letter', async ({ page }) => {
    const { inner, doc } = await start(page, { lang: 'ar', markdown: MIXED })
    await caretAt(inner, 'تقريرا.', 7)
    await page.keyboard.press('Enter')
    await expect(doc.locator('p').nth(1)).toHaveAttribute('dir', 'rtl')
    await page.keyboard.insertText('Hello')
    await expect(doc.locator('p').nth(1)).toHaveAttribute('dir', 'auto')
    await expect.poll(() => doc.locator('p').nth(1).evaluate((p) => getComputedStyle(p).direction)).toBe('ltr')
  })
})

test.describe('the slash menu', () => {
  /** @param {import('@playwright/test').Frame} inner */
  const pointed = (inner) => inner.evaluate(() => document.getElementById('doc')?.getAttribute('aria-activedescendant') ?? null)

  test('"/" at a line\'s start offers what the line can become, narrowed as one types', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: 'First.\n' })
    const menu = frame.getByRole('listbox', { name: 'Turn into' })
    await caretAt(inner, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('option')).toHaveCount(10)
    await expect(menu.getByRole('option', { name: 'Heading 1' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.type('hea')
    await expect(menu.getByRole('option')).toHaveCount(3)
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('option', { name: 'Heading 2' })).toHaveAttribute('aria-selected', 'true')
    expect(await pointed(inner)).toBe('slash-1')
    await expect(frame.locator('[aria-live]')).toHaveText('Heading 2, 2 of 3')
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    expect(await pointed(inner)).toBeNull()
    await page.keyboard.type('Plan')
    expect(await markdownOf(inner)).toBe('First.\n\n## Plan\n')
  })

  test('Escape leaves the slash as text, and a slash inside a line opens nothing', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: 'First.\n' })
    const menu = frame.getByRole('listbox')
    await caretAt(inner, 'First.', 6)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await page.keyboard.type('usr/bin and/or')
    await expect(menu).toBeHidden()
    expect(await markdownOf(inner)).toBe('First.\n\n/usr/bin and/or\n')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/zzz')
    await expect(menu).toContainText('No results')
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
  })

  test('a to-do list that goes on with Enter, a table chosen with a click, a divider', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: 'First.\n' })
    const menu = frame.getByRole('listbox')
    await caretAt(inner, 'First.', 6)
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
    await caretAt(inner, 'First.', 0)
    await page.keyboard.press('Enter')
    await at(inner, 1)
    await page.keyboard.type('/div')
    await page.keyboard.press('Enter')
    expect(await markdownOf(inner)).toBe('---\n\nFirst.\n\n- [ ] Buy milk\n- [ ] Call Ana\n\n| Who | What |\n| --- | --- |\n|  |  |\n')
  })

  test('in Japanese: the full-width ／ a Japanese keyboard types opens it, and Japanese names narrow it', async ({ page, browserName }) => {
    const { inner, frame } = await start(page, { lang: 'ja', markdown: 'メモ\n' })
    const menu = frame.getByRole('listbox', { name: 'ブロックの種類' })
    await caretAt(inner, 'メモ', 2)
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
    expect(await markdownOf(inner)).toBe('メモ\n\n# タイトル\n')
  })

  test('in Arabic: its names, right to left, at the line\'s start on the right', async ({ page }) => {
    const { inner, frame } = await start(page, { lang: 'ar', markdown: 'سطر أول.\n' })
    const menu = frame.getByRole('listbox', { name: 'تحويل إلى' })
    await caretAt(inner, 'سطر أول.', 8)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveCSS('direction', 'rtl')
    await expect(menu.getByRole('option', { name: 'قائمة مهام' })).toBeVisible()
    const box = /** @type {{ x: number, width: number }} */ (await menu.boundingBox())
    const line = /** @type {{ x: number, width: number }} */ (await frame.locator('#doc p').nth(1).boundingBox())
    // Its right edge under the slash, where the line starts.
    expect(Math.abs(box.x + box.width - (line.x + line.width))).toBeLessThan(24)
  })
})

test.describe('the bubble over a selection', () => {
  /** @param {import('@playwright/test').FrameLocator} frame */
  const bubbleOf = (frame) => frame.getByRole('toolbar', { name: 'Format' })
  /** @param {import('@playwright/test').Frame} inner @param {string} text */
  const box = (inner, text) => inner.evaluate((t) => {
    const { view } = /** @type {any} */ (globalThis).editor
    let at = -1
    view.state.doc.descendants((/** @type {any} */ node, /** @type {number} */ pos) => { const i = node.isText ? node.text.indexOf(t) : -1; if (i >= 0 && at < 0) at = pos + i; return at < 0 })
    const [a, b] = [view.coordsAtPos(at), view.coordsAtPos(at + t.length)]
    return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) }
  }, text)

  test('it shows over text selected, and its buttons put marks on and take them off', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: '# Notes\n\nOne two three.\n\nAnother line.\n' })
    const bubble = bubbleOf(frame)
    await expect(bubble).toBeHidden()
    await selectText(inner, 'One')
    await expect(bubble).toBeVisible()
    // Above the selection, in the frame's own coordinates.
    const frameTop = (await page.locator(FRAME).boundingBox())?.y ?? 0
    const bubbleBox = /** @type {{ y: number, height: number }} */ (await bubble.boundingBox())
    expect(bubbleBox.y - frameTop + bubbleBox.height).toBeLessThanOrEqual((await box(inner, 'One')).top)
    await bubble.getByRole('button', { name: 'Bold' }).click()
    await expect(bubble.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    await selectText(inner, 'two')
    await bubble.getByRole('button', { name: 'Italic' }).click()
    await selectText(inner, 'three')
    await bubble.getByRole('button', { name: 'Strikethrough' }).click()
    expect(await markdownOf(inner)).toBe('# Notes\n\n**One** *two* ~~three~~.\n\nAnother line.\n')
    // All of it bold: pressed, and a press takes it off; part of it: not pressed, and a press puts it on all.
    await selectText(inner, 'One')
    await expect(bubble.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    await bubble.getByRole('button', { name: 'Bold' }).click()
    await place(inner, 'One', 0, 'One **two'.length - 2)
    await expect(bubble.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false')
    await bubble.getByRole('button', { name: 'Italic' }).click()
    expect(await markdownOf(inner)).toBe('# Notes\n\n*One two* ~~three~~.\n\nAnother line.\n')
    // The caret alone, or the keyboard in Jean's box: no bubble.
    await caretAt(inner, 'Another')
    await expect(bubble).toBeHidden()
    await selectText(inner, 'Another')
    await expect(bubble).toBeVisible()
    await page.locator('#prompt').click()
    await expect(bubble).toBeHidden()
  })

  test('a selection made with the mouse: the bubble comes when the button is let go', async ({ page }) => {
    const { frame } = await start(page, { markdown: 'Drag across these words to select them.\n' })
    const bubble = bubbleOf(frame)
    const line = /** @type {{ x: number, y: number, width: number, height: number }} */ (await frame.locator('#doc p').boundingBox())
    await page.mouse.move(line.x + 2, line.y + line.height / 2)
    await page.mouse.down()
    await page.mouse.move(line.x + line.width * 0.5, line.y + line.height / 2, { steps: 5 })
    await expect(bubble).toBeHidden()
    await page.mouse.up()
    await expect(bubble).toBeVisible()
  })

  test('a link: typed, made safe, refused when it would run, removed; ⌘K opens it', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: 'One two three.\n' })
    const bubble = bubbleOf(frame)
    const address = bubble.getByRole('textbox', { name: 'Link address' })
    await selectText(inner, 'two')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(address).toBeFocused()
    await page.keyboard.type('example.com/plan')
    await page.keyboard.press('Enter')
    expect(await markdownOf(inner)).toBe('One [two](https://example.com/plan) three.\n')
    expect(await inner.evaluate(() => document.activeElement?.id)).toBe('doc')
    await selectText(inner, 'three')
    await bubble.getByRole('button', { name: 'Link' }).click()
    await page.keyboard.type('javascript:alert(1)')
    await page.keyboard.press('Enter')
    await expect(address).toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Escape')
    await expect(bubble.getByRole('button', { name: 'Link' })).toBeFocused()
    expect(await markdownOf(inner)).toBe('One [two](https://example.com/plan) three.\n')
    await selectText(inner, 'two')
    await expect(bubble.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true')
    await bubble.getByRole('button', { name: 'Link' }).click()
    await expect(address).toHaveValue('https://example.com/plan')
    await bubble.getByRole('button', { name: 'Remove link' }).click()
    expect(await markdownOf(inner)).toBe('One two three.\n')
  })

  test('from the keyboard: Shift+arrows, then Alt+F10 or Tab into it, arrows along it, Escape back', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: 'One two three.\n' })
    const bubble = bubbleOf(frame)
    await caretAt(inner, 'two')
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight')
    await expect.poll(async () => { const { from, to } = await selection(inner); return to - from }).toBe(3)
    await expect(bubble).toBeVisible()
    await expect(bubble).toHaveAttribute('aria-keyshortcuts', 'Alt+F10')
    await page.keyboard.press('Alt+F10')
    await expect(bubble.getByRole('button', { name: 'Bold' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(bubble.getByRole('button', { name: 'Italic' })).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await markdownOf(inner)).toBe('One *two* three.\n')
    // ⌘B in the bubble acts as in the document.
    await page.keyboard.press('ControlOrMeta+b')
    expect(await markdownOf(inner)).toBe('One ***two*** three.\n')
    await page.keyboard.press('Escape')
    await expect.poll(() => inner.evaluate(() => document.activeElement?.id)).toBe('doc')
    expect(await inner.evaluate(() => { const { from, to } = /** @type {any} */ (globalThis).editor.view.state.selection; return to - from })).toBe(3)
    // Tab goes back to where the arrows were.
    await page.keyboard.press('Tab')
    await expect(bubble.getByRole('button', { name: 'Italic' })).toBeFocused()
    await page.keyboard.press('Escape')
    // Escape in the document hides it, until the selection changes.
    await page.keyboard.press('Escape')
    await expect(bubble).toBeHidden()
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(bubble).toBeVisible()
  })

  test('none over code, and none while the slash menu is open', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: '```\ncode here\n```\n\nText.\n' })
    await selectText(inner, 'code')
    await expect(bubbleOf(frame)).toBeHidden()
    await caretAt(inner, 'Text.', 5)
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await expect(frame.getByRole('listbox')).toBeVisible()
    await expect(bubbleOf(frame)).toBeHidden()
  })

  test('in Arabic: its names, right to left, its arrows too', async ({ page }) => {
    const { inner, frame } = await start(page, { lang: 'ar', markdown: 'مرحبا بالعالم، هذا Jean يكتب.\n' })
    const bubble = frame.getByRole('toolbar', { name: 'التنسيق' })
    await selectText(inner, 'بالعالم')
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
    expect(await markdownOf(inner)).toBe('مرحبا *بالعالم*، هذا Jean يكتب.\n')
  })
})

test.describe('blocks', () => {
  const DOC = '# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- one\n- two\n\nLast paragraph.\n'
  /** @param {import('@playwright/test').Locator} locator */
  const boxOf = async (locator) => /** @type {{ x: number, y: number, width: number, height: number }} */ (await locator.boundingBox())
  /** Hovers a block and gives its grip, once it shows. @param {import('@playwright/test').Page} page @param {import('@playwright/test').FrameLocator} frame @param {import('@playwright/test').Locator} block */
  const gripOf = async (page, frame, block) => {
    const at = await boxOf(block)
    await page.mouse.move(at.x + 20, at.y + 6)
    const grip = frame.locator('.block-handle')
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
  /** The frame's margin, where the line starts. @param {import('@playwright/test').Page} page */
  const margin = async (page) => (await boxOf(page.locator(FRAME))).x + 6

  test('a drag from the margin selects the blocks it crosses; Delete removes them, ⌘Z brings them back', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const x = await margin(page)
    const first = await boxOf(frame.locator('#doc > p').nth(0))
    const second = await boxOf(frame.locator('#doc > p').nth(1))
    await page.mouse.move(x, first.y + 4)
    await page.mouse.down()
    await page.mouse.move(x + 54, second.y + second.height - 4, { steps: 6 })
    await expect(frame.locator('.marquee')).toBeVisible()
    await page.mouse.up()
    await expect(frame.locator('.marquee')).toBeHidden()
    await expect(frame.locator('#doc > .block-selected')).toHaveCount(2)
    await expect(frame.locator('[aria-live]')).toHaveText('2 blocks selected')
    await expect(frame.getByRole('toolbar', { name: 'Format' })).toBeHidden()
    // The brain is told what is selected, as of any selection.
    await expect.poll(() => told(page)).toContain('Selected in notes:\n\nFirst paragraph.\n\nSecond paragraph.')
    await page.keyboard.press('Backspace')
    expect(await markdownOf(inner)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph.\n')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await markdownOf(inner)).toBe(DOC)
    await expect(frame.locator('#doc > .block-selected')).toHaveCount(2)
  })

  test('a list\'s items are blocks of their own: selected one by one, moved among the list and out of it', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const x = await margin(page)
    const one = await boxOf(frame.locator('#doc li').nth(0))
    // A rectangle across the second paragraph's end and the list's first item takes that item alone of the list.
    const second = await boxOf(frame.locator('#doc > p').nth(1))
    await drag(page, { x, y: second.y + second.height - 4 }, { x: x + 54, y: one.y + one.height / 2 })
    await expect(frame.locator('.block-selected')).toHaveText(['Second paragraph.', 'one'])
    // From the keyboard: Escape on the second item, up to the first, moved down past it, then out of the list below.
    await caretAt(inner, 'two')
    await page.keyboard.press('Escape')
    await expect(frame.locator('.block-selected')).toHaveText(['two'])
    await page.keyboard.press('ArrowUp')
    await expect(frame.locator('.block-selected')).toHaveText(['one'])
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    expect(await markdownOf(inner)).toBe('# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- two\n- one\n\nLast paragraph.\n')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    expect(await markdownOf(inner)).toBe('# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- two\n\nLast paragraph.\n\n- one\n')
    await expect(frame.locator('.block-selected')).toHaveText(['one'])
    // Moved back up past the paragraph, then next to its old list, it joins it again.
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    expect(await markdownOf(inner)).toBe('# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n\n- two\n- one\n\nLast paragraph.\n')
  })

  test('two lists of a kind moved next to each other stay two lists in the file', async ({ page }) => {
    const { inner } = await start(page, { markdown: '- a\n- b\n\nMiddle.\n\n- c\n' })
    await caretAt(inner, 'Middle.')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    const text = await markdownOf(inner)
    expect(text).toBe('- a\n- b\n\n* c\n\nMiddle.\n')
    await expect.poll(() => saved(page)).toBe(text)
  })

  test('a click in the margin puts the caret on that line', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const second = await boxOf(frame.locator('#doc > p').nth(1))
    await page.mouse.click(await margin(page), second.y + second.height / 2)
    expect(await inner.evaluate(() => { const { selection } = /** @type {any} */ (globalThis).editor.view.state; return [selection.empty, selection.$from.parent.textContent] })).toEqual([true, 'Second paragraph.'])
    await expect(frame.locator('.block-selected')).toHaveCount(0)
  })

  test('the grip beside a block: a click selects it and opens its menu, a drag moves it', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const last = frame.locator('#doc > p', { hasText: 'Last paragraph.' })
    const grip = await gripOf(page, frame, last)
    const gripAt = await boxOf(grip)
    expect(gripAt.x + gripAt.width).toBeLessThanOrEqual((await boxOf(last)).x)
    await expect(grip).toHaveAccessibleName('Drag to move, click for options')
    await grip.click()
    await expect(frame.locator('#doc > .block-selected')).toHaveText(['Last paragraph.'])
    const menu = frame.getByRole('menu', { name: 'Block options' })
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    const again = await boxOf(await gripOf(page, frame, last))
    const first = await boxOf(frame.locator('#doc > p').nth(0))
    await drag(page, { x: again.x + again.width / 2, y: again.y + again.height / 2 }, { x: first.x + 8, y: first.y + 3 })
    await expect.poll(() => markdownOf(inner)).toBe('# Plan\n\nLast paragraph.\n\nFirst paragraph.\n\nSecond paragraph.\n\n- one\n- two\n')
  })

  test('the grip\'s menu moves, turns and deletes blocks with no drag (WCAG 2.5.7), from the keyboard too', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const menu = frame.getByRole('menu', { name: 'Block options' })
    await (await gripOf(page, frame, frame.locator('#doc > p').nth(1))).click()
    await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeFocused()
    await menu.getByRole('menuitem', { name: 'Move up' }).click()
    expect(await markdownOf(inner)).toBe('# Plan\n\nSecond paragraph.\n\nFirst paragraph.\n\n- one\n- two\n\nLast paragraph.\n')
    await expect(frame.locator('#doc > .block-selected')).toHaveText(['Second paragraph.'])
    // Turned into a heading, the blocks still selected; then into a list.
    await (await gripOf(page, frame, frame.locator('#doc > p').nth(0))).click()
    // What a paragraph can become: all but text.
    await expect(menu.getByRole('group', { name: 'Turn into' }).getByRole('menuitem')).toHaveCount(8)
    await menu.getByRole('menuitem', { name: 'Heading 2' }).click()
    expect(await markdownOf(inner)).toContain('# Plan\n\n## Second paragraph.\n\nFirst paragraph.')
    await expect(frame.locator('#doc > .block-selected')).toHaveText(['Second paragraph.'])
    // From the keyboard: Escape on a line, Shift+F10, the arrows, Enter.
    await caretAt(inner, 'Last')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+F10')
    await expect(menu).toBeVisible()
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await markdownOf(inner)).toBe('# Plan\n\n## Second paragraph.\n\nFirst paragraph.\n\n- one\n- two\n')
    await expect.poll(() => inner.evaluate(() => document.activeElement?.id)).toBe('doc')
    // The first block can't move up: its Move up is off.
    await caretAt(inner, 'Plan')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+F10')
    await expect(menu.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Move down' })).toBeFocused()
  })

  test('the blocks selected move together, by the grip of any of them', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const x = await margin(page)
    const first = await boxOf(frame.locator('#doc > p').nth(0))
    const second = await boxOf(frame.locator('#doc > p').nth(1))
    await drag(page, { x, y: first.y + 4 }, { x: x + 54, y: second.y + 6 })
    await expect(frame.locator('#doc > .block-selected')).toHaveCount(2)
    const grip = await gripOf(page, frame, frame.locator('#doc > p').nth(1))
    const gripAt = await boxOf(grip)
    const last = await boxOf(frame.locator('#doc > p', { hasText: 'Last paragraph.' }))
    await drag(page, { x: gripAt.x + gripAt.width / 2, y: gripAt.y + gripAt.height / 2 }, { x: last.x + last.width - 10, y: last.y + last.height - 3 })
    await expect.poll(() => markdownOf(inner)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph.\n\nFirst paragraph.\n\nSecond paragraph.\n')
  })

  test('a rectangle drawn to the frame\'s foot scrolls it, and selects the blocks it reaches', async ({ page }) => {
    const lines = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}.`)
    const { inner, frame } = await start(page, { markdown: `${lines.join('\n\n')}\n` })
    const x = await margin(page)
    const view = await boxOf(page.locator(FRAME))
    const first = await boxOf(frame.locator('#doc > p').nth(0))
    await page.mouse.move(x, first.y + 4)
    await page.mouse.down()
    await page.mouse.move(x + 40, view.y + view.height - 6, { steps: 8 })
    await expect.poll(() => inner.evaluate(() => scrollY)).toBeGreaterThan(200)
    await page.mouse.up()
    const count = await frame.locator('#doc > .block-selected').count()
    expect(count).toBeGreaterThan(20)
    await expect(frame.locator('#doc > .block-selected').first()).toHaveText('Paragraph 1.')
  })

  test('from the keyboard: Escape selects the block, arrows, Shift+arrows, ⌘⇧↑ ⌘⇧↓, Delete, and back to the text', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const selected = frame.locator('#doc > .block-selected')
    await caretAt(inner, 'Second')
    await page.keyboard.press('Escape')
    await expect(selected).toHaveText(['Second paragraph.'])
    await page.keyboard.press('ArrowUp')
    await expect(selected).toHaveText(['First paragraph.'])
    await page.keyboard.press('Shift+ArrowDown')
    await expect(selected).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    expect(await markdownOf(inner)).toBe('First paragraph.\n\nSecond paragraph.\n\n# Plan\n\n- one\n- two\n\nLast paragraph.\n')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    expect(await markdownOf(inner)).toBe(DOC)
    await expect(selected).toHaveCount(2)
    // A letter typed over blocks replaces nothing.
    await page.keyboard.type('x')
    expect(await markdownOf(inner)).toBe(DOC)
    await page.keyboard.press('Delete')
    expect(await markdownOf(inner)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph.\n')
    // Escape twice: the block, then the text again, the caret at its end.
    await caretAt(inner, 'Last')
    await page.keyboard.press('Escape')
    await expect(frame.locator('.block-selected')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(frame.locator('.block-selected')).toHaveCount(0)
    await page.keyboard.type(' Done')
    expect(await markdownOf(inner)).toBe('# Plan\n\n- one\n- two\n\nLast paragraph. Done\n')
  })

  test('a drag from off the text inside a block, beside a heading or past a line\'s end, selects blocks, not text', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const heading = await boxOf(frame.locator('#doc > h1'))
    const second = await boxOf(frame.locator('#doc > p').nth(1))
    // Beside the heading's short text, inside its box.
    await drag(page, { x: heading.x + heading.width - 30, y: heading.y + heading.height / 2 }, { x: heading.x + heading.width - 60, y: second.y + 6 })
    await expect(frame.locator('#doc > .block-selected')).toHaveCount(3)
    expect(await kindOf(inner)).toBe('block')
    await expect(frame.getByRole('toolbar', { name: 'Format' })).toBeHidden()
    // Past the end of a paragraph's line, upwards.
    const first = await boxOf(frame.locator('#doc > p').nth(0))
    await drag(page, { x: second.x + second.width - 20, y: second.y + second.height / 2 }, { x: second.x + second.width - 40, y: first.y + 4 })
    await expect(frame.locator('#doc > .block-selected')).toHaveText(['First paragraph.', 'Second paragraph.'])
  })

  test('a click off the text puts the caret at the line\'s end; a drag on the text still selects text', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: DOC })
    const at = await boxOf(frame.locator('#doc > p').nth(0))
    await page.mouse.click(at.x + at.width - 20, at.y + at.height / 2)
    expect(await inner.evaluate(() => { const { selection } = /** @type {any} */ (globalThis).editor.view.state; return [selection.toJSON().type, selection.empty, selection.$from.parentOffset, selection.$from.parent.textContent] })).toEqual(['text', true, 16, 'First paragraph.'])
    await expect(frame.locator('.block-selected')).toHaveCount(0)
    // From the text itself, a drag selects text, as ever, and the bubble comes.
    await drag(page, { x: at.x + 2, y: at.y + at.height / 2 }, { x: at.x + 60, y: at.y + at.height / 2 })
    expect(await kindOf(inner)).toBe('text')
    await expect(frame.locator('.block-selected')).toHaveCount(0)
    await expect(frame.getByRole('toolbar', { name: 'Format' })).toBeVisible()
  })

  test('a double click off the text is the browser\'s, and a table\'s cells and code keep their own drags', async ({ page }) => {
    const { inner, frame } = await start(page, { markdown: '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```\ncode\nmore code\n```\n\nAfter the table.\n' })
    const cell = await boxOf(frame.locator('#doc td').first())
    const other = await boxOf(frame.locator('#doc td').nth(1))
    await drag(page, { x: cell.x + cell.width - 8, y: cell.y + cell.height / 2 }, { x: other.x + other.width - 8, y: other.y + other.height / 2 })
    await expect(frame.locator('#doc > .block-selected')).toHaveCount(0)
    const code = await boxOf(frame.locator('#doc pre'))
    await drag(page, { x: code.x + code.width - 10, y: code.y + 12 }, { x: code.x + 20, y: code.y + code.height - 10 })
    await expect(frame.locator('#doc > .block-selected')).toHaveCount(0)
    const after = await boxOf(frame.locator('#doc > p'))
    await page.mouse.dblclick(after.x + after.width - 20, after.y + after.height / 2)
    await expect(frame.locator('.block-selected')).toHaveCount(0)
    expect(await inner.evaluate(() => /** @type {any} */ (globalThis).editor.view.state.selection.$from.parent.textContent)).toBe('After the table.')
  })

  test('in Arabic: beside a heading\'s text on its left, where the line ends; the grip on the right', async ({ page }) => {
    const { inner, frame } = await start(page, { lang: 'ar', markdown: '# عنوان\n\nسطر أول.\n\nسطر ثان.\n' })
    const heading = await boxOf(frame.locator('#doc > h1'))
    const second = await boxOf(frame.locator('#doc > p').nth(1))
    await drag(page, { x: heading.x + 30, y: heading.y + heading.height / 2 }, { x: heading.x + 60, y: second.y + 6 })
    await expect(frame.locator('#doc > .block-selected')).toHaveCount(3)
    expect(await kindOf(inner)).toBe('block')
    const line = frame.locator('#doc > p').nth(1)
    const grip = await gripOf(page, frame, line)
    expect((await boxOf(grip)).x).toBeGreaterThanOrEqual((await boxOf(line)).x + (await boxOf(line)).width)
    await grip.click()
    // The menu of the whole document, selected: nowhere to move it, so the first kind to turn it into takes the keyboard.
    const menu = frame.getByRole('menu', { name: 'خيارات الكتلة' })
    await expect(menu.getByRole('menuitem', { name: 'نقل للأعلى' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'نقل للأسفل' })).toBeDisabled()
    await expect(menu.getByRole('group', { name: 'تحويل إلى' }).getByRole('menuitem').first()).toBeFocused()
    await expect(menu).toHaveCSS('direction', 'rtl')
  })

  test('a block\'s highlight comes and goes in 150 ms, at once with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const { inner, frame } = await start(page, { markdown: DOC })
    const block = frame.locator('#doc > p').first()
    const timing = () => block.evaluate((p) => { const style = getComputedStyle(p); return { property: style.transitionProperty, duration: style.transitionDuration } })
    expect(await timing()).toEqual({ property: 'background-color, box-shadow', duration: '0.15s, 0.15s' })
    // The transitions themselves, running as the block is selected, then done.
    await caretAt(inner, 'First')
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
  /**
   * The frame as the room has it: light or dark, the pane showing through it, and the room's ink.
   * @param {import('@playwright/test').Page} page @param {import('@playwright/test').Frame} inner
   */
  const looks = async (page, inner) => {
    const ink = await page.locator('app-preview .pane').evaluate((pane) => getComputedStyle(pane).color)
    const [scheme, ground, text] = await inner.evaluate(() => [document.documentElement.style.colorScheme, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color])
    return { scheme, ground, room: text === ink }
  }

  test('the frame is dark when Jean is, by the system\'s setting, and follows its change, in the room\'s colours', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    const { inner } = await start(page)
    expect(await looks(page, inner)).toEqual({ scheme: 'dark', ground: 'rgba(0, 0, 0, 0)', room: true })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => looks(page, inner)).toEqual({ scheme: 'light', ground: 'rgba(0, 0, 0, 0)', room: true })
  })

  test('Jean\'s own theme wins over the system\'s', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    const { inner } = await start(page)
    await page.locator('#prompt').focus()
    await page.keyboard.press('ControlOrMeta+Shift+d')
    await expect.poll(() => looks(page, inner)).toEqual({ scheme: 'dark', ground: 'rgba(0, 0, 0, 0)', room: true })
  })
})

test.describe('paste', () => {
  /** @param {import('@playwright/test').Frame} inner @param {string} html @param {string} text */
  const paste = (inner, html, text) => inner.evaluate(([h, t]) => {
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
    const { inner } = await start(page, { markdown: '' })
    await at(inner, 1)
    expect(await paste(inner, await fixture('word.html'), 'Quarterly report')).toBe(true)
    expect(await markdownOf(inner)).toBe(EXPECTED)
  })

  test('from Google Docs: the same, from its spans and its lists inside lists', async ({ page }) => {
    const { inner } = await start(page, { markdown: '' })
    await at(inner, 1)
    expect(await paste(inner, await fixture('gdocs.html'), 'Quarterly report')).toBe(true)
    expect(await markdownOf(inner)).toBe(EXPECTED.replace('12 %', '12 %'))
  })

  test('what is pasted runs nothing and loads nothing', async ({ page }) => {
    const requests = /** @type {string[]} */ ([])
    page.on('request', (request) => requests.push(request.url()))
    await page.addInitScript(() => addEventListener('message', ({ data }) => { if (typeof data === 'string') (/** @type {any} */ (globalThis).pwned ??= []).push(data) }))
    const { inner } = await start(page, { markdown: 'Start.\n' })
    await caretAt(inner, 'Start.', 6)
    const hostile = '<p>Hi <img src="https://attacker.example/x.png" onerror="parent.postMessage(\'pwned\',\'*\')"><script>parent.postMessage(\'pwned2\',\'*\')</script><a href="javascript:parent.postMessage(\'pwned3\',\'*\')">click</a> <a href="https://ok.example/">ok</a><svg onload="parent.postMessage(\'pwned4\',\'*\')"></svg><iframe src="https://attacker.example/"></iframe><style>body { display: none }</style></p>'
    await paste(inner, hostile, 'Hi click ok')
    await inner.locator('#doc').click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(500)
    expect(requests.filter((url) => url.includes('attacker.example'))).toEqual([])
    expect(await page.evaluate(() => /** @type {any} */ (globalThis).pwned ?? [])).toEqual([])
    const text = await markdownOf(inner)
    expect(text).toContain('[ok](https://ok.example/)')
    expect(text).not.toContain('javascript:')
    await expect(inner.locator('body')).toBeVisible()
  })

  test('⌘V pastes what the system clipboard holds into the frame', async ({ page, browserName, context }) => {
    test.skip(browserName !== 'chromium', 'Playwright grants clipboard access to Chromium only; WebKit\'s pastes are covered by the paste events above')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { inner, doc } = await start(page, { markdown: 'Start.\n' })
    await page.evaluate(async (html) => {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['Quarterly report'], { type: 'text/plain' }) })])
    }, await fixture('gdocs.html'))
    await doc.click()
    await caretAt(inner, 'Start.', 6)
    await page.keyboard.press('ControlOrMeta+v')
    await expect.poll(() => markdownOf(inner)).toContain('- Second point\n  - Nested point')
    expect(await markdownOf(inner)).toContain('**revenue**')
  })

  test('copying from the frame and pasting in Jean\'s box', async ({ page, browserName, context }) => {
    test.skip(browserName !== 'chromium', 'Playwright grants clipboard access to Chromium only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const { inner } = await start(page)
    await selectText(inner, 'Here is the plan')
    await page.keyboard.press('ControlOrMeta+c')
    await page.locator('#prompt').click()
    await page.keyboard.press('ControlOrMeta+v')
    await expect(page.locator('#prompt')).toHaveValue('Here is the plan')
  })
})

test.describe('keys', () => {
  test('⌘B, ⌘I, ⌘Z and ⌘⇧Z', async ({ page }) => {
    const { inner } = await start(page, { markdown: 'One two three.\n' })
    await selectText(inner, 'two')
    await page.keyboard.press('ControlOrMeta+b')
    expect(await markdownOf(inner)).toBe('One **two** three.\n')
    await selectText(inner, 'three')
    await page.keyboard.press('ControlOrMeta+i')
    expect(await markdownOf(inner)).toBe('One **two** *three*.\n')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await markdownOf(inner)).toBe('One **two** three.\n')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await markdownOf(inner)).toBe('One two three.\n')
    await page.keyboard.press('ControlOrMeta+Shift+z')
    expect(await markdownOf(inner)).toBe('One **two** three.\n')
  })

  test('Tab indents a list\'s item, moves through a table, and otherwise leaves the editor', async ({ page, browserName }) => {
    const { inner } = await start(page, { markdown: '- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.\n' })
    await caretAt(inner, 'two')
    await page.keyboard.press('Tab')
    expect(await markdownOf(inner)).toContain('- one\n  - two')
    await page.keyboard.press('Shift+Tab')
    expect(await markdownOf(inner)).toContain('- one\n- two')
    // Tab on the first item, which can't go deeper, stays in the list.
    await caretAt(inner, 'one')
    await page.keyboard.press('Tab')
    expect(await inner.evaluate(() => document.activeElement?.id)).toBe('doc')
    // Tab selects the next cell's text, as a spreadsheet does: what is typed replaces it.
    await caretAt(inner, 'a')
    await page.keyboard.press('Tab')
    await page.keyboard.type('B')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1!')
    // From the last cell, Tab adds a row.
    await caretAt(inner, '2', 1)
    await page.keyboard.press('Tab')
    await page.keyboard.type('3')
    expect(await markdownOf(inner)).toContain('| a | B |\n| --- | --- |\n| 1! | 2 |\n| 3 |  |')
    // WebKit on a Mac moves the focus on ⌥Tab only, as Safari does unless Full Keyboard Access is on.
    await caretAt(inner, 'After.')
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
    await expect.poll(() => inner.evaluate(() => document.activeElement?.id ?? '')).not.toBe('doc')
    expect(await markdownOf(inner)).toContain('\nAfter.\n')
  })

  test('the browser\'s Format menu (iOS\'s B I U) makes text bold', async ({ page }) => {
    const { inner } = await start(page, { markdown: 'One two.\n' })
    await selectText(inner, 'two')
    await inner.evaluate(() => /** @type {any} */ (globalThis).editor.view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'formatBold', bubbles: true, cancelable: true })))
    expect(await markdownOf(inner)).toBe('One **two**.\n')
  })

  test('Jean\'s own keys reach Jean from the frame: ⌘, from the document, Escape from the review bar', async ({ page }) => {
    const text = await sample()
    const { inner, frame } = await start(page)
    await caretAt(inner, 'Questions?')
    // Escape is the document's: it selects the block, and the preview stays.
    await page.keyboard.press('Escape')
    await expect(frame.locator('.block-selected')).toHaveCount(1)
    await expect(page.locator(FRAME)).toHaveCount(1)
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+Comma')
    await expect(page.locator('app-settings dialog[open]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
    await suggest(page, text.replace('plan for the week', 'plan for the fortnight'))
    await frame.getByRole('button', { name: 'Keep all' }).focus()
    await page.keyboard.press('Escape')
    await expect(page.locator('app-preview .pane')).toHaveCount(0)
  })
})

test.describe('focus', () => {
  test('Tab goes from Jean into the document, through the review bar when it shows, and back', async ({ page, browserName }) => {
    const { inner, frame } = await start(page, { markdown: 'A paragraph.\n' })
    const [tab, back] = browserName === 'webkit' ? ['Alt+Tab', 'Alt+Shift+Tab'] : ['Tab', 'Shift+Tab']
    const close = page.locator('app-preview .pane-head button').last()
    await close.focus()
    await page.keyboard.press(tab)
    await expect.poll(() => inner.evaluate(() => document.activeElement?.id)).toBe('doc')
    await page.keyboard.press(back)
    await expect(close).toBeFocused()
    await suggest(page, 'A paragraph, changed.\n')
    await page.keyboard.press(tab)
    // Previous and Next are off with one change: Keep comes first.
    await expect(frame.getByRole('button', { name: 'Keep', exact: true })).toBeFocused()
  })

  test('Jean focusing the frame puts the caret in the document', async ({ page }) => {
    const { inner } = await start(page, { markdown: 'A paragraph.\n' })
    await page.locator(FRAME).focus()
    await expect.poll(() => inner.evaluate(() => document.activeElement?.id)).toBe('doc')
    await page.keyboard.type('Typed ')
    expect(await markdownOf(inner)).toContain('Typed ')
  })
})

test.describe('drag and drop', () => {
  test('a piece of Jean\'s answer dragged into the document', async ({ page, browserName }) => {
    test.fixme(browserName === 'webkit', 'Playwright\'s WebKit drags within a page but delivers nothing into a frame: to check by hand in Safari')
    const { inner, doc } = await start(page, { markdown: 'First.\n\nSecond.\n' })
    const target = /** @type {{ x: number, y: number, width: number, height: number }} */ (await doc.locator('p').last().boundingBox())
    // A drag the browser brings in, as one from Jean's conversation or another program: its data and where it is let go.
    const cdp = await page.context().newCDPSession(page)
    const data = { items: [{ mimeType: 'text/html', data: '<p>Jean\'s answer: <strong>a bold claim</strong>.</p>' }, { mimeType: 'text/plain', data: 'a bold claim' }], dragOperationsMask: 1 }
    for (const type of /** @type {const} */ (['dragEnter', 'dragOver', 'drop'])) await cdp.send('Input.dispatchDragEvent', { type, x: target.x + target.width - 2, y: target.y + target.height / 2, data })
    await cdp.detach()
    await expect.poll(() => markdownOf(inner)).toContain('**a bold claim**')
  })

  test('a file dropped on the document is handed to Jean, which shares it in the conversation', async ({ page }) => {
    const { inner } = await start(page, { markdown: 'Text.\n' })
    await inner.evaluate(() => {
      const data = new DataTransfer()
      data.items.add(new File(['# A file'], 'dropped.md', { type: 'text/markdown' }))
      const dom = /** @type {HTMLElement} */ (document.getElementById('doc'))
      const rect = dom.getBoundingClientRect()
      dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }))
    })
    await expect(page.locator('app-composer .attachments')).toContainText('dropped.md')
    expect(await markdownOf(inner)).toBe('Text.\n')
  })
})

test.describe('accessibility', () => {
  test('what a screen reader reads in the frame', async ({ page }) => {
    const text = await sample()
    const { frame } = await start(page)
    await expect(page.locator(FRAME)).toHaveAttribute('title', 'notes')
    await suggest(page, text.replace('plan for the week', 'plan for the fortnight'))
    await expect(frame.locator('body')).toMatchAriaSnapshot(`
      - region "Suggested changes":
        - paragraph: A change suggested by Jean
        - text: Change 1 of 1
        - button "Keep"
        - button "Undo change"
        - button "Keep all"
        - button "Undo all"
      - 'textbox "Document: notes"':
        - 'heading "Team offsite: plan for the weekfortnight" [level=1]':
          - text: "Team offsite: plan for the"
          - deletion: week
          - insertion: fortnight
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
    const editor = frame.getByRole('textbox', { name: 'Document: notes' })
    await expect(editor).toHaveAttribute('aria-multiline', 'true')
    await expect(editor.getByRole('heading', { level: 2 })).toHaveCount(6)
    await expect(editor.getByRole('table')).toHaveCount(1)
    await expect(editor.getByRole('columnheader')).toHaveCount(3)
    await expect(editor.getByRole('list')).toHaveCount(4)
    await expect(editor.getByRole('checkbox', { name: 'Done' })).toHaveCount(3)
  })

  test('Chromium\'s own accessibility tree: the frame\'s document is inside the page\'s', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP is Chromium\'s')
    await start(page, { markdown: '# Title\n\nSome **bold** text.\n' })
    const cdp = await page.context().newCDPSession(page)
    const { frameTree } = await cdp.send('Page.getFrameTree')
    const child = frameTree.childFrames?.find((one) => one.frame.url.endsWith('/preview.html'))?.frame
    const inner = await cdp.send('Accessibility.getFullAXTree', { frameId: child?.id })
    const roles = inner.nodes.filter((n) => !n.ignored).map((n) => `${n.role?.value}:${n.name?.value ?? ''}`)
    expect(roles).toContain('textbox:Document: notes')
    expect(roles).toContain('heading:Title')
    await cdp.detach()
  })
})

test.describe('a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

  test('the frame fits, a tap puts the caret, typing, the "/" menu, the bubble and Keep work', async ({ page }) => {
    const { inner, frame, doc } = await start(page)
    const widths = await inner.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(widths.scroll).toBeLessThanOrEqual(widths.client)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const frameAt = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator(FRAME).boundingBox())
    expect(frameAt.width).toBeGreaterThan((page.viewportSize()?.width ?? 0) - 40)
    // A wide table scrolls in its own box.
    const table = await inner.evaluate(() => { const wrap = /** @type {HTMLElement} */ (document.querySelector('.tableWrapper')); return { overflow: getComputedStyle(wrap).overflowX, inside: wrap.getBoundingClientRect().right <= document.documentElement.clientWidth + 1 } })
    expect(table).toEqual({ overflow: 'auto', inside: true })
    await doc.locator('p', { hasText: 'Questions?' }).tap()
    expect(await inner.evaluate(() => document.activeElement?.id)).toBe('doc')
    await page.keyboard.insertText('Tapped. ')
    await expect.poll(() => markdownOf(inner)).toMatch(/Tapped\. /)
    // "/" on a line of its own: the menu fits on the screen, each choice a finger wide.
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('/')
    const menu = frame.getByRole('listbox')
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
    await expect.poll(() => markdownOf(inner)).toContain('- [ ] Pack')
    // A selection, as the handles leave it: the bubble below it, where the system's menu isn't, each button a finger wide.
    await selectText(inner, 'Pack')
    await inner.evaluate(() => { const { view } = /** @type {any} */ (globalThis).editor; scrollBy(0, view.coordsAtPos(view.state.selection.from).top - 120) })
    const bubble = frame.getByRole('toolbar', { name: 'Format' })
    await expect(bubble).toBeVisible()
    const below = await inner.evaluate(() => { const { view } = /** @type {any} */ (globalThis).editor; return view.coordsAtPos(view.state.selection.to).bottom })
    await expect.poll(async () => ((await bubble.boundingBox())?.y ?? 0) - frameAt.y).toBeGreaterThan(below)
    for (const button of await bubble.getByRole('button').all()) expect(Math.min(...Object.values(/** @type {{ width: number, height: number }} */ (await button.boundingBox())).slice(2))).toBeGreaterThanOrEqual(44)
    await bubble.getByRole('button', { name: 'Bold' }).tap()
    await expect.poll(() => markdownOf(inner)).toContain('- [ ] **Pack**')
    await suggest(page, (await markdownOf(inner)).replace('plan for the week', 'plan for the fortnight'))
    const keep = doc.locator('.suggest-keep')
    const box = /** @type {{ width: number, height: number }} */ (await keep.boundingBox())
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40)
    await keep.tap()
    await expect(doc.locator('h1')).toHaveText('Team offsite: plan for the fortnight')
  })

  test('blocks on a phone: the grip beside the block the caret is in, a finger wide; a tap selects it and opens its menu', async ({ page }) => {
    const { inner, frame, doc } = await start(page, { markdown: '# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n' })
    const grip = frame.locator('.block-handle')
    await expect(grip).toBeHidden()
    await doc.locator('p', { hasText: 'Second' }).tap()
    await expect(grip).toBeVisible()
    const at = /** @type {{ x: number, y: number, width: number, height: number }} */ (await grip.boundingBox())
    expect(Math.min(at.width, at.height)).toBeGreaterThanOrEqual(44)
    expect(at.x).toBeGreaterThanOrEqual((await page.locator(FRAME).boundingBox())?.x ?? 0)
    await grip.tap()
    await expect(frame.locator('#doc > .block-selected')).toHaveText(['Second paragraph.'])
    const menu = frame.getByRole('menu', { name: 'Block options' })
    for (const item of await menu.getByRole('menuitem').all()) expect((await item.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await menu.getByRole('menuitem', { name: 'Move up' }).tap()
    expect(await markdownOf(inner)).toBe('# Plan\n\nSecond paragraph.\n\nFirst paragraph.\n')
  })
})
