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
import { start, connectFakeBrain, ask, turnOn, SALES } from './helpers.js'

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

  // The relay set in Approvals: requests go through it.
  await page.evaluate(async () => (await import('/ui/state.js')).updateSettings({ relay: 'https://relay.example.com/?u={url}' }))
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
  execFileSync('tar', ['czf', join(dir, 'pack.tgz'), '-C', dir, 'package'])
  const tgz = readFileSync(join(dir, 'pack.tgz'))
  const manifest = JSON.parse(readFileSync(join(dir, 'package', 'package.json'), 'utf8'))
  const tarball = `https://npm.example.com/${name}/-/${name}-${version}.tgz`
  const integrity = `sha512-${createHash('sha512').update(tgz).digest('base64')}`
  return { tgz, tarball, meta: { name, 'dist-tags': { latest: version }, versions: { '1.0.0': { ...manifest, version: '1.0.0', dist: { tarball, integrity: 'sha512-old' } }, [version]: { ...manifest, dist: { tarball, integrity } } } } }
}

test('npm install from the registry Settings name, then node requires and imports; and tar', async ({ page }) => {
  test.setTimeout(90_000)
  const packages = [
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

  answer = await command(page, '$ tar czf both.tgz package.json hi.mjs && rm hi.mjs && tar xzf both.tgz && tar tzf both.tgz && cat hi.mjs')
  await expect(answer).toContainText('package.json\nhi.mjs')
  await expect(answer).toContainText("import { hi } from 'esm-hi'")
})

test('Settings › Computer: the internet, its sites, the relay, packages and the workspace', async ({ page }) => {
  await start(page)
  await turnOn(page, 'Computer')
  const settings = page.locator('app-settings dialog[open]')
  await settings.locator('.settings-nav button', { hasText: 'Computer' }).click()
  await expect(settings.locator('.settings-panel')).toContainText('Ask first')
  await settings.locator('.segmented label', { hasText: 'Any site' }).click()
  await expect.poll(() => page.evaluate(async () => (await import('/ui/state.js')).app.settings.value.computer?.internet)).toBe('any')
  const sites = settings.locator('.reach input')
  await sites.fill('example.com')
  await sites.press('Enter')
  await expect(settings.locator('.sites li')).toHaveText(['example.com'])
  await settings.locator('details.other summary').click()
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
})
