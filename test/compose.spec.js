// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a slide's ```table block shows a collection of the project live, its rows as the journal's head
// has them, read again as the slides are drawn again and while it changes; the pane's head lists what each creation uses and what uses it.
// A collection's versions: published by its author, made as its columns change, refused while one would break; slides pinned to one stay
// as they were while slides that read the published one follow it; a document and a site read them too. A recipe a brain carries out, run
// the first time it shows, then by hand, or as its collection changes once its user opts in, each run kept and paid once per version read.
// Each version and each run certified as an answer is; from slides, the chain checked back to the collection's version, in Jean and on the
// check page. A neighbourhood's directory: proposals from its published site's form come in through the collection's port alone, into its
// journal, and show where they meet what the site's own table keeps, no version changing. In Arabic and Japanese too.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { start, connectFakeBrain, ask, answered, SHARE_URL, openTasks } from './helpers.js'

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
  // Its row opens its settings in the menu, whose last row opens the collection.
  await menu.getByRole('button', { name: /Artisans/ }).click()
  await expect(menu.getByRole('button', { name: 'Uses' })).toBeFocused()
  await expect(menu.getByRole('group', { name: 'Which version it shows' }).getByRole('button', { name: 'Live' })).toHaveAttribute('aria-current', 'true')
  await menu.getByRole('button', { name: /Artisans/ }).click()
  // The collection's pane: what uses it.
  await expect(page.locator('app-preview .table-grid')).toBeVisible()
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(page.locator('.menu:popover-open').getByRole('group', { name: 'Used in' })).toContainText('Neighbourhood')
})

test('a chart on a slide follows its collection: a row changed moves its bars at once, in the deck’s colours, the chart the box’s for PowerPoint', async ({ page }) => {
  await start(page)
  await seed(page)
  await page.evaluate(async ({ COLLECTION, DECK }) => {
    const { app } = await import('/ui/state.js')
    await (await import('/caps/skills/decks.js')).rewrite(DECK, `# The neighbourhood\n\n---\n\n## Trades\n\n\`\`\`table\n${COLLECTION}\nchart: bar\nby: Trade\n\`\`\`\n`, 'Neighbourhood', app.projectDir)
  }, { COLLECTION, DECK })
  await open(page)
  const box = page.locator('app-preview app-slides.beside .deck-slide .deck-block:has(> app-chart)').first()
  /** The bars' categories and values as the box's chart, which PowerPoint's writer reads, draws them, in SVG and the deck's colours. */
  const drawn = () => box.evaluate((one) => ((option) => option && { labels: option.xAxis[0].data, values: option.series[0].data, svg: Boolean(one.querySelector('app-chart[svg] svg')),
    coloured: option.color[0] === getComputedStyle(one).getPropertyValue('--deck-series-1').trim() })(/** @type {any} */ (one).chart?.getOption()))
  await expect.poll(drawn).toEqual({ labels: ['Baker'], values: [1], svg: true, coloured: true })
  await change(page, 'Potter')
  await expect.poll(drawn).toEqual({ labels: ['Potter'], values: [1], svg: true, coloured: true })
})

