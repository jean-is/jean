// Keyboard shortcuts (D118), as in the Claude apps: ⌘, opens Settings and ⌘N starts a new
// conversation, ready to type (Ctrl outside Apple's systems), whatever the keyboard's alphabet;
// ⌘⇧O does too, and is the one shown, since a browser tab keeps ⌘N for a new window (D236).
// ⌘⇧D switches between light and dark, ⌘⇧E goes to the next theme and ⌘⇧L to the next language
// (D130, D238, D253); ⌘B opens the drawer or puts it away (D234); ⌘/ shows the shortcuts (D257);
// ⌘S saves a copy of the open task and ⌘⌫ deletes it, after asking (D313); Escape stops an answer (D315).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings, turnOn } from './helpers.js'

test('⌘, opens Settings, and ⌘⇧O starts a new conversation from anywhere', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Explain photosynthesis in simple words')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Anything else?')
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings).toBeVisible()
  await expect(settings.locator('[aria-current="page"]')).toHaveText('General')
  await page.keyboard.press('Escape')
  // Closed once its close event has come, a moment after it is hidden.
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.dialog.value)).toBeNull()
  // On a Russian keyboard the same key types "б": where it sits is what counts.
  await page.evaluate(() => {
    const apple = /Mac|iPhone|iPad/.test(navigator.platform)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'б', code: 'Comma', metaKey: apple, ctrlKey: !apple, bubbles: true }))
  })
  await expect(settings).toBeVisible()
  // Even with Settings open: it closes, and the box waits for the first words.
  await page.keyboard.press('ControlOrMeta+Shift+KeyO')
  await expect(settings).toBeHidden()
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page.locator('#prompt')).toBeFocused()
})

test('⌘⇧D switches between light and dark, even mid-sentence', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await start(page)
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await page.locator('#prompt').fill('Hello')
  await page.keyboard.press('ControlOrMeta+Shift+KeyD')
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('#prompt')).toHaveValue('Hello')
  // Back to what the device shows, Jean follows the device again (D85).
  await page.keyboard.press('ControlOrMeta+Shift+KeyD')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(root).toHaveAttribute('data-theme', 'light')
})

test('⌘⇧E goes to the next theme, in the gallery\'s order, and says its name (D238)', async ({ page }) => {
  await start(page)
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-look', 'tilde')
  await page.locator('#prompt').fill('Hello')
  await page.keyboard.press('ControlOrMeta+Shift+KeyE')
  await expect(root).toHaveAttribute('data-look', 'human')
  await expect(page.locator('.toast')).toHaveText('Human')
  await expect(page.locator('#prompt')).toHaveValue('Hello')
  await page.keyboard.press('ControlOrMeta+Shift+KeyE')
  await expect(root).toHaveAttribute('data-look', 'mail')
})

test('⌘⇧L goes to the next language, the browser\'s first, and says its name in its own words (D253)', async ({ page }) => {
  await start(page)
  const root = page.locator('html')
  await page.locator('#prompt').fill('Hello')
  // English is the browser's only one, so the others follow, in the menu's order.
  await page.keyboard.press('ControlOrMeta+Shift+KeyL')
  await expect(root).toHaveAttribute('lang', 'am')
  await expect(page.locator('.toast')).toHaveText('አማርኛ')
  await expect(page.locator('#prompt')).toHaveValue('Hello')
  await page.keyboard.press('ControlOrMeta+Shift+KeyL')
  await expect(root).toHaveAttribute('lang', 'ar')
  await expect(root).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('.toast')).toHaveText('العربية')
})

test('⌘B opens the drawer or puts it away, beside the conversation or over it, and shows it from Settings', async ({ page }) => {
  await start(page)
  const tasks = page.locator('app-inbox')
  await expect(page.locator('.sidebar-toggle')).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+B$/)
  // Human's first screen has it put away while the room has no task (D174, D369); what is typed stays.
  await expect(tasks).toHaveCount(0)
  await page.locator('#prompt').fill('Hello')
  await page.keyboard.press('ControlOrMeta+KeyB')
  await expect(tasks).toBeVisible()
  await expect(page.locator('#prompt')).toHaveValue('Hello')
  await page.keyboard.press('ControlOrMeta+KeyB')
  await expect(tasks).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+KeyB')
  await expect(tasks).toBeVisible()
  // A dialog over the room closes, and the drawer stays.
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings).toBeVisible()
  await page.keyboard.press('ControlOrMeta+KeyB')
  await expect(settings).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/settings/)
  await expect(tasks).toBeVisible()
  // On a narrow window it slides over the conversation, and away again.
  await page.setViewportSize({ width: 600, height: 800 })
  await expect(tasks).toHaveCount(0)
  const drawer = page.locator('app-history dialog[open]')
  await page.keyboard.press('ControlOrMeta+KeyB')
  await expect(drawer).toBeVisible()
  await page.keyboard.press('ControlOrMeta+KeyB')
  await expect(drawer).toHaveCount(0)
})

