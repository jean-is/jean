// Looks (D111, D120): Human until one is picked (D174); each one in Settings' gallery, with its thumbnail, dresses the page when
// picked. Mail keeps the conversations in view once there is one (D369), in one sidebar with the name at its top and
// the user at its foot (D115, D150, D165), and is back before the first paint; the user's own CSS starts as an outline,
// commented out, on a page of its own, and shows as it is typed; right to left, the sidebar changes sides. A segmented control's fill
// slides to the choice, in each look's colours. Appearance reads first: light or dark, the text, motion; then every theme at once, each
// with its other mode folded into its corner on Auto; then the accent, from swatches (D523).
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { test, expect } from '@playwright/test'
import { start, openSettings, closeSettings, openTasks, connectFakeBrain, ask } from './helpers.js'
import { LOOKS } from '../app/ui/looks.js'

test.use({ viewport: { width: 1280, height: 800 } })

/** What settings.json holds for the look, once written. @param {import('@playwright/test').Page} page */
const savedLook = (page) => page.evaluate(async () => JSON.parse(await (await import('/ui/state.js')).app.fs.read('settings.json') ?? '{}').look)

/** Another look, as Settings' gallery would pick it. @param {import('@playwright/test').Page} page @param {string} id */
const look = (page, id) => page.evaluate(async (id) => (await import('/ui/state.js')).setLook({ id: /** @type {any} */ (id) }), id)

/** Whether a segmented control's mark lies under its choice and is filled, and the choice's own fill. In the page. @param {Element} group */
function lies(group) {
  const [mark, chosen] = [getComputedStyle(group, '::before'), /** @type {HTMLElement} */ (group.querySelector('label:has(:checked)'))]
  const under = Math.abs(parseFloat(mark.left) - chosen.offsetLeft) + Math.abs(parseFloat(mark.width) - chosen.offsetWidth) < 2
  return { under, filled: mark.backgroundColor !== 'rgba(0, 0, 0, 0)', own: getComputedStyle(/** @type {Element} */ (chosen.lastElementChild)).backgroundColor }
}

test('Mail lists the conversations beside the open one, with the user’s touches, after a reload too', async ({ page }) => {
  await start(page)
  const settings = await openSettings(page, 'Appearance')
  await settings.locator('.look', { hasText: 'Mail' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'mail')
  await expect(page.locator('app-inbox')).toBeVisible()
  await expect(page.locator('app-inbox .profile')).toBeVisible()
  await settings.getByRole('button', { name: 'Your own CSS' }).click()
  await expect(settings.getByRole('heading', { name: 'Your own CSS' })).toBeFocused()
  await expect(settings.locator('.look-css')).toHaveValue(await readFile(new URL('../app/ui/touches.css', import.meta.url), 'utf8'))
  await expect.poll(() => savedLook(page)).toEqual({ id: 'mail' })
  await settings.locator('.look-css').fill('.hero-question { outline: 3px solid rgb(255, 0, 0); }')
  await expect(page.locator('.hero-question')).toHaveCSS('outline-color', 'rgb(255, 0, 0)')
  await expect.poll(() => savedLook(page)).toMatchObject({ id: 'mail', css: expect.stringContaining('outline') })
  // Playwright's WebKit has no lasting storage (like a private window): the reload starts empty.
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) return
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'mail')
  await expect(page.locator('app-inbox')).toBeVisible()
  await expect(page.locator('.hero-question')).toHaveCSS('outline-color', 'rgb(255, 0, 0)')
})

test('right to left, Mail’s sidebar sits on the right, the name at its top', async ({ page }) => {
  await start(page, 'ar')
  await look(page, 'mail')
  await openTasks(page)
  const list = await page.locator('app-inbox').boundingBox()
  const top = await page.locator('.bar').boundingBox()
  expect(list?.x).toBeGreaterThan(640)
  expect(top?.x).toBe(list?.x)
  expect(top?.y).toBeLessThan(list?.y ?? 0)
})

