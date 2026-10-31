// A page's pane that frames Jean's own demo of its task: framed between the pane's head, box and line, as it
// ended, the AI named as the page names it and the answer drawn (a chart, a deck, words), and a button that plays it
// again from the request, the answer written as it came. Every page that has one, in English and French, as jean.is
// serves them (scripts/serve.js --home). Where the page has a guided tour over its task, /excel, Play is
// the page's, and opens a popover that plays it full size, each stop in its turn ringing what it names, then again.
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
    // With a tour, the pane has no button of its own: the page's plays the tour (below).
    if (address.endsWith('excel')) {
      await expect(pane.locator('.demo-play')).toHaveCount(0)
      return expect(wrong).toEqual([])
    }
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

for (const [address, play, again] of [['excel', 'Watch it unfold', 'Watch again']]) {
  test(`/${address}: Play opens its tour full size in a popover, each stop ringing what it names, then plays it again`, async ({ page, request }) => {
    /** @type {string[]} */
    const wrong = []
    page.on('console', (message) => { if (message.type() === 'error') wrong.push(message.text()) })
    page.on('pageerror', (error) => wrong.push(error.message))
    /** @type {{ on?: string, say: string }[]} */
    const stops = (await (await request.get(`${JEAN_IS}demos/excel.${address.startsWith('fr/') ? 'fr' : 'en'}.tour.json`)).json()).stops
    // Each stop as it opens: its words, and whether what is ringed is what it names (nothing, for one alone), in the window.
    await page.addInitScript((names) => {
      const seen = /** @type {any} */ (window).seen = /** @type {object[]} */ ([])
      document.addEventListener('beforetoggle', (event) => {
        const bubble = /** @type {HTMLElement} */ (event.target)
        if (bubble.id !== 'app-tour' || /** @type {ToggleEvent} */ (event).newState !== 'open') return
        const [ringed, on] = [document.querySelector('.is-toured'), names[seen.length]]
        const box = ringed?.getBoundingClientRect()
        seen.push({ say: bubble.querySelector('p')?.textContent, ringed: on ? Boolean(ringed?.matches(on) && box && box.top >= 0 && box.bottom <= innerHeight) : !ringed })
      }, true)
    }, stops.map(({ on }) => on))
    await page.goto(JEAN_IS + address)
    // Its frame loads only once it opens: here, at four times the pace.
    const popover = page.locator('#site-tour')
    await expect(popover).toBeHidden()
    await page.locator('.site-tour-frame').evaluate((frame) => { /** @type {HTMLIFrameElement} */ (frame).src += '&speed=4' })
    const toured = () => page.frames().find((frame) => frame.url().includes('tour='))
    expect(toured()).toBeUndefined()
    await page.getByRole('button', { name: play }).click()
    await expect(popover).toBeVisible()
    await expect.poll(() => toured()?.evaluate(() => /** @type {any} */ (window).seen.length), { timeout: 30_000 }).toBe(stops.length)
    expect(await toured()?.evaluate(() => /** @type {any} */ (window).seen)).toEqual(stops.map(({ say }) => ({ say, ringed: true })))
    // Once it has played, a button plays it again from its first stop; Esc, in the frame as on the page, closes it.
    const frame = page.frameLocator('.site-tour-frame')
    await frame.getByRole('button', { name: again }).click()
    await expect(frame.locator('#app-tour')).toContainText(stops[0].say)
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    expect(wrong).toEqual([])
  })
}