test('↑ from an empty box brings back what was asked, newest first, and ↓ goes back to an empty box (D187)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const box = page.locator('#prompt')
  const answers = page.locator('.msg-jean .prose')
  for (const request of ['Explain photosynthesis in simple words', 'Shorter, please\nIn two lines']) {
    await ask(page, request)
    await expect(answers.last()).toContainText(request.split('\n')[0])
    await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  }
  // Never while an IME composes: its arrows pick among the words it offers.
  await box.dispatchEvent('keydown', { key: 'ArrowUp', isComposing: true })
  await expect(box).toHaveValue('')
  await box.press('ArrowUp')
  await expect(box).toHaveValue('Shorter, please\nIn two lines')
  // In a request of several lines, ↑ goes up its lines before the one asked before it.
  await box.press('ArrowUp')
  await expect(box).toHaveValue('Shorter, please\nIn two lines')
  await box.press('ArrowUp')
  await expect(box).toHaveValue('Explain photosynthesis in simple words')
  await box.press('ArrowUp')
  await expect(box).toHaveValue('Explain photosynthesis in simple words')
  await box.press('ArrowDown')
  await expect(box).toHaveValue('Shorter, please\nIn two lines')
  await box.press('ArrowDown')
  await expect(box).toHaveValue('')
  // Once changed, the words are the user's, and the arrows move in them.
  await box.press('ArrowUp')
  await box.press('End')
  await box.pressSequentially('!')
  await box.press('ArrowDown')
  await expect(box).toHaveValue('Shorter, please\nIn two lines!')
  await box.fill('Hello')
  await box.press('ArrowUp')
  await expect(box).toHaveValue('Hello')
})

test('Settings lists the shortcuts to read, a capability\'s once it is found (D236)', async ({ page }) => {
  await start(page)
  // The buttons say their keys too.
  await expect(page.getByRole('button', { name: 'Dictate' })).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+Shift\+S$/)
  const settings = await openSettings(page, 'Keyboard shortcuts')
  const row = (/** @type {string} */ name) => settings.locator('.keyboard > div', { hasText: name })
  await expect(row('New task').locator('kbd')).toHaveText(/^(⌘⇧O|Ctrl\+Shift\+O)$/)
  await expect(row('New line').locator('kbd')).toHaveText(/^(⇧↩|Shift\+Enter)$/)
  await expect(row('Light or dark').locator('kbd')).toHaveText(/^(⌘⇧D|Ctrl\+Shift\+D)$/)
  await expect(row('Next theme').locator('kbd')).toHaveText(/^(⌘⇧E|Ctrl\+Shift\+E)$/)
  await expect(row('Next language').locator('kbd')).toHaveText(/^(⌘⇧L|Ctrl\+Shift\+L)$/)
  await expect(row('Save a copy').locator('kbd')).toHaveText(/^(⌘S|Ctrl\+S)$/)
  await expect(row('Delete').locator('kbd')).toHaveText(/^(⌘⌫|Ctrl\+Delete)$/)
  // In groups, the most used first, each under a name the user already knows, the tasks' in their ⋮ menu's words (D313).
  const groups = settings.locator('.settings-panel section')
  await expect(groups.locator('h3')).toHaveText(['Tasks', 'Your message', 'General', 'Appearance'])
  await expect(groups.first().locator('dt')).toHaveText(['New task', 'Save a copy', 'Delete'])
  await expect(groups.nth(2).locator('dt')).toHaveText(['Show or hide the sidebar', 'Settings', 'Keyboard shortcuts', 'Next language', 'Close'])
  await expect(row('Talk hands-free')).toHaveCount(0)
  await expect(row('Search')).toHaveCount(0)
  await closeSettings(page)
  // Turned on, Search opens: ⌘, comes back to Settings over it.
  await turnOn(page, 'Search')
  await page.keyboard.press('ControlOrMeta+Comma')
  await settings.locator('.settings-nav button', { hasText: 'Keyboard shortcuts' }).click()
  await expect(row('Search').locator('kbd')).toHaveText(/^(⌘K|Ctrl\+K)$/)
  await expect(groups.first().locator('dt')).toHaveText(['New task', 'Search', 'Save a copy', 'Delete'])
})

