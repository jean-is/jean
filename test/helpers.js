// Shared steps: a fresh Jean in a given language, with the fake brain connected.
import { expect } from '@playwright/test'

export const BRAIN_URL = 'http://127.0.0.1:4181/v1'
export const MAIL_URL = 'http://127.0.0.1:4182'
export const GATEWAY_URL = 'http://127.0.0.1:4183/'
export const SALES = 'region,month,sales\nNorth,Jan,1200\nSouth,Jan,950\nNorth,Feb,1340\nSouth,Feb,1010\nEast,Jan,700\nEast,Feb,815\n'

/** @param {import('@playwright/test').Page} page @param {string} [lang] */
export async function start(page, lang = 'en') {
  await page.goto('./')
  await expect(page.locator('.hero-question')).toBeVisible()
  // The box has the keyboard from the start.
  await expect(page.locator('#prompt')).toBeFocused()
  // The language is picked in Settings, its first choice.
  const settings = await openSettings(page)
  await settings.locator('.settings-panel select').first().selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await closeSettings(page)
}

/** Connects the fake brain through the first brain's dialog (D329): its plans and keys, "On your computer" → Other. @param {import('@playwright/test').Page} page */
export async function connectFakeBrain(page) {
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-first dialog[open]')
  await dialog.locator('.first-doors button').first().click()
  // One way to add a brain is open at a time (D134).
  const local = dialog.locator('.way.is-local')
  await local.locator('summary').click()
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await local.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
}

/** @param {import('@playwright/test').Page} page @param {string} text */
export async function ask(page, text) {
  await page.locator('#prompt').fill(text)
  await page.locator('#prompt').press('Enter')
}

/**
 * The tasks, in view: the drawer open beside the conversation on a wide window, or over it on a
 * narrow one, opened from the header's button when it isn't (D165).
 * @param {import('@playwright/test').Page} page
 */
export async function openTasks(page) {
  const toggle = page.locator('.sidebar-toggle')
  const drawer = page.locator('app-history dialog[open]')
  // The button says whether the drawer is open beside the conversation, before its module has drawn it.
  if ((await toggle.getAttribute('aria-expanded')) !== 'true' && !(await drawer.isVisible())) await toggle.click()
  const tasks = page.locator('app-inbox:has(.profile)').or(drawer)
  await expect(tasks).toBeVisible()
  return tasks
}

/** Puts the drawer open beside the conversation away (D165). @param {import('@playwright/test').Page} page */
export async function closeTasks(page) {
  const toggle = page.locator('.sidebar-toggle[aria-expanded="true"]')
  if (await toggle.count()) await toggle.click()
  await expect(page.locator('app-inbox')).toHaveCount(0)
}

/**
 * Opens the user's menu at the foot of the tasks (D115, D150).
 * @param {import('@playwright/test').Page} page
 */
export async function openProfile(page) {
  await (await openTasks(page)).locator('.profile').click()
  const menu = page.locator('.profile-menu:popover-open')
  await expect(menu).toBeVisible()
  return menu
}

/**
 * Opens Settings from the user's menu, its first item (⌘, beside it), in any language. On one
 * of its sections when named as its menu says (D113).
 * @param {import('@playwright/test').Page} page @param {string} [section]
 */
export async function openSettings(page, section) {
  await (await openProfile(page)).locator('[aria-keyshortcuts$="+,"]').click()
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings).toBeVisible()
  if (section) await settings.locator('.settings-nav button', { hasText: section }).click()
  return settings
}

/**
 * Closes Settings with Escape, its address too: going back over the history entry it opened (D137)
 * lands a moment after the dialog closes, and a reload meanwhile is cut short or opens it again.
 * @param {import('@playwright/test').Page} page
 */
export async function closeSettings(page) {
  await page.keyboard.press('Escape')
  await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/settings/)
}

/** Turns a capability on from the house ("What Jean can do", in Settings): its row opened, then its button. @param {import('@playwright/test').Page} page @param {string} name */
export async function turnOn(page, name) {
  const settings = await openSettings(page, 'Capabilities')
  // A row's name, exactly: "Computer" is not "This computer" (D198), "Search" not "Search by meaning".
  const row = settings.locator('.case > li').filter({ has: page.locator('.item-text > strong').getByText(name, { exact: true }) })
  const toggle = row.locator('button.item')
  // The next to find is open already, and a click would close it.
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
  await row.locator('.item-body .button').click()
  // Lit once its module has loaded, so a message sent next declares its tools; or, for one that
  // leads somewhere at once (Connections), Settings is on its section (D134).
  await expect(page.locator('app-settings .case > li.is-lit').filter({ has: page.locator('.item-text > strong').getByText(name, { exact: true }) })
    .or(page.locator('app-settings .settings-nav [aria-current="page"]', { hasText: name }))).toHaveCount(1)
}

/** Connects a service from the house by its address, in Settings' Connections, and waits until its tools are listed. @param {import('@playwright/test').Page} page @param {string} url */
export async function connect(page, url) {
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  // The services Jean knows come first; an address is behind the + at the panel's top (D191).
  await dialog.getByRole('button', { name: 'Another service, by its address' }).click()
  await expect(dialog.locator('input[name="url"]')).toBeFocused()
  await dialog.locator('input[name="url"]').fill(url)
  await dialog.locator('input[name="name"]').fill('Mail')
  await dialog.locator('#connection-add .button.primary').click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  await expect(dialog.locator('.connection')).toContainText('3 actions')
  await page.keyboard.press('Escape')
}

/** A one-page PDF in Helvetica, one of the standard fonts. @param {string} text */
export function pdf(text) {
  const stream = `BT /F1 24 Tf 20 90 Td (${text}) Tj ET`
  return Buffer.from(`%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj
4 0 obj <</Length ${stream.length}>> stream
${stream}
endstream endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
trailer <</Root 1 0 R>>
%%EOF`)
}

/** How much of a page drawn on a canvas is ink: drawn, not only laid out. @param {import('@playwright/test').Locator} canvas */
export const inkOf = (canvas) => canvas.evaluate((element) => {
  const { width, height } = /** @type {HTMLCanvasElement} */ (element)
  if (!width) return 0
  const { data } = /** @type {CanvasRenderingContext2D} */ (/** @type {HTMLCanvasElement} */ (element).getContext('2d')).getImageData(0, 0, width, height)
  let ink = 0
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] && data[i] < 128) ink++
  return ink
})

/**
 * What the next Copy puts on the clipboard (D196), caught on its way there: each kind it holds,
 * text as it is and anything else by its first four bytes. Call before the click, await after.
 * @param {import('@playwright/test').Page} page
 */
export async function nextCopy(page) {
  await page.evaluate(() => {
    /** @type {any} */ (window).copied = new Promise((resolve) => {
      navigator.clipboard.write = async ([item]) => resolve(Object.fromEntries(await Promise.all(item.types.map(async (type) => {
        const blob = await item.getType(type)
        return [type, type.startsWith('text/') ? await blob.text() : [...new Uint8Array(await blob.slice(0, 4).arrayBuffer())]]
      }))))
    })
  })
  return { read: () => page.evaluate(() => /** @type {any} */ (window).copied) }
}
