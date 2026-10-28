// What Jean knows of itself (D423): asked what it can do, the brain reads `about`, which says where each capability
// stands for this person, in the case's own words and those of the screen, and leaves out what policy denies; from the
// code, Settings' sections, the keyboard's shortcuts, what the organisation locked, and once Connections is found, the
// services reached here and those not yet; asked about something, the parts that match come whole. In Arabic and
// Japanese, the names of menus, shortcuts and how each capability is found are the screen's.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { start, connectFakeBrain, ask, withPolicy, openSettings, closeSettings } from './helpers.js'

/** A language's strings, the room's and the dialogs'. @param {string} lang */
const strings = (lang) => ({ ...JSON.parse(readFileSync(new URL(`../app/locales/${lang}.json`, import.meta.url), 'utf8')), ...JSON.parse(readFileSync(new URL(`../app/locales/dialogs/${lang}.json`, import.meta.url), 'utf8')) })

test('asked what it can do, Jean reads where each thing stands for this person, without what policy denies', async ({ page }) => {
  await withPolicy(page, { capabilities: { deny: ['pictures'] }, rules: { fetch: 'ask' } })
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'What can you do?')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer).toContainText('Settings has these sections now: General, Brains, Appearance')
  await expect(answer).toContainText(/Keyboard shortcuts, as this keyboard writes them: New task (⌘⇧O|Ctrl\+Shift\+O), /)
  await expect(answer).toContainText("Set by your organization, so the user can't change it: Approvals › Using the internet.")
  await expect(answer).not.toContainText('Services that can be connected')
  // What is always there, in the guide's words; a capability in the case's, found or not, with how it is found.
  await expect(answer).toContainText('start: The box is where everything begins')
  await expect(answer).toContainText('made (on): Ask for a Word document')
  await expect(answer).toContainText('files (not found yet, found by: Share a file, or paste a long text.)')
  await expect(answer).not.toContainText('pictures (')
  await expect(page.locator('.activity-list')).toContainText('What Jean can do')
  // A line for each part, at the fake brain's pace, which a busy machine slows.
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible({ timeout: 20_000 })

  // Asked about something, its part comes whole, the menus named as the screen names them.
  await ask(page, 'What can you do about a lock and a passkey?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Set on Lock\'s page in Settings › Your data: a passkey or a password')
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()

  // Once Connections is found, the services it reaches here, and those it doesn't yet, with no gateway; once Search is, its shortcut.
  await page.evaluate(async () => { for (const id of ['connections', 'find']) await (await import('/ui/caps.js')).unlock(id) })
  await ask(page, 'What can you do?')
  const again = page.locator('.msg-jean .prose').last()
  await expect(again).toContainText(/Services that can be connected here: .*?Notion.*? Shown, but not reachable here yet: .*?Google Workspace \(Gmail/)
  await expect(again).toContainText(/, Search (⌘K|Ctrl\+K), /)
})

test("Settings › General says at its foot which version this is and when it was made, and so does Jean, asked (D652)", async ({ page }) => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  await start(page)
  const settings = await openSettings(page)
  const foot = settings.locator('.settings-panel p.version')
  await expect(foot).toHaveText(new RegExp(`^Jean ${version.replaceAll('.', '\\.')}, from \\w+ \\d+, \\d{4} at `))
  const date = await foot.locator('time').getAttribute('datetime')
  expect(Date.parse(String(date))).toBeLessThanOrEqual(Date.now())
  const line = await foot.textContent()
  await closeSettings(page)
  await connectFakeBrain(page)
  await ask(page, 'What can you do?')
  await expect(page.locator('.msg-jean .prose').last()).toContainText(`The version, at the foot of Settings › General: ${line}.`)
})

for (const lang of ['ar', 'ja']) {
  test(`in ${lang}, the menus and how each thing is found are said as the screen says them`, async ({ page }) => {
    const said = strings(lang)
    await start(page, lang)
    await connectFakeBrain(page)
    await ask(page, 'What can you do?')
    const answer = page.locator('.msg-jean .prose').last()
    await expect(answer).toContainText(`${said['settings.title']} has these sections now: ${said['settings.general']}`)
    await expect(answer).toContainText(`${said['settings.keyboard']}, as this keyboard writes them: ${said['action.new']} `)
    await expect(answer).toContainText(`files (not found yet, found by: ${said['cap.files.hint']})`)
    await expect(answer).toHaveAttribute('dir', 'auto')
    await expect(answer).toContainText(said['settings.version'].replace('{name}', 'Jean').replace('{version}', JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version).split('{date}')[0])
  })
}
