// The Computer (D162), which folds in Calculations (0.3, the launch demo) and the data toolkit (0.4):
// drop a CSV, ask in your language, accept the offer, and get exact totals worked out by a script;
// scripts and Python in the sandbox, with /workspace and the internet as Settings allow; commands in
// bash, their files kept in the project's workspace or, after the user agrees, in their folder; a new
// site asked about first, a registry's key added by Jean, a relay used.
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { start, connectFakeBrain, ask, turnOn, openSettings, SALES, pdf, inkOf } from './helpers.js'

const QUESTIONS = {
  en: ['What are the total sales by region?', 'Here are the exact totals'],
  fr: ['Quel est le total des ventes par région ?', 'Voici les totaux exacts'],
  ja: ['地域ごとの売上の合計は？', '正確な合計です'],
}

for (const [lang, [question, expected]] of Object.entries(QUESTIONS)) {
  test(`drop a CSV, get exact totals (${lang})`, async ({ page }) => {
    await start(page, lang)
    await connectFakeBrain(page)
    await page.locator('.composer input[type="file"]').setInputFiles({ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) })
    await expect(page.locator('.attachment[data-status="ready"]')).toHaveCount(1)
    // A table of data is an event: the computer is offered above the box.
    await expect(page.locator('aside.offer')).toBeVisible()
    await ask(page, question)
    // The brain offers it too, in its answer; accepting turns it on mid-turn.
    await page.locator('.msg-jean .approval .button.primary').click()
    const answer = page.locator('.msg-jean .prose').last()
    await expect(answer).toContainText(expected, { timeout: 30_000 })
    for (const total of ['2540', '1960', '1515']) await expect(answer).toContainText(total)
    await expect(answer.locator('.cite')).toHaveText('1')
    await expect(page.locator('aside.offer')).toHaveCount(0)
    // Opened once the answer has settled (its follow-ups show): it is drawn anew then.
    await expect(page.locator('.follow-ups')).toBeVisible()
    // The script's own read shows under the calculation.
    await page.locator('.activity > summary').last().click()
    await expect(page.locator('.activity-list li.is-nested').last()).toContainText('sales.csv')
    // Each line opens on what it was given and what came back.
    const script = page.locator('.activity-list li[data-depth="0"]', { has: page.locator('code', { hasText: /^javascript$/ }) }).last()
    await script.locator('.step > summary').click()
    await expect(script.locator('.step-body pre').first()).toContainText('code:')
    await expect(script.locator('.step-body pre').last()).toContainText('2540')
  })
}

test('the savings starter: the computer works the plan out, its chart opens beside the conversation (D163), and a change is a new version (D164)', async ({ page }) => {
  test.setTimeout(90_000)
  await start(page)
  await connectFakeBrain(page)
  await page.locator('.starter', { hasText: 'Savings plan' }).click()
  await expect(page.locator('#prompt')).toHaveValue(/savings over 10 years: 200 a month at 4% a year/)
  await page.locator('#prompt').press('Enter')
  // The computer isn't on yet: the brain offers it, and the answer goes on once it is.
  await page.locator('.msg-jean .approval .button.primary').click({ timeout: 30_000 })
  const pane = page.locator('app-preview .preview')
  await expect(pane).toBeVisible({ timeout: 30_000 })
  await expect(pane.locator('.pane-head h2')).toHaveText('Savings plan.html')
  const chart = page.frameLocator('app-preview iframe')
  await expect(chart.locator('#total')).toHaveText('After 10 years: 29450')
  await expect(chart.locator('rect')).toHaveCount(10)
  await expect(page.locator('.msg-jean .prose').last()).toContainText('After 10 years you would have 29450', { timeout: 30_000 })
  // The page is the answer's too, a card to open again or save.
  await expect(page.locator('app-file')).toContainText('Savings plan.html')

  // Asked for a change, the page is made again: the new version shows, and the first one stays (D164).
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()
  await expect(await command(page, 'Make the bars blue')).toContainText('the bars are blue now')
  const picker = pane.getByRole('combobox', { name: 'Versions' })
  await expect(picker.locator('option')).toHaveText(['Version 1', 'Version 2'])
  await expect(picker.locator('option:checked')).toHaveText('Version 2')
  await expect(chart.locator('rect').first()).toHaveAttribute('fill', '#2563eb')
  const [first, second] = [page.locator('.msg-jean').first(), page.locator('.msg-jean').nth(1)]
  await expect(first.locator('app-file .file-meta')).toContainText('Version 1')
  await expect(second.locator('app-file .file-meta')).toContainText('Version 2')
  // Back to the first, picked in the preview, then the second again; and the first from its own card.
  await picker.selectOption({ label: 'Version 1' })
  await expect(chart.locator('rect').first()).toHaveAttribute('fill', '#c8691c')
  await expect(picker.locator('option:checked')).toHaveText('Version 1')
  await picker.selectOption({ label: 'Version 2' })
  await expect(chart.locator('rect').first()).toHaveAttribute('fill', '#2563eb')
  await first.getByRole('button', { name: 'Open Savings plan.html' }).click()
  await expect(picker.locator('option:checked')).toHaveText('Version 1')
  await expect(chart.locator('rect').first()).toHaveAttribute('fill', '#c8691c')
})

