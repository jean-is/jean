// Measures a design system proposed from the person's own material (D740): for each brand of test/brands/fixtures.js, two in each
// of English, French, Arabic and Japanese, its logo, its brand guide (a PDF, or a Word file) and a screenshot of its site are
// made in Chromium, and Jean's own module (app/caps/slides/brand.js) proposes a kit from each, in a page of Jean's origin, as the
// design system's page does: no brain proposes anything. Each kit is then checked: its colours at AA by day and by night
// (`unreadable()`), its main colour against the brand's (its own, its second, or its own deepened at its hue), its faces against
// those the guide names, its logo found. Then a judge, shown the material and the kit drawn by day and by night with its faces
// and logo, says whether its palette and its faces are the brand's.
// Needs Playwright's Chromium (npx playwright install chromium) and, to judge, a brain as `npm run sites` names one: JUDGE,
// <provider>:<model> as jean-cli's --brain (cli/brain.js), its key in <PROVIDER>_API_KEY, JUDGE_ADDRESS, JUDGE_BODY.
// Usage: JUDGE=claudecode:sonnet npm run brands
//        npm run brands -- --lang fr,ja        some languages
//        npm run brands -- --only logo,guide   some kinds of material (logo, guide, site)
//        npm run brands -- --write             also write test/brands/results.md
// Each run is kept in test/brands/.cache/<brand>-<material>/: the material, the kit drawn, kit.json, run.json.
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chooseBrain } from '../cli/brain.js'
import { streamChat } from '../app/core/llm.js'
import { extractPages } from '../app/caps/files/extract.js'
import { oklab } from '../app/caps/slides/brand.js'
import { contrast } from '../app/ui/colour.js'
import { BRANDS, logoSvg, guideHtml, siteHtml, wordGuide } from '../test/brands/fixtures.js'

/** @typedef {import('../test/brands/fixtures.js').Brand} Brand */
/** @typedef {{ brand: string, lang: string, material: string, aa: string[], palette: boolean, present: boolean, faces?: boolean, logo?: boolean, primary: string, fonts?: string, judged?: { palette: boolean, faces: boolean | null, why: string }, error?: string }} Run */

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const DIR = fileURLToPath(new URL('../test/brands/', import.meta.url))
const TYPES = /** @type {Record<string, string>} */ ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.html': 'text/html' })

/** Jean's files on 127.0.0.1, as they are, for its modules to run in a page of their own. */
async function serveApp() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(String(req.url), 'http://app').pathname)
    const bytes = path === '/' ? Buffer.from('<!doctype html><title>brands</title>') : await readFile(`${APP}${path.slice(1)}`).catch(() => null)
    if (!bytes) return void res.writeHead(404).end()
    res.writeHead(200, { 'content-type': path === '/' ? 'text/html' : TYPES[extname(path)] ?? 'application/octet-stream' }).end(bytes)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)))
  return { origin: `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`, close: () => server.close() }
}

/** @param {string} hex */
const lab = (hex) => oklab([1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)))
/** @param {string} one @param {string} other */
const far = (one, other) => ((a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))(lab(one), lab(other))
/** @param {string} hex */
const hue = (hex) => ((l) => (Math.atan2(l[2], l[1]) * 180) / Math.PI)(lab(hex))
/** Whether a colour is a brand's: one of its two, or one deepened at its hue where it didn't read on the paper. @param {string} colour @param {Brand} brand @param {string} paper */
const brands = (colour, brand, paper) => [brand.primary, brand.secondary].some((own) => far(colour, own.toLowerCase()) < 0.05 || (contrast(own, paper) < 4.5 && Math.abs(((hue(colour) - hue(own) + 540) % 360) - 180) < 12))

