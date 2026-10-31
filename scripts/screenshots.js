// Takes the screenshots that the richer install dialog shows (D168, D396), in each of Jean's
// languages, dark, wide for desktops and narrow for phones: the welcome screen of a first visit; a
// spreadsheet drawn as a chart; a lease answered with its sources; and that chart's task shared by
// a link. What they show is in scripts/screenshots/<lang>.json, put in Jean's storage as the
// conversations would have left it, so no brain answers; the host a link goes to is jean.is's,
// answered here, and nothing else outside is reached. Then the one a shared link shows, in
// English. Nothing checks that they show today's look: take them again after changing it.
// Needs Playwright's Chromium, as the e2e tests do (npx playwright install chromium).
// Usage: npm run screenshots            every language, and the shared link's
//        npm run screenshots -- fr ja   only these languages
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LOCALES } from '../app/core/i18n.js'
import { FORMS, PAGES, SHARE, screenshotsOf, shotsOf } from './manifest.js'
import { handle } from './serve.js'

const APP = fileURLToPath(new URL('../app', import.meta.url))
/**
 * Device pixels per CSS pixel: a phone's screen is dense, a desktop's often isn't, and a shared
 * link's picture is drawn a tenth larger, so its words read in a small card and the first screen still fits it (D366).
 */
export const SCALE = /** @type {Record<string, number>} */ ({ wide: 1, narrow: 2, share: 10 / 9 })
const QUALITY = 0.85
/** Start of frame markers, the ones that hold the size: C0 to CF, except C4, C8 and CC. */
const FRAME = /** @param {number} marker */ (marker) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
/** Each region's sales, January to March: the chart's spreadsheet in every language. */
const SALES = [[120, 134, 151], [95, 101, 98], [70, 82, 96]]
/** Where links go, as jean.is's policy says (D361). */
const HOST = 'https://hst.ing/'
/** A brain is chosen, so the chip says Auto, as it does once one is; none is asked anything. */
const BRAIN = { id: '01K7SCREENSH0TS00000000000', provider: 'openrouter', api: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' }
/** Browsers' language tags for Jean's locales, where they differ. */
const TAGS = /** @type {Record<string, string>} */ ({ 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' })
/** How many languages are taken at once. */
const AT_ONCE = 4

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

/**
 * A WebP's size, from its first chunk, lossy, lossless or extended, or null if it is none.
 * @param {Uint8Array} webp
 */
export function webpSize (webp) {
  const b = Buffer.from(webp.buffer, webp.byteOffset, webp.byteLength)
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null
  const chunk = b.toString('latin1', 12, 16)
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 }
  return null
}

/**
 * What a language's conversations hold, put in Jean's storage as they would have left it: a brain
 * chosen, Skills and Share found, Auto's download answered, the Chart skill added from Jean's own
 * directory, then the two tasks, each with its file. Runs in the page.
 * @param {{ brain: typeof BRAIN, host: string, chart: { title: string, file: string, csv: string, ask: string, answer: string }, sources: { title: string, file: string, pdf: string, pages: string[], ask: string, answer: string } }} input
 */
async function seed ({ brain, host, chart, sources }) {
  const [{ app, updateSettings, refreshConversations }, { createConversation, appendRecords }, { metaRecord, userRecords, envelope }, { addFile }, { parseSkill, saveSkill }] = await Promise.all([
    import('/ui/state.js'), import('/core/conversations.js'), import('/core/events.js'), import('/core/files.js'), import('/core/skills.js')])
  const by = app.deviceId
  const { unlocked, offers, urls } = app.settings.value
  await updateSettings({ brains: [brain], activeBrain: brain.id, unlocked: [...unlocked, 'skills', 'share'], offers: { ...offers, reflexes: new Date().toISOString() }, urls: { ...urls, share: host } })
  const skill = parseSkill(await (await fetch('/caps/skills/directory/chart/SKILL.md')).text(), '')
  if (skill) await saveSkill(app.fs, '', { ...skill, by })
  /** @param {string} title @param {{ name: string, mimeType: string, bytes: Uint8Array, pages: string[] }} file @param {string} ask @param {string} answer */
  const task = async (title, file, ask, answer) => {
    const { path } = await createConversation(app.fs, { projectDir: app.projectDir, by })
    const link = await addFile(app.fs, { projectDir: app.projectDir, by, ...file })
    await appendRecords(app.fs, path, [metaRecord(by, { title }), ...userRecords(ask, [{ ...link, _meta: { source: 1 } }], by),
      envelope('jean', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: answer } }, 0)])
    return path
  }
  const paths = {
    chart: await task(chart.title, { name: chart.file, mimeType: 'text/csv', bytes: new TextEncoder().encode(chart.csv), pages: [chart.csv] }, chart.ask, chart.answer),
    sources: await task(sources.title, { name: sources.file, mimeType: 'application/pdf', bytes: Uint8Array.from(atob(sources.pdf), (c) => c.charCodeAt(0)), pages: sources.pages }, sources.ask, sources.answer),
  }
  await refreshConversations()
  return paths
}