test('a first visit has the window to itself, and Tilde, Human and Mail open the drawer once there is a task, unless the user put it away', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./')
  // The first screen is Tilde's (D373), its drawer put away while the room has no task, its button at the header's start (D165, D369).
  const question = page.locator('.hero-question')
  const toggle = page.locator('.sidebar-toggle')
  const tasks = page.locator('app-inbox')
  await expect(question).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-look', 'tilde')
  await expect(page.locator('html')).not.toHaveAttribute('data-sidebar')
  await expect(tasks).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toHaveAttribute('aria-label', 'Open sidebar')
  const centre = await question.evaluate((element) => { const box = element.getBoundingClientRect(); return box.x + box.width / 2 })
  expect(Math.abs(centre - 640)).toBeLessThan(2)
  // One answer, and the drawer is beside the task, which it lists, and beside a new task after it.
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean')).toHaveCount(1)
  await expect(tasks.locator('.history-item')).toHaveCount(1)
  await expect(toggle).toHaveAttribute('aria-label', 'Close sidebar')
  await tasks.locator('.place', { hasText: 'New task' }).click()
  await expect(question).toBeVisible()
  await expect(tasks).toBeVisible()
  // Mail's too; the room's is the box alone. Nothing was chosen meanwhile.
  await look(page, 'mail')
  await expect(tasks).toBeVisible()
  await look(page, 'room')
  await expect(tasks).toHaveCount(0)
  await look(page, 'human')
  await expect(tasks).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem(`app.sidebar:${sessionStorage.getItem('app.profile') ?? ''}`))).toBeNull()
  // Put away, it stays so in any look.
  await toggle.click()
  await expect(tasks).toHaveCount(0)
  await look(page, 'mail')
  await expect(tasks).toHaveCount(0)
})

