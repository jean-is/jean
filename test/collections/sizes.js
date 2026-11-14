// SPDX-License-Identifier: MIT
// Collections, phase 0c: how many rows a collection holds smoothly today, every row drawn, and what each path costs at 10,000 rows.
// Real Jean, served from this checkout on a spare port, in a throwaway browser context each run, the fake brain answering the
// task it opens beside; storage is sealed, so every file goes through app.fs in the page, and rows are written as made() writes them,
// as the person's.
// Usage: node test/collections/sizes.js            Chromium, the CPU slowed 4 times: the sizes, then each path at 10,000 rows, slowed and at full speed (an hour)
//        node test/collections/sizes.js --webkit   WebKit at full speed: opening, a change, Find (three quarters of an hour, most of it at 10,000 rows)
//        --sizes 100,1000   only these sizes        --runs 5   how many times each        --budget 20   minutes a size's runs may take, two done at least
//        --only sizes | paths                       one of Chromium's two parts        --rate 1   the sizes with nothing slowed, for comparison
//        --write   writes sizes.md from the latest figures of each part (kept in OUT, the system's temporary folder by default), its Notes kept;
//                  alone, it measures nothing
// Needs Playwright's browsers, as the e2e tests do (npx playwright install chromium webkit).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from '@playwright/test'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const [APP, BRAIN] = [4392, 4393]
const OUT = process.env.OUT || join(tmpdir(), 'jean-collections-sizes')
const PAGE = fileURLToPath(new URL('sizes.md', import.meta.url))
/** The plan's sizes, after three smaller ones, which say what a collection costs before its rows do. */
const SIZES = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000]
/** The gate, fixed before the first run: milliseconds at most, frames a second at least. */
const GATE = { open: 300, change: 100, find: 100, fps: 50 }
/** How long a step may take before it is given up, the CPU slowed. */
const LIMIT = Number(process.env.LIMIT) || 30 * 60_000

const flag = (/** @type {string} */ name) => process.argv.includes(`--${name}`)
const option = (/** @type {string} */ name) => ((at) => (at < 0 ? undefined : process.argv[at + 1]))(process.argv.indexOf(`--${name}`))
/** How long a size's runs may take in all before the rest of them are left out, two done at least (--budget, in minutes). */
const BUDGET = (Number(option('budget')) || 20) * 60_000
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms))
const say = (/** @type {unknown[]} */ ...words) => console.log(new Date().toISOString().slice(11, 19), ...words)
/** Each step said as it starts, with --verbose. */
const step = (/** @type {unknown[]} */ ...words) => { if (flag('verbose')) say('  ·', ...words) }

/**
 * What the page holds for the measures, as `bench`: a collection of n rows by 12 columns written through app.fs, the moment a change is
 * painted, and each step of the two measures. Runs in the page, so it names nothing of this file.
 */
