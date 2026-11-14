// SPDX-License-Identifier: MIT
// Phase 0d of the collections plan, a spike: can a collection's cell read as its value (€480, 12 Sept, a status as a
// pill) while staying the native field it is today, by drawing its reading over the field? Nothing in app/ changes: Jean
// runs as it is, with the fake brain, and the prototype is put into the live page (a style sheet and a few lines that keep
// an aria-hidden span over each number, date, select and status field of the table's body). What it finds is in reading.md.
//
//   node test/collections/reading.js                    every check, in Chromium, WebKit and Firefox, in English, Arabic and Japanese
//   node test/collections/reading.js --engine webkit --lang ar       some of them
//   node test/collections/reading.js --headed --hold    Jean in a window, the prototype on, waiting: to try by hand, with VoiceOver
//   --out <folder>  where screenshots and results-<engine>-<language>.json go (the system's temporary folder by default)
//   --variant focus|hover|quiet  what --hold starts with; typing off, focus, hover or quiet then Enter switches, q ends
//   --trace  each key of the key script as it is pressed
//
// Each engine and language takes about two minutes, the nine about seventeen. Firefox's own accessibility is asked of the Firefox installed
// here, if there is one.
//
// Jean is served on 4394 and the fake brain on 4395; both are stopped when this ends.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { chromium, firefox, webkit } from 'playwright'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2), flag = (/** @type {string} */ name) => args.includes(`--${name}`)
const option = (/** @type {string} */ name, /** @type {string} */ fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
const ENGINES = option('engine', 'chromium,webkit,firefox').split(','), LANGS = option('lang', 'en,ar,ja').split(',')
const OUT = option('out', join(tmpdir(), 'jean-reading')), HEADED = flag('headed'), HOLD = flag('hold'), VARIANT = option('variant', 'focus'), TRACE = flag('trace')
const APP = 4394, BRAIN = 4395, ADDRESS = `http://127.0.0.1:${APP}/`
const LAUNCHERS = { chromium, firefox, webkit }
mkdirSync(OUT, { recursive: true })

// ---- The collection: the walk's, a fair's budget; one row has no date and one no Paid.
const FAIR = { name: 'Autumn fair budget', columns: [
  { name: 'Item', type: 'text' }, { name: 'Category', type: 'select', options: ['Venue', 'Food', 'Games', 'Printing'] },
  { name: 'Owner', type: 'person' }, { name: 'Due', type: 'date' }, { name: 'Status', type: 'status', options: ['To do', 'Booked', 'Paid'] },
  { name: 'Estimate', type: 'number' }, { name: 'Paid', type: 'number' }, { name: 'Receipt', type: 'checkbox' },
] }
const ROWS = [
  ['Village hall', 'Venue', 'Amira', '2026-09-12', 'Paid', 480, 480, true], ['Marquee hire', 'Venue', 'Amira', '2026-09-26', 'Booked', 650, 200, false],
  ['Cakes and tea', 'Food', 'Jun', null, 'To do', 220, 0, false], ['Barbecue', 'Food', 'Jun', '2026-10-03', 'To do', 340, null, false],
  ['Tombola prizes', 'Games', 'Lucas', '2026-09-30', 'Booked', 150, 60.5, true], ['Bouncy castle', 'Games', 'Lucas', '2026-09-19', 'Paid', 300, 300, true],
  ['Posters', 'Printing', 'Amira', '2026-09-05', 'Paid', 90, 96, true], ['Programmes', 'Printing', 'Jun', '2026-09-28', 'To do', 120, 0, false],
].map(([Item, Category, Owner, Due, Status, Estimate, Paid, Receipt]) => ({ set: { Item, Category, Owner, Due, Status, Estimate, Paid, Receipt } }))
/** Jean's later changes, left waiting: four cells of three rows, by row and column name. */
const WAITING = [[5, { Status: 'Booked' }], [6, { Paid: 90 }], [7, { Due: '2026-10-05', Category: 'Food' }]]
/** A cell of the body by its row and its place in it: 0 the handle, 1 Item … 8 Receipt. */
const C = { item: 1, category: 2, owner: 3, due: 4, status: 5, estimate: 6, paid: 7, receipt: 8 }

// ---- The prototype, run in Jean's page. It stands for what view.js's cell() and tables.css would hold.
/**
 * @param {string} variant focus: the field shows with the keyboard in its cell; hover: with the pointer on it too; quiet: no reading, the fields quietened by CSS alone; off
 * @param {string} [amounts] the number columns read as money, by a pattern of their names: what stands for a column's format, which the plan adds
 */
async function prototype(variant, amounts = '^(Estimate|Paid)$') {
  const root = document.documentElement, set = (/** @type {string} */ to) => {
    root.toggleAttribute('data-quiet', to === 'quiet')
    if (to === 'focus' || to === 'hover') root.dataset.reading = to; else delete root.dataset.reading
  }
  if (/** @type {any} */ (window).reading) return /** @type {any} */ (window).reading(variant)
  // Signals by the page's import map; where a console can't use it, each signal's own subscribe does as well.
  const [{ shown }, { intlLocales, locale }] = await Promise.all([import('/caps/tables/tables.js'), import('/core/i18n.js')])
  const { effect } = await import('@preact/signals-core').catch(() => ({ effect: (/** @type {() => void} */ run) => { shown.subscribe(run); locale.subscribe(run) } }))
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(`
    .table-reading { display: none; }
    [data-reading] .table-grid tbody :is(td, th):has(> .table-reading) { position: relative; }
    [data-reading] .table-reading { position: absolute; inset: 0; display: flex; align-items: center; padding: 0.3rem 0.6rem; border: 1px solid transparent; overflow: hidden; white-space: nowrap; pointer-events: none; }
    [data-reading] .table-reading > bdi { overflow: hidden; text-overflow: ellipsis; }
    [data-reading] .table-reading[data-kind='number'] { justify-content: flex-end; font-variant-numeric: tabular-nums; }
    [data-reading] .table-reading[data-kind='choice'] > bdi:not(:empty) { padding: 0.1rem 0.6rem; border-radius: 999px; background: color-mix(in oklab, currentColor 12%, transparent); font-size: 0.85rem; }
    /* The figure where its reading was, so that it doesn't jump as the field shows; the field written left to right whatever the page. */
    [data-reading] .table-grid tbody td > input[type='number'] { text-align: end; font-variant-numeric: tabular-nums; }
    [data-reading] .table-grid tbody td:dir(rtl) > input[type='number'] { text-align: start; }
    /* Asked of the checks alone: no spinner in a number's field, which a press at a reading's end would otherwise step unseen. */
    [data-reading-plain] .table-grid tbody td > input[type='number'] { appearance: textfield; }
    [data-reading-plain] .table-grid tbody td > input[type='number']::-webkit-inner-spin-button { display: none; }
    @media not (forced-colors: active) {
      [data-reading] .table-grid tbody :is(td, th):has(> .table-reading) > :is(input, select) { opacity: 0; }
      [data-reading] .table-grid tbody :is(td, th):is(:focus-within, :has(> [aria-invalid='true'])) > :is(input, select) { opacity: 1; }
      [data-reading] .table-grid tbody :is(td, th):is(:focus-within, :has(> [aria-invalid='true'])) > .table-reading { display: none; }
    }
    @media (hover: hover) and (not (forced-colors: active)) {
      [data-reading='hover'] .table-grid tbody :is(td, th):hover > :is(input, select) { opacity: 1; }
      [data-reading='hover'] .table-grid tbody :is(td, th):hover > .table-reading { display: none; }
    }
    @media (forced-colors: active) { [data-reading] .table-reading { display: none; } }
    /* For the checks alone: the readings unseen, to see what is left of the fields under them; and readings one can select. */
    [data-reading-blank] .table-reading { visibility: hidden; }
    [data-reading-select] .table-reading { user-select: text; -webkit-user-select: text; }
    /* The other way, with no reading: the fields quietened by CSS alone. */
    [data-quiet] .table-view .table-grid tbody td > input[type='number'] { appearance: textfield; text-align: end; font-variant-numeric: tabular-nums; }
    [data-quiet] .table-view .table-grid tbody td > input[type='number']::-webkit-inner-spin-button { display: none; }
    [data-quiet] .table-view .table-grid tbody td:not(:focus-within, :hover) > input[type='date']::-webkit-calendar-picker-indicator { opacity: 0; }
    [data-quiet] .table-view .table-grid tbody td > select { appearance: none; inline-size: auto; min-inline-size: 0; min-block-size: 0; margin-inline: 0.6rem; padding: 0.1rem 0.6rem; border: 0; border-radius: 999px; background: color-mix(in oklab, currentColor 12%, transparent); font-size: 0.85rem; }
    [data-quiet] .table-view .table-grid tbody td > select:has(> option[value='']:checked) { background: none; color: transparent; }
  `)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  const MONEY = new RegExp(amounts), KINDS = /** @type {Record<string, string>} */ ({ number: 'number', date: 'date', select: 'choice', status: 'choice' })
  /** A field's value as Jean's language writes it: money, a day and its month, a choice's name; nothing for none. @param {{ type: string, name: string }} property @param {string} value */
  const words = (property, value) => {
    if (value === '') return ''
    if (property.type === 'number') return Number.isFinite(Number(value)) ? new Intl.NumberFormat(intlLocales(), MONEY.test(property.name) ? { style: 'currency', currency: 'EUR', trailingZeroDisplay: 'stripIfInteger' } : {}).format(Number(value)) : ''
    if (property.type === 'date') return new Intl.DateTimeFormat(intlLocales(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00Z`))
    return value
  }
  /** Each reading made, changed or taken away, as the fields are now. */
  const sync = () => {
    const one = shown.peek()
    if (!one) return
    for (const grid of /** @type {NodeListOf<HTMLTableElement>} */ (document.querySelectorAll('.table-grid'))) {
      const columns = [...grid.querySelectorAll('thead th[data-column]')].map((th) => one.table.properties.find((property) => property.id === /** @type {HTMLElement} */ (th).dataset.column))
      for (const row of grid.tBodies[0]?.rows ?? []) [...row.querySelectorAll(':scope > [tabindex]')].forEach((cell, i) => {
        const field = /** @type {HTMLInputElement | null} */ (cell.querySelector(':scope > :is(input, select)')), column = columns[i], kind = column && KINDS[column.type]
        let reading = /** @type {HTMLElement | null} */ (cell.querySelector(':scope > .table-reading'))
        if (!field || !column || !kind) return reading?.remove()
        if (!reading) {
          reading = cell.appendChild(Object.assign(document.createElement('span'), { className: 'table-reading' }))
          reading.setAttribute('aria-hidden', 'true')
          reading.append(document.createElement('bdi'))
        }
        const said = /** @type {HTMLElement} */ (reading.firstElementChild), text = words(column, field.value)
        if (reading.dataset.kind !== kind) reading.dataset.kind = kind
        if (said.textContent !== text) said.textContent = text
        if (column.type === 'number' && field.dir !== 'ltr') field.dir = 'ltr'
      })
    }
  }
  // In step: as the table on show or the language changes, as the view redraws, and as a field is written in or left.
  effect(() => { void shown.value; void locale.value; queueMicrotask(sync); requestAnimationFrame(sync) })
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true })
  for (const type of ['input', 'change', 'focusout', 'keyup']) document.addEventListener(type, sync, true)
  Object.assign(window, { reading: set })
  set(variant)
  sync()
}

// ---- Jean and the fake brain, on their own ports, stopped by their PIDs.
/** @type {import('node:child_process').ChildProcess[]} */
const servers = []
const stop = () => { for (const one of servers.splice(0)) one.kill() }
process.on('exit', stop)
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) process.on(signal, () => process.exit(130))
async function serve() {
  const answers = (/** @type {number} */ port) => fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)
  if (await answers(APP) || await answers(BRAIN)) throw new Error(`Something already answers on ${APP} or ${BRAIN}: not started.`)
  servers.push(spawn(process.execPath, ['scripts/serve.js'], { cwd: REPO, env: { ...process.env, PORT: String(APP) }, stdio: 'ignore' }),
    spawn(process.execPath, ['test/fixtures/fake-brain.js'], { cwd: REPO, env: { ...process.env, PORT: String(BRAIN), PACE: '2' }, stdio: 'ignore' }))
  for (const port of [APP, BRAIN]) { for (let tries = 0; !(await answers(port)); tries++) { if (tries > 80) throw new Error(`Nothing on ${port}`); await new Promise((done) => setTimeout(done, 150)) } }
}

/** @typedef {import('playwright').Page} Page */
/** @param {string} engine */
async function launch(engine) {
  // Firefox started from here finds no profile folder of its own: an empty home for it.
  const home = join(OUT, '.firefox-home')
  if (engine === 'firefox') mkdirSync(home, { recursive: true })
  return LAUNCHERS[/** @type {keyof typeof LAUNCHERS} */ (engine)].launch({ headless: !HEADED, ...(engine === 'firefox' && { env: { ...process.env, CFFIXED_USER_HOME: home } }) })
}

const settle = (/** @type {Page} */ page, ms = 120) => page.evaluate((wait) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, wait)))), ms)
/**
 * The keyboard nowhere, the pointer away, and a list or a picker left open put away by presses on the pane's head: headless Firefox keeps a date's
 * picker open when its field loses the keyboard, and the picker takes the next press, with the prototype or without.
 * @param {Page} page
 */
async function away(page) {
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  for (let presses = 0; presses < 2; presses++) { await page.locator('app-preview .pane-head h2').first().click(); await settle(page, 60) }
  await page.mouse.move(2, 2)
}
const cellAt = (/** @type {Page} */ page, /** @type {number} */ row, /** @type {number} */ column) => page.locator(`.table-grid tbody tr:nth-child(${row + 1}) > :nth-child(${column + 1})`)
const ask = async (/** @type {Page} */ page, /** @type {string} */ text) => { await page.locator('#prompt').fill(text); await page.locator('#prompt').press('Enter') }
const answered = (/** @type {Page} */ page, /** @type {number} */ count) => page.waitForFunction((n) => document.querySelectorAll('.msg-jean .prose').length >= n && !document.querySelector('.msg-jean.is-streaming'), count, { timeout: 30000 })

/**
 * A fresh Jean in a language, the collection made and filled by the fake brain as a brain would, Jean's rows accepted.
 * @param {import('playwright').Browser} browser @param {string} lang @param {{ width?: number, height?: number }} [size]
 */
async function fresh(browser, lang, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce', deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => /ResizeObserver/.test(error.message) || console.log('  page error:', error.message.slice(0, 200)))
  await page.goto(ADDRESS)
  await page.locator('.hero-question').waitFor()
  await page.evaluate(async ({ lang, brain }) => {
    const [{ setLocale }, { addBrain }, { unlock }] = await Promise.all([import('/ui/state.js'), import('/ui/brains.js'), import('/ui/caps.js')])
    await setLocale(lang)
    await addBrain({ id: 'claude', provider: 'claudecode', api: 'openai', baseURL: brain, model: 'haiku' })
    await unlock('tables')
  }, { lang, brain: `http://127.0.0.1:${BRAIN}/v1` })
  await page.locator(`html[lang="${lang}"]`).waitFor()
  await ask(page, `Call table_create with ${JSON.stringify(FAIR)}`)
  await answered(page, 1)
  const place = await page.evaluate(async () => (await import('/caps/tables/tables.js')).shown.value?.folder)
  await ask(page, `Call table_change with ${JSON.stringify({ table: place, rows: ROWS, why: 'the committee’s notes' })}`)
  await answered(page, 2)
  await page.locator('.table-grid tbody tr').nth(7).waitFor()
  await page.locator('.review .button.primary').click()
  await page.waitForFunction(() => !document.querySelector('.table-grid .is-jean'))
  await page.mouse.move(2, 2)
  await settle(page, 200)
  return { context, page }
}

/** Jean changes four cells, which wait. @param {Page} page */
async function jeanChanges(page) {
  await page.evaluate(async (waiting) => {
    const { shown, change } = await import('/caps/tables/tables.js'), one = /** @type {any} */ (shown.value)
    const id = (/** @type {string} */ name) => one.table.properties.find((/** @type {{ name: string }} */ property) => property.name === name).id
    const rows = [...document.querySelectorAll('.table-grid tbody tr')].map((row) => /** @type {HTMLElement} */ (row).dataset.row)
    await change(one, waiting.map(([row, set]) => ({ row: rows[/** @type {number} */ (row)], set: Object.fromEntries(Object.entries(/** @type {object} */ (set)).map(([name, value]) => [id(name), value])) })), 'jean', 'the treasurer’s email')
  }, WAITING)
  await page.locator('.table-grid :is(td, th).is-jean').nth(3).waitFor()
  await settle(page, 200)
}

// ---- Pictures, read back: a PNG's pixels, to see what is drawn where without trusting what the styles say.
/** @param {Buffer} png @returns {{ width: number, height: number, data: Uint8Array }} its pixels, four bytes each */
function pixels(png) {
  let at = 8, width = 0, height = 0, type = 6
  const parts = []
  while (at < png.length) {
    const size = png.readUInt32BE(at), name = png.toString('latin1', at + 4, at + 8), body = png.subarray(at + 8, at + 8 + size)
    if (name === 'IHDR') [width, height, type] = [body.readUInt32BE(0), body.readUInt32BE(4), body[9]]
    if (name === 'IDAT') parts.push(body)
    at += size + 12
  }
  const step = type === 6 ? 4 : type === 2 ? 3 : 0
  if (!step) throw new Error(`A PNG of colour type ${type}`)
  const raw = inflateSync(Buffer.concat(parts)), line = width * step, data = new Uint8Array(width * height * 4)
  let prior = new Uint8Array(line)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (line + 1)], row = Uint8Array.from(raw.subarray(y * (line + 1) + 1, (y + 1) * (line + 1)))
    for (let x = 0; x < line; x++) {
      const a = x >= step ? row[x - step] : 0, b = prior[x], c = x >= step ? prior[x - step] : 0, p = a + b - c
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c
      row[x] = (row[x] + [0, a, b, (a + b) >> 1, paeth][filter]) & 255
    }
    for (let x = 0; x < width; x++) data.set([row[x * step], row[x * step + 1], row[x * step + 2], 255], (y * width + x) * 4)
    prior = row
  }
  return { width, height, data }
}
/** How far two colours are apart. @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
const apart = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
/** A picture's ground, its most frequent colour, and its ink: how many pixels are far from it, between which columns, and the colour furthest from it. @param {ReturnType<typeof pixels>} image */
function inkOf({ width, height, data }) {
  const counts = new Map()
  for (let i = 0; i < data.length; i += 4) { const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; counts.set(key, (counts.get(key) ?? 0) + 1) }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0][0], ground = [top >> 16, (top >> 8) & 255, top & 255]
  let [count, from, to, far, furthest] = [0, width, -1, ground, 0]
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, colour = [data[i], data[i + 1], data[i + 2]], gap = apart(colour, ground)
    if (gap > 24) { count++; from = Math.min(from, x); to = Math.max(to, x) }
    if (gap > furthest) [furthest, far] = [gap, colour]
  }
  return { count, from: count ? from : -1, to, ground, far, width }
}
/** WCAG's contrast between two colours. @param {number[]} a @param {number[]} b */
function contrast(a, b) {
  const light = (/** @type {number[]} */ rgb) => rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}
