// The lock (D371): every file is sealed at rest, and a lock keeps the key behind a password or a
// passkey, with a recovery code; a second tab is handed the key, Lock now locks them all.
import { test, expect } from '@playwright/test'
import { start, turnOn, openSettings, closeSettings, openProfile, openOthers } from './helpers.js'

const PASSWORD = 'a long and happy password'

/** @param {import('@playwright/test').Page} page */
const ephemeral = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)

/** A language chosen, which writes settings.json. @param {import('@playwright/test').Page} page */
const keepLanguage = (page) => page.evaluate(async () => (await import('/ui/state.js')).setLocale('en'))

/** The first bytes of a file of the profile as OPFS keeps it, as text (D228). @param {import('@playwright/test').Page} page @param {string} name */
const onDisk = (page, name) => page.evaluate(async (name) => {
  let dir = await navigator.storage.getDirectory()
  for (const part of String(sessionStorage.getItem('app.profile')).split('/')) dir = await dir.getDirectoryHandle(part)
  return (await (await dir.getFileHandle(name)).getFile()).text()
}, name)

/** The lock's page in Settings › Your data, from its row. @param {import('@playwright/test').Page} page */
async function lockPart(page) {
  const settings = await openSettings(page, 'Your data')
  await settings.locator('[data-part="lock"]').click()
  await expect(settings.getByRole('heading', { name: 'Lock', exact: true })).toBeFocused()
  const part = settings.locator('.lock-part')
  await expect(part).toBeVisible()
  return part
}

/** Types the recovery code's last four characters back, and the lock is on. @param {import('@playwright/test').Locator} part */
async function confirmCode(part) {
  const code = String(await part.locator('.lock-code').textContent())
  await part.getByLabel('Type its last four characters').fill(code.replace(/-/g, '').slice(-4))
  await part.getByRole('button', { name: 'Set a lock' }).click()
  return code
}

