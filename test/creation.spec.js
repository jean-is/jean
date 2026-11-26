// SPDX-License-Identifier: MIT
// The pages whose pane is what Jean made, live in Jean's own view (site/creation.js), as jean.is serves them
// (scripts/serve.js --home), in English and French. /websites: the site in Jean's site pane, its links leading on,
// its widths and its looks. /prototypes: its pages on their board, then Try it, a choice carried from page to page,
// and Build it said as what Jean would do. /whiteboards: the board over Tables' own engine, in memory: the notes on
// its shelf sorted when Group them is pressed, Jean's changes waiting, then accepted. /games: the game in its own
// frame, its cover, then the round an arrow starts. /collections: the collection in Tables' own view, Jean's changes
// marked, then accepted, and its board. /documents: the document in its editor, Jean's changes accepted one, then all,
// and words typed. /designs: the design in its view, its gap marked, another take picked. /forms: a collection's own form
// beside its collection, a reply sent in one coming into the other as a row. test/creation.test.js holds what each
// creation's file is.
import { test, expect } from '@playwright/test'

const JEAN_IS = 'http://127.0.0.1:4186/'

test.use({ viewport: { width: 1280, height: 1000 } })

/** The page's creation, in its frame, once the page has scrolled to it; and what went wrong meanwhile. @param {import('@playwright/test').Page} page @param {string} address */
async function shown (page, address) {
  /** @type {string[]} */
  const wrong = []
  // Not Jean's: Playwright's WebKit since build 2370 refuses every <select> a style attribute it doesn't have, on a bare page too
  // (test/csp.spec.js), and a collection's view holds some.
  // Nor is WebKit's word, now and then, that a ResizeObserver loop left notifications undelivered: on Linux, the frame a design's view
  // is first laid out sizes its words and its takes at once, and the takes, less deep, are told in the next (test/documents.spec.js).
  const webkit = page.context().browser()?.browserType().name() === 'webkit'
  const theirs = (/** @type {string} */ text) => webkit && (text.startsWith('Refused to apply a stylesheet because') || text.startsWith('ResizeObserver loop'))
  page.on('console', (message) => { if (message.type() === 'error' && !theirs(message.text())) wrong.push(message.text()) })
  page.on('pageerror', (error) => { if (!theirs(error.message)) wrong.push(error.message) })
  await page.goto(JEAN_IS + address)
  await page.locator('.site-creation').scrollIntoViewIfNeeded()
  return { pane: page.frameLocator('.site-creation'), wrong }
}

for (const [address, request, home, classes, heading, blank] of [
  ['websites', 'A website for my pottery studio', 'Make your first bowl with your own hands', 'Classes', 'Classes and prices', '[your address]'],
  ['fr/sites-web', 'Un site web pour mon atelier de poterie', 'Tournez votre premier bol de vos mains', 'Cours', 'Cours et tarifs', '[votre adresse]'],
]) {
  test(`/${address}: its pane is the site itself, in Jean’s own site pane`, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    await expect(page.locator('.job-sent')).toContainText(request)
    const site = pane.locator('app-site'), live = site.locator('.site-view').frameLocator('iframe')
    // Its first page runs, at a computer's width, the fact its request didn't give left in square brackets.
    await expect(live.getByRole('heading', { level: 1 })).toHaveText(home)
    await expect(live.locator('footer')).toContainText(blank)
    await expect(site).toHaveAttribute('data-width', 'computer')
    // A link leads to its other page, shown here.
    await live.getByRole('link', { name: classes, exact: true }).click()
    await expect(live.getByRole('heading', { level: 1 })).toHaveText(heading)
    // As a phone shows it, and in each of its three looks.
    await site.locator('.site-widths label').first().click()
    await expect(site).toHaveAttribute('data-width', 'phone')
    await site.locator('.site-hand > button').first().click()
    await expect(site.locator('.site-looks input')).toHaveCount(3)
    await site.locator('.site-looks label').nth(1).click()
    await expect(site.locator('.site-looks input').nth(1)).toBeChecked()
    await expect(live.getByRole('heading', { level: 1 })).toHaveText(heading)
    expect(wrong).toEqual([])
  })
}

