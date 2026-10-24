// About Jean (D538): the page under the app's first screen (site/home/, D397) as a page of its own, with the site's top
// and foot, at jean.is/jean and in each of the homepage's languages: what the app's Vous menu and the line under a new
// task's box open in a tab of their own once the first visit is over, and the address to send someone. Its sections and
// words are the homepage's, its look home.css's. Its script makes the tiles work as the app does (app/ui/tiles.js,
// written in as it is), hands a Try to the Jean that opened this tab and closes it, back on Jean's (or opens Jean with
// the request, ?try=, with none to hand it to), and has Open Jean close it too.
import { readFile } from 'node:fs/promises'
import { homeOf } from '../home/page.js'

const TILES = await readFile(new URL('../../app/ui/tiles.js', import.meta.url), 'utf8')
if (/^import /m.test(TILES)) throw new Error('app/ui/tiles.js imports something, so it can’t be written into About Jean’s script as it is')

/** The tiles at work, then a Try or Open Jean back in the tab that opened this one. */
const SCRIPT = `(() => {
${TILES.replace(/^export /gm, '')}
const home = document.querySelector('.home'), start = document.querySelector('.site-top .button')
tiles(home)
// The Jean that opened this tab, on this site, while it is still there.
const jean = () => { try { return opener && !opener.closed && opener.location.origin === location.origin ? opener : null } catch { return null } }
// This tab closed, back on Jean's; where a script may not close it (it was read on further), what to do instead.
const back = (app, otherwise) => { app.focus(); close(); setTimeout(otherwise, 300) }
home.addEventListener('click', (event) => {
  const button = event.target instanceof Element && event.target.closest('[data-try]')
  if (!(button instanceof HTMLElement)) return
  const app = jean()
  if (!app) return location.assign(start.href + '?try=' + button.dataset.try)
  app.postMessage({ try: button.dataset.try, ask: button.closest('.home-tile')?.querySelector('.home-request')?.textContent ?? '' }, location.origin)
  back(app, () => { document.querySelector('.home-sent').hidden = false })
})
start.addEventListener('click', (event) => {
  const app = jean()
  if (app) { event.preventDefault(); back(app, () => location.assign(start.href)) }
})
})()
`

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'jean', ar: 'ar/jean', fr: 'fr/jean', ja: 'ja/jean', ko: 'ko/jean' },
  words: 'home',
  style: 'home',
  main: (kit) => /* html */ `${homeOf(kit, { alone: true })}
<p class="home-sent" role="status" hidden>${kit.say('sent')}</p>`,
  script: SCRIPT,
}
