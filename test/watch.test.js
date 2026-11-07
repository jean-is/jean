// Jean's reels (D687, docs/reels.md): a task's replay planned as app/ui/demo.js plays it, laid out with its stops'
// holds; scenes end to end; the score, the same for a seed, fuller as the reel goes and home on D at its end; and
// /watch, which writes the player and each reel in each of its languages, every stop at a moment its task reaches,
// pointing at what Jean draws. test/watch.spec.js holds the plan to what demo.js asks of a reel in a browser.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { PACE, beats, exchanges, words } from '../app/ui/replay.js'
import { GROWTH } from '../site/excel/page.js'
import { buildSite } from '../site/site.js'
import { MONTHLY, NAMES, ON, reading } from '../site/watch/reels.js'
import { reelTime, steps, taskTime } from '../site/watch/schedule.js'
import { compose, encode, energy, random } from '../site/watch/score.js'

const lines = (await readFile(new URL('./fixtures/demo.jsonl', import.meta.url), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
const lineOf = (/** @type {any} */ record) => lines.indexOf(record) + 1
const site = await buildSite({ brand: BRAND, base: 'https://jean.is/', now: new Date('2026-11-03T10:00:00') })

test('a task’s steps are demo.js’s: each request’s lines, its pause, then each beat, a call’s id as it starts, an approval, the end', () => {
  const cut = words('en')
  const list = steps(lines.slice(1), lineOf, cut)
  const [first, second] = exchanges(lines.slice(1))
  // Before the first request shows: a moment at each of its lines, then the first pause.
  assert.deepEqual(list.slice(0, first.said.length + 1), [...first.said.map((record) => ({ kind: 'at', moment: lineOf(record) })), { kind: 'pause', first: true }])
  // Its waits are the beats' holds, in order, the pause before the next request between.
  const waits = list.filter((step) => step.kind === 'wait').map((step) => step.kind === 'wait' && step.ms)
  assert.deepEqual(waits, [...beats(first.answer, cut), ...beats(second.answer, cut)].map(({ hold }) => hold))
  assert.deepEqual(list.filter((step) => step.kind === 'pause'), [{ kind: 'pause', first: true }, { kind: 'pause', first: false }])
  // A moment at each record's line as it starts, and at each call's id once it is under way; the end the last.
  assert.equal(list.filter((step) => step.kind !== 'wait').map((step) => (step.kind === 'at' ? step.moment : step.kind)).join(' '), '2 3 4 pause 5 brain-0 6 7 call-1 8 brain-1 9 10 pause 11 brain-2 12 end')
  // A call that asks first is an approval, the replay waiting on its card.
  const asking = lines.slice(1).map((record) => (record.update?.toolCallId === 'call-1' && record.update.status === 'completed' ? { ...record, update: { ...record.update, status: 'pending' } } : record))
  asking.splice(asking.findIndex((record) => record.update?.toolCallId === 'call-1') + 1, 0, lines.slice(1).find((record) => record.update?.toolCallId === 'call-1' && record.update.status === 'completed'))
  assert.ok(steps(asking, (record) => asking.indexOf(record) + 2, cut).some((step) => step.kind === 'ask' && step.id === 'call-1'))
})

test('a task’s time: each stop holds where it is, the pause after stops is none, an approval holds for its stops, and a moment is left at the end', () => {
  /** @type {import('../site/watch/schedule.js').Step[]} */
  const list = [{ kind: 'at', moment: 2 }, { kind: 'at', moment: 3 }, { kind: 'pause', first: true }, { kind: 'at', moment: 'brain-0' }, { kind: 'wait', ms: 900 }, { kind: 'ask', id: 'call-1' }, { kind: 'wait', ms: 200 }, { kind: 'at', moment: 'end' }]
  const stops = [{ at: 2, go: 1000 }, { at: 'brain-0', go: 2000, on: '.msg-user' }, { at: 'ask:call-1', go: 1500 }]
  const time = taskTime(list, stops)
  assert.deepEqual(time.holds.map(({ stop, start, end }) => [stop.at, start, end]), [[2, 0, 1000], ['brain-0', 1600, 3600], ['ask:call-1', 4500, 6000]])
  assert.deepEqual(time.calls, [
    { kind: 'at', moment: 2, time: 1000, held: true }, { kind: 'at', moment: 3, time: 1000, held: false }, { kind: 'wait', time: 1600 },
    { kind: 'at', moment: 'brain-0', time: 3600, held: true }, { kind: 'wait', time: 4500 }, { kind: 'wait', time: 6200 }, { kind: 'at', moment: 'end', time: 6200, held: false },
  ])
  assert.deepEqual(time.asks, [{ id: 'call-1', time: 6000 }])
  assert.equal(time.length, 6200 + PACE.read)
  // demo.js pauses before a later request for PACE.read, or not at all once a stop held it there.
  const later = (/** @type {import('../site/watch/schedule.js').Stop[]} */ held) => taskTime([{ kind: 'at', moment: 5 }, { kind: 'pause', first: false }], held, 0).length
  assert.deepEqual([later([]), later([{ at: 5, go: 700 }])], [PACE.read, 700])
  // Without a stop of its own, an approval waits a moment's read before it is clicked.
  assert.deepEqual(taskTime([{ kind: 'ask', id: 'x' }], [], 0).asks, [{ id: 'x', time: PACE.read }])
})

test('scenes are laid end to end, and a caption holds as long as it takes to read, longer in Japanese', () => {
  const { scenes, length } = reelTime([{ n: 1 }, { n: 2 }, { n: 3 }], (scene) => scene.n * 1000)
  assert.deepEqual(scenes.map(({ start, end }) => [start, end]), [[0, 1000], [1000, 3000], [3000, 6000]])
  assert.equal(length, 6000)
  assert.equal(reading('Short.'), 2600)
  assert.equal(reading('x'.repeat(500)), 6800)
  assert.ok(reading('あ'.repeat(30)) > reading('a'.repeat(30)))
})

/** A reel's plan as the player hands it to the score: an open card, two tasks, the last card, two clicks. */
const PLAN = { length: 40_000, scenes: [{ kind: /** @type {const} */ ('card'), look: 'open', start: 0, end: 4000 }, { kind: /** @type {const} */ ('task'), start: 4000, end: 18_000 }, { kind: /** @type {const} */ ('task'), start: 18_000, end: 34_000 }, { kind: /** @type {const} */ ('card'), look: 'end', start: 34_000, end: 40_000 }], clicks: [12_000, 30_000] }

test('the score is the same for a seed and another for another, fuller as the reel goes, home on D at its last card', () => {
  assert.deepEqual(compose(PLAN), compose(PLAN))
  assert.notDeepEqual(compose(PLAN, 2), compose(PLAN, 1))
  const notes = compose(PLAN)
  assert.ok(notes.every((note, i) => note.at >= 0 && note.at < PLAN.length && (!i || notes[i - 1].at <= note.at)))
  // Pad and piano alone before any task; bass and shaker with the first; kick and rim from the second.
  assert.deepEqual([energy(PLAN, 1000), energy(PLAN, 10_000), energy(PLAN, 25_000), energy(PLAN, 36_000)], [0, 1, 2, 1])
  const parts = (/** @type {number} */ from, /** @type {number} */ to) => new Set(notes.filter((note) => note.at >= from && note.at < to).map((note) => note.part))
  assert.deepEqual([...parts(0, 3500)].sort(), ['keys', 'pad'])
  assert.ok(!parts(0, 18_000).has('kick') && parts(19_000, 33_000).has('kick'))
  // Home: from the first bar line of the last card, the bar under way ending first, D in the bass, under a chord that holds to the end, no drum.
  const bar = (4 * 60_000) / 88
  const at = Math.ceil((34_000 - bar / 8) / bar) * bar
  assert.ok(at >= 34_000 && at - 34_000 < bar)
  const home = notes.filter((note) => note.at >= at - 1 && note.part !== 'air' && note.part !== 'click')
  assert.ok(home.length && home.every((note) => ['pad', 'keys', 'bass'].includes(note.part)))
  assert.equal(home.find((note) => note.part === 'bass')?.midi, 38)
  // A tick where the pointer clicks, and a breath before each scene.
  assert.deepEqual(notes.filter((note) => note.part === 'click').map((note) => note.at), PLAN.clicks)
  assert.deepEqual(notes.filter((note) => note.part === 'air').map((note) => note.at), [3750, 17_750, 33_750])
  // Its randomness is seeded, the same each time.
  assert.deepEqual([random(7)(), random(7)()], [random(7)(), random(7)()])
})

test('an export’s sound is a 16-bit PCM WAV, each channel interleaved', () => {
  const samples = [new Float32Array([0, 1, -1]), new Float32Array([0.5, -0.5, 2])]
  const wav = encode(/** @type {AudioBuffer} */ (/** @type {unknown} */ ({ numberOfChannels: 2, length: 3, sampleRate: 48_000, getChannelData: (/** @type {number} */ c) => samples[c] })))
  const view = new DataView(wav.buffer)
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)) + new TextDecoder().decode(wav.subarray(8, 12)), 'RIFFWAVE')
  assert.deepEqual([view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true), view.getUint32(40, true)], [2, 48_000, 16, 12])
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true)), [0, 16383, 32767, -16383, -32767, 32767])
})

