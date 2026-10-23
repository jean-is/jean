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

/** A password lock, set on the lock's part where it shows (as test/lock.spec.js sets one). @param {import('@playwright/test').Locator} part */
async function lockWithPassword(part) {
  await part.getByRole('button', { name: 'Use a password' }).click()
  await part.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await part.getByLabel('The same password again').fill(PASSWORD)
  await part.getByRole('button', { name: 'Next' }).click()
  const code = String(await part.locator('.lock-code').textContent())
  await part.getByLabel('Type its last four characters').fill(code.replace(/-/g, '').slice(-4))
  await part.getByRole('button', { name: 'Set a lock' }).click()
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
  await dialog.getByLabel('This profile’s name').fill('Ana')
  await dialog.getByLabel('The new profile’s name').fill('Léa')
  await dialog.getByRole('button', { name: 'Next' }).click()
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
  test.setTimeout(180_000)
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  // Whom it is for, then what a child's profile is set to at their age, then the parent's lock, set in the dialog (D513).
  const dialog = await add(page, 'Léa', 'Ana')
  await dialog.getByLabel('For a child').check()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByLabel('Year of birth').selectOption(String(new Date().getFullYear() - 9))
  await expect(dialog.locator('.profile-baskets')).toContainText('Weapons')
  await expect(dialog).toContainText('Under 13, the profile opens only with your password or passkey.')
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog).toContainText('First lock your own profile, so a child can’t open it.')
  await lockWithPassword(dialog.locator('.lock-part'))
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

  // What the parent set says so, and where a brain comes from; none can be added but by them, never Start for free.
  let settings = await openSettings(page, 'Brains')
  await expect(settings.locator('.settings-panel')).toContainText('Set by a parent')
  await expect(settings.locator('.settings-panel')).toContainText('No brain answers here yet. A parent chooses one from their own profile')
  await settings.locator('.settings-nav button', { hasText: 'Set by a parent' }).click()
  await settings.getByRole('button', { name: 'Change, with a parent’s password or passkey' }).click()
  await unlockIn(settings.locator('.settings-panel'))
  await expect(settings.locator('.settings-panel')).toContainText('Topics')
  // Approvals too: Creating and changing files asks first, as the parent leaves it.
  await settings.locator('.settings-nav button', { hasText: 'Approvals' }).click()
  await settings.locator('.rules').first().locator('li', { hasText: 'Creating and changing files' }).locator('label', { hasText: 'Ask me first' }).click()
  await settings.locator('.settings-nav button', { hasText: 'Brains' }).click()
  await expect(settings.getByText('Start for free')).toHaveCount(0)
  await settings.locator('[data-brain="local"]').click()
  const local = settings.locator('.brain-way')
  await local.locator('select').selectOption('custom')
  await local.locator('input[name="baseURL"]').fill(BRAIN_URL)
  await expect(settings.locator('.settings-panel')).not.toContainText('No brain answers here yet')
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
  // The child reads it by their parent's name, the danger rule in view, and when it opens on its own.
  settings = await openSettings(page)
  await settings.locator('.settings-nav button', { hasText: 'Set by a parent' }).click()
  await expect(settings.locator('.settings-panel h2')).toHaveText('Set by Ana')
  await expect(settings.locator('.profile-baskets')).toContainText('Ask Ana first')
  await expect(settings.locator('.profile-tell')).toContainText('your parent is told')
  await expect(settings.locator('.settings-panel')).toContainText('the school year Léa turns 13')
  // Every rule as the parent left it, the usual for the rest, none the child can change.
  await settings.locator('.settings-nav button', { hasText: 'Approvals' }).click()
  const rules = settings.locator('.rules').first()
  await expect(rules.locator('li', { hasText: 'Creating and changing files' }).getByLabel('Ask me first')).toBeChecked()
  await expect(rules.locator('li', { hasText: 'Sending and sharing' }).getByLabel('Ask me first')).toBeChecked()
  await expect(rules.locator('input')).not.toHaveCount(0)
  await expect(rules.locator('input:enabled')).toHaveCount(0)
  await closeSettings(page)

  // Asked first, the child answers for this time only: Always allow and Never are the parent's to set.
  await ask(page, 'Make me a web page for the bakery')
  const card = page.locator('.approval')
  await expect(card.getByRole('button')).toHaveText(['Allow once', 'Not now'])
  await card.getByRole('button', { name: 'Allow once' }).click()
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose').last()).toContainText('Done: Bakery.html')
  await page.keyboard.press('ControlOrMeta+Shift+O')

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
  // Settings › Profiles: Léa's row, her age and today's minutes; her page, the concern, the week and what she is set to.
  settings = await openSettings(page, 'Profiles')
  const panel = settings.locator('.settings-panel')
  await expect(panel.locator('.profiles')).toContainText('9 years · 0 min today')
  await panel.locator('.profiles button.item', { hasText: 'Léa' }).click()
  await expect(panel.locator('h2')).toHaveText('Léa')
  await expect(panel.locator('.profile-concerns li')).toHaveCount(1)
  await expect(panel.locator('.profile-week')).toHaveAttribute('aria-label', 'Today: 0 min. This week: 0 min.')
  await expect(panel.locator('.profile-baskets > div', { hasText: 'Later' })).toContainText('Weapons')
  await expect(panel.locator('.profile-facts')).toContainText('Vikidia, for 8 to 13 year olds')

  // Changed from here, with Ana's password once: weapons talked about first, and Wikipedia too.
  await panel.getByRole('button', { name: 'Change', exact: true }).click()
  await unlockIn(panel)
  await panel.locator('.profile-grid tr', { hasText: 'Weapons' }).getByLabel('Talk with us first').check()
  await panel.getByLabel('Wikipedia').check()
  await panel.getByRole('button', { name: 'Done' }).click()
  await expect(panel.locator('.profile-baskets > div', { hasText: 'Talk with us first' })).toContainText('Weapons')
  await expect(panel.locator('.profile-facts')).toContainText('Wikipedia')

  // Ana's own page: Remove is held while Léa's profile opens only with Ana's key.
  await panel.getByRole('button', { name: 'Profiles' }).click()
  await panel.locator('.profiles button.item', { hasText: 'Ana' }).click()
  await expect(panel.getByRole('button', { name: 'Remove' })).toBeDisabled()
  await expect(panel).toContainText('Remove Léa first')
  await closeSettings(page)

  // Léa's profile opens with what Ana changed from hers.
  await (await openProfile(page)).locator('.profile-switch', { hasText: 'Léa' }).click()
  await unlockIn(page.locator('main.lock'))
  await expect.poll(() => here(page)).toMatch(/-lea$/)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.policy.searches)).toEqual(['vikidia', 'wikipedia'])
})

