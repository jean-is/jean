// Pictures (Files): a picture dropped in is scaled down to what brains take, and a capture of the
// screen is one frame of what the user shares, which then stops. A brain that can see is shown
// both. The browser's screen picker is replaced by a painted canvas. In three languages.
import { readFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask } from './helpers.js'

/** A plain PNG of the given size. @param {number} width @param {number} height */
function png(width, height) {
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const size = Buffer.alloc(4)
    const sum = Buffer.alloc(4)
    size.writeUInt32BE(data.length)
    sum.writeUInt32BE(crc32(body))
    return Buffer.concat([size, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Buffer.alloc((width * 3 + 1) * height, 120)
  for (let y = 0; y < height; y++) rows[y * (width * 3 + 1)] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

for (const lang of ['en', 'ar', 'ja']) {
  test(`a picture and a capture of the screen, shown to the brain (${lang})`, async ({ page }) => {
    const strings = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'))
    await page.addInitScript(() => {
      MediaDevices.prototype.getDisplayMedia = async () => {
        const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 400 })
        const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
        const paint = () => {
          context.fillStyle = '#204060'
          context.fillRect(0, 0, 640, 400)
          context.fillStyle = '#f0c040'
          context.fillRect(40, 40, 200, 80)
        }
        paint()
        setInterval(paint, 50)
        const stream = canvas.captureStream(20)
        Object.assign(window, { shared: stream })
        return stream
      }
    })
    await start(page, lang)
    await connectFakeBrain(page)

    // A big picture is scaled down to 1568 pixels on its longer side.
    await page.locator('.composer input[type="file"]').setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: png(2000, 1000) })
    const chip = page.locator('.attachment[data-status="ready"]')
    await expect(chip.locator('.attachment-preview img')).toBeVisible()
    await expect(chip.locator('.attachment-note')).toHaveText(strings['files.picture'])
    await ask(page, 'What does it show?')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('I can see your picture: 1568 × 784 pixels.', { timeout: 30_000 })
    await expect(page.locator('.composer .send:not(.is-stop)')).toBeVisible()

    // A capture of the screen: one frame, and the sharing stops at once.
    await page.getByRole('button', { name: strings['capture.start'] }).click()
    await expect(chip).toHaveCount(1)
    await expect(chip.locator('.attachment-name')).toContainText(strings['capture.name'].replace(/\s*\{time\}\s*/, ''))
    expect(await page.evaluate(() => /** @type {any} */ (window).shared.getTracks().every((/** @type {MediaStreamTrack} */ track) => track.readyState === 'ended'))).toBe(true)
    await ask(page, 'And this one?')
    await expect(page.locator('.msg-jean .prose').last()).toContainText('I can see your picture: 640 × 400 pixels.', { timeout: 30_000 })
    await expect(page.locator('.msg-files .file-chip').last()).toContainText(strings['capture.name'].replace(/\s*\{time\}\s*/, ''))
  })
}
