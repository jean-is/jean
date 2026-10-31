// Settings › Approvals: the three rules as baskets of the kinds of action, a page for each kind, the exceptions with
// Stop, and a card's Always allow that says where it is taken back.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, openApprovals, closeSettings } from './helpers.js'

test('the baskets say what Jean does on its own, a kind changed shows a dot, and Put back the usual puts it back', async ({ page }) => {
  await start(page)
  const settings = await openSettings(page, 'Approvals')
  const lede = settings.locator('.settings-panel .lede')
  await expect(lede).toContainText('asks you first before it uses the internet')
  const [doIt, askFirst, never] = [0, 1, 2].map((i) => settings.locator('.approval-bins > li').nth(i))
  await expect(doIt).toContainText('Creating and changing files')
  await expect(never).toContainText('Passwords and payments: only you')
  // A kind's page: what it covers, the usual marked.
  await settings.locator('[data-page="edit"]').click()
  await expect(settings.locator('.settings-panel h2')).toHaveText('Creating and changing files')
  await expect(settings.locator('.approval-choices li', { hasText: 'Do it' })).toContainText('The usual')
  await settings.getByLabel('Ask me first').check()
  await settings.locator('.settings-panel .back').click()
  // Back on the list, the keyboard on its chip, now in Ask me first with a dot.
  await expect(askFirst.locator('[data-page="edit"]')).toBeFocused()
  await expect(askFirst.locator('[data-page="edit"] .approval-dot')).toHaveCount(1)
  await expect(lede).toContainText('You changed one from the usual, marked with a dot.')
  await settings.getByRole('button', { name: 'Put back the usual' }).click()
  await expect(doIt.locator('[data-page="edit"]')).toHaveCount(1)
  await expect(settings.locator('.approval-dot')).toHaveCount(0)
})

test('Always allow on a card says where it is taken back, and Exceptions stops what a capability keeps', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async () => {
    const { updateSettings } = await import('/ui/state.js')
    const { unlock } = await import('/ui/caps.js')
    await Promise.all([unlock('pictures'), unlock('computer')])
    await updateSettings({ rules: { edit: 'ask' }, films: true, computer: { sites: ['data.example.com'] } })
  })
  // Kept on the card: the toast leads to the kind's page, where Do it is now chosen.
  await ask(page, 'Make me a web page for the bakery')
  await page.locator('.approval').getByRole('button', { name: 'Always allow' }).click()
  const toast = page.locator('.toast')
  await expect(toast).toContainText('Kept. You can take it back in Approvals.')
  await toast.getByRole('button', { name: 'Approvals' }).click()
  const settings = page.locator('app-settings dialog[open]')
  await expect(settings.locator('.settings-panel h2')).toHaveText('Creating and changing files')
  await expect(settings.getByLabel('Do it')).toBeChecked()
  await closeSettings(page)

  // What the computer and pictures keep, each stopped from Exceptions.
  const again = await openApprovals(page, 'exceptions')
  const kept = again.locator('.rules li', { hasText: 'Films' })
  await expect(again.locator('.rules li', { hasText: 'data.example.com' })).toContainText('This computer may reach it')
  await kept.getByRole('button', { name: 'Stop' }).click()
  await expect(kept).toHaveCount(0)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.films)).toBe(false)
  await again.locator('.rules li', { hasText: 'data.example.com' }).getByRole('button', { name: 'Stop' }).click()
  await expect(again.locator('.settings-panel')).toContainText('When Jean asks, Always allow keeps your answer here')
})