test('scripts end on their value, their errors come back as text, and they have files and the internet as Settings allow', async ({ page }) => {
  await start(page)
  const output = await page.evaluate(async () => {
    const { loaded } = await import('/ui/caps.js')
    const { updateSettings } = await import('/ui/state.js')
    await import('/caps/computer/computer.js')
    await updateSettings({ computer: { internet: 'off' } })
    const tools = loaded.value.get('computer')?.tools ?? []
    const run = tools.find((tool) => tool.spec.name === 'javascript')
    const ctx = { declared: ['javascript'], declare() {}, call: async () => '' }
    const results = []
    const scripts = [
      'return 6 * 7',
      'return typeof fetch + typeof XMLHttpRequest + typeof importScripts',
      'throw new Error("nope")',
      // No return: the last expression is the result, as in a console, awaited if a promise.
      'Math.cos(9)',
      'const text = await tools.file({ file: "a.csv" })\ntext.length + 1',
      'Promise.resolve(6 * 7)',
      'const nothing = 1',
      'await fs.writeFile("notes/a.txt", "kept")\nawait fs.readFile("notes/a.txt")',
      'await fetch("https://example.com/")',
    ]
    for (const code of scripts) {
      results.push(await run?.run({ code }, /** @type {any} */ (ctx)).catch((/** @type {Error} */ error) => `failed: ${error.message}`))
    }
    return results
  })
  expect(output.slice(0, 8)).toEqual([
    'Result: 42',
    'Result: functionundefinedundefined',
    'failed: The script failed: Error: nope',
    'Result: -0.9111302618846769',
    'Result: 1',
    'Result: 42',
    'The script gave no result: end it with the value you need, or return it.',
    'Result: kept',
  ])
  expect(output[8]).toMatch(/^failed: The script failed: .*no internet.*Settings › Computer/s)
})

test('Python: its standard library, the last line as the result, errors as text, files, and the internet as Settings allow', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  const output = await page.evaluate(async () => {
    const { loaded } = await import('/ui/caps.js')
    const { updateSettings } = await import('/ui/state.js')
    await import('/caps/computer/computer.js')
    await updateSettings({ computer: { internet: 'off' } })
    const python = loaded.value.get('computer')?.tools?.find((tool) => tool.spec.name === 'python')
    const calls = /** @type {string[]} */ ([])
    const ctx = { declared: ['python'], declare() {}, call: async (/** @type {string} */ name, /** @type {any} */ args) => { calls.push(`${name} ${JSON.stringify(args.file ?? args.files)}`); return name === 'file' ? 'region,sales\nNorth,3\nSouth,4' : '' } }
    const results = []
    const scripts = [
      '6 * 7',
      'import statistics, decimal, datetime, csv, io, json, re\nstatistics.mean([1, 2, 3, 4])',
      'from decimal import Decimal\nDecimal("0.1") + Decimal("0.2")',
      'print("hello")\n{"a": [1, 2], "b": None}',
      'import js\n[hasattr(js, "fetch"), hasattr(js, "postMessage"), hasattr(js, "indexedDB")]',
      'from pyodide.http import pyfetch\nawait pyfetch("https://example.com")',
      'import pandas',
      'raise ValueError("nope")',
      'import csv, io\ntext = await file("sales.csv")\nsum(int(row["sales"]) for row in csv.DictReader(io.StringIO(text)))',
      'x = 1',
      'import os\nopen("made.txt", "w").write("by python")\n[os.getcwd(), open("made.txt").read()]',
    ]
    for (const code of scripts) results.push(await python?.run({ code }, /** @type {any} */ (ctx)).catch((/** @type {Error} */ error) => `failed: ${error.message}`))
    return { results, calls }
  })
  const { results, calls } = output
  expect(results.slice(0, 5)).toEqual([
    'Result: 42',
    'Result: 2.5',
    'Result: 0.3',
    'Result: {\n "a": [\n  1,\n  2\n ],\n "b": null\n}\n\nLog:\nhello',
    'Result: [\n true,\n false,\n false\n]',
  ])
  expect(results[5]).toMatch(/^failed: The script failed: .*no internet/is)
  expect(results[6]).toMatch(/^failed: The script failed: .*ModuleNotFoundError.*\nInstall it first: pip install <package> in bash/s)
  expect(results[7]).toMatch(/^failed: The script failed: .*ValueError: nope/s)
  expect(results[8]).toBe('Result: 7')
  expect(results[9]).toBe('The script gave no result: end it with the value you need, or return it.')
  expect(results[10]).toBe('Result: [\n "/workspace",\n "by python"\n]')
  // Its file is kept in /workspace, through save_workspace, which Jean makes under the rules.
  expect(calls).toEqual(['file "sales.csv"', 'save_workspace ["made.txt"]'])
})

/** Sends a message, and the answer to it once it has ended. @param {import('@playwright/test').Page} page @param {string} text */
async function command(page, text) {
  const before = await page.locator('.msg-jean').count()
  await ask(page, text)
  await expect(page.locator('.msg-jean')).toHaveCount(before + 1, { timeout: 30_000 })
  return answered(page)
}

/** The last answer, once it has ended. @param {import('@playwright/test').Page} page */
async function answered(page) {
  await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible({ timeout: 90_000 })
  return page.locator('.msg-jean .prose').last()
}

test('bash: commands, python3 and node in /workspace, kept in the project’s workspace', async ({ page }) => {
  test.setTimeout(150_000)
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  let answer = await command(page, '$ echo hello > note.txt && pwd && ls')
  await expect(answer).toContainText('Exit code: 0')
  await expect(answer).toContainText('/workspace')
  await expect(answer).toContainText('note.txt')
  await expect(answer).toContainText('Kept in /workspace: note.txt.')
  // Jean's own files: kept in the project, where the next command finds them.
  const kept = await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return app.fs.read(`${app.projectDir}/workspace/note.txt`)
  })
  expect(kept).toBe('hello\n')
  await page.locator('.activity > summary').last().click()
  await expect(page.locator('.activity-list')).toContainText('Ran a command')

  answer = await command(page, '$ cat note.txt | tr a-z A-Z && node -e "console.log(6 * 7)" && python3 -c "print(sum(range(10)))"')
  await expect(answer).toContainText('HELLO')
  await expect(answer).toContainText('42')
  await expect(answer).toContainText('45')
})

