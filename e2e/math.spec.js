// Formulas (D185): the LaTeX an answer holds is drawn as MathML, in a line, set apart or in a table,
// once the math capability has loaded with the first one; prices written with $ stay text. A ```latex
// block is laid out as a document, copied as a widget is: its source and its picture at once; one of a
// single line has no frame, its Copy in that line; one being written is drawn as it comes.
// Follow-ups and requests draw theirs too.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, nextCopy } from './helpers.js'

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

test('a LaTeX document is laid out, and copied as its source and its picture', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Les formules d’Euler, en LaTeX')
  const laidOut = page.locator('.msg-jean app-latex')
  await expect(laidOut.locator('h3')).toHaveText("Formules d'Euler")
  await expect(laidOut.locator('h4')).toHaveText("Identité d'Euler")
  await expect(laidOut).not.toHaveAttribute('line')
  await expect(laidOut.locator('app-math math')).toHaveCount(2)
  await expect(laidOut.locator('details')).toHaveCount(0)
  // Copy: the block's source as text and the document as a picture, at once.
  const copy = await nextCopy(page)
  await laidOut.getByRole('button', { name: 'Copy' }).click()
  const copied = await copy.read()
  expect(copied['text/plain']).toBe(await laidOut.getAttribute('source'))
  expect(copied['text/plain']).toContain("\\section*{Formules d'Euler}")
  expect(copied['image/png']).toEqual([137, 80, 78, 71])
  await expect(page.locator('.toast')).toContainText('Copied')
  // Printed, the document shows without its Copy.
  await page.emulateMedia({ media: 'print' })
  await expect(laidOut.locator('.drawn-foot')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
  // Copying the answer: the document as its picture in the rich text.
  const whole = await nextCopy(page)
  await page.locator('.msg-jean').last().locator('app-made').getByRole('button', { name: 'Copy' }).click()
  const answerCopied = await whole.read()
  expect(answerCopied['text/html']).toMatch(/<img [^>]*src="data:image\/png;base64,iVBORw0KGgo/)
  expect(answerCopied['text/html']).toContain('Voici')
  expect(answerCopied['text/html']).not.toContain('app-latex')
  // Its follow-ups draw their formulas, and so does the request one sends.
  const next = page.locator('.follow-up', { hasText: 'Démontre la formule' })
  await expect(page.locator('.follow-up app-math math')).toHaveCount(2)
  await expect(next).not.toContainText('\\cos')
  // The proof it brings is drawn as it is written, never shown as its source.
  await page.evaluate(() => {
    const shown = /** @type {any} */ (window).sourceShown = []
    new MutationObserver(() => { if (document.querySelector('app-latex app-math > code')) shown.push(1) }).observe(document.body, { subtree: true, childList: true })
  })
  await next.click()
  await expect(page.locator('.is-streaming app-latex[open] mtext.is-bold').first()).toHaveText('Théorème :')
  const asked = page.locator('.msg-user').last()
  await expect(asked).toContainText('Démontre la formule')
  await expect(asked.locator('app-math math')).toHaveCount(1)
  await expect(asked).not.toContainText('$')
  // The proof comes as one aligned formula: its rows and its bold words, accents and all, are Temml's.
  const proof = page.locator('.msg-jean').last().locator('app-latex')
  await expect(proof.locator('app-math[block] math')).toHaveCount(1)
  await expect(proof.locator('app-math')).toContainText('Étape 1 : z=ix')
  await expect(proof.locator('mtext.is-bold').first()).toHaveText('Théorème :')
  await expect(proof.locator('app-math code')).toHaveCount(0)
  await expect(proof).not.toContainText('**')
  await expect(proof).not.toHaveAttribute('open')
  expect(await page.evaluate(() => /** @type {any} */ (window).sourceShown.length)).toBe(0)
})

test('a LaTeX block of one line has no frame, and its Copy is at the end of its line', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await ask(page, 'Euler’s identity in LaTeX')
  const line = page.locator('.msg-jean app-latex[line]')
  await expect(line.locator('app-math math')).toHaveCount(1)
  const placed = await line.evaluate((element) => {
    const formula = /** @type {HTMLElement} */ (element.querySelector('.latex-page')).getBoundingClientRect()
    const copy = /** @type {HTMLElement} */ (element.querySelector('.drawn-foot button')).getBoundingClientRect()
    return { border: getComputedStyle(element).borderTopWidth, inLine: copy.top < formula.bottom && copy.bottom > formula.top, atEnd: copy.left >= formula.right }
  })
  expect(placed).toEqual({ border: '0px', inLine: true, atEnd: true })
})
