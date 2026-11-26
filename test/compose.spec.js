// SPDX-License-Identifier: MIT
// Composition (docs/composition.md, D763): a slide's ```table block shows a collection of the project live, its rows as the journal's head
// has them, read again as the slides are drawn again and while it changes; the pane's head lists what each creation uses and what uses it.
// A collection's versions: published by its author, made as its columns change, refused while one would break; slides pinned to one stay
// as they were while slides that read the published one follow it; a document and a site read them too. A recipe a brain carries out, run
// the first time it shows, then by hand, or as its collection changes once its user opts in, each run kept and paid once per version read.
// Each version and each run certified as an answer is; from slides, the chain checked back to the collection's version, in Jean and on the
// check page. A neighbourhood's directory: proposals from its published site's form come in through the collection's port alone, into its
// journal, and show where they meet what the site's own table keeps, no version changing. In Arabic and Japanese too.
import { readFile } from 'node:fs/promises'
import { test, expect, start, connectFakeBrain, ask, answered, SHARE_URL, openTasks, BRAIN_URL } from './helpers.js'

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

for (const [lang, live, missing, since] of [['ar', 'مباشر', 'لا توجد مجموعة كهذه في هذا المشروع.', 'التغييرات منذ هذه الإجابة'], ['ja', '最新', 'このプロジェクトにはそのコレクションがありません。', 'この回答の後の変更']]) {
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
    // An answer's block as the collection was, and what changed since, in the user's words.
    const path = await page.evaluate(async ({ COLLECTION }) => {
      const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
      const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
      await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: '—' }), userRecord('?', app.deviceId), envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `\`\`\`table\n${COLLECTION}\n\`\`\`\n` } }, 0)])
      await refreshConversations()
      return path
    }, { COLLECTION })
    await page.waitForTimeout(20)
    await change(page, 'Potter')
    await page.evaluate(async (path) => (await import('/ui/state.js')).openConversation(path), path)
    const answer = page.locator('article.msg-jean').last()
    await expect(answer.locator('app-composed tbody td').nth(1)).toHaveText('Baker')
    await expect(answer.locator('.composed-since')).toContainText(since)
    // A document's section found by its heading's words in the language's own script, its id written after them in it.
    const [title, words] = lang === 'ar' ? ['الأسعار', 'عشرة يوروهات.'] : ['料金', '十ユーロです。'], HELP = 'documents/01K85Z1T00000000000000000E-help.md', SLIDES = 'decks/01K85Z1T00000000000000000F-prices.deck.html'
    await page.evaluate(async ({ HELP, SLIDES, title, words }) => {
      const { app } = await import('/ui/state.js')
      await app.fs.write(`${app.projectDir}/${HELP}`, `---\nformat: 1\nname: Help\nauthor: user\ncreated: 2026-11-21T10:00:00.000Z\nchanged: 2026-11-21T10:00:00.000Z\n---\n# Help\n\n## ${title}\n\n${words}\n`)
      await (await import('/caps/skills/decks.js')).rewrite(SLIDES, `# ${title}\n\n---\n\n\`\`\`section\n${HELP}#${title}\n\`\`\`\n`, title, app.projectDir)
    }, { HELP, SLIDES, title, words })
    await show(page, SLIDES, title)
    await expect(page.locator('app-preview .deck-slide .composed-section').first()).toContainText(words)
    await expect.poll(() => page.evaluate(async (HELP) => String(await (await import('/ui/state.js')).app.fs.read(`${(await import('/ui/state.js')).app.projectDir}/${HELP}`)), HELP)).toContain(`## ${title} {#${title}}`)
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
  // The menu is drawn again as its links are read: opened, then its row pressed, until the artisans are on show.
  await expect(async () => {
    if (!(await menu.count())) await page.getByRole('button', { name: 'Links with other creations' }).click()
    await menu.getByRole('group', { name: 'Uses' }).getByRole('button', { name: /Artisans/ }).click({ timeout: 2000 })
    await expect(page.locator('app-preview .pane-name')).toHaveValue('Artisans', { timeout: 2000 })
  }).toPass()
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

test('an answer composes: its block and its figure show a collection as it was when it was written, say what changed since, show it now on a press, and its task is in the graph', async ({ page }) => {
  await start(page)
  await seed(page)
  const path = await page.evaluate(async ({ COLLECTION }) => {
    const [{ app, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecord, envelope }] = await Promise.all([import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js')])
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by: app.deviceId })
    await appendRecords(app.fs, path, [metaRecord(app.deviceId, { title: 'Who bakes' }), userRecord('Who bakes?', app.deviceId),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `Bakers: \`=${COLLECTION} count where Trade is Baker\`.\n\n\`\`\`table\n${COLLECTION}\nfields: Name | Trade\n\`\`\`\n` } }, 0)])
    await refreshConversations()
    return path
  }, { COLLECTION })
  await page.waitForTimeout(20)
  await change(page, 'Potter')
  await page.evaluate(async (path) => (await import('/ui/state.js')).openConversation(path), path)
  const answer = page.locator('article.msg-jean').last(), cells = answer.locator('app-composed tbody td')
  // As it was: Ana a baker, one baker; one change since.
  await expect(cells).toHaveText(['Ana', 'Baker'])
  await expect(answer.locator('.prose code[data-formula]')).toHaveText('1')
  await expect(answer.locator('.composed-since')).toContainText('Changes since this answer: 1')
  // As it is now, on a press, written nowhere; and back.
  await answer.getByRole('button', { name: 'Show it as it is now' }).click()
  await expect(cells).toHaveText(['Ana', 'Potter'])
  await answer.getByRole('button', { name: 'Show it as it was' }).click()
  await expect(cells).toHaveText(['Ana', 'Baker'])
  expect(await page.evaluate(async (path) => (await import('/ui/state.js')).app.fs.read(path), path)).not.toContain('Potter')
  // The task is among what uses the artisans, as in its answer, and opens from there.
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const task = page.locator('.menu:popover-open').getByRole('group', { name: 'Used in' }).getByRole('button', { name: /Who bakes/ })
  await expect(task).toContainText('As in its answer')
  await task.click()
  await expect.poll(() => page.evaluate(() => import('/ui/state.js').then(({ app }) => app.current.peek()?.path))).toBe(path)
})