test('the internet: a new site asked about first, then always; a registry’s key; the relay; and off', async ({ page }) => {
  test.setTimeout(90_000)
  /** @type {{ url: string, authorization?: string }[]} */
  const seen = []
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  for (const host of ['data.example.com', 'npm.example.com', 'relay.example.com']) {
    await page.route(`https://${host}/**`, (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      seen.push({ url: request.url(), authorization: request.headers().authorization })
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/plain' }, body: `hello from ${new URL(request.url()).host}` })
    })
  }
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await page.evaluate(async () => {
    const { updateSettings, app } = await import('/ui/state.js')
    const { setSecret } = await import('/ui/secrets.js')
    await updateSettings({ computer: { registries: { npm: 'https://npm.example.com/' } } })
    await setSecret(app.fs, 'computer-npm', 's3cret')
  })

  // A new site: the card names it, and "Always" lists it in Settings › Computer.
  await ask(page, '$ curl -s https://data.example.com/a')
  const card = page.locator('app-site-approval .approval')
  await expect(card).toContainText('Let the computer reach data.example.com?', { timeout: 30_000 })
  await expect(card.locator('.approval-for')).toContainText('curl -s https://data.example.com/a')
  await card.locator('.button', { hasText: 'Always allow data.example.com' }).click()
  await expect(await answered(page)).toContainText('hello from data.example.com')
  expect(await page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.computer?.sites)).toEqual(['data.example.com'])
  await expect(await command(page, '$ curl -s https://data.example.com/b')).toContainText('hello from data.example.com')
  expect(seen.map((each) => each.url)).toEqual(['https://data.example.com/a', 'https://data.example.com/b'])

  // A registry: no asking, and its key goes with the request, from Jean.
  await expect(await command(page, '$ curl -s https://npm.example.com/left-pad')).toContainText('hello from npm.example.com')
  expect(seen.at(-1)).toEqual({ url: 'https://npm.example.com/left-pad', authorization: 'Bearer s3cret' })

  // A relay, set in Settings › Computer: requests go through it.
  await page.evaluate(async () => {
    const { updateSettings, app } = await import('/ui/state.js')
    await updateSettings({ computer: { ...app.settings.value.computer, relay: 'https://relay.example.com/?u={url}' } })
  })
  await expect(await command(page, '$ curl -s https://data.example.com/c')).toContainText('hello from relay.example.com')
  expect(seen.at(-1)?.url).toBe(`https://relay.example.com/?u=${encodeURIComponent('https://data.example.com/c')}`)

  // Off: nothing goes out, and the brain learns where it is turned on.
  await page.evaluate(async () => {
    const { updateSettings, app } = await import('/ui/state.js')
    await updateSettings({ computer: { ...app.settings.value.computer, internet: 'off' } })
  })
  await expect(await command(page, '$ curl -sS https://data.example.com/d')).toContainText('Settings › Computer')
  expect(seen).toHaveLength(4)
})