/** A cell brought to the middle of what the table shows, clear of the heads' column and of a row's Accept and Reject, which stay at its edges. @param {Page} page @param {number} row @param {number} column */
const middle = async (page, row, column) => { await cellAt(page, row, column).evaluate((cell) => cell.scrollIntoView({ block: 'nearest', inline: 'center' })); await settle(page, 30) }
/** A cell's picture, a little inside its lines. @param {Page} page @param {number} row @param {number} column @param {number} [inset] */
async function cellPicture(page, row, column, inset = 2) {
  await middle(page, row, column)
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await cellAt(page, row, column).boundingBox())
  const clip = { x: Math.ceil(box.x) + inset, y: Math.ceil(box.y) + inset, width: Math.floor(box.width) - 2 * inset - 1, height: Math.floor(box.height) - 2 * inset - 1 }
  return { box, image: pixels(await page.screenshot({ clip })) }
}
const hex = (/** @type {number[]} */ rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`

// ---- 1. What assistive technology gets.
/** The table as Playwright's ARIA snapshot reads it, its fields as the DOM has them, and the engine's own tree where it can be asked. @param {Page} page @param {string} engine */
async function tree(page, engine) {
  const aria = await page.locator('.table-grid').ariaSnapshot()
  const fields = await page.evaluate(() => [...document.querySelectorAll('.table-grid tbody :is(input, select)')].map((field) => { const one = /** @type {HTMLInputElement} */ (field)
    return [one.localName, one.type, one.title, one.type === 'checkbox' ? one.checked : one.value, one.tabIndex, one.disabled, one.getAttribute('aria-invalid'), one.getAttribute('aria-description'), one.getAttribute('aria-describedby'), one.getAttribute('aria-hidden'), one.labels?.length].join('|') }).join('\n'))
  let own = /** @type {string | null} */ (null)
  if (engine === 'chromium') {
    // Chromium's own accessibility tree, over its protocol: every node of the table it doesn't ignore, by role, name, value and state.
    const session = await page.context().newCDPSession(page), { nodes } = await session.send('Accessibility.getFullAXTree')
    await session.detach()
    const by = new Map(nodes.map((node) => [node.nodeId, node])), table = nodes.find((node) => node.role?.value === 'table' && node.name?.value === FAIR.name)
    const lines = /** @type {string[]} */ ([]), walk = (/** @type {any} */ node, /** @type {number} */ depth) => {
      if (!node.ignored && node.role?.value !== 'InlineTextBox') lines.push(`${'  '.repeat(depth)}${node.role?.value} "${node.name?.value ?? ''}"${node.value ? ` = ${node.value.value}` : ''}${node.description?.value ? ` (${node.description.value})` : ''} ${(node.properties ?? [])
        .filter((/** @type {any} */ property) => !['focused', 'url'].includes(property.name)).map((/** @type {any} */ property) => `${property.name}:${property.value.value}`).join(' ')}`)
      for (const id of node.childIds ?? []) by.has(id) && walk(by.get(id), depth + (node.ignored ? 0 : 1))
    }
    if (table) walk(table, 0)
    own = lines.join('\n')
  }
  if (engine === 'webkit') {
    // WebKit's own accessibility properties of each field and each reading, over its inspector's protocol, which Playwright keeps to itself.
    try {
      const impl = /** @type {any} */ (page)._connection.toImpl(page), session = (impl.delegate ?? impl._delegate)._session
      const { root } = await session.send('DOM.getDocument', {}), ask = async (/** @type {string} */ selector) => {
        const { nodeIds } = await session.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector }), lines = []
        for (const nodeId of nodeIds) { const { properties: p } = await session.send('DOM.getAccessibilityPropertiesForNode', { nodeId }); lines.push([p.role, p.label, p.ignored, p.hidden, p.disabled, p.readonly, p.required, p.invalid, p.checked, p.isPopUpButton].join('|')) }
        return lines
      }
      own = [...await ask('.table-grid tbody :is(input, select)'), `readings not ignored: ${(await ask('.table-reading')).filter((line) => !/\|true\|/.test(line)).length}`].join('\n')
    } catch (error) { own = `not read: ${String(error).slice(0, 120)}` }
  }
  return { aria, fields, own }
}

// ---- The readings, and whether each says what its field holds.
/** @param {Page} page */
const readings = (page) => page.evaluate(async () => {
  const { intlLocales } = await import('/core/i18n.js'), found = [], wrong = []
  for (const reading of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.table-reading'))) {
    const field = /** @type {HTMLInputElement} */ (reading.parentElement?.querySelector(':scope > :is(input, select)')), text = reading.textContent ?? '', value = field.value
    const want = !value ? '' : field.type === 'number' ? new Intl.NumberFormat(intlLocales(), /^(Estimate|Paid)$/.test(field.title) ? { style: 'currency', currency: 'EUR', trailingZeroDisplay: 'stripIfInteger' } : {}).format(Number(value))
      : field.type === 'date' ? new Intl.DateTimeFormat(intlLocales(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00Z`)) : value
    found.push(text)
    if (text !== want) wrong.push(`${field.title}: "${text}" for "${value}"`)
  }
  return { count: found.length, wrong, first: found.slice(0, 6) }
})