test('files are sealed on disk; a password locks them, another tab is handed the key, the recovery code opens them too', async ({ page, context }) => {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await keepLanguage(page)
  const settings = await onDisk(page, 'settings.json')
  expect(settings.startsWith('\x89seal') || settings.charCodeAt(0) === 0xfffd).toBe(true)
  expect(settings).not.toContain('"locale"')

  await turnOn(page, 'Lock')
  await closeSettings(page)
  const part = await lockPart(page)
  await expect(part).toContainText('Everything kept here is encrypted on this device.')
  await part.getByRole('button', { name: 'Use a password' }).click()
  await part.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await part.getByLabel('The same password again').fill('another password, typed')
  await part.getByRole('button', { name: 'Next' }).click()
  await expect(part.locator('.lock-said')).toHaveText('The two passwords differ.')
  await part.getByLabel('The same password again').fill(PASSWORD)
  await part.getByRole('button', { name: 'Next' }).click()
  const code = await confirmCode(part)
  expect(code).toMatch(/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/)
  await expect(part).toContainText('Locked with your password.')
  // Back on Your data, its row says how it opens, and that it is on.
  await page.locator('app-settings .back').click()
  const row = page.locator('app-settings [data-part="lock"]')
  await expect(row).toBeFocused()
  await expect(row).toContainText('Opens with your password')
  await expect(row.locator('.data-state')).toHaveText('On')
  const vault = JSON.parse(await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('.secrets/vault.json')))
  expect(vault.slots.map((/** @type {{ kind: string }} */ slot) => slot.kind)).toEqual(['password', 'recovery'])
  await closeSettings(page)

  // Opened again, nothing shows before the lock opens.
  await page.reload()
  const lock = page.locator('main.lock')
  await expect(lock).toContainText('Locked.')
  await expect(page.locator('app-shell')).toHaveCount(0)
  await lock.getByLabel('Password', { exact: true }).fill('not the password at all')
  await lock.getByRole('button', { name: 'Unlock' }).click()
  await expect(lock.locator('.lock-said')).toHaveText('That doesn’t open it.')
  // What was typed is selected, and typing again clears the reason, in a line kept for it: nothing moves.
  const typed = lock.getByLabel('Password', { exact: true })
  expect(await typed.evaluate((box) => /** @type {HTMLInputElement} */ (box).selectionEnd - (/** @type {HTMLInputElement} */ (box).selectionStart ?? 0))).toBe('not the password at all'.length)
  const place = await typed.boundingBox()
  await page.keyboard.type('a')
  await expect(lock.locator('.lock-said')).toBeEmpty()
  expect(await typed.boundingBox()).toEqual(place)
  await lock.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await lock.getByRole('button', { name: 'Unlock' }).click()
  await expect(lock).toHaveCount(0)
  await expect(page.locator('.hero-question')).toBeVisible()

  // Another tab opens at once, the first handing it the key.
  const other = await context.newPage()
  await other.goto('./')
  await expect(other.locator('.hero-question')).toBeVisible()
  await expect(other.locator('main.lock')).toHaveCount(0)

  // Lock now, from the person's menu, locks both.
  await (await openProfile(page)).getByRole('button', { name: 'Lock now' }).click()
  await expect(page.locator('main.lock')).toBeVisible()
  await expect(other.locator('main.lock')).toBeVisible()

  // The recovery code opens it, whatever its case and dashes, from Can't open it?.
  await page.locator('.lock-cant summary').click()
  await expect(page.getByLabel('Recovery code')).toBeFocused()
  await page.getByLabel('Recovery code').fill(code.toLowerCase().replace(/-/g, ' '))
  await page.getByLabel('Recovery code').press('Enter')
  await expect(page.locator('.hero-question')).toBeVisible()

  // Turned off, after the lock is asked for, this device's key opens it again.
  const again = await lockPart(page)
  await again.getByRole('button', { name: 'Turn off the lock' }).click()
  await again.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await again.getByRole('button', { name: 'Unlock' }).click()
  await expect(again).toContainText('Everything kept here is encrypted on this device.')
  await closeSettings(page)
  await page.reload()
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page.locator('main.lock')).toHaveCount(0)
})

/** A password lock on this profile, and its folder. @param {import('@playwright/test').Page} page */
async function locked(page) {
  await turnOn(page, 'Lock')
  await closeSettings(page)
  const part = await lockPart(page)
  await part.getByRole('button', { name: 'Use a password' }).click()
  await part.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await part.getByLabel('The same password again').fill(PASSWORD)
  await part.getByRole('button', { name: 'Next' }).click()
  await confirmCode(part)
  await closeSettings(page)
  return String(await page.evaluate(() => sessionStorage.getItem('app.profile')))
}

test('a password can be any length, only never empty, and opens it again (D371)', async ({ page }) => {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await turnOn(page, 'Lock')
  await closeSettings(page)
  const part = await lockPart(page)
  await part.getByRole('button', { name: 'Use a password' }).click()
  await expect(part).toContainText('A passkey is stronger.')
  await expect(part).not.toContainText('12')
  // Empty, it goes no further.
  await part.getByRole('button', { name: 'Next' }).click()
  await expect(part.getByLabel('The same password again')).toBeVisible()
  await expect(part.locator('.lock-code')).toHaveCount(0)
  await part.getByLabel('Password', { exact: true }).fill('tea')
  await part.getByLabel('The same password again').fill('tea')
  await part.getByRole('button', { name: 'Next' }).click()
  await confirmCode(part)
  await closeSettings(page)
  await page.reload()
  const lock = page.locator('main.lock')
  await lock.getByLabel('Password', { exact: true }).fill('tea')
  await lock.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.locator('.hero-question')).toBeVisible()
})