/** A package as npm's registry serves it: its tarball (package/…), its integrity, its metadata. @param {string} name @param {string} version @param {Record<string, string>} files */
function pack(name, version, files) {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'))
  for (const [path, text] of Object.entries({ 'package.json': JSON.stringify({ name, version, ...JSON.parse(files['package.json'] ?? '{}') }), ...files })) {
    mkdirSync(join(dir, 'package', path, '..'), { recursive: true })
    writeFileSync(join(dir, 'package', path), path === 'package.json' ? JSON.stringify({ name, version, ...JSON.parse(files['package.json'] ?? '{}') }) : text)
  }
  // Without the ._ files a Mac's tar adds.
  execFileSync('tar', ['czf', join(dir, 'pack.tgz'), '-C', dir, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
  const tgz = readFileSync(join(dir, 'pack.tgz'))
  const manifest = JSON.parse(readFileSync(join(dir, 'package', 'package.json'), 'utf8'))
  const tarball = `https://npm.example.com/${name}/-/${name}-${version}.tgz`
  const integrity = `sha512-${createHash('sha512').update(tgz).digest('base64')}`
  return { tgz, tarball, meta: { name, 'dist-tags': { latest: version }, versions: { '1.0.0': { ...manifest, version: '1.0.0', dist: { tarball, integrity: 'sha512-old' } }, [version]: { ...manifest, dist: { tarball, integrity } } } } }
}

test('npm install from the registry Settings name, then node requires and imports, with Node’s own modules, Buffer and timers (D178); and tar', async ({ page }) => {
  test.setTimeout(90_000)
  const packages = [
    // As cowsay does: its cows are files beside its code, read at once through path and fs.
    pack('moo', '1.0.0', { 'lib/cows.js': "const path = require('path')\nconst fs = require('fs')\nexports.say = (text) => fs.readFileSync(path.join(__dirname, '/../cows', 'default') + '.cow', 'utf-8').replace('$text', text)\nexports.list = () => fs.readdirSync(path.join(__dirname, '../cows')).map((cow) => path.basename(cow, '.cow'))\n", 'package.json': JSON.stringify({ main: './lib/cows' }), 'cows/default.cow': '< $text >\n  moo\n', 'cows/fox.cow': 'fox' }),
    pack('greet', '1.2.0', { 'package.json': JSON.stringify({ main: 'lib/index.js', dependencies: { shout: '^2.0.0' } }), 'lib/index.js': "const shout = require('shout')\nmodule.exports = (name) => shout('hello ' + name)\n" }),
    pack('shout', '2.1.0', { 'index.js': "module.exports = (text) => text.toUpperCase() + '!'\n" }),
    pack('esm-hi', '3.0.0', { 'package.json': JSON.stringify({ type: 'module', exports: { '.': { import: './hi.js' } } }), 'hi.js': "export const hi = () => 'hi from a module'\n" }),
  ]
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  await page.route('https://npm.example.com/**', (route) => {
    const url = route.request().url()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const found = packages.find((each) => url === each.tarball)
    if (found) return route.fulfill({ status: 200, headers: cors, body: found.tgz })
    const meta = packages.find((each) => url === `https://npm.example.com/${each.meta.name}`)?.meta
    return route.fulfill({ status: meta ? 200 : 404, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(meta ?? { error: 'Not found' }) })
  })
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await page.evaluate(async () => (await import('/ui/state.js')).updateSettings({ computer: { registries: { npm: 'https://npm.example.com/' } } }))

  let answer = await command(page, `$ npm install greet esm-hi && node -e "console.log(require('greet')('jean'))" && cat package.json`)
  await expect(answer).toContainText('added 3 packages')
  await expect(answer).toContainText('HELLO JEAN!')
  await expect(answer).toContainText('"greet": "^1.2.0"')
  // package.json is the user's, kept; node_modules stays in the computer.
  await expect(answer).toContainText('Kept in /workspace: package.json.')

  answer = await command(page, `$ echo "import { hi } from 'esm-hi'; console.log(hi())" > hi.mjs && node hi.mjs`)
  await expect(answer).toContainText('hi from a module')

  // Node's own: path and fs, at once, with a callback or a promise, by require and import; one not here is named.
  await command(page, `$ echo '{ "dependencies": { "moo": "^1.0.0" } }' > package.json`)
  answer = await command(page, `$ npm install && npm install && node -e "const moo = require('moo'); console.log(moo.say('hello'), moo.list().sort().join())"`)
  await expect(answer).toContainText('added 1 package')
  await expect(answer).toContainText('up to date')
  await expect(answer).toContainText('< hello >\n  moo\n default,fox')
  answer = await command(page, `$ mkdir -p lib ; node -e "const fs = require('node:fs'); fs.writeFileSync('n.txt', 'one'); fs.appendFileSync('n.txt', ' two'); fs.readFile('n.txt', 'utf8', (error, text) => console.log(text, fs.existsSync('nope'), fs.statSync('lib').isDirectory()))" ; node -e "require('fs').readFileSync('nope')" ; node -e "require('crypto')"`)
  await expect(answer).toContainText('one two false true')
  await expect(answer).toContainText('ENOENT')
  await expect(answer).toContainText("Cannot find module 'crypto': of Node's own modules, only path, fs, os, util, events, process and buffer are here")
  // os, util and events, as packages use them: a constructor that calls EventEmitter on its own `this`.
  answer = await command(page, `$ node -e "const EventEmitter = require('events'); const util = require('node:util'); const os = require('os'); function Bell() { EventEmitter.call(this) } util.inherits(Bell, EventEmitter); const bell = new Bell(); bell.once('ring', (n) => console.log(util.format('%s rang %d times in %s', 'bell', n, os.homedir()), bell.listenerCount('ring'))); bell.emit('ring', '2'); util.promisify(require('fs').readFile)('n.txt').then(console.log)"`)
  await expect(answer).toContainText('bell rang 2 times in /home/user 0\n<Buffer 6f 6e 65 20 74 77 6f>')
  answer = await command(page, `$ echo "import { join, relative } from 'node:path'; import { readFile } from 'fs/promises'; console.log(join('a', '..', 'b/'), relative('/x/y', '/x/z'), await readFile('n.txt', 'utf8'))" > own.mjs && node own.mjs`)
  await expect(answer).toContainText('b/ ../z one two')
  // Bytes, Buffer and timers, as Node has them, so a package that makes a deck or a workbook writes it whole; a cleared timer is gone at once.
  answer = await command(page, `$ node -e "const fs = require('fs'); clearTimeout(setTimeout(() => console.log('never'), 60000)); setTimeout(() => { fs.writeFileSync('b.bin', new Uint8Array([0, 1, 2, 255])); fs.appendFileSync('b.bin', Buffer.from('/w==', 'base64')); const b = fs.readFileSync('b.bin'); console.log(b.toString('hex'), Buffer.isBuffer(b), process.release.name) }, 20)" && base64 b.bin`)
  await expect(answer).toContainText('000102ffff true node')
  await expect(answer).toContainText('AAEC//8=')

  answer = await command(page, '$ tar czf both.tgz package.json hi.mjs && rm hi.mjs && tar xzf both.tgz && tar tzf both.tgz && cat hi.mjs')
  await expect(answer).toContainText('package.json\nhi.mjs')
  await expect(answer).toContainText("import { hi } from 'esm-hi'")
})

test('npm init, ls and run; a server refused, with the page beside the conversation instead', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  let answer = await command(page, '$ mkdir site && cd site && npm -v && npm init -y && npm ls')
  await expect(answer).toContainText('Exit code: 0')
  await expect(answer).toContainText('install, init, ls and run')
  await expect(answer).toContainText('"name": "site"')
  answer = await command(page, `$ echo 'console.log("built " + process.argv[2])' > build.js && jq '.scripts = {build: "node build.js", dev: "vite"}' package.json > p && mv p package.json && npm run build -- fast`)
  await expect(answer).toContainText('built fast')
  for (const server of ['npm run dev', 'npx vite', 'python3 -m http.server', `node -e "require('http')"`]) {
    answer = await command(page, `$ ${server}`)
    await expect(answer).toContainText('Exit code: 1')
    await expect(answer).toContainText('nothing can listen on a port here')
  }
  answer = await command(page, '$ npm create vite@latest')
  await expect(answer).toContainText('only install, init, ls and run work here')
})

test('the project’s workspace in the browser: a page that uses its other files opens there, comes again when one changes, and /workspace lists them (D167); its cards open there (D172); any other file as the preview shows it: a PDF drawn, Markdown laid out, a MIDI file played (D197), the rest as its text (D190)', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await turnOn(page, 'Browser')
  await page.keyboard.press('Escape')
  const pane = page.locator('app-browser .browser')
  const shown = page.frameLocator('.browser-page')
  // Its script and its style in files of their own: the page opens in the browser, not the preview, all of it there.
  await command(page, `$ mkdir -p site && echo '<link rel="stylesheet" href="style.css"><h1>Loading</h1><script type="module" src="app.js"></script>' > site/index.html && echo 'h1 { color: rgb(0, 0, 128) }' > site/style.css && echo 'document.querySelector("h1").textContent = "Fresh bread"' > site/app.js`)
  await expect(shown.locator('h1')).toHaveText('Fresh bread')
  await expect(pane.locator('.browser-bar input')).toHaveValue('/workspace/site/index.html')
  await expect.poll(() => shown.locator('h1').evaluate((h1) => getComputedStyle(h1).color)).toBe('rgb(0, 0, 128)')
  await expect(page.locator('app-preview .preview')).toHaveCount(0)
  expect(await page.evaluate(async () => (await (await import('/ui/caps.js')).loaded.value.get('browser')?.sections?.())?.page)).toBe('The browser beside the conversation shows /workspace/site/index.html, from the project\'s workspace.')
  // A file it uses, changed by the next command: the page on show comes again.
  await command(page, `$ echo 'document.querySelector("h1").textContent = "Fresh bread today"' > site/app.js`)
  await expect(shown.locator('h1')).toHaveText('Fresh bread today')
  // /workspace, typed: what it holds, and its pages by their links.
  const go = async (/** @type {string} */ address) => {
    await pane.locator('.browser-bar input').fill(address)
    await pane.locator('.browser-bar input').press('Enter')
  }
  await go('/workspace')
  await expect(pane.locator('.browser-list h1')).toHaveText('/workspace')
  await pane.locator('.browser-list').getByRole('button', { name: 'site/' }).click()
  await expect(shown.locator('h1')).toHaveText('Fresh bread today')
  await expect(pane.locator('.browser-bar input')).toHaveValue('/workspace/site/')
  await go('/workspace/nothing.html')
  await expect(pane.locator('.browser-note')).toContainText('nothing.html isn’t in')
  // A file that isn't a page shows as the preview shows it (D190): a PDF's pages drawn, Markdown
  // laid out with its formulas, its links opening here, and a file of a kind it doesn't know as its text.
  await page.evaluate(async ([menu, site]) => {
    const { app } = await import('/ui/state.js')
    await app.fs.write(`${app.projectDir}/workspace/menu.pdf`, menu)
    await app.fs.write(`${app.projectDir}/workspace/euler.md`, `# Euler\n\n$e^{i\\pi} + 1 = 0$, as [the bakery](${site}) says.`)
    await app.fs.write(`${app.projectDir}/workspace/euler.tex`, '$e^{i\\pi} + 1 = 0$')
  }, [pdf('Croissant 2 euros').toString(), 'http://127.0.0.1:4181/site/bakery.html'])
  await go('/workspace/menu.pdf')
  await expect.poll(() => inkOf(pane.locator('.view-pages canvas').first()), { timeout: 15_000 }).toBeGreaterThan(50)
  // A MIDI file as the sound Jean's own synthesizer makes of it, in the page's own player (D197): a
  // second of a piano's C and E and a bass drum, then its fading. A file that isn't text, and a
  // picture no browser can draw, say they can't show.
  const track = [0, 0x90, 60, 100, 0, 0x99, 36, 100, 0x83, 0x60, 0x80, 60, 0, 0, 0x89, 36, 0, 0, 0x90, 64, 100, 0x83, 0x60, 0x80, 64, 0, 0, 0xff, 0x2f, 0]
  const song = [...Buffer.from('MThd'), 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0, ...Buffer.from('MTrk'), 0, 0, 0, track.length, ...track]
  await page.evaluate(async (song) => {
    const { app } = await import('/ui/state.js')
    await app.fs.writeBytes(`${app.projectDir}/workspace/song.mid`, new Uint8Array(song))
    await app.fs.writeBytes(`${app.projectDir}/workspace/data.bin`, new Uint8Array([0, 1, 2, 3, 255, 0]))
    await app.fs.writeBytes(`${app.projectDir}/workspace/photo.tiff`, new Uint8Array([1, 2, 3, 4]))
  }, song)
  await go('/workspace/song.mid')
  await expect.poll(() => pane.locator('audio.view-sound').evaluate((sound) => /** @type {HTMLAudioElement} */ (sound).duration), { timeout: 15_000 }).toBeGreaterThan(2)
  for (const file of ['data.bin', 'photo.tiff']) {
    await go(`/workspace/${file}`)
    await expect(pane.locator('.view-note')).toHaveText('This file can’t be shown here.')
  }
  await go('/workspace/euler.md')
  await expect(pane.locator('.view-sheet').getByRole('heading', { name: 'Euler' })).toBeVisible()
  await expect(pane.locator('.view-sheet app-math')).toBeVisible()
  await go('/workspace/euler.tex')
  await expect(pane.locator('.view-text')).toHaveText('$e^{i\\pi} + 1 = 0$')
  await expect(pane.locator('.view-pages, .view-sheet')).toHaveCount(0)
  await pane.getByRole('button', { name: 'Back' }).click()
  await pane.locator('.view-sheet').getByRole('link', { name: 'the bakery' }).click()
  await expect(pane.locator('.browser-bar input')).toHaveValue('http://127.0.0.1:4181/site/bakery.html')
  // Its card opens it there, as the workspace has it while the card is still its version (D172)…
  const card = page.locator('.msg-jean').first().getByRole('button', { name: 'Open site/index.html' })
  await card.click()
  await expect(pane.locator('.browser-bar input')).toHaveValue('/workspace/site/index.html')
  await expect(shown.locator('h1')).toHaveText('Fresh bread today')
  // …and as the card holds it, on its own, once the page changed. A page on its own opens there too.
  await command(page, `$ echo '<h1>New bread</h1>' > site/index.html`)
  await expect(shown.locator('h1')).toHaveText('New bread')
  await expect(pane.locator('.browser-bar input')).toHaveValue('/workspace/site/index.html')
  await card.click()
  await expect(pane.locator('.browser-bar input')).toHaveValue('site/index.html')
  await expect(shown.locator('h1')).toHaveText('Loading')
  await expect(page.locator('app-preview .preview')).toHaveCount(0)
  // Closed, then opened empty after a reload (an open one comes back on its page, D220), it offers
  // the workspace, which is kept (Playwright's WebKit keeps nothing, like a private window).
  if (await page.evaluate(async () => (await import('/ui/state.js')).app.ephemeral.value)) return
  await pane.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await page.locator('.views .browser-toggle').click()
  await pane.getByRole('button', { name: /Show .*\/workspace/ }).click()
  await expect(pane.locator('.browser-list').getByRole('button', { name: 'site/' })).toBeVisible()
})