/** A brand's three pieces of material, as files. @param {import('@playwright/test').Browser} browser @param {Brand} brand */
async function materialOf(browser, brand) {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  try {
    await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${logoSvg(brand)}</body>`)
    const logo = await page.locator('svg').screenshot({ omitBackground: true }), url = `data:image/png;base64,${logo.toString('base64')}`
    await page.setContent(guideHtml(brand, url), { waitUntil: 'load' })
    const guide = brand.guide === 'pdf' ? await page.pdf({ format: 'A4' }) : Buffer.from(await wordGuide(brand, new Uint8Array(logo)))
    await page.setViewportSize({ width: 900, height: 1270 })
    const guidePicture = await page.screenshot({ fullPage: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.setContent(siteHtml(brand, url), { waitUntil: 'load' })
    const site = await page.screenshot()
    return { logo: { name: `${brand.id}-logo.png`, bytes: logo, picture: logo }, guide: { name: `${brand.id}-guide.${brand.guide}`, bytes: guide, picture: guidePicture }, site: { name: `${brand.id}-home.png`, bytes: site, picture: site } }
  } finally { await page.close() }
}

/** A kit drawn by day and by night: its colours named, its faces writing a heading and a line, its logo. @param {import('@playwright/test').Browser} browser @param {Record<string, any>} tokens @param {Brand} brand */
async function drawKit(browser, tokens, brand) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } })
  const side = (/** @type {Record<string, any>} */ own, /** @type {string} */ name) => /* html */ `<section style="background:${own.paper};color:${own.ink}"><h3>${name}</h3>
    ${tokens.logo ? `<img src="${tokens.logo}" alt="">` : ''}<h1 style="color:${own.primary}">${brand.tagline}</h1><p>${brand.name}</p>
    <div class="row">${['paper', 'ink', 'primary', 'muted', 'soft'].filter((key) => own[key]).map((key) => `<figure><i style="background:${own[key]}"></i><figcaption>${key}<br>${own[key]}</figcaption></figure>`).join('')}</div>
    ${name === 'Day' && tokens.series ? `<div class="row">${tokens.series.map((/** @type {string} */ hex) => `<figure><i style="background:${hex}"></i><figcaption>chart<br>${hex}</figcaption></figure>`).join('')}</div>` : ''}</section>`
  await page.setContent(/* html */ `<!doctype html><html lang="${brand.lang}" dir="${brand.lang === 'ar' ? 'rtl' : 'ltr'}"><style>body{margin:0;display:grid;grid-template-columns:1fr 1fr;font-family:${tokens.fonts ? `'${tokens.fonts.body[0]}'` : 'system-ui'}} section{padding:20px;min-height:520px}
    h1{font-family:${tokens.fonts ? `'${tokens.fonts.heading[0]}'` : 'system-ui'};font-size:30px;margin:8px 0} h3{margin:0;font:600 13px system-ui;opacity:.7} img{max-height:48px;max-width:260px;background:${tokens.paper}} .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    figure{margin:0;width:78px;font:11px system-ui} i{display:block;height:36px;border-radius:6px;border:1px solid #8884}</style>
    <body>${side(tokens, 'Day')}${side({ ...tokens, ...tokens.dark }, 'Night')}<p style="grid-column:1/-1;margin:0;padding:8px 20px;font:13px system-ui">Faces: ${tokens.fonts ? `headings ${tokens.fonts.heading[0]}, text ${tokens.fonts.body[0]}` : 'none proposed (the device\'s own)'}</p></body></html>`)
  const shot = await page.screenshot({ fullPage: true })
  await page.close()
  return shot
}

/** The judge's word on a kit: whether its palette and its faces are the brand's. @param {any} judge @param {Brand} brand @param {string} material @param {Buffer} picture @param {Buffer} kit @param {string} words */
async function judging({ brain, apiKey, body }, brand, material, picture, kit, words) {
  const what = { logo: 'its logo', guide: 'its brand guide', site: 'a screenshot of its website' }[material]
  const content = `A brand gave ${what} (the first picture${words ? ', whose words follow' : ''}). From it alone, without reading it as a person would, an assistant proposed a design system: its colours by day and by night, the faces for its headings and its text, its logo (the second picture). Colours for words may be made darker by day, or lighter by night, than the brand's own so that words read at WCAG AA: that is expected and right.${words ? `\n\nThe guide's words:\n"""\n${words.slice(0, 4000)}\n"""` : ''}

Say as one JSON object, and nothing else:
- "palette": true if the proposed colours are the brand's own: its main colour is the brand's main or second colour, or a readable shade of one; nothing in it is foreign to the brand; false otherwise.
- "faces": true if the faces proposed are those the material names; false if they are others, or none where the material names some; null if the material names none.
- "why": what decided it, in twelve words at most.`
  /** @type {import('../app/core/types.js').ChatMessage[]} */
  const messages = [{ role: 'user', content, documents: [{ name: `${material}.png`, text: '', images: [{ mimeType: 'image/png', data: picture.toString('base64') }] }, { name: 'proposed.png', text: '', images: [{ mimeType: 'image/png', data: kit.toString('base64') }] }] }]
  /** @type {typeof fetch} */
  const fetch = (url, init) => globalThis.fetch(url, body && typeof init?.body === 'string' ? { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...body }) } : init)
  let text = ''
  for await (const event of streamChat({ brain, apiKey, messages, maxTokens: 1024, fetch })) if (event.type === 'text') text += event.delta
  const said = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? 'null')
  if (!said) throw new Error(`the judge wrote no JSON: ${text.slice(0, 200)}`)
  return { palette: !!said.palette, faces: said.faces === null || said.faces === undefined ? null : !!said.faces, why: String(said.why ?? '') }
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env */
async function main(argv, env) {
  const flag = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const langs = flag('--lang')?.split(','), only = flag('--only')?.split(',') ?? ['logo', 'guide', 'site']
  const judge = env.JUDGE ? await chooseBrain({ named: env.JUDGE, address: env.JUDGE_ADDRESS, env }) : null
  if (judge && 'needs' in judge) throw new Error(`name ${judge.needs}'s model: ${judge.needs}:<model>`)
  const judged = judge ? { ...judge, body: env.JUDGE_BODY ? JSON.parse(env.JUDGE_BODY) : undefined } : null
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch(), app = await serveApp(), page = await browser.newPage()
  await page.goto(app.origin)
  console.log(`brands: ${BRANDS.filter((brand) => !langs || langs.includes(brand.lang)).length} brands × ${only.join(', ')}${judged ? `, judged by ${judged.brain.model}` : ', no judge'}`)
  /** @type {Run[]} */
  const runs = []
  try {
    for (const brand of BRANDS.filter((one) => !langs || langs.includes(one.lang))) {
      const material = await materialOf(browser, brand)
      for (const kind of only) {
        const file = material[/** @type {'logo' | 'guide' | 'site'} */ (kind)], out = `${DIR}.cache/${brand.id}-${kind}/`
        await mkdir(out, { recursive: true })
        await writeFile(`${out}${file.name}`, file.bytes)
        /** @type {Run} */
        let run
        try {
          const kit = await page.evaluate(async ({ name, bytes }) => {
            const { proposal, unreadable } = await import('/caps/slides/brand.js'), proposed = await proposal([{ name, bytes: new Uint8Array(bytes) }])
            return { ...proposed, aa: unreadable(proposed.tokens) }
          }, { name: file.name, bytes: [...file.bytes] })
          const { tokens } = kit, picture = await drawKit(browser, tokens, brand)
          await writeFile(`${out}kit.json`, JSON.stringify(kit, null, 1))
          await writeFile(`${out}kit.png`, picture)
          const all = [tokens.primary, tokens.soft, tokens.dark?.primary, ...(tokens.series ?? [])].filter(Boolean)
          run = { brand: brand.id, lang: brand.lang, material: kind, aa: kit.aa, primary: tokens.primary, palette: brands(tokens.primary, brand, tokens.paper), present: all.some((colour) => far(colour, brand.primary.toLowerCase()) < 0.05),
            ...(kind === 'guide' && { faces: tokens.fonts?.heading[0] === brand.heading && tokens.fonts?.body[0] === brand.body }), ...(kind !== 'site' && { logo: !!tokens.logo }), ...(tokens.fonts && { fonts: `${tokens.fonts.heading[0]} / ${tokens.fonts.body[0]}` }) }
          if (judged) {
            const words = kind === 'guide' ? (brand.guide === 'pdf' ? '' : (await extractPages(file.name, new Uint8Array(file.bytes)))?.join('\n') ?? '') : ''
            run.judged = await judging(judged, brand, kind, file.picture, picture, words).catch((error) => ({ palette: false, faces: null, why: `the judge failed: ${error.message ?? error}` }))
          }
        } catch (error) {
          run = { brand: brand.id, lang: brand.lang, material: kind, aa: [], primary: '', palette: false, present: false, error: error instanceof Error ? error.message : String(error) }
        }
        runs.push(run)
        await writeFile(`${out}run.json`, JSON.stringify(run, null, 1))
        console.log(`  ${brand.id} ${brand.lang} ${kind}: ${cell(run)}`)
      }
    }
  } finally {
    await browser.close()
    app.close()
    await judge?.close?.()
  }
  const text = report(runs, judged?.brain.model)
  console.log(`\n${text}`)
  if (argv.includes('--write')) await writeFile(`${DIR}results.md`, text)
}