/** A profile's folders here. @param {import('@playwright/test').Page} page */
const folders = (page) => page.evaluate(async () => {
  const names = []
  for await (const [name] of (await (await navigator.storage.getDirectory()).getDirectoryHandle('profiles')).entries()) names.push(`profiles/${name}`)
  return names
})

test('a way in lost deletes nothing: the lock screen adds a profile beside it, it still opens, and only another profile removes it (D371)', async ({ page }) => {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('memory.md', '- likes tea\n'))
  const first = await locked(page)
  await page.reload()
  const lock = page.locator('main.lock')
  await lock.locator('.lock-cant summary').click()
  await expect(lock.locator('.lock-cant')).toContainText('nobody can open what is kept here. It stays here')
  await expect(lock.getByRole('button', { name: 'Start afresh' })).toHaveCount(0)
  await lock.getByRole('button', { name: 'Add a profile' }).click()

  // A first run, in a folder of its own, in another colour, which this device's key opens.
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(lock).toHaveCount(0)
  const second = String(await page.evaluate(() => sessionStorage.getItem('app.profile')))
  expect(second).not.toBe(first)
  expect((await folders(page)).sort()).toEqual([first, second].sort())
  const vaults = await page.evaluate(async (first) => {
    const { app } = await import('/ui/state.js')
    return [await app.fs.read('.secrets/vault.json'), await app.whole.read(`${first}/.secrets/vault.json`), await app.fs.read('memory.md')]
  }, first)
  const [mine, theirs] = vaults.slice(0, 2).map((text) => JSON.parse(String(text)))
  expect(mine.slots.map((/** @type {{ kind: string }} */ slot) => slot.kind)).toEqual(['device'])
  expect(mine.colour).toBeTruthy()
  expect(mine.colour).not.toBe(theirs.colour)
  expect(theirs.slots.map((/** @type {{ kind: string }} */ slot) => slot.kind)).toEqual(['password', 'recovery'])
  expect(vaults[2]).toBeNull()

  // The locked one opens as it was, the day its password turns up.
  const row = (await openSettings(page, 'Profiles')).locator('.profiles li', { hasText: 'Locked' })
  await row.getByRole('button', { name: 'Open' }).click()
  await lock.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await lock.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.locator('.hero-question')).toBeVisible()
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('memory.md'))).toBe('- likes tea\n')

  // Removed from the other, Settings as this tab left it there, in words that say a way in won't bring it back; asked first, it stays.
  await (await openOthers(page)).locator('.profile-switch').click()
  await expect.poll(() => page.evaluate(() => (document.documentElement.classList.contains('is-ready') ? sessionStorage.getItem('app.profile') : null)).catch(() => null)).toBe(second)
  const asked = /** @type {string[]} */ ([])
  page.once('dialog', (dialog) => { asked.push(dialog.message()); dialog.dismiss() })
  await row.getByRole('button', { name: 'Remove' }).click()
  await expect.poll(() => asked).toEqual([expect.stringContaining('no password, passkey or recovery code will bring it back')])
  expect((await folders(page)).sort()).toEqual([first, second].sort())
  page.once('dialog', (dialog) => dialog.accept())
  await row.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.toast')).toContainText('is removed')
  expect(await folders(page)).toEqual([second])
})