test('Settings › Computer: the sandbox, named (D248), itself (D176, D249), the internet, its sites, the relay and packages under them, and the workspace', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  await turnOn(page, 'Computer')
  const settings = page.locator('app-settings dialog[open]')
  await settings.locator('.settings-nav button', { hasText: 'Computer' }).click()
  // The sandbox, the one computer until This computer is found: no cards to choose from. Asleep until
  // something runs; Try types a line in the terminal, and Enter wakes Python up.
  const panel = settings.locator('.settings-panel')
  await expect(panel.locator('.computer h3')).toHaveText(/^Sandbox\s*Asleep$/)
  await expect(panel.getByRole('tablist')).toHaveCount(0)
  // What it borrows, as figures, never less than a megabyte; nothing to restart yet; how full the workspace is, by Empty it.
  await expect(panel.locator('.stats > div')).toHaveText([/^Processor\s*0 of \d+ cores?$/, /^Memory\s*0 MB/])
  await expect(panel.getByRole('button', { name: 'Restart the computer' })).toHaveCount(0)
  await expect(panel.locator('.filled')).toHaveText(/^0 MB of 256 MB$/)
  await expect(panel.locator('.engines li')).toHaveText([/Commands[\s\S]*Asleep/, /JavaScript[\s\S]*Asleep/, /Python[\s\S]*Asleep/])
  await panel.locator('.engines li', { hasText: 'Python' }).getByRole('button', { name: 'Try' }).click()
  await expect(settings).toBeHidden()
  const line = page.locator('app-terminal textarea')
  await expect(line).toHaveValue('python3 -c "print(2 ** 100)"')
  await line.press('Enter')
  await expect(page.locator('app-terminal .terminal-entry pre')).toHaveText('1267650600228229401496703205376', { timeout: 90_000 })
  // Ready now, with the shell and Python, and the memory they hold; its light is on the terminal's button.
  await expect(page.locator('app-shell > .views .terminal-toggle .ember')).toHaveAttribute('data-state', 'ready')
  await openSettings(page, 'Computer')
  await expect(panel.locator('.computer h3')).toHaveText(/^Sandbox\s*Ready$/)
  await expect(panel.getByRole('button', { name: 'Restart the computer' })).toBeVisible()
  await expect(panel.locator('.engines li')).toHaveText([/Commands[\s\S]*Ready/, /JavaScript[\s\S]*Asleep/, /Python[\s\S]*Ready/])
  // Of this device's memory, at least as much as Chromium says; WebKit doesn't say.
  await expect(panel.locator('.stats > div').nth(1)).toHaveText(/^Memory\s*[\d.]+ MB( of at least \d+ GB)?$/)
  await expect(settings.locator('.settings-panel')).toContainText('Ask first')
  await settings.locator('.segmented label', { hasText: 'Any site' }).click()
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.computer?.internet)).toBe('any')
  const sites = settings.locator('.reach input')
  await sites.fill('example.com')
  await sites.press('Enter')
  await expect(settings.locator('.sites li')).toHaveText(['example.com'])
  // The relay and where packages come from, folded under the sites.
  await expect(settings.getByRole('textbox', { name: 'Reach the web through' })).toBeHidden()
  await settings.locator('details.other summary', { hasText: 'Relay and package sources' }).click()
  await expect(settings.getByRole('textbox', { name: 'Reach the web through' })).toBeVisible()
  await expect(settings.locator('details.other')).toContainText('JavaScript, npm')
  await expect(settings.locator('.settings-panel')).toContainText('This project’s workspace')
})