/** The rows turned upside down, then Search keeping some: the same rows of the page then hold other values, and each reading must follow. @param {Page} page */
async function redrawn(page) {
  const turn = () => page.evaluate(async () => { const { shown, reshapeTable } = await import('/caps/tables/tables.js'), one = /** @type {any} */ (shown.value); await reshapeTable(one, { order: one.rows.map((/** @type {{ id: string }} */ row) => row.id).reverse() }, false) })
  await turn()
  await settle(page, 250)
  const sorted = await readings(page), first = await cellAt(page, 0, C.item).locator('input').inputValue()
  // Search opens as its glyph is pressed; Escape empties it.
  await page.locator('.creations-find').click()
  await page.keyboard.type('Food')
  await settle(page, 250)
  const found = await readings(page)
  await page.keyboard.press('Escape')
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  await turn()
  await settle(page, 250)
  const back = await readings(page)
  return { count: `${sorted.count} with ${first} first, ${found.count} for Food, ${back.count} back`, wrong: [...sorted.wrong, ...found.wrong, ...back.wrong] }
}

// ---- 2. Keys: one script, what has the keyboard and what the fields hold after each step.
/** @param {Page} page */
const where = (page) => page.evaluate(() => {
  const at = /** @type {HTMLInputElement | null} */ (document.activeElement), cell = at?.closest?.('.table-grid tbody :is(td, th)'), row = cell?.parentElement
  const place = cell && row ? `r${[...(row.parentElement?.children ?? [])].indexOf(row)}c${[...row.children].indexOf(cell)} ` : ''
  const active = !at || at === document.body ? 'the page' : at === cell ? `${place}cell` : `${place}${at.localName}${at.type ? `[${at.type}]` : ''} ${at.title || at.getAttribute('aria-label') || at.id || at.className}`
  const values = [...document.querySelectorAll('.table-grid tbody tr')].map((line) => [...line.querySelectorAll(':scope > [tabindex] > :is(input, select)')].map((field) => { const one = /** @type {HTMLInputElement} */ (field); return one.type === 'checkbox' ? String(one.checked) : one.value }).join('|')).join(' / ')
  // With the prototype on: the cell that has the keyboard shows its field, and no other does.
  const reading = cell?.querySelector(':scope > .table-reading'), field = cell?.querySelector(':scope > :is(input, select)')
  const shows = document.documentElement.dataset.reading && reading && field ? getComputedStyle(field).opacity === '1' && getComputedStyle(reading).display === 'none' : null
  const others = document.documentElement.dataset.reading ? [...document.querySelectorAll('.table-reading')].filter((one) => one.parentElement !== cell && (getComputedStyle(one).display === 'none' || getComputedStyle(/** @type {Element} */ (one.parentElement?.querySelector(':scope > :is(input, select)'))).opacity !== '0')).length : 0
  return { active, values, shows, others }
})
/** @param {Page} page */
async function keys(page) {
  const log = /** @type {{ step: string, active: string, values: string, shows: boolean | null, others: number }[]} */ ([]), all = process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
  const note = async (/** @type {string} */ step) => { await settle(page, 140); log.push({ step, ...await where(page) }); if (TRACE) console.log('   ', step, '→', log.at(-1)?.active, log.at(-1)?.shows ?? '', log.at(-1)?.others || '') }
  const press = async (/** @type {string[]} */ ...names) => { for (const name of names) { await page.keyboard.press(name); await note(name) } }
  const select = async (/** @type {number} */ row, /** @type {number} */ column) => { await cellAt(page, row, column).focus(); await note(`cell r${row}c${column} selected`) }
  const type = async (/** @type {string} */ text) => { await page.keyboard.type(text); await note(`type ${text}`) }
  // Tab through the first row and into the second, and back.
  await cellAt(page, 0, C.item).locator('input').focus()
  await note('the first field')
  await press(...Array(14).fill('Tab'), 'Shift+Tab', 'Shift+Tab')
  // Escape leaves a field for its cell; the arrows select the next; the end of a row goes on to the next.
  await press('Escape', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp')
  await select(0, C.receipt)
  await press('ArrowRight', 'ArrowLeft')
  // A number: Enter into its field, written, Enter keeps it and selects the cell under; there, Escape restores.
  await select(2, C.estimate)
  await press('Enter', all)
  await type('725')
  await press('Enter', 'Enter')
  await type('9')
  await press('Escape')
  // A date: a step of its day or month kept with Enter, then one left with Escape.
  await select(0, C.due)
  await press('Enter', 'ArrowUp', 'Enter', 'Enter', 'ArrowDown', 'Escape')
  // A status: its first letter picks it.
  await select(1, C.status)
  await press('Enter')
  await type('p')
  await press('Enter', 'Enter')
  await type('b')
  await press('Escape')
  // A choice typed, which adds it.
  await select(4, C.category)
  await press('Enter', all)
  await type('Decor')
  await press('Enter')
  // The empty date and the empty number: entered and left; a number written then left with Escape stays empty.
  await select(2, C.due)
  await press('Enter', 'Escape')
  await select(3, C.paid)
  await press('Enter')
  await type('15')
  await press('Escape')
  // A box ticked with Space, and the row's name left as it was.
  await select(0, C.receipt)
  await press('Enter', 'Space', 'Escape')
  await select(0, C.item)
  await press('Enter')
  await type(' X')
  await press('Escape', 'ArrowDown')
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  await settle(page, 300)
  log.push({ step: 'in the end', ...await where(page) })
  return log
}

// ---- 3. Pointer: one press on a cell, at its start, its middle and its end, where a picker's glyph is.
/** @param {Page} page */
async function pointer(page) {
  // The status last: its list, once open, takes the presses that follow in Firefox.
  const targets = /** @type {const} */ ([['number', 1, C.estimate], ['empty number', 3, C.paid], ['date', 1, C.due], ['empty date', 2, C.due], ['choice', 1, C.category], ['status', 1, C.status]])
  const out = /** @type {Record<string, unknown>[]} */ ([])
  for (const [kind, row, column] of targets) for (const at of /** @type {const} */ (['start', 'middle', 'end'])) {
    await away(page)
    await middle(page, row, column)
    const cell = cellAt(page, row, column), box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await cell.boundingBox())
    const rtl = await cell.evaluate((one) => getComputedStyle(one).direction === 'rtl'), inline = { start: 22, middle: box.width / 2, end: box.width - 14 }[at]
    const [x, y] = [box.x + (rtl ? box.width - inline : inline), box.y + box.height / 2]
    const hit = await page.evaluate(([px, py]) => {
      const one = /** @type {HTMLInputElement} */ (document.elementFromPoint(px, py)), log = /** @type {string[]} */ ([])
      Object.assign(window, { pressed: log })
      for (const type of ['pointerdown', 'mousedown', 'focusin', 'pointerup', 'mouseup', 'click', 'input', 'change']) document.addEventListener(type, (event) => log.push(`${type}>${/** @type {Element} */ (event.target).localName}`), { capture: true, once: true })
      return `${one?.localName}${one?.type ? `[${one.type}]` : ''} ${one?.title ?? ''}`
    }, [x, y])
    const state = () => page.evaluate(([r, c]) => {
      const cell = document.querySelector(`.table-grid tbody tr:nth-child(${r + 1}) > :nth-child(${c + 1})`), field = /** @type {HTMLInputElement} */ (cell?.querySelector(':scope > :is(input, select)')), reading = cell?.querySelector(':scope > .table-reading')
      let open = /** @type {boolean | string} */ ('?')
      try { open = field.matches(':open') } catch {}
      return { has: document.activeElement === field, open, seen: getComputedStyle(field).opacity === '1' && (!reading || getComputedStyle(reading).display === 'none'), value: field.value }
    }, [row, column])
    await page.mouse.move(x, y)
    await page.mouse.down()
    await settle(page, 60)
    const down = await state()
    await page.mouse.up()
    await settle(page, 200)
    const up = await state(), events = await page.evaluate(() => /** @type {any} */ (window).pressed.join(' '))
    // A list or a picker the press opened is closed again, or the field left for its cell: once, since Escape on a selected cell closes the pane.
    // Headless Firefox keeps a date's picker open through that, over the rows under it: a press on its glyph again closes it.
    await page.keyboard.press('Escape')
    await settle(page, 60)
    if ((await state()).open === true) { await page.mouse.click(box.x + (rtl ? 14 : box.width - 14), y); await settle(page, 150) }
    out.push({ kind, at, hit, events, 'has the keys on press': down.has, 'open on press': down.open, 'open after': up.open, 'field seen': up.seen, value: up.value })
  }
  await away(page)
  // The number that was empty is empty again, whatever its spinner made of it: written as the person's own change, with no key or press a list left open could take.
  await page.evaluate(async () => {
    const { shown, change } = await import('/caps/tables/tables.js'), one = /** @type {any} */ (shown.value), row = /** @type {HTMLElement} */ (document.querySelector('.table-grid tbody tr:nth-child(4)')).dataset.row
    await change(one, [{ row, set: { [one.table.properties.find((/** @type {{ name: string }} */ property) => property.name === 'Paid').id]: null } }], 'user')
  })
  await settle(page, 200)
  return out
}

