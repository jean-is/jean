// Shared steps: a fresh Jean in a given language, with the fake brain connected.
import { expect } from '@playwright/test'

export const BRAIN_URL = 'http://127.0.0.1:4181/v1'
export const MAIL_URL = 'http://127.0.0.1:4182'
export const GATEWAY_URL = 'http://127.0.0.1:4183/'
export const SHARE_URL = 'http://127.0.0.1:4185/'
export const SALES = 'region,month,sales\nNorth,Jan,1200\nSouth,Jan,950\nNorth,Feb,1340\nSouth,Feb,1010\nEast,Jan,700\nEast,Feb,815\n'

/**
 * Silence: what a page plays through Web Audio (a score) goes to a gain of 0 instead of the
 * speakers, its clock still running. Chromium is also muted by its flag (playwright.config.js);
 * WebKit has none.
 */
function silence() {
  const destination = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination')?.get
  if (!destination) return
  const muted = new WeakMap()
  Object.defineProperty(AudioContext.prototype, 'destination', { configurable: true, get() {
    if (!muted.has(this)) {
      const gain = this.createGain()
      gain.gain.value = 0
      gain.connect(destination.call(this))
      muted.set(this, gain)
    }
    return muted.get(this)
  } })
}

/**
 * Serves Jean with an organisation's policy (docs/enterprise.md), as `<meta name="app-policy">`
 * does, so it is still there when the sign-in comes back.
 * @param {import('@playwright/test').Page} page @param {any} policy
 */
export async function withPolicy(page, policy) {
  await page.route((url) => url.pathname === '/policy.json', (route) => route.fulfill({ json: policy }))
  // Added once the page is parsed, before its modules run. (Rewriting the page itself would make
  // Chromium treat it as a public site, which may not reach the fake service on this computer.)
  await page.addInitScript(() => document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') document.head.append(Object.assign(document.createElement('meta'), { name: 'app-policy', content: 'policy.json' }))
  }, { once: true }))
}

/** @param {import('@playwright/test').Page} page @param {string} [lang] */
export async function start(page, lang = 'en') {
  await page.addInitScript(silence)
  await page.goto('./')
  await expect(page.locator('.hero-question')).toBeVisible()
  // The box has the keyboard from the start.
  await expect(page.locator('#prompt')).toBeFocused()
  // The language is picked in Settings, its first choice, opened by its key so the drawer stays as a first visit has it (D369).
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.locator('app-settings dialog[open]')
  await settings.locator('.settings-panel select').first().selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await closeSettings(page)
}

/** Connects the fake brain through the first brain's step (D329, D366): its plans and keys, "On your computer" → Other. @param {import('@playwright/test').Page} page */
export async function connectFakeBrain(page) {
  await page.locator('.brain-chip').click()
  const dialog = page.locator('app-first .first')
  await dialog.locator('.first-doors button').first().click()
  // One way to add a brain is open at a time (D134).
  const local = dialog.locator('.way.is-local')
  await local.locator('summary').click()
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await local.locator('.button.primary').click()
  await expect(dialog).toBeHidden()
  // The step is in the page, where an answer comes next: the pointer leaves, so nothing there is hovered by chance.
  await page.mouse.move(0, 0)
}

/** @param {import('@playwright/test').Page} page @param {string} text */
export async function ask(page, text) {
  await page.locator('#prompt').fill(text)
  await page.locator('#prompt').press('Enter')
}

/** The task's answers, all written. @param {import('@playwright/test').Page} page @param {number} [count] */
export async function answered(page, count = 1) {
  await expect(page.locator('.msg-jean .prose')).toHaveCount(count)
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await expect(page.locator('.msg-jean .prose').last()).not.toBeEmpty()
}

/**
 * Has the fake brain call a tool by its name with these arguments, as a brain would (fake-brain.js),
 * the call asking first as `approval` says, approved; then gives the answer, which says what it brought.
 * @param {import('@playwright/test').Page} page @param {string} name @param {Record<string, unknown>} args @param {string} approval
 */
export async function callTool(page, name, args, approval) {
  const before = await page.locator('.msg-jean .prose').count()
  await ask(page, `Call ${name} with ${JSON.stringify(args)}`)
  await expect(page.locator('.approval')).toContainText(approval)
  await page.locator('.approval .button.primary').click()
  await answered(page, before + 1)
  return page.locator('.msg-jean .prose').last()
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

/** Deletes the open task from its ⋮ menu, which no key does (D313); the question it asks is the caller's to answer. @param {import('@playwright/test').Page} page */
export async function deleteOpenTask(page) {
  const row = (await openTasks(page)).locator('.history-list li.is-current')
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  await row.getByRole('button', { name: 'Delete' }).click()
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
 * Opens a page of Settings › Your data from its row (D519): lock, sync, links, organization, backup, space or import.
 * @param {import('@playwright/test').Page} page @param {string} part @param {string} [section] the section's name in the menu, in the page's language
 */
export async function openData(page, part, section = 'Your data') {
  const settings = await openSettings(page, section)
  await settings.locator(`[data-part="${part}"]`).click()
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
  // Turn on; once found, Open or a download, before Turn off (D433).
  await row.locator('.item-body .button').first().click()
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

/**
 * Gives a folder to the file chooser, as the system's picker would to `<input webkitdirectory>`.
 * Playwright then waits for the input's `input` event, but in WebKit listens only once the folder is
 * given: when WebKit has read it first, the wait never ends (1 run in 6). The event is told again
 * a moment later, which ends it either way; Jean listens for `change`.
 * @param {import('@playwright/test').FileChooser} chooser @param {string} folder
 */
export async function giveFolder(chooser, folder) {
  await chooser.element().evaluate((input) => input.addEventListener('input', (event) => {
    if (event.isTrusted) for (const wait of [100, 1000, 5000]) setTimeout(() => input.dispatchEvent(new Event('input')), wait)
  }, { once: true }))
  await chooser.setFiles(folder)
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