test('the drawer opens beside the conversation or is put away, as the user left it', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.hero-question')).toBeVisible()
  const toggle = page.locator('.sidebar-toggle')
  const tasks = page.locator('app-inbox')
  // The room's is the box alone, and Mail's too while there is no task.
  await look(page, 'room')
  await expect(page.locator('html')).not.toHaveAttribute('data-look')
  await expect(tasks).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await look(page, 'mail')
  await expect(tasks).toHaveCount(0)
  await toggle.click()
  await expect(tasks).toBeVisible()
  await toggle.click()
  await expect(tasks).toHaveCount(0)
  await look(page, 'room')
  await expect(tasks).toHaveCount(0)

  // Opened: a new task, the tasks under their heading; Routines found has its row, and Skills its creations, but Skills
  // and Connections none, being only in Settings (D554).
  await toggle.click()
  await expect(tasks.locator('.place', { hasText: 'New task' })).toBeVisible()
  await expect(tasks.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(tasks.locator('.place')).toHaveCount(1)
  await page.evaluate(async () => { const { unlock } = await import('/ui/caps.js'); for (const id of ['skills', 'routines', 'connections']) await unlock(id) })
  await expect(tasks.locator('.place')).toHaveText(['New task', 'Routines', 'Creations'])
  await tasks.locator('.place', { hasText: 'Routines' }).click()
  await expect(page.locator('app-settings .settings-nav [aria-current="page"]')).toHaveText('Routines')
  await closeSettings(page)
  await page.reload()
  await expect(tasks).toBeVisible()

  // New task brings the keyboard to the box; a task's ⋮ menu holds Pin, which shows it under
  // Pinned above the others, Rename, which a double click does too, Mark as unread, which lights it
  // until it is opened, Save a copy, a web page that holds the task's own file and draws it once opened, and Delete,
  // the only one in red (D181, D288, D305).
  await tasks.locator('.place', { hasText: 'New task' }).click()
  await expect(page.locator('#prompt')).toBeFocused()
  await page.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path, header } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    const said = [userRecord('Which day is free? </script>', app.deviceId), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Thursday.\n<suggestions>\nBook it\n</suggestions>' } }, 0)]
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Plan the week' }), ...said.map((record) => ({ ...record, at: header.createdAt }))])
    const later = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId, now: new Date(Date.now() + 1000) })
    await appendRecords(app.fs, later.path, [metaRecord(app.deviceId, { title: 'Book a table' })])
    await refreshConversations()
  })
  /** Picks an action in a task's ⋮ menu. @param {import('@playwright/test').Locator} row @param {string} name */
  const pick = async (row, name) => {
    await row.hover()
    await row.getByRole('button', { name: 'More options' }).click()
    await row.getByRole('button', { name }).click()
  }
  const row = tasks.locator('.history-list li', { hasText: 'Plan the' })
  const titles = tasks.locator('.history-title')
  await expect(titles).toHaveText(['Book a table', 'Plan the week'])
  await pick(row, 'Pin')
  await expect(tasks.locator('.sidebar-heading')).toHaveText(['Pinned', 'Tasks'])
  await expect(titles).toHaveText(['Plan the week', 'Book a table'])
  // A bubble before a task pinned, beside the creations there (D605).
  await expect(row.locator('.history-item > .icon')).toHaveCount(1)
  // Each heading folds what is under it, and unfolds it, kept so on this device: across a reload where Jean's data lasts, else
  // with the drawer put away and opened again (D651).
  const heading = (/** @type {string} */ name) => tasks.getByRole('heading', { name }).getByRole('button')
  await heading('Tasks').click()
  await expect(heading('Tasks')).toHaveAttribute('aria-expanded', 'false')
  await expect(titles).toHaveText(['Plan the week'])
  await heading('Pinned').click()
  await expect(titles).toHaveCount(0)
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) {
    await toggle.click()
    await expect(tasks).toHaveCount(0)
    await toggle.click()
  } else await page.reload()
  await expect(heading('Pinned')).toHaveAttribute('aria-expanded', 'false')
  await expect(heading('Tasks')).toHaveAttribute('aria-expanded', 'false')
  await expect(titles).toHaveCount(0)
  await heading('Pinned').click()
  await heading('Tasks').click()
  await expect(heading('Tasks')).toHaveAttribute('aria-expanded', 'true')
  await expect(titles).toHaveText(['Plan the week', 'Book a table'])
  await pick(row, 'Unpin')
  await expect(tasks.locator('.sidebar-heading')).toHaveText(['Tasks'])
  await expect(row.locator('.history-item > .icon')).toHaveCount(0)
  await expect(titles).toHaveText(['Book a table', 'Plan the week'])

  const box = tasks.getByRole('textbox', { name: 'Rename' })
  await pick(row, 'Rename')
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('Plan the week')
  await box.fill('Plan the month')
  await box.press('Enter')
  await expect(titles).toHaveText(['Book a table', 'Plan the month'])
  await expect(row.locator('.history-item')).toBeFocused()
  await tasks.locator('.history-item', { hasText: 'Book a table' }).dblclick()
  await box.fill('Something else')
  await box.press('Escape')
  await expect(titles).toHaveText(['Book a table', 'Plan the month'])

  const light = row.getByRole('img', { name: 'Unread' })
  await pick(row, 'Mark as unread')
  await expect(light).toBeVisible()
  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  // Red, its words or its icon's lines, as Delete is.
  const red = (/** @type {string} */ name) => row.getByRole('button', { name }).evaluate((button) => [button, ...button.querySelectorAll('path')]
    .some((part) => getComputedStyle(part).color === getComputedStyle(/** @type {Element} */ (button.parentElement?.lastElementChild)).color))
  expect([await red('Pin'), await red('Rename'), await red('Mark as read')]).toEqual([false, false, false])
  await row.getByRole('button', { name: 'Mark as read' }).click()
  await expect(light).toHaveCount(0)
  await pick(row, 'Mark as unread')
  await row.locator('.history-item').click()
  await expect(light).toHaveCount(0)

  const [download] = await Promise.all([page.waitForEvent('download'), pick(row, 'Save a copy')])
  expect(download.suggestedFilename()).toBe('Plan the month.html')
  // Kept by its name: Playwright keeps a download without its extension, which browsers then show as text.
  const file = test.info().outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const saved = await page.context().newPage()
  await saved.goto(pathToFileURL(file).href)
  await expect(saved.locator('h1')).toHaveText('Plan the month')
  await expect(saved.locator('section p')).toHaveText(['Which day is free? </script>', 'Thursday.'])
  await expect(saved.locator('section.you')).toHaveCount(1)
  await saved.close()

  await row.hover()
  await row.getByRole('button', { name: 'More options' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)

  // On a narrow window it slides over the conversation, and its button puts it away.
  await page.setViewportSize({ width: 600, height: 800 })
  await expect(tasks).toHaveCount(0)
  await toggle.click()
  const drawer = page.locator('app-history dialog[open]')
  await expect(drawer.locator('.place', { hasText: 'New task' })).toBeVisible()
  await drawer.getByRole('button', { name: 'Close sidebar' }).click()
  await expect(drawer).toHaveCount(0)
  // Its New task closes it, the keyboard in the box.
  await toggle.click()
  await drawer.locator('.place', { hasText: 'New task' }).click()
  await expect(drawer).toHaveCount(0)
  await expect(page.locator('#prompt')).toBeFocused()
})

test('every theme is in the gallery with its thumbnail, and dresses the page when picked', async ({ page }) => {
  await start(page)
  const settings = await openSettings(page, 'Appearance')
  await expect(settings.locator('.look')).toHaveCount(Object.keys(LOOKS).length)
  for (const id of Object.keys(LOOKS).reverse()) {
    const card = settings.locator('.look', { has: page.locator(`[data-look-preview='${id}']`) })
    expect((await card.locator('.look-preview').first().boundingBox())?.height).toBeGreaterThan(40)
    await card.click()
    if (id === 'room') await expect(page.locator('html')).not.toHaveAttribute('data-look')
    else await expect(page.locator('html')).toHaveAttribute('data-look', id)
    await expect(card.locator('input')).toBeChecked()
  }
  await expect.poll(() => savedLook(page)).toMatchObject({ id: 'tilde' })
})