function install() {
  const bench = /** @type {any} */ (globalThis).bench = { state: {} }
  const now = () => performance.now()
  const frame = () => new Promise(requestAnimationFrame)
  const FIRST = ['Amira', 'Jun', 'Lucas', 'Chloe', 'Omar', 'Ines', 'Mateo', 'Sara', 'Noor', 'Elena', 'Tom', 'Yuki']
  const LAST = ['Martin', 'Bernard', 'Dubois', 'Laurent', 'Moreau', 'Garcia', 'Roux', 'Fontaine', 'Mercier', 'Blanc', 'Henry', 'Colin', 'Lambert']
  // One row in eight is a prize: the only cells with a z, which Find's letter keeps.
  const CATEGORIES = ['Travel', 'Food', 'Rent', 'Tools', 'Books', 'Health', 'Gifts', 'Prizes']
  const CITIES = ['Paris', 'Lyon', 'Lille', 'Nantes', 'Bordeaux', 'Toulouse', 'Nice', 'Rennes', 'Dijon', 'Tours', 'Madrid', 'Sevilla', 'Bilbao', 'Porto', 'Lisboa', 'Roma', 'Milano', 'Torino', 'Napoli', 'Bologna',
    'Berlin', 'Hamburg', 'Bremen', 'Dresden', 'Bonn', 'Wien', 'Pisa', 'Bern', 'Basel', 'Gent', 'Brugge', 'Dublin', 'Cork', 'Oslo', 'Bergen', 'Malmo', 'Turku', 'Tallinn', 'Riga', 'Vilnius']
  const STEPS = ['To do', 'Under way', 'Blocked', 'Done']
  // A name, three numbers, two dates, two selects (8 and 40 choices), a status, a checkbox, a person, an email.
  const COLUMNS = [{ name: 'Name', type: 'text' }, { name: 'Amount', type: 'number' }, { name: 'Quantity', type: 'number' }, { name: 'Rating', type: 'number' }, { name: 'Ordered', type: 'date' }, { name: 'Due', type: 'date' },
    { name: 'Category', type: 'select', options: CATEGORIES }, { name: 'City', type: 'select', options: CITIES }, { name: 'Status', type: 'status', options: STEPS }, { name: 'Paid', type: 'checkbox' }, { name: 'Owner', type: 'person' }, { name: 'Email', type: 'email' }]
  const day = (/** @type {number} */ i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
  /** A row's cells, by its place: every name its own, the others spread evenly. @param {number} i */
  const cells = (i) => {
    const first = FIRST[i % FIRST.length], last = LAST[(i * 7) % LAST.length]
    return { name: `${first} ${last} ${String(i + 1).padStart(5, '0')}`, amount: ((i * 7919) % 99991) / 100, quantity: ((i * 31) % 500) + 1, rating: (i % 50) / 10, ordered: day(i % 600), due: day((i % 600) + 30),
      category: CATEGORIES[i % 8], city: CITIES[(i * 13) % 40], status: STEPS[(i * 3) % 4], paid: i % 3 === 0, owner: `${FIRST[(i * 5) % FIRST.length]} ${LAST[(i * 5) % LAST.length][0]}.`, email: `${first}.${last}${i + 1}@example.org`.toLowerCase() }
  }
  const mods = async () => {
    const [{ app }, table, changes, tables, query, { ulid }, { unlock }, { createProject }, creations] = await Promise.all(['/ui/state.js', '/caps/tables/table.js', '/caps/tables/changes.js', '/caps/tables/tables.js', '/caps/tables/query.js',
      '/core/ulid.js', '/ui/caps.js', '/core/settings.js', '/ui/creations.js'].map((path) => import(path)))
    return { app, ...table, ...changes, tables, query: query.query, ulid, unlock, createProject, creations }
  }
  /** What a call takes, and what it gives. @param {() => unknown} work */
  const timed = async (work) => { const from = now(), out = await work(); return { ms: now() - from, out } }
  /** A call's times, up to `runs` of them, fewer once they have taken `budget` in all. @param {number} runs @param {(i: number) => unknown} work @param {number} [budget] */
  const times = async (runs, work, budget = 240_000) => {
    const all = [], from = now()
    for (let i = 0; i < runs && (!i || now() - from < budget); i++) all.push((await timed(() => work(i))).ms)
    return all
  }

  /** Frames coming on time again for a while: nothing left running from the step before. @param {number} [ms] */
  bench.idle = async (ms = 400) => {
    const from = now()
    let [quiet, last] = [from, from]
    while (now() - quiet < ms && now() - from < 60_000) { await frame(); const at = now(); if (at - last > 50) quiet = at; last = at }
  }
  /**
   * When a change is painted, from `from`: the DOM is looked at in each animation frame; the frame that finds the change there is the one
   * that paints it, and the time is taken at the animation frame after it (`ms`). `frame` is when a task queued in the first of the two
   * ran: that frame's own style, layout and paint done on the page's thread, a lower bound. @param {() => boolean} shows @param {number} from
   */
  bench.painted = (shows, from, limit = 30 * 60_000) => new Promise((resolve, reject) => {
    const look = () => {
      if (!shows()) return now() - from > limit ? reject(new Error('The change never showed.')) : requestAnimationFrame(look)
      const channel = new MessageChannel(), seen = now() - from
      let done = 0
      channel.port1.onmessage = () => { done = now() - from }
      channel.port2.postMessage(0)
      requestAnimationFrame(() => resolve({ ms: now() - from, frame: done || now() - from, seen }))
    }
    requestAnimationFrame(look)
  })

  /** The collection's text, n rows as made() writes them: one change of the person's, a line a row. @param {number} n */
  bench.prepare = async (n) => {
    const { createTable, folderOf, stamp, stringifyChanges, ulid, unlock } = await mods()
    await unlock('tables')
    const table = createTable({ name: 'Orders', columns: COLUMNS }, { id: ulid(), author: 'user', at: new Date().toISOString() })
    // The first number's foot works out its sum, which is how a change read again shows.
    table.views = table.views.map((/** @type {any} */ view) => (view.type === 'table' ? { ...view, calculate: { amount: 'sum' } } : view))
    const ids = Array.from({ length: n }, () => ulid()).sort()
    const built = await timed(() => stringifyChanges(stamp([], ids.map((row, i) => ({ row, set: cells(i) })), { by: 'user' })))
    bench.state = { n, table, text: built.out, ids, place: folderOf(table), dirs: [], marked: [] }
    return { build: built.ms, bytes: new TextEncoder().encode(built.out).length, place: bench.state.place }
  }
  /** The collection written in a project, under a name and an id of its own; how long its rows took to write. @param {string} dir @param {string} [name] */
  bench.put = async (dir, name = 'Orders') => {
    const { app, folderOf, ulid } = await mods(), { state } = bench
    const table = name === 'Orders' ? state.table : { ...state.table, id: ulid(), name }, place = folderOf(table)
    await app.fs.write(`${dir}/${place}/collection.json`, `${JSON.stringify(table, null, 2)}\n`)
    const { ms } = await timed(() => app.fs.write(`${dir}/${place}/changes.jsonl`, state.text))
    return { dir, place, write: ms }
  }
  /** A project of its own, which nothing on screen reads. @param {string} name */
  bench.project = async (name) => { const { app, createProject } = await mods(); return createProject(app.fs, { name, by: app.deviceId }) }

  // Measure 1: a collection in the open project, as a session has it: Jean has read it once for Creations, as it does at each change of the task list.
  bench.seed = async (/** @type {number} */ n) => {
    const { app, creations } = await mods()
    await bench.prepare(n)
    const { place } = await bench.put(app.projectDir)
    await creations.reread()
    await import('/ui/preview.js')
    await bench.idle()
    return { place, ephemeral: app.ephemeral.value }
  }
  const body = () => document.querySelector('app-preview .table-grid tbody')
  const foot = () => document.querySelector('app-preview .table-grid tfoot tr:last-child')?.textContent
  /** Asked for beside the task, as the person asks, until its rows are painted. @param {string} place @param {number} n */
  bench.open = async (place, n) => {
    const { preview } = await import('/ui/preview.js'), from = now()
    preview({ uri: place, name: 'Orders', title: 'Orders' }, true)
    return bench.painted(() => body()?.childElementCount === n, from)
  }
  bench.close = async (/** @type {string} */ place) => {
    (await import('/ui/preview.js')).unshow(place)
    while (document.querySelector('app-preview .table-grid')) await frame()
    await bench.idle()
  }
  bench.held = () => ({ elements: document.getElementsByTagName('*').length, fields: document.querySelectorAll('input, select, textarea').length,
    view: document.querySelector('app-preview .table-view')?.getElementsByTagName('*').length ?? 0, rows: body()?.childElementCount ?? 0 })
  /**
   * Waits for the person's next key, then for what it does to be painted, as `bench.armed`, from its keydown: Enter in a field, until the
   * foot's sum shows the value read again; a key typed in a field, until the field holds it; or a key in Find, whose rows are drawn by the
   * time its `input` has been heard, so the first frame after that shows them. @param {'change' | 'type' | 'find'} kind
   */
  bench.arm = (kind) => {
    const was = foot(), field = /** @type {HTMLInputElement} */ (document.activeElement), held = field?.value
    let found = false
    if (kind === 'find') addEventListener('input', () => { found = true }, { capture: true, once: true })
    const shows = kind === 'change' ? () => foot() !== was : kind === 'type' ? () => field.value !== held : () => found
    bench.armed = new Promise((resolve, reject) => {
      const heard = (/** @type {KeyboardEvent} */ event) => {
        if (kind === 'change' && event.key !== 'Enter') return
        removeEventListener('keydown', heard, true)
        bench.painted(shows, now()).then((/** @type {object} */ result) => resolve({ ...result, rows: body()?.childElementCount }), reject)
      }
      addEventListener('keydown', heard, true)
    })
  }
  /** The box the rows scroll in, and how far they can go: nothing when the pane shows them all. */
  const scroller = () => /** @type {HTMLElement} */ (document.querySelector('app-preview .table-scroll'))
  bench.range = () => scroller().scrollHeight - scroller().clientHeight
  /** Frames a second over `ms` from the first scroll, as `bench.framed`: animation frames counted, the longest wait between two, and how far the rows went. @param {number} ms */
  bench.frames = (ms) => {
    const box = scroller()
    bench.framed = new Promise((resolve) => document.addEventListener('scroll', () => {
      const from = now()
      let [count, last, worst, moved, at] = [0, from, 0, 0, box.scrollTop]
      const tick = () => {
        const time = now()
        if (time - from > ms) return resolve({ fps: count / (ms / 1000), worst: Math.max(worst, time - last), moved })
        count++
        worst = Math.max(worst, time - last)
        moved += Math.abs(box.scrollTop - at)
        ;[last, at] = [time, box.scrollTop]
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { capture: true, once: true, passive: true }))
  }

  /** Frames a second of the page at rest, over `ms`. @param {number} ms */
  bench.still = async (ms) => {
    const from = now()
    let count = 0
    while (now() - from < ms) { await frame(); count++ }
    return { fps: count / ((now() - from) / 1000) }
  }

  // Measure 2: each path at n rows, in projects of their own, the app's own modules called as the app calls them.
  /** The rows written through app.fs, a project each. @param {number} runs */
  bench.writes = async (runs) => {
    const write = []
    for (let i = 0; i < runs; i++) { const put = await bench.put(await bench.project(`Written ${i}`)); bench.state.dirs.push(put); write.push(put.write) }
    return { write }
  }
  /** load(): the first time each copy is read, then again; and the file alone, read and unsealed. */
  bench.loads = async () => {
    const { app, tables } = await mods(), { dirs, n } = bench.state, first = [], again = [], read = []
    for (const { dir, place } of dirs) { const { ms, out } = await timed(() => tables.load(place, dir)); if (out?.rows.length !== n) throw new Error(`load() gave ${out?.rows.length} rows.`); first.push(ms) }
    for (const { dir, place } of dirs) again.push((await timed(() => tables.load(place, dir))).ms)
    for (const { dir, place } of dirs) read.push((await timed(() => app.fs.read(`${dir}/${place}/changes.jsonl`))).ms)
    return { first, again, read }
  }
  /** kept(), what Creations and search_files read, over a project of `count` such collections: the first time, in projects never read, then again. @param {number} count @param {number} firsts @param {number} runs */
  bench.kept = async (count, firsts, runs) => {
    const { tables } = await mods(), first = []
    let dir = '', text = 0
    for (let i = 0; i < firsts; i++) {
      dir = await bench.project(`Kept ${count} ${i}`)
      for (let c = 0; c < count; c++) await bench.put(dir, `Orders ${c + 1}`)
      const { ms, out } = await timed(() => tables.kept(dir))
      if (out.length !== count) throw new Error(`kept() gave ${out.length} collections.`)
      first.push(ms)
      text = out.reduce((/** @type {number} */ sum, /** @type {any} */ one) => sum + one.text.length, 0)
    }
    return { first, again: await times(runs, () => tables.kept(dir)), text }
  }
  /**
   * Jean changes a number in 2,000 of the rows, in one call, as table_change does, in a project of its own: how long change() takes, the read
   * after it, and marked() over the lines then. @param {number} i @param {number} count
   */
  bench.jean = async (i, count) => {
    const { tables, marked } = await mods(), { dir, place } = await bench.put(await bench.project(`Marked ${i}`))
    const one = await tables.load(place, dir), every = Math.floor(one.rows.length / count)
    const edits = Array.from({ length: count }, (_, k) => ({ row: one.rows[k * every].id, set: { Quantity: 1000 + k } }))
    const change = (await timed(() => tables.change(one, edits, 'jean', 'the supplier’s list'))).ms
    const { ms: load, out: now } = await timed(() => tables.load(place, dir))
    const { ms, out } = await timed(() => marked(now.lines, now.table.kept))
    if (out.length !== count) throw new Error(`marked() gave ${out.length} lines.`)
    bench.state.marked.push({ dir, place })
    return { change, load, marked: ms, lines: now.lines.length }
  }
  /** marked() alone, again. @param {number} runs */
  bench.marks = async (runs) => {
    const { tables, marked } = await mods(), { dir, place } = bench.state.marked[0], one = await tables.load(place, dir)
    return { marked: await times(runs, () => marked(one.lines, one.table.kept)) }
  }
  /**
   * The view's own draw (view.js), into a box as wide and tall as a pane, of a copy read from `from`: the first one, then one again as each
   * change brings, the script alone and until painted. @param {'dirs' | 'marked'} from @param {number} runs
   */
  bench.draw = async (from, runs) => {
    const { tables } = await mods(), { view } = await import('/caps/tables/view.js'), { dir, place } = bench.state[from][0], one = await tables.load(place, dir)
    const imports = JSON.parse(document.querySelector('script[type="importmap"]')?.textContent ?? '{}').imports ?? {}
    const { signal } = await import(imports['@preact/signals-core'] ?? '@preact/signals-core')
    const host = Object.assign(document.createElement('div'), { className: 'view' }), holds = /** @type {(() => void)[]} */ ([]), where = signal(one)
    host.style.cssText = 'position: fixed; inset-block: 0; inset-inline-end: 0; inline-size: 50vw; display: flex; flex-direction: column; overflow: auto; z-index: 2147483647; background: Canvas;'
    document.body.append(host)
    await bench.idle()
    let start = now()
    const box = view(holds, where)
    host.append(box)
    const first = { script: now() - start, ...(await bench.painted(() => true, start)) }, again = []
    await bench.idle()
    for (let i = 0; i < runs && (!i || again.reduce((sum, each) => sum + each.ms, 0) < 240_000); i++) {
      start = now()
      where.value = { ...one }
      again.push({ script: now() - start, ...(await bench.painted(() => true, start)) })
      await bench.idle(200)
    }
    const held = { elements: box.getElementsByTagName('*').length, marked: box.querySelectorAll('tbody tr.is-jean').length }
    for (const hold of holds) hold()
    host.remove()
    await bench.idle()
    return { first, again, ...held }
  }
  /** Jean's changes rejected, all of them, the collection on show nowhere: reject(), with its write and the read after it. @param {number} i */
  bench.reject = async (i) => {
    const { tables, marked } = await mods(), { dir, place } = bench.state.marked[i], one = await tables.load(place, dir)
    const { ms } = await timed(() => tables.reject(one)), after = await tables.load(place, dir)
    if (marked(after.lines, after.table.kept).length) throw new Error('reject() left changes marked.')
    return { reject: ms, lines: after.lines.length }
  }
  /** query(), as a view asks: the rows alone, grouped by the select of 40 choices, and by the name, each row its own. @param {number} runs */
  bench.groups = async (runs) => {
    const { tables, query } = await mods(), { dir, place } = bench.state.dirs[0], one = await tables.load(place, dir)
    const rows = await times(runs, () => query(one.table, one.rows, { locale: 'en' }))
    const choices = await times(runs, () => { if (query(one.table, one.rows, { group: { property: 'city' }, locale: 'en' }).groups?.length !== 40) throw new Error('Not 40 groups.') })
    const names = await times(runs, () => { if (query(one.table, one.rows, { group: { property: 'name' }, locale: 'en' }).groups?.length !== one.rows.length) throw new Error('Not a group a row.') })
    return { rows, choices, names }
  }
  /** One more change of the person's, the collection on show nowhere: change() whole, then its parts, each as change() calls it. @param {number} runs */
  bench.changes = async (runs) => {
    const { app, tables, stamp, inverse, stringifyChanges } = await mods(), { dir, place } = bench.state.dirs[0], path = `${dir}/${place}/changes.jsonl`
    const whole = [], parts = { stamp: [], inverse: [], append: [], load: [], read: [] }
    for (let i = 0; i < runs; i++) { const one = await tables.load(place, dir); whole.push((await timed(() => tables.change(one, [{ row: one.rows[3 + i].id, set: { amount: 1000 + i } }], 'user'))).ms) }
    for (let i = 0; i < runs; i++) {
      const one = await tables.load(place, dir), edits = [{ row: one.rows[20 + i].id, set: { amount: 2000 + i } }]
      const stamped = await timed(() => stamp(one.lines, edits, { by: 'user' }))
      parts.stamp.push(stamped.ms)
      parts.inverse.push((await timed(() => inverse(one.lines, edits))).ms)
      parts.append.push((await timed(() => app.fs.append(path, stringifyChanges(stamped.out)))).ms)
      parts.load.push((await timed(() => tables.load(place, dir))).ms)
      parts.read.push((await timed(() => app.fs.read(path))).ms)
    }
    return { whole, ...parts }
  }
}

/** What a step gives, unless it takes longer than a step may. @template T @param {Promise<T>} work @param {string} what @returns {Promise<T>} */
const within = (work, what) => { let timer; return Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took more than ${LIMIT / 60_000} minutes.`)), LIMIT) })]).finally(() => clearTimeout(timer)) }

/** Whether something answers on a port of this computer. @param {number} port */
const answers = (port) => fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)

/** Jean and the fake brain, from this checkout, on their spare ports; what stops them, and only them. */
async function serve() {
  for (const port of [APP, BRAIN]) if (await answers(port)) throw new Error(`Something already answers on ${port}: these measures start their own servers there.`)
  let said = ''
  const servers = [spawn(process.execPath, ['scripts/serve.js'], { cwd: ROOT, env: { ...process.env, PORT: String(APP) }, stdio: ['ignore', 'ignore', 'pipe'] }),
    spawn(process.execPath, ['test/fixtures/fake-brain.js'], { cwd: ROOT, env: { ...process.env, PORT: String(BRAIN), PACE: '2' }, stdio: ['ignore', 'ignore', 'pipe'] })]
  for (const server of servers) server.stderr?.on('data', (text) => { said += text })
  const stop = () => { for (const server of servers) server.kill() }
  process.on('exit', stop)
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) process.on(signal, () => process.exit(1))
  for (const port of [APP, BRAIN]) {
    for (let tries = 0; !(await answers(port)); tries++) {
      if (tries > 100 || servers.some((server) => server.exitCode !== null)) throw new Error(`Nothing answers on ${port}.${said ? ` It said: ${said.trim().slice(0, 2000)}` : ''}`)
      await sleep(150)
    }
  }
  return stop
}

/**
 * A throwaway context with Jean open in it, `bench` in its page; `slow` slows its processor (Chromium only).
 * @param {import('@playwright/test').Browser} browser
 */
async function session(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  page.setDefaultTimeout(LIMIT)
  page.on('pageerror', (error) => say('page error:', error.message.slice(0, 300)))
  page.on('crash', () => say('the page crashed'))
  step('Jean')
  await page.goto(`http://127.0.0.1:${APP}/`)
  await page.locator('.hero-question').waitFor()
  await page.evaluate(install)
  const cdp = browser.browserType().name() === 'chromium' ? await context.newCDPSession(page) : null
  return { context, page, slow: async (/** @type {number} */ rate) => { if (rate > 1 && cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate }) } }
}

/** A task, answered by the fake brain as a plan's brain, for the collection to open beside. @param {import('@playwright/test').Page} page */
async function task(page) {
  await page.evaluate((baseURL) => import('/ui/brains.js').then(({ addBrain }) => addBrain({ id: 'claude', provider: 'claudecode', api: 'openai', baseURL, model: 'haiku' })), `http://127.0.0.1:${BRAIN}/v1`)
  await page.locator('#prompt').fill('Hello')
  await page.locator('#prompt').press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('.msg-jean .prose').length >= 1 && !document.querySelector('.msg-jean.is-streaming'))
}

/**
 * One run of measure 1: a collection of n rows opened beside a task, opened again, a number changed, a letter typed in Find, and its rows scrolled.
 * @param {import('@playwright/test').Browser} browser @param {number} n @param {number} rate
 */
async function sized(browser, n, rate) {
  const { context, page, slow } = await session(browser)
  try {
    step('a task')
    await task(page)
    step('the rows written')
    const { place, ephemeral } = await page.evaluate((rows) => bench.seed(rows), n)
    await slow(rate)
    step('opening')
    const open = await within(page.evaluate(([at, rows]) => bench.open(at, rows), /** @type {const} */ ([place, n])), 'opening')
    const held = await page.evaluate(() => bench.held())
    step('closing, then opening again')
    await page.evaluate((at) => bench.close(at), place)
    const again = await within(page.evaluate(([at, rows]) => bench.open(at, rows), /** @type {const} */ ([place, n])), 'opening again')
    await page.evaluate(() => bench.idle())

    // A number typed in the third row's Amount, kept with Enter.
    step('a change')
    await page.locator('app-preview .table-grid tbody tr').nth(2).locator('input[type="number"]').first().click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.evaluate(() => bench.idle())
    // Its first digit, which takes the place of what the field held, then the next one: how long each takes to show.
    const typed = []
    for (const digit of ['4', '2']) {
      await page.evaluate(() => { bench.arm('type') })
      await page.keyboard.type(digit)
      typed.push(await within(page.evaluate(() => bench.armed), 'a digit'))
      await page.evaluate(() => bench.idle(200))
    }
    await page.keyboard.type('42')
    await page.evaluate(() => bench.idle(200))
    await page.evaluate(() => { bench.arm('change') })
    await page.keyboard.press('Enter')
    const change = await within(page.evaluate(() => bench.armed), 'a change')
    await page.evaluate(() => bench.idle())

    // A letter in Find: z, which one row in eight has, then a, which every row has; emptied after each.
    const find = /** @type {Record<string, any>} */ ({})
    step('Find')
    await page.locator('app-preview .creations-find').click()
    await page.evaluate(() => bench.idle())
    for (const [letter, kept] of /** @type {const} */ ([['z', Math.floor(n / 8)], ['a', n]])) {
      await page.evaluate(() => { bench.arm('find') })
      await page.keyboard.type(letter)
      find[letter] = await within(page.evaluate(() => bench.armed), 'Find')
      if (find[letter].rows !== kept) throw new Error(`Find kept ${find[letter].rows} rows for ${letter}, not ${kept}.`)
      await page.evaluate(() => bench.idle())
      await page.evaluate(() => { bench.arm('find') })
      await page.keyboard.press('Backspace')
      if ((await within(page.evaluate(() => bench.armed), 'Find emptied')).rows !== n) throw new Error('Find emptied didn\'t bring every row back.')
      await page.evaluate(() => bench.idle())
    }

    // The wheel over the rows for two seconds, down then back up, a notch a frame or as fast as the page takes them: Chromium only.
    let scroll = null
    const range = await page.evaluate(() => bench.range()), still = await page.evaluate(() => bench.still(1000))
    if (browser.browserType().name() === 'chromium' && range >= 80) {
      step('scrolling')
      const box = await page.locator('app-preview .table-scroll').boundingBox()
      await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + Math.min(box?.height ?? 0, 600) / 2)
      await page.evaluate(() => bench.idle())
      await page.evaluate(() => { bench.frames(2000) })
      // Down to the last row, then back, as far as the rows go.
      let [notches, at, by] = [0, 0, 40]
      for (const from = Date.now(); Date.now() - from < 2700; notches++) {
        const sent = Date.now()
        if (at + by > range || at + by < 0) by = -by
        await within(page.mouse.wheel(0, by), 'the wheel')
        at += by
        await sleep(Math.max(0, 16 - (Date.now() - sent)))
      }
      scroll = { ...(await within(page.evaluate(() => bench.framed), 'scrolling')), notches, range }
    }
    return { open, again, typed: typed[0], next: typed[1], change, some: find.z, all: find.a, scroll, still, held, ephemeral }
  } catch (error) {
    // What the page showed when a run failed, with --verbose.
    if (flag('verbose')) await page.screenshot({ path: join(OUT, `failed-${n}.png`), timeout: 20_000 }).catch(() => {})
    throw error
  } finally {
    await context.close()
  }
}