// ---- 4. What is left to see of a field under its reading: the readings made unseen, each cell should be bare.
/** @param {Page} page @param {boolean} on whether the prototype is */
async function leftovers(page, on) {
  const out = /** @type {Record<string, unknown>} */ ({})
  await page.evaluate(() => { /** @type {HTMLElement} */ (document.activeElement)?.blur(); document.documentElement.toggleAttribute('data-reading-blank', true) })
  await page.mouse.move(2, 2)
  await settle(page)
  for (const [kind, row, column] of /** @type {const} */ ([['number', 1, C.estimate], ['empty number', 3, C.paid], ['date', 1, C.due], ['empty date', 2, C.due], ['choice', 1, C.category], ['status', 1, C.status]])) {
    const { image } = await cellPicture(page, row, column), ink = inkOf(image)
    out[kind] = on ? ink.count : `${ink.count} px of ink, columns ${ink.from}–${ink.to} of ${ink.width}`
  }
  await page.evaluate(() => document.documentElement.removeAttribute('data-reading-blank'))
  return out
}

// ---- 5. Forced colours: the readings go and the fields show.
/** @param {Page} page */
async function forced(page) {
  await page.emulateMedia({ forcedColors: 'active' })
  await settle(page)
  const out = await page.evaluate(() => ({
    emulated: matchMedia('(forced-colors: active)').matches,
    'readings shown': [...document.querySelectorAll('.table-reading')].filter((one) => getComputedStyle(one).display !== 'none').length,
    'fields unseen': [...document.querySelectorAll('.table-grid tbody :is(input, select)')].filter((one) => getComputedStyle(one).opacity !== '1').length,
  }))
  return out
}

