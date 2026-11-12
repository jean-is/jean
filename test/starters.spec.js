// SPDX-License-Identifier: MIT
// Ideas (D743): the ideas under the box of a new task become the person's, four at most: a project's own, then those for
// everywhere, then what they often ask there, kept in Settings; with none, the organisation's, policy's `starters`, in the
// person's language, else Jean's; under `only`, the organisation's alone, locked. In Arabic and Japanese, its words and
// directions are theirs.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, withPolicy, openSettings, closeSettings, addProject, enterProject } from './helpers.js'

/** Adds an idea on the list open in Settings, its words and request kept as a person leaves each field (not by Tab, which lands on an icon button whose tip Escape would close first). @param {import('@playwright/test').Locator} settings @param {string} words @param {string} request */
async function add(settings, words, request) {
  await settings.getByRole('button', { name: 'Add an idea' }).click()
  const idea = settings.locator('.starters-kept > li').last()
  await expect(idea.getByLabel('Shown as')).toBeFocused()
  await idea.getByLabel('Shown as').fill(words)
  await idea.getByLabel('Shown as').blur()
  await idea.getByLabel('Request').fill(request)
  await idea.getByLabel('Request').blur()
}

const ideas = (/** @type {import('@playwright/test').Page} */ page) => page.locator('.starters .starter')

test('an organisation’s ideas take the place of Jean’s, in the person’s language; under `only`, they stay alone, locked in Settings', async ({ page }) => {
  await withPolicy(page, {
    starters: { only: true, list: [
      { title: 'Summarise a contract', 'title-fr': 'Résumer un contrat', prompt: 'Summarise this contract in five points.', 'prompt-fr': 'Résume ce contrat en cinq points.' },
      { title: 'Answer a client', prompt: 'Draft a reply to this client, kind and short.' },
    ] },
    capabilities: { preUnlock: ['starters'] },
  })
  await start(page, 'fr')
  // Words in French where they are given, else in English.
  await expect(ideas(page)).toHaveText(['Résumer un contrat', 'Answer a client'])
  await ideas(page).first().click()
  await expect(page.locator('#prompt')).toHaveValue('Résume ce contrat en cinq points.')
  await expect(page.locator('#prompt')).toBeFocused()
  // Settings shows them, set by the organisation, and nothing changes them.
  const settings = await openSettings(page, 'Idées')
  await expect(settings.locator('.settings-panel')).toContainText('Défini par votre organisation')
  await expect(settings.locator('.starters-theirs > li')).toHaveCount(2)
  await expect(settings.getByRole('button', { name: 'Ajouter une idée' })).toHaveCount(0)
})

test('the person’s ideas, for everywhere and a project’s own, come first there, in place of Jean’s, moved and kept as a file', async ({ page }) => {
  await start(page)
  await expect(ideas(page)).toHaveText(['Try a spreadsheet', 'Compose a tune', 'Make a quiz', 'Savings plan'])
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('starters'))
  // Without Projects, the one list is the section.
  let settings = await openSettings(page, 'Ideas')
  await expect(settings.locator('.starters-head h2')).toHaveText('Ideas')
  await add(settings, 'Weekly report', 'Write the weekly report from this week’s sales.')
  await closeSettings(page)
  await expect(ideas(page)).toHaveText(['Weekly report'])
  await ideas(page).click()
  await expect(page.locator('#prompt')).toHaveValue('Write the weekly report from this week’s sales.')

  // A project's own come first there, then those for everywhere.
  await addProject(page, 'Bakery')
  await enterProject(page, 'Bakery')
  await expect(ideas(page)).toHaveText(['Weekly report'])
  settings = await openSettings(page, 'Ideas')
  await expect(settings.locator('[data-list]')).toHaveText([/Everywhere\s*Weekly report/, /Bakery\s*None yet/])
  await settings.locator('[data-list]', { hasText: 'Bakery' }).click()
  await expect(settings.locator('.starters-head h2')).toHaveText('Bakery')
  await add(settings, 'Order flour', 'Draft the flour order for next week.')
  await add(settings, 'Prices', 'Compare the price of butter at three suppliers.')
  await settings.getByRole('button', { name: 'Move “Prices” up' }).click()
  await expect(settings.getByRole('button', { name: 'Move “Prices” up' })).toBeDisabled()
  await closeSettings(page)
  await expect(ideas(page)).toHaveText(['Prices', 'Order flour', 'Weekly report'])
  const kept = await page.evaluate(async () => {
    const [{ app }, { readJSON }] = await Promise.all([import('/ui/state.js'), import('/core/fs.js')])
    return readJSON(app.fs, `${app.projectDir}/starters.json`)
  })
  expect(kept).toMatchObject({ format: 1, ideas: [{ title: 'Prices' }, { title: 'Order flour' }], hidden: [] })
})

