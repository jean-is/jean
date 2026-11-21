// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D762): a slide's ```table block shows a collection of the project live, its rows as the journal's head
// has them, read again as the slides are drawn again and while it changes; the pane's head lists what each creation uses and what uses it.
// A collection's versions: published by its author, made as its columns change, refused while one would break; slides pinned to one stay
// as they were while slides that read the published one follow it; a document and a site read them too. A recipe a brain carries out, run
// the first time it shows, then by hand, or as its collection changes once its user opts in, each run kept and paid once per version read.
// In Arabic and Japanese too.
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain } from './helpers.js'

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

/** Slides that read the collection's version `at`, by their name. @param {import('@playwright/test').Page} page @param {string} name @param {string} at */
const slides = (page, name, at) => page.evaluate(async ({ COLLECTION, name, at }) => {
  const { app } = await import('/ui/state.js'), path = `decks/01K85Z1T00000000000000000${name[0]}-${name.toLowerCase()}.deck.html`
  await (await import('/caps/skills/decks.js')).rewrite(path, `# ${name}\n\n---\n\n## Who makes what\n\n\`\`\`table\n${COLLECTION}${at}\n\`\`\`\n`, name, app.projectDir)
  return path
}, { COLLECTION, name, at })
/** Something opened beside the task, again. @param {import('@playwright/test').Page} page @param {string} uri @param {string} name */
const show = (page, uri, name) => page.evaluate(async ({ uri, name }) => {
  const { preview, unshow } = await import('/ui/preview.js')
  unshow(uri)
  await new Promise((resolve) => setTimeout(resolve, 50))
  preview({ uri, name, title: name, mimeType: uri.endsWith('.md') ? 'text/markdown' : 'text/html' })
}, { uri, name })
/** The collection's columns written as Tables would after a change of its columns. @param {import('@playwright/test').Page} page @param {object} trade */
const retype = (page, trade) => page.evaluate(async ({ COLLECTION, trade }) => {
  const { app } = await import('/ui/state.js'), at = `${app.projectDir}/${COLLECTION}/collection.json`, table = JSON.parse(String(await app.fs.read(at)))
  table.properties = table.properties.map((/** @type {any} */ p) => (p.id === 'trade' ? { ...p, ...trade } : p))
  await app.fs.write(at, JSON.stringify(table))
}, { COLLECTION, trade })

test('slides pinned to version 1 stay as they were once version 2 is published, while slides that read the published one follow it; a document and a site read them too', async ({ page }) => {
  await start(page)
  await seed(page)
  const [pinned, published] = [await slides(page, 'Pinned', '@1'), await slides(page, 'Published', '@published')]
  const cells = page.locator('app-preview .deck-slide .deck-table')
  await show(page, published, 'Published')
  await expect(cells.locator('p').first()).toHaveText('This collection has no version yet.')
  // Version 1, published from the collection's pane.
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open'), versions = menu.getByRole('group', { name: 'Versions' })
  await expect(versions.getByRole('status')).toHaveText('Changes not in a version yet: 1')
  await versions.getByRole('button', { name: 'Publish version 1' }).click()
  await expect(page.locator('.toast').last()).toContainText('Version 1 published.')
  // A row changed is no version: version 2 is published from the code a press runs.
  await change(page, 'Potter')
  expect(await page.evaluate(async (COLLECTION) => (await (await import('/caps/compose/compose.js')).publish(COLLECTION))?.version?.n, COLLECTION)).toBe(2)
  await show(page, pinned, 'Pinned')
  await expect(cells.locator('tbody td').first()).toHaveText('Ana')
  await expect(cells.locator('tbody td').nth(1)).toHaveText('Baker')
  await show(page, published, 'Published')
  await expect(cells.locator('tbody td').nth(1)).toHaveText('Potter')
  // The pinned slides, told to read the published version from their pane's head: written so, they follow it.
  await show(page, pinned, 'Pinned')
  await expect(cells.locator('tbody td').nth(1)).toHaveText('Baker')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await page.locator('.menu:popover-open').getByTitle('Which version it shows').selectOption('published')
  await expect.poll(() => page.evaluate(async (pinned) => (await (await import('/caps/skills/decks.js')).load(pinned))?.source, pinned)).toContain('-artisans@published')
  // A document pinned to version 1, and a site that reads the published one.
  await page.evaluate(async ({ COLLECTION }) => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')]), at = '2026-11-21T10:00:00.000Z'
    await Promise.all([unlock('documents'), unlock('sites')])
    await app.fs.write(`${app.projectDir}/documents/01K85Z1T00000000000000000N-notes.md`, `---\nformat: 1\nname: Notes\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# Notes\n\n\`\`\`table\n${COLLECTION}@1\nfields: Trade\n\`\`\`\n`)
    await app.fs.write(`${app.projectDir}/sites/01K85Z1T00000000000000000S-directory/site.json`, JSON.stringify({ format: 1, name: 'Directory', author: 'user', created: at, changed: at, source: '', files: ['index.html'] }))
    await app.fs.write(`${app.projectDir}/sites/01K85Z1T00000000000000000S-directory/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Directory</title></head><body><main><h1>Directory</h1><table data-from="${COLLECTION}@published" data-fields="Name | Trade"></table></main></body></html>`)
  }, { COLLECTION })
  await show(page, 'documents/01K85Z1T00000000000000000N-notes.md', 'Notes')
  await expect(page.locator('app-preview app-composed tbody td')).toHaveText('Baker')
  await show(page, 'sites/01K85Z1T00000000000000000S-directory', 'Directory')
  await expect(page.frameLocator('app-preview app-site iframe').locator('tbody td')).toHaveText(['Ana', 'Potter'])
  // Its columns changed: a version of its own, its old name still read and said; a kind whose values read otherwise: none, and why.
  await retype(page, { name: 'Craft' })
  await show(page, COLLECTION, 'Artisans')
  await expect.poll(() => page.evaluate(async ({ COLLECTION }) => { const { app } = await import('/ui/state.js'); return (await app.fs.list(`${app.projectDir}/${COLLECTION}/versions`)).length }, { COLLECTION })).toBe(3)
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(page.locator('.menu:popover-open').getByRole('group', { name: 'Versions' })).toContainText(/Version 3, .*, as its columns changed/)
  await page.keyboard.press('Escape')
  await show(page, 'documents/01K85Z1T00000000000000000N-notes.md', 'Notes')
  await expect(page.locator('app-preview app-composed th')).toHaveText('Trade')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(page.locator('.menu:popover-open')).toContainText('“Trade” is now “Craft”')
  await page.keyboard.press('Escape')
  await retype(page, { type: 'number' })
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const now = page.locator('.menu:popover-open').getByRole('group', { name: 'Versions' })
  await expect(now.getByRole('alert')).toHaveText('No version can be made while these columns have another kind: Craft. Give them back their kind, or add new columns.')
  await expect(now.getByRole('button', { name: 'Publish version 4' })).toBeDisabled()
  expect(await page.evaluate(async ({ COLLECTION }) => { const { app } = await import('/ui/state.js'); return (await app.fs.list(`${app.projectDir}/${COLLECTION}/versions`)).length }, { COLLECTION })).toBe(3)
})

