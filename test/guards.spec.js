// Guards (D295): rules for one kind of action or one service, in Settings › Approvals, that only
// ever make Jean more careful, and with a question, only when its answer about the call is yes.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings } from './helpers.js'

test('a guard of the user’s refuses what it covers when its question says so, and the organisation’s shows locked', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const settings = await openSettings(page, 'Approvals')
  await settings.getByRole('combobox', { name: 'For' }).selectOption({ label: 'Creating and changing files' })
  await settings.getByRole('combobox', { name: 'Rule' }).selectOption({ label: 'Never' })
  await settings.getByLabel('Only if the answer is yes to… (optional)').fill('Is it a web page?')
  await settings.getByRole('button', { name: 'Add', exact: true }).click()
  const guard = settings.locator('.rules li', { hasText: 'When the answer is yes to “Is it a web page?”' })
  await expect(guard).toContainText('Creating and changing files · Never')
  await closeSettings(page)

  // A web page is refused, with what the brain reads; a Word document isn't one, and is made.
  await ask(page, 'Make me a web page for the bakery')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toContainText("The user's rules refuse this action.")
  await ask(page, 'Now a word document of the plan')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Done: Bakery plan.docx')

  // The organisation's comes first, locked; the user's is removed with a click.
  await page.evaluate(async () => { (await import('/ui/state.js')).app.policy.guards = [{ id: 'p1', kind: 'delete', then: 'never' }] })
  const again = await openSettings(page, 'Approvals')
  const rows = again.locator('.rules li', { hasText: ' · ' })
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Never')
  await expect(rows.first()).toContainText('Set by your organization')
  await again.getByRole('button', { name: 'Remove this rule' }).click()
  await expect(rows).toHaveCount(1)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.guards)).toEqual([])
})