// ---- 6. States: Jean's tint and its corner, a cell's ring and its field's, a refused value's line.
/** @param {Page} page @param {boolean} on */
async function states(page, on) {
  const out = /** @type {Record<string, unknown>} */ ({})
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  await page.mouse.move(2, 2)
  await settle(page)
  // Paid of Posters, which Jean changed, beside Paid of Bouncy castle, which it didn't: their grounds, and the changed cell's corner.
  const [tinted, plain] = [await cellPicture(page, 6, C.paid, 0), await cellPicture(page, 5, C.paid, 0)], rtl = await page.evaluate(() => document.documentElement.dir === 'rtl')
  const corner = (/** @type {ReturnType<typeof pixels>} */ { data, width }) => { const i = (2 * width + (rtl ? 2 : width - 3)) * 4; return [data[i], data[i + 1], data[i + 2]] }
  out.tint = `${hex(inkOf(tinted.image).ground)} beside ${hex(inkOf(plain.image).ground)}, its corner ${hex(corner(tinted.image))}`
  out['tint seen'] = apart(inkOf(tinted.image).ground, inkOf(plain.image).ground) > 6 && apart(corner(tinted.image), inkOf(tinted.image).ground) > 24
  // The ring of a cell selected, then of its field: the colour of the cell's second pixel in from its edge, half way down.
  const edge = async () => {
    const { image: { data, width, height } } = await cellPicture(page, 5, C.estimate, 0), at = (/** @type {number} */ x) => { const i = (Math.floor(height / 2) * width + (rtl ? width - 1 - x : x)) * 4; return [data[i], data[i + 1], data[i + 2]] }
    return hex([0, 1, 2, 3, 4].map(at).sort((a, b) => apart(b, at(14)) - apart(a, at(14)))[0])
  }
  const bare = await edge()
  await cellAt(page, 5, C.estimate).focus()
  await settle(page)
  const ring = await edge()
  await page.keyboard.press('Enter')
  await settle(page)
  const fieldRing = await edge(), shown = await cellAt(page, 5, C.estimate).evaluate((cell) => getComputedStyle(/** @type {Element} */ (cell.querySelector('input'))).opacity)
  await page.keyboard.press('Escape')
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  out.ring = `at the cell's edge: the cell selected ${ring}, its field with the keys ${fieldRing} (its opacity ${shown})`
  out.bare = bare
  out['ring seen'] = bare !== ring && bare !== fieldRing
  // A refused value on a field under a reading, which no column gives today: marked as view.js marks one, by hand. The field must show, its line with it.
  await cellAt(page, 4, C.estimate).locator('input').evaluate((field) => field.setAttribute('aria-invalid', 'true'))
  await settle(page)
  const refused = await cellAt(page, 4, C.estimate).evaluate((cell) => { const field = /** @type {Element} */ (cell.querySelector('input')), reading = cell.querySelector('.table-reading'); return { opacity: getComputedStyle(field).opacity, line: getComputedStyle(field).borderBlockEndColor, reading: reading ? getComputedStyle(reading).display : 'none there' } })
  const line = await cellPicture(page, 4, C.estimate, 0), under = (line.image.height - 2) * line.image.width * 4 + Math.floor(line.image.width / 2) * 4
  out.refused = `field opacity ${refused.opacity}, its reading ${refused.reading}, the line under it ${hex([line.image.data[under], line.image.data[under + 1], line.image.data[under + 2]])} (${refused.line})`
  out['refused seen'] = refused.opacity === '1' && (!on || refused.reading === 'none')
  await cellAt(page, 4, C.estimate).locator('input').evaluate((field) => field.removeAttribute('aria-invalid'))
  await settle(page)
  return out
}

// ---- 8. Text: what selecting a row then copying holds, what a search of the page finds, what print shows.
/** @param {Page} page */
async function words(page) {
  const out = /** @type {Record<string, unknown>} */ ({})
  const row = () => page.evaluate(() => {
    const line = /** @type {Element} */ (document.querySelector('.table-grid tbody tr:nth-child(2)')), selection = /** @type {Selection} */ (getSelection())
    selection.selectAllChildren(line)
    const text = selection.toString().replace(/\s+/g, ' ').trim()
    selection.removeAllRanges()
    return text
  })
  out['a row selected holds'] = await row()
  // The whole page selected with the keyboard from a selected cell, then copied: what the copy would hold of the table.
  await cellAt(page, 1, C.owner).focus()
  await page.evaluate(() => document.addEventListener('copy', () => { const selection = /** @type {Selection} */ (getSelection()), grid = /** @type {Element} */ (document.querySelector('.table-grid'))
    const text = selection.toString(), money = [...document.querySelectorAll('.table-reading[data-kind="number"] > bdi')].map((one) => one.textContent ?? '').filter(Boolean), days = [...document.querySelectorAll('.table-reading[data-kind="date"] > bdi')].map((one) => one.textContent ?? '').filter(Boolean)
    Object.assign(window, { copied: `the table ${selection.rangeCount && selection.containsNode(grid, true) ? 'is' : 'is not'} in what is selected; of its ${money.length + days.length} amounts and days as read, ${[...money, ...days].filter((one) => text.includes(one)).length} are in the copy; of its rows' names, ${[...grid.querySelectorAll('tbody th input')].filter((one) => text.includes(`\n${/** @type {HTMLInputElement} */ (one).value}\n`)).length}` }) }, { once: true }))
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+c' : 'Control+c')
  await settle(page)
  out['select all, copy: of the table'] = await page.evaluate(() => { const copied = /** @type {any} */ (window).copied; getSelection()?.removeAllRanges(); /** @type {HTMLElement} */ (document.activeElement)?.blur(); return copied ?? 'no copy told' })
  if (await page.evaluate(() => Boolean(document.documentElement.dataset.reading))) {
    await page.evaluate(() => document.documentElement.toggleAttribute('data-reading-select', true))
    out['a row selected holds, were readings selectable'] = await row()
    await page.evaluate(() => document.documentElement.removeAttribute('data-reading-select'))
  }
  // window.find, the nearest a script gets to the browser's own Find: what it finds of a reading's words and of a field's.
  out.find = await page.evaluate(async () => {
    const { intlLocales } = await import('/core/i18n.js'), found = /** @type {Record<string, unknown>} */ ({})
    const money = new Intl.NumberFormat(intlLocales(), { style: 'currency', currency: 'EUR', trailingZeroDisplay: 'stripIfInteger' }).format(300), day = new Intl.DateTimeFormat(intlLocales(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date('2026-09-19T00:00Z'))
    for (const [name, text] of [['the money', money], ['the bare number', '300'], ['the day', day], ['a status', 'To do'], ['a name', 'Bouncy castle']]) {
      // From the table's start on, so that the conversation's own words, before it, aren't what is found.
      getSelection()?.collapse(document.querySelector('.table-scroll'), 0)
      let hit = /** @type {unknown} */ (null)
      try { hit = /** @type {any} */ (window).find(text, false, false, false) } catch (error) { hit = String(error).slice(0, 40) }
      const node = getSelection()?.anchorNode, at = node && (node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement)
      found[`${name} (${text})`] = hit !== true ? 'not found' : at?.closest('.table-reading') ? 'found, in a reading' : at?.closest('.table-grid') ? `found, in the table (${at.localName})` : 'found, outside the table'
    }
    getSelection()?.removeAllRanges()
    return found
  })
  // Print, as the browser's own would lay the page out.
  await page.emulateMedia({ media: 'print' })
  await settle(page)
  out.print = await page.evaluate(() => { const grid = document.querySelector('.table-grid'), box = grid?.getBoundingClientRect(); return box && box.width > 0 && box.height > 0 ? `the table is laid out, ${Math.round(box.width)} px wide` : 'the pane and its table are not laid out at all' })
  await page.emulateMedia({ media: 'screen' })
  await settle(page)
  return out
}

// ---- 9. The pointer across the cells: how much of the table's picture changes at each step.
/** @param {Page} page @param {string} name */
async function passes(page, name) {
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  await page.mouse.move(2, 2)
  await middle(page, 3, C.estimate)
  const scroll = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('.table-scroll').boundingBox())
  const grip = /** @type {{ x: number, width: number }} */ (await cellAt(page, 0, 0).boundingBox())
  const clip = { x: Math.ceil(scroll.x), y: Math.ceil(scroll.y), width: Math.floor(scroll.width), height: Math.floor(scroll.height) }, visible = (/** @type {{ x: number, width: number }} */ box) => box.x >= scroll.x && box.x + box.width <= scroll.x + scroll.width
  void grip
  const path = [...Array(8).keys()].map((row) => [row, C.estimate]).concat([C.category, C.owner, C.due, C.status, C.estimate, C.paid].map((column) => [3, column]))
  let last = pixels(await page.screenshot({ clip })), changed = /** @type {number[]} */ ([]), swaps = 0, shown = ''
  for (const [i, [row, column]] of path.entries()) {
    const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await cellAt(page, row, column).boundingBox())
    if (!visible(box)) continue
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 })
    await settle(page, 40)
    const now = pixels(await page.screenshot({ clip }))
    let count = 0
    // Without the handles' column, which shows a row's handle as the pointer passes today, if it is in view.
    const skip = Math.max(0, Math.ceil(grip.x + grip.width - clip.x) + 1)
    for (let p = 0; p < now.data.length; p += 4) if ((p / 4) % now.width >= skip && apart(now.data.subarray(p, p + 3), last.data.subarray(p, p + 3)) > 16) count++
    changed.push(count)
    const fields = await page.evaluate(() => [...document.querySelectorAll('.table-reading')].filter((one) => getComputedStyle(one).display === 'none').map((one) => { const cell = /** @type {Element} */ (one.parentElement), line = /** @type {Element} */ (cell.parentElement); return `r${[...(line.parentElement?.children ?? [])].indexOf(line)}c${[...line.children].indexOf(cell)}` }).join(','))
    if (fields !== shown) swaps++
    shown = fields
    last = now
    if (i === 3) await page.screenshot({ path: join(OUT, `${name}-pointer-on-row-4.png`), clip })
  }
  await page.mouse.move(2, 2)
  return { steps: changed.length, 'steps where a cell turned into its field': swaps, 'pixels changed at each step': changed.join(' '), 'on average': Math.round(changed.reduce((sum, n) => sum + n, 0) / Math.max(1, changed.length)) }
}

