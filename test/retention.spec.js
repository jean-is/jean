// Retention (D412, ee/): with policy's `retention`, what leaves a task, an answer tried again or the task deleted,
// is kept first, out of sight, its certificate with it, and Settings › Your data says for how long; on localhost no
// key is needed, a profile can't be removed, and served from elsewhere, a policy asking for it without one stops Jean
// with a message for IT.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, withPolicy, openSettings, openProfile, deleteOpenTask, openData } from './helpers.js'

/** What .kept/ holds, each copy line by line, read as Jean reads its files. @param {import('@playwright/test').Page} page */
const kept = (page) => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  const { walk } = await import('/core/fs.js')
  return Promise.all((await walk(app.fs, '.kept')).map(async (path) => String(await app.fs.read(path)).trim().split('\n').map((line) => JSON.parse(line))))
})

test('an answer tried again, then its task deleted, is kept first with its certificate, and Settings says for how long', async ({ page }) => {
  await withPolicy(page, { retention: 'P6M' })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  // Its certificate, which saving it keeps in the task.
  await page.locator('.msg-jean .msg-actions').last().getByRole('button', { name: 'About this answer' }).click()
  const card = page.locator('.receipt')
  await card.locator('.receipt-certify > summary').click()
  await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Save the certificate' }).click()])
  await page.keyboard.press('Escape')
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Try again' }).last().click()
  await expect.poll(async () => (await kept(page)).length).toBe(1)
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  await deleteOpenTask(page)
  await expect(page.locator('.hero-question')).toBeVisible()
  const [lines] = await kept(page)
  expect(lines[0]).toMatchObject({ format: 1, kind: 'conversation' })
  expect(lines.filter((line) => line.meta?.removed).map((line) => line.meta.removed.all)).toEqual([false, true])
  expect(lines.some((line) => line.meta?.certificate?.jws)).toBe(true)
  expect(lines.some((line) => line.update?.content?.text === 'Hello')).toBe(true)
  const settings = await openData(page, 'organization')
  await expect(settings).toContainText('Your organization keeps each task, with its certificates, for at least 6 months.')
})

test('a profile stays, since its tasks couldn’t be kept once it went', async ({ page }) => {
  await withPolicy(page, { retention: 'P6M' })
  await start(page)
  test.skip(await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value), 'nothing is kept here: a private window, Playwright’s WebKit')
  const here = () => page.evaluate(() => (document.documentElement.classList.contains('is-ready') ? sessionStorage.getItem('app.profile') : null)).catch(() => null)
  await (await openProfile(page)).getByRole('button', { name: 'Add a profile' }).click()
  const dialog = page.locator('.profile-dialog[open]')
  await dialog.getByLabel('This profile’s name').fill('Ana')
  await dialog.getByLabel('The new profile’s name').fill('Work')
  await dialog.getByRole('button', { name: 'Add it' }).click()
  await expect.poll(here).toMatch(/-work$/)
  page.on('dialog', (asked) => asked.accept())
  // Its own page holds Remove (D513).
  const profiles = await openSettings(page, 'Profiles')
  await profiles.locator('.profiles button.item', { hasText: 'Work' }).click()
  await profiles.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.toast')).toContainText('This profile stays: your organization keeps each task for at least 6 months, and removing a profile would delete its tasks.')
  expect(await here()).toMatch(/-work$/)
})

test('served from elsewhere, a policy that asks for retention without a key stops Jean with a message for IT', async ({ page, baseURL }) => {
  await page.route('https://jean.fake.example/**', async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://jean.fake.example/', String(baseURL)) }) }))
  await withPolicy(page, { retention: 'P6M' })
  await page.goto('https://jean.fake.example/')
  await expect(page.locator('main.lock')).toContainText('none here unlocks them')
  await expect(page.locator('#prompt')).toHaveCount(0)
})
