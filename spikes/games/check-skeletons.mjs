import { readFile } from 'node:fs/promises'
import { chromium, webkit } from '../../node_modules/playwright/index.mjs'
import { playtest } from './playtest.mjs'
for (const type of [chromium, webkit]) {
  const browser = await type.launch(), page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? 4290}/parent.html`); await page.waitForFunction(() => window.ready)
  for (const [file, engine, lang] of [['skeleton', 'phaser', 'en'], ['skeleton', 'phaser3', 'en'], ['canvasskel', 'none', 'en'], ['syntax', 'none', 'en']]) {
    const code = await readFile(`games/${file}.mjs`, 'utf8')
    const t = Date.now(), r = await playtest(page, { code, engine, lang })
    console.log(`\n== ${type.name()} ${file} on ${engine} (${Date.now() - t} ms)\n${r.text}`)
  }
  await browser.close()
}