test('a child’s profile is given its parent’s brains with their keys, never OpenRouter’s, and the parent takes one back from theirs (D389)', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  test.skip(await ephemeral(page), 'nothing is kept here: a private window, Playwright’s WebKit')
  await page.evaluate(async (url) => {
    const [{ app, updateSettings }, { setSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')])
    for (const id of ['groq', 'openrouter']) await setSecret(app.fs, id, `key-${id}`)
    await updateSettings({ brains: ['groq', 'openrouter'].map((id) => ({ id, provider: /** @type {any} */ (id), api: 'openai', baseURL: url, model: `${id}/fake` })) })
  }, BRAIN_URL)
  /** Who answers in this profile, and the keys it holds. */
  const answers = () => page.evaluate(async () => {
    const [{ app }, { getSecret }] = await Promise.all([import('/ui/state.js'), import('/ui/secrets.js')])
    return { brains: app.policy.brains?.map((brain) => brain.id), groq: await getSecret(app.fs, 'groq'), openrouter: await getSecret(app.fs, 'openrouter') }
  })

  // Shown at their age before it is made: Groq answers, not OpenRouter, whose terms are for adults.
  const dialog = await add(page, 'Léa', 'Ana')
  await dialog.getByLabel('For a child').check()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.locator('.profile-facts')).toContainText('Groq · fake')
  await expect(dialog.locator('.profile-facts')).not.toContainText('OpenRouter')
  await dialog.getByRole('button', { name: 'Next' }).click()
  await lockWithPassword(dialog.locator('.lock-part'))
  await unlockIn(dialog)
  await unlockIn(page.locator('main.lock'))
  await expect.poll(() => here(page)).toMatch(/-lea$/)
  expect(await answers()).toEqual({ brains: ['groq'], groq: 'key-groq', openrouter: null })

  // From Ana's profile, with her password once: Groq taken back, its key gone with it.
  await (await openProfile(page)).locator('.profile-switch', { hasText: 'Ana' }).click()
  await unlockIn(page.locator('main.lock'))
  const settings = await openSettings(page, 'Profiles')
  const panel = settings.locator('.settings-panel')
  await panel.locator('.profiles button.item', { hasText: 'Léa' }).click()
  await panel.getByRole('button', { name: 'Change', exact: true }).click()
  await unlockIn(panel)
  const who = panel.locator('fieldset', { hasText: 'Who answers' })
  await expect(who.locator('label')).toHaveText(['Groq · fake'])
  await who.getByLabel('Groq · fake').uncheck()
  await panel.getByRole('button', { name: 'Done' }).click()
  await expect(panel.locator('.profile-facts dd').last()).toHaveText('None')
  await closeSettings(page)
  await (await openProfile(page)).locator('.profile-switch', { hasText: 'Léa' }).click()
  await unlockIn(page.locator('main.lock'))
  await expect.poll(() => here(page)).toMatch(/-lea$/)
  expect(await answers()).toEqual({ brains: [], groq: null, openrouter: null })
})
