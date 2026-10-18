// The lock (D371): every file is sealed at rest, and a lock keeps the key behind a password or a
// passkey, with a recovery code; a second tab is handed the key, Lock now locks them all.
import { test, expect } from '@playwright/test'
import { start, turnOn, openSettings, closeSettings, openProfile } from './helpers.js'

const PASSWORD = 'a long and happy password'

/** @param {import('@playwright/test').Page} page */
const ephemeral = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)

/** The first bytes of a file of the profile as OPFS keeps it, as text (D228). @param {import('@playwright/test').Page} page @param {string} name */
const onDisk = (page, name) => page.evaluate(async (name) => {
  let dir = await navigator.storage.getDirectory()
  for (const part of String(sessionStorage.getItem('app.profile')).split('/')) dir = await dir.getDirectoryHandle(part)
  return (await (await dir.getFileHandle(name)).getFile()).text()
}, name)

/** The lock's part of Settings › Your data. @param {import('@playwright/test').Page} page */
async function lockPart(page) {
  const part = (await openSettings(page, 'Your data')).locator('.lock-part')
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

  // The recovery code opens it, whatever its case and dashes.
  await page.getByRole('button', { name: 'Use the recovery code' }).click()
  await page.getByLabel('Recovery code').fill(code.toLowerCase().replace(/-/g, ' '))
  await page.getByRole('button', { name: 'Unlock' }).click()
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
    await page.reload()
    await page.locator('main.lock').getByRole('button', { name: 'Unlock' }).click()
    await expect(page.locator('.hero-question')).toBeVisible()
  })
})
