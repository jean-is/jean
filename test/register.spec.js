// SPDX-License-Identifier: MIT
// The register answers address the person in (D776): chosen under the language in Settings, of those the language offers,
// read by the brain at a conversation's start and as a note when it changes.
import { readFileSync } from 'node:fs'
import { test, expect, start, connectFakeBrain, ask, answered, openSettings, closeSettings, chooseLanguage } from './helpers.js'

const words = (/** @type {string} */ lang) => JSON.parse(readFileSync(new URL(`../app/locales/dialogs/${lang}.json`, import.meta.url), 'utf8'))
/** The frozen prompt of the task on show, then its notes. @param {import('@playwright/test').Page} page */
const told = (page) => page.evaluate(async () => {
  const records = (await import('/ui/state.js')).app.current.value?.records ?? []
  return [records.find((record) => record.meta?.prompt)?.meta?.prompt.system, ...records.flatMap((record) => (record.update?.sessionUpdate === '_system_note' ? [record.update.text] : []))].join('\n\n')
})

test('a register chosen under the language is what the brain reads; French alone offers Vieux françois, and a change in a conversation is a note', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const settings = await openSettings(page, words('en')['settings.general'])
  const register = settings.locator('select.register')
  await expect(register).toHaveAccessibleName('Tone')
  await expect(register.locator('option')).toHaveText(['Formal', 'Everyday', 'Casual'])
  await expect(register).toHaveValue('')
  await register.selectOption('formal')
  await closeSettings(page)
  await ask(page, 'Hello')
  await answered(page)
  expect(await told(page)).toMatch(/<\/language>\n\n<register>\nWrite every reply to the user in a formal, elevated register, .* What you write for the user to send or keep takes the register it needs\.\n<\/register>/)

  // In French, a fourth: the French of Rabelais and Montaigne, named as it wrote itself.
  await openSettings(page, words('en')['settings.general'])
  await chooseLanguage(settings, 'fr')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(register).toHaveAccessibleName('Registre')
  await expect(register.locator('option')).toHaveText(['Soutenu', 'Courant', 'Familier', 'Vieux françois'])
  await expect(register).toHaveValue('formal')
  await register.selectOption('old')
  await closeSettings(page)
  await ask(page, 'Bonjour')
  await answered(page, 2)
  expect(await told(page)).toContain('The <register> section is now:\nWhen you reply in French, write every sentence in the French of the sixteenth century, as Rabelais and Montaigne wrote it')

  // Another language doesn't offer it: the everyday one there, said in words to a conversation that was told another.
  await openSettings(page, words('fr')['settings.general'])
  await chooseLanguage(settings, 'en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(register.locator('option')).toHaveText(['Formal', 'Everyday', 'Casual'])
  await expect(register).toHaveValue('')
  await closeSettings(page)
  await ask(page, 'Thanks')
  await answered(page, 3)
  expect(await told(page)).toContain('The <register> section is now:\nThe user no longer asks for a register: write to them in the neutral, standard register of their language')
  // And French has it again.
  await openSettings(page, words('en')['settings.general'])
  await chooseLanguage(settings, 'fr')
  await expect(register).toHaveValue('old')
})

test('by default nothing of a register is sent', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Hello')
  await answered(page)
  expect(await told(page)).not.toContain('register')
})

for (const lang of ['ar', 'ja']) {
  test(`the register’s row is in the language’s own words, and fits a phone’s width (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await start(page, lang)
    const all = words(lang)
    const settings = await openSettings(page, all['settings.general'])
    const register = settings.locator('select.register'), row = settings.locator('li:has(select.register)')
    await expect(register).toHaveAccessibleName(all['settings.register'])
    await expect(row.locator('small')).toHaveText(all['settings.registerText'])
    await expect(register.locator('option')).toHaveText([all['register.formal'], all['register.everyday'], all['register.casual']])
    const [box, panel] = await Promise.all([register.boundingBox(), settings.locator('.settings-panel').boundingBox()])
    expect(box && panel && box.x >= panel.x && box.x + box.width <= panel.x + panel.width, 'the menu stays within the panel').toBe(true)
  })
}