test('a document’s section is a source: slides and a site follow it through a rename, a site pinned to its version 1 doesn’t, and a loop between documents is refused', async ({ page }) => {
  await start(page)
  await seed(page)
  const HELP = 'documents/01K85Z1T00000000000000000E-help.md', SLIDES = 'decks/01K85Z1T00000000000000000F-prices.deck.html', SITE = 'sites/01K85Z1T00000000000000000G-shop'
  const write = (/** @type {string} */ path, /** @type {string} */ text) => page.evaluate(async ({ path, text }) => { const { app } = await import('/ui/state.js'); await app.fs.write(`${app.projectDir}/${path}`, text) }, { path, text })
  const read = (/** @type {string} */ path) => page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return String(await app.fs.read(`${app.projectDir}/${path}`)) }, path)
  const head = (/** @type {string} */ name) => `---\nformat: 1\nname: ${name}\nauthor: user\ncreated: 2026-11-21T10:00:00.000Z\nchanged: 2026-11-21T10:00:00.000Z\n---\n`
  await page.evaluate(async () => { const { unlock } = await import('/ui/caps.js'); await Promise.all([unlock('documents'), unlock('sites')]) })
  await write(HELP, `${head('Help')}# Help\n\n## Prices\n\nTen euros.\n\n## Questions\n\nAsk us.\n`)
  await page.evaluate(async ({ SLIDES, HELP }) => { const { app } = await import('/ui/state.js'); await (await import('/caps/skills/decks.js')).rewrite(SLIDES, `# Prices\n\n---\n\n\`\`\`section\n${HELP}#prices\n\`\`\`\n`, 'Prices', app.projectDir) }, { SLIDES, HELP })
  // The slides show the section, found by its words, whose id is then written after them once.
  await show(page, SLIDES, 'Prices')
  const slide = page.locator('app-preview .deck-slide .composed-section').first()
  await expect(slide).toContainText('Ten euros.')
  await expect.poll(() => read(HELP)).toContain('## Prices {#prices}')
  // Renamed and changed, it is still found by its id; the slides follow it.
  await write(HELP, (await read(HELP)).replace('## Prices {#prices}\n\nTen euros.', '## Our prices {#prices}\n\nTwelve euros.'))
  await expect(slide).toContainText('Our prices')
  await expect(slide).toContainText('Twelve euros.')
  // Version 1, published from the document's pane, shows no id.
  await show(page, HELP, 'Help')
  await expect(page.locator('app-preview .doc h2').first()).toHaveText('Our prices')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open')
  await expect(menu.getByRole('group', { name: 'Used in' }).getByRole('button', { name: /Prices/ })).toBeVisible()
  await menu.getByRole('group', { name: 'Versions' }).getByRole('button', { name: 'Publish version 1' }).click()
  await expect(page.locator('.toast').last()).toContainText('Version 1 published.')
  await page.keyboard.press('Escape')
  // A site that reads version 1 keeps it once the document changes again; one that reads it live follows.
  await write(`${SITE}/site.json`, JSON.stringify({ format: 1, name: 'Shop', author: 'user', created: '2026-11-21T10:00:00.000Z', changed: '2026-11-21T10:00:00.000Z', source: '', files: ['index.html'] }))
  await write(`${SITE}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title></head><body><main><h1>Shop</h1><section id="then" data-from="${HELP}#prices@1"></section><section id="now" data-from="${HELP}#prices"></section></main></body></html>`)
  await write(HELP, (await read(HELP)).replace('Twelve euros.', 'Fifteen euros.'))
  await show(page, SITE, 'Shop')
  const frame = page.frameLocator('app-preview app-site iframe')
  await expect(frame.locator('#then')).toContainText('Twelve euros.')
  await expect(frame.locator('#now')).toContainText('Fifteen euros.')
  expect(await read(`${SITE}/index.html`)).not.toContain('euros')
  // Two documents that would show each other: refused, said in words.
  const OTHER = 'documents/01K85Z1T00000000000000000H-other.md'
  await write(OTHER, `${head('Other')}# Other\n\n## Part\n\nMine.\n\n\`\`\`section\n${HELP}#prices\n\`\`\`\n`)
  await write(HELP, `${(await read(HELP))}\n\`\`\`section\n${OTHER}#part\n\`\`\`\n`)
  await show(page, OTHER, 'Other')
  await expect(page.locator('app-preview app-composed')).toContainText('Not shown: each would use the other, in a loop.')
})

