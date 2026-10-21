// A page's pane that frames Jean's own demo of its task (D462): framed between the pane's head, box and line, as it
// ended, the AI named as the page names it and the answer drawn (a chart, a deck, words), and a button that plays it
// again from the request, the answer written as it came. Every page that has one, in English and French, as jean.is
// serves them (scripts/serve.js --home).
import { test, expect } from '@playwright/test'

const JEAN_IS = 'http://127.0.0.1:4186/'

// Tall enough for the pane whole: Play is fixed at the foot of its frame, which no scrolling of the page brings into view.
test.use({ viewport: { width: 1280, height: 1000 } })

/** Each page: its file, its request, the AI as it names it, Play's words, and what its answer draws. */
const PANES = [
  ['excel', 'sales.csv', 'Which product grew the most', 'the AI you chose', 'Watch it unfold', 'app-chart canvas'],
  ['fr/excel', 'sales.csv', 'Quel produit a le plus progressé', 'l’IA de votre choix', 'Voir le déroulé', 'app-chart canvas'],
  ['slides', null, 'Five slides for Monday', 'the AI you chose', 'Watch it unfold', 'app-slides'],
  ['fr/diapos', null, 'Cinq diapos pour la réunion', 'l’IA de votre choix', 'Voir le déroulé', 'app-slides'],
  ['work', 'Q3 sales.xlsx', 'one-page summary', 'your company’s AI', 'Watch it unfold', '.msg-jean .prose'],
  ['fr/travail', 'Ventes T3.xlsx', 'synthèse d’une page', 'l’IA de l’entreprise', 'Voir le déroulé', '.msg-jean .prose'],
  ['offline', null, 'my landlord', 'the AI on this computer', 'Watch it unfold', '.msg-jean .prose'],
  ['fr/hors-ligne', null, 'mon propriétaire', 'l’IA de cet ordinateur', 'Voir le déroulé', '.msg-jean .prose'],
]

for (const [address, file, asked, brain, play, drawn] of PANES) {
  test(`/${address}: its pane plays its task in Jean itself`, async ({ page }) => {
    /** @type {string[]} */
    const wrong = []
    page.on('console', (message) => { if (message.type() === 'error') wrong.push(message.text()) })
    page.on('pageerror', (error) => wrong.push(error.message))
    await page.goto(JEAN_IS + address)
    const pane = page.frameLocator('.site-demo')
    // As it ended, the exchange alone: the file and the request, the AI asked, the answer drawn.
    await expect(pane.locator('.msg-files .file-chip')).toHaveText(file ? [file] : [])
    await expect(pane.locator('.msg-user')).toContainText(asked)
    await expect(pane.locator('.activity > summary')).toContainText(brain)
    await expect(pane.locator(drawn).first()).toBeVisible()
    await expect(pane.locator('.conversation-title')).toBeHidden()
    // Played again from the request: the answer written as it came, then whole, and the button back.
    const button = pane.getByRole('button', { name: play })
    await button.click()
    await expect(button).toBeHidden()
    await expect(pane.locator('.msg-jean.is-streaming')).toHaveCount(1)
    await expect(pane.locator('.msg-jean.is-streaming')).toHaveCount(0)
    await expect(pane.locator(drawn).first()).toBeVisible()
    await expect(button).toBeVisible()
    expect(wrong).toEqual([])
  })
}