test('a segmented control’s fill is one mark that slides to the choice, whichever way the page reads, in every look but Classic, whose buttons go in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const [lang, section] of [['ar', 'المظهر'], ['en', 'Appearance']]) {
    await start(page, lang)
    const mode = (await openSettings(page, section)).locator('.segmented[aria-keyshortcuts]')
    for (const id of lang === 'en' ? Object.keys(LOOKS).filter((id) => id !== 'classic') : ['tilde']) {
      await look(page, id)
      await expect.poll(() => mode.evaluate(lies)).toEqual({ under: true, filled: true, own: 'rgba(0, 0, 0, 0)' })
      // At rest, it moves for the next choice.
      await expect.poll(() => mode.evaluate((group) => group.getAnimations({ subtree: true }).length)).toBe(0)
      await mode.evaluate((group) => {
        const seen = /** @type {any} */ (window)
        seen.slid = false
        group.addEventListener('transitionrun', (event) => { seen.slid ||= event.pseudoElement === '::before' })
      })
      await mode.locator('label:not(:has(:checked))').first().click()
      await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).slid)).toBe(true)
      await expect.poll(() => mode.evaluate(lies)).toEqual({ under: true, filled: true, own: 'rgba(0, 0, 0, 0)' })
    }
  }
  await look(page, 'classic')
  await expect.poll(() => page.locator('.segmented[aria-keyshortcuts]').evaluate((group) => getComputedStyle(group, '::before').content)).toBe('none')
})

test('Appearance says what each choice follows, shows each theme by day and by night on Auto, picks an accent from swatches, and undoes it all from its head (D523)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await start(page)
  const settings = await openSettings(page, 'Appearance')
  await expect(settings.locator('.settings-panel h3')).toHaveText(['Comfort', 'Theme', 'Make it yours'])
  const line = (/** @type {string} */ name) => settings.locator('.look-rows > li', { has: page.getByText(name, { exact: true }) }).locator('small')
  await expect(line('Light or dark')).toHaveText('Follows your device: light now')
  await expect(line('Motion')).toHaveText('Follows your device: less now')
  await expect(line('Typeface')).toHaveText('The theme’s own')
  // On Auto each theme shows its night folded into its corner; Light or Dark keeps the one on screen.
  await expect(settings.locator('.look-thumb').first().locator('.look-preview')).toHaveCount(2)
  await expect(settings.locator('.look-thumb .lp-dark')).toHaveCount(Object.keys(LOOKS).length)
  const mode = settings.getByRole('radiogroup', { name: 'Light or dark' })
  await mode.getByRole('radio', { name: 'Dark', exact: true }).check()
  await expect(line('Light or dark')).toHaveCount(0)
  await expect(settings.locator('.look-thumb .look-preview')).toHaveCount(Object.keys(LOOKS).length)
  // Auto again on a device at night: each shows its day in its corner.
  await page.emulateMedia({ colorScheme: 'dark' })
  await mode.getByRole('radio', { name: 'Auto', exact: true }).check()
  await expect(line('Light or dark')).toHaveText('Follows your device: dark now')
  await expect(settings.locator('.look-thumb .lp-light')).toHaveCount(Object.keys(LOOKS).length)
  // Nothing changed, no Undo; a typeface and an accent, and it is at the section's head.
  const undo = settings.getByRole('button', { name: 'Undo my changes' })
  await expect(undo).toHaveCount(0)
  await settings.getByRole('radio', { name: 'Serif', exact: true }).check()
  await expect(line('Typeface')).toHaveText('Serif')
  await settings.getByRole('radio', { name: 'Rose' }).check()
  await expect(line('Accent colour')).toHaveText('Rose')
  await expect.poll(() => savedLook(page)).toEqual({ font: 'serif', accent: 'oklch(0.74 0.17 355)' })
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tint').trim())).toBe('oklch(0.74 0.17 355)')
  await expect(undo).toBeVisible()
  await undo.click()
  await expect(settings.getByRole('heading', { name: 'Appearance' })).toBeFocused()
  await expect(undo).toHaveCount(0)
  await expect(line('Accent colour')).toHaveText('The theme’s own')
  await expect.poll(() => savedLook(page)).toEqual({})
})