// A folder of the user's (Folders, D141): the same commands, but a change there is shown and asked first.
test.describe('in the user’s folder', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium opens a folder in place')
  test.beforeEach(async ({ page }) => page.addInitScript(() => {
    Object.assign(window, { showDirectoryPicker: async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle('Shop') })
  }))

  test('a command that changes a file asks first, with the diff, then keeps it there', async ({ page }) => {
    test.setTimeout(90_000)
    await start(page)
    await connectFakeBrain(page)
    await page.evaluate(async () => {
      const shop = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true })).getDirectoryHandle('Shop', { create: true })
      const writable = await (await shop.getFileHandle('prices.csv', { create: true })).createWritable()
      await writable.write('item,price\ncoffee,2\n')
      await writable.close()
    })
    await turnOn(page, 'Folders')
    await page.keyboard.press('Escape')
    await expect(page.locator('.folder-name')).toHaveText('Shop')
    await turnOn(page, 'Computer')
    await page.keyboard.press('Escape')
    await ask(page, '$ echo "tea,3" >> prices.csv && wc -l prices.csv')
    const card = page.locator('app-folder-approval .approval')
    await expect(card).toContainText('prices.csv', { timeout: 30_000 })
    await expect(card.locator('.diff .is-new')).toContainText('tea,3')
    await card.locator('.button.primary').click()
    await expect(await answered(page)).toContainText('Kept in /workspace: prices.csv.')
    const text = await page.evaluate(async () => {
      const shop = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle('Shop')
      return (await (await shop.getFileHandle('prices.csv')).getFile()).text()
    })
    expect(text).toBe('item,price\ncoffee,2\ntea,3\n')
  })

  test('in the terminal, the user’s own command keeps its change there at once (D166)', async ({ page }) => {
    await start(page)
    await page.evaluate(async () => {
      const shop = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true })).getDirectoryHandle('Shop', { create: true })
      const writable = await (await shop.getFileHandle('prices.csv', { create: true })).createWritable()
      await writable.write('item,price\n')
      await writable.close()
    })
    await turnOn(page, 'Folders')
    await page.keyboard.press('Escape')
    await expect(page.locator('.folder-name')).toHaveText('Shop')
    await page.keyboard.press('ControlOrMeta+KeyJ')
    const line = page.locator('app-terminal').getByRole('textbox', { name: 'Command' })
    await line.fill('echo "tea,3" >> prices.csv && wc -l prices.csv')
    await line.press('Enter')
    await expect(page.locator('app-terminal .terminal-entry pre')).toContainText('2 prices.csv', { timeout: 30_000 })
    await expect(page.locator('app-folder-approval .approval')).toHaveCount(0)
    await expect.poll(() => page.evaluate(async () => {
      const shop = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('picked')).getDirectoryHandle('Shop')
      return (await (await shop.getFileHandle('prices.csv')).getFile()).text()
    })).toBe('item,price\ntea,3\n')
  })
})