test('a request asked a third time is offered under the box; what is often asked shows there, kept or hidden in Settings', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Skills, which the third request of a kind is offered first, is found already.
  await page.evaluate(async () => (await import('/ui/caps.js')).unlock('skills'))
  for (let i = 0; i < 3; i++) {
    await page.locator('.wordmark').click()
    await ask(page, i === 1 ? 'Please summarize the weekly sales by region' : 'Summarize the weekly sales by region')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('Here is what I found')
  }
  const offer = page.locator('aside.offer')
  await expect(offer).toContainText('Keep requests you make often under the box')
  await offer.getByRole('button', { name: 'Keep it under the box' }).click()
  // Settings opens on Ideas, where what is often asked waits.
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings.locator('.starters-head h2')).toHaveText('Ideas')
  const often = settings.locator('.starters-noticed > li')
  await expect(often).toHaveCount(1)
  await expect(often).toContainText('Summarize the weekly sales by region')
  await closeSettings(page)
  await page.locator('.wordmark').click()
  await expect(ideas(page)).toHaveCount(1)
  await ideas(page).click()
  await expect(page.locator('#prompt')).toHaveValue('Summarize the weekly sales by region')

  // Hidden, Jean's come back; kept, it is the person's, to change.
  await openSettings(page, 'Ideas')
  await often.getByRole('button', { name: 'Hide' }).click()
  await expect(settings.locator('.starters-noticed')).toHaveCount(0)
  await expect(settings.getByText('Nothing yet.')).toBeVisible()
  await closeSettings(page)
  await expect(ideas(page)).toHaveCount(4)
  await openSettings(page, 'Ideas')
  await settings.getByRole('button', { name: 'Show the hidden ones again' }).click()
  await often.getByRole('button', { name: 'Keep' }).click()
  await expect(settings.locator('.starters-kept > li')).toHaveCount(1)
  await expect(settings.locator('.starters-kept').getByLabel('Request')).toHaveValue('Summarize the weekly sales by region')
  await expect(often).toHaveCount(0)
  await closeSettings(page)
  await expect(ideas(page)).toHaveCount(1)
})

for (const [lang, dir] of /** @type {const} */ ([['ar', 'rtl'], ['ja', 'ltr']])) {
  test(`in ${lang === 'ar' ? 'Arabic' : 'Japanese'}, Ideas speaks the person’s language and reads ${dir === 'rtl' ? 'right to left' : 'left to right'}`, async ({ page }) => {
    await start(page, lang)
    const words = await page.evaluate(async () => {
      await (await import('/ui/caps.js')).unlock('starters')
      ;(await import('/ui/dialogs.js')).openSettings('starters')
      const { t, useStrings } = await import('/core/i18n.js')
      await useStrings('starters')
      return { name: t('cap.starters.name'), add: t('starters.add'), words: t('starters.words'), request: t('starters.request') }
    })
    const settings = page.locator('app-settings dialog[open]')
    await expect(page.locator('html')).toHaveAttribute('dir', dir)
    await expect(settings.locator('.starters-head h2')).toHaveText(words.name)
    await settings.getByRole('button', { name: words.add }).click()
    await settings.getByLabel(words.words).fill(lang === 'ar' ? 'تقرير الأسبوع' : '週報')
    await settings.getByLabel(words.words).blur()
    await settings.getByLabel(words.request).fill(lang === 'ar' ? 'اكتب تقرير هذا الأسبوع من المبيعات.' : '今週の売上から週報を書いてください。')
    await settings.getByLabel(words.request).blur()
    await closeSettings(page)
    await expect(ideas(page)).toHaveText([lang === 'ar' ? 'تقرير الأسبوع' : '週報'])
    await expect(ideas(page)).toHaveAttribute('dir', 'auto')
  })
}
