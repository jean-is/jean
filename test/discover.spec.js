// Discovery (0.3): the first starter asks what Jean can do, the house lights up (Settings'
// Capabilities), "turn on everything" works, and the brain picker offers Auto, the connected brains
// and "never send to the cloud".
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, openSettings } from './helpers.js'

test('the first starter asks what Jean can do, in a few plain words', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const first = page.locator('.starter').first()
  await expect(first).toHaveText('What can you do?')
  await first.click()
  await expect(page.locator('#prompt')).toHaveValue('What can you do for me? Give me 3 examples I can try.')
  await expect(page.locator('#prompt')).toBeFocused()
  await page.locator('#prompt').press('Enter')
  await expect(page.locator('.msg-jean .prose').last()).toContainText('What can you do for me?')
})

test('the house lights up as capabilities are turned on', async ({ page }) => {
  await start(page)
  const house = (await openSettings(page, 'Capabilities')).locator('.house')
  await expect(house).toBeVisible()
  await expect(page.locator('app-settings [aria-current="page"]')).toHaveText('Capabilities')
  // A case of trophies (D127): the plaque shows the next one to find, and how.
  await expect(house.locator('.trophy:not(.is-lit)').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(house.locator('.plaque-how')).toContainText('How to find it')
  const lit = house.locator('.trophy.is-lit')
  const before = await lit.count()
  await house.locator('.plaque .button').click()
  await expect(lit).toHaveCount(before + 1)
  await expect(house.locator('.house-ring .is-lit')).toHaveCount(before + 1)
  const warmth = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warmth'))
  expect(Number(warmth)).toBeGreaterThan(0)
  await house.locator(':scope > .button.wide').click()
  await expect(house.locator('.trophy:not(.is-lit)')).toHaveCount(0)
  await expect(house.locator('.house-rank')).toHaveText('Daylight')
})

test('offers count the tasks of every project, wait their turn when due, and give way to what the user does now', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Three tasks in another project: Backup and Intuition are about all of them, so they are due.
  await page.evaluate(async () => {
    const { app, refreshProjects } = await import('/ui/state.js')
    const { createProject } = await import('/core/settings.js')
    const { createConversation, appendRecords } = await import('/core/conversations.js')
    const { userRecords } = await import('/core/events.js')
    const projectDir = await createProject(app.fs, { name: 'Garden', by: 'test' })
    for (let i = 1; i <= 3; i++) await appendRecords(app.fs, (await createConversation(app.fs, { projectDir, by: 'test' })).path, userRecords(`Garden note ${i}`, [], 'test'))
    await refreshProjects()
  })
  // Intuition is due, and Backup too outside a private window (WebKit's here): whichever count came first shows first.
  const offer = page.locator('aside.offer')
  const ephemeral = await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)
  let left = ['get a feel for what you need', ...(ephemeral ? [] : ['Keep a copy of everything'])]
  await expect(offer).toContainText(new RegExp(left.join('|')))
  // A spreadsheet shared now takes its place.
  await page.locator('.composer input[type="file"]').setInputFiles({ name: 'Sales.csv', mimeType: 'text/csv', buffer: Buffer.from('month,total\nJan,10\n') })
  await expect(offer).toContainText('Want exact numbers')
  // Then what is due comes back, one after the other, none lost.
  while (left.length) {
    await offer.getByRole('button', { name: 'No thanks' }).click()
    await expect(offer).toContainText(new RegExp(left.join('|')))
    const shown = (await offer.textContent()) ?? ''
    left = left.filter((text) => !shown.includes(text))
  }
})

test('the picker: a menu above the chip, Auto by default, a brain by hand, never the cloud', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const chip = page.locator('.brain-chip')
  await expect(chip).toContainText('Auto')
  await chip.click()
  const picker = page.locator('#brain-menu')
  await expect(picker.locator('[aria-current="true"]')).toContainText('Auto')
  const [menu, under] = await Promise.all([picker.boundingBox(), chip.boundingBox()])
  expect((menu?.y ?? 0) + (menu?.height ?? 0)).toBeLessThanOrEqual(under?.y ?? 0)
  // Never sending to the cloud is offered once a brain is there.
  await expect(picker.getByRole('switch')).toHaveCount(0)
  await picker.getByRole('button', { name: /fake-brain-1/ }).click()
  await expect(picker).toBeHidden()
  await expect(chip).toContainText('fake-brain-1')
  await page.evaluate(() => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'cloud', provider: 'openai', api: 'openai', baseURL: 'https://api.openai.invalid/v1', model: 'gpt-6-sol' })))
  await chip.click()
  await picker.getByRole('switch').click()
  await expect(picker.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  const settings = await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value)
  expect(settings.auto).toBe(false)
  expect(settings.cloud).toBe(false)
})
