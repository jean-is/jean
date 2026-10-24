// node run.mjs <port> <config.json>: each film of the config in headless Chromium (new headless, WebGPU with
// shader-f16), as JSON lines with what the profile's processes held at most (RSS).
import { createRequire } from 'node:module'
import { readFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const { chromium } = createRequire(new URL('../../../package.json', import.meta.url))('@playwright/test')
const [port, configFile] = process.argv.slice(2)
const { films, ...common } = JSON.parse(readFileSync(configFile, 'utf8'))
const profile = new URL('./profile/', import.meta.url).pathname
rmSync(profile, { recursive: true, force: true })
const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu'] })
const page = context.pages()[0] ?? await context.newPage()
page.setDefaultTimeout(0)
page.on('console', (m) => m.type() === 'error' && !/VerifyEachNode|Rerunning/.test(m.text()) && console.error('console:', m.text().slice(0, 300)))
await page.goto(`http://127.0.0.1:${port}/`)
const rss = () => Number(execSync(`ps -axo rss=,command= | grep -F '${profile}' | grep -v grep | awk '{s+=$1} END {print s+0}'`).toString().trim()) * 1024
for (const film of films) {
  let peak = 0
  const timer = setInterval(() => { peak = Math.max(peak, rss()) }, 500)
  const result = await page.evaluate((job) => window.film(job), { ...common, ...film }).catch((error) => ({ error: error.message }))
  clearInterval(timer)
  console.log(JSON.stringify({ film: film.name, useRefEmbeds: !!film.useRefEmbeds, peakGB: +(peak / 2 ** 30).toFixed(2), ...result }))
}
await context.close()
rmSync(profile, { recursive: true, force: true })
