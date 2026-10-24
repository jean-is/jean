// node run.mjs <port> <jobs.json>: runs each job in headless Chromium (new headless, WebGPU with shader-f16), printing results as JSON lines.
import { createRequire } from 'node:module'
import { readFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const { chromium } = createRequire(new URL('../../../package.json', import.meta.url))('@playwright/test')
const [port, jobsFile] = process.argv.slice(2)
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'))
const profile = new URL('./profile/', import.meta.url).pathname
rmSync(profile, { recursive: true, force: true })

const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=WebGPUExperimentalFeatures'] })
const page = context.pages()[0] ?? await context.newPage()
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text().slice(0, 300)))
await page.goto(`http://127.0.0.1:${port}/`)
console.log(JSON.stringify({ gpu: await page.evaluate(() => window.gpu()) }))

// The most the profile's processes held while a job ran, from ps, as RSS.
const rss = () => execSync(`ps -axo rss=,command= | grep -F '${profile}' | grep -v grep | awk '{s+=$1} END {print s}'`).toString().trim() * 1024
for (const job of jobs) {
  let peak = 0
  const timer = setInterval(() => { peak = Math.max(peak, rss()) }, 250)
  const result = await page.evaluate((j) => window.bench(j), job)
  clearInterval(timer)
  console.log(JSON.stringify({ job: job.label ?? job.graph, peakGB: +(peak / 2 ** 30).toFixed(2), ...result }))
}
await context.close()
rmSync(profile, { recursive: true, force: true })
