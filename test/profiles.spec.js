// Profiles (D228): several Jeans on one device, each its own, listed in the person's menu and opened
// afresh; a child's, set by a parent and opened by them under 13, whose concerns reach the parent's
// profile, its kind and when, never the words, unless the danger is at home.
import { test, expect } from '@playwright/test'
import { start, openProfile, openSettings, closeSettings, openTasks, ask, BRAIN_URL } from './helpers.js'

const PASSWORD = 'a long and happy password'

/** @param {import('@playwright/test').Page} page */
const ephemeral = (page) => page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
/** This tab's profile, by its folder, once it has started there. @param {import('@playwright/test').Page} page */
const here = (page) => page.evaluate(async () => ((await import('/ui/state.js')).app.fs && document.documentElement.classList.contains('is-ready') ? sessionStorage.getItem('app.profile') : null)).catch(() => null)
/** @param {import('@playwright/test').Page} page @param {string} path */
const read = (page, path) => page.evaluate(async (path) => (await import('/ui/state.js')).app.fs.read(path), path)

/** The dialog that adds a profile, from the person's menu, with this one's name if it has none yet. @param {import('@playwright/test').Page} page @param {string} name @param {string} [mine] */
async function add(page, name, mine) {
  await (await openProfile(page)).getByRole('button', { name: 'Add a profile' }).click()
  const dialog = page.locator('.profile-dialog[open]')
  await expect(dialog).toBeVisible()
  if (mine) await dialog.getByLabel('This profile’s name').fill(mine)
  await dialog.getByLabel('The new profile’s name').fill(name)
  return dialog
}

/** A password lock, from Settings › Your data, open on its part (as test/lock.spec.js sets one). @param {import('@playwright/test').Page} page */
async function lockWithPassword(page) {
  const part = page.locator('app-settings .lock-part')
  await part.getByRole('button', { name: 'Use a password' }).click()
  await part.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await part.getByLabel('The same password again').fill(PASSWORD)
  await part.getByRole('button', { name: 'Next' }).click()
  const code = String(await part.locator('.lock-code').textContent())
  await part.getByLabel('Type its last four characters').fill(code.replace(/-/g, '').slice(-4))
  await part.getByRole('button', { name: 'Set a lock' }).click()
  await expect(part).toContainText('Locked with your password.')
}

/** Types the password into the ways in shown in `where`. @param {import('@playwright/test').Locator} where */
async function unlockIn(where) {
  await where.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await where.getByRole('button', { name: 'Unlock' }).click()
}

test('where nothing is kept there is no profile to add; elsewhere the menu adds one', async ({ page }) => {
  await start(page)
  const menu = await openProfile(page)
  await expect(menu.getByRole('button', { name: 'Add a profile' })).toHaveCount(await ephemeral(page) ? 0 : 1)
})

test('the family page’s address opens Add a profile as a child’s, where profiles are kept (D424)', async ({ page }) => {
  await start(page)
  await page.goto('./?child')
  await expect(page.locator('.hero-question')).toBeVisible()
  await expect(page).not.toHaveURL(/child/)
  const dialog = page.locator('.profile-dialog[open]')
  if (await ephemeral(page)) return expect(dialog).toHaveCount(0)
  await expect(dialog.getByLabel('For a child')).toBeChecked()
  await expect(dialog.getByLabel('Year of birth')).toBeVisible()
})

test('a second profile is a Jean of its own: listed in the menu, opened afresh, and found by an address', async ({ page }) => {
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  const first = await here(page)
  expect(first).toMatch(/^profiles\/[0-9A-HJKMNP-TV-Z]{26}-profile$/)
  await page.evaluate(async () => (await import('/ui/state.js')).app.fs.write('memory.md', '- likes tea\n'))
  await (await add(page, 'Work', 'Ana')).getByRole('button', { name: 'Add it' }).click()
  await expect.poll(() => here(page)).toMatch(/-work$/)
  expect(await read(page, 'memory.md')).toBeNull()
  // With no first name set here, the drawer's foot calls the person by the profile's name (D150).
  await expect((await openTasks(page)).locator('.profile-name')).toHaveText('Work')

  // The menu lists both, this one first marked, and opens the other.
  const menu = await openProfile(page)
  await expect(menu.locator('.profile-switch > span[dir="auto"]')).toHaveText(['Ana', 'Work'])
  await expect(menu.locator('.profile-switch[aria-current="true"] > span[dir="auto"]')).toHaveText('Work')
  await menu.locator('.profile-switch', { hasText: 'Ana' }).click()
  await expect.poll(() => here(page)).toBe(first)
  expect(await read(page, 'memory.md')).toBe('- likes tea\n')

  // A task's address opens the profile that holds it, whichever this tab was last in.
  const id = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    const id = (await import('/core/ulid.js')).ulid()
    await app.fs.write(`${app.project.value.dir}/conversations/${id}.jsonl`, '')
    return id
  })
  await page.evaluate(async () => sessionStorage.setItem('app.profile', (await (await import('/ui/state.js')).app.whole?.list('profiles'))?.map(({ name }) => `profiles/${name}`).find((dir) => dir.endsWith('-work')) ?? ''))
  // A fresh document, so the address is read at the start, before the router could rewrite it.
  await page.goto('about:blank')
  await page.goto(`./#/c/${id}`)
  await expect.poll(() => here(page)).toBe(first)
})

