// The check of a site, for npm run sites (Sites' phase 0): what a visitor with a phone, a screen reader or a search
// engine meets on each page, said so that a brain can fix it. From the files, in Node: each page's language and
// direction, title, description and card, one h1 and headings in order, one top, main and foot, names for links,
// buttons, fields and pictures, links and pictures that lead somewhere, every page reached from index.html, each
// language with every page and naming the others, nothing loaded from another site, no script inside a page (the host
// runs a site's own files only), forms the host can receive, and no field for a password or a card. In Chromium, each
// page at 320 and 1280 pixels: a sideways scroll, pictures that don't load, a script's errors, what it tried to reach
// elsewhere, and the contrast of its words (axe-core). It also lists the [placeholders] left to fill in.
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { checkFiles, WIDTHS } from '../../app/caps/sites/check.js'
import { reach } from '../../app/caps/sites/file.js'

export { checkFiles, told } from '../../app/caps/sites/check.js'

/** @typedef {import('../../app/caps/sites/check.js').Files} Files */
/** @typedef {import('../../app/caps/sites/check.js').Report & { shots?: { wide: Buffer, narrow: Buffer } }} Report  with the first page, whole, at 1280 and 320 pixels */

const AXE = fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url))
export const TYPES = /** @type {Record<string, string>} */ ({ html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json' })
const extension = (/** @type {string} */ path) => path.toLowerCase().split('.').pop() ?? ''
/** Where a link from a page leads in the site, or null for another site, an email, a phone or the page itself. @param {string} from @param {string} href */
const target = (from, href) => {
  if (!href || href.startsWith('#') || /^(mailto|tel|sms|data|javascript):/i.test(href) || /^(https?:)?\/\//i.test(href)) return null
  const url = new URL(href, `https://site.invalid/${from}`)
  return url.origin === 'https://site.invalid' ? decodeURIComponent(url.pathname.slice(1)) : null
}

/**
 * Serves a site's files on 127.0.0.1, as a host would: a folder's index.html, a page without its .html.
 * @param {Files} files @returns {Promise<{ origin: string, close: () => void }>}
 */
export async function serve(files) {
  const server = createServer((req, res) => {
    const path = reach(files, decodeURIComponent(new URL(String(req.url), 'http://site').pathname.slice(1)))
    const bytes = path && files.get(path)
    if (!path || !bytes) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
    res.writeHead(200, { 'content-type': TYPES[extension(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(bytes)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  return { origin: `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`, close: () => server.close() }
}

/**
 * The check in Chromium: each page at each width, what overflows, what doesn't load, its script's errors, what it
 * reached elsewhere, and its words' contrast at the widest; then the first page's pictures.
 * @param {import('@playwright/test').Browser} browser @param {Files} files @param {string[]} pages
 * @returns {Promise<{ problems: string[], shots?: Report['shots'] }>}
 */
export async function checkInBrowser(browser, files, pages) {
  const problems = /** @type {string[]} */ ([])
  const { origin, close } = await serve(files)
  /** @type {Partial<NonNullable<Report['shots']>>} */
  const shots = {}
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 640 : 800 } })
      const reached = new Set()
      await context.route('**/*', (route) => {
        const url = route.request().url()
        if (url.startsWith(origin)) return route.continue()
        reached.add(new URL(url).host || url.slice(0, 40))
        return route.abort()
      })
      try {
        for (const path of pages.slice(0, 16)) {
          const page = await context.newPage()
          const errors = /** @type {string[]} */ ([])
          page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]))
          page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(message.text())) errors.push(message.text().split('\n')[0]) })
          try {
            await page.goto(`${origin}/${path}`, { waitUntil: 'load', timeout: 15_000 })
            await page.waitForTimeout(150)
            const seen = await page.evaluate(() => {
              const wide = document.documentElement.scrollWidth
              let widest = ''
              if (wide > innerWidth + 1) {
                const over = [...document.body.querySelectorAll('*')].filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1) })
                const leaf = over.find((element) => !over.some((other) => other !== element && element.contains(other))) ?? over[0]
                if (leaf) widest = `<${leaf.tagName.toLowerCase()}${leaf.id ? ` id="${leaf.id}"` : ''}${leaf.className && typeof leaf.className === 'string' ? ` class="${leaf.className.trim().split(/\s+/).slice(0, 2).join(' ')}"` : ''}> ${Math.round(leaf.getBoundingClientRect().width)} px wide`
              }
              const broken = [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && image.getAttribute('src')).map((image) => image.getAttribute('src'))
              // The page's foot, and what shows below it: a short page's foot floats mid-screen, a long one's may leave a band.
              const foot = document.querySelector('body > footer') ?? [...document.querySelectorAll('footer')].pop()
              const below = foot ? Math.round(Math.max(document.documentElement.scrollHeight, innerHeight) - (foot.getBoundingClientRect().bottom + scrollY)) : 0
              return { wide, widest, broken, below }
            })
            if (seen.wide > width + 1) problems.push(`${path}: at ${width} px it scrolls sideways to ${seen.wide} px${seen.widest ? `; ${seen.widest}` : ''}`)
            if (seen.below > 8) problems.push(`${path}: at ${width} px, ${seen.below} px of empty page show below the footer; keep the foot at the bottom (a body in a column, main growing)`)
            // A picture the site lacks, or from elsewhere, is said from the files already: here, one it has that doesn't show.
            for (const src of seen.broken) { const to = target(path, String(src)); if (to !== null && reach(files, to)) problems.push(`${path}: the picture ${src} doesn't load`) }
            if (width === Math.max(...WIDTHS)) {
              await page.addScriptTag({ path: AXE })
              const found = await page.evaluate(async () => {
                // @ts-ignore axe, added just before
                const result = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations'] })
                return result.violations.flatMap((/** @type {any} */ violation) => violation.nodes.map((/** @type {any} */ node) => ({ where: String(node.target[0]), words: String(node.html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40), data: node.any[0]?.data ?? {} })))
              })
              for (const { where, words, data } of found.slice(0, 4)) problems.push(`${path}: ${words ? `“${words}” (${where})` : where} has a contrast of ${data.contrastRatio}:1 (${data.fgColor} on ${data.bgColor}), not ${String(data.expectedContrastRatio ?? '4.5').replace(':1', '')}:1`)
              if (found.length > 4) problems.push(`${path}: ${found.length - 4} more places have too little contrast`)
            }
            // The whole page, as a window as tall as it shows it: made taller until its height holds, since the scrollbar that
            // goes then lays the words out wider (a full-page picture keeps the height from before, a band below the foot).
            if (path === 'index.html') {
              let height = 0
              for (let tries = 0; tries < 4; tries++) {
                const next = Math.min(2400, await page.evaluate(() => document.documentElement.scrollHeight))
                if (next === height) break
                await page.setViewportSize({ width, height: (height = next) })
                await page.waitForTimeout(100)
              }
              shots[width < 600 ? 'narrow' : 'wide'] = await page.screenshot()
            }
          } catch (error) {
            problems.push(`${path}: it didn’t load at ${width} px (${error instanceof Error ? error.message.split('\n')[0] : error})`)
          }
          for (const error of new Set(errors)) problems.push(`${path}: its script failed: ${error}`)
          await page.close()
        }
      } finally {
        await context.close()
      }
      for (const host of reached) problems.push(`it reached ${host}; a site loads nothing from another site`)
    }
  } finally {
    close()
  }
  return { problems: [...new Set(problems)], ...(shots.wide && shots.narrow && { shots: /** @type {NonNullable<Report['shots']>} */ (shots) }) }
}

/** The whole check. @param {Files} files @param {import('@playwright/test').Browser} browser @returns {Promise<Report>} */
export async function check(files, browser) {
  const found = checkFiles(files)
  const seen = await checkInBrowser(browser, files, found.pages)
  // What a page reached elsewhere is said once, from its files, when they show it.
  const more = seen.problems.filter((problem) => { const host = /^it reached ([^;]+);/.exec(problem)?.[1]; return !host || !found.problems.some((one) => one.includes(host)) })
  return { ...found, problems: [...new Set([...found.problems, ...more])], ...(seen.shots && { shots: seen.shots }) }
}
