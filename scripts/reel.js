// Draws one of Jean's reels (D687, docs/reels.md#the-readmes-animation) as a silent animated WebP, for where a page
// can't play it: the README. It serves the site as jean.is has it (scripts/serve.js --home), opens the reel's player
// in Chromium, in a language and by day or by night, with Playwright's clock in place of the page's, and steps it
// frame by frame: each step moves every timer and animation frame of the player and of Jean's frames by exactly one
// frame, the player moving Jean's own CSS animations with them, then takes a picture. So the animation is the same
// each time and drops no frame, however slow the machine. The stage is drawn at the animation's own size, as wide as
// a README's column, and libwebp's img2webp writes dist/reels/<name>.<lang>.webp, lossless. No video file: a reel with its
// sound plays on jean.is/watch.
// Needs img2webp (libwebp's, `brew install webp`), and Playwright's Chromium, as the e2e tests do (npx playwright install chromium); CHROMIUM names another.
// Usage: npm run reel -- <name> [--lang en] [--theme light|dark] [--width 880] [--fps 12] [--out dist/reels]
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The options after the reel's name, each `--name value`. @param {string[]} argv */
export function options (argv) {
  const [name, ...rest] = argv
  /** @type {Record<string, string>} */
  const said = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith('--') || rest[i + 1] === undefined) throw new Error(`reel: ${rest[i]} needs a value (npm run reel -- <name> --lang en)`)
    said[rest[i].slice(2)] = rest[i + 1]
  }
  const out = {
    name: name ?? 'jean',
    lang: said.lang ?? 'en',
    theme: said.theme ?? 'light',
    width: Number(said.width ?? 880),
    fps: Number(said.fps ?? 12),
    out: said.out ?? join(ROOT, 'dist', 'reels'),
  }
  if (!/^[a-z-]+$/.test(out.name) || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(out.lang) || !['light', 'dark'].includes(out.theme)) throw new Error(`reel: no reel ${out.name} in ${out.lang}, ${out.theme}`)
  if (!(out.width >= 320 && out.width <= 1920 && out.fps >= 1 && out.fps <= 30)) throw new Error('reel: --width is 320 to 1920, and --fps 1 to 30')
  return out
}

/** A command run to its end, its standard error kept. @param {string} command @param {string[]} args */
function run (command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let said = ''
    child.stderr.on('data', (data) => { said += data })
    child.on('error', (error) => reject(new Error(`reel: ${command} could not start (${error.message}); install it first`)))
    child.on('close', (code) => (code ? reject(new Error(`reel: ${command} failed:\n${said.slice(-2000)}`)) : resolve(said)))
  })
}

/** jean.is's site, served by the development server on a port of its own, until stopped. @param {number} port */
async function serve (port) {
  const server = spawn(process.execPath, [join(ROOT, 'scripts/serve.js'), '--home'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  const base = `http://127.0.0.1:${port}/`
  for (let tries = 0; tries < 100; tries++) {
    const ok = await fetch(`${base}reel.html`).then((response) => response.ok, () => false)
    if (ok) return { base, stop: () => server.kill() }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  server.kill()
  throw new Error('reel: the site was not served; does npm run dev:home start?')
}

async function main () {
  const at = options(process.argv.slice(2))
  const file = join(at.out, `${at.name}.${at.lang}`)
  await mkdir(at.out, { recursive: true })
  const { base, stop } = await serve(Number(process.env.PORT) || 4196)
  const kept = await mkdtemp(join(tmpdir(), 'reel-'))
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--force-color-profile=srgb', '--hide-scrollbars'] })
  try {
    // The stage scales to its frame, so the page is the animation's size and each picture one of its frames.
    const page = await browser.newPage({ viewport: { width: at.width, height: Math.round((at.width * 9) / 16) }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
    const wrong = /** @type {string[]} */ ([])
    page.on('pageerror', (error) => wrong.push(error.message))
    await page.goto(`${base}reel.html#${new URLSearchParams({ reel: at.name, lang: at.lang, theme: at.theme, look: 'tilde' })}&export`)
    await page.waitForFunction(() => /** @type {any} */ (window).reel?.length > 0, null, { timeout: 30_000 })
    await page.evaluate(() => /** @type {any} */ (window).reel.ready())
    const length = await page.evaluate(() => /** @type {number} */ (/** @type {any} */ (window).reel.length))
    // Time held still, and moved on a frame at a time, in steps no longer than a screen's frame, as the player expects.
    await page.clock.install()
    await page.clock.pauseAt(Date.now() + 1000)
    await page.evaluate(() => /** @type {any} */ (window).reel.record())
    const frames = Math.ceil((length / 1000) * at.fps)
    const started = Date.now()
    /** @type {string[]} */
    const pictures = []
    let moved = 0
    for (let frame = 0; frame < frames; frame++) {
      const now = Math.round((frame * 1000) / at.fps)
      while (moved < now) {
        const step = Math.min(34, now - moved)
        await page.clock.runFor(step)
        moved += step
        await page.evaluate(() => /** @type {any} */ (window).reel.settled())
      }
      pictures.push(join(kept, `${String(frame).padStart(5, '0')}.png`))
      await writeFile(/** @type {string} */ (pictures.at(-1)), await page.screenshot({ type: 'png' }))
      if (frame % (at.fps * 5) === 0) process.stdout.write(`\r${at.name}.${at.lang}: ${Math.round((100 * frame) / frames)}% `)
    }
    // Lossless: a lossy animation smears what changes little from a frame to the next, a shadow or a fading word.
    await run('img2webp', ['-loop', '0', '-min_size', '-d', String(Math.round(1000 / at.fps)), '-lossless', '-m', '6', ...pictures, '-o', `${file}.webp`])
    process.stdout.write(`\r${at.name}.${at.lang}: ${frames} frames in ${Math.round((Date.now() - started) / 1000)} s\n`)
    if (wrong.length) throw new Error(`reel: the page went wrong while it played: ${wrong.join('; ')}`)
    console.log(`${file}.webp: ${(length / 1000).toFixed(1)} s, ${at.width} pixels wide at ${at.fps} frames a second, ${Math.round((await stat(`${file}.webp`)).size / 1024)} KB`)
  } finally {
    await browser.close()
    stop()
    await rm(kept, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