test('a child’s profile: set by a parent, opened with their password under 13, its concerns told to the parent’s, never the words', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  // The parent locks their own profile first.
  let dialog = await add(page, 'Léa', 'Ana')
  await dialog.getByLabel('For a child').check()
  await dialog.getByLabel('Year of birth').selectOption(String(new Date().getFullYear() - 9))
  await expect(dialog).toContainText('First lock your own profile, so a child can’t open it.')
  await dialog.getByRole('button', { name: 'Lock my profile' }).click()
  await lockWithPassword(page)
  await closeSettings(page)

  // Then makes the child's with their password: born nine years ago, Vikidia alone, and the danger rule told.
  dialog = await add(page, 'Léa', 'Ana')
  await dialog.getByLabel('For a child').check()
  await dialog.getByLabel('Year of birth').selectOption(String(new Date().getFullYear() - 9))
  await expect(dialog).toContainText('never what was written, and not when the danger is at home')
  await dialog.getByRole('button', { name: 'Add it' }).click()
  await expect(dialog).toContainText('To add it, unlock with your password or passkey.')
  await unlockIn(dialog)

  // Under 13, it opens only with the parent's password.
  const lock = page.locator('main.lock')
  await expect(lock).toContainText('Léa')
  await expect(lock).toContainText('A parent opens this profile, with their password or passkey.')
  await expect(page.locator('app-shell')).toHaveCount(0)
  await unlockIn(lock)
  await expect.poll(() => here(page)).toMatch(/-lea$/)
  const policy = await page.evaluate(async () => (await import('/ui/state.js')).app.policy)
  expect(policy).toMatchObject({ child: true, searches: ['vikidia'], brains: [] })
  expect(policy.instructions).toContain('never write work that is theirs to do')
  const told = page.locator('aside.offer', { hasText: 'your parent is told that a concern came up' })
  await told.getByRole('button', { name: 'I understand' }).click()
  await expect(told).toHaveCount(0)

  // What the parent set says so, and no brain can be added but by them, never Start for free.
  let settings = await openSettings(page, 'Brains')
  await expect(settings.locator('.settings-panel')).toContainText('Set by a parent')
  await settings.locator('.settings-nav button', { hasText: 'Set by a parent' }).click()
  await settings.getByRole('button', { name: 'Change, with a parent’s password or passkey' }).click()
  await unlockIn(settings.locator('.settings-panel'))
  await expect(settings.locator('.settings-panel')).toContainText('Topics')
  await settings.locator('.settings-nav button', { hasText: 'Brains' }).click()
  await expect(settings.getByText('Start for free')).toHaveCount(0)
  await settings.locator('[data-brain="local"]').click()
  const local = settings.locator('.brain-way')
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await local.locator('.button.primary').click()
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.brains.length)).toBe(1)
  // A brain connected closes Settings, as it does everywhere; what the parent opened stays open.
  await expect(page.locator('app-settings dialog[open]')).toHaveCount(0)
  settings = await openSettings(page)
  await settings.locator('.settings-nav button', { hasText: 'Set by a parent' }).click()
  await settings.getByRole('button', { name: 'Done' }).click()
  // Opened afresh as the parent left it, with their password again, under 13.
  await unlockIn(page.locator('main.lock'))
  await expect.poll(() => here(page)).toMatch(/-lea$/)
  // As left: the brain kept, the notice read once, Settings closed.
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.policy.brains?.length)).toBe(1)
  await expect(page).not.toHaveURL(/\/settings/)
  await expect(told).toHaveCount(0)

  // Bullied at school: the brain raises a concern. Hit at home: the parent isn't told.
  await ask(page, 'The kids at school bullied me again today')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Their parent is told that a concern came up')
  // The message came after Learn it's steps, as if the child had named it (D394).
  const learning = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records
    .find((record) => record.update?.sessionUpdate === '_system_note' && /** @type {any} */ (record.update).data.mode === 'learn-it'))
  expect(/** @type {any} */ (learning)?.update.text).toMatch(/^For this message, follow the steps of the skill learn-it:\n\n# /)
  await page.keyboard.press('ControlOrMeta+Shift+O')
  await ask(page, 'My dad hits me at home')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Their parent isn\'t told')

  // The parent's profile, opened with their lock, shows one concern: its kind and when, never the words.
  await (await openProfile(page)).locator('.profile-switch', { hasText: 'Ana' }).click()
  await unlockIn(page.locator('main.lock'))
  const banner = page.locator('aside.profile-told')
  await expect(banner).toContainText('A concern came up in the profile “Léa”: bullying or threats')
  await expect(banner.locator('li')).toHaveCount(1)
  await expect(banner).not.toContainText('bullied')
  await banner.getByText('What you can do').click()
  await expect(banner).toContainText('Their school can act')
  await banner.getByRole('button', { name: 'Seen' }).click()
  await expect(banner).toHaveCount(0)
  settings = await openSettings(page, 'Profiles')
  await expect(settings.locator('.profile-list')).toContainText('Today: 0 min.')
  await expect(settings.locator('.profile-concerns li')).toHaveCount(1)
})
