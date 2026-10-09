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
  await expect(pane.locator('h2')).toHaveText('Bakery.html')
  await expect(page).toHaveURL(new RegExp(`#/c/${ID}\\?preview=files/sha256-[0-9a-f]+\\.html$`))
  if (await ephemeral(page)) return
  await page.reload()
  await expect(pane.locator('h2')).toHaveText('Bakery.html')
  await expect(page.frameLocator('.view-frame').locator('h1')).toHaveText('Bakery')
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