test('⌘/ opens Settings on its keyboard shortcuts, from anywhere, Settings too (D257)', async ({ page }) => {
  await start(page)
  await page.locator('#prompt').fill('Hello')
  await page.keyboard.press('ControlOrMeta+Slash')
  const settings = page.locator('app-settings dialog[open]')
  const here = settings.locator('[aria-current="page"]')
  await expect(here).toHaveText('Keyboard shortcuts')
  await expect(here).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+\/$/)
  await expect(page).toHaveURL(/\/settings\/keyboard/)
  await expect(settings.locator('.keyboard > div', { hasText: 'Keyboard shortcuts' }).locator('kbd')).toHaveText(/^(⌘\/|Ctrl\+\/)$/)
  await settings.locator('.settings-nav button', { hasText: 'Appearance' }).click()
  // On a German keyboard "/" is Shift+7: the character is what counts.
  await page.evaluate(() => {
    const apple = /Mac|iPhone|iPad/.test(navigator.platform)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', code: 'Digit7', shiftKey: true, metaKey: apple, ctrlKey: !apple, bubbles: true }))
  })
  await expect(here).toHaveText('Keyboard shortcuts')
  await closeSettings(page)
  await expect(page.locator('#prompt')).toHaveValue('Hello')
})

test('⌘S saves a copy of the open task, and ⌘⌫ deletes it after asking, from an empty box, as its ⋮ menu shows (D313)', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    for (const [title, later] of /** @type {const} */ ([['Plan the week', 0], ['Book a table', 1000]])) {
      const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId, now: new Date(Date.now() + later) })
      await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title }), userRecord(title, app.deviceId)])
    }
    await refreshConversations()
  })
  const tasks = page.locator('app-inbox')
  const row = (/** @type {string} */ name) => tasks.locator('.history-list li', { hasText: name })
  await row('Plan the week').locator('.history-item').click()
  await expect(page.locator('.msg-user')).toHaveText('Plan the week')
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+KeyS')])
  expect(download.suggestedFilename()).toBe('Plan the week.html')

  // The open task's menu says the keys, the others' don't, since they act on the open one.
  for (const [name, keys] of /** @type {const} */ ([['Plan the week', /^(⌘S|Ctrl\+S)$/], ['Book a table', null]])) {
    await row(name).hover()
    await row(name).getByRole('button', { name: 'More options' }).click()
    const [save, remove] = [row(name).getByRole('button', { name: 'Save a copy' }), row(name).getByRole('button', { name: 'Delete' })]
    if (keys) {
      await expect(save.locator('kbd')).toHaveText(keys)
      await expect(remove.locator('kbd')).toHaveText(/^(⌘⌫|Ctrl\+Delete)$/)
      await expect(remove).toHaveAttribute('aria-keyshortcuts', /^(Meta\+Backspace|Control\+Delete)$/)
    } else await expect(row(name).locator('.task-menu kbd')).toHaveCount(0)
    await page.keyboard.press('Escape')
  }

  // What the user says to each question, in order: no, then yes.
  const answers = [false, true]
  const asked = /** @type {string[]} */ ([])
  page.on('dialog', (dialog) => { asked.push(dialog.message()); return answers.shift() ? dialog.accept() : dialog.dismiss() })
  // With words in the box, the keys are the box's; with Settings over the task, nothing.
  const box = page.locator('#prompt')
  await box.fill('Hello')
  await box.press('ControlOrMeta+Backspace')
  await page.keyboard.press('ControlOrMeta+Comma')
  await expect(page.locator('app-settings dialog[open]')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Backspace')
  await closeSettings(page)
  expect(asked).toEqual([])
  await box.fill('')
  await box.press('ControlOrMeta+Backspace')
  await expect.poll(() => asked).toEqual(['Delete this task? This can’t be undone.'])
  await expect(row('Plan the week')).toHaveCount(1)
  await box.press('ControlOrMeta+Backspace')
  await expect(row('Plan the week')).toHaveCount(0)
  await expect(row('Book a table')).toHaveCount(1)
  await expect(page.locator('.hero-question')).toBeVisible()
})

test('Escape stops the answer being written, as Stop does, once nothing else takes it: Settings, the / menu (D315)', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // The answer waits for the user to turn the browser on.
  await ask(page, 'Show me the bakery site')
  await expect(page.locator('.msg-jean .approval').getByRole('button', { name: 'Turn it on' })).toBeVisible()
  const stop = page.locator('.composer .send.is-stop')
  await expect(stop).toHaveAttribute('aria-keyshortcuts', 'Escape')
  const settings = await openSettings(page, 'Keyboard shortcuts')
  await expect(settings.locator('.keyboard > div', { hasText: 'Stop' }).locator('kbd')).toHaveText('Esc')
  await closeSettings(page)
  await expect(stop).toBeVisible()
  const box = page.locator('#prompt')
  await box.click()
  await box.pressSequentially('/')
  await expect(page.locator('#complete .complete-heading').first()).toBeVisible()
  // With words in the box, its button sends them, which steers the task (D365); Escape still stops it.
  await expect(stop).toHaveCount(0)
  const working = page.locator('.msg-jean.is-streaming')
  await box.press('Escape')
  await expect(page.locator('#complete .complete-heading')).toHaveCount(0)
  await expect(working).toHaveCount(1)
  // Never while an IME composes.
  await box.dispatchEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
  await expect(working).toHaveCount(1)
  await box.press('Escape')
  await expect(working).toHaveCount(0)
  await expect(box).toHaveValue('/')
})