/** Measure 1, for each size, `runs` times. @param {import('@playwright/test').BrowserType} engine @param {number} rate @param {number[]} rows @param {number} runs */
async function sizes(engine, rate, rows, runs) {
  const browser = await engine.launch(), name = engine.name(), file = join(OUT, `${name}-${rate}.json`)
  const kept = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const result = { engine: name, version: browser.version(), rate, ...about(), sizes: /** @type {Record<string, any>} */ ({ ...(kept.rate === rate ? kept.sizes : {}) }) }
  try {
    for (const n of rows) {
      const all = [], from = Date.now()
      // Fewer runs, two at least, of a size whose runs have taken the time a size may.
      for (let i = 0; i < runs && (i < 2 || Date.now() - from < BUDGET); i++) {
        try {
          const run = await sized(browser, n, rate)
          all.push(run)
          say(name, `${n} rows, run ${i + 1}:`, `open ${ms(run.open.ms)}, again ${ms(run.again.ms)}, a digit ${ms(run.typed.ms)} then ${ms(run.next.ms)}, change ${ms(run.change.ms)}, find ${ms(run.some.ms)} / ${ms(run.all.ms)}${run.scroll ? `, ${run.scroll.fps} fps (moved ${Math.round(run.scroll.moved)} px)` : ''}, ${run.held.elements} elements`)
        } catch (error) {
          all.push({ failed: String(/** @type {Error} */ (error).message ?? error).split('\n')[0].slice(0, 300) })
          say(name, `${n} rows, run ${i + 1} failed:`, all.at(-1)?.failed)
        }
      }
      result.sizes[n] = all
      writeFileSync(file, JSON.stringify(result, null, 1))
    }
  } finally {
    await browser.close()
  }
  return result
}

