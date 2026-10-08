// Formulas (D185): the LaTeX an answer holds is drawn as MathML, in a line, set apart or in a table,
// once the math capability has loaded with the first one; prices written with $ stay text. A ```latex
// block is laid out as a document, its source a click away. Follow-ups and requests draw theirs too.
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

test('a LaTeX document is laid out, with its source under it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Les formules d’Euler, en LaTeX')
  const laidOut = page.locator('.msg-jean app-latex')
  await expect(laidOut.locator('h3')).toHaveText("Formules d'Euler")
  await expect(laidOut.locator('h4')).toHaveText("Identité d'Euler")
  await expect(laidOut.locator('app-math math')).toHaveCount(2)
  await expect(laidOut.locator('details pre')).toBeHidden()
  await laidOut.locator('summary').filter({ hasText: 'latex' }).click()
  await expect(laidOut.locator('details pre')).toContainText("\\section*{Formules d'Euler}")
  // Its follow-ups draw their formulas, and so does the request one sends.
  const next = page.locator('.follow-up', { hasText: 'Démontre la formule' })
  await expect(page.locator('.follow-up app-math math')).toHaveCount(2)
  await expect(next).not.toContainText('\\cos')
  await next.click()
  const asked = page.locator('.msg-user').last()
  await expect(asked).toContainText('Démontre la formule')
  await expect(asked.locator('app-math math')).toHaveCount(1)
  await expect(asked).not.toContainText('$')
})