/**
 * The host's answers: a link made, kept for 30 days. Anything else outside Jean is refused.
 * @param {import('@playwright/test').Route} route
 */
async function outside (route) {
  const request = route.request()
  const url = new URL(request.url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (!request.url().startsWith(`${HOST}v1/`)) return route.abort()
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT, DELETE', 'access-control-allow-headers': 'authorization, share-days, share-proof' }
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
  return route.fulfill({ headers, json: { expires: new Date(Date.now() + 30 * 86_400_000).toISOString() } })
}

/**
 * A PNG as WebP, by Chromium's own encoder.
 * @param {import('@playwright/test').Page} encoder @param {Buffer} png
 */
async function toWebP (encoder, png) {
  const data = await encoder.evaluate(async ([png, quality]) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    canvas.getContext('2d', { alpha: false })?.drawImage(bitmap, 0, 0)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: Number(quality) })).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, [png.toString('base64'), String(QUALITY)])
  return Buffer.from(data, 'base64')
}

/**
 * One language's pages in one form factor.
 * @param {import('@playwright/test').Browser} browser @param {import('@playwright/test').Page} encoder
 * @param {string} base Jean's address here @param {string} lang @param {string} form @param {any} shots @param {string} pdf
 */
async function take (browser, encoder, base, lang, form, shots, pdf) {
  const [width, height] = FORMS[form].split('x').map(Number)
  const scale = SCALE[form]
  const context = await browser.newContext({
    viewport: { width: width / scale, height: height / scale },
    deviceScaleFactor: scale,
    locale: TAGS[lang] ?? lang,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  await context.route('**/*', outside)
  const page = await context.newPage()
  const errors = /** @type {string[]} */ ([])
  page.on('pageerror', (error) => errors.push(error.message))
  const [{ src: welcome }, { src: chart }, { src: sources }, { src: share }] = screenshotsOf(lang, shots.labels).filter((shot) => shot.form_factor === form)
  /** @param {string} src */
  const save = async (src) => {
    await page.evaluate(() => document.fonts.ready.then(() => true))
    await mkdir(dirname(join(APP, src)), { recursive: true })
    await writeFile(join(APP, src), await toWebP(encoder, await page.screenshot({ type: 'png' })))
  }
  try {
    await page.goto(base)
    await page.locator('.hero-question').waitFor()
    if (await page.locator('html').getAttribute('lang') !== lang) throw new Error(`${lang}: Jean opened in ${await page.locator('html').getAttribute('lang')}`)
    await save(welcome)

    const csv = `${[shots.chart.columns, ...shots.chart.regions.map((/** @type {string} */ region, /** @type {number} */ i) => [region, ...SALES[i]])].map((row) => row.join(',')).join('\n')}\n`
    const option = { title: { text: shots.chart.heading }, tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, xAxis: { type: 'category', data: shots.chart.columns.slice(1) }, yAxis: { type: 'value' },
      series: shots.chart.regions.map((/** @type {string} */ name, /** @type {number} */ i) => ({ name, type: 'bar', data: SALES[i] })) }
    const paths = await page.evaluate(seed, {
      brain: BRAIN,
      host: HOST,
      chart: { ...shots.chart, csv, answer: `${shots.chart.before}\n\n\`\`\`echarts\n${JSON.stringify(option)}\n\`\`\`\n\n${shots.chart.after}` },
      sources: { ...shots.sources, pdf },
    })
    await page.reload()
    await page.locator('#prompt').waitFor()
    /** A task, from its request, once what draws it has. @param {string} path @param {string} drawn */
    const open = async (path, drawn) => {
      await page.evaluate((path) => import('/ui/state.js').then((state) => state.openConversation(path)), path)
      await page.locator(drawn).first().waitFor()
      await page.waitForTimeout(500)
      await page.evaluate(() => scrollTo({ top: 0 }))
    }

    await open(paths.chart, 'app-chart .chart canvas')
    await save(chart)

    await open(paths.sources, '.msg-jean .cite')
    await save(sources)

    await open(paths.chart, 'app-chart .chart canvas')
    await page.evaluate(([path, title]) => import('/caps/share/share.js').then((share) => share.openShare({ path, title })), [paths.chart, shots.chart.title])
    const dialog = page.locator('app-share-dialog dialog[open]')
    await dialog.locator('button.primary[form="share-form"]').click()
    await dialog.locator('input.share-link').waitFor()
    await page.waitForTimeout(300)
    await save(share)
    if (errors.length) throw new Error(`${lang} ${form}: ${errors.join('; ')}`)
  } finally {
    await context.close()
  }
}

/**
 * The lease as a real PDF, printed by Chromium, so the file the task holds is one.
 * @param {import('@playwright/test').Browser} browser @param {string} lang @param {string[]} pages
 */
async function leaseOf (browser, lang, pages) {
  const printer = await browser.newPage()
  try {
    const page = /** @param {string} text */ (text) => /* html */ `<section>${text.split('\n\n').map((part) => /* html */ `<p>${part.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>`).join('')}</section>`
    await printer.setContent(/* html */ `<!doctype html><html lang="${lang}" dir="auto"><style>section { break-after: page; font: 14pt/1.5 serif }</style>${pages.map(page).join('')}</html>`)
    return (await printer.pdf({ format: 'A4' })).toString('base64')
  } finally {
    await printer.close()
  }
}

/** @param {string[]} named */
async function main (named) {
  const unknown = named.filter((lang) => !LOCALES.includes(lang))
  if (unknown.length) throw new Error(`no such language: ${unknown.join(', ')}`)
  const languages = named.length ? named : LOCALES
  const { chromium } = await import('@playwright/test')
  const server = createServer((req, res) => { handle(req, res).catch(() => res.destroy()) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  const base = `http://127.0.0.1:${port}/`
  const browser = await chromium.launch()
  try {
    const encoder = await browser.newPage()
    const queue = [...languages]
    const worker = async () => {
      for (let lang = queue.shift(); lang; lang = queue.shift()) {
        const shots = await shotsOf(lang)
        const pdf = await leaseOf(browser, lang, shots.sources.pages)
        for (const form of Object.keys(FORMS)) await take(browser, encoder, base, lang, form, shots, pdf)
        console.log(`screenshots: ${lang}, ${PAGES.length * Object.keys(FORMS).length} pictures`)
      }
    }
    await Promise.all(Array.from({ length: AT_ONCE }, worker))
    if (!named.length) {
      const page = await browser.newPage({ viewport: { width: SHARE.width / SCALE.share, height: SHARE.height / SCALE.share }, deviceScaleFactor: SCALE.share,
        locale: 'en-US', colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' })
      await page.addInitScript(() => localStorage.setItem('app.sidebar', 'closed'))
      await page.goto(base)
      await page.locator('.hero-question').waitFor()
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await writeFile(join(APP, SHARE.src), await page.screenshot({ type: 'jpeg', quality: 85 }))
      await page.close()
      console.log(`screenshots: took ${SHARE.src}`)
    }
  } finally {
    await browser.close()
    server.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`screenshots: ${error.message}`)
    process.exit(1)
  })
}
