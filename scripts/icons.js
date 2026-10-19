// Draws icons/icon.svg as the PNGs that installs need (D131): Android's installed apps take
// their icon from the web manifest's 192 and 512 pixel PNGs, and iOS takes its home-screen icon
// only from a 180 pixel apple-touch-icon. Each PNG records the hash of the drawing it came from,
// so the tests notice when icon.svg changes and the PNGs don't.
// Needs Playwright's Chromium, as the e2e tests do (npx playwright install chromium).
// Usage: npm run icons
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32 } from 'node:zlib'

const APP = fileURLToPath(new URL('../app', import.meta.url))
export const SOURCE = 'icons/icon.svg'
/** Every PNG drawn from SOURCE, with its size in pixels. */
export const PNGS = /** @type {Record<string, number>} */ ({
  'icons/apple-touch-icon.png': 180,
  'icons/icon-192.png': 192,
  'icons/icon-512.png': 512,
})
const KEYWORD = 'Drawn from'
const SIGNATURE = 8
const HEADER_END = SIGNATURE + 12 + 13

/** @param {string | Uint8Array} svg */
export const sourceOf = (svg) => `${SOURCE} sha256:${createHash('sha256').update(svg).digest('hex')}`

/**
 * @param {Uint8Array} png
 * @returns {Array<{ type: string, data: Buffer }>}
 */
function chunks (png) {
  const buffer = Buffer.from(png.buffer, png.byteOffset, png.byteLength)
  const list = []
  for (let at = SIGNATURE; at + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(at)
    list.push({ type: buffer.toString('latin1', at + 4, at + 8), data: buffer.subarray(at + 8, at + 8 + length) })
    at += 12 + length
  }
  return list
}

/**
 * A PNG's size, and the drawing it records it was made from (null if none).
 * @param {Uint8Array} png
 */
export function describePng (png) {
  const all = chunks(png)
  const header = all.find((chunk) => chunk.type === 'IHDR')
  if (!header) throw new Error('not a PNG')
  const text = all.filter((chunk) => chunk.type === 'tEXt').map((chunk) => chunk.data.toString('latin1').split('\0'))
  return {
    width: header.data.readUInt32BE(0),
    height: header.data.readUInt32BE(4),
    source: text.find(([keyword]) => keyword === KEYWORD)?.[1] ?? null,
  }
}

/**
 * Adds a tEXt chunk that names the drawing, just after the header.
 * @param {Uint8Array} png
 * @param {string} source
 */
export function recordSource (png, source) {
  const data = Buffer.from(`${KEYWORD}\0${source}`, 'latin1')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write('tEXt', 4, 'latin1')
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length)
  return Buffer.concat([png.subarray(0, HEADER_END), chunk, png.subarray(HEADER_END)])
}

async function main () {
  const { chromium } = await import('@playwright/test')
  const svg = await readFile(join(APP, SOURCE), 'utf8')
  const browser = await chromium.launch()
  try {
    for (const [path, size] of Object.entries(PNGS)) {
      const page = await browser.newPage({ viewport: { width: size, height: size } })
      await page.setContent(/* html */ `<style>* { margin: 0 } svg { display: block; width: 100vw; height: 100vh }</style>${svg}`)
      await writeFile(join(APP, path), recordSource(await page.screenshot(), sourceOf(svg)))
      await page.close()
    }
  } finally {
    await browser.close()
  }
  console.log(`icons: drew ${Object.keys(PNGS).join(', ')} from ${SOURCE}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`icons: ${error.message}`)
    process.exit(1)
  })
}
