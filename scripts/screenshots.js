// Takes the screenshots that the richer install dialog shows (D168): the welcome screen of a
// first visit, dark and in English like the manifest's description, wide for desktops and
// narrow for phones. Nothing checks that they show today's look: take them again after changing it.
// Needs Playwright's Chromium, as the e2e tests do (npx playwright install chromium).
// Usage: npm run screenshots
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SCREENSHOTS } from './manifest.js'
import { handle } from './serve.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** Device pixels per CSS pixel: a phone's screen is dense, a desktop's often isn't. */
export const SCALE = /** @type {Record<string, number>} */ ({ wide: 1, narrow: 2 })
const QUALITY = 85
/** Start of frame markers, the ones that hold the size: C0 to CF, except C4, C8 and CC. */
const FRAME = /** @param {number} marker */ (marker) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)

/**
 * A JPEG's size, from its frame header, or null if it has none.
 * @param {Uint8Array} jpeg
 */
export function jpegSize (jpeg) {
  const buffer = Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength)
  if (buffer.readUInt16BE(0) !== 0xffd8) return null
  for (let at = 2; at + 9 <= buffer.length; at += 2 + buffer.readUInt16BE(at + 2)) {
    if (buffer[at] !== 0xff) return null
    if (FRAME(buffer[at + 1])) return { width: buffer.readUInt16BE(at + 7), height: buffer.readUInt16BE(at + 5) }
  }
  return null
}

async function main () {
  const { chromium } = await import('@playwright/test')
  const server = createServer((req, res) => { handle(req, res).catch(() => res.destroy()) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  const browser = await chromium.launch()
  try {
    for (const { src, sizes, form_factor: form } of SCREENSHOTS) {
      const [width, height] = sizes.split('x').map(Number)
      const scale = SCALE[form]
      const page = await browser.newPage({
        viewport: { width: width / scale, height: height / scale },
        deviceScaleFactor: scale,
        locale: 'en-US',
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      })
      await page.goto(`http://127.0.0.1:${port}/`)
      await page.locator('.hero-question').waitFor()
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await mkdir(dirname(join(ROOT, src)), { recursive: true })
      await writeFile(join(ROOT, src), await page.screenshot({ type: 'jpeg', quality: QUALITY }))
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
  console.log(`screenshots: took ${SCREENSHOTS.map(({ src }) => src).join(', ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`screenshots: ${error.message}`)
    process.exit(1)
  })
}