test('a choice keeps the colour its collection gives it on a slide: each bar its choice’s, each cell a pill of it', async ({ page }) => {
  await start(page)
  await seed(page)
  await page.evaluate(async ({ COLLECTION, DECK, ROW }) => {
    const { app } = await import('/ui/state.js'), at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${COLLECTION}/collection.json`, JSON.stringify({ format: 1, id: COLLECTION.slice(12, 38), name: 'Artisans', author: 'user', created: at, changed: at, views: [{ id: 'table', type: 'table' }],
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'trade', name: 'Trade', type: 'select', options: [{ name: 'Baker' }, { name: 'Potter', hue: 4 }] }] }))
    await app.fs.write(`${app.projectDir}/${COLLECTION}/changes.jsonl`, [{ row: ROW, set: { name: 'Ana', trade: 'Baker' }, at, by: 'user' }, { row: `${ROW.slice(0, -1)}B`, set: { name: 'Bea', trade: 'Potter' }, at, by: 'user' }].map((line) => `${JSON.stringify(line)}\n`).join(''))
    await (await import('/caps/skills/decks.js')).rewrite(DECK, `# The neighbourhood\n\n---\n\n## Trades\n\n\`\`\`table\n${COLLECTION}\nchart: bar\nby: Trade\n\`\`\`\n\n---\n\n## Who\n\n\`\`\`table\n${COLLECTION}\n\`\`\`\n`, 'Neighbourhood', app.projectDir)
  }, { COLLECTION, DECK, ROW })
  await open(page)
  const slides = page.locator('app-preview app-slides.beside'), box = slides.locator('.deck-block:has(> app-chart)').first()
  // The colour Tables shows each choice in, as a dot of its view would.
  const hues = await page.evaluate(() => [0, 4].map((hue) => { const dot = document.body.appendChild(Object.assign(document.createElement('i'), { className: 'table-dot' })); dot.dataset.hue = String(hue); const css = getComputedStyle(dot).backgroundColor; dot.remove(); return css }))
  // Each bar's colour, as the pixel it paints, matched to those hues.
  const bars = () => box.evaluate((one, hues) => { const paper = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d', { willReadFrequently: true })), at = (/** @type {string} */ css) => (paper.clearRect(0, 0, 1, 1), paper.fillStyle = css, paper.fillRect(0, 0, 1, 1), [...paper.getImageData(0, 0, 1, 1).data])
    return /** @type {any} */ (one).chart?.getOption().series[0].data.map((/** @type {any} */ bar) => hues.findIndex((hue) => at(hue).every((n, i) => Math.abs(n - at(bar.itemStyle?.color ?? 'transparent')[i]) <= 2))) }, hues)
  await expect.poll(bars).toEqual([0, 1])
  const pills = slides.locator('.deck-table:not(:has(app-chart)) .composed-pill')
  await expect(pills).toHaveText(['Baker', 'Potter'])
  await expect(pills.nth(1)).toHaveAttribute('data-hue', '4')
  await expect(pills.nth(1)).toHaveAttribute('dir', 'auto')
  // Saved as PowerPoint: the chart a native one, each bar in its choice's colour; the table a table.
  await page.locator('app-preview .pane-head .icon-group > [popovertarget^="out-"]').click()
  const [pptx] = await Promise.all([page.waitForEvent('download'), page.locator('.out-menu').getByRole('button', { name: /^PowerPoint/ }).click()])
  const { unzipSync, strFromU8 } = await import('fflate'), parts = unzipSync(await readFile(String(await pptx.path()))), chart = Object.keys(parts).find((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name))
  expect(chart).toBeTruthy()
  expect(strFromU8(parts[String(chart)])).toContain('Potter')
  expect(strFromU8(parts[String(chart)]).match(/<c:dPt>[\s\S]*?<a:srgbClr val="(\w+)"/g)?.map((one) => one.slice(-7, -1).toLowerCase()), 'each bar its choice’s colour').toEqual(await box.evaluate((one) => /** @type {any} */ (one).chart.getOption().series[0].data.map((/** @type {any} */ bar) => bar.itemStyle.color.slice(1))))
  expect(Object.keys(parts).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).some((name) => strFromU8(parts[name]).includes('<a:tbl>'))).toBe(true)
})

