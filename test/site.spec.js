// The site's pages (site/, D438) in a browser, as jean.is serves them (scripts/serve.js --home): axe-core finds
// nothing WCAG 2.2's A and AA ask of them, contrast included, which site/checks.js can't see from the HTML alone,
// in light and in dark, in every language each page has (Arabic's right to left and Japanese's for the homepage).
// The homepage is checked as the part of index.html it is, under the app's root, which has its own tests.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test, expect } from '@playwright/test'
import { sitePages } from '../site/site.js'

const JEAN_IS = 'http://127.0.0.1:4186/'
const AXE = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
/** What WCAG 2.2 asks at levels A and AA, as axe-core tags it. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']


for (const [name, page] of await sitePages()) {
  for (const address of Object.values(page.addresses)) {
    for (const scheme of /** @type {const} */ (['light', 'dark'])) {
      test(`/${address}, in ${scheme}: nothing WCAG 2.2 A or AA asks is missing`, async ({ page: tab }) => {
        await tab.emulateMedia({ colorScheme: scheme })
        // axe comes before the page's own scripts, as the browser's own would, since the page's policy runs no other.
        await tab.addInitScript({ content: AXE })
        await tab.goto(JEAN_IS + address)
        // The homepage once the app has shown it (ui/home.js), and only it; any other page whole, as it loads.
        const part = name === 'home' ? 'html.is-ready body > .home:not([hidden])' : 'html'
        await expect(tab.locator(name === 'home' ? part : 'body.site')).toBeVisible()
        await expect(tab.locator('html')).toHaveAttribute('data-theme', scheme)
        // A frame's page loaded too (a demo, D462): axe asks each frame, and waits a minute for one still blank.
        await expect.poll(() => tab.frames().every((frame) => frame.url() !== 'about:blank')).toBe(true)
        for (const frame of tab.frames()) await frame.waitForLoadState()
        const { violations, ran } = await tab.evaluate(async ({ part, tags }) => {
          const { violations, passes, incomplete } = await /** @type {any} */ (window).axe.run({ include: [[part]] }, { runOnly: { type: 'tag', values: tags } })
          return {
            violations: violations.map((/** @type {any} */ violation) => `${violation.id}: ${violation.nodes.slice(0, 5).map((/** @type {any} */ node) => `${node.target.join(' ')} (${node.failureSummary.replace(/\s+/g, ' ')})`).join('; ')}`),
            ran: [...passes, ...incomplete].map((/** @type {any} */ rule) => rule.id),
          }
        }, { part, tags: WCAG })
        expect(violations).toEqual([])
        expect(ran, 'contrast was checked').toContain('color-contrast')
        if (name !== 'home') expect(ran, 'and the page as a whole: its language and its title').toEqual(expect.arrayContaining(['html-has-lang', 'html-lang-valid', 'document-title']))
      })
    }
  }
}
