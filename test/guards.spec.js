// Guards (D295): rules for one kind of action or one service, in Settings › Approvals › Exceptions (D527), that only
// ever make Jean more careful, and with a question, only when its answer about the call is yes.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openApprovals, closeSettings } from './helpers.js'

test('a guard of the user’s refuses what it covers when its question says so, and the organisation’s shows locked', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  // Be more careful, from Exceptions: for a kind, then what, then only when.
  const settings = await openApprovals(page, 'exceptions')
  await expect(settings.locator('.settings-panel')).toContainText('Ask first, or never, for one kind of action or one service.')
  await settings.getByRole('button', { name: 'Be more careful for…' }).click()
  await settings.getByRole('combobox', { name: 'For' }).selectOption({ label: 'Creating and changing files' })
  await settings.getByRole('radiogroup', { name: 'Rule' }).getByText('Never').click()
  await settings.getByLabel('Only if the answer is yes to… (optional)').fill('Is it a web page?')
  await settings.getByRole('button', { name: 'Add', exact: true }).click()
  // Back on Exceptions, read as it does.
  await expect(settings.locator('.settings-panel h2')).toHaveText('Exceptions')
  const guard = settings.locator('.rules li', { hasText: 'When the answer is yes to “Is it a web page?”' })
  await expect(guard).toContainText('Creating and changing files · Never')
  await closeSettings(page)

  // A web page is refused, with what the brain reads; a Word document isn't one, and is made.
  await ask(page, 'Make me a web page for the bakery')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toContainText("The user's rules refuse this action.")
  await ask(page, 'Now a word document of the plan')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose')).toHaveCount(2)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('Done: Bakery plan.docx')

  // The organisation's comes first, locked; the user's is removed with a click. A kind's page lists its own.
  await page.evaluate(async () => { (await import('/ui/state.js')).app.policy.guards = [{ id: 'p1', kind: 'delete', then: 'never' }] })
  const again = await openApprovals(page, 'exceptions')
  const rows = again.locator('.rules li', { hasText: ' · ' })
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Never')
  await expect(rows.first()).toContainText('Set by your organization')
  await again.getByRole('button', { name: 'Remove this rule' }).click()
  await expect(rows).toHaveCount(1)
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.guards)).toEqual([])
  await again.locator('.settings-panel .back').click()
  await again.locator('[data-page="delete"]').click()
  await expect(again.locator('.settings-panel .rules li')).toContainText('Deleting files · Never')
})