test('more consumers: one badge per baker and one more for another, a game given the rows as it starts, slides of a whiteboard’s section that follow a note moved', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await seed(page)
  const WB = 'collections/01K85Z1T00000000000000000W-board', GAME = 'games/01K85Z1T00000000000000000Q-quiz.game.html', AREAS = ['01K8000000000000000000000X', '01K8000000000000000000000Y'], NOTE = '01K8000000000000000000000Z'
  await page.evaluate(async () => { const { unlock } = await import('/ui/caps.js'); await Promise.all([unlock('designs'), unlock('games')]) })
  // One badge per baker, laid out once: each {Column} its row's.
  await ask(page, `Call design with ${JSON.stringify({ name: 'Badges', size: 'a6', words: { title: '{Name}', who: '{Trade}' }, from: `${COLLECTION}\nwhere: Trade is Baker` })}`)
  await answered(page)
  await page.evaluate(() => { window.print = () => {} })
  const print = async () => {
    await page.locator('app-preview .pane-head .icon-group > [popovertarget^="out-"]').click()
    await page.locator('.out-menu').getByRole('button', { name: /^Print or save as PDF/ }).click()
  }
  await print()
  await expect(page.locator('.design-print .design-page')).toHaveCount(1)
  await expect(page.locator('.design-print .design-page')).toContainText('Ana')
  await page.evaluate(async ({ COLLECTION }) => { const tables = await import('/caps/tables/tables.js'), one = await tables.load(COLLECTION); if (one) await tables.change(one, [{ set: { name: 'Bob', trade: 'Baker' } }], 'user') }, { COLLECTION })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.design-print')).toHaveCount(0)
  await print()
  await expect(page.locator('.design-print .design-page')).toHaveCount(2)
  await expect(page.locator('.design-print .design-page').nth(1)).toContainText('Bob')
  // A game is given the rows as it starts, never in its file.
  const given = await page.evaluate(async ({ COLLECTION, GAME }) => {
    const { app } = await import('/ui/state.js'), [file, { pageOf }] = await Promise.all([import('/caps/games/file.js'), import('/caps/games/page.js')])
    const game = { path: GAME, name: 'Quiz', card: 'Who makes what', code: 'host.stage.textContent = host.rows.map((row) => row.Name).join()', meta: { engine: 'none', actions: '', author: 'jean', created: '', changed: '', from: `${COLLECTION}\nfields: Name | Trade` } }
    await app.fs.write(`${app.projectDir}/${GAME}`, file.fileOf(game, 'en'))
    return pageOf(/** @type {any} */ (game))
  }, { COLLECTION, GAME })
  expect(given).toContain('"rows":[{"Name":"Ana","Trade":"Baker"},{"Name":"Bob","Trade":"Baker"}]')
  expect(await page.evaluate(async (GAME) => String(await (await import('/ui/state.js')).app.fs.read(`${(await import('/ui/state.js')).app.projectDir}/${GAME}`)), GAME)).not.toContain('Bob')
  // A whiteboard's section on a slide, as a list of its notes; a note moved to another section leaves it.
  await page.evaluate(async ({ WB, AREAS, NOTE }) => {
    const { app } = await import('/ui/state.js'), at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${WB}/collection.json`, JSON.stringify({ format: 1, id: WB.slice(12, 38), name: 'Board', kind: 'whiteboard', dir: 'ltr', author: 'user', created: at, changed: at,
      properties: [{ id: 'note', name: 'Note', type: 'text' }, { id: 'area', name: 'Section', type: 'relation', collection: WB }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${WB}/changes.jsonl`, [{ row: AREAS[0], set: { note: 'Ideas', '@kind': 'area' } }, { row: AREAS[1], set: { note: 'Later', '@kind': 'area' } }, { row: NOTE, set: { note: 'Bake bread', area: AREAS[0] } }]
      .map((line) => `${JSON.stringify({ ...line, at, by: 'user' })}\n`).join(''))
    await (await import('/caps/skills/decks.js')).rewrite('decks/01K85Z1T00000000000000000S-ideas.deck.html', `# Ideas\n\n---\n\n\`\`\`table\n${WB}\nsection: Ideas\n\`\`\`\n`, 'Ideas', app.projectDir)
  }, { WB, AREAS, NOTE })
  await show(page, 'decks/01K85Z1T00000000000000000S-ideas.deck.html', 'Ideas')
  const list = page.locator('app-preview .deck-slide .deck-table ul').first()
  await expect(list.locator('li')).toHaveText(['Bake bread'])
  await page.evaluate(async ({ WB, AREAS, NOTE }) => { const tables = await import('/caps/tables/tables.js'), one = await tables.load(WB); if (one) await tables.change(one, [{ row: NOTE, set: { area: AREAS[1] } }], 'user') }, { WB, AREAS, NOTE })
  await expect(list.locator('li')).toHaveCount(0)
  // The whiteboard is a source: what uses it, and its versions.
  await show(page, WB, 'Board')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open')
  await expect(menu.getByRole('group', { name: 'Used in' }).getByRole('button', { name: /Ideas/ })).toBeVisible()
  await expect(menu.getByRole('group', { name: 'Versions' }).getByRole('button', { name: 'Publish version 1' })).toBeEnabled()
  // The artisans list the badges and the game among what uses them.
  await page.keyboard.press('Escape')
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(menu.getByRole('group', { name: 'Used in' })).toContainText('Badges')
  await expect(menu.getByRole('group', { name: 'Used in' })).toContainText('Quiz')
})

