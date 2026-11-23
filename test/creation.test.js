// SPDX-License-Identifier: MIT
// The pages whose pane is what Jean made, live in Jean's own view (site/creation.js): /websites, /prototypes,
// /whiteboards, /games, /collections, /documents, /designs and /forms. Each frames the document that shows a creation, with its creation's file beside it in each of its
// languages. What that file holds is held to what Jean itself asks of one: the site passes Sites' own check, the
// prototype Prototypes', every page reached from the first; the whiteboard is a collection Tables reads, its notes
// where `whiteboard` puts them, and the change it brings is `whiteboard_change`'s, Jean's own, to accept or reject;
// the game is one Games keeps as its file, its words the page's; the collection is one Tables reads, Jean's change of
// it waiting; the document's Markdown reads as its editor reads one, Jean's version beside it; and the design is one
// Designs lays out from what `design` is given; and /forms' collection is one Tables reads, each row a visitor's reply with
// what the person noted since, its form asking the columns Collect replies can ask.
// And the few modules of the room the views ask for, which the document stands in for, give every name those views
// import from them. test/creation.spec.js holds the views themselves, in a browser.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { BRAND } from '../app/brand.js'
import { ACTIONS, PLACE as GAME, fileOf, gameOf } from '../app/caps/games/file.js'
import { guard } from '../app/caps/games/guard.js'
import { checkScreens } from '../app/caps/prototypes/check.js'
import { checkFiles } from '../app/caps/sites/check.js'
import { fromSvg } from '../app/caps/designs/format.js'
import { marksOf } from '../app/caps/designs/layout.js'
import { ROLES } from '../app/caps/designs/tool.js'
import { dealt, worn } from '../app/caps/sites/look.js'
import { fold, marked, parseChanges, stamp } from '../app/caps/tables/changes.js'
import { PLACE, notesOf, readTable, titleOf } from '../app/caps/tables/table.js'
import { askable, partsOf } from '../app/caps/collect/form.js'
import { layout } from '../app/caps/whiteboards/layout.js'
import { dir } from '../app/core/i18n.js'
import { STOOD } from '../site/creation.js'
import { buildSite, sitePages } from '../site/site.js'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const site = await buildSite({ brand: BRAND, base: 'https://jean.is/', now: new Date('2026-11-03T10:00:00') })
const MADE = ['collections', 'designs', 'documents', 'forms', 'games', 'prototypes', 'websites', 'whiteboards']
const made = site.pages.filter((page) => MADE.includes(page.name))
/** A page's creation, as its file holds it. @param {{ name: string, lang: string }} page */
const creationOf = (page) => JSON.parse(site.files[`creations/${page.name}.${page.lang}.json`])
/** A site's or a prototype's files dressed in its look, as `site` and `prototype` dress them before they check them. @param {any} one */
async function dressed (one) {
  const files = new Map(Object.entries(one.files).map(([path, text]) => [path, new TextEncoder().encode(String(text))]))
  const { palettes } = JSON.parse(await readFile(join(APP, 'caps/designs/layouts.json'), 'utf8'))
  return worn(files, dealt({ files, seed: one.path, palettes, given: one.look }).look).files
}