/** A run in a few characters. @param {Run} run */
const cell = (run) => (run.error ? `— ${run.error.slice(0, 60)}` : `${run.aa.length ? `✗ AA ${run.aa.join(' ')}` : '✓ AA'} · ${run.palette ? '✓' : '✗'} palette ${run.primary}${run.faces === undefined ? '' : ` · ${run.faces ? '✓' : '✗'} faces ${run.fonts ?? 'none'}`}${run.logo === undefined ? '' : run.logo ? ' · logo' : ' · no logo'}${run.judged ? ` · judge: palette ${run.judged.palette ? '✓' : '✗'}${run.judged.faces === null ? '' : `, faces ${run.judged.faces ? '✓' : '✗'}`}` : ''}`)

/** The results: how often each kit reads at AA, and its palette and faces match, by the brand's truth and by the judge. @param {Run[]} runs @param {string} [judge] */
function report(runs, judge) {
  const of = (/** @type {Run[]} */ list, /** @type {(run: Run) => boolean | undefined} */ test) => `${list.filter(test).length} of ${list.length}`
  const guides = runs.filter((run) => run.faces !== undefined), named = runs.filter((run) => run.judged && run.judged.faces !== null), judgedRuns = runs.filter((run) => run.judged)
  const kinds = ['logo', 'guide', 'site'].map((kind) => [kind, runs.filter((run) => run.material === kind)]).filter(([, list]) => list.length)
  return `# A design system from the person's material: results

What \`npm run brands\` measured on ${new Date().toISOString().slice(0, 10)} (D740): ${new Set(runs.map((run) => run.brand)).size} brands made up for it, two in each of English, French, Arabic and Japanese (test/brands/fixtures.js), each as its logo, its brand guide (four as a PDF, four as a Word file) and a screenshot of its site; Jean's own module proposed a kit from each, with no brain. ${judge ? `The judge was ${judge}.` : 'Nothing was judged.'}

- **AA by day and by night**: ${of(runs, (run) => !run.error && !run.aa.length)} kits.
- **Palette, against the brand's own colours** (its main colour the brand's first or second, or one deepened at its hue where it didn't read): ${of(runs, (run) => run.palette)}; the brand's first colour somewhere in the kit, as it is: ${of(runs, (run) => run.present)}.${judgedRuns.length ? `\n- **Palette, by the judge**: ${of(judgedRuns, (run) => run.judged?.palette)}.` : ''}
- **Faces, against those the guide names**: ${of(guides, (run) => run.faces)} guides.${named.length ? ` By the judge, where it saw faces named: ${of(named, (run) => run.judged?.faces ?? false)}.` : ''}
- **Logo found**: ${of(runs.filter((run) => run.logo !== undefined), (run) => run.logo)} logos and guides.

By material: ${kinds.map(([kind, list]) => `${kind}, palette ${of(/** @type {Run[]} */ (list), (run) => run.palette)}${judgedRuns.length ? ` (judge ${of(/** @type {Run[]} */ (list), (run) => run.judged?.palette)})` : ''}`).join('; ')}.

| Brand | Language | Material | AA | Main colour | Palette | Faces | Logo | Judge |
|---|---|---|---|---|---|---|---|---|
${runs.map((run) => `| ${run.brand} | ${run.lang} | ${run.material} | ${run.error ? '—' : run.aa.length ? `✗ ${run.aa.join(', ')}` : '✓'} | ${run.primary} | ${run.palette ? '✓' : '✗'} | ${run.faces === undefined ? '' : `${run.faces ? '✓' : '✗'} ${run.fonts ?? 'none'}`} | ${run.logo === undefined ? '' : run.logo ? '✓' : '✗'} | ${run.judged ? `${run.judged.palette ? '✓' : '✗'}${run.judged.faces === null ? '' : run.judged.faces ? ' ✓' : ' ✗'} ${run.judged.why}` : ''} |`).join('\n')}
`
}

await main(process.argv.slice(2), process.env)