test('what nothing can open starts afresh, saying which, and a key that can’t be read is no such thing: the files wait for the next visit (D371)', async ({ page }) => {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('memory.md', '- likes tea\n'))

  // IndexedDB fails as this device's key is read, here for the storage worker: for this visit, nothing is kept, and nothing is offered.
  await page.route('**/ui/seal.js', async (route) => {
    const body = await (await route.fetch()).text()
    expect(body).toContain("indexedDB.open('app-keys', 1)")
    await route.fulfill({ contentType: 'text/javascript', body: body.replace("indexedDB.open('app-keys', 1)", "(() => { const failing = { error: new DOMException('lost') }; queueMicrotask(() => failing.onerror()); return failing })()") })
  })
  await page.reload()
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page.locator('main.lock')).toHaveCount(0)
  expect(await ephemeral(page)).toBe(true)
  await page.unroute('**/ui/seal.js')
  await page.reload()
  await expect(page.locator('.hero-question')).toBeVisible()
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.fs.read('memory.md'))).toBe('- likes tea\n')

  // This device's key really gone, nothing opens it.
  const first = await page.evaluate(() => sessionStorage.getItem('app.profile'))
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('app-keys', 1)
    request.onerror = reject
    request.onsuccess = () => { const clearing = request.result.transaction('keys', 'readwrite').objectStore('keys').clear(); clearing.onsuccess = resolve; clearing.onerror = reject }
  }))
  await page.reload()
  const lock = page.locator('main.lock')
  await expect(lock).toContainText('What was kept here can’t be opened.')
  await expect(lock.locator('.lock-cant')).toContainText('Nothing on this device opens it any more. Starting afresh deletes it')
  await expect(lock.getByRole('button', { name: 'Add a profile' })).toHaveCount(0)
  await expect(lock.locator('input')).toHaveCount(0)
  const asked = /** @type {string[]} */ ([])
  page.once('dialog', (dialog) => { asked.push(dialog.message()); dialog.accept() })
  await lock.getByRole('button', { name: 'Start afresh' }).click()
  await expect(page.locator('.hero-question')).toBeVisible()
  expect(asked).toEqual([expect.stringMatching(/^Delete the profile “.+” and everything kept in it, for good\?$/)])
  expect(await folders(page)).not.toContain(first)
})

test.describe('the lock screen, reached', () => {
  // The hold is a view transition's, which plays as it does for most people.
  test.use({ reducedMotion: 'no-preference' })

  test('nothing holds it: from another profile, from Lock now and as a new version comes in, its field can be used at once', async ({ page }) => {
    await start(page)
    test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
    await turnOn(page, 'Lock')
    await closeSettings(page)
    const part = await lockPart(page)
    await part.getByRole('button', { name: 'Use a password' }).click()
    await part.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await part.getByLabel('The same password again').fill(PASSWORD)
    await part.getByRole('button', { name: 'Next' }).click()
    await confirmCode(part)
    await closeSettings(page)
    await (await openProfile(page)).getByRole('button', { name: 'Add a profile' }).click()
    const dialog = page.locator('.profile-dialog[open]')
    await dialog.getByLabel('This profile’s name').fill('Ana')
    await dialog.getByLabel('The new profile’s name').fill('Work')
    await dialog.getByRole('button', { name: 'Add it' }).click()
    await page.waitForFunction(() => sessionStorage.getItem('app.profile')?.endsWith('-work') && document.documentElement.classList.contains('is-ready'))

    const field = page.locator('main.lock .lock-box input').first()
    // What the pointer would reach there, well before a hold's 4 seconds run out.
    const reachable = () => expect.poll(() => page.evaluate(() => {
      const input = document.querySelector('main.lock input')
      if (!input) return false
      const { x, y } = input.getBoundingClientRect()
      return document.elementFromPoint(x + 5, y + 5) === input
    }).catch(() => false), { timeout: 2000, intervals: [25] }).toBe(true)
    const open = async () => {
      await field.first().fill(PASSWORD)
      await field.first().press('Enter')
      await expect(page.locator('main.lock')).toHaveCount(0)
      await expect(page.locator('#prompt')).toBeVisible()
    }

    await (await openOthers(page)).locator('.profile-switch', { hasText: 'Ana' }).click()
    await reachable()
    await expect(field).toBeFocused()
    // Who this is, in the page's title; the others as badges at its foot, a lock on those that will ask.
    await expect(page).toHaveTitle(/^Ana · /)
    await expect(page.locator('.lock-other', { hasText: 'Work' }).locator('.avatar')).toHaveText('W')
    await expect(page.locator('.lock-other', { hasText: 'Work' }).locator('.icon')).toHaveCount(0)
    await open()
    await expect(page).not.toHaveTitle(/^Ana · /)

    // Lock now sits under this profile, above the rest of the menu, and Work's row, behind it, shows no lock.
    const menu = await openOthers(page)
    await expect(menu.locator('.profile-switch', { hasText: 'Work' }).locator('.icon')).toHaveCount(0)
    await menu.locator('.back').click()
    expect(await menu.evaluate((list) => [...list.children].map((row) => (row.tagName === 'HR' ? 'hr' : row.textContent?.trim())).slice(0, 3))).toEqual(['AAna', 'Lock now', 'hr'])
    await menu.getByRole('button', { name: 'Lock now' }).click()
    await reachable()
    await expect(field).toBeFocused()
    await open()

    await page.evaluate(() => {
      sessionStorage.setItem('app.update', '{}')
      location.replace(`${location.pathname}?${Date.now().toString(36)}${location.hash}`)
    }).catch(() => {})
    await reachable()
    await expect(field).toBeFocused()
  })
})

