// SPDX-License-Identifier: MIT
// Policy's `session` (D676, ee/): on a shared computer, signing out erases this profile, once the person confirms; and going
// idle signs out, or locks. On localhost no key is needed.
import { test, expect } from '@playwright/test'
import { start, ask, openProfile, openData, withPolicy } from './helpers.js'
import { POLICY, fakeIssuer, fakeGateway } from './fixtures/fake-issuer.js'

/** What this browser holds: its profiles' folders, and whether anything of theirs is in its storage. @param {import('@playwright/test').Page} page */
const held = (page) => page.evaluate(async () => {
  const { app } = await import('/ui/state.js')
  const { here } = await import('/ui/opfs.js')
  return { here: here(), profiles: (await app.whole.list('profiles')).map((/** @type {{ name: string }} */ entry) => entry.name), stored: Object.keys(localStorage).filter((key) => key.includes(':profiles/')) }
})

test('tabs that start together on a device with nothing yet share one new profile, none of them finding it half made', async ({ context }) => {
  const pages = await Promise.all([0, 1, 2].map(() => context.newPage()))
  await Promise.all(pages.map((page) => page.goto('/')))
  for (const page of pages) await expect(page.locator('#prompt')).toBeVisible()
  const [{ profiles }, ...others] = await Promise.all(pages.map(held))
  expect(profiles).toHaveLength(1)
  for (const other of others) expect(other.profiles).toEqual(profiles)
})

test('signing out on a shared computer erases this profile once the person confirms, and the next one starts afresh, in every tab', async ({ page, context }) => {
  const policy = { ...POLICY, session: { signOut: 'wipe' } }
  const issuer = await fakeIssuer(page)
  await fakeGateway(page, issuer)
  await withPolicy(page, policy)
  await start(page)
  await ask(page, 'Hello')
  await expect(page.locator('.msg-jean .prose')).not.toBeEmpty()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  const settings = await openData(page, 'organization', 'Privacy')
  await expect(settings).toContainText('Signing out erases everything kept here on this computer')
  await page.keyboard.press('Escape')
  const before = await held(page)
  expect(before.profiles).toHaveLength(1)

  // Asked, and declined: nothing happens.
  page.once('dialog', (dialog) => dialog.dismiss())
  await (await openProfile(page)).getByRole('button', { name: 'Sign out' }).click()
  await expect(page.locator('#prompt')).toBeVisible()
  expect((await held(page)).profiles).toEqual(before.profiles)
  await page.keyboard.press('Escape')
  expect(issuer.signedOut).toHaveLength(0)

  // What the browser keeps for this profile outside its files: a folder's handles, say.
  await page.evaluate((dir) => new Promise((done) => { const open = indexedDB.open(`app-folders:${dir}`, 1); open.onsuccess = () => { open.result.close(); done(undefined) } }), before.here)
  // Another tab, which holds what it would write as it leaves.
  const other = await context.newPage()
  await fakeGateway(other, await fakeIssuer(other))
  await withPolicy(other, policy)
  await other.goto('/')
  await expect(other.locator('#prompt')).toBeVisible()

  // Confirmed: out at the identity provider, and everything of it gone.
  page.once('dialog', (dialog) => dialog.accept())
  await (await openProfile(page)).getByRole('button', { name: 'Sign out' }).click()
  await expect.poll(() => issuer.signedOut.length).toBe(1)
  await expect.poll(() => issuer.authorized.length).toBe(2)
  await expect(page.locator('#prompt')).toBeVisible()
  const after = await held(page)
  expect(after.profiles).toHaveLength(1)
  expect(after.profiles).not.toEqual(before.profiles)
  // The other tab started afresh too, in that one.
  await expect(other.locator('#prompt')).toBeVisible()
  await expect.poll(async () => (await held(other)).profiles).toEqual(after.profiles)
  expect(after.stored.filter((key) => key.endsWith(before.here))).toEqual([])
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map(({ name }) => String(name)))).not.toContain(`app-folders:${before.here}`)
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.fs.list('projects').then(async (projects) => {
    const { app } = await import('/ui/state.js')
    const all = await Promise.all(projects.map((/** @type {{ name: string }} */ one) => app.fs.list(`projects/${one.name}/conversations`).catch(() => [])))
    return all.flat().length
  }))).toBe(0)
})

test('with nothing done for long enough, Jean signs out, never before', async ({ page }) => {
  const issuer = await fakeIssuer(page)
  await fakeGateway(page, issuer)
  await withPolicy(page, { ...POLICY, session: { idle: 'PT5M' } })
  await page.clock.install()
  await start(page)
  await page.clock.fastForward('04:00')
  await page.locator('#prompt').press('a')
  await page.clock.fastForward('04:00')
  await expect(page.locator('#prompt')).toBeVisible()
  expect(issuer.signedOut).toHaveLength(0)
  await page.clock.fastForward('02:00')
  await expect(page.locator('#curtain main')).toContainText('You’re signed out.')
  expect(issuer.signedOut).toHaveLength(1)
})

test('a section that can’t work stops Jean with a message for IT, served from elsewhere with no key too', async ({ page }) => {
  await withPolicy(page, { session: { idle: 'PT5M' } })
  await page.goto('/')
  await expect(page.locator('main')).toContainText('Tell your IT team')
  await expect(page.locator('#prompt')).toHaveCount(0)
})
