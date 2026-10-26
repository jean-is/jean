// The windows beside the conversation are in its address, after its place (D220): the preview, the
// browser and the page it opened, the terminal and Flows, in the order they opened. Back to another
// task shows them as they were there, Settings closing leaves them, and a reload shows them again,
// the keys staying in the box.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openTasks, openSettings, closeSettings, BRAIN_URL } from './helpers.js'

const SITE = BRAIN_URL.replace(/\/v1$/, '/site')
const ID = '[0-9A-HJKMNP-TV-Z]{26}'

/** Whether Jean's data is gone after a reload, as in Playwright's WebKit (a private window's). @param {import('@playwright/test').Page} page */
const ephemeral = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)

test('a file Jean made stays in the preview after a reload', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Make a web page for the bakery')
  await page.locator('.msg-jean').last().getByRole('button', { name: 'Open Bakery.html' }).click()
  const pane = page.locator('app-preview .preview')
  await expect(pane.locator('h2')).toHaveText('Bakery')
  await expect(page).toHaveURL(new RegExp(`#/c/${ID}\\?preview=files/sha256-[0-9a-f]+\\.html$`))
  if (await ephemeral(page)) return
  await page.reload()
  await expect(pane.locator('h2')).toHaveText('Bakery')
  await expect(page.frameLocator('.view-frame').locator('h1')).toHaveText('Bakery')
  await expect(page.locator('#prompt')).toBeFocused()
})

test('each file shows where it was scrolled to in this tab, and an address naming Creations and a document shows them from the room\'s first frame (D582)', async ({ page }) => {
  await start(page)
  const paths = await page.evaluate(async () => {
    const [{ app, refreshConversations }, { ulid }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/core/ulid.js'), import('/ui/caps.js')])
    await unlock('documents')
    const at = new Date().toISOString()
    const paths = ['Long', 'Longer'].map((name) => `documents/${ulid()}-${name.toLowerCase()}.md`)
    for (const [i, path] of paths.entries()) {
      const name = i ? 'Longer' : 'Long'
      await app.fs.write(`${app.projectDir}/${path}`, `---\nformat: 1\nname: ${name}\nauthor: jean\ncreated: ${at}\nchanged: ${at}\n---\n# ${name}\n\n${Array.from({ length: 80 }, (_, n) => `Paragraph ${n + 1}.`).join('\n\n')}\n`)
    }
    await refreshConversations()
    return paths
  })
  const view = page.locator('app-preview .view')
  const title = page.locator('#doc h1')
  const top = () => view.evaluate((box) => box.scrollTop)
  /** Opens one beside the task, as a card or a link does. @param {number} i */
  const open = async (i) => {
    await page.evaluate(([uri, name]) => import('/ui/preview.js').then((module) => module.preview({ uri, name, title: name.replace(/\.md$/, ''), mimeType: 'text/markdown' })), [paths[i], i ? 'Longer.md' : 'Long.md'])
    await expect(title).toHaveText(i ? 'Longer' : 'Long')
  }
  /** Scrolled, and kept once the browser says so. @param {number} to */
  const scroll = async (to) => {
    await view.evaluate((box, y) => { box.scrollTop = y }, to)
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('app.scrolled') ?? '')).toContain(`,${to}]`)
  }
  await open(0)
  await scroll(900)
  // Another takes its place at its own top, and keeps its own place; the first comes back where it was, the file unchanged.
  await open(1)
  expect(await top()).toBe(0)
  await scroll(400)
  await open(0)
  expect(await top()).toBe(900)
  await open(1)
  expect(await top()).toBe(400)
  expect(await page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return app.fs.read(`${app.projectDir}/${path}`) }, paths[0])).not.toContain('scroll')

  if (await ephemeral(page)) return
  // Opened again on Creations' page with the first beside it: the room's first frame has the page, never the welcome, and the dock
  // with the document, where it was.
  await page.addInitScript(() => {
    const seen = /** @type {any} */ (globalThis).seen = /** @type {unknown[]} */ ([])
    const look = () => {
      const root = document.documentElement
      if (root.classList.contains('is-ready')) seen.push({ welcome: Boolean(document.querySelector('.welcome')), cards: document.querySelectorAll('app-creations .creation').length, dock: root.dataset.dock,
        title: document.querySelector('#doc h1')?.textContent, top: document.querySelector('app-preview .view')?.scrollTop })
      if (seen.length < 20) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
    new PerformanceObserver((list) => { for (const shift of list.getEntries()) seen.push({ shift: /** @type {any} */ (shift).value }) }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto('about:blank')
  await page.goto(`./#/?creations&preview=${paths[0]}`)
  await expect(title).toHaveText('Long')
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (globalThis).seen.length)).toBeGreaterThanOrEqual(20)
  const frames = await page.evaluate(() => /** @type {any} */ (globalThis).seen)
  expect(frames[0]).toEqual({ welcome: false, cards: 2, dock: 'beside', title: 'Long', top: 900 })
  expect(frames.some((/** @type {any} */ frame) => frame.welcome)).toBe(false)
  // Shifts once the display face comes in, words moving by a few pixels, but nothing like the welcome giving way and the page squeezed by the dock (0.5).
  expect(frames.reduce((/** @type {number} */ sum, /** @type {any} */ frame) => sum + (frame.shift ?? 0), 0)).toBeLessThan(0.01)
  await expect(page).toHaveURL(new RegExp(`#/\\?creations&preview=${paths[0]}$`))
  await expect(page.locator('#prompt')).toBeFocused()
})