// ---- 10. Direction, and where a reading sits against its field's own words.
/** @param {Page} page */
async function direction(page) {
  const out = /** @type {Record<string, unknown>} */ ({})
  // A negative amount, written by hand in Paid of Programmes, and a large one.
  for (const [row, text] of /** @type {const} */ ([[7, '-60'], [4, '1234.5']])) {
    await cellAt(page, row, C.paid).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await settle(page, 200)
  }
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  await page.mouse.move(2, 2)
  await settle(page, 200)
  out.readings = await page.evaluate(() => {
    const said = /** @type {Record<string, unknown>} */ ({}), glyphs = (/** @type {Element} */ bdi) => {
      // Each character's place from the left, so that the order on screen is known: the sign, the figures, the currency.
      const node = /** @type {Text} */ (bdi.firstChild), range = document.createRange(), places = []
      for (let i = 0; node && i < node.length; i++) { range.setStart(node, i); range.setEnd(node, i + 1); const box = range.getBoundingClientRect(); if (box.width > 0) places.push([node.data[i], Math.round(box.left)]) }
      return places.sort((a, b) => /** @type {number} */ (a[1]) - /** @type {number} */ (b[1])).map(([letter]) => letter).join('')
    }
    for (const [name, selector] of [['negative', 'tr:nth-child(8) > :nth-child(8)'], ['thousands', 'tr:nth-child(5) > :nth-child(8)'], ['money', 'tr:nth-child(2) > :nth-child(7)'], ['date', 'tr:nth-child(2) > :nth-child(5)'], ['choice', 'tr:nth-child(2) > :nth-child(3)'], ['status', 'tr:nth-child(2) > :nth-child(6)']]) {
      const cell = /** @type {Element} */ (document.querySelector(`.table-grid tbody ${selector}`)), bdi = cell.querySelector('.table-reading > bdi')
      if (!bdi) { said[name] = 'no reading'; continue }
      const [box, own] = [cell.getBoundingClientRect(), bdi.getBoundingClientRect()], text = bdi.textContent ?? ''
      // The same words alone on the page, in their own direction: what they should look like, whatever is around.
      const alone = document.body.appendChild(Object.assign(document.createElement('bdi'), { textContent: text, style: 'position: fixed; inset-block-start: 0; inset-inline-start: 0; white-space: nowrap; font: 0.9rem/1 sans-serif;' }))
      const reference = glyphs(alone)
      alone.remove()
      said[name] = { text, marks: [...text].filter((letter) => /[‎‏؜‪-‮⁦-⁩]/.test(letter)).map((letter) => `U+${letter.codePointAt(0)?.toString(16).toUpperCase()}`).join(' '), 'on screen, left to right': glyphs(bdi), 'as alone': glyphs(bdi) === reference,
        'from the left edge': Math.round(own.left - box.left), 'from the right edge': Math.round(box.right - own.right), direction: getComputedStyle(bdi).direction, cut: bdi.scrollWidth > bdi.clientWidth + 1 }
    }
    return said
  })
  return out
}

// ---- 3, again: a press at the end of a number's reading, where its field's spinner is, with the spinner and without.
/** @param {Page} page */
async function spinner(page) {
  const out = /** @type {Record<string, unknown>} */ ({}), field = cellAt(page, 5, C.estimate).locator('input')
  for (const plain of [false, true]) {
    await away(page)
    await page.evaluate((plain) => document.documentElement.toggleAttribute('data-reading-plain', plain), plain)
    await middle(page, 5, C.estimate)
    // Where the field's own direction ends: once written left to right, its spinner is on the right in an Arabic table too, at its cell's start.
    const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await cellAt(page, 5, C.estimate).boundingBox()), rtl = await field.evaluate((one) => getComputedStyle(one).direction === 'rtl'), was = await field.inputValue()
    await page.mouse.click(rtl ? box.x + 14 : box.x + box.width - 14, box.y + box.height / 2)
    await settle(page, 250)
    out[plain ? 'without its spinner' : 'with its spinner'] = `${was} → ${await field.inputValue()}, the keyboard ${await field.evaluate((one) => one === document.activeElement) ? 'in its field' : 'not in its field'}`
    await page.keyboard.press('Escape')
    // Its field with the keys, for the picture: how far the figure is from where its reading was.
    if (plain) { await page.keyboard.press('Enter'); await settle(page); await page.locator('app-preview').first().screenshot({ path: join(OUT, `${await page.evaluate(() => `${navigator.userAgent.includes('Firefox') ? 'firefox' : navigator.userAgent.includes('Chrome') ? 'chromium' : 'webkit'}-${document.documentElement.lang}`)}-field-without-spinner.png`) }); await page.keyboard.press('Escape') }
  }
  await page.evaluate(() => { /** @type {HTMLElement} */ (document.activeElement)?.blur(); document.documentElement.removeAttribute('data-reading-plain') })
  return out
}

// ---- 6, again: a value a column refuses, for real: an Email column added, and words that are no address written in it.
/** @param {Page} page @param {string} name */
async function refusedForReal(page, name) {
  await page.evaluate(async () => { const { shown, reshapeTable } = await import('/caps/tables/tables.js'); await reshapeTable(/** @type {any} */ (shown.value), { add: { name: 'Email', type: 'email' } }) })
  const field = cellAt(page, 1, 9).locator('input')
  await field.waitFor()
  await middle(page, 1, 9)
  await cellAt(page, 1, 9).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.type('nope')
  await page.keyboard.press('Enter')
  await settle(page, 250)
  const out = await cellAt(page, 1, 9).evaluate((cell) => { const field = /** @type {Element} */ (cell.querySelector('input')), said = cell.querySelector('.table-wrong'); return { invalid: field.getAttribute('aria-invalid'), 'its line': getComputedStyle(field).borderBlockEndColor, 'the form it takes is said': Boolean(said && said.getBoundingClientRect().height), reading: Boolean(cell.querySelector('.table-reading')) } })
  await page.locator('app-preview').first().screenshot({ path: join(OUT, `${name}-refused.png`) })
  await page.keyboard.press('Escape')
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  return out
}

