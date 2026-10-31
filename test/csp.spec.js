// The pages' policies (D326): what Jean does refuses nothing in any engine. Jean is served here with
// each page's own policy again as a report-only header (scripts/serve.js --csp-reports), so the
// browser itself says what its policy blocks, Trusted Types included, in every frame: the room, the
// sandbox where code runs, the frame of a page an answer holds, the check page, the privacy policy and
// the terms. With the smoke tests
// in Chromium and WebKit; in Firefox and Chrome too with npm run csp (test/browsers.config.js).
import { test, expect } from '@playwright/test'
import { start, connectFakeBrain, ask, openSettings, closeSettings } from './helpers.js'
import { line, expected } from './fixtures/csp.js'

const CSP_SERVER = 'http://127.0.0.1:4184/'

test.use({ baseURL: CSP_SERVER })

test('nothing Jean does is refused by its own policies: the room, an answer, a page in it, the sandbox, Python, the check page, the site’s, the privacy policy and the terms', async ({ page, context, browserName }, info) => {
  test.setTimeout(180_000)
  // The cookie names this run's reports (scripts/serve.js), apart from other browsers' at the same time.
  const from = `${info.project.name}-${Date.now()}`
  await context.addCookies([{ name: 'csp', value: from, url: CSP_SERVER }])
  /** What the console says the policy refused, in browsers whose reports don't cover workers. @type {string[]} */
  const said = []
  page.on('console', (message) => { if (/Content[ -]Security[ -]Policy|Refused to|TrustedHTML|TrustedScript/i.test(message.text())) said.push(message.text()) })
  // Not Jean's: Playwright's WebKit since build 2370 refuses every <select> a style attribute it doesn't have, on a bare page too, and
  // neither its reports nor its console name the element. So there the page itself says which style attributes count.
  const selects = browserName === 'webkit'
  if (selects) await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => {
    if (event.violatedDirective !== 'style-src-attr' || (event.target instanceof HTMLSelectElement && !event.target.hasAttribute('style'))) return
    console.error(`Refused to apply a style attribute on ${/** @type {Node} */ (event.target).nodeName}`)
  }))
  await start(page)
  // On a new task, the line under the box links to where files go, the privacy policy and the terms, in Jean's language.
  await expect(page.locator('.legal a[href="files"]')).toHaveText('Where your files go')
  await expect(page.locator('.legal a[href="privacy"]')).toHaveText('Privacy')
  await expect(page.locator('.legal a[href="terms"]')).toHaveText('Terms')
  const reports = async () => /** @type {any[]} */ (await (await page.request.get(`csp-reports?from=${from}`)).json())
  const lines = async () => (await reports()).map(line)
  // A refusal on purpose first, a picture from plain HTTP (img-src): its report says this browser reports at all.
  await page.evaluate(() => { new Image().src = 'http://127.0.0.1:9/canary.png' })
  await expect.poll(async () => (await lines()).some((line) => line.includes('canary'))).toBe(true)

  await connectFakeBrain(page)
  // An answer drawn from Markdown, through lit-html under Trusted Types.
  await ask(page, 'Compare the phone plans')
  await expect(page.locator('.msg-jean:not(.is-streaming) .prose .table.is-compare')).toBeVisible()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  // A page in the answer, in a frame of the preview's kind, charting with the ECharts Jean lends it (D289).
  await ask(page, 'Make me a sales explorer')
  await expect(page.locator('.msg-jean app-page iframe').last().contentFrame().locator('#chart canvas')).toBeVisible()
  await expect(page.locator('.msg-jean.is-streaming')).toHaveCount(0)
  // The sandbox: a script works the plan out, and its page opens beside the conversation (D163).
  await page.keyboard.press('ControlOrMeta+Shift+O')
  await page.locator('.starter', { hasText: 'Savings plan' }).click()
  await page.locator('#prompt').press('Enter')
  await page.locator('.msg-jean .approval .button.primary').click({ timeout: 30_000 })
  await expect(page.frameLocator('app-preview iframe').locator('#total')).toHaveText('After 10 years: 29450', { timeout: 30_000 })
  // Python in the sandbox (Pyodide: WebAssembly, a worker made from a blob).
  const python = await page.evaluate(async () => {
    const { loaded } = await import('/ui/caps.js')
    const tool = loaded.value.get('computer')?.tools?.find((item) => item.spec.name === 'python')
    const ctx = { declared: ['python'], declare() {}, call: async () => '' }
    return tool?.run({ code: 'import statistics\nstatistics.mean([1, 2, 3, 4])' }, /** @type {any} */ (ctx))
  })
  expect(String(python)).toContain('2.5')
  // Settings, with its lazily loaded sections.
  await openSettings(page, 'Appearance')
  await closeSettings(page)
  // The check page, where a certificate is checked (D274).
  await page.goto('check')
  await expect(page.locator('body')).not.toBeEmpty()
  await page.waitForLoadState('networkidle')
  // The page that checks the site, its policy and how its server sends Jean (D415).
  await page.goto('policy.html')
  await expect(page.locator('.site-list li').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  // The privacy policy and the terms, at their addresses without .html, each language at its own (D438), with the person's look.
  await page.goto('privacy')
  await expect(page.locator('main h1')).toHaveText('Privacy policy')
  await expect(page.locator('html')).toHaveAttribute('data-look', 'tilde')
  await page.goto('fr/terms')
  await expect(page.locator('main h1')).toHaveText('Conditions d’utilisation')
  await expect(page.locator('html')).toHaveAttribute('data-look', 'tilde')
  await page.goto('files')
  await expect(page.locator('main h1')).toHaveText('Where your files go')
  await page.waitForLoadState('networkidle')

  // Reports come a moment after what they report.
  await page.waitForTimeout(1000)
  const fromSelect = (/** @type {string} */ line) => selects && (/: style-src-attr inline /.test(line) || /^(\[Report Only\] )?Refused to apply a stylesheet because/.test(line))
  expect([...await lines(), ...said].filter((line) => !line.includes('canary') && !expected(line) && !fromSelect(line))).toEqual([])
})
