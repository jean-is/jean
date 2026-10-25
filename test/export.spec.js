// A task saved as a web page (D305): opened, it draws itself as Jean does, from the render package,
// here Jean's own files at the package's address, each checked by its hash: the answer's Markdown, a
// formula, a chart, a diagram, a score played on MS Basic's instruments from the sounds package (D338),
// a page whose script runs, offline, and the picture the task made, kept in the page; the page's own
// lines step aside. Where the package can't be reached, those lines stay,
// and the picture with them.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { test, expect } from '@playwright/test'
import { start, openTasks } from './helpers.js'

test.use({ viewport: { width: 1280, height: 800 } })

const PACKAGE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@jean-is\/render@[^/]+\/(.+)$/
const SOUNDS = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@jean-is\/sounds@[^/]+\/(.+)$/
const TYPES = /** @type {Record<string, string>} */ ({ js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', woff2: 'font/woff2', html: 'text/plain' })

const ANSWER = `Here is **the plan**, and $x^2 + 1$.

\`\`\`echarts
{"xAxis":{"type":"category","data":["Mon","Tue"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[3,5]}]}
\`\`\`

\`\`\`mermaid
flowchart LR
  A[Plan] --> B[Book]
\`\`\`

\`\`\`abc
X:1
T:Plan
M:4/4
L:1/4
K:C
CDEF|G4|]
\`\`\`

\`\`\`html
<p id="sum">…</p><script>document.getElementById('sum').textContent = 'Sum: ' + (2 + 3)</script>
\`\`\`
<suggestions>
Book it
</suggestions>`

test('a saved copy draws itself as Jean does, from the render package', async ({ page, browser }) => {
  await start(page)
  await page.evaluate(async (answer) => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }, { declared }, { addFile }] = await Promise.all([
      import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/ui/markdown.js'), import('/core/files.js')])
    // Charts and scores are drawn where a skill of the room declares them (D196).
    declared.value = new Set([...declared.peek(), 'echarts', 'abc'])
    // A picture made, kept in the project's files as the pictures capability keeps one (D251).
    const canvas = new OffscreenCanvas(40, 20)
    const pen = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'))
    pen.fillStyle = 'red'
    pen.fillRect(0, 0, 40, 20)
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer())
    const { uri } = await addFile(app.fs, { projectDir: app.projectDir, name: 'bar.png', mimeType: 'image/png', bytes, pages: ['A red bar'], by: 'jean' })
    const picture = { sessionUpdate: 'tool_call', toolCallId: 'p1', title: 'Picture', kind: 'other', status: 'completed', rawInput: { description: 'A red bar' }, _meta: { picture: { uri, name: 'bar.png', mimeType: 'image/png', size: bytes.length } } }
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    // A request the page closed on before anything came, then the one answered: each its own.
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Plan the week' }), userRecord('What is on Monday?', app.deviceId), userRecord('Plan my week', app.deviceId),
      envelope('jean', /** @type {any} */ (picture), 0), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } }, 1)])
    await refreshConversations()
  }, ANSWER)
  const row = (await openTasks(page)).locator('.history-list li', { hasText: 'Plan the week' })
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Save a copy' }).click()])
  const file = test.info().outputPath(download.suggestedFilename())
  await download.saveAs(file)

  // Opened as anyone would, without the tests' block on service workers, whose own script fails on a file.
  const reading = await browser.newContext({ serviceWorkers: 'allow' })
  const asked = /** @type {string[]} */ ([])
  await reading.route(PACKAGE, async (route) => {
    const path = /** @type {string} */ (PACKAGE.exec(route.request().url())?.[1])
    asked.push(path)
    const body = await readFile(new URL(`../app/${path}`, import.meta.url)).catch(() => null)
    await route.fulfill(body ? { body, headers: { 'content-type': TYPES[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream', 'access-control-allow-origin': '*' } } : { status: 404 })
  })
  const instruments = /** @type {string[]} */ ([])
  await reading.route(SOUNDS, async (route) => {
    const path = /** @type {string} */ (SOUNDS.exec(route.request().url())?.[1])
    instruments.push(path)
    const body = await readFile(new URL(`../app/vendor/sounds/${path}`, import.meta.url)).catch(() => null)
    await route.fulfill(body ? { body, headers: { 'access-control-allow-origin': '*' } } : { status: 404 })
  })
  const saved = await reading.newPage()
  const errors = /** @type {string[]} */ ([])
  saved.on('pageerror', (error) => errors.push(error.message))
  await saved.goto(pathToFileURL(file).href)
  await expect(saved.locator('h1.conversation-title')).toHaveText('Plan the week')
  await expect(saved.locator('main .msg-user')).toHaveText(['What is on Monday?', 'Plan my week'])
  const answer = saved.locator('main .msg-jean .prose')
  await expect(answer.locator('strong')).toHaveText('the plan')
  await expect(answer.locator('app-math math')).toHaveCount(1)
  await expect(answer.locator('app-chart canvas').first()).toBeVisible()
  await expect(answer.locator('app-diagram img')).toBeVisible()
  // A page loads when it comes into view (D289), below the score here: WebKit starts it no sooner.
  await answer.locator('app-page iframe').scrollIntoViewIfNeeded()
  await expect(answer.locator('app-page iframe').contentFrame().locator('#sum')).toHaveText('Sum: 5')
  const score = answer.locator('app-score')
  await score.getByRole('button', { name: 'Play' }).click()
  await expect(score.locator('.score-sheet .is-sounding').first()).toBeAttached()
  expect(await score.evaluate((element) => /** @type {any} */ (element).parts.length)).toBeGreaterThan(0)
  expect(instruments).toEqual(['sounds.json', expect.stringMatching(/^grand-piano\.[0-9a-f]{12}\.sf3$/)])
  await score.getByRole('button', { name: 'Pause' }).click()
  await expect(answer).not.toContainText('Book it')
  const made = saved.locator('main .msg-jean img.made')
  await expect(made).toHaveAttribute('alt', 'A red bar')
  await expect.poll(() => made.evaluate((image) => /** @type {HTMLImageElement} */ (image).naturalWidth)).toBe(40)
  await expect(saved.locator('body > section')).toHaveCount(0)
  expect(asked).toContain('ui/reader-state.js')
  expect(asked).not.toContain('ui/state.js')
  expect(errors).toEqual([])
  await reading.close()

  // Offline, the page's own lines show the words as they were written. (WebKit opens no file offline: the package alone is out of reach.)
  const offline = await browser.newContext({ serviceWorkers: 'allow' })
  await offline.route(PACKAGE, (route) => route.abort('internetdisconnected'))
  const alone = await offline.newPage()
  await alone.goto(pathToFileURL(file).href)
  await expect(alone.locator('body > section p')).toHaveText(['What is on Monday?', 'Plan my week', /^Here is \*\*the plan\*\*[\s\S]*```abc\n[\s\S]*G4\|\]\n```\n\n```html\n[\s\S]*Sum: ' \+ \(2 \+ 3\)<\/script>\n```$/])
  await expect(alone.locator('main')).toHaveCount(0)
  await expect.poll(() => alone.locator('body > section img.made').evaluate((image) => /** @type {HTMLImageElement} */ (image).naturalWidth)).toBe(40)
  await offline.close()
})