/** The pane's picture. @param {Page} page @param {string} name */
async function shoot(page, name) {
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur())
  await page.mouse.move(2, 2)
  await settle(page, 150)
  const pane = page.locator('app-preview').first(), scroll = page.locator('.table-scroll')
  // The table's start, as it opens, then its amounts.
  await scroll.evaluate((one) => { one.scrollLeft = 0 })
  await settle(page, 30)
  await pane.screenshot({ path: join(OUT, `${name}-start.png`) })
  await middle(page, 0, C.estimate)
  await pane.screenshot({ path: join(OUT, `${name}.png`) })
  await scroll.evaluate((one) => { one.scrollLeft = 0 })
}

// ---- 7. Looks, by day and by night: a reading's contrast on its ground, a pill's, nothing left of a field, the ring.
/** @param {Page} page @param {string} name @param {boolean} on */
async function looks(page, name, on) {
  const out = /** @type {Record<string, unknown>} */ ({})
  for (const look of ['tilde', 'human', 'classic']) for (const theme of ['light', 'dark']) {
    await page.evaluate(async ([id, theme]) => { const { app, setLook } = await import('/ui/state.js'); setLook({ id: /** @type {any} */ (id) }); app.chosenTheme.value = /** @type {any} */ (theme) }, [look, theme])
    await page.locator(`html[data-look="${look}"][data-theme="${theme}"]`).waitFor()
    await settle(page, 500)
    await shoot(page, `${name}-look-${look}-${theme}`)
    const [money, date] = [inkOf((await cellPicture(page, 1, C.estimate)).image), inkOf((await cellPicture(page, 1, C.due)).image)]
    out[`${look} ${theme}`] = { money: contrast(money.far, money.ground), date: contrast(date.far, date.ground) }
    if (on) {
      // A pill's words on the pill's own ground, and the pill against the cell around it.
      await middle(page, 1, C.status)
      const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await cellAt(page, 1, C.status).locator('bdi').boundingBox())
      const pill = inkOf(pixels(await page.screenshot({ clip: { x: Math.ceil(box.x) + 4, y: Math.ceil(box.y) + 2, width: Math.floor(box.width) - 8, height: Math.floor(box.height) - 4 } }))), around = inkOf((await cellPicture(page, 1, C.status)).image)
      Object.assign(out[`${look} ${theme}`], { 'pill words': contrast(pill.far, pill.ground), 'pill on its cell': contrast(pill.ground, around.ground), 'left of fields': Object.values(await leftovers(page, true)).join(' ') })
    }
  }
  await page.evaluate(async () => { const { app, setLook } = await import('/ui/state.js'); setLook({ id: 'tilde' }); app.chosenTheme.value = 'light' })
  await page.locator('html[data-look="tilde"][data-theme="light"]').waitFor()
  await settle(page, 400)
  return out
}

// ---- 320 px wide: the same table on a phone's width.
/** @param {Page} page @param {string} name @param {string} engine */
async function narrow(page, name, engine) {
  await page.setViewportSize({ width: 320, height: 720 })
  await settle(page, 500)
  await middle(page, 1, C.status)
  await page.screenshot({ path: join(OUT, `${name}-320-status.png`) })
  await middle(page, 1, C.paid)
  await page.screenshot({ path: join(OUT, `${name}-320-amounts.png`) })
  await middle(page, 1, C.category)
  const out = /** @type {Record<string, unknown>} */ ({ tree: await tree(page, engine) })
  out.readings = await page.evaluate(() => {
    const cut = [...document.querySelectorAll('.table-reading > bdi')].filter((bdi) => bdi.scrollWidth > bdi.clientWidth + 1).length
    const outside = [...document.querySelectorAll('.table-reading')].filter((one) => { const [own, cell] = [one.getBoundingClientRect(), /** @type {Element} */ (one.parentElement).getBoundingClientRect()]; return own.width && (own.left < cell.left - 1 || own.right > cell.right + 1) }).length
    return { cut, outside, 'page wider than the window': document.documentElement.scrollWidth > innerWidth }
  })
  // One press on the first reading in view puts the keyboard in its field.
  const cell = cellAt(page, 1, C.category), box = await cell.boundingBox()
  if (box && box.x >= 0 && box.x + 30 < 320 && await page.evaluate(() => Boolean(document.documentElement.dataset.reading))) {
    await page.mouse.click(box.x + 24, box.y + box.height / 2)
    await settle(page)
    out['a press'] = await cell.evaluate((one) => ({ 'has the keys': document.activeElement === one.querySelector('input'), seen: getComputedStyle(/** @type {Element} */ (one.querySelector('input'))).opacity === '1' }))
    await page.keyboard.press('Escape')
    await away(page)
  } else out['a press'] = 'no reading to press'
  await page.setViewportSize({ width: 1440, height: 900 })
  await settle(page, 400)
  return out
}

// ---- A run: one engine, one language, the prototype off or on.
/** @param {import('playwright').Browser} browser @param {string} engine @param {string} lang @param {'off' | 'focus' | 'hover'} mode */
async function run(browser, engine, lang, mode) {
  const { context, page } = await fresh(browser, lang), name = `${engine}-${lang}`, on = mode !== 'off', tag = on ? mode : 'before'
  const out = /** @type {Record<string, any>} */ ({})
  try {
    out.accepted = { before: await tree(page, engine) }
    if (on) { await page.evaluate(prototype, mode); await settle(page, 200) }
    out.accepted.after = await tree(page, engine)
    if (on) out.readings = await readings(page)
    await shoot(page, `${name}-accepted-${tag}`)
    if (mode === 'hover') {
      out.passes = await passes(page, `${name}-hover`)
      out.keys = await keys(page)
      out.pointer = await pointer(page)
      return out
    }
    if (on && lang === 'en') out.passes = await passes(page, `${name}-focus`)
    out.keys = await keys(page)
    if (on) out['readings after the keys'] = await readings(page)
    out.pointer = await pointer(page)
    await jeanChanges(page)
    if (on) out['readings after Jean'] = await readings(page)
    // With the prototype or without, so that the two runs' trees after it compare: in WebKit a date's field that held a day, then none, as rows turn, is called invalid from then on.
    out['readings after a sort and a search'] = await redrawn(page)
    out.waiting = await tree(page, engine)
    await shoot(page, `${name}-waiting-${tag}`)
    await traced(page, engine, 'waiting')
    out.states = await states(page, on)
    await traced(page, engine, 'states')
    out.left = await leftovers(page, on)
    await traced(page, engine, 'leftovers')
    out.words = await words(page)
    await traced(page, engine, 'words')
    out.direction = await direction(page)
    await traced(page, engine, 'direction')
    await shoot(page, `${name}-amounts-${tag}`)
    if (on) {
      // A cell with the keyboard, its field showing among the readings; then the fields quietened by CSS alone, for the comparison.
      await cellAt(page, 4, C.paid).focus()
      await page.keyboard.press('Enter')
      await settle(page)
      await (await page.locator('app-preview').first()).screenshot({ path: join(OUT, `${name}-field-with-the-keys.png`) })
      await page.keyboard.press('Escape')
      await traced(page, engine, 'a field with the keys')
      await page.evaluate(prototype, 'quiet')
      await shoot(page, `${name}-quiet-css-alone`)
      await page.evaluate(prototype, mode)
      await traced(page, engine, 'quiet and back')
      out.forced = await forced(page)
      await shoot(page, `${name}-forced-colours`)
      await page.emulateMedia({ forcedColors: 'none' })
      await traced(page, engine, 'forced colours and back')
    }
    out.narrow = await narrow(page, `${name}-${tag}`, engine)
    if (on) out.spinner = await spinner(page)
    out.refused = await refusedForReal(page, `${name}-${tag}`)
    if (lang !== 'ja') out.looks = await looks(page, `${name}-${tag}`, on)
  } catch (error) {
    await page.screenshot({ path: join(OUT, `${name}-${tag}-failed.png`) }).catch(() => {})
    throw error
  } finally {
    await context.close()
  }
  return out
}