test('the design system is a source: a site that wears it follows it at once, a poster on its palette too, slides pinned to its version 1 are offered no change and say they are certified back to it', async ({ page }) => {
  await start(page)
  await connectFakeBrain(page)
  await seed(page)
  const SITE = 'sites/01K85Z1T00000000000000000G-shop', OTHER = 'decks/01K85Z1T00000000000000000J-other.deck.html'
  const write = (/** @type {string} */ path, /** @type {string} */ text) => page.evaluate(async ({ path, text }) => { const { app } = await import('/ui/state.js'); await app.fs.write(`${app.projectDir}/${path}`, text) }, { path, text })
  const kit = (/** @type {string} */ primary) => page.evaluate(async (primary) => { const { app } = await import('/ui/state.js'); await (await import('/ui/kit.js')).keepKit(null, { tokens: { primary } }) }, primary)
  await page.evaluate(async () => { const { unlock } = await import('/ui/caps.js'); await Promise.all([unlock('sites'), unlock('receipt'), unlock('designs')]) })
  await kit('#cc2200')
  // A poster laid out once the design system is there: its first take wears its palette.
  await ask(page, `Call design with ${JSON.stringify({ name: 'Poster', size: 'a4', words: { title: 'Open day' } })}`)
  await answered(page)
  const poster = () => page.evaluate(async () => { const { app } = await import('/ui/state.js'), [file] = (await app.fs.list(`${app.projectDir}/designs`)).filter(({ name }) => name.endsWith('.svg')); return (await (await import('/caps/designs/designs.js')).load(`designs/${file.name}`))?.design.colours.accent })
  const before = await poster()
  await write(`${SITE}/site.json`, JSON.stringify({ format: 1, name: 'Shop', author: 'user', created: '2026-11-21T10:00:00.000Z', changed: '2026-11-21T10:00:00.000Z', source: '', files: ['index.html', 'look.css'], look: { id: 'project', voice: 'calm' } }))
  await write(`${SITE}/look.css`, ':root { --accent: #000000; }')
  await write(`${SITE}/index.html`, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title><link rel="stylesheet" href="look.css"></head><body><main><h1>Shop</h1></main></body></html>')
  await page.evaluate(async (OTHER) => { const { app } = await import('/ui/state.js'); await (await import('/caps/skills/decks.js')).rewrite(OTHER, '# Other\n\n---\n\n## Hello\n', 'Other', app.projectDir) }, OTHER)
  const accent = async () => { await show(page, SITE, 'Shop'); return page.frameLocator('app-preview app-site iframe').locator('html').evaluate((html) => getComputedStyle(html).getPropertyValue('--accent').trim()) }
  await expect.poll(accent).toBe('#cc2200')
  // Version 1 of the design system; the slides pinned to it from their menu.
  expect(await page.evaluate(async () => (await (await import('/caps/compose/compose.js')).publish('kit.json'))?.version?.n)).toBe(1)
  await show(page, DECK, 'Neighbourhood')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  const menu = page.locator('.menu:popover-open')
  await menu.getByRole('group', { name: 'Uses' }).getByRole('button', { name: /Design system/ }).click()
  await menu.getByRole('button', { name: 'Version 1', exact: true }).click()
  await expect.poll(() => page.evaluate(async (DECK) => (await (await import('/caps/skills/decks.js')).load(DECK))?.meta.kit, DECK)).toBe('1')
  await expect(menu.getByRole('status').filter({ hasText: 'Certified, back to version 1 of the design system' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  const waiting = (/** @type {string} */ deck) => page.evaluate(async (deck) => { const { app } = await import('/ui/state.js'); return app.fs.read(`${app.projectDir}/${deck.replace(/^decks\//, 'decks/.suggested/').replace(/\.deck\.html$/, '.md')}`) }, deck)
  const offered = await waiting(DECK)
  // The design system changed: the site follows it; the pinned slides are offered nothing, the others their change.
  await show(page, SITE, 'Shop')
  await kit('#1d4ed8')
  // The site on show is drawn again in it at once, no reopening; the poster wears it too.
  await expect.poll(() => page.frameLocator('app-preview app-site iframe').locator('html').evaluate((html) => getComputedStyle(html).getPropertyValue('--accent').trim())).toBe('#1d4ed8')
  await expect.poll(poster).not.toBe(before)
  await show(page, DECK, 'Neighbourhood')
  await show(page, OTHER, 'Other')
  await expect.poll(() => waiting(OTHER)).toContain('#1d4ed8')
  expect(await waiting(DECK), 'what was offered before it was pinned, and nothing since').toBe(offered)
  // The design system lists what wears it.
  const said = await page.evaluate(async () => (await import('/ui/caps.js')).loaded.peek().get('compose')?.tools?.[0].run({ place: 'kit.json' }, /** @type {any} */ ({})))
  expect(said).toContain('Neighbourhood')
  expect(said).toContain('Shop')
  expect(said).toContain('Poster')
  // Its page says what wears it, and publishes the next version.
  // In the home project, the design system's page is the person's own.
  await page.evaluate(async () => (await import('/ui/dialogs.js')).openSettings('appearance/kit'))
  const part = page.locator('.settings section').filter({ has: page.getByRole('heading', { name: 'Versions' }) })
  await expect(part).toContainText(/Worn by .*Neighbourhood/)
  await part.getByRole('button', { name: 'Publish version 2' }).click()
  await expect(page.locator('.toast').last()).toContainText('Version 2 published.')
})

test('one clock: a routine that reads the bakers runs as they change, given their rows, its run certified back to what it read; a source’s rows carry a certificate naming it', async ({ page }) => {
  await start(page)
  // A plan's brain, which the fake brain answers for: not on this computer, so Tables take its changes (tables.spec.js).
  await page.evaluate((baseURL) => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'claude', provider: 'claudecode', api: 'openai', baseURL, model: 'haiku' })), BRAIN_URL)
  await seed(page)
  const made = (/** @type {string} */ title, /** @type {string} */ request) => page.evaluate(async ({ title, request }) => {
    const [{ app }, { unlock }, { newRoutine, writeRoutine }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js'), import('/caps/routines/schedule.js')])
    await Promise.all([unlock('routines'), unlock('receipt')])
    const routine = newRoutine('', { title, request, by: app.deviceId, every: 'day', at: '08:00' })
    await writeRoutine(app.fs, /** @type {any} */ (routine))
    return routine.path
  }, { title, request })
  /** A routine's certified runs, as composition keeps them. @param {string} path */
  const runs = (path) => page.evaluate(async (path) => { const { app } = await import('/ui/state.js'); return ((await app.fs.read(`${app.projectDir}/composed/${/[0-9A-HJKMNP-TV-Z]{26}/.exec(path)?.[0]}.jsonl`)) ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line)) }, path)
  const reader = await made('Who bakes', `Tell me who bakes.\n\n\`\`\`table\n${COLLECTION}\nwhere: Trade is Baker\nrefresh: auto\n\`\`\`\n`)
  // It is among what uses the artisans.
  await show(page, COLLECTION, 'Artisans')
  await page.getByRole('button', { name: 'Links with other creations' }).click()
  await expect(page.locator('.menu:popover-open').getByRole('group', { name: 'Used in' })).toContainText('Who bakes')
  await page.keyboard.press('Escape')
  // A baker added: the routine runs by itself, given the rows as they are, and its run is certified with what it read.
  await page.evaluate(async ({ COLLECTION }) => { const tables = await import('/caps/tables/tables.js'), one = await tables.load(COLLECTION); if (one) await tables.change(one, [{ set: { name: 'Bob', trade: 'Baker' } }], 'user') }, { COLLECTION })
  await expect.poll(async () => (await runs(reader)).length, { timeout: 20_000 }).toBe(1)
  const [first] = await runs(reader)
  expect(first.key).toBe('routine')
  expect(first.read).toMatch(/^\d{4}-/)
  expect(first.certificate).toBeTruthy()
  const told = await page.evaluate(async (path) => {
    const [{ runsOf }, { loadConversation }, { app }] = await Promise.all([import('/caps/routines/routines.js'), import('/core/conversations.js'), import('/ui/state.js')])
    const run = runsOf(path)[0]
    return run ? JSON.stringify((await loadConversation(app.fs, run.path))?.records ?? []) : ''
  }, reader)
  expect(told).toContain('| Ana | Baker |')
  expect(told).toContain('| Bob | Baker |')
  // A source: the rows it adds are Jean's, and its run's certificate covers them, naming the routine.
  const source = await made('Bakers from the market', `Call table_change with ${JSON.stringify({ table: COLLECTION, rows: [{ set: { Name: 'Cleo', Trade: 'Baker' } }] })}`)
  await page.evaluate(async (path) => (await import('/caps/routines/routines.js')).runNow(path), source)
  await expect.poll(async () => (await runs(source)).length, { timeout: 20_000 }).toBe(1)
  const [added] = await runs(source)
  expect(added.wrote).toEqual([COLLECTION])
  const checked = await page.evaluate(async (certificate) => { const { chainOf, holds } = await import('/caps/compose/proof.js'), one = await chainOf([certificate]); return { holds: holds(one), says: one.says?.credentialSubject } }, added.certificate)
  expect(checked.holds).toBe(true)
  expect(checked.says).toMatchObject({ kind: 'run', creation: /[0-9A-HJKMNP-TV-Z]{26}/.exec(source)?.[0] })
})

test('a creation outside the graph has no links menu, and has one once something uses it', async ({ page }) => {
  await start(page)
  await seed(page)
  const LONE = 'collections/01K85Z1T00000000000000000C-lone'
  await page.evaluate(async (LONE) => {
    const { app } = await import('/ui/state.js'), at = '2026-11-21T10:00:00.000Z'
    await app.fs.write(`${app.projectDir}/${LONE}/collection.json`, JSON.stringify({ format: 1, id: LONE.slice(12, 38), name: 'Lone', author: 'user', created: at, changed: at, properties: [{ id: 'name', name: 'Name', type: 'text' }], views: [{ id: 'table', type: 'table' }] }))
    await app.fs.write(`${app.projectDir}/${LONE}/changes.jsonl`, `${JSON.stringify({ row: '01K8000000000000000000000C', set: { name: 'Alone' }, at, by: 'user' })}\n`)
  }, LONE)
  const links = page.locator('app-preview').getByRole('button', { name: 'Links with other creations' })
  await show(page, LONE, 'Lone')
  await expect(page.locator('app-preview .table-grid')).toBeVisible()
  await expect(links).toHaveCount(0)
  // Slides that show it: it is in the graph, and its head shows the menu.
  await page.evaluate(async (LONE) => { const { app } = await import('/ui/state.js'); await (await import('/caps/skills/decks.js')).rewrite('decks/01K85Z1T00000000000000000V-lone.deck.html', `# Lone\n\n---\n\n\`\`\`table\n${LONE}\n\`\`\`\n`, 'Lone slides', app.projectDir) }, LONE)
  await expect(links).toHaveCount(1)
  await links.click()
  await expect(page.locator('.menu:popover-open').getByRole('group', { name: 'Used in' })).toContainText('Lone slides')
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

const ORDERS = 'collections/01K85Z1T00000000000000000B-orders', BOARD = 'decks/01K85Z1T00000000000000000V-board.deck.html', REPORT = 'documents/01K85Z1T00000000000000000R-report.md'
const PRICES = 'documents/01K85Z1T00000000000000000P-prices.md', PROPOSAL = 'decks/01K85Z1T00000000000000000Q-proposal.deck.html', DIRECTORY = 'sites/01K85Z1T00000000000000000S-directory', MEMBERS = 'sites/01K85Z1T00000000000000000W-members'
/**
 * A project whose creations link (steps 13 to 16): the artisans and slides that show them (seed), version 1 of the artisans and slides pinned to it, a report
 * that shows them, a site that shows the report's summary, a directory that shows the artisans and whose form proposes into them, orders that relate to them
 * and that nothing shows, and prices a proposal shows. @param {import('@playwright/test').Page} page
 */
async function project(page) {
  await seed(page)
  await page.evaluate(async ({ COLLECTION, ORDERS, BOARD, REPORT, PRICES, PROPOSAL, DIRECTORY, MEMBERS }) => {
    const [{ app }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/caps.js')]), at = '2026-11-21T10:00:00.000Z', decks = await import('/caps/skills/decks.js')
    await Promise.all([unlock('documents'), unlock('sites')])
    const document = (/** @type {string} */ name, /** @type {string} */ body) => `---\nformat: 1\nname: ${name}\nauthor: user\ncreated: ${at}\nchanged: ${at}\n---\n# ${name}\n\n${body}\n`
    const site = async (/** @type {string} */ place, /** @type {string} */ name, /** @type {string} */ body) => { await app.fs.write(`${app.projectDir}/${place}/site.json`, JSON.stringify({ format: 1, name, author: 'user', created: at, changed: at, source: '', files: ['index.html'] })); await app.fs.write(`${app.projectDir}/${place}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name}</title></head><body><main>${body}</main></body></html>`) }
    await (await import('/caps/compose/compose.js')).publish(COLLECTION)
    await app.fs.write(`${app.projectDir}/${ORDERS}/collection.json`, JSON.stringify({ format: 1, id: ORDERS.slice(12, 38), name: 'Orders', author: 'user', created: at, changed: at,
      properties: [{ id: 'item', name: 'Item', type: 'text' }, { id: 'maker', name: 'Maker', type: 'relation', collection: COLLECTION }], views: [{ id: 'table', type: 'table' }] }))
    await decks.rewrite(BOARD, `# Board\n\n---\n\n\`\`\`table\n${COLLECTION}@1\n\`\`\`\n`, 'Board', app.projectDir)
    await app.fs.write(`${app.projectDir}/${REPORT}`, document('Report', `## Summary\n\n\`\`\`table\n${COLLECTION}\n\`\`\``))
    await app.fs.write(`${app.projectDir}/${PRICES}`, document('Prices', '## Bread\n\nTwo euros.'))
    await decks.rewrite(PROPOSAL, `# Proposal\n\n---\n\n\`\`\`section\n${PRICES}#bread\n\`\`\`\n`, 'Proposal', app.projectDir)
    await site(DIRECTORY, 'Directory', `<table data-from="${COLLECTION}"></table><form method="post" data-form="propose" data-to="${COLLECTION}"><label for="who">Name</label><input id="who" name="who"><button>Propose</button></form>`)
    await site(MEMBERS, 'Members', `<section data-from="${REPORT}#summary"></section>`)
  }, { COLLECTION, ORDERS, BOARD, REPORT, PRICES, PROPOSAL, DIRECTORY, MEMBERS })
}
/** What the brain reads of the graph, of a creation or, with none, of the whole project. @param {import('@playwright/test').Page} page @param {string} [place] */
const links = (page, place) => page.evaluate(async (place) => (await import('/ui/caps.js')).loaded.peek().get('compose')?.tools?.[0].run(place ? { place } : {}, /** @type {any} */ ({})), place)

test('the graph whole, in words: every creation that uses another, the version each reads, a site’s form proposing into a collection, and what shows nothing and why', async ({ page }) => {
  await start(page)
  await project(page)
  const said = await links(page)
  expect(said).toMatch(/^In this project, /)
  expect(said).toContain(`Neighbourhood (${DECK}) uses Artisans (${COLLECTION}), reading it as it is now; collections/01K85Z1T00000000000000000Z-gone (collections/01K85Z1T00000000000000000Z-gone), reading it as it is now, showing nothing, as this project has no such creation`)
  expect(said).toContain(`Board (${BOARD}) uses Artisans (${COLLECTION}), reading its version 1`)
  expect(said).toContain(`Orders (${ORDERS}) uses Artisans (${COLLECTION}), by its column Maker`)
  expect(said).toContain(`Members (${MEMBERS}) uses Report (${REPORT}), reading it as it is now, section: summary`)
  expect(said).toContain(`Directory (${DIRECTORY}) uses Artisans (${COLLECTION}), reading it as it is now; Artisans (${COLLECTION}), proposing rows to it through its form propose`)
  // Of the artisans alone, the directory is among what uses them, by its form too; deleted from Creations, they would say so with their Undo.
  expect(await links(page, COLLECTION)).toContain(`Directory (${DIRECTORY}), proposing rows to it through its form propose`)
})

/** The artisans' links menu opened from their pane, then its row that draws them. @param {import('@playwright/test').Page} page @param {string} drawn its row's words */
async function drawMap(page, drawn) {
  await show(page, COLLECTION, 'Artisans')
  await expect(async () => {
    if (!(await page.locator('.menu:popover-open').count())) await page.locator('app-preview .pane-head button[popovertarget^="links-"]').click()
    await page.locator('.menu:popover-open').getByRole('button', { name: drawn }).click({ timeout: 2000 })
  }).toPass()
  return page.locator('dialog.links-sheet[open] app-links-map')
}
/** A map's columns, each its creations' names. @param {import('@playwright/test').Locator} map */
const columnsOf = (map) => map.locator('.links-columns > ul').evaluateAll((lists) => lists.map((list) => [...list.querySelectorAll('button > span')].map((name) => name.textContent)))

test('one creation’s map: what it uses at the start, it, what uses it further along, a column further what is reached through those, each with the version it reads; the arrows walk its links', async ({ page }) => {
  await start(page)
  await project(page)
  const map = await drawMap(page, 'See them drawn')
  await expect(page.locator('dialog.links-sheet[open] h2')).toHaveText('Artisans')
  await expect.poll(() => columnsOf(map)).toEqual([['Artisans', 'Orders'], ['Neighbourhood', 'Board', 'Report', 'Directory'], ['Members']])
  await expect(map.locator('li.is-here')).toHaveText('Artisans')
  await expect(map.getByRole('button', { name: /Board/ })).toContainText('Version 1')
  await expect(map.getByRole('button', { name: /Neighbourhood/ })).toContainText('Live')
  // Each line drawn, the form's dashed from the directory to the artisans, the relation dashed with no arrow.
  await expect.poll(() => map.locator('.links-lines path[data-from][d]').count()).toBe(7)
  await expect(map.locator(`.links-lines path[data-from="${DIRECTORY}"][data-to="${COLLECTION}"]`)).toHaveClass('is-dashed')
  await expect(map.locator(`.links-lines path[data-from="${COLLECTION}"][data-to="${ORDERS}"]`)).not.toHaveAttribute('marker-end')
  // The keyboard on the artisans lights their chain; along a link to what uses them, back, and down their column.
  await map.getByRole('button', { name: /Artisans/ }).focus()
  await expect(map).toHaveAttribute('data-chain', '')
  await page.keyboard.press('ArrowRight')
  await expect(map.locator('.links-columns > ul').nth(1).locator('button:focus')).toHaveCount(1)
  await page.keyboard.press('ArrowLeft')
  await expect(map.getByRole('button', { name: /Artisans/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(map.getByRole('button', { name: /Orders/ })).toBeFocused()
  // The members pointed at: the report and the artisans lit with them, the board soft.
  await map.getByRole('button', { name: /Members/ }).hover()
  await expect(map.locator('li.is-chain')).toHaveText([/Artisans/, /Report/, /Members/])
  // Pressed, one opens beside the task, the sheet closing.
  await map.getByRole('button', { name: /Report/ }).click()
  await expect(page.locator('dialog.links-sheet')).toHaveCount(0)
  await expect(page.locator('app-preview .pane-head')).toContainText('Report')
})

for (const [lang, drawn] of [['ar', 'اعرض الروابط مرسومة'], ['ja', '図で見る']]) {
  test(`one creation’s map turns with the page and fits at 320 px wide, in ${lang}`, async ({ page }) => {
    await start(page, lang)
    await project(page)
    const map = await drawMap(page, drawn), first = map.locator('.links-columns > ul').first(), next = map.locator('.links-columns > ul').nth(1)
    await expect.poll(() => map.locator('.links-lines path[data-from][d]').count()).toBe(7)
    const [a, b] = [await first.boundingBox(), await next.boundingBox()]
    expect(lang === 'ar' ? (a?.x ?? 0) > (b?.x ?? 0) : (a?.x ?? 0) < (b?.x ?? 0)).toBe(true)
    // Narrow, its columns stack, the start at the top, and no name is cut.
    await page.setViewportSize({ width: 320, height: 800 })
    await expect.poll(async () => ((await next.boundingBox())?.y ?? 0) > ((await first.boundingBox())?.y ?? 0)).toBe(true)
    expect(await map.locator('button').evaluateAll((buttons) => buttons.filter((one) => one.scrollWidth > one.clientWidth + 1 || one.getBoundingClientRect().right > innerWidth || one.getBoundingClientRect().left < 0).length)).toBe(0)
  })
}

test('the project’s map on Creations: sources at the start and each by its depth, kept in the address, its kind’s chips keeping some lit, one pointed at lighting its chain, drawn the same once read again', async ({ page }) => {
  await start(page)
  await project(page)
  const tasks = await openTasks(page)
  await tasks.getByRole('button', { name: 'Creations', exact: true }).click()
  await page.locator('app-creations').getByRole('button', { name: /^Sort by:/ }).click()
  await page.locator('#creations-order:popover-open').getByRole('menuitemradio', { name: 'Links' }).click()
  const map = page.locator('app-creations app-links-map')
  const drawn = [['Artisans', 'Prices', 'Orders'], ['Neighbourhood', 'Board', 'Report', 'Directory', 'Proposal'], ['Members']]
  await expect.poll(() => columnsOf(map)).toEqual(drawn)
  await expect(page.locator('app-creations .creations-cards')).toHaveCount(0)
  await expect.poll(() => page.url()).toContain('links')
  // The artisans pointed at: the proposal, which shows only the prices, goes soft with them.
  await expect.poll(() => map.locator('.links-lines path[data-from][d]').count()).toBe(8)
  await map.getByRole('button', { name: /Artisans/ }).hover()
  await expect(map.locator('li:not(.is-chain)')).toHaveText([/Prices/, /Proposal/])
  // Slides alone: the three slides lit, the rest soft.
  await page.mouse.move(0, 0)
  await page.locator('app-creations .creations-chips').getByRole('button', { name: /^Slides/ }).click()
  await expect(map.locator('li:not(.is-dim)')).toHaveText([/Neighbourhood/, /Board/, /Proposal/])
  // A report written again, the graph is read again: the same map.
  await page.evaluate(async (REPORT) => { const { app } = await import('/ui/state.js'), at = `${app.projectDir}/${REPORT}`; await app.fs.write(at, `${await app.fs.read(at)}\n`) }, REPORT)
  await page.waitForTimeout(1500)
  await expect.poll(() => columnsOf(map)).toEqual(drawn)
  // Pressed, one opens beside the page.
  await map.getByRole('button', { name: /Members/ }).click()
  await expect(page.locator('app-preview .pane-head')).toContainText('Members')
})

test('how each stands on the map: slides pinned to version 1 say version 3 is out, slides that follow the collection say so and their brain, a site whose collection is gone says it shows nothing, a collection nothing reads says so', async ({ page }) => {
  await start(page)
  await project(page)
  await page.evaluate(async ({ COLLECTION }) => {
    const { app } = await import('/ui/state.js'), at = '2026-11-21T10:00:00.000Z', { publish } = await import('/caps/compose/compose.js')
    await (await import('/caps/skills/decks.js')).rewrite('decks/01K85Z1T00000000000000000X-digest.deck.html', `# Digest\n\n---\n\n\`\`\`table\n${COLLECTION}\nask: Sum it up\nrefresh: auto\nbrain: Fake brain\n\`\`\`\n`, 'Digest', app.projectDir)
    await app.fs.write(`${app.projectDir}/sites/01K85Z1T00000000000000000Y-old/site.json`, JSON.stringify({ format: 1, name: 'Old', author: 'user', created: at, changed: at, source: '', files: ['index.html'] }))
    await app.fs.write(`${app.projectDir}/sites/01K85Z1T00000000000000000Y-old/index.html`, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Old</title></head><body><table data-from="collections/01K85Z1T00000000000000000Z-gone"></table></body></html>')
    await publish(COLLECTION), await publish(COLLECTION)
  }, { COLLECTION })
  const tasks = await openTasks(page)
  await tasks.getByRole('button', { name: 'Creations', exact: true }).click()
  await page.locator('app-creations').getByRole('button', { name: /^Sort by:/ }).click()
  await page.locator('#creations-order:popover-open').getByRole('menuitemradio', { name: 'Links' }).click()
  const map = page.locator('app-creations app-links-map')
  await expect(map.getByRole('button', { name: /Board/ })).toContainText('Version 3 is out')
  await expect(map.getByRole('button', { name: /Digest/ })).toContainText('As the collection changes')
  await expect(map.getByRole('button', { name: /Digest/ })).toContainText('Fake brain')
  await expect(map.getByRole('button', { name: /Old/ }).locator('small.is-alert')).toHaveText('This project has no such collection.')
  await expect(map.getByRole('button', { name: /Neighbourhood/ }).locator('small.is-alert')).toHaveText('This project has no such collection.')
  await expect(map.getByRole('button', { name: /Orders/ })).toContainText('Used by nothing')
  await expect(map.getByRole('button', { name: /Artisans/ })).not.toContainText('Used by nothing')
})

const CREPES = 'decks/01K85Z1T00000000000000000C-crepes.deck.html'
/** Slides that show the artisans three times, a table of some columns, a chart and a figure, and that nothing uses. @param {import('@playwright/test').Page} page */
const crepes = (page) => page.evaluate(async ({ COLLECTION, CREPES }) => {
  const { app } = await import('/ui/state.js')
  await (await import('/caps/skills/decks.js')).rewrite(CREPES, `# Crêpes\n\n---\n\n\`\`\`table\n${COLLECTION}\nfields: Name | Trade\n\`\`\`\n\n---\n\n\`\`\`table\n${COLLECTION}\nchart: bar\nby: Trade\n\`\`\`\n\n---\n\n## Artisans: \`=${COLLECTION} count\`\n`, 'Crêpes', app.projectDir)
}, { COLLECTION, CREPES })

test('slides that show one collection three times, with nothing further along, still draw their links, one line for the three', async ({ page }) => {
  await start(page)
  await seed(page)
  await crepes(page)
  await show(page, CREPES, 'Crêpes')
  await expect(async () => {
    if (!(await page.locator('.menu:popover-open').count())) await page.locator('app-preview .pane-head button[popovertarget^="links-"]').click()
    await page.locator('.menu:popover-open').getByRole('button', { name: 'See them drawn' }).click({ timeout: 2000 })
  }).toPass()
  const map = page.locator('dialog.links-sheet[open] app-links-map')
  await expect.poll(() => columnsOf(map)).toEqual([['Artisans'], ['Crêpes']])
  await expect.poll(() => map.locator('.links-lines path[data-from][d]').count()).toBe(1)
})

test('slides that show one collection three times say what each shows in their links menu, and the collection lists them once', async ({ page }) => {
  await start(page)
  await seed(page)
  await crepes(page)
  const menu = page.locator('.menu:popover-open'), links = () => page.locator('app-preview .pane-head button[popovertarget^="links-"]')
  await show(page, CREPES, 'Crêpes')
  await expect(async () => {
    if (!(await menu.count())) await links().click()
    await expect(menu.getByRole('group', { name: 'Uses' }).locator('.links-said')).toHaveText(['Table: Name and Trade', 'Chart by Trade', 'Figure'], { timeout: 2000 })
  }).toPass()
  await page.keyboard.press('Escape')
  await show(page, COLLECTION, 'Artisans')
  await expect(async () => {
    if (!(await menu.count())) await links().click()
    await expect(menu.getByRole('group', { name: 'Used in' }).getByRole('button')).toHaveCount(2, { timeout: 2000 })
  }).toPass()
  await expect(menu.getByRole('group', { name: 'Used in' }).getByRole('button', { name: /Crêpes/ })).toHaveCount(1)
})
