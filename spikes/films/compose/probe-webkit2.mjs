import { createRequire } from 'node:module'
const { webkit } = createRequire(new URL('../../../package.json', import.meta.url))('@playwright/test')
const browser = await webkit.launch({ headless: true })
const page = await browser.newPage()
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 300)))
page.on('crash', () => console.log('page crashed'))
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://127.0.0.1:47392/')
const step = async (name, fn) => { try { console.log(name, await page.evaluate(fn, process.env.CODEC ?? 'avc1.640028')) } catch (e) { console.log(name, 'FAILED', e.message.slice(0, 200)) } }
await step('videoframe from offscreen', async () => { const c = new OffscreenCanvas(640, 360); c.getContext('2d').fillRect(0, 0, 10, 10); const f = new VideoFrame(c, { timestamp: 0 }); const r = [f.codedWidth, f.format]; f.close(); return r })
await step('encode 10 frames', async (codec) => {
  const chunks = []
  const enc = new VideoEncoder({ output: (c) => chunks.push(c.byteLength), error: (e) => chunks.push('err ' + e.message) })
  enc.configure({ codec, width: 640, height: 360, bitrate: 2e6, framerate: 30 })
  const c = new OffscreenCanvas(640, 360); const g = c.getContext('2d')
  for (let i = 0; i < 10; i++) { g.fillStyle = `hsl(${i * 30} 60% 50%)`; g.fillRect(0, 0, 640, 360); const f = new VideoFrame(c, { timestamp: i * 33333 }); enc.encode(f, { keyFrame: i === 0 }); f.close() }
  await enc.flush(); return chunks
})
await step('compose 640x360', async () => { const { compose } = await import('./compose.mjs'); const r = await compose({ width: 640, height: 360 }); return { ...r, bytes: r.bytes.length } })
await browser.close()