for (const [address, first, service, next, chosen, build] of [
  ['prototypes', 'Salon Rive', 'Cut and colour', 'Continue', 'Tuesday, 10.30 am', 'Build it'],
  ['fr/prototypes', 'Salon Rive', 'Coupe et couleur', 'Continuer', 'Mardi, 10 h 30', 'Le construire'],
]) {
  test(`/${address}: its pane is the prototype itself: its pages on their board, then Try it`, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    const view = pane.locator('app-prototype'), live = view.locator('.site-view').frameLocator('iframe')
    // All pages: five, a column a step, each running where it lies.
    await expect(view.locator('.proto-board .proto-page')).toHaveCount(5)
    await expect(view.locator('.proto-step')).toHaveCount(4)
    await expect(view.locator('.proto-card').first().frameLocator('iframe').getByRole('heading', { level: 1 })).toHaveText(first)
    // Try it: a service, then a time, and the booking shows both.
    await view.locator('.proto-board .proto-page').first().click()
    await live.getByRole('link', { name: service }).click()
    await live.getByRole('button', { name: next }).click()
    await expect(live.locator('dd').first()).toHaveText(service)
    await expect(live.locator('dd').nth(1)).toHaveText(chosen)
    // Build it asks Jean, which no brain answers here: what Jean would do is said under the view.
    await expect(pane.locator('#said')).toBeHidden()
    await view.getByRole('button', { name: build, exact: true }).click()
    await expect(pane.locator('#said')).toContainText(build)
    expect(wrong).toEqual([])
  })
}

for (const [address, sections, waiting, group, accept] of [
  ['whiteboards', ['Went well', 'To change', 'To try'], 'The café was a hit', 'Group them', 'Accept all'],
  ['fr/tableaux-blancs', ['Réussi', 'À changer', 'À essayer'], 'Le café a eu du succès', 'Les regrouper', 'Tout accepter'],
]) {
  test(`/${address}: its pane is the whiteboard itself, its waiting notes sorted when asked, for the reader to accept`, { tag: '@chromium' }, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    const board = pane.locator('app-whiteboard')
    await expect(board.locator('.wb-area .wb-area-head span[id]')).toHaveText(sections)
    await expect(board.locator('.wb-area .wb-note')).toHaveCount(8)
    await expect(board.locator('.wb-shelf .wb-note')).toHaveCount(5)
    await expect(board.locator('.review')).toHaveCount(0)
    // Group them: Jean's change comes as its own, each note in its section, marked until accepted.
    await board.getByRole('button', { name: group, exact: true }).click()
    await expect(board.locator('.wb-shelf .wb-note')).toHaveCount(0)
    await expect(board.locator('.wb-area .wb-note.is-jean')).toHaveCount(5)
    await expect(board.locator('.wb-area').first().locator('.wb-note.is-jean .wb-words').first()).toHaveText(waiting)
    await expect(pane.locator('#said')).not.toBeEmpty()
    await board.getByRole('button', { name: accept, exact: true }).click()
    await expect(board.locator('.review')).toHaveCount(0)
    await expect(board.locator('.wb-area .wb-note')).toHaveCount(13)
    await expect(board.locator('.wb-note.is-jean')).toHaveCount(0)
    expect(wrong).toEqual([])
  })
}

for (const [address, title, play] of [['games', 'Seven Apples', 'Play'], ['fr/jeux', 'Les pommes de sept', 'Jouer']]) {
  test(`/${address}: its pane is the game itself, in its own frame: a cover to start it, then a round an arrow begins`, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    const game = pane.locator('app-game'), live = game.frameLocator('iframe')
    // Its cover names it, and Play starts it: the frame's own buttons then, and the game's canvas.
    await expect(live.locator('.cover h1')).toHaveText(title)
    // What the game says of its moments reaches the page that frames it, as it reaches Jean.
    await pane.locator('body').evaluate(() => { /** @type {any} */ (window).moments = []; addEventListener('message', ({ data }) => { if (typeof data?.state === 'string') /** @type {any} */ (window).moments.push(data.state) }) })
    await live.getByRole('button', { name: play, exact: true }).click()
    await expect(live.locator('.cover')).toHaveCount(0)
    await expect(live.locator('#stage canvas')).toBeVisible()
    await expect(live.locator('.bar button')).toHaveCount(3)
    // An arrow starts the round.
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => pane.locator('body').evaluate(() => /** @type {any} */ (window).moments)).toEqual(['play'])
    expect(wrong).toEqual([])
  })
}

