// The page that plays Jean's reels (D687, docs/reels.md), at /watch and /fr/regarder: short videos of Jean at work, each
// Jean itself playing real tasks again in the reader's language, the first above the others. Beside itself, in each
// language, it writes every reel and its tasks (reels.js), and the player: reel.html, a document of its own as
// demo.html is, framed here and by any page of the site, its code and look under reels/, its import map naming
// app/'s files, served at the site's root, as '#app/'. Its words are <lang>.json, the player's and the reels' with the
// page's; its look watch.css, over site.css (site/site.js, D438).
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { FELT, WAVE, glyph, underline, xml } from '../site.js'
import { NAMES, reelFiles } from './reels.js'

const HERE = new URL('.', import.meta.url)
/** The player's code and look, as the site serves them. */
const CODE = Object.fromEntries(await Promise.all(['reel.js', 'schedule.js', 'score.js', 'reel.css'].map(async (file) => [`reels/${file}`, await readFile(new URL(file, HERE), 'utf8')])))
/** demo.html's first line, which reads the look and light or dark from the address before anything is drawn, then the viewer's, then the system's: an export asks for one. */
const FIRST = /<script>([\s\S]*?)<\/script>/.exec(await readFile(new URL('../../app/demo.html', import.meta.url), 'utf8'))?.[1]
if (!FIRST) throw new Error('app/demo.html has no first line')
const MAP = JSON.stringify({ imports: { '#app/': './' } })
const hash = (/** @type {string} */ script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`

/** One of the app's glyphs, named for the player. @param {string} name @param {Parameters<typeof glyph>[0]} [from] */
const own = (name, from = /** @type {any} */ (name)) => glyph(from).replace('<svg ', `<svg data-icon="${name}" `)
/** A glyph only the player draws, in the app's grid and pen (docs/design.md#icons). @param {string} name @param {string} body */
const drawn = (name, body, extra = '', box = '0 0 24 24') => /* html */ `<svg data-icon="${name}" class="icon${extra}" viewBox="${box}" width="24" height="24" fill="none" stroke="currentColor" aria-hidden="true">${body}</svg>`
/** What the player draws: the app's glyphs where it means what they mean, and pause, sound off, leaving full screen, the pointer, a tick, and the mark: icons/icon.svg's tilde, its box round its pen's round ends. */
const GLYPHS = [
  own('play'), own('retry'), own('speaker'), own('fullscreen'), own('language'), own('check'), own('lock'),
  drawn('pause', '<rect x="6.5" y="5.5" width="3.5" height="13" rx="1.5"/><rect x="14" y="5.5" width="3.5" height="13" rx="1.5"/>'),
  drawn('muted', '<path d="M4.5 9.5v5h3l4.5 4v-13l-4.5 4Z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>', ' flip-rtl'),
  drawn('shrink', '<path d="M9 4.5V7a2 2 0 0 1-2 2H4.5M15 4.5V7a2 2 0 0 0 2 2h2.5M19.5 15H17a2 2 0 0 0-2 2v2.5M4.5 15H7a2 2 0 0 1 2 2v2.5"/>'),
  drawn('pointer', '<path d="M5 3.5v16.8l4.3-4.1 2.9 6.6 3-1.3-2.9-6.5h6Z"/>'),
  drawn('wave', '<path pathLength="1" d="M112 256q72-112 144 0t144 0"/>', '', '84 172 344 168'),
  drawn('tick', '<path pathLength="1" d="m5 12.5 4.5 4.5L19 7.5"/>'),
]

/**
 * The player, the same in every language, which reads its reel and language from its address: its policy runs
 * demo.html's first line, its import map and its own modules, and frames demo.html; kept out of search results.
 * @param {import('../site.js').Kit} kit
 */
const player = (kit) => /* html */ `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' ${hash(FIRST)} ${hash(MAP)}; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<script>${FIRST}</script>
<meta name="referrer" content="no-referrer">
<title>${xml(kit.brand.name)}</title>
<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="ui/style.css">
<link rel="stylesheet" href="reels/reel.css">
<script type="importmap">${MAP}</script>
<script type="module" src="reels/reel.js"></script>
</head>
<body><main id="main" class="reel"></main>
<template id="reel-icons">${GLYPHS.join('')}</template>
</body>
</html>
`

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'watch', fr: 'fr/regarder', ar: 'ar/watch', ja: 'ja/watch' },
  frames: true,
  files: (kit) => Object.assign({ 'reel.html': player(kit), ...CODE }, ...NAMES.map((name) => reelFiles(kit, name))),
  main (kit) {
    const say = (/** @type {string} */ key) => kit.say(key)
    /** A reel, framed where it plays: in this page's language, full screen allowed, loaded once near. @param {string} name */
    const frame = (name) => /* html */ `<div class="wch-player"><iframe src="${kit.site('reel.html')}#${new URLSearchParams({ reel: name, lang: kit.lang })}" title="${say(`${name}.title`)}" allow="fullscreen; autoplay" loading="lazy"></iframe></div>`
    const [first, ...rest] = NAMES
    return /* html */ `<section class="site-hero wch-hero" aria-labelledby="wch-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="wch-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
  </div>
  <figure class="wch-first">
    ${frame(first)}
    <figcaption><strong>${say(`${first}.title`)}</strong> ${say(`${first}.about`)}</figcaption>
  </figure>
</section>

<section class="site-section is-side" aria-labelledby="wch-more">
  <header><h2 id="wch-more">${say('more.title')}</h2><p class="site-why">${say('more.why')}</p></header>
  <div class="wch-reels">${rest.map((name) => /* html */ `
    <article aria-labelledby="wch-${name}">
      ${frame(name)}
      <h3 id="wch-${name}">${say(`${name}.title`)}</h3>
      <p>${say(`${name}.about`)}</p>
    </article>`).join('')}
  </div>
</section>

<section class="site-section site-end" aria-labelledby="wch-end">
  ${WAVE}
  <h2 id="wch-end">${say('end.title')}</h2>
  <p class="site-why">${say('end.why')}</p>
  <p class="site-cta">${FELT.point}<a class="button primary" href="${kit.start}">${say('end.cta')}</a></p>
</section>`
  },
}