// ---- 1, in Firefox itself: Playwright's own Firefox no longer gives its accessibility tree, but the Firefox installed here, driven over
// WebDriver BiDi, finds nodes by the role and the name Gecko's accessibility computes. How many of each, before the prototype and after.
async function gecko() {
  const home = join(OUT, '.firefox-home')
  mkdirSync(home, { recursive: true })
  const browser = await firefox.launch({ channel: 'moz-firefox', env: { ...process.env, CFFIXED_USER_HOME: home } }).catch(() => null)
  if (!browser) return 'not checked: no Firefox installed here to drive'
  try {
    const { page } = await fresh(browser, 'en'), impl = /** @type {any} */ (page)._connection.toImpl(page), session = (impl.delegate ?? impl._delegate)._session
    const asks = [{ role: 'spinbutton', name: 'Estimate' }, { role: 'spinbutton', name: 'Paid' }, { role: 'combobox', name: 'Status' }, { role: 'textbox', name: 'Category' }, { name: 'Due' }, { role: 'checkbox', name: 'Receipt' }, { role: 'textbox', name: 'Item' },
      { role: 'textbox', name: 'Owner' }, { role: 'cell' }, { role: 'rowheader' }, { role: 'columnheader' }, { name: '€480' }, { name: 'Sep 12' }, { name: 'Booked' }]
    const read = async () => { const found = []; for (const value of asks) found.push(`${JSON.stringify(value)}: ${(await session.send('browsingContext.locateNodes', { context: session.sessionId, locator: { type: 'accessibility', value } })).nodes.length}`); return found.join(', ') }
    const before = await read()
    await page.evaluate(prototype, 'focus')
    await settle(page, 300)
    const after = await read(), readings = await page.locator('.table-reading').count()
    return `Firefox ${browser.version()}, ${readings} readings drawn: ${before === after ? 'same' : 'DIFFERS'} · ${after}${before === after ? '' : ` · before: ${before}`}`
  } catch (error) { return `not checked: ${String(error).slice(0, 160)}` } finally { await browser.close() }
}

/** For --trace in WebKit: what its accessibility says of the empty date's field, after a step. @param {Page} page @param {string} engine @param {string} step */
async function traced(page, engine, step) {
  if (!TRACE || engine !== 'webkit') return
  const own = (await tree(page, engine)).own ?? '', state = await cellAt(page, 2, C.due).locator('input').evaluate((one) => `${JSON.stringify(/** @type {HTMLInputElement} */ (one).value)} valid:${/** @type {HTMLInputElement} */ (one).validity.valid} badInput:${/** @type {HTMLInputElement} */ (one).validity.badInput}`)
  console.log(`    after ${step}: ${own.split('\n')[19]} · ${state}`)
}

/** Whether two runs' logs agree, and where they first don't. @param {unknown} a @param {unknown} b */
const same = (a, b) => { const [x, y] = [JSON.stringify(a), JSON.stringify(b)]; if (x === y) return ''; let i = 0; while (x[i] === y[i]) i++; return `…${x.slice(Math.max(0, i - 60), i + 60)}… against …${y.slice(Math.max(0, i - 60), i + 60)}…` }

// ---- --hold: Jean in a window, the prototype on, for a person to try.
async function hold() {
  const engine = ENGINES[0], browser = await launch(engine), { page } = await fresh(browser, LANGS[0])
  await jeanChanges(page)
  await page.evaluate(prototype, VARIANT)
  // The same prototype for a browser this can't drive, Safari itself or one on Windows: pasted in its console over any collection, every number column read as money.
  const snippet = join(OUT, 'reading-snippet.js')
  writeFileSync(snippet, `(${prototype})('focus', '.')\n`)
  console.log(`\nJean is open in ${engine}, in ${LANGS[0]}, with "${FAIR.name}" beside the task and the prototype on (${VARIANT}).`)
  console.log('Type off, focus, hover or quiet then Enter to switch; q then Enter, or closing the window, ends.')
  console.log(`For another browser: ${ADDRESS} is Jean while this runs; open a collection there and paste ${snippet} in its console.\n`)
  const lines = createInterface({ input: process.stdin })
  lines.on('line', async (line) => {
    const word = line.trim()
    if (word === 'q') return browser.close()
    if (['off', 'focus', 'hover', 'quiet'].includes(word)) { await page.evaluate(prototype, word).catch(() => {}); console.log(`now: ${word}`) }
  })
  await new Promise((done) => browser.on('disconnected', done))
  lines.close()
}

// ---- Every check.
async function checks() {
  const results = /** @type {Record<string, any>} */ ({}), verdicts = /** @type {Record<string, Record<string, string>>} */ ({})
  for (const engine of ENGINES) {
    const browser = await launch(engine)
    console.log(`\n${engine} ${browser.version()}`)
    for (const lang of LANGS) {
      const started = Date.now(), name = `${engine}-${lang}`
      const off = await run(browser, engine, lang, 'off'), on = await run(browser, engine, lang, 'focus'), hover = lang === 'en' ? await run(browser, engine, lang, 'hover') : null
      results[name] = { off, on, hover }
      const say = (/** @type {string} */ check, /** @type {string} */ verdict) => { (verdicts[check] ??= {})[name] = verdict; console.log(`  ${lang}  ${check}: ${verdict}`) }
      const differs = (/** @type {unknown} */ a, /** @type {unknown} */ b) => { const gap = same(a, b); return gap ? `DIFFERS ${gap}` : 'same' }
      say('1 tree, accepted (same page, before and after)', differs(on.accepted.before, on.accepted.after))
      say('1 tree, waiting (off run against on run)', differs(off.waiting, on.waiting))
      say('1 tree, 320 px', differs(off.narrow.tree, on.narrow.tree))
      say('readings in step', [on.readings, on['readings after the keys'], on['readings after Jean'], on['readings after a sort and a search']].map((one) => `${one.count} readings, ${one.wrong.length} wrong${one.wrong.length ? ` (${one.wrong.join('; ')})` : ''}`).join(' · '))
      say('2 keys', `${on.keys.length} steps, ${differs(off.keys.map((/** @type {any} */ { step, active, values }) => [step, active, values]), on.keys.map((/** @type {any} */ { step, active, values }) => [step, active, values]))}; the cell with the keys shows its field at ${on.keys.filter((/** @type {any} */ one) => one.shows === true).length} of ${on.keys.filter((/** @type {any} */ one) => one.shows !== null).length} steps on such a cell, another cell's field seen at ${on.keys.filter((/** @type {any} */ one) => one.others).length}`)
      say('3 pointer', `${differs(off.pointer.map((/** @type {any} */ { 'field seen': _, ...rest }) => rest), on.pointer.map((/** @type {any} */ { 'field seen': _, ...rest }) => rest))}; field seen after one press at ${on.pointer.filter((/** @type {any} */ one) => one['field seen']).length} of ${on.pointer.length}; open on press: ${[...new Set(on.pointer.map((/** @type {any} */ one) => `${one.kind} ${one.at}=${one['open on press']}/${one['open after']}`))].filter((one) => /true/.test(one)).join(', ') || 'none told'}`)
      say('4 left of the fields', JSON.stringify(on.left))
      say('5 forced colours', JSON.stringify(on.forced))
      say('6 states', `tint ${on.states['tint seen']} (${differs(off.states.tint, on.states.tint)}), ring ${on.states['ring seen']} (${differs(off.states.ring, on.states.ring)}), refused ${on.states['refused seen']}: ${on.states.refused}`)
      if (on.looks) say('7 looks', Object.entries(on.looks).map(([look, one]) => `${look}: ${JSON.stringify(one)}`).join(' · '))
      say('8 text', `off ${JSON.stringify(off.words)} · on ${JSON.stringify(on.words)}`)
      say('3 the spinner under a reading', JSON.stringify(on.spinner))
      say('6 a value refused for real', `off ${JSON.stringify(off.refused)} · on ${JSON.stringify(on.refused)}`)
      if (hover) say('9 pointer passing', `fields on hover: ${JSON.stringify(hover.passes)} · on focus only: ${JSON.stringify(on.passes)} · hover's keys ${differs(off.keys.map((/** @type {any} */ { step, active, values }) => [step, active, values]), hover.keys.map((/** @type {any} */ { step, active, values }) => [step, active, values]))}, its presses ${differs(off.pointer.map((/** @type {any} */ { 'field seen': _, ...rest }) => rest), hover.pointer.map((/** @type {any} */ { 'field seen': _, ...rest }) => rest))}`)
      say('10 direction', JSON.stringify(on.direction.readings))
      say('320 px', `${JSON.stringify(on.narrow.readings)}, a press ${JSON.stringify(on.narrow['a press'])}`)
      console.log(`  ${lang}  done in ${Math.round((Date.now() - started) / 1000)} s`)
      // Kept as it goes, one file for each engine and language.
      writeFileSync(join(OUT, `results-${name}.json`), JSON.stringify({ results: results[name], verdicts: Object.fromEntries(Object.entries(verdicts).map(([check, by]) => [check, by[name]])) }, null, 1))
    }
    await browser.close()
  }
  if (ENGINES.includes('firefox')) {
    const found = await gecko()
    console.log(`\nfirefox, its own accessibility, by role and name: ${found}`)
    writeFileSync(join(OUT, 'results-firefox-own-accessibility.json'), JSON.stringify(found))
  }
  console.log(`\nScreenshots and results in ${OUT}`)
}

await serve()
try { await (HOLD ? hold() : checks()) } finally { stop() }
