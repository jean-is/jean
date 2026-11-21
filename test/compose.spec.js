// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a slide's ```table block shows a collection of the project live, its rows as the journal's head
// has them, read again as the slides are drawn again and while it changes; the pane's head lists what each creation uses and what uses it.
// In Arabic and Japanese too.
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

const COLLECTION = 'collections/01K85Z1T00000000000000000A-artisans', DECK = 'decks/01K85Z1T00000000000000000D-neighbourhood.deck.html', ROW = '01K8000000000000000000000A'

/** A collection of artisans and slides that show it, and one block naming a collection the project hasn't. @param {import('@playwright/test').Page} page */
async function seed(page) {
  await page.evaluate(async ({ COLLECTION, DECK, ROW }) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await Promise.all([unlock('tables'), unlock('skills'), unlock('slides')])
    const at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${COLLECTION}/collection.json`, JSON.stringify({ format: 1, id: COLLECTION.slice(12, 38), name: 'Artisans', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'trade', name: 'Trade', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${COLLECTION}/changes.jsonl`, `${JSON.stringify({ row: ROW, set: { name: 'Ana', trade: 'Baker' }, at, by: 'user' })}\n`)
    const markdown = `# The neighbourhood\n\n---\n\n## Who makes what\n\n\`\`\`table\n${COLLECTION}\n\`\`\`\n\n---\n\n## Elsewhere\n\n\`\`\`table\ncollections/01K85Z1T00000000000000000Z-gone\n\`\`\`\n`
    await (await import('/caps/skills/decks.js')).rewrite(DECK, markdown, 'Neighbourhood', app.projectDir)
  }, { COLLECTION, DECK, ROW })
}

/** The slides opened beside the task, again: the pane closed first, so they are drawn anew. @param {import('@playwright/test').Page} page */
const open = (page) => page.evaluate(async (DECK) => {
  const { preview, unshow } = await import('/ui/preview.js')
  unshow(DECK)
  await new Promise((resolve) => setTimeout(resolve, 50))
  preview({ uri: DECK, name: 'Neighbourhood', title: 'Neighbourhood', mimeType: 'text/html' })
}, DECK)

/** A row of the collection changed as the user changes it. @param {import('@playwright/test').Page} page @param {string} trade */
const change = (page, trade) => page.evaluate(async ({ COLLECTION, ROW, trade }) => {
  const tables = await import('/caps/tables/tables.js'), one = await tables.load(COLLECTION)
  if (one) await tables.change(one, [{ row: ROW, set: { trade } }], 'user')
}, { COLLECTION, ROW, trade })

test('a slide shows a collection live: a row changed shows changed, at once and once the slides are drawn again; the pane’s head says who uses whom', async ({ page }) => {
  await start(page)
  await seed(page)
  await open(page)
  const beside = page.locator('app-preview app-slides.beside'), table = beside.locator('.deck-slide .deck-table table').first()
  await expect(table.locator('thead th')).toHaveText(['Name', 'Trade'])
  await expect(table.locator('tbody td')).toHaveText(['Ana', 'Baker'])
  await expect(table.locator('td').first()).toHaveAttribute('dir', 'auto')
  // A block naming a collection the project hasn't says so, in words.
  await expect(beside.locator('.deck-slide .deck-table p').first()).toHaveText('This project has no such collection.')
  // Changed while the slides show: drawn again at once.
  await change(page, 'Potter')
  await expect(table.locator('tbody td')).toHaveText(['Ana', 'Potter'])
  // Changed while they are closed: read again as they open.
  await page.evaluate(async (DECK) => (await import('/ui/preview.js')).unshow(DECK), DECK)
  await change(page, 'Weaver')
  await open(page)
  await expect(beside.locator('.deck-slide .deck-table table').first().locator('tbody td')).toHaveText(['Ana', 'Weaver'])
  // The slides' pane: what they use, live, which opens it.
  const links = page.getByRole('button', { name: 'Links with other creations' })
  await links.click()
  const menu = page.locator('.menu:popover-open')
  await expect(menu.getByRole('group', { name: 'Uses' })).toContainText('Artisans')
  await expect(menu.getByRole('group', { name: 'Uses' })).toContainText('Live')
  await expect(menu.getByRole('group', { name: 'Uses' }).getByRole('listitem'), 'a collection the project hasn’t isn’t listed').toHaveCount(1)
  await expect(menu.getByRole('group', { name: 'Used in' })).toHaveCount(0)
  await menu.getByRole('button', { name: /Artisans/ }).click()
  // The collection's pane: what uses it.
  await expect(page.locator('app-preview .table-grid')).toBeVisible()
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(page.locator('.menu:popover-open').getByRole('group', { name: 'Used in' })).toContainText('Neighbourhood')
})

for (const [lang, live, missing] of [['ar', 'مباشر', 'لا توجد مجموعة كهذه في هذا المشروع.'], ['ja', '最新', 'このプロジェクトにはそのコレクションがありません。']]) {
  test(`a slide shows a collection, and the pane says who it uses, in ${lang}`, async ({ page }) => {
    await start(page, lang)
    await seed(page)
    await open(page)
    const beside = page.locator('app-preview app-slides.beside')
    await expect(beside.locator('.deck-slide .deck-table tbody td').first()).toHaveText('Ana')
    await expect(beside.locator('.deck-slide .deck-table p').first()).toHaveText(missing)
    await page.locator('app-preview .pane-head button[popovertarget^="links-"]').click()
    await expect(page.locator('.menu:popover-open')).toContainText(live)
  })
}
