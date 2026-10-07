// Formulas (D185): the LaTeX an answer holds is drawn as MathML, in a line, set apart or in a table,
// once the math capability has loaded with the first one; prices written with $ stay text.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

test('formulas are drawn, set apart or in a line, and prices stay text', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'What is the golden ratio?')
  const answer = page.locator('.msg-jean .prose').last()
  await expect(answer.locator('app-math math')).toHaveCount(3)
  await expect(answer.locator('app-math[block] math[display="block"]')).toHaveCount(1)
  await expect(answer.locator('app-math').first()).toHaveText(/φ\s*≈\s*1\.618/)
  await expect(answer.locator('td app-math math')).toHaveCount(1)
  await expect(answer).toContainText('A book costs $5 and a pen $10.')
})
