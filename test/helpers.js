// Shared steps: a fresh Jean in a given language, with the fake brain connected.
import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'

export const BRAIN_URL = 'http://127.0.0.1:4181/v1'
export const MAIL_URL = 'http://127.0.0.1:4182'
export const GATEWAY_URL = 'http://127.0.0.1:4183/'
export const SHARE_URL = 'http://127.0.0.1:4185/'
export const RELAY_URL = 'http://127.0.0.1:4187/'
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

/** A file of the sounds package on jsDelivr, where a score's instruments come from (D338). */
const SOUNDS = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@jean-is\/sounds@[^/]+\/(.+)$/

/**
 * The sounds package on jsDelivr, served from this repository's copy of it, in `context`: the paths asked for, in order.
 * @param {import('@playwright/test').BrowserContext} context
 */
export async function servedInstruments(context) {
  const asked = /** @type {string[]} */ ([])
  await context.route(SOUNDS, async (route) => {
    const path = /** @type {string} */ (SOUNDS.exec(route.request().url())?.[1])
    asked.push(path)
    const body = await readFile(new URL(`../node_modules/@jean-is/sounds/${path}`, import.meta.url)).catch(() => null)
    await route.fulfill(body ? { body, headers: { 'access-control-allow-origin': '*' } } : { status: 404 })
  })
  return asked
}

/**
 * Serves Jean from another address, an organisation's, by passing its requests on. A reply can come after the page has moved
 * on, which says nothing of Jean, and a request lost for any other reason fails what waits for it.
 * @param {import('@playwright/test').Page} page @param {string} address @param {string} own
 */
export const servedFrom = (page, address, own) => page.route(`${address}**`, (route) =>
  route.fetch({ url: route.request().url().replace(address, own) }).then((response) => route.fulfill({ response })).catch(() => {}))

/**
 * A file's Download from its pane's one button: the button itself, or its row where this browser can also send it to an app (ui/out.js).
 * @param {import('@playwright/test').Locator} pane @param {string} name
 */
export async function downloadFile(pane, name) {
  const alone = pane.getByRole('button', { name: `Download ${name}` }), menu = pane.locator('.pane-head .icon-group > [popovertarget^="out-"]')
  await expect(alone.or(menu)).toBeVisible()
  if (await alone.count()) return alone.click()
  await menu.click()
  await pane.locator('.out-menu').getByRole('button', { name }).click()
}

/** A language picked in Settings' menu, and taken with its button, there once it is another. @param {import('@playwright/test').Locator} settings @param {string} lang */
export async function chooseLanguage(settings, lang) {
  await settings.locator('.settings-panel select').first().selectOption(lang)
  const change = settings.locator('.language-change')
  if (await change.count()) await change.click()
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
  await chooseLanguage(settings, lang)
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
  // Its toast, Brain connected, closed as a person would, so it covers nothing read or pressed next: a dialog opened
  // within its seconds takes it in, its Close beside the dialog's own, and on a small window it sits over the header.
  await page.evaluate(async () => {
    const [{ app }, { t }] = await Promise.all([import('/ui/state.js'), import('/core/i18n.js')])
    if (app.toast.value?.message === t('brain.connected')) app.toast.value = null
  })
  // The step is in the page, where an answer comes next: the pointer leaves, so nothing there is hovered by chance.
  await page.mouse.move(0, 0)
}

/** The name Jean gave a download: WebKit on Linux writes its spaces as underscores. @param {import('@playwright/test').Download} download */
export const nameOf = (download) => download.suggestedFilename().replaceAll('_', ' ').normalize()

/** What the task's answer reached is noted, a second after it (D252): a record like any other, for whatever hears of those or takes one for the person's. @param {import('@playwright/test').Page} page */
export const noted = (page) => expect.poll(() => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  return (await app.fs.read(String(app.current.value?.path)))?.includes('"reached"')
})).toBe(true)

/**
 * A card closed by Escape with motion on: over how many frames it faded, and how much further than the button it opened from
 * it moved meanwhile, its size included, in pixels; a page scrolling under it moves both.
 * @param {import('@playwright/test').Page} page @param {import('@playwright/test').Locator} card @param {import('@playwright/test').Locator} button
 */
export async function fadeOut(page, card, button) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // Watched from before Escape, which would otherwise come first at times.
  const watch = await card.evaluateHandle((shown, from) => ({ fade: (async () => {
    const boxes = () => [shown, from].map((element) => element.getBoundingClientRect())
    const [was, wasAt] = boxes()
    let [frames, off] = [0, 0]
    while (shown.matches(':popover-open') || getComputedStyle(shown).display !== 'none') {
      if (!shown.matches(':popover-open')) {
        const [box, at] = boxes()
        frames += 1
        off = Math.max(off, Math.abs(box.x - was.x) - Math.abs(at.x - wasAt.x), Math.abs(box.y - was.y) - Math.abs(at.y - wasAt.y),
          Math.abs(box.width - was.width), Math.abs(box.height - was.height))
      }
      await new Promise(requestAnimationFrame)
    }
    return { frames, off }
  })() }), await button.elementHandle())
  await page.keyboard.press('Escape')
  const fade = await watch.evaluate(({ fade }) => fade)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  return fade
}

