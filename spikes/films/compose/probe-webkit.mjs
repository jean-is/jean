import { createRequire } from 'node:module'
const { webkit } = createRequire(new URL('../../../package.json', import.meta.url))('@playwright/test')
const browser = await webkit.launch({ headless: true })
const page = await browser.newPage()
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200)))
page.on('crash', () => console.log('page crashed'))
await page.goto('http://127.0.0.1:47392/')
console.log(await page.evaluate(async () => {
  const out = { VideoEncoder: typeof VideoEncoder, AudioEncoder: typeof AudioEncoder, OffscreenCanvas: typeof OffscreenCanvas, ua: navigator.userAgent }
  for (const codec of ['avc1.640028', 'avc1.42001f', 'vp8', 'vp09.00.10.08', 'hvc1.1.6.L93.B0']) {
    try { out[codec] = (await VideoEncoder.isConfigSupported({ codec, width: 1280, height: 720, bitrate: 4e6 })).supported } catch (e) { out[codec] = String(e) }
  }
  for (const codec of ['mp4a.40.2', 'opus']) {
    try { out[codec] = (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported } catch (e) { out[codec] = String(e) }
  }
  return out
}))
await browser.close()