/** Measure 2: each path at n rows, the processor slowed `rate` times, in three sessions so that none holds every copy read. @param {number} rate @param {number} n @param {number} runs */
async function paths(rate, n, runs) {
  const browser = await chromium.launch(), result = /** @type {Record<string, any>} */ ({ rate, n, version: browser.version(), ...about() })
  /** @param {string} name @param {(page: import('@playwright/test').Page) => Promise<void>} work */
  const part = async (name, work) => {
    const { context, page, slow } = await session(browser)
    try {
      await slow(rate)
      Object.assign(result, await page.evaluate((rows) => bench.prepare(rows), n))
      await work(page)
    } catch (error) {
      result[`${name} failed`] = String(/** @type {Error} */ (error).message ?? error).split('\n')[0].slice(0, 300)
      say(`paths at ${rate}×, ${name} failed:`, result[`${name} failed`])
    } finally {
      await context.close()
    }
  }
  /** @param {string} key @param {Promise<unknown>} work */
  const took = async (key, work) => { result[key] = await work; say(`paths at ${rate}×, ${key}:`, JSON.stringify(result[key], (_, value) => (typeof value === 'number' ? Math.round(value * 10) / 10 : value)).slice(0, 400)) }
  try {
    await part('files', async (page) => {
      await took('writes', page.evaluate((count) => bench.writes(count), runs))
      await took('loads', page.evaluate(() => bench.loads()))
      await took('kept1', page.evaluate(([firsts, count]) => bench.kept(1, firsts, count), [3, runs]))
      await took('kept3', page.evaluate(([firsts, count]) => bench.kept(3, firsts, count), [3, runs]))
    })
    await part('review', async (page) => {
      await page.evaluate(() => bench.writes(1))
      const jean = []
      for (let i = 0; i < runs; i++) jean.push(await page.evaluate(([at, count]) => bench.jean(at, count), [i, Math.min(2000, n / 5)]))
      await took('jean', Promise.resolve(jean))
      await took('marks', page.evaluate((count) => bench.marks(count), runs))
      await took('drawPlain', page.evaluate((count) => bench.draw('dirs', count), runs))
      await took('drawMarked', page.evaluate((count) => bench.draw('marked', count), runs))
      const reject = []
      for (let i = 0; i < runs; i++) reject.push(await page.evaluate((at) => bench.reject(at), i))
      await took('reject', Promise.resolve(reject))
    })
    await part('engine', async (page) => {
      await page.evaluate(() => bench.writes(1))
      await took('groups', page.evaluate((count) => bench.groups(count), runs))
      await took('changes', page.evaluate((count) => bench.changes(count), runs))
    })
  } finally {
    await browser.close()
  }
  return result
}