test('a slide’s key figures worked out from a collection follow it as it changes; its formula comes back to be edited, and stays in the deck, in PowerPoint the figures', async ({ page }) => {
  await start(page)
  await seed(page)
  const deck = `# The neighbourhood\n\n---\nlayout: metrics\n---\n\n## In figures\n\n- **\`=${COLLECTION} count\`** artisans\n- **\`=${COLLECTION} count where Trade is Baker\`** bakers\n- **\`=${COLLECTION} sum Colour\`** colours\n`
  await page.evaluate(async ({ DECK, deck }) => (await import('/caps/skills/decks.js')).rewrite(DECK, deck, 'Neighbourhood', (await import('/ui/state.js')).app.projectDir), { DECK, deck })
  await open(page)
  const slides = page.locator('app-preview app-slides.beside')
  // While the project's new look waits to be accepted, on the slide it changes, its words can't be typed on: a double click leaves the figure.
  const leads = slides.locator('.deck-slide.is-shown .deck-metric .deck-lead')
  await expect(leads).toHaveText(['1', '1', '—'])
  await leads.first().dblclick()
  await expect(leads.first()).toHaveText('1')
  await slides.getByRole('button', { name: 'Accept' }).click()
  await slides.getByRole('button', { name: 'Next slide' }).click()
  await expect(leads).toHaveText(['1', '1', '—'])
  await expect(leads.nth(2).locator('code'), 'one that names a column the collection hasn’t says why').toHaveAttribute('title', 'Not shown: what it keeps names a column or a value this collection hasn’t.')
  // Changed while it shows: worked out again at once.
  await change(page, 'Potter')
  await expect(leads).toHaveText(['1', '0', '—'])
  // A double click brings the formula back to be edited; Escape shows the figure again.
  await leads.nth(1).dblclick()
  await expect(leads.nth(1)).toHaveText(`=${COLLECTION} count where Trade is Baker`)
  await page.keyboard.press('Escape')
  await expect(leads.nth(1)).toHaveText('0')
  // Kept as it was: the deck still holds the formula, not the figure.
  await leads.nth(1).dblclick()
  await page.keyboard.press('Enter')
  await expect(leads.nth(1)).toHaveText('0')
  expect(await page.evaluate(async (DECK) => (await (await import('/caps/skills/decks.js')).load(DECK, (await import('/ui/state.js')).app.projectDir))?.source, DECK)).toContain(`**\`=${COLLECTION} count where Trade is Baker\`** bakers`)
  await change(page, 'Baker')
  await expect(leads).toHaveText(['1', '1', '—'])
  // The slides use the collection, as the links menu says.
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(page.locator('.menu:popover-open').getByRole('group', { name: 'Uses' }).getByRole('listitem')).toHaveCount(3)
  await page.keyboard.press('Escape')
  // Saved as PowerPoint: the figures, never their formulas.
  await page.locator('app-preview .pane-head .icon-group > [popovertarget^="out-"]').click()
  const [pptx] = await Promise.all([page.waitForEvent('download'), page.locator('.out-menu').getByRole('button', { name: /^PowerPoint/ }).click()])
  const { unzipSync, strFromU8 } = await import('fflate'), parts = unzipSync(await readFile(String(await pptx.path()))), slide = strFromU8(parts['ppt/slides/slide2.xml'])
  expect(slide).toContain('bakers')
  expect(slide).not.toContain('=collections')
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
    await page.keyboard.press('Escape')
    // A figure in a document's sentence, in the sentence's own direction.
    await page.evaluate(async ({ COLLECTION, lang }) => {
      const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')]), at = '2026-11-21T10:00:00.000Z'
      await unlock('documents')
      await app.fs.write(`${app.projectDir}/documents/01K85Z1T00000000000000000M-report.md`, `---\nformat: 1\nname: Report\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# ${lang === 'ar' ? 'تقرير' : '報告'}\n\n${lang === 'ar' ? 'عدد الحرفيين:' : '職人の数：'} \`=${COLLECTION} count\`\n`)
    }, { COLLECTION, lang })
    await show(page, 'documents/01K85Z1T00000000000000000M-report.md', 'Report')
    await expect(page.locator('app-preview app-figure code')).toHaveText(/^[1١]$/)
    await expect(page.locator('app-preview .doc p').filter({ has: page.locator('app-figure') })).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
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
  // Nothing changed since: nothing to publish.
  await expect(versions.getByRole('button', { name: 'Publish version 2' })).toBeDisabled()
  await expect(versions.getByRole('status')).toHaveText('Changes not in a version yet: 0')
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
  await page.locator('.menu:popover-open').getByRole('button', { name: /Artisans/ }).click()
  await page.locator('.menu:popover-open').getByRole('button', { name: 'Published', exact: true }).click()
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
  await page.locator('.menu:popover-open').getByRole('button', { name: /Artisans/ }).click()
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

test('a document’s figure follows its collection, a prototype that shows it is in the graph, and what leaves Jean as words holds what each shows', async ({ page }) => {
  await start(page)
  await seed(page)
  const DOCUMENT = 'documents/01K85Z1T00000000000000000M-report.md'
  await page.evaluate(async ({ COLLECTION, DOCUMENT }) => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')]), at = '2026-11-21T10:00:00.000Z'
    await unlock('documents')
    await app.fs.write(`${app.projectDir}/${DOCUMENT}`, `---\nformat: 1\nname: Report\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# Report\n\nBakers: \`=${COLLECTION} count where Trade is Baker\`.\n\n\`\`\`table\n${COLLECTION}\nfields: Trade\n\`\`\`\n`)
    await app.fs.write(`${app.projectDir}/prototypes/01K85Z1T00000000000000000P-booking/prototype.json`, JSON.stringify({ format: 1, name: 'Booking', author: 'user', created: at, changed: at, source: '', files: ['index.html'] }))
    await app.fs.write(`${app.projectDir}/prototypes/01K85Z1T00000000000000000P-booking/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Booking</title></head><body><main><h1>Who</h1><table data-from="${COLLECTION}" data-fields="Name"></table></main></body></html>`)
  }, { COLLECTION, DOCUMENT })
  await show(page, DOCUMENT, 'Report')
  const figure = page.locator('app-preview app-figure code')
  await expect(figure).toHaveText('1')
  await change(page, 'Potter')
  await expect(figure).toHaveText('0')
  // The caret in it: its formula, which the file keeps.
  await figure.click()
  await expect(page.locator('app-preview .doc code').filter({ hasText: '=collections/' })).toBeVisible()
  // A Word file and a link hold what the document shows, not its references.
  const words = await page.evaluate(async ({ DOCUMENT }) => { const { app } = await import('/ui/state.js'); return (await import('/caps/made/paper.js')).withRows(String(await app.fs.read(`${app.projectDir}/${DOCUMENT}`)), DOCUMENT) }, { DOCUMENT })
  expect(words).toContain('Bakers: 0.')
  expect(words).toContain('| Trade |\n| --- |\n| Potter |')
  expect(words).not.toContain('collections/')
  // The collection's pane lists the prototype among what uses it.
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(page.locator('.menu:popover-open').getByRole('group', { name: 'Used in' }).getByRole('button')).toContainText(['Neighbourhood', 'Report', 'Booking'].map((name) => new RegExp(name)), { ignoreCase: false })
})

test('the graph whole: a collection that relates to another, a picture held by its content, and slides kept from an answer reading its run again', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await seed(page)
  const ORDERS = 'collections/01K85Z1T00000000000000000B-orders', PICTURE = `files/sha256-${'b'.repeat(64)}.png`, KEPT = 'decks/01K85Z1T00000000000000000K-kept.deck.html', TASK = '01K85Z1T00000000000000000T'
  await page.evaluate(async ({ COLLECTION, ORDERS, PICTURE, KEPT, TASK }) => {
    const { app, activeBrain } = await import('/ui/state.js'), at = '2026-11-21T10:00:00.000Z', decks = await import('/caps/skills/decks.js')
    await app.fs.write(`${app.projectDir}/${ORDERS}/collection.json`, JSON.stringify({ format: 1, id: ORDERS.slice(12, 38), name: 'Orders', author: 'user', created: at, changed: at,
      properties: [{ id: 'item', name: 'Item', type: 'text' }, { id: 'maker', name: 'Maker', type: 'relation', collection: COLLECTION }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.writeBytes(`${app.projectDir}/${PICTURE}`, Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)))
    // Slides an answer drew, then kept as a file of their own: their task ran their recipe already.
    const source = `# Kept\n\n---\n\n![Ana](../${PICTURE})\n\n---\n\n\`\`\`table\n${COLLECTION}\nask: Sum it up\n\`\`\`\n`
    await decks.rewrite(KEPT, source, 'Kept', app.projectDir)
    const file = `${app.projectDir}/${KEPT}`
    await app.fs.write(file, String(await app.fs.read(file)).replace('<meta name="author"', `<meta name="source" content="${app.projectDir}/conversations/${TASK}.jsonl"><meta name="author"`))
    const [{ keyOf }, { parseRef }, { headOf }, tables] = await Promise.all([import('/caps/compose/recipes.js'), import('/caps/compose/refs.js'), import('/caps/compose/versions.js'), import('/caps/tables/tables.js')])
    const ref = /** @type {any} */ (parseRef(`${COLLECTION}\nask: Sum it up`)), brain = /** @type {any} */ (activeBrain.peek()), live = /** @type {any} */ (await tables.load(COLLECTION))
    await app.fs.write(`${app.projectDir}/composed/${TASK}.jsonl`, `${JSON.stringify({ format: 1, key: keyOf(ref), n: 1, at, read: headOf(live.lines), brain: `${brain.provider}:${brain.model}`, output: 'From the answer.' })}\n`)
  }, { COLLECTION, ORDERS, PICTURE, KEPT, TASK })
  // A collection that relates to the artisans is among what uses them, by its column; the artisans are among what it uses.
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open')
  await expect(menu.getByRole('group', { name: 'Used in' }).getByRole('button', { name: /Orders/ })).toContainText('Maker')
  await page.keyboard.press('Escape')
  await show(page, ORDERS, 'Orders')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await menu.getByRole('group', { name: 'Uses' }).getByRole('button', { name: /Artisans/ }).click()
  await expect(page.locator('app-preview .pane-head')).toContainText('Artisans')
  // The kept slides show their task's run, made once: nothing run again, nothing kept twice.
  await show(page, KEPT, 'Kept')
  await expect(page.locator('app-preview .deck-slide .deck-table').filter({ hasText: 'From the answer.' })).toHaveCount(1)
  expect(await page.evaluate(async () => { const { app } = await import('/ui/state.js'); return app.fs.read(`${app.projectDir}/composed/01K85Z1T00000000000000000K.jsonl`) })).toBeNull()
  // The picture says what holds it.
  await show(page, PICTURE, 'Ana')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(menu.getByRole('group', { name: 'Used in' }).getByRole('button')).toHaveText([/Kept/])
})

test('the graph answers: what is reached further, what still uses a column or a collection deleted or a kind changed, and the brain’s tool', async ({ page }) => {
  await start(page)
  await seed(page)
  const ORDERS = 'collections/01K85Z1T00000000000000000B-orders', BOOK = 'decks/01K85Z1T00000000000000000O-book.deck.html'
  await page.evaluate(async ({ COLLECTION, ORDERS, BOOK }) => {
    const { app } = await import('/ui/state.js'), at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${ORDERS}/collection.json`, JSON.stringify({ format: 1, id: ORDERS.slice(12, 38), name: 'Orders', author: 'user', created: at, changed: at,
      properties: [{ id: 'item', name: 'Item', type: 'text' }, { id: 'maker', name: 'Maker', type: 'relation', collection: COLLECTION }], views: [{ id: 'table', type: 'table' }] }))
    await (await import('/caps/skills/decks.js')).rewrite(BOOK, `# Book\n\n---\n\n\`\`\`table\n${ORDERS}\nfields: Item\n\`\`\`\n`, 'Book', app.projectDir)
  }, { COLLECTION, ORDERS, BOOK })
  // The slides that show the orders are reached from the artisans, through the orders that relate to them.
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open')
  await expect(menu.getByRole('group', { name: 'Further along' }).getByRole('button')).toHaveText([/Book.*through Orders/])
  await page.keyboard.press('Escape')
  // A column deleted: its Undo says what still reads it; a kind changed: what it changes.
  await page.locator('app-preview .table-grid .table-head').filter({ hasText: 'Trade' }).click()
  await page.locator('.table-menu:popover-open').getByRole('button', { name: 'Delete' }).click()
  const toast = page.locator('.toast', { hasText: 'Column “Trade” deleted. Still used by Neighbourhood.' })
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('app-preview .table-grid .table-head').filter({ hasText: 'Trade' })).toHaveCount(1)
  await retype(page, { type: 'number' })
  await expect(page.locator('.toast', { hasText: '“Trade” has another kind now, which changes what it shows in Neighbourhood.' })).toBeVisible()
  // The brain reads the same graph.
  const said = await page.evaluate(async (COLLECTION) => (await import('/ui/caps.js')).loaded.peek().get('compose')?.tools?.[0].run({ place: COLLECTION }, /** @type {any} */ ({})), COLLECTION)
  expect(said).toContain(`Artisans (${COLLECTION}) is used in: `)
  expect(said).toContain(`Neighbourhood (${DECK}), reading it as it is now`)
  expect(said).toContain(`Orders (${ORDERS}), by its column Maker`)
  expect(said).toContain(`Further: Book (${BOOK}) through Orders.`)
  // A collection deleted from Creations: its Undo says what still uses it.
  const tasks = await openTasks(page)
  await tasks.getByRole('button', { name: 'Creations', exact: true }).click()
  const card = page.locator('app-creations .creation').filter({ has: page.locator('.creation-open', { hasText: /^Orders$/ }) })
  await card.hover()
  await card.getByRole('button', { name: 'More options' }).click()
  await page.locator('app-creations .task-menu:popover-open').getByRole('button', { name: 'Delete' }).click()
  await page.locator('.toast', { hasText: '“Orders” deleted. Still used by Book.' }).getByRole('button', { name: 'Undo' }).click()
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
  await menu.getByRole('button', { name: /Neighbours/ }).click()
  await menu.getByRole('button', { name: 'Update now' }).click()
  await expect(slide).toHaveText('Summary: Ana, Bob.')
  await expect(menu.getByRole('status').filter({ hasText: /^Updated / })).toHaveCount(1)
  await expect(menu.getByRole('status').filter({ hasText: 'Certified, from the collection’s rows as they were then' })).toHaveCount(1)
  await menu.getByRole('button', { name: 'Update now' }).click()
  await page.waitForTimeout(300)
  expect((await runs()).map((run) => run.n)).toEqual([1, 2])
  // Its user turns on updates as the collection changes: written into the slides, and Cy approved shows by itself.
  await menu.getByRole('group', { name: 'When it updates' }).getByRole('button', { name: 'As the collection changes' }).click()
  await expect.poll(() => page.evaluate(async (SUMMARY) => (await (await import('/caps/skills/decks.js')).load(SUMMARY))?.source, SUMMARY)).toContain('refresh: auto')
  await page.keyboard.press('Escape')
  await page.evaluate(async ({ HERE, row }) => {
    const tables = await import('/caps/tables/tables.js'), one = await tables.load(HERE)
    if (one) await tables.change(one, [{ row, set: { name: 'Cy', approved: true } }], 'user')
  }, { HERE, row: rows[2] })
  await expect(slide).toHaveText('Summary: Ana, Bob, Cy.', { timeout: 8000 })
  expect((await runs()).map((run) => run.n)).toEqual([1, 2, 3])
})

test('from slides, their provenance is checked back to the collection’s version, in Jean and on the check page, which says when a link was changed', async ({ page, browser, baseURL }) => {
  await start(page)
  await connectFakeBrain(page)
  const SUMMARY = 'decks/01K85Z1T00000000000000000Q-proof.deck.html', HERE = 'collections/01K85Z1T00000000000000000P-makers', ROW = '01K8000000000000000000000P'
  await page.evaluate(async ({ SUMMARY, HERE, ROW }) => {
    const [{ unlock }, { app }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await Promise.all([unlock('tables'), unlock('skills'), unlock('slides')])
    const at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${HERE}/collection.json`, JSON.stringify({ format: 1, id: HERE.slice(12, 38), name: 'Makers', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'approved', name: 'Approved', type: 'checkbox' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${HERE}/changes.jsonl`, `${JSON.stringify({ row: ROW, set: { name: 'Ana', approved: true }, at, by: 'user' })}\n`)
    await (await import('/caps/compose/compose.js')).publish(HERE)
    await (await import('/caps/skills/decks.js')).rewrite(SUMMARY, `# Makers\n\n\`\`\`table\n${HERE}@published\nwhere: Approved is yes\nask: Sum them up\n\`\`\`\n\n---\n\n\`\`\`table\n${HERE}@1\n\`\`\`\n\n---\n\n\`\`\`table\n${HERE}\n\`\`\`\n`, 'Proof', app.projectDir)
  }, { SUMMARY, HERE, ROW })
  await show(page, SUMMARY, 'Proof')
  await expect(page.locator('app-preview .deck-slide .deck-table > div').first()).toHaveText('Summary: Ana.')
  // In Jean: the run, and the version it read, certified; the pinned version on its own; the rows as they are, none.
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open'), uses = menu.getByRole('group', { name: 'Uses' }).getByRole('listitem')
  await expect(uses).toHaveCount(3)
  // Each one's settings say it, Back between them.
  await uses.nth(1).getByRole('button').click()
  await expect(menu.getByRole('status').last()).toHaveText('Certified, back to version 1 of the collection')
  await menu.getByRole('button', { name: 'Uses' }).click()
  await uses.nth(2).getByRole('button').click()
  await expect(menu).toContainText('The rows as they are now: no version, so no certificate')
  await menu.getByRole('button', { name: 'Uses' }).click()
  await uses.nth(0).getByRole('button').click()
  await expect(menu.getByRole('status').last()).toHaveText('Certified, back to version 1 of the collection')
  const [download] = await Promise.all([page.waitForEvent('download'), menu.getByRole('button', { name: 'Save its provenance' }).click()])
  expect(download.suggestedFilename()).toBe('Provenance of Proof.json')
  const chain = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(chain).toHaveLength(2)
  expect(JSON.parse(Buffer.from(chain[0].payload, 'base64url').toString()).type).toEqual(['VerifiableCredential', 'CreationVersion'])
  // On the check page: the run's seal, then what it was made from, back to the collection's version.
  const context = await browser.newContext({ baseURL }), checker = await context.newPage()
  await checker.goto('check')
  const input = checker.locator('input[type="file"]'), file = (/** @type {unknown} */ value) => ({ name: 'Provenance of Proof.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) })
  await input.setInputFiles([file(chain)])
  await expect(checker.locator('.receipt-verdict')).toHaveText('Sealed, and unchanged since')
  await expect(checker.locator('.receipt-checked dl')).toContainText('Made from')
  await expect(checker.locator('.receipt-checked dl')).toContainText('Version 1 of a collection, sealed and unchanged since')
  // The version's certificate changed: the run still holds, the link it names doesn't.
  const says = JSON.parse(Buffer.from(chain[1].payload, 'base64url').toString())
  says.credentialSubject.version = 2
  await input.setInputFiles([file([chain[0], { ...chain[1], payload: Buffer.from(JSON.stringify(says)).toString('base64url') }])])
  await expect(checker.locator('.receipt-checked dl')).toContainText('Version 1 of a collection, changed or not sealed by the key it names')
  await input.setInputFiles([file([chain[0]])])
  await expect(checker.locator('.receipt-checked dl')).toContainText('Version 1 of a collection, whose certificate wasn’t given')
  await context.close()
})

test('a neighbourhood’s directory takes a proposal from its published site through its port, and the site shows it once it meets the site’s own criteria, no published version changing', async ({ page, context, browserName }) => {
  test.setTimeout(120_000)
  const name = `artisans-${browserName}-${test.info().retry}-${test.info().repeatEachIndex}`, address = `http://${name}.localhost:4185/`, HERE = 'collections/01K85Z1T00000000000000000T-artisans'
  await start(page)
  await connectFakeBrain(page)
  await page.evaluate(async ({ HERE, host }) => {
    const [{ unlock }, { app, updateSettings }] = await Promise.all([import('/ui/caps.js'), import('/ui/state.js')])
    await updateSettings({ urls: { ...app.settings.value.urls, share: host } })
    await Promise.all([unlock('tables'), unlock('share')])
    const at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${HERE}/collection.json`, JSON.stringify({ format: 1, id: HERE.slice(12, 38), name: 'Artisans', author: 'user', created: at, changed: at,
      properties: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'trade', name: 'Trade', type: 'text' }, { id: 'approved', name: 'Approved', type: 'checkbox' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${HERE}/changes.jsonl`, `${JSON.stringify({ row: '01K8000000000000000000000T', set: { name: 'Ana', trade: 'Baker', approved: true }, at, by: 'user' })}\n`)
    await (await import('/caps/compose/compose.js')).publish(HERE)
  }, { HERE, host: SHARE_URL })
  const version = () => page.evaluate(async (HERE) => { const { app } = await import('/ui/state.js'); return [(await app.fs.list(`${app.projectDir}/${HERE}/versions`)).length, await app.fs.read(`${app.projectDir}/${HERE}/versions/1.json`)] }, HERE)
  const before = await version()
  // Its owner opens its port, from Share's Collect replies: a form fills Name and Trade, not the box, which the collection keeps to itself.
  await show(page, HERE, 'Artisans')
  await page.locator('app-preview .pane-head .icon-group > [popovertarget^="out-"]').click()
  await page.locator('app-preview .out-menu').getByRole('button', { name: /^Share/ }).click()
  const share = page.locator('app-share-dialog dialog[open]')
  await share.getByRole('tab', { name: 'Collect replies' }).click()
  await share.getByRole('switch', { name: 'Accept proposals from a site' }).check()
  await expect(share.locator('.collect-port [role="status"]')).toHaveText('A site’s form can fill Name and Trade.')
  await share.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  // Its site: the artisans its table keeps by its own criteria, Approved ticked, and a form that proposes one, which also tries to tick that box.
  const form = `<h1>Artisans of the neighbourhood</h1><table data-from="${HERE}" data-fields="Name | Trade" data-where="Approved is yes"></table><h2>Propose one</h2>`
    + `<form method="post" data-form="propose" data-to="${HERE}"><label for="who">Name</label><input id="who" name="who" required><label for="what">Trade</label><input id="what" name="what" required>`
    + '<input type="hidden" name="approved" value="yes"><button>Propose</button><p>We read each proposal before it shows here.</p><p data-sent hidden>Thank you: it shows once read.</p><p data-unsent hidden>It didn’t go. Write to us instead.</p></form>'
  const html = /* html */ `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Artisans · Our street</title><meta name="description" content="The artisans of our street, and a form to propose one."><link rel="stylesheet" href="look.css"></head><body><header><a href="index.html">Our street</a></header><main>${form}</main><footer><p>Our street</p></footer></body></html>`
  await ask(page, 'Call skill with {"name":"site"}')
  await answered(page, 1)
  await ask(page, `Call site with ${JSON.stringify({ name: 'Directory', files: [{ path: 'index.html', text: html }] })}`)
  await expect(page.locator('.msg-jean .prose')).toHaveCount(2, { timeout: 60_000 })
  await answered(page, 2)
  const site = page.frameLocator('app-preview app-site iframe')
  await expect(site.locator('tbody td')).toHaveText(['Ana', 'Baker'])
  // Published.
  const pane = page.locator('app-preview:has(app-site)'), dialog = page.locator('dialog.site-publish')
  const publishing = async () => {
    await pane.getByRole('button', { name: 'Share or download' }).click()
    await page.getByRole('button', { name: 'Publish…' }).click()
    await expect(dialog).toBeVisible()
  }
  await publishing()
  await dialog.getByLabel('Address').fill(name)
  await expect(dialog.locator('#publish-said')).toHaveText('This address is free.')
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
  await dialog.getByLabel('I’ve kept it somewhere safe').check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  // A neighbour proposes a potter.
  const visit = await context.newPage()
  await visit.goto(address)
  await expect(visit.locator('tbody td')).toHaveText(['Ana', 'Baker'])
  await visit.getByLabel('Name').fill('Bob')
  await visit.getByLabel('Trade').fill('Potter')
  await visit.getByRole('button', { name: 'Propose' }).click()
  await expect(visit.getByRole('status')).toHaveText('Thank you: it shows once read.')
  // Collected into the directory itself, through its port: a visitor's row, the box left alone, in no collection of its own; the site's table doesn't keep it yet.
  await publishing()
  await expect(page.locator('.toast')).toContainText('1 new reply to Directory.')
  await dialog.locator('.dialog-head').getByRole('button', { name: 'Close' }).click()
  const rows = () => page.evaluate(async (HERE) => {
    const tables = await import('/caps/tables/tables.js'), one = await tables.load(HERE)
    return { all: (await tables.collections()).length, rows: one?.rows.map((row) => [row.cells.name, row.cells.trade, row.cells.approved ?? null, row.created.by]) }
  }, HERE)
  expect(await rows()).toEqual({ all: 1, rows: [['Ana', 'Baker', true, 'user'], ['Bob', 'Potter', null, 'visitor']] })
  await show(page, (await page.evaluate(async () => { const { app } = await import('/ui/state.js'); return `sites/${(await app.fs.list(`${app.projectDir}/sites`))[0].name}` })), 'Directory')
  await expect(site.locator('tbody td')).toHaveText(['Ana', 'Baker'])
  // Its owner ticks the box the site keeps rows by: the site shows it, here and once published again; no version changed.
  await page.evaluate(async (HERE) => {
    const tables = await import('/caps/tables/tables.js'), one = await tables.load(HERE), bob = one?.rows.find((row) => row.cells.name === 'Bob')
    if (one && bob) await tables.change(one, [{ row: bob.id, set: { approved: true } }], 'user')
  }, HERE)
  await show(page, (await page.evaluate(async () => { const { app } = await import('/ui/state.js'); return `sites/${(await app.fs.list(`${app.projectDir}/sites`))[0].name}` })), 'Directory')
  await expect(site.locator('tbody td')).toHaveText(['Ana', 'Baker', 'Bob', 'Potter'])
  await publishing()
  await expect(dialog).toContainText('1 file changed since it was published.')
  await dialog.getByRole('button', { name: 'Publish again' }).click()
  await expect(dialog).toContainText('Nothing changed since it was published.')
  // Asked again past the browser's cache, which keeps the page first served.
  await visit.goto(`${address}?again`)
  await expect(visit.locator('tbody td')).toHaveText(['Ana', 'Baker', 'Bob', 'Potter'])
  expect(await version()).toEqual(before)
  // The site's own file keeps its table empty: the rows are the collection's, filled as the site is read.
  expect(await page.evaluate(async () => { const { app } = await import('/ui/state.js'), site = (await app.fs.list(`${app.projectDir}/sites`))[0].name; return String(await app.fs.read(`${app.projectDir}/sites/${site}/index.html`)) })).toMatch(/data-where="Approved is yes"><\/table>/)
})