for (const [address, company, added, accept, board] of [
  ['collections', 'Atelier Nord', 'Atelier Terre', 'Accept all', 'Board'],
  ['fr/collections', 'Atelier Nord', 'Atelier Terre', 'Tout accepter', 'Colonnes'],
]) {
  test(`/${address}: its pane is the collection itself, Jean’s change of three rows marked, for the reader to accept`, { tag: '@chromium' }, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    const table = pane.locator('app-table')
    // Seven rows, the person's six and the one Jean added; three of them hold Jean's changes, which wait.
    await expect(table.locator('.table-grid tbody tr')).toHaveCount(7)
    await expect(table.locator('.table-grid tbody tr').first().locator('input').first()).toHaveValue(company)
    await expect(table.locator('.table-grid tbody tr:has(.is-jean)')).toHaveCount(3)
    await expect(table.locator('.table-grid tbody tr:has(.is-jean)').last().locator('input').first()).toHaveValue(added)
    await expect(table.locator('.review')).toBeVisible()
    // Accepted, nothing is marked any more, and the rows stay.
    await table.getByRole('button', { name: accept, exact: true }).click()
    await expect(table.locator('.review')).toHaveCount(0)
    await expect(table.locator('.is-jean')).toHaveCount(0)
    await expect(table.locator('.table-grid tbody tr')).toHaveCount(7)
    // As a board: a lane for each step of its status.
    await table.locator('.table-bar button').first().click()
    await table.getByRole('button', { name: board, exact: true }).click()
    await expect(table.locator('.table-board')).toBeVisible()
    expect(wrong).toEqual([])
  })
}

for (const [address, title, note, accept, all, added] of [
  ['documents', 'Open day at Atelier Terre', 'A shorter opening', 'Accept', 'Accept all', 'Put up signs from the street'],
  ['fr/documents', 'Portes ouvertes à l’Atelier Terre', 'Une ouverture plus courte', 'Accepter', 'Tout accepter', 'Poser des panneaux depuis la rue'],
]) {
  test(`/${address}: its pane is the document itself, in its editor, Jean’s three changes accepted one, then all`, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    const doc = pane.locator('.document'), text = doc.locator('.ProseMirror')
    await expect(text.locator('h1')).toHaveText(title)
    // Jean's version waits: three changes, each with its words, Before, Accept and Reject.
    await expect(doc.locator('.review')).toBeVisible()
    await expect(doc.getByRole('button', { name: accept, exact: true })).toHaveCount(3)
    await expect(doc).toContainText(note)
    await doc.getByRole('button', { name: accept, exact: true }).first().click()
    await expect(doc.getByRole('button', { name: accept, exact: true })).toHaveCount(2)
    await doc.getByRole('button', { name: all, exact: true }).click()
    await expect(doc.locator('.review')).toHaveCount(0)
    await expect(text).toContainText(added)
    // And it is an editor: what is typed goes in.
    await text.locator('h1').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' 2027')
    await expect(text.locator('h1')).toHaveText(`${title} 2027`)
    expect(wrong).toEqual([])
  })
}