/** Where and when the figures were taken. */
function about() {
  const git = (/** @type {string[]} */ ...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() ?? ''
  return { when: new Date().toISOString(), node: process.version, cpu: `${cpus()[0]?.model}, ${cpus().length} cores`, commit: git('rev-parse', '--short', 'HEAD'), changed: git('status', '--porcelain', '--', 'app').split('\n').filter(Boolean).length }
}

/** Milliseconds as a table says them. @param {number | undefined} value */
const ms = (value) => (value === undefined || value === null || Number.isNaN(value) ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value))
/** The middle of some figures, and the worst: the longest, or with `least` the fewest. @param {number[]} values @param {boolean} [least] */
function middle(values, least = false) {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b)
  if (!sorted.length) return { median: NaN, worst: NaN, n: 0 }
  const half = sorted.length / 2
  return { median: sorted.length % 2 ? sorted[Math.floor(half)] : (sorted[half - 1] + sorted[half]) / 2, worst: least ? sorted[0] : /** @type {number} */ (sorted.at(-1)), n: sorted.length }
}
/** "median / worst". @param {number[]} values @param {boolean} [least] */
const both = (values, least) => ((stat) => (stat.n ? `${ms(stat.median)} / ${ms(stat.worst)}` : '—'))(middle(values, least))

