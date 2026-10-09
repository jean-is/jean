import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DESKTOP, DIRS, DMG, finderScript, icns, infoPlist, NATIVE, neutralinoConfig, shippedFiles, TOP } from '../scripts/desktop.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('desktop', () => {
  it('keeps the app’s data under identifiers that never come from the name', () => {
    const one = neutralinoConfig({ name: 'Jean' }, { version: '0.8.0' })
    const other = neutralinoConfig({ name: 'Other & Co' }, { version: '0.8.0' })
    for (const config of [one, other]) {
      assert.equal(config.applicationId, DESKTOP.id)
      assert.equal(config.port, DESKTOP.port)
      assert.equal(config.cli.binaryName, DESKTOP.binary)
    }
    assert.equal(other.modes.window.title, 'Other & Co')
    assert.ok(DESKTOP.port > 0, 'a random port would lose the data at every launch')
  })

  it('gives the page only the host’s calls Sync, Settings › Computer and This computer’s bridge make, and writes nothing beside the app', async () => {
    const config = neutralinoConfig({ name: 'Jean' }, { version: '0.8.0' })
    assert.equal(config.enableNativeAPI, true)
    assert.equal(config.tokenSecurity, 'one-time')
    assert.deepEqual(config.nativeAllowList, NATIVE)
    // ui/host.js, and This computer for the bridge the desktop app starts (D198), the only program it runs.
    const callers = await Promise.all(['../ui/host.js', '../caps/machine/machine.js'].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
    const called = callers.flatMap((text) => [...text.matchAll(/call\('([\w.]+)'/g)].map(([, method]) => method))
    assert.deepEqual([...new Set(called)].sort(), [...NATIVE].sort())
    assert.ok(NATIVE.every((method) => /^(os\.(showFolderDialog|open|spawnProcess|getSpawnedProcesses|updateSpawnedProcess)|filesystem\.\w+|computer\.getMemoryInfo)$/.test(method)))
    assert.ok(!/call\('os\.(spawnProcess|execCommand)'/.test(callers[0]), 'ui/host.js runs no program')
    assert.equal(config.enableExtensions, false)
    assert.equal(config.logging.enabled, false)
    assert.equal(config.dataLocation, 'system')
    assert.equal(config.modes.window.newWindowPolicy, 'browser')
    assert.equal(config.documentRoot, config.cli.resourcesPath)
  })

  it('writes an Info.plist with the identifier, the name escaped and the microphone’s purpose', () => {
    const plist = infoPlist({ name: 'A & <B>' }, '1.2.3')
    assert.match(plist, /<key>CFBundleIdentifier<\/key>\n {2}<string>is\.jean\.desktop<\/string>/)
    assert.match(plist, /<string>A &amp; &lt;B&gt;<\/string>/)
    assert.match(plist, /<key>CFBundleExecutable<\/key>\n {2}<string>jean<\/string>/)
    assert.match(plist, /<key>NSMicrophoneUsageDescription<\/key>/)
    assert.match(plist, /<key>NSHighResolutionCapable<\/key>\n {2}<true\/>/)
  })

  it('writes an Apple icon file around the PNG', async () => {
    const png = await readFile(new URL('../icons/icon-512.png', import.meta.url))
    const file = icns(png)
    assert.equal(file.toString('latin1', 0, 4), 'icns')
    assert.equal(file.readUInt32BE(4), file.length)
    let at = 8
    for (const type of ['ic09', 'ic14']) {
      assert.equal(file.toString('latin1', at, at + 4), type)
      const length = file.readUInt32BE(at + 4)
      assert.deepEqual(file.subarray(at + 8, at + length), png)
      at += length
    }
    assert.equal(at, file.length)
  })

  it('draws the disk image’s window at its size, without words, on a floor both colours of names read on', async () => {
    const svg = await readFile(new URL('../desktop/dmg-background.svg', import.meta.url), 'utf8')
    assert.match(svg, new RegExp(`viewBox="0 0 ${DMG.width} ${DMG.height}"`))
    assert.doesNotMatch(svg, /<text\b/)
    const floor = /<stop offset="[\d.]+" stop-color="(#[0-9a-f]{6})"\/>\s*<\/linearGradient>/.exec(svg)?.[1]
    assert.ok(floor, 'the floor is the first gradient’s last colour')
    const channel = (/** @type {number} */ c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const [r, g, b] = [1, 3, 5].map((at) => channel(parseInt(floor.slice(at, at + 2), 16) / 255))
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    assert.ok((luminance + 0.05) / 0.05 >= 4.5, 'black names by day')
    assert.ok(1.05 / (luminance + 0.05) >= 4.5, 'white names by night')
  })

  it('asks Finder for the window, the background and each icon’s place, with names quoted', () => {
    const script = finderScript('/Volumes/A "B"', 'A "B".app')
    assert.match(script, /POSIX file "\/Volumes\/A \\"B\\"" as alias/)
    assert.match(script, /item "A \\"B\\"\.app" of theDisk to \{150, 160\}/)
    assert.match(script, /item "Applications" of theDisk to \{450, 160\}/)
    assert.match(script, /set bounds of theWindow to \{160, 120, 760, 480\}/)
    assert.match(script, /background picture of viewOptions to file "\.background:background\.tiff"/)
    assert.match(script, /icon size of viewOptions to 128/)
  })

  it('ships what a web deploy serves, and none of the tooling', async () => {
    const files = await shippedFiles(ROOT)
    for (const path of ['index.html', 'sandbox.html', 'sw.js', 'ui/app.js', 'caps/browser/browser.html', 'locales/en.json', 'caps/skills/directory/chart/SKILL.md']) assert.ok(files.includes(path), path)
    for (const path of files) {
      assert.ok(TOP.includes(path) || DIRS.includes(path.split('/')[0]), path)
      // No Markdown but the skills of Jean's own directory (D196).
      assert.doesNotMatch(path, /(?<!\/SKILL)\.md$|(^|\/)\./, path)
    }
  })
})
