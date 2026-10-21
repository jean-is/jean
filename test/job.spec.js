// A job page's pane (D462): Jean's own demo of the page's task, framed between the pane's head, box and line, as
// it ended, the AI named as the page names it and the chart drawn, and a button that plays it again from the
// request: the program under way, then the answer. In English and French, as jean.is serves them (scripts/serve.js --home).
import { test, expect } from '@playwright/test'

const JEAN_IS = 'http://127.0.0.1:4186/'

// Tall enough for the pane whole: Play is fixed at the foot of its frame, which no scrolling of the page brings into view.
test.use({ viewport: { width: 1280, height: 1000 } })

for (const [address, asked, brain, play] of [
  ['excel', 'Which product grew the most', 'the AI you chose', 'Watch it unfold'],
  ['fr/excel', 'Quel produit a le plus progressé', 'l’IA de votre choix', 'Voir le déroulé'],
]) {
  test(`/${address}: its pane plays the sample's task in Jean itself`, async ({ page }) => {
    /** @type {string[]} */
    const wrong = []
    page.on('console', (message) => { if (message.type() === 'error') wrong.push(message.text()) })
    page.on('pageerror', (error) => wrong.push(error.message))
    await page.goto(JEAN_IS + address)
    const pane = page.frameLocator('.job-demo')
    // As it ended, the exchange alone: the file and the request, the AI asked, the answer and its chart.
    await expect(pane.locator('.msg-files .file-chip')).toHaveText('sales.csv')
    await expect(pane.locator('.msg-user')).toContainText(asked)
    await expect(pane.locator('.activity > summary')).toContainText(brain)
    await expect(pane.locator('.msg-jean .prose')).toContainText('Juice')
    await expect(pane.locator('app-chart canvas')).toBeVisible()
    await expect(pane.locator('.conversation-title')).toBeHidden()
    // Played again from the request: the program under way, then the answer, and the button back.
    const button = pane.getByRole('button', { name: play })
    await button.click()
    await expect(button).toBeHidden()
    await expect(pane.locator('.activity')).toHaveAttribute('data-status', 'working')
    await expect(pane.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await expect(pane.locator('app-chart canvas')).toBeVisible()
    await expect(button).toBeVisible()
    expect(wrong).toEqual([])
  })
}