/** @param {import('@playwright/test').Page} page @param {string} text */
export async function ask(page, text) {
  await page.locator('#prompt').fill(text)
  await page.locator('#prompt').press('Enter')
}

/** Holds the brain's answers back until the function this gives is called, for what the person does meanwhile. @param {import('@playwright/test').Page} page */
export async function holdAnswers(page) {
  let go = () => {}
  const held = new Promise((resolve) => { go = () => resolve(null) })
  await page.route('**/v1/chat/completions', async (route) => { await held; await route.fallback() })
  return go
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
 * A picture the fake brain makes in the task, Pictures found first: it is on this computer, so its picture goes through the
 * check, which passes it, watermark and all (pictures.spec.js). Its place in the project. @param {import('@playwright/test').Page} page
 * @param {string} name @param {string} description
 */
export async function paint(page, name, description) {
  await page.route('**/caps/pictures/device-worker.js', (route) => route.fulfill({ contentType: 'text/javascript',
    body: 'self.onmessage = ({ data }) => self.postMessage(data.type === \'watermark\' ? { id: data.id, type: \'done\', bytes: data.bytes } : { id: data.id, type: \'done\', logits: [5, 0, 0, 0], areas: [] })' }))
  await page.evaluate(async () => { await (await import('/ui/caps.js')).unlock('pictures') })
  const before = await page.locator('.msg-jean .prose').count()
  await ask(page, `Call picture with ${JSON.stringify({ name, description, shape: 'tall' })}`)
  await answered(page, before + 1)
  const picture = page.locator('.msg-jean').last().locator('app-picture')
  await expect(picture.locator('img')).toHaveJSProperty('naturalWidth', 96)
  return String(await picture.getAttribute('uri'))
}

/**
 * The tasks, in view: the drawer open beside the conversation on a wide window, or over it on a
 * narrow one, opened from the header's button when it isn't (D165).
 * @param {import('@playwright/test').Page} page
 */
export async function openTasks(page) {
  // Pressed in the moment it is found put away, before its module has drawn it too: the look opens it by itself as
  // a room's first task arrives, and a press found it closed a moment before would put it away again. Once the header
  // is drawn, and again should the page go elsewhere meanwhile.
  await expect(page.locator('.sidebar-toggle')).toBeAttached()
  await expect(() => page.evaluate(async () => {
    const { app, sidebarOpen } = await import('/ui/state.js'), toggle = /** @type {HTMLElement | null} */ (document.querySelector('.sidebar-toggle'))
    if (!toggle) throw new Error('No header')
    if (!sidebarOpen.peek() && app.dialog.peek() !== 'history') toggle.click()
  })).toPass()
  const tasks = page.locator('app-inbox:has(.profile)').or(page.locator('app-history dialog[open]'))
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

/** Another project, made as its dialog makes one, Projects found. @param {import('@playwright/test').Page} page @param {string} name */
export const addProject = (page, name) => page.evaluate(async (named) => {
  const [{ app, refreshProjects }, { createProject }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/core/settings.js'), import('/ui/caps.js')])
  await createProject(app.fs, { name: named, by: app.deviceId })
  await refreshProjects()
  await unlock('projects')
}, name)

/** Into a project from the header's menu, by the name it shows there (the home project's is Jean). @param {import('@playwright/test').Page} page @param {string} name */
export async function enterProject(page, name) {
  await page.locator('app-projects .wordmark').click()
  await page.locator('#project-menu .project', { hasText: name }).click()
  await expect(page.locator('app-projects .wordmark')).toHaveText(name)
}

/**
 * Opens the user's menu at the foot of the tasks (D115).
 * @param {import('@playwright/test').Page} page
 */
export async function openProfile(page) {
  await (await openTasks(page)).locator('.profile-button').click()
  const menu = page.locator('.profile-menu:popover-open')
  await expect(menu).toBeVisible()
  return menu
}

/**
 * Opens the user's menu on the other profiles, behind this one's row (D228).
 * @param {import('@playwright/test').Page} page
 */
export async function openOthers(page) {
  const menu = await openProfile(page)
  await menu.locator('.profile-here').click()
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
 * Opens a page of Settings › Your data from its row: lock, sync, links, organization, backup, space or import.
 * @param {import('@playwright/test').Page} page @param {string} part @param {string} [section] the section's name in the menu, in the page's language
 */
/** Settings › Privacy › Profiles, from Privacy's row (D729). @param {import('@playwright/test').Page} page */
export const openProfiles = (page) => openData(page, 'profiles', 'Privacy')

export async function openData(page, part, section = 'Your data') {
  const settings = await openSettings(page, section)
  await settings.locator(`[data-part="${part}"]`).click()
  return settings
}

/**
 * Opens a page of Settings › Approvals from its row: exceptions, pages, or a kind of action's chip.
 * @param {import('@playwright/test').Page} page @param {string} part @param {string} [section] the section's name in the menu, in the page's language
 */
export async function openApprovals(page, part, section = 'Approvals') {
  const settings = await openSettings(page, section)
  await settings.locator(`[data-page="${part}"]`).first().click()
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

/** Turns a capability on from Settings' Capabilities: its row, then Turn on, or its download, on its page. @param {import('@playwright/test').Page} page @param {string} name */
export async function turnOn(page, name) {
  // Synced folder and Folders begin with a folder to choose: the page's picker, which the specs play, opens at once after the click, or from
  // a toast's button once that click is too long gone by for the browser, as on a busy computer (ui/discovery.js). Either way, it opens.
  const picks = (name === 'Synced folder' || name === 'Folders') && await page.evaluate(async () => {
    const pick = /** @type {any} */ (window).showDirectoryPicker
    if (!pick || await (await import('/ui/host.js')).host) return false
    Object.assign(window, { picked: false, showDirectoryPicker: (/** @type {any[]} */ ...args) => (Object.assign(window, { picked: true }), pick(...args)) })
    return true
  })
  const settings = await openSettings(page, 'Capabilities')
  // A row's name, exactly: "Computer" is not "This computer" (D198), "Search" not "Search by meaning".
  await settings.locator('.case > li').filter({ has: page.locator('.item-text > strong').getByText(name, { exact: true }) }).locator('button.item').click()
  await expect(settings.locator('.case-head h2')).toHaveText(name)
  await settings.locator('.settings-panel > .row .button.primary').click()
  // On once its module has loaded, so a message sent next declares its tools: its page no longer says it is to find; or, for one that
  // leads somewhere at once, Settings is on its section (D134), or Settings closed for what it begins (the browser, a folder).
  await expect(page.locator('app-settings .case-head .lede').filter({ hasNotText: 'Not found yet' })
    .or(page.locator('app-settings .settings-nav [aria-current="page"]', { hasText: name })).or(page.locator('app-settings dialog:not([open])')).first()).toBeAttached()
  const ask = page.locator('.toast').getByRole('button', { name: 'Choose a folder' })
  if (picks) await expect(async () => {
    if (await ask.isVisible()) await ask.click()
    expect(await page.evaluate(() => /** @type {any} */ (window).picked)).toBe(true)
  }).toPass()
}

/** What a capability's page leads to, once it is on: its section, or a page of one. @param {import('@playwright/test').Page} page */
export const openFromCase = (page) => page.locator('app-settings .settings-panel').getByRole('button', { name: 'Open', exact: true }).first().click()

/**
 * Connects a service from the house by its address, in Settings' Connections, and waits until its tools are listed, as
 * many as it has. @param {import('@playwright/test').Page} page @param {string} url @param {number} [actions]
 */
export async function connect(page, url, actions = 3) {
  await turnOn(page, 'Connections')
  const dialog = page.locator('app-settings dialog[open]')
  // With none connected, the section is the services to connect, any other by its address at their end.
  await dialog.getByRole('button', { name: /^Another service, by its address/ }).click()
  // A page opened puts the keyboard on its title a frame later: typing before would lose letters in WebKit.
  await expect(dialog.locator('.data-head h2')).toBeFocused()
  await dialog.locator('input[name="url"]').fill(url)
  await dialog.locator('input[name="name"]').fill('Mail')
  await dialog.locator('#connection-add .button.primary').click()
  await expect(page.locator('.toast')).toContainText('Mail is connected')
  // Connected, its page opens, saying what it can do.
  await expect(dialog.locator('.data-head')).toContainText(`${actions} actions`)
  await page.keyboard.press('Escape')
}

/**
 * Opens a service Jean knows from Settings' Connections, by its tile's name, and connects it from its page: with
 * some connected already, its tile is on Connect a service. @param {import('@playwright/test').Page} page @param {string | RegExp} name
 */
export async function connectTile(page, name) {
  const dialog = page.locator('app-settings dialog[open]')
  await dialog.locator('.settings-nav button', { hasText: 'Connections' }).click()
  const add = dialog.getByRole('button', { name: 'Connect a service' })
  await expect(dialog.locator('.connection-find').or(add)).toBeVisible()
  if (await add.count()) await add.click()
  await dialog.locator('.services .service').filter({ has: page.locator('strong', { hasText: typeof name === 'string' ? new RegExp(`^${name}$`) : name }) }).click()
  await dialog.getByRole('button', { name: /^Connect (?!a service$)/ }).click()
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
