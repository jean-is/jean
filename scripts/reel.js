// Exports one of Jean's reels (D687, docs/reels.md#export) to a video file, for where a page can't play it: the
// README, a social post, the press. It serves the site as jean.is has it (scripts/serve.js --home), opens the reel's
// player in Chromium, in a language and by day or by night, with Playwright's clock in place of the page's, and
// steps it frame by frame: each step moves every timer and animation frame of the player and of Jean's frames by
// exactly one frame, the player moving Jean's own CSS animations with them, then takes a picture. So the video is the
// same each time and drops no frame, however slow the machine. The score is rendered offline for the reel's length,
// its loudness measured. ffmpeg writes dist/reels/<name>.<lang>.mp4 (H.264 and AAC) and <name>.<lang>.webp, a silent
// animated preview small enough for a README.
// Needs ffmpeg, and Playwright's Chromium, as the e2e tests do (npx playwright install chromium); CHROMIUM names another.
// Usage: npm run reel -- <name> [--lang en] [--theme light|dark] [--size 1920x1080] [--fps 30] [--preview-width 880] [--out dist/reels]
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
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
  const [width, height] = (said.size ?? '1920x1080').split('x').map(Number)
  const out = {
    name: name ?? 'jean',
    lang: said.lang ?? 'en',
    theme: said.theme ?? 'light',
    width,
    height,
    fps: Number(said.fps ?? 30),
    preview: Number(said['preview-width'] ?? 880),
    out: said.out ?? join(ROOT, 'dist', 'reels'),
  }
  if (!/^[a-z-]+$/.test(out.name) || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(out.lang) || !['light', 'dark'].includes(out.theme)) throw new Error(`reel: no reel ${out.name} in ${out.lang}, ${out.theme}`)
  if (!(width >= 320 && height >= 180 && out.fps >= 1 && out.fps <= 60)) throw new Error('reel: --size is <width>x<height>, at least 320x180, and --fps 1 to 60')
  return out
}

/** A command run to its end, its standard error kept, its input fed by `feed` when given. @param {string} command @param {string[]} args @param {(input: import('node:stream').Writable) => Promise<void>} [feed] */
function run (command, args, feed) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [feed ? 'pipe' : 'ignore', 'ignore', 'pipe'] })
    let said = ''
    child.stderr.on('data', (data) => { said += data })
    child.on('error', (error) => reject(new Error(`reel: ${command} could not start (${error.message}); install it first`)))
    child.on('close', (code) => (code ? reject(new Error(`reel: ${command} failed:\n${said.slice(-2000)}`)) : resolve(said)))
    if (feed && child.stdin) feed(child.stdin).then(() => child.stdin?.end(), reject)
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

/** A stream written to, waiting while it is full. @param {import('node:stream').Writable} stream @param {Buffer} chunk */
const write = (stream, chunk) => new Promise((resolve) => { if (stream.write(chunk)) resolve(undefined); else stream.once('drain', resolve) })

async function main () {
  const at = options(process.argv.slice(2))
  const file = join(at.out, `${at.name}.${at.lang}`)
  await mkdir(at.out, { recursive: true })
  const { base, stop } = await serve(Number(process.env.PORT) || 4196)
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--force-color-profile=srgb', '--hide-scrollbars'] })
  try {
    const page = await browser.newPage({ viewport: { width: at.width, height: at.height }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })
    const wrong = /** @type {string[]} */ ([])
    page.on('pageerror', (error) => wrong.push(error.message))
    await page.goto(`${base}reel.html#${new URLSearchParams({ reel: at.name, lang: at.lang, theme: at.theme, look: 'tilde' })}&export`)
    await page.waitForFunction(() => /** @type {any} */ (window).reel?.length > 0, null, { timeout: 30_000 })
    await page.evaluate(() => /** @type {any} */ (window).reel.ready())
    const length = await page.evaluate(() => /** @type {number} */ (/** @type {any} */ (window).reel.length))
    // The score first, while the page's own clock still runs: its offline render keeps no timer.
    const wav = `${file}.wav`
    await writeFile(wav, Buffer.from(await page.evaluate(() => /** @type {any} */ (window).reel.audio()), 'base64'))
    const loudness = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    // Then time held still, and moved on a frame at a time.
    await page.clock.install()
    await page.clock.pauseAt(Date.now() + 1000)
    await page.evaluate(() => /** @type {any} */ (window).reel.record())
    const frames = Math.ceil((length / 1000) * at.fps)
    const started = Date.now()
    await run('ffmpeg', ['-hide_banner', '-y', '-f', 'image2pipe', '-framerate', String(at.fps), '-c:v', 'png', '-i', '-', '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', '-shortest', `${file}.mp4`], async (input) => {
      let moved = 0
      for (let frame = 0; frame < frames; frame++) {
        const now = Math.round((frame * 1000) / at.fps)
        if (now > moved) await page.clock.runFor(now - moved)
        moved = now
        await page.evaluate(() => /** @type {any} */ (window).reel.settled())
        await write(input, await page.screenshot({ type: 'png' }))
        if (frame % (at.fps * 5) === 0) process.stdout.write(`\r${at.name}.${at.lang}: ${Math.round((100 * frame) / frames)}% `)
      }
    })
    process.stdout.write(`\r${at.name}.${at.lang}: ${frames} frames in ${Math.round((Date.now() - started) / 1000)} s\n`)
    if (wrong.length) throw new Error(`reel: the page went wrong while it played: ${wrong.join('; ')}`)
    // The preview: silent, as wide as a README's column, 12 frames a second, looping.
    await run('ffmpeg', ['-hide_banner', '-y', '-i', `${file}.mp4`, '-vf', `fps=12,scale=${at.preview}:-2:flags=lanczos`, '-an', '-c:v', 'libwebp_anim', '-quality', '70', '-compression_level', '6', '-loop', '0', `${file}.webp`])
    await rm(wav)
    // Its summary's, after the meter's running values.
    const summary = loudness.slice(loudness.lastIndexOf('Summary:'))
    const [integrated, peak] = [/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1], /Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]]
    console.log(`${file}.mp4 and .webp: ${(length / 1000).toFixed(1)} s, ${at.width} × ${at.height} at ${at.fps} frames a second; the score at ${integrated} LUFS, its peak ${peak} dBFS`)
  } finally {
    await browser.close()
    stop()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