/** A size's figures, each measure's runs in a list, by `key`: the time two frames on (ms) or at the first frame's end (frame). @param {any[]} runs @param {'ms' | 'frame'} key */
function figures(runs, key) {
  const good = runs.filter((run) => !run.failed), of = (/** @type {string} */ name) => good.map((run) => run[name]?.[key])
  return { open: of('open'), again: of('again'), typed: of('typed'), next: of('next'), change: of('change'), some: of('some'), all: of('all'), fps: good.flatMap((run) => (run.scroll ? [run.scroll.fps] : [])),
    still: good.flatMap((run) => (run.still ? [run.still.fps] : [])), notches: good.flatMap((run) => (run.scroll ? [run.scroll.notches] : [])), held: good[0]?.held, failed: runs.length - good.length, runs: runs.length }
}
/**
 * Which of the gate's four a size misses, by its medians or its worst runs; a pane that shows every row has nothing to scroll.
 * @param {ReturnType<typeof figures>} at @param {'median' | 'worst'} by @param {boolean} [again] judged on opening again, not the first time
 */
function misses(at, by, again = false) {
  const [open, change, find, fps] = [middle(again ? at.again : at.open)[by], middle(at.change)[by], Math.max(middle(at.some)[by], middle(at.all)[by]), middle(at.fps, true)[by]]
  return [...(open > GATE.open ? ['opening'] : []), ...(change > GATE.change ? ['a change'] : []), ...(find > GATE.find ? ['Find'] : []), ...(fps < GATE.fps ? ['scrolling'] : []), ...(at.failed ? ['a run that failed'] : [])]
}