test('a save cut short leaves a file as it was: its tmp copy if the file was emptied, none if it was the first', async ({ page }) => {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await keepLanguage(page)
  /** What a page leaving mid-save leaves of settings.json, set from a page of the site without Jean, so no worker holds it. @param {boolean} first */
  const cut = async (first) => {
    await page.goto('./no-such-page')
    await page.evaluate(async (first) => {
      let dir = await navigator.storage.getDirectory()
      for (const part of String(sessionStorage.getItem('app.profile')).split('/')) dir = await dir.getDirectoryHandle(part)
      const file = await dir.getFileHandle('settings.json')
      const tmp = await (await dir.getFileHandle('settings.json.tmp', { create: true })).createWritable()
      await tmp.write(first ? new Uint8Array() : await (await file.getFile()).arrayBuffer())
      await tmp.close()
      if (first) await dir.removeEntry('settings.json')
      else await (await file.createWritable()).close()
    }, first)
    await page.goto('./')
  }
  const locale = () => page.evaluate(async () => document.documentElement.classList.contains('is-ready') && (await import('/ui/state.js')).app.settings.value.locale)
  // Emptied between truncating and writing: the tmp copy, written whole before, holds it.
  await cut(false)
  await expect.poll(locale).toBe('en')
  // The first save cut short, its tmp copy empty: there is no settings.json yet, and Jean opens as new.
  await cut(true)
  await expect.poll(locale).toBe(null)
  await expect(page.locator('.hero-question')).toBeVisible()
})

test.describe('a passkey', () => {
  // WebAuthn needs a name, not 127.0.0.1, and a virtual authenticator, which only Chromium's protocol gives.
  test.use({ baseURL: 'http://localhost:4180/' })

  test('locks with a passkey whose PRF opens it again', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'a virtual authenticator is Chromium’s')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } })
    await start(page)
    await turnOn(page, 'Lock')
    await closeSettings(page)
    const part = await lockPart(page)
    await part.getByRole('button', { name: 'Use a passkey' }).click()
    await confirmCode(part)
    await expect(part).toContainText('Locked with your passkey.')
    await closeSettings(page)
    // It asks by itself on arrival, and the authenticator here answers.
    await page.reload()
    await expect(page.locator('.hero-question')).toBeVisible()
    await expect(page.locator('main.lock')).toHaveCount(0)
    // But not just after Lock now, which would undo it: it waits on its button, focused.
    await (await openProfile(page)).getByRole('button', { name: 'Lock now' }).click()
    const unlock = page.locator('main.lock').getByRole('button', { name: 'Unlock' })
    await expect(unlock).toBeFocused()
    await page.waitForTimeout(300)
    await expect(unlock).toBeVisible()
    await unlock.click()
    await expect(page.locator('.hero-question')).toBeVisible()
  })
})