test('each page for something Jean makes frames the document that shows a creation, with its creation beside it in each of its languages', async () => {
  const pages = await sitePages()
  assert.deepEqual([...new Set(made.map((page) => page.name))], MADE)
  for (const page of made) {
    assert.deepEqual(Object.keys(pages.get(page.name)?.addresses ?? {}), ['en', 'fr'], page.name)
    const html = site.files[page.path], frames = [...html.matchAll(/<iframe class="site-creation is-(?:site|prototype|whiteboard|game|collection|document|design|form)" src="([^"]+)" title="([^"]+)" loading="lazy"><\/iframe>/g)]
    assert.equal(frames.length, 1, page.path)
    const [at, hash] = frames[0][1].replaceAll('&amp;', '&').split('#'), params = new URLSearchParams(hash)
    assert.equal(at, `${'../'.repeat(page.address.split('/').length - 1)}creation.html`, page.path)
    assert.deepEqual([params.get('src'), params.get('lang'), params.has('bare')], [`creations/${page.name}.${page.lang}.json`, page.lang, true], page.path)
    assert.ok(String(params.get('src')) in site.files, page.path)
    // Over it, the request that made it; under it, what to try there.
    assert.match(html, /<p class="job-sent" dir="ltr"><span class="visually-hidden">[^<]+<\/span><span>[^<]+<\/span><\/p>\s*<iframe class="site-creation is-/, page.path)
    assert.match(html, /<\/iframe>\s*<p class="job-try"><svg class="felt-point"[^>]*>.*?<\/svg><span>[^<]+<\/span><\/p>/, page.path)
  }
})

test('the document that shows a creation runs demo.html’s first line and its own modules alone, over demo.html’s import map with the room’s modules stood in for', async () => {
  const html = site.files['creation.html'], demo = await readFile(join(APP, 'demo.html'), 'utf8')
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? ''
  const [first, map] = [/<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '', /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '']
  const hash = (/** @type {string} */ script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`
  assert.equal(first, /<script>([\s\S]*?)<\/script>/.exec(demo)?.[1])
  assert.match(policy, new RegExp(` script-src 'self' ${hash(first).replaceAll('+', '\\+')} ${hash(map).replaceAll('+', '\\+')};`))
  assert.match(policy, / frame-src 'self';.* require-trusted-types-for 'script'; trusted-types lit-html app-urls$/)
  assert.match(html, /<meta name="robots" content="noindex">/)
  const theirs = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(demo)?.[1] ?? '{}').imports
  // And the editor's library, by the name the app's own document gives it, which a document's editor imports.
  const editor = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(await readFile(join(APP, 'index.html'), 'utf8'))?.[1] ?? '{}').imports['#prosemirror']
  assert.ok(editor)
  assert.deepEqual(JSON.parse(map).imports, { ...theirs, '#prosemirror': editor, '#app/': './', ...Object.fromEntries(Object.entries(STOOD).map(([from, to]) => [`./${from}`, `./creations/${to}`])) })
  for (const file of ['creation.js', 'state.js', 'room.js', 'creation.css']) assert.ok(`creations/${file}` in site.files, file)
  assert.match(html, /<script type="module" src="creations\/creation\.js"><\/script>/)
})

test('the modules that stand in for the room’s give every name Jean’s views import from them', async () => {
  const stood = new Map(Object.entries(STOOD).map(([from, to]) => [resolve(APP, from), to]))
  /** The names each stood-in module is asked for, by the modules the player's views reach. @type {Map<string, Set<string>>} */
  const asked = new Map([...new Set(stood.values())].map((to) => [to, new Set()]))
  const seen = new Set()
  /** @param {string} file */
  const walk = async (file) => {
    if (seen.has(file) || stood.has(file)) return
    seen.add(file)
    const source = await readFile(file, 'utf8')
    const imports = [...[...source.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map(([, from]) => ['', from]), ...[...source.matchAll(/^(?:import|export)\s+([^'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)].map(([, names, from]) => [names, from])]
    for (const [names, from] of imports) {
      if (!from.startsWith('.')) continue
      const to = resolve(dirname(file), from), stand = stood.get(to)
      if (!stand) { await walk(to); continue }
      for (const name of (/\{([^}]*)\}/.exec(names)?.[1] ?? '').split(',').map((one) => one.trim().split(/\s+as\s+/)[0]).filter(Boolean)) asked.get(stand)?.add(name)
    }
  }
  const player = await readFile(new URL('../site/creation/player.js', import.meta.url), 'utf8')
  const roots = [...player.matchAll(/['"]#app\/([^'"]+)['"]/g)].map(([, path]) => path)
  assert.ok(['caps/sites/frame.js', 'caps/prototypes/board.js', 'caps/whiteboards/view.js', 'caps/tables/tables.js', 'caps/games/frame.js', 'caps/documents/editor.js', 'caps/designs/designs.js'].every((root) => roots.includes(root)), roots.join(' '))
  for (const root of roots) await walk(resolve(APP, root))
  /** What a module gives: its own names, and those of a module it gives whole. @param {string} source @returns {Promise<string[]>} */
  const given = async (source) => [...[...source.matchAll(/^export (?:const|function|async function|let) ([\w$]+)/gm)].map(([, name]) => name),
    ...[...source.matchAll(/^export \{([^}]*)\}/gm)].flatMap(([, names]) => names.split(',').map((name) => name.trim().split(/\s+as\s+/).at(-1) ?? '')),
    ...(await Promise.all([...source.matchAll(/^export \* from '#app\/([^']+)'/gm)].map(async ([, path]) => given(await readFile(join(APP, path), 'utf8'))))).flat()]
  for (const [stand, names] of asked) {
    const gives = await given(await readFile(new URL(`../site/creation/${stand}`, import.meta.url), 'utf8'))
    assert.deepEqual([...names].filter((name) => !gives.includes(name)), [], `site/creation/${stand} lacks what the views import`)
    assert.ok(names.size, stand)
  }
  // The room itself never comes: none of what the views reach is one of its heavier modules.
  for (const never of ['ui/app.js', 'ui/chat.js', 'ui/composer.js', 'ui/router.js', 'core/loop.js']) assert.ok(!seen.has(resolve(APP, never)), never)
})

test('/websites’ site passes Jean’s own check in each language, the one fact its request doesn’t give left in square brackets', async () => {
  for (const page of made.filter((at) => at.name === 'websites')) {
    const one = creationOf(page), report = checkFiles(await dressed(one))
    assert.deepEqual([one.kind, Object.keys(one.files)], ['site', ['style.css', 'index.html', 'classes.html', 'signup.html']], page.path)
    assert.deepEqual(report.problems, [], page.path)
    assert.deepEqual([report.pages.length, report.languages], [3, [page.lang]], page.path)
    assert.equal(report.fill.length, 1, page.path)
    assert.match(report.fill[0], /^\[[^\]]+\] \(index\.html, classes\.html, signup\.html\)$/, page.path)
    for (const [path, text] of Object.entries(one.files)) if (path.endsWith('.html')) assert.match(String(text), new RegExp(`^<!doctype html>\\n<html lang="${page.lang}" dir="${dir(page.lang)}">`), path)
    // Nothing from elsewhere, and no colour of its own: its look's properties alone.
    assert.doesNotMatch(Object.values(one.files).join('\n'), /https?:\/\/|#[\da-f]{3,8}\b|\brgb\(/i, page.path)
    assert.match(one.look.accent, /^#[\da-f]{6}$/)
  }
})

test('/prototypes’ prototype passes Jean’s own check in each language, every page reached from the first, each choice carried in the address', async () => {
  for (const page of made.filter((at) => at.name === 'prototypes')) {
    const one = creationOf(page), report = checkScreens(await dressed(one)), pages = Object.keys(one.files).filter((path) => path.endsWith('.html'))
    assert.deepEqual([one.kind, one.shape, pages], ['prototype', 'phone', ['index.html', 'time.html', 'confirm.html', 'done.html', 'bookings.html']], page.path)
    assert.deepEqual(report.problems, [], page.path)
    assert.deepEqual(report.fill, [], page.path)
    // As pressing through would find it: each page reached, each named by the control that led to it, a form's choice in its address.
    assert.deepEqual([...one.flow.reached].sort(), [...pages].sort(), page.path)
    assert.deepEqual(one.flow.leads.map(([from]) => from), one.flow.reached, page.path)
    assert.deepEqual(Object.keys(one.flow.by).sort(), pages.filter((path) => path !== 'index.html').sort(), page.path)
    for (const [, name] of Object.values(one.flow.by)) assert.match(name, /\p{L}{2}/u, page.path)
    assert.match(one.flow.at['time.html'], /^\?service=/, page.path)
    assert.match(one.flow.at['confirm.html'], /^\?service=[^&]+&time=/, page.path)
    // It says it is a prototype, keeps nothing, and asks for no password or card.
    assert.match(one.files['index.html'], /<p class="sample">[^<]+<\/p>/, page.path)
    assert.doesNotMatch(Object.values(one.files).join('\n'), /localStorage|type="password"|https?:\/\//, page.path)
  }
})

test('/whiteboards’ whiteboard is a collection Tables reads, its notes where `whiteboard` puts them and others on its shelf, and the change it brings is Jean’s, to accept or reject', async () => {
  for (const page of made.filter((at) => at.name === 'whiteboards')) {
    const one = creationOf(page), words = /** @type {Record<string, any>} */ (site.words.get('whiteboards')?.[page.lang])
    assert.match(one.folder, PLACE, page.path)
    const table = readTable(one.files['collection.json']), lines = parseChanges(one.files['changes.jsonl']), rows = fold(lines), laid = layout(rows)
    assert.deepEqual([table.kind, table.dir, table.name, one.folder.slice(12, 38)], ['whiteboard', dir(page.lang), words['made.name'], table.id], page.path)
    assert.equal(table.properties.find((property) => property.id === 'area')?.collection, one.folder, page.path)
    // Its sections in order, each with its notes; the notes people wrote since wait on its shelf; nothing of it waits to be accepted.
    assert.deepEqual(laid.areas.map((area) => area.row.cells.note), words['made.areas'], page.path)
    assert.deepEqual(laid.areas.map((area) => notesOf(rows).filter((row) => row.cells.area === area.row.id).map((row) => row.cells.note)),
      words['made.areas'].map((/** @type {string} */ area) => words['made.notes'].filter((/** @type {string[]} */ note) => note[0] === area).map((/** @type {string[]} */ note) => note[1])), page.path)
    assert.deepEqual(laid.shelf.map((row) => row.cells.note).sort(), [...words['made.shelf']].sort(), page.path)
    assert.deepEqual(marked(lines, table.kept), [], page.path)
    // Asked, Jean moves each waiting note to its section, and nothing else: its own changes, one a note, which wait.
    const after = [...lines, ...stamp(lines, one.then, { by: 'jean' })], sorted = fold(after), now = layout(sorted)
    assert.deepEqual([now.shelf.length, marked(after, table.kept).length, one.then.length], [0, words['made.shelf'].length, words['made.shelf'].length], page.path)
    for (const [note, area] of words['made.then']) {
      const row = notesOf(sorted).find((each) => each.cells.note === note)
      assert.equal(now.areas.find((each) => each.row.id === row?.cells.area)?.row.cells.note, area, `${page.path}: ${note}`)
    }
    assert.deepEqual(now.areas.length, words['made.areas'].length, page.path)
  }
})

test('/games’ game is one Games keeps as its file, in each language: one module on a plain canvas, its numbers in TUNING, its words the page’s, its moments said', async () => {
  for (const page of made.filter((at) => at.name === 'games')) {
    const one = creationOf(page), words = /** @type {Record<string, any>} */ (site.words.get('games')?.[page.lang])
    assert.match(one.path, GAME, page.path)
    assert.deepEqual([one.kind, one.name, one.meta.engine, one.meta.author], ['game', words['made.name'], 'none', 'jean'], page.path)
    assert.ok(one.meta.actions.split(' ').every((/** @type {string} */ action) => ACTIONS.includes(action)), page.path)
    // Kept as Games keeps one, and read back the same.
    const kept = gameOf(fileOf(one, page.lang))
    assert.deepEqual([kept?.name, kept?.card, kept?.code, kept?.meta.engine], [one.name, one.card, one.code, 'none'], page.path)
    // Its design card, 120 words at most, as the skill asks.
    assert.ok(one.card.split(/\s+/).filter((/** @type {string} */ word) => /\p{L}|\p{N}/u.test(word)).length <= 120, page.path)
    // Its code reads as a program, guarded as its frame guards it; it draws the page's words and says its moments.
    assert.doesNotThrow(() => new Script(guard(one.code, '__loop()')), page.path)
    const drawn = JSON.parse(/const WORDS = (\{.*\})\n/.exec(one.code)?.[1] ?? '{}')
    assert.deepEqual(drawn, Object.fromEntries(['title', 'how', 'start', 'again', 'won', 'over', 'right', 'best'].map((word) => [word, words[`made.words.${word}`]])), page.path)
    for (const said of ["host.state('play')", 'host.state(phase)', 'host.score(', 'host.sound(', 'host.save(', 'host.load()', 'const TUNING = {', 'new Intl.NumberFormat(host.lang)', 'g.direction = host.dir']) assert.ok(one.code.includes(said), `${page.path}: ${said}`)
    // Nothing from elsewhere.
    assert.doesNotMatch(one.code, /https?:\/\/|\bfetch\(|\bimport\b|localStorage/, page.path)
  }
})

test('/collections’ collection is one Tables reads, in each language: the person’s rows kept, their dates coming up, and Jean’s change of three rows waiting, with why', async () => {
  for (const page of made.filter((at) => at.name === 'collections')) {
    const one = creationOf(page), words = /** @type {Record<string, any>} */ (site.words.get('collections')?.[page.lang])
    assert.match(one.folder, PLACE, page.path)
    const table = readTable(one.files['collection.json']), lines = parseChanges(one.files['changes.jsonl']), rows = fold(lines), waiting = marked(lines, table.kept)
    assert.deepEqual([table.kind, table.name, table.properties.map((property) => property.name), table.properties.map((property) => property.type)], [undefined, words['made.name'], words['made.columns'], ['text', 'text', 'status', 'date', 'text']], page.path)
    assert.deepEqual(table.properties[2].options?.map((/** @type {{ name: string }} */ step) => step.name), words['made.steps'], page.path)
    assert.deepEqual(table.views.map((view) => view.type), ['table', 'board'], page.path)
    // Six rows are the person's, kept; a seventh is Jean's, and so is what changed in two others: all of it waits, each with why.
    assert.equal(rows.length, words['made.rows'].length + 1, page.path)
    assert.deepEqual([...new Set(waiting.map((line) => line.by))], ['jean'], page.path)
    assert.deepEqual([...new Set(waiting.map((line) => line.row))].length, words['made.then'].length, page.path)
    assert.ok(waiting.every((line) => line.why === words['made.why']), page.path)
    assert.deepEqual(lines.filter((line) => 'by' in line && line.by === 'user').length, words['made.rows'].length, page.path)
    // Every date is after the build's day: what comes up, never what is late.
    for (const row of rows) if (row.cells[table.properties[3].id]) assert.ok(String(row.cells[table.properties[3].id]) > '2026-11-03', page.path)
    // Each company once, Jean's row among them.
    assert.deepEqual(rows.map((row) => row.cells[table.properties[0].id]).sort(), [...words['made.rows'].map((/** @type {string[]} */ row) => row[0]), words['made.then'][2][0]].sort(), page.path)
  }
})

test('/documents’ document reads as its editor reads one, in each language: a title, a checklist, a table and a callout, and Jean’s version of it, three changes each with its words', async () => {
  const { lex } = await import('../app/ui/markdown.js')
  for (const page of made.filter((at) => at.name === 'documents')) {
    const one = creationOf(page), words = /** @type {Record<string, any>} */ (site.words.get('documents')?.[page.lang])
    const kinds = (/** @type {string} */ markdown) => lex(markdown).filter((token) => token.type !== 'space').map((token) => token.type)
    assert.deepEqual(kinds(one.markdown), ['heading', 'paragraph', 'heading', 'list', 'heading', 'table', 'blockquote'], page.path)
    assert.deepEqual(kinds(one.held.markdown), kinds(one.markdown), page.path)
    assert.match(one.markdown, /^# [^\n]+\n\n/, page.path)
    // Jean's version changes the opening, adds a task and adds a row, and nothing else.
    const [mine, theirs] = [one.markdown.split('\n'), one.held.markdown.split('\n')]
    assert.deepEqual(mine.filter((line) => !theirs.includes(line)).length, 1, page.path)
    assert.deepEqual(theirs.filter((line) => !mine.includes(line)).length, 3, page.path)
    assert.deepEqual([one.held.notes, one.held.notes.length], [words['made.notes'], 3], page.path)
    assert.equal(one.name, words['made.name'], page.path)
  }
})

test('/designs’ design is one Designs lays out, in each language: what `design` is given, each fact in its role, the address the request lacks left as a gap its view marks', async () => {
  for (const page of made.filter((at) => at.name === 'designs')) {
    const one = creationOf(page), words = /** @type {Record<string, any>} */ (site.words.get('designs')?.[page.lang]), design = fromSvg(one.file)
    assert.match(one.path, /^designs\/[0-9A-HJKMNP-TV-Z]{26}-[\w-]+\.svg$/, page.path)
    assert.ok(design, page.path)
    assert.deepEqual([design?.name, design?.size, design?.lang, design?.author], [words['made.name'], 'square', page.lang, 'jean'], page.path)
    // Each fact in its role, as given, and laid out: a part each, with its box on the page.
    const roles = ROLES.filter((role) => words[`made.${role}`])
    assert.deepEqual(design?.parts.map((part) => [part.role, part.text]), roles.map((role) => [role, words[`made.${role}`]]), page.path)
    assert.ok(design?.parts.every((part) => part.box[2] > 0 && part.box[3] > 0 && part.box[0] >= 0 && part.box[0] + part.box[2] <= design.page.w), page.path)
    assert.ok(design?.take.every(Boolean), page.path)
    // The address isn't the request's to give: a gap in square brackets, which the view marks before printing.
    assert.match(words['made.where'], /^\[[^\]]+\]/, page.path)
    assert.ok(marksOf(/** @type {any} */ (design), new Date('2026-11-03')).some((mark) => mark.kind === 'gap' && mark.part === 'where'), page.path)
  }
})

test('/forms’ collection is one Tables reads, in each language: each row a visitor’s reply in the columns its form asks, what the person noted in the others, and a form Collect replies would make', async () => {
  const { ASKED } = await import('../site/forms/page.js')
  for (const page of made.filter((at) => at.name === 'forms')) {
    const one = creationOf(page), words = /** @type {Record<string, any>} */ (site.words.get('forms')?.[page.lang])
    assert.match(one.folder, PLACE, page.path)
    const table = readTable(one.files['collection.json']), lines = parseChanges(one.files['changes.jsonl']), rows = fold(lines)
    assert.deepEqual([table.name, table.properties.map((property) => property.name), table.properties.map((property) => property.type)], [words['made.name'], words['made.columns'], ['text', 'email', 'select', 'checkbox', 'text', 'text', 'checkbox']], page.path)
    assert.deepEqual(table.properties[2].options?.map((/** @type {{ name: string }} */ shift) => shift.name), words['made.shifts'], page.path)
    // The form asks the first columns, the row's name among them, each one Collect replies can ask; the last two stay the person's.
    const asked = table.properties.slice(0, ASKED).map((property) => property.id)
    assert.deepEqual(one.asks, asked, page.path)
    assert.ok(one.asks.includes(titleOf(table).id), page.path)
    assert.deepEqual(askable(table).filter((field) => one.asks.includes(field.id)).map((field) => field.name), words['made.columns'].slice(0, ASKED), page.path)
    // What asks each: the name on a line that must be filled, an email's field, a choice among the three shifts, a box, words on several lines.
    assert.deepEqual(partsOf(askable(table).filter((field) => one.asks.includes(field.id))).map((part) => [part.as, part.attrs.type ?? '', part.attrs.required ?? false, part.options.length]),
      [['input', '', true, 0], ['input', 'email', false, 0], ['radios', '', false, 3], ['tick', '', false, 0], ['area', '', false, 0]], page.path)
    // Each row came by a visitor, in the columns the form asks alone; what is in the others, the person wrote. Nothing is Jean's, so nothing waits.
    assert.equal(rows.length, words['made.rows'].length, page.path)
    assert.deepEqual(rows.map((row) => row.cells[table.properties[0].id]), words['made.rows'].map((/** @type {string[]} */ row) => row[0]), page.path)
    for (const line of lines) if ('set' in line && line.set) assert.ok(Object.keys(line.set).every((id) => asked.includes(id) === (line.by === 'visitor')), `${page.path}: ${JSON.stringify(line)}`)
    assert.deepEqual([...new Set(lines.map((line) => ('by' in line ? line.by : '')))].sort(), ['user', 'visitor'], page.path)
    assert.deepEqual(marked(lines, table.kept), [], page.path)
    // What the pane says once a reply is sent in it: where one sent online would wait.
    assert.equal(one.asked, words['pane.asked'].replace('{name}', BRAND.name), page.path)
  }
})