test('a recipe that sums up the approved artisans on a slide updates by itself once its user turns that on, and only then; a run is paid once per version read', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  const SUMMARY = 'decks/01K85Z1T00000000000000000R-summary.deck.html', HERE = 'collections/01K85Z1T00000000000000000H-neighbours', rows = ['01K8000000000000000000000H', '01K8000000000000000000000J', '01K8000000000000000000000K']
  await page.evaluate(async ({ SUMMARY, HERE, rows }) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await Promise.all([unlock('tables'), unlock('skills'), unlock('slides')])
    const at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${HERE}/collection.json`, JSON.stringify({ format: 1, id: HERE.slice(12, 38), name: 'Neighbours', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'approved', name: 'Approved', type: 'checkbox' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${HERE}/changes.jsonl`, [['Ana', true], ['Bob', false]].map(([name, approved], i) => `${JSON.stringify({ row: rows[i], set: { name, approved }, at, by: 'user' })}\n`).join(''))
    await (await import('/caps/skills/decks.js')).rewrite(SUMMARY, `# Neighbours\n\n\`\`\`table\n${HERE}\nwhere: Approved is yes\nask: Sum up the approved artisans of the neighbourhood in one slide\n\`\`\`\n`, 'Summary', app.projectDir)
  }, { SUMMARY, HERE, rows })
  /** The runs the slides keep, by number. */
  const runs = () => page.evaluate(async () => { const { app } = await import('/ui/state.js'); return ((await app.fs.read(`${app.projectDir}/composed/01K85Z1T00000000000000000R.jsonl`)) ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line)) })
  const set = (/** @type {number} */ i, /** @type {object} */ cells) => page.evaluate(async ({ HERE, row, cells }) => {
    const tables = await import('/caps/tables/tables.js'), one = await tables.load(HERE)
    if (one) await tables.change(one, [{ row, set: cells }], 'user')
  }, { HERE, row: rows[i], cells })
  await show(page, SUMMARY, 'Summary')
  const slide = page.locator('app-preview .deck-slide .deck-table > div').first()
  // Run the first time it shows: once.
  await expect(slide).toHaveText('Summary: Ana.')
  expect((await runs()).map((run) => [run.n, run.read.length > 0, run.brain.includes(':')])).toEqual([[1, true, true]])
  // By hand, its default: Bob approved changes nothing on show, and nothing is run.
  await set(1, { approved: true })
  await page.waitForTimeout(2600)
  await show(page, SUMMARY, 'Summary')
  await expect(slide).toHaveText('Summary: Ana.')
  expect(await runs()).toHaveLength(1)
  // Update now runs it on the rows as they are; pressed again with nothing changed, it reads that run again, unpaid.
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open')
  await menu.getByRole('button', { name: 'Update now' }).click()
  await expect(slide).toHaveText('Summary: Ana, Bob.')
  await expect(menu.getByRole('status').last()).toContainText('Updated')
  await menu.getByRole('button', { name: 'Update now' }).click()
  await page.waitForTimeout(300)
  expect((await runs()).map((run) => run.n)).toEqual([1, 2])
  // Its user turns on updates as the collection changes: written into the slides, and Cy approved shows by itself.
  await menu.getByTitle('When it updates').selectOption('auto')
  await expect.poll(() => page.evaluate(async (SUMMARY) => (await (await import('/caps/skills/decks.js')).load(SUMMARY))?.source, SUMMARY)).toContain('refresh: auto')
  await page.keyboard.press('Escape')
  await page.evaluate(async ({ HERE, row }) => {
    const tables = await import('/caps/tables/tables.js'), one = await tables.load(HERE)
    if (one) await tables.change(one, [{ row, set: { name: 'Cy', approved: true } }], 'user')
  }, { HERE, row: rows[2] })
  await expect(slide).toHaveText('Summary: Ana, Bob, Cy.', { timeout: 8000 })
  expect((await runs()).map((run) => run.n)).toEqual([1, 2, 3])
})