test('the windows beside a task are in its address: back to it, Settings closing, and a reload', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => {
    const { unlock } = await import('/ui/caps.js')
    await Promise.all(['browser', 'computer', 'flows'].map(unlock))
  })
  // Jean draws a flow, which opens beside the task; then the terminal, then the browser, on a page.
  await ask(page, 'Make a flow that totals the invoices per client')
  const flows = page.locator('app-flows aside.flows')
  await expect(flows.locator('.flow-step')).toHaveCount(3)
  await expect(page).toHaveURL(new RegExp(`#/c/${ID}\\?flow=${ID}$`))
  const terminal = page.locator('app-terminal .terminal')
  await page.keyboard.press('ControlOrMeta+KeyJ')
  await expect(terminal).toBeVisible()
  const browser = page.locator('app-browser .browser')
  await page.locator('.views .browser-toggle').click()
  await expect(page).toHaveURL(/\?flow=[^&]+&terminal&browser$/)
  const field = browser.locator('.browser-bar input')
  await field.fill(`${SITE}/bakery.html`)
  await field.press('Enter')
  const site = page.frameLocator('.browser-host').frameLocator('iframe')
  await expect(site.locator('h1')).toHaveText('The bakery')
  const task = new RegExp(`#/c/${ID}\\?flow=${ID}&terminal&browser=${SITE}/bakery\\.html$`)
  await expect(page).toHaveURL(task)

  // A new task keeps the windows that show there; the terminal closed, the address says so.
  await (await openTasks(page)).getByRole('button', { name: 'New task' }).click()
  await expect(flows).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`#/\\?terminal&browser=${SITE}/bakery\\.html$`))
  await terminal.getByRole('button', { name: 'Close' }).click()
  await expect(terminal).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`#/\\?browser=${SITE}/bakery\\.html$`))

  // Back to the task: its windows as they were there, in their order, the keys where they were.
  await page.goBack()
  await expect(page).toHaveURL(task)
  await expect(terminal).toBeVisible()
  await expect(flows.locator('.flow-step')).toHaveCount(3)
  const panes = page.locator('#dock > [id^="app-"]:not([hidden])')
  await expect(panes).toHaveCount(3)
  expect(await panes.evaluateAll((all) => all.sort((a, b) => Number(a.style.order) - Number(b.style.order)).map((pane) => pane.localName)))
    .toEqual(['app-flows', 'app-terminal', 'app-browser'])
  await expect(terminal.locator('textarea')).not.toBeFocused()
  // Settings opens over them and closes back to them.
  await openSettings(page)
  await closeSettings(page)
  await expect(page).toHaveURL(task)
  await expect(terminal).toBeVisible()

  if (await ephemeral(page)) return
  await page.reload()
  await expect(flows.locator('.flow-step')).toHaveCount(3)
  await expect(terminal).toBeVisible()
  await expect(field).toHaveValue(`${SITE}/bakery.html`)
  await expect(site.locator('h1')).toHaveText('The bakery')
  await expect(page).toHaveURL(task)
  await expect(page.locator('#prompt')).toBeFocused()
})
