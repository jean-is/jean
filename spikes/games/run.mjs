// Phase 0 gates, in Chromium and WebKit: node run.mjs [chromium|webkit]
import { chromium, webkit } from '../../node_modules/playwright/index.mjs'

const URL_ = `http://127.0.0.1:${process.env.PORT ?? 4290}/parent.html`
const which = process.argv[2] ? [process.argv[2]] : ['chromium', 'webkit']
const diff = (a, b) => {
  if (!a || !b) return 999
  if (a.length === 576 && b.length === 576) return a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / 576
  return JSON.stringify(a) === JSON.stringify(b) ? 0 : 999
}
const short = (r) => ({
  timeout: r.timeout, started: r.started, frames: r.frames, wall: r.wall, parentWall: r.parentWall,
  work: r.work && `${r.work.median?.toFixed(2)}/${r.work.worst?.toFixed(1)} ms`,
  errors: r.errors, violations: [...new Set(r.violations ?? [])], alerts: r.alerts,
  states: (r.states ?? []).slice(0, 6), scores: (r.scores ?? []).slice(-1), words: (r.words ?? []).slice(0, 4), text: r.text?.slice(0, 80),
  blank: r.prints ? r.prints.every((p) => diff(p, r.prints[0]) === 0) : undefined,
  unreadable: r.prints?.find((p) => typeof p[0] === 'string')?.[0],
})

for (const name of which) {
  const browser = await (name === 'chromium' ? chromium : webkit).launch()
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } })
  const page = await context.newPage()
  const consoleLines = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(m.text().slice(0, 160)) })
  await page.goto(URL_)
  await page.waitForFunction(() => window.ready)
  const run = (args) => page.evaluate((a) => window.run(a), args)
  console.log(`\n######## ${name}`)

  for (const [game, engine, actions] of [['phaser', 'phaser', ['left', 'right', 'a', 'b']], ['phaser', 'phaser3', ['left', 'a']], ['babylon', 'babylon', ['left', 'b']], ['canvas', 'none', ['left', 'a', 'b']]]) {
    consoleLines.length = 0
    const test = { frames: 300, seed: 7 }
    const one = await run({ game, engine, test })
    const two = await run({ game, engine, test })
    const same = one.prints && two.prints && one.prints.length === two.prints.length && one.prints.every((p, i) => diff(p, two.prints[i]) === 0)
    const effects = {}
    for (const action of actions) {
      const r = await run({ game, engine, test: { ...test, press: [{ action, from: 100, to: 160 }] } })
      const i = r.prints?.findIndex((p, k) => k * 10 > 100 && diff(p, one.prints[k]) > 0.2)
      effects[action] = i > 0 ? `changed at frame ${i * 10}` : 'no change'
    }
    console.log(`\n== ${game} on ${engine}`, JSON.stringify({ ...short(one), deterministic: same, effects, console: [...new Set(consoleLines)].slice(0, 4) }, null, 1))
  }

  for (const game of ['syntax', 'runtime']) {
    const r = await run({ game, engine: 'none', test: { frames: 60, seed: 1 }, timeout: 8000 })
    console.log(`\n== ${game}`, JSON.stringify(short(r)))
  }

  consoleLines.length = 0
  const first = await run({ game: 'storage', engine: 'none', test: { frames: 30, seed: 1 } })
  const kept = await page.evaluate(() => window.kept)
  const second = await run({ game: 'storage', engine: 'none', test: { frames: 30, seed: 1 }, saved: kept.keep, storage: kept.storage })
  console.log('\n== storage', JSON.stringify({ first: short(first), kept, second: second.states, console: [...new Set(consoleLines)].slice(0, 4) }, null, 1))

  for (const allow of ['fullscreen *; gamepad *', 'fullscreen *']) {
    const r = await run({ game: 'gamepad', engine: 'none', test: { frames: 10, seed: 1 }, allow })
    console.log(`\n== gamepad, allow "${allow}"`, JSON.stringify(r.states))
  }
  const visible = await run({ game: 'phaser', engine: 'phaser', test: { frames: 300, seed: 7 }, visible: true })
  console.log('\n== phaser in a visible frame', JSON.stringify(short(visible)))

  // In the background: another page in front.
  const other = await context.newPage()
  await other.goto('about:blank')
  await other.bringToFront()
  const state = await page.evaluate(() => document.visibilityState)
  const behind = await run({ game: 'phaser', engine: 'phaser', test: { frames: 600, seed: 7 }, timeout: 30000 })
  console.log(`\n== phaser behind another page (parent ${state})`, JSON.stringify(short(behind)))
  await page.bringToFront()

  // A loop that never ends: does Jean's own page still answer?
  void run({ game: 'hang', engine: 'none', test: { frames: 300, seed: 1 }, timeout: 8000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  const t = Date.now()
  const answered = await Promise.race([page.evaluate(() => 1 + 1).then(() => `answered in ${Date.now() - t} ms`), new Promise((r) => setTimeout(() => r('no answer in 3 s'), 3000))])
  console.log('\n== hang: parent', answered)
  await browser.close().catch(() => {})
}