// The terminal (D166): the user types on the conversation's computer, beside it, the brain's own shell.
test('the terminal: the user’s commands run on the conversation’s computer, which the brain shares and is told of', async ({ page }) => {
  test.setTimeout(90_000)
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  await page.route('https://data.example.com/**', (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/plain' }, body: 'hello from data.example.com' })))
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await expect(await command(page, '$ echo hi > a.txt')).toContainText('Exit code: 0')

  // ⌘J opens it, on the line to type on.
  await page.keyboard.press('ControlOrMeta+KeyJ')
  const terminal = page.locator('app-terminal .terminal')
  await expect(terminal).toBeVisible()
  const line = terminal.getByRole('textbox', { name: 'Command' })
  await expect(line).toBeFocused()
  /** @param {string} text */
  const run = async (text) => {
    await line.fill(text)
    await line.press('Enter')
    const last = terminal.locator('.terminal-entry').last()
    await expect(last).not.toHaveClass(/is-running/, { timeout: 30_000 })
    return last
  }
  // The brain's file is there, and the shell keeps its directory.
  const first = await run('cat a.txt && cd /tmp && pwd')
  await expect(first.locator('pre')).toHaveText('hi\n/tmp\n')
  await expect(terminal.locator('.terminal-line')).toContainText('/tmp $')
  // An empty line shows the prompt again, as a shell does; nothing runs, and the brain isn't told.
  const empty = await run('')
  await expect(empty).toHaveText('/tmp $')
  await expect(empty.locator('pre, .terminal-note')).toHaveCount(0)
  // What it changes in /workspace is kept at once, as the user's own.
  await run('echo made > /workspace/b.txt')
  expect(await page.evaluate(async () => {
    const { app } = await import('/ui/state.js')
    return app.fs.read(`${app.projectDir}/workspace/b.txt`)
  })).toBe('made\n')
  await expect(await run('false')).toContainText('Exit code 1')
  // ↑ brings back what was typed.
  await line.press('ArrowUp')
  await expect(line).toHaveValue('false')

  // Tab completes from the shell (D170): a command, a folder with its /, then a file.
  await line.fill('ech')
  await line.press('Tab')
  await expect(line).toHaveValue('echo ')
  await line.fill('cat /work')
  await line.press('Tab')
  await expect(line).toHaveValue('cat /workspace/')
  await line.press('b')
  await line.press('Tab')
  await expect(line).toHaveValue('cat /workspace/b.txt ')
  // When they share no more, the choices show under the line, until the next key.
  await line.fill('cat /workspace/')
  await line.press('Tab')
  await expect(terminal.locator('.terminal-choices span')).toHaveText(['a.txt', 'b.txt'])
  await line.press('a')
  await expect(terminal.locator('.terminal-choices span')).toHaveCount(0)
  await expect(line).toHaveValue('cat /workspace/a')
  // On an empty line, Tab offers the commands and keeps the keys; Shift+Tab takes them elsewhere.
  await line.fill('')
  await line.press('Tab')
  await expect(terminal.locator('.terminal-choices span', { hasText: /^ls$/ })).toHaveCount(1)
  await expect(line).toBeFocused()
  await line.press('Shift+Tab')
  await expect(line).not.toBeFocused()

  // The whole pane is where one types: a click on its title, or a key typed on what it showed.
  await terminal.locator('.pane-head h2').click()
  await expect(line).toBeFocused()
  await terminal.locator('.terminal-entry pre').first().dblclick()
  await expect(line).not.toBeFocused()
  await page.keyboard.type('pwd')
  await expect(line).toHaveValue('pwd')
  // A new site is asked about under the command.
  await line.fill('curl -s https://data.example.com/x')
  await line.press('Enter')
  await terminal.locator('.approval .button.primary').click()
  await expect(terminal.locator('.terminal-entry').last().locator('pre')).toHaveText('hello from data.example.com')

  // The bar has its button now. The brain was told what ran, and runs in the same shell.
  await expect(page.locator('app-shell > .views .terminal-toggle')).toBeVisible()
  const told = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records
    .flatMap(({ update }) => (update?.sessionUpdate === '_system_note' && update.data.kind === 'terminal' ? [update.data.command] : [])))
  expect(told).toEqual(['cat a.txt && cd /tmp && pwd', 'echo made > /workspace/b.txt', 'false', 'curl -s https://data.example.com/x'])
  await expect(await command(page, '$ pwd')).toContainText('/tmp')

  // ⌘J brings the keys back to it from elsewhere, and from there closes it.
  await page.locator('#prompt').focus()
  await page.keyboard.press('ControlOrMeta+KeyJ')
  await expect(line).toBeFocused()
  await page.keyboard.press('ControlOrMeta+KeyJ')
  await expect(terminal).toBeHidden()
  await page.keyboard.press('ControlOrMeta+KeyJ')
  await expect(line).toBeFocused()

  // Escape closes it; Settings › Computer opens it again.
  await line.press('Escape')
  await expect(terminal).toBeHidden()
  const settings = await openSettings(page, 'Computer')
  await settings.getByRole('button', { name: 'Open the terminal' }).click()
  await expect(terminal).toBeVisible()
  await expect(terminal.locator('.terminal-entry')).toHaveCount(5)
  // The whole pane is ringed while it has the keyboard, not the line; clear clears it, as Ctrl+L does.
  await expect(line).toBeFocused()
  expect(await terminal.evaluate((pane) => [getComputedStyle(pane).outlineStyle, getComputedStyle(pane.querySelector('textarea') ?? pane).outlineStyle])).toEqual(['solid', 'none'])
  await line.fill('clear')
  await line.press('Enter')
  await expect(terminal.locator('.terminal-entry')).toHaveCount(0)
  await expect(terminal.locator('.terminal-hint')).toBeVisible()
  await expect(await run('echo gone; clear; echo kept')).toHaveText(/kept/)
  await expect(terminal.locator('.terminal-entry')).toHaveCount(1)
  await expect(terminal.locator('.terminal-entry pre')).toHaveText('kept\n')
})

// A bare node or python3 opens its prompt, as on a real computer (D180): one interpreter kept between
// lines, values shown as each shows them, a statement over several lines, until it ends.
test('the terminal: a bare node or python3 opens its prompt, until .exit, exit() or Ctrl+D', async ({ page }) => {
  test.setTimeout(150_000)
  await start(page)
  await connectFakeBrain(page)
  await turnOn(page, 'Computer')
  await page.keyboard.press('Escape')
  await expect(await command(page, '$ true')).toContainText('Exit code: 0')
  await page.keyboard.press('ControlOrMeta+KeyJ')
  const terminal = page.locator('app-terminal .terminal')
  const line = terminal.getByRole('textbox', { name: 'Command' })
  const prompt = terminal.locator('.terminal-line > span')
  /** @param {string} text */
  const type = async (text) => {
    await line.fill(text)
    await line.press('Enter')
    const last = terminal.locator('.terminal-entry').last()
    await expect(last).not.toHaveClass(/is-running/, { timeout: 90_000 })
    return last
  }

  await expect(await type('node')).toContainText('Welcome to node')
  await expect(prompt).toHaveText('>')
  await expect((await type('const list = [1, "two", { three: 3 }]')).locator('pre')).toHaveText('undefined\n')
  await expect((await type('list')).locator('pre')).toHaveText("[ 1, 'two', { three: 3 } ]\n")
  await type('function twice(n) {')
  await expect(prompt).toHaveText('...')
  await type('return n * 2 }')
  await expect(prompt).toHaveText('>')
  await expect((await type('await Promise.resolve(twice(21))')).locator('pre')).toHaveText('42\n')
  await expect((await type('console.log({ a: [1] }, "b")')).locator('pre')).toHaveText('{ a: [ 1 ] } b\nundefined\n')
  await expect((await type('nope')).locator('pre.is-error')).toHaveText("Uncaught ReferenceError: 'nope' is not defined\n")
  await type('.exit')
  await expect(prompt).toHaveText('/workspace $')

  await expect(await type('python3')).toContainText('Python 3')
  await expect(prompt).toHaveText('>>>')
  await type('total = 0')
  await type('for n in range(4):')
  await expect(prompt).toHaveText('...')
  // Tab indents at a prompt; an empty line ends the block.
  await line.press('Tab')
  await line.pressSequentially('total += n')
  await line.press('Enter')
  await type('')
  await expect(prompt).toHaveText('>>>')
  await expect((await type('total')).locator('pre')).toHaveText('6\n')
  await expect((await type('1 / 0')).locator('pre.is-error')).toContainText('ZeroDivisionError: division by zero')
  await line.press('Control+d')
  await expect(prompt).toHaveText('/workspace $')
  // Afresh each time, as a new process would be.
  await type('python')
  await expect((await type('total')).locator('pre.is-error')).toContainText("NameError: name 'total' is not defined")
  await type('exit()')
  await expect(prompt).toHaveText('/workspace $')

  // The brain is told each statement that ran, whole, not the lines it waited on.
  const told = await page.evaluate(async () => (await import('/ui/state.js')).app.current.value?.records
    .flatMap(({ update }) => (update?.sessionUpdate === '_system_note' && update.data.kind === 'terminal' ? [update.data.command] : [])))
  expect(told).toContain('function twice(n) {\nreturn n * 2 }')
  expect(told).toContain('for n in range(4):\n    total += n\n')
  expect(told).not.toContain('for n in range(4):')
})