for (const [address, title, gap] of [['designs', 'Open day', '[Address], Lyon'], ['fr/visuels', 'Portes ouvertes', '[Adresse], Lyon']]) {
  test(`/${address}: its pane is the design itself, in its view: its parts, the gap it marks, another take picked`, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    const view = pane.locator('.design')
    // Its page holds each fact as a part, the address the request lacks marked by a dot.
    const sheet = view.locator('.design-stage'), first = sheet.locator('.design-part').first()
    await expect(sheet.locator('.design-part')).toHaveCount(6)
    await expect(sheet).toContainText(title)
    await expect(sheet).toContainText(gap)
    await expect(view.locator('.design-dot')).toHaveCount(1)
    // Takes above it: another picked lays the same words out another way.
    const takes = view.locator('.design-take')
    await expect(takes.nth(2)).toBeVisible()
    await expect(takes.first()).toHaveAttribute('aria-checked', 'true')
    const before = await first.getAttribute('style')
    await takes.nth(1).click()
    await expect(takes.nth(1)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => first.getAttribute('style')).not.toBe(before)
    await expect(sheet).toContainText(title)
    expect(wrong).toEqual([])
  })
}

for (const [address, name, sees, fields, shift, send, sent, online] of [
  ['forms', 'Spring fair volunteers', 'What people see', ['Name', 'Email', 'Note'], 'Afternoon', 'Send', 'Thank you. Your reply was sent.', 'Online, it is sealed in the visitor’s browser'],
  ['fr/formulaires', 'Bénévoles de la kermesse', 'Ce que les gens voient', ['Nom', 'E-mail', 'Remarque'], 'Après-midi', 'Envoyer', 'Merci. Votre réponse a bien été envoyée.', 'En ligne, elle est scellée dans le navigateur du visiteur'],
]) {
  test(`/${address}: its pane is a collection beside its own form, a reply sent in the form coming into the collection as a row`, async ({ page }) => {
    const { pane, wrong } = await shown(page, address)
    const form = pane.getByRole('region', { name: sees }).locator('form'), rows = pane.locator('app-table .table-grid tbody tr')
    // The form as people see it: the collection's name, a field for each column it asks and no other, then Send.
    await expect(form.getByRole('heading', { name })).toBeVisible()
    await expect(form.locator('label[for]:not(.form-pick label), legend')).toHaveCount(4)
    await expect(form.getByRole('radio')).toHaveCount(3)
    await expect(form.getByRole('checkbox')).toHaveCount(1)
    await expect(rows).toHaveCount(4)
    // Nothing is sent without the row's name, which the form always asks.
    await form.getByRole('button', { name: send }).click()
    await expect(rows).toHaveCount(4)
    await expect(pane.locator('#said')).toBeEmpty()
    // Filled in and sent: the reply is a fifth row, each field in its column, and the form is empty again and says so.
    await form.getByLabel(fields[0], { exact: true }).fill('Léa Dubois')
    await form.getByLabel(fields[1], { exact: true }).fill('lea@example.org')
    await form.getByRole('radio', { name: shift }).check()
    await form.getByRole('checkbox').check()
    await form.getByLabel(fields[2], { exact: true }).fill('À samedi !')
    await form.getByRole('button', { name: send }).click()
    await expect(rows).toHaveCount(5)
    await expect(rows.last().locator('input').first()).toHaveValue('Léa Dubois')
    await expect(rows.last()).toContainText(shift)
    await expect(form.getByRole('status')).toHaveText(sent)
    await expect(form.getByLabel(fields[0], { exact: true })).toHaveValue('')
    // And under them, where a reply sent online would wait.
    await expect(pane.locator('#said')).toContainText(online)
    expect(wrong).toEqual([])
  })
}

test('/forms on a phone: the form over its collection, neither cut, nothing wider than the frame', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  const { pane, wrong } = await shown(page, 'forms')
  await expect(pane.locator('.form-seen button')).toBeVisible()
  expect(await pane.locator('.form-pane').evaluate((box) => [box.scrollWidth <= box.clientWidth, getComputedStyle(box).flexDirection])).toEqual([true, 'column'])
  expect(await pane.locator('.form-seen form').evaluate((form) => [...form.querySelectorAll('input, textarea, button')].every((field) => field.getBoundingClientRect().right <= innerWidth && field.getBoundingClientRect().left >= 0))).toBe(true)
  await pane.locator('.form-pane > .view').scrollIntoViewIfNeeded()
  await expect(pane.locator('app-table')).toBeVisible()
  expect(wrong).toEqual([])
})