/** sizes.md, from the latest figures of each part, the Notes under them kept as they are. */
function write() {
  const read = (/** @type {string} */ name) => (existsSync(join(OUT, `${name}.json`)) ? JSON.parse(readFileSync(join(OUT, `${name}.json`), 'utf8')) : null)
  const [slowed, full, safari, costs] = [read('chromium-4'), read('chromium-1'), read('webkit-1'), read('paths')]
  const out = ['# Collections: how many rows stay smooth, and what 10,000 cost', '',
    'Written by `node test/collections/sizes.js --write` from its latest runs (phase 0c of the collections plan); the Notes at the end are by hand. Real Jean, served from this',
    'checkout, in a throwaway browser context each run: a collection of N rows by 12 columns (a name, three numbers, two dates, a select of 8 choices and one of 40, a status, a',
    'checkbox, a person, an email), written through `app.fs` as `made()` writes it, as the person\'s, in the open project, and opened beside a task the fake brain answered. Every',
    'row is drawn, as the app does today. The plan\'s sizes are 100 to 10,000 rows; 10, 25 and 50 were added to see what a collection costs before its rows do.', '',
    '**Painted** is told the same way throughout: the DOM is looked at in each animation frame; the frame that finds the change there is the one that paints it, and the',
    'time is taken at the animation frame after it. The first table of each browser says that time, an upper bound; the second, the time at which the first of the two frames had',
    'done its own style, layout and paint on the page\'s thread (or the second began, when that came first), a lower bound.', '',
    '- **Opening:** from `preview()` of the collection, as the person asks for it, until its N rows are painted: the first time in the page, `view.js` fetched then, and again once',
    '  closed. Jean has read the collection once before, for Creations, as it does at start and at each change of the task list; that first read is among the paths at the end.',
    '- **A change:** a number typed in the third row\'s Amount, clicked just before, from Enter\'s keydown until the foot\'s sum shows the value read again and is painted.',
    '- **Find:** from one letter\'s keydown in the view\'s search, clicked just before, until the rows it keeps are painted: `z`, which one row in eight has, then, the field emptied,',
    '  `a`, which every row has. It passes when both do.',
    '- **Scrolling:** animation frames a second over two seconds of the wheel, the pointer over the rows, 40 px a notch, a notch a frame or as fast as the page takes them, down to',
    '  the last row and back. Chromium only.', '',
    `**The gate, fixed before the first run:** opening within ${GATE.open} ms, a change painted within ${GATE.change} ms, a letter in Find within ${GATE.find} ms, scrolling at ${GATE.fps} frames a second or more.`,
    'Opening is judged on the first time. Milliseconds, the median of the runs then the worst; frames a second, the median then the fewest.', '']
  const sized = (/** @type {any} */ result, /** @type {'ms' | 'frame'} */ key) => Object.entries(result.sizes).map(([n, runs]) => /** @type {const} */ ([Number(n), figures(/** @type {any[]} */ (runs), key)])).sort((a, b) => a[0] - b[0])
  /** @param {any} result @param {'ms' | 'frame'} key */
  const table = (result, key) => {
    const rows = sized(result, key), scrolled = key === 'ms' && rows.some(([, at]) => at.fps.length), gated = key === 'ms'
    return [`| Rows |${gated ? ' Runs | Elements | Fields |' : ''} Opening | Opening again | A change | Find, z | Find, a |${scrolled ? ' Scrolling, fps |' : ''}${gated ? ' Misses, by the medians | Misses, by the worst runs |' : ''}`,
      `|---:|${gated ? '---:|---:|---:|' : ''}---:|---:|---:|---:|---:|${scrolled ? '---:|' : ''}${gated ? '---|---|' : ''}`,
      ...rows.map(([n, at]) => `| ${ms(n)} |${gated ? ` ${at.runs - at.failed}${at.failed ? ` (${at.failed} failed)` : ''} | ${ms(at.held?.elements)} | ${ms(at.held?.fields)} |` : ''} ${both(at.open)} | ${both(at.again)} | ${both(at.change)} | ${both(at.some)} | ${both(at.all)} |${scrolled
        ? ` ${at.fps.length ? both(at.fps, true) : at.runs - at.failed ? 'all in view' : '—'} |` : ''}${gated ? ` ${misses(at, 'median').join(', ') || 'none'} | ${misses(at, 'worst').join(', ') || 'none'} |` : ''}`)]
  }
  /** What else the same runs timed. @param {any} result */
  const also = (result) => {
    const rows = sized(result, 'ms'), scrolled = rows.some(([, at]) => at.fps.length)
    return [`| Rows | A digit typed, the first | The next digit |${scrolled ? ' Frames a second at rest | Notches the page took in 2.7 s |' : ''}`, `|---:|---:|---:|${scrolled ? '---:|---:|' : ''}`,
      ...rows.map(([n, at]) => `| ${ms(n)} | ${both(at.typed)} | ${both(at.next)} |${scrolled ? ` ${both(at.still, true)} | ${at.notches.length ? ms(middle(at.notches).median) : '—'} |` : ''}`)]
  }
  /** The largest size that passes, every smaller one passing too, and what the next misses. @param {any} result @param {'median' | 'worst'} by @param {boolean} [again] */
  const verdict = (result, by, again) => {
    const rows = sized(result, 'ms').map(([n, at]) => /** @type {const} */ ([n, misses(at, by, again)]))
    const first = rows.findIndex(([, missed]) => missed.length), passes = first < 0 ? rows.at(-1)?.[0] : rows[first - 1]?.[0]
    return `${passes ? `${ms(passes)} rows is the largest size that passes` : 'no size passes'}${first < 0 ? '' : `; at ${ms(rows[first][0])} rows, ${rows[first][1].join(', ')} ${rows[first][1].length > 1 ? 'miss' : 'misses'}`}`
  }
  /** The first size at which each measure misses, by the medians. @param {any} result */
  const firsts = (result) => {
    const rows = sized(result, 'ms').map(([n, at]) => /** @type {const} */ ([n, misses(at, 'median')]))
    return ['opening', 'a change', 'Find', 'scrolling'].flatMap((name) => ((at) => (at ? [`${name} from ${ms(at[0])} rows`] : []))(rows.find(([, missed]) => missed.includes(name)))).join(', ')
  }
  /** @param {any} result @param {string} title @param {string} how */
  const browser = (result, title, how) => {
    out.push(`## ${title}`, '', `${how}; ${result.when.slice(0, 10)}, commit ${result.commit}${result.changed ? ` with ${result.changed} files of app/ changed since by other sessions` : ''}, ${result.cpu}.`, '', ...table(result, 'ms'), '',
      `By the medians, ${verdict(result, 'median')}. By the worst of the runs, ${verdict(result, 'worst')}. Judged on opening again in place of the first time, by the medians, ${verdict(result, 'median', true)}.`,
      `Each measure first misses, by the medians: ${firsts(result) || 'nowhere'}.`, '',
      'The same runs, by the first frame\'s end (the lower bound):', '', ...table(result, 'frame'), '', 'Also timed in those runs, outside the gate: a digit typed in that Amount, from its keydown until the field shows it painted;' +
      (result.engine === 'chromium' ? ' the frames a second of the page at rest, the collection open; and how many of the wheel\'s notches the page took.' : ' nothing else.'), '', ...also(result), '')
  }
  if (slowed) browser(slowed, `Chromium, the processor slowed ${slowed.rate} times: the gate's`, `Chromium ${slowed.version}, Playwright's, headless, \`Emulation.setCPUThrottlingRate\` at ${slowed.rate} from the opening on`)
  if (full) browser(full, 'Chromium at full speed, for comparison', `Chromium ${full.version}, the same runs with nothing slowed`)
  if (safari) browser(safari, 'WebKit at full speed', `WebKit ${safari.version}, Playwright's, headless, which nothing slows, so of the gate's four only opening, a change and Find; ${Object.values(safari.sizes).flat().some((/** @type {any} */ run) => run.ephemeral)
    ? 'its storage is in memory there, unsealed (Jean says so on its page)' : 'its storage is sealed, as Chromium\'s'}`)
  if (costs) {
    const [slow, fast] = [costs[4] ?? {}, costs[1] ?? {}], each = slow.n ?? fast.n, any = fast.n ? fast : slow
    /** A path's line: its times slowed, then at full speed. @param {string} name @param {(result: any) => number[] | undefined} of */
    const line = (name, of) => `| ${name} | ${both(of(slow) ?? [])} | ${both(of(fast) ?? [])} | ${middle(of(fast) ?? of(slow) ?? []).n} |`
    const list = (/** @type {any} */ result, /** @type {string} */ key, /** @type {string} */ field) => result[key]?.map((/** @type {any} */ run) => run[field])
    const drawn = (/** @type {string} */ key, /** @type {string} */ field) => (/** @type {any} */ r) => r[key]?.again.map((/** @type {any} */ run) => run[field])
    out.push(`## Each path at ${ms(each)} rows`, '',
      `In the page, the app's own modules imported by their addresses and called as the app calls them, on copies of the collection in projects of their own, on show nowhere but where the view is drawn. Chromium ${any.version}, ${any.when?.slice(0, 10)}, commit ${any.commit}.`,
      'Milliseconds, the median then the worst, the processor slowed 4 times, then at full speed; a first time or a first draw has as many runs as the last column says.', '',
      `\`changes.jsonl\` is **${ms(any.bytes / 1024)} KB** for ${ms(each)} rows written in one change, ${ms(any.bytes / each)} bytes a row; what \`kept()\` gives Creations and \`search_files\` to read is ${ms(any.kept1?.text / 1024)} KB of text a collection.`, '',
      '| Path | Slowed 4 times | Full speed | Runs |', '|---|---:|---:|---:|',
      line('Writing the rows: `app.fs.write` of `changes.jsonl`', (r) => r.writes?.write),
      line('The file read and unsealed: `app.fs.read`', (r) => r.loads?.read),
      line('`load()`, the first time a copy is read', (r) => r.loads?.first),
      line('`load()` again, nothing changed', (r) => r.loads?.again),
      line('`kept()`, one collection, the first time', (r) => r.kept1?.first),
      line('`kept()`, one collection, again', (r) => r.kept1?.again),
      line('`kept()`, three collections, the first time', (r) => r.kept3?.first),
      line('`kept()`, three collections, again', (r) => r.kept3?.again),
      line('Jean changes a number in 2,000 rows: `change()`, one call', (r) => list(r, 'jean', 'change')),
      line('`load()` after those 2,000 lines', (r) => list(r, 'jean', 'load')),
      line('`marked()`, those 2,000 lines unaccepted', (r) => r.jean && [...list(r, 'jean', 'marked'), ...(r.marks?.marked ?? [])]),
      line('The view, nothing marked: its first draw, script alone', (r) => r.drawPlain && [r.drawPlain.first.script]),
      line('… its first draw, until painted', (r) => r.drawPlain && [r.drawPlain.first.ms]),
      line('… drawn again, script alone', drawn('drawPlain', 'script')),
      line('… drawn again, until painted', drawn('drawPlain', 'ms')),
      line('The view, 2,000 changes marked: its first draw, script alone', (r) => r.drawMarked && [r.drawMarked.first.script]),
      line('… its first draw, until painted', (r) => r.drawMarked && [r.drawMarked.first.ms]),
      line('… drawn again, script alone', drawn('drawMarked', 'script')),
      line('… drawn again, until painted', drawn('drawMarked', 'ms')),
      line('`reject()` of the 2,000, with its write and the read after it', (r) => list(r, 'reject', 'reject')),
      line('`query()`, the rows alone, as the table view asks', (r) => r.groups?.rows),
      line('`query()`, grouped by the select of 40 choices', (r) => r.groups?.choices),
      line(`\`query()\`, grouped by the name, ${ms(each)} values`, (r) => r.groups?.names),
      line('One more change of the person\'s: `change()`, whole', (r) => r.changes?.whole),
      line('… its stamp: `stamp()`', (r) => r.changes?.stamp),
      line('… what undoes it: `inverse()`', (r) => r.changes?.inverse),
      line('… its line written: `app.fs.append`', (r) => r.changes?.append),
      line('… the collection read again: `load()`', (r) => r.changes?.load), '',
      `The view drawn holds ${ms(any.drawPlain?.elements)} elements for ${ms(each)} rows, ${ms(any.drawMarked?.elements)} with ${ms(any.drawMarked?.marked)} rows marked.`,
      ...[slow, fast].flatMap((r) => Object.entries(r).filter(([key]) => key.endsWith(' failed')).map(([key, why]) => `- At ${r.rate}×, ${key}: ${why}`)), '')
  }
  const notes = existsSync(PAGE) ? readFileSync(PAGE, 'utf8').split(/^(?=## Notes$)/m)[1] : ''
  writeFileSync(PAGE, `${out.join('\n')}\n${notes ?? ''}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n')
  say('wrote', PAGE)
}

mkdirSync(OUT, { recursive: true })
const chosen = option('sizes')?.split(',').map(Number).filter(Boolean) ?? SIZES, runs = Number(option('runs')) || 5, only = option('only')
if (!flag('write') || flag('webkit') || only || ['sizes', 'runs', 'rate', 'rows'].some(option)) {
  const stop = await serve()
  try {
    if (flag('webkit')) await sizes(webkit, 1, chosen, runs)
    else {
      if (only !== 'paths') await sizes(chromium, Number(option('rate')) || 4, chosen, runs)
      if (only !== 'sizes') {
        const file = join(OUT, 'paths.json'), kept = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
        for (const rate of [1, 4]) { kept[rate] = await paths(rate, Number(option('rows')) || 10000, runs); writeFileSync(file, JSON.stringify(kept, null, 1)) }
      }
    }
  } finally {
    stop()
  }
}
if (flag('write')) write()
