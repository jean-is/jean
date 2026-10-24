// node run.mjs <port>: composes the film in Chromium and WebKit, saves each one's MP4 and a frame of it played back.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'

const { chromium, webkit } = createRequire(new URL('../../../package.json', import.meta.url))('@playwright/test')
const port = process.argv[2]
for (const [name, type, options] of [['chromium', chromium, { channel: 'chromium' }], ['webkit', webkit, {}]].filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
  const browser = await type.launch({ headless: true, ...options })
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
  page.on('console', (m) => m.type() === 'error' && console.error(name, m.text().slice(0, 300)))
  await page.goto(`http://127.0.0.1:${port}/`)
  for (const size of name === 'webkit' ? [{ width: 1280, height: 720, codecString: 'avc1.4d401f' }, { width: 1920, height: 1080, codecString: 'avc1.4d4028' }] : [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    try {
      const result = await page.evaluate((s) => window.run(s), size)
      console.log(JSON.stringify({ browser: name, ...result }))
      const bytes = await page.evaluate(() => Array.from(window.bytes))
      writeFileSync(`film-${name}-${size.height}.mp4`, Buffer.from(bytes))
      await page.locator('#film').screenshot({ path: `frame-${name}-${size.height}.png` })
    } catch (error) {
      console.log(JSON.stringify({ browser: name, size, error: String(error.message).slice(0, 300) }))
    }
  }
  await browser.close()
}