test('/watch writes the player: a document of its own, out of search results, running demo.html’s first line, its import map and its own code', async () => {
  const html = site.files['reel.html']
  assert.match(html, /<meta name="robots" content="noindex">/)
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? ''
  const inline = [...html.matchAll(/<script(?: type="importmap")?>([\s\S]*?)<\/script>/g)].map(([, script]) => script)
  const first = /<script>([\s\S]*?)<\/script>/.exec(await readFile(new URL('../app/demo.html', import.meta.url), 'utf8'))?.[1]
  assert.deepEqual(inline.map((script) => script === first ? 'first' : JSON.parse(script)), ['first', { imports: { '#app/': './' } }])
  const hash = (/** @type {string} */ script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`
  assert.ok(policy.startsWith(`default-src 'none'; script-src 'self' ${inline.map(hash).join(' ')}; style-src 'self';`), policy)
  assert.match(policy, /frame-src 'self'; .*require-trusted-types-for 'script'; trusted-types 'none'$/)
  for (const file of ['reels/reel.js', 'reels/schedule.js', 'reels/score.js', 'reels/reel.css']) assert.ok(file in site.files, file)
  assert.match(html, /<script type="module" src="reels\/reel\.js"><\/script>/)
  // Each glyph the player names is in its template.
  const glyphs = new Set([...html.matchAll(/data-icon="([a-z]+)"/g)].map(([, name]) => name))
  for (const name of new Set([...site.files['reels/reel.js'].matchAll(/icon\('([a-z]+)'\)/g)].map(([, name]) => name))) assert.ok(glyphs.has(name), name)
  // Sound on and sound off turn with the page together, as the app's speaker does.
  for (const name of ['speaker', 'muted']) assert.match(html, new RegExp(`<svg data-icon="${name}" class="icon flip-rtl"`), name)
  // Each page frames the reels in its language, full screen allowed.
  for (const page of site.pages.filter(({ name }) => name === 'watch')) {
    const frames = [...site.files[page.path].matchAll(/<iframe src="([^"]+)" title="[^"]+" allow="fullscreen; autoplay" loading="lazy">/g)].map(([, src]) => new URLSearchParams(src.replaceAll('&amp;', '&').split('#')[1]))
    assert.deepEqual(frames.map((params) => [params.get('reel'), params.get('lang')]), NAMES.map((name) => [name, page.lang]), page.path)
  }
})

test('every reel, in every language of /watch, plays tasks the site writes, every stop at a moment its task reaches, pointing at what Jean draws', async () => {
  const languages = site.pages.filter(({ name }) => name === 'watch').map(({ lang }) => lang)
  assert.deepEqual(languages.sort(), ['ar', 'en', 'fr', 'ja'])
  /** @type {Map<string, string[]>} */
  const shapes = new Map()
  for (const name of NAMES) {
    for (const lang of languages) {
      const reel = JSON.parse(site.files[`reels/${name}.${lang}.json`])
      assert.deepEqual([reel.kind, reel.name, reel.lang, reel.address], ['reel', name, lang, BRAND.domain])
      assert.deepEqual(reel.languages.map((/** @type {any} */ one) => one.lang).sort(), languages)
      for (const [key, said] of Object.entries(reel.words)) assert.ok(said && !said.includes('{name}'), `${name}.${lang}: ${key}`)
      shapes.set(name, [...shapes.get(name) ?? [], reel.scenes.map((/** @type {any} */ scene) => `${scene.kind}:${scene.stops?.length ?? scene.look}`).join()])
      for (const scene of reel.scenes) {
        assert.ok(scene.chapter && !/[{}]/.test(scene.chapter), `${name}.${lang}: a chapter`)
        if (scene.kind !== 'task') continue
        const task = site.files[scene.src]?.trim().split('\n').map((line) => JSON.parse(line))
        assert.ok(task, scene.src)
        const list = steps(task.slice(1), (record) => task.indexOf(record) + 1, words(lang))
        const moments = new Set(list.map((step) => (step.kind === 'at' ? step.moment : step.kind === 'ask' ? `ask:${step.id}` : null)))
        for (const stop of scene.stops) {
          assert.ok(moments.has(stop.at), `${name}.${lang}: no moment ${stop.at}`)
          assert.ok(!stop.on || Object.values(ON).includes(stop.on), `${name}.${lang}: ${stop.on}`)
          assert.ok(stop.say && !/[{}]/.test(stop.say) && stop.go === reading(stop.say), `${name}.${lang}: ${stop.say}`)
        }
      }
    }
    // The same scenes and stops in every language.
    assert.equal(new Set(shapes.get(name)).size, 1, name)
  }
  // The sample's growth month by month, worked out from sales.csv, in every language's chart: a line a product from
  // the same start, each ending on the growth the answer names, the one that grew the most drawn over its area.
  for (const lang of languages) {
    const answer = site.files[`demos/reels/jean/chart.${lang}.jsonl`].trim().split('\n').map((line) => JSON.parse(line)).at(-1).update.content.text
    const { series } = JSON.parse(/```echarts\n(.*)\n```/.exec(answer)?.[1] ?? 'null')
    assert.deepEqual(series.map((/** @type {any} */ one) => one.data), MONTHLY.map(({ months }) => months.map((growth) => Math.round(growth * 100))), lang)
    assert.deepEqual(series.map((/** @type {any} */ one) => one.data.at(-1)), GROWTH.map(({ growth }) => Math.round(growth * 100)), lang)
    const best = GROWTH.indexOf([...GROWTH].sort((a, b) => b.growth - a.growth)[0])
    assert.deepEqual(series.map((/** @type {any} */ one) => Boolean(one.areaStyle)), GROWTH.map((_, i) => i === best), lang)
  }
})
