// Help: its words say none of the words the app never says, every article's Show me has its tour in each of
// its languages, and each stop points at a part of Jean by one of the app's strings, which test/help.spec.js finds
// on the screen; site/help/help.js stops the build where an article names a string the app lacks.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BRAND } from '../app/brand.js'
import { appWords, buildSite, sitePages } from '../site/site.js'

const HELP = new URL('../site/help/', import.meta.url)

test('help’s words never say agent, model, MCP or token, in any language', async () => {
  for (const folder of ['', ...(await readdir(HELP, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => `${entry.name}/`)]) {
    for (const file of (await readdir(new URL(folder, HELP))).filter((name) => name.endsWith('.json'))) {
      const words = await readFile(new URL(`${folder}${file}`, HELP), 'utf8')
      assert.doesNotMatch(words, /\b(agents?|models?|MCP|tokens?)\b/i, `site/help/${folder}${file}`)
    }
  }
})

test('every article with Show me has its tour in each of its languages, each stop pointing by one of the app’s strings', async () => {
  const site = await buildSite({ brand: BRAND })
  const english = await appWords('en')
  const articles = [...await sitePages()].filter(([name]) => name.startsWith('help/'))
  assert.ok(articles.length >= 3)
  for (const [name, page] of articles) {
    const { open } = /** @type {any} */ (page)
    if (!open) continue
    for (const lang of Object.keys(page.addresses)) {
      const path = `help/${name.split('/')[1]}.${lang}.json`
      assert.ok(site.files[path], `${name}: ${path}`)
      const tour = JSON.parse(site.files[path])
      assert.equal(tour.open, open, path)
      assert.ok(tour.stops.length, `${path}: its stops`)
      for (const stop of tour.stops) {
        assert.ok(stop.on && stop.say, `${path}: a stop points somewhere and says something`)
        if (stop.named) assert.ok(english[stop.named], `${path}: ${stop.named} is one of the app’s strings`)
        assert.doesNotMatch(stop.say, /\{\w+\}/, `${path}: its words are filled`)
      }
    }
  }
})
