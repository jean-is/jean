// jean.is's own page, under the app's first screen (D397): what Jean is, for a first visit, as static
// HTML and CSS after the app's root, which build:web writes into index.html and into one page per
// language beside it, <lang>.html, served at /<lang> as /privacy is, so that every address in it and in
// the app resolves against the site's root as at /; each names the others for search engines
// (hreflang), and the app speaks its language there unless the person chose one. Only the site whose
// address is the brand's own domain has it: never app/, an organisation's copy or the desktop app. The
// app shows it before any task, in a browser's tab, and takes it away with the first request (ui/shell.js,
// ui/home.js). Its words are scripts/home/<lang>.json, English's first, a page for each language that
// has one, with the app's own catalogues where the app already says the same (the sample request, the
// receipt, the legal links), and its look scripts/home/home.css, over the app's style sheet and tokens.
// `node scripts/serve.js --home` (npm run dev:home) serves it as jean.is's deploy does.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES, dir, languageName } from '../app/core/i18n.js'
import { xml } from './desktop.js'
import { shotsOf } from './manifest.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOME = join(ROOT, 'scripts', 'home')
const APP = join(ROOT, 'app')

/** @typedef {Record<string, string | string[] | string[][]>} Words */

/** Whether the site at `base` is the brand's own, the one site with the page. @param {string} base @param {{ domain: string }} brand */
export const ownSite = (base, brand) => new URL(base).host === brand.domain

/** The languages with a page, English first: one file of words each in scripts/home/. */
export async function homeLanguages () {
  const langs = (await readdir(HOME)).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length))
  return ['en', ...langs.filter((lang) => lang !== 'en').sort()]
}

/** A language's words for the page. @param {string} lang @returns {Promise<Words>} */
export const homeWords = async (lang) => JSON.parse(await readFile(join(HOME, `${lang}.json`), 'utf8'))

/** The page's style sheet. */
export const homeStyle = () => readFile(join(HOME, 'home.css'), 'utf8')

/** The app's own words the page repeats, in a language, English's where it has none (as t() does). */
const APP_WORDS = [['', ['starter.sample.prompt', 'welcome.files', 'welcome.privacy', 'welcome.terms', 'cap.memory.offer', 'cap.memory.yes', 'offer.no', 'action.copy', 'composer.placeholder', 'settings.language']],
  ['receipt', ['receipt.inCloud', 'receipt.certificate']], ['first', ['first.free']]]

/** @param {string} lang @returns {Promise<Record<string, string>>} */
export async function appWords (lang) {
  /** @type {Record<string, string>} */
  const words = {}
  for (const [part, keys] of APP_WORDS) {
    for (const code of ['en', lang]) {
      const catalogue = JSON.parse(await readFile(join(APP, 'locales', part, `${code}.json`), 'utf8').catch(() => '{}'))
      for (const key of keys) if (typeof catalogue[key] === 'string') words[key] = catalogue[key]
    }
  }
  return words
}

/**
 * The sample spreadsheet's answer, which its tile and its replay say: the product that grew the most
 * from its first month to its last, and by how much, with how many products and months it reads.
 */
export async function sampleAnswer () {
  const rows = (await readFile(join(APP, 'caps', 'files', 'sales.csv'), 'utf8')).trim().split('\n').slice(1).map((line) => line.split(','))
  const months = [...new Set(rows.map(([month]) => month))].sort()
  const products = [...new Set(rows.map((row) => row[1]))]
  const units = (/** @type {string | undefined} */ month, /** @type {string} */ product) => Number(rows.find((row) => row[0] === month && row[1] === product)?.[2])
  const [best] = products.map((product) => ({ product, growth: units(months.at(-1), product) / units(months[0], product) - 1 })).sort((a, b) => b.growth - a.growth)
  return { ...best, products: products.length, months: months.length }
}

/** A text with its {params} filled. @param {string} text @param {Record<string, string>} params */
const fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, key) => params[key] ?? whole)

const ICONS = {
  file: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/></svg>',
  chart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19.5V11M10 19.5V6M15 19.5v-6M20 19.5V9"/></svg>',
  brain: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M7.5 12.5c1.5-2.4 3-2.4 4.5 0s3 2.4 4.5 0"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l7 2.5v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>',
  down: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>',
  plus: '<svg class="icon is-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg class="icon is-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
}
const ARROW = '<span class="flip-rtl" aria-hidden="true">→</span>'

/** The tiles' pictures, drawn until each is a capture of its request done in that language. */
const MUSIC = `<svg viewBox="0 0 200 100" aria-hidden="true"><path class="home-staff" d="M10 30H190M10 40H190M10 50H190M10 60H190M10 70H190"/>${
  [[38, 65], [72, 55], [106, 45], [140, 50], [172, 60]].map(([x, y], i) => `<ellipse class="home-note-head${i === 2 ? ' is-lit' : ''}" cx="${x}" cy="${y}" rx="6.5" ry="5" transform="rotate(-20 ${x} ${y})"/><path class="home-note-stem${i === 2 ? ' is-lit' : ''}" d="M${x + 6} ${y - 1}V${y - 29}"/>`).join('')}</svg>`
const MAP = '<svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path class="home-road" d="M-10 40C40 30 70 60 120 50S200 20 220 30M30-10C40 40 20 80 50 140M150-10C140 50 170 90 150 140M-10 100C60 90 120 110 220 95"/><path class="home-route" d="M44 104C40 70 70 52 104 52S152 30 150 70 120 104 92 100"/><circle class="home-start" cx="44" cy="104" r="5.5"/><circle class="home-end" cx="92" cy="100" r="5.5"/></svg>'

/**
 * The page, in one language.
 * @param {Words} words  scripts/home/<lang>.json
 * @param {Record<string, string>} app  appWords()'s, in the same language
 * @param {{ lang: string, dir: string, brand: { name: string, domain: string }, sample: Awaited<ReturnType<typeof sampleAnswer>> }} context
 */
export function homeOf (words, app, { lang, dir, brand, sample }) {
  const params = { name: brand.name, domain: brand.domain, free: app['first.free'] ?? '' }
  /** One of the page's strings, filled and escaped. @param {string} key @param {Record<string, string>} [more] */
  const say = (key, more = {}) => {
    const text = words[key]
    if (typeof text !== 'string') throw new Error(`scripts/home/${lang}.json: ${key} is missing or not a string`)
    return xml(fill(text, { ...params, ...more }))
  }
  /** @param {string} key @returns {string[]} */
  const list = (key) => {
    const items = words[key]
    if (!Array.isArray(items)) throw new Error(`scripts/home/${lang}.json: ${key} is missing or not a list`)
    return items.map((item) => xml(fill(String(item), params)))
  }
  const appSays = (/** @type {string} */ key) => xml(app[key] ?? '')
  const [open, close] = say('quote').split('{text}')
  const quoted = (/** @type {string} */ text) => `${open}<span class="home-request">${text}</span>${close}`
  const growth = new Intl.NumberFormat(lang, { style: 'percent', signDisplay: 'exceptZero' }).format(sample.growth)
  const grew = say('replay.grew', { product: '\u0000', growth }).replace('\u0000', `<bdi>${xml(sample.product)}</bdi>`)
  const file = `<span class="home-file" dir="ltr">${ICONS.file}sales.csv</span>`
  const tryIt = (/** @type {string} */ key, primary = false) => `<button type="button" class="button${primary ? ' primary' : ''}" data-try="${key}">${say(key === 'sample' ? 'tile.tryFile' : 'tile.try')}</button>`
  const tile = (/** @type {string} */ group, /** @type {string} */ ask, /** @type {string} */ art, /** @type {string} */ go, open = false) => `
    <li class="home-tile${open ? ' is-open' : ''}" data-for="${group}">
      <span class="home-where">${say(`range.${group}`)}</span>
      <p class="home-ask">${ask}</p>
      ${art}
      <p class="home-go">${go}</p>
    </li>`
  const more = (/** @type {string} */ label, /** @type {string[]} */ items, dots = false) => `<details><summary>${label}${ICONS.down}</summary><ul${dots ? ' class="home-dots"' : ''}>${items.map((item) => `<li>${item}</li>`).join('')}</ul></details>`
  const door = (/** @type {string} */ id, /** @type {string} */ key, /** @type {string} */ body, featured = false) => `
      <article id="home-${id}" class="home-door${featured ? ' is-featured' : ''}" aria-labelledby="home-${id}-title">
        <p class="home-door-name">${say(`${key}.name`)}</p>
        <p class="home-door-why">${say(`${key}.why`)}</p>
        <h3 id="home-${id}-title" class="home-door-title">${say(`${key}.title`)}</h3>
        ${body}
      </article>`
  const go = (/** @type {Array<[string, string]>} */ links) => `<p class="home-door-go">${links.map(([href, label]) => `<a href="${href}">${label} ${ARROW}</a>`).join('')}</p>`
  const person = (/** @type {string} */ who, /** @type {string} */ how) => `<li><i aria-hidden="true">${xml([...fill(String(words[who]), params)][0] ?? '')}</i><span><b>${say(who)}</b><small>${say(how)}</small></span></li>`
  return `<div class="home" lang="${lang}" dir="${dir}">
  <nav class="home-strip" aria-labelledby="home-for">
    <span id="home-for" class="home-strip-label">${say('strip.label')}</span>
    <a class="button" href="#home-range">${say('strip.home')}</a><a class="button" href="#home-family">${say('strip.family')}</a><a class="button" href="#home-range">${say('strip.work')}</a><a class="button" href="#home-open">${say('strip.it')}</a><a class="button" href="#home-open">${say('strip.developer')}</a>
  </nav>
  <section id="home-range" class="home-section" aria-labelledby="home-range-title">
    <header class="home-head is-centred">
      <p class="home-why">${say('range.why')}</p>
      <h2 id="home-range-title" class="home-title">${say('range.title')}</h2>
      <p class="home-sub">${say('range.sub')}</p>
    </header>
    <dl class="home-formats">
      <div><dt>${say('range.in')}</dt><dd><ul>${list('range.ins').map((word) => `<li>${word}</li>`).join('')}</ul></dd></div>
      <div><dt>${say('range.out')}</dt><dd><ul>${list('range.outs').map((word) => `<li>${word}</li>`).join('')}</ul></dd></div>
    </dl>
    <fieldset class="home-filter">
      <legend class="visually-hidden">${say('strip.label')}</legend>
      ${['all', 'home', 'family', 'work'].map((group) => `<input type="radio" name="home-for" id="home-for-${group}"${group === 'all' ? ' checked' : ''}><label for="home-for-${group}">${say(`range.${group}`)}</label>`).join('')}
    </fieldset>
    <ul class="home-tiles">${[
      tile('work', `${file} ${quoted(appSays('starter.sample.prompt'))}`, `<div class="home-art" aria-hidden="true"><span class="home-bars"><i></i><i></i><i></i><i></i></span><span class="home-badge">${grew}</span></div>`, `${tryIt('sample', true)}<a href="#home-how">${say('tile.how')}</a>`, true),
      tile('family', quoted(say('tile.music')), `<div class="home-art">${MUSIC}</div>`, tryIt('music')),
      tile('family', quoted(say('tile.quiz')), `<div class="home-art" aria-hidden="true"><span class="home-quiz"><b>${say('tile.quiz.question')}</b>${list('tile.quiz.answers').map((answer) => `<span>${answer}</span>`).join('')}</span></div>`, tryIt('quiz')),
      tile('home', quoted(say('tile.map')), `<div class="home-art is-map">${MAP}</div>`, tryIt('map')),
    ].join('')}
    </ul>
    <ol id="home-how" class="home-replay" aria-label="${say('tile.how')}">
      <li><span class="home-step">${say('replay.ask')}</span><p class="home-asked" dir="auto">${file}<span>${appSays('starter.sample.prompt')}</span></p></li>
      <li><span class="home-step">${say('replay.work')}</span><ul class="home-ticks"><li>${say('replay.read')}</li><li>${say('replay.calculated')}</li><li>${say('replay.drew')}</li></ul></li>
      <li><span class="home-step">${say('replay.get')}</span><p>${grew}</p><span class="home-file">${ICONS.chart}${say('replay.chart')}</span></li>
      <li><span class="home-step">${say('replay.where')}</span><p class="home-receipt"><b>${ICONS.brain}${appSays('receipt.inCloud')}</b><span>${say('replay.sent', { host: '\u0000' }).replace('\u0000', '<bdi>openrouter.ai</bdi>')}</span><span>${appSays('receipt.certificate')} ✓</span></p>${tryIt('sample', true)}</li>
    </ol>
  </section>
  <section id="home-why" class="home-section is-side" aria-labelledby="home-why-title">
    <header class="home-head">
      <h2 id="home-why-title" class="home-title">${say('why.title')}</h2>
      <p class="home-sub">${say('why.sub')}</p>
    </header>
    <div class="home-doors">${[
      door('confidential', 'confidential', `<dl class="home-versus"><div><dt>${say('confidential.mostLabel')}</dt><dd>${say('confidential.most')}</dd></div><div><dt>${say('confidential.oursLabel')}</dt><dd>${say('confidential.ours')}</dd></div></dl>
        <p class="home-sealed" aria-hidden="true"><span>${appSays('composer.placeholder')}</span><span>${ICONS.shield}${say('confidential.sealed')}</span></p>
        <p class="home-note">${say('confidential.offline')}</p>
        ${go([['files', appSays('welcome.files')]])}`, true),
      door('ai', 'ai', `<ul class="home-rows">${list('ai.ways').map((way) => `<li>${ICONS.brain}${way}</li>`).join('')}</ul>
        ${go([['compare', say('ai.go')]])}`),
      door('family', 'family', `<ul class="home-people">${person('family.younger', 'family.withYou')}${person('family.older', 'family.alone')}</ul>
        <p class="home-source">${say('family.source')}</p>
        ${go([['families', say('family.go')]])}`),
      door('simple', 'simple', `<div class="home-offer" aria-hidden="true"><p>${appSays('cap.memory.offer')}</p><span><span class="button primary">${appSays('cap.memory.yes')}</span><span class="button subtle">${appSays('offer.no')}</span></span></div>
        ${more(say('door.more'), list('simple.more'))}`),
      door('shareable', 'share', `<p class="home-link" dir="ltr" aria-hidden="true"><span>https://…#k=…</span><span class="button">${appSays('action.copy')}</span></p>
        <p class="home-note">${say('share.limits')}</p>
        ${more(say('door.more'), list('share.more'))}`),
      door('open', 'open', `<p>${say('open.text')}</p>
        ${go([['source', say('open.source')], ['it', say('open.it')]])}`),
      door('catch', 'catch', `<ul class="home-dots">${list('catch.items').map((item) => `<li>${item}</li>`).join('')}</ul>
        ${more(say('catch.more'), list('catch.rest'), true)}`),
    ].join('')}
    </div>
  </section>
  <section id="home-questions" class="home-section" aria-labelledby="home-questions-title">
    <h2 id="home-questions-title" class="home-title is-small">${say('faq.title')}</h2>
    <div class="home-questions">${/** @type {string[][]} */ (words['faq.items']).map(([question, answer], i) => `
      <details${i ? '' : ' open'}><summary>${xml(fill(question, params))}${ICONS.plus}${ICONS.minus}</summary><p>${xml(fill(answer, params))}</p></details>`).join('')}
    </div>
  </section>
  <footer class="home-foot">
    <div><p class="home-mark">${xml(brand.name)}</p><p>${say('foot.tagline')}</p><p>${say('foot.made')}</p></div>
    <nav aria-labelledby="home-foot-site"><p id="home-foot-site" class="home-foot-head">${xml(brand.name)}</p><ul>
      <li><a href="files">${appSays('welcome.files')}</a></li><li><a href="privacy">${appSays('welcome.privacy')}</a></li><li><a href="terms">${appSays('welcome.terms')}</a></li><li><a href="source">${say('open.source')}</a></li>
    </ul></nav>
    <nav aria-labelledby="home-foot-for"><p id="home-foot-for" class="home-foot-head">${say('foot.for')}</p><ul>
      <li><a href="families">${say('foot.families')}</a></li><li><a href="it">${say('foot.it')}</a></li>
    </ul>
    <label class="home-languages"><span class="visually-hidden">${appSays('settings.language')}</span><select>${LOCALES.map((code) => `
      <option value="${code}" lang="${code}"${code === lang ? ' selected' : ''}>${xml(languageName(code))}</option>`).join('')}
    </select></label></nav>
  </footer>
</div>`
}

/**
 * index.html with the page, once: in a language, which its <html> says, and which the app is asked to
 * speak at a language's own address (`app-language`); every language's address named for search
 * engines, the root's as the default; the page's style sheet after the app's; the page after the
 * app's root, which the app puts first in <body>.
 * @param {string} html  index.html, as the rest of build:web leaves it
 * @param {string} page  homeOf()'s
 * @param {{ lang: string, dir: string, own: boolean, languages: Array<{ lang: string, address: string }> }} at  `own`: the page at a language's own address
 */
export function withHome (html, page, { lang, dir, own, languages }) {
  if (html.includes('class="home"') || !html.includes('</head>') || !html.includes('</body>') || !/<html lang="en" dir="ltr"/.test(html)) throw new Error('index.html has the page already, or no <html lang="en" dir="ltr">, </head> or </body>')
  const alternates = [...languages.map((language) => `<link rel="alternate" hreflang="${language.lang}" href="${xml(language.address)}">`),
    `<link rel="alternate" hreflang="x-default" href="${xml(languages[0].address)}">`]
  const head = [...own ? [`<meta name="app-language" content="${lang}">`] : [], ...alternates, '<link rel="stylesheet" href="home.css">']
  return html.replace('<html lang="en" dir="ltr"', `<html lang="${lang}" dir="${dir}"`)
    .replace('</head>', () => `${head.join('\n')}\n</head>`)
    .replace('</body>', () => `${page}\n</body>`)
}

/**
 * index.html in another language, for its own address: its description, which the title and the cards
 * then say, in that language. @param {string} html @param {string} description
 */
export function inLanguage (html, description) {
  if (!/<meta name="description" content="[^"]*">/.test(html)) throw new Error('index.html has no description')
  return html.replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${xml(description)}">`)
}

/**
 * The site's files with the page: index.html in English, <lang>.html for each other language with
 * words, and home.css. A language's description is its install's (scripts/screenshots/<lang>.json,
 * D396), English's index.html's own.
 * @param {string} base  the site's address, siteBase()'s
 * @param {{ name: string, domain: string }} brand
 * @param {(description: string | null, address: string) => string} pageAt  index.html as the rest of the
 *   build leaves it, in a description (null: its own) and for an address
 * @returns {Promise<Record<string, string>>}
 */
export async function homeFiles (base, brand, pageAt) {
  const langs = await homeLanguages()
  const sample = await sampleAnswer()
  const languages = langs.map((lang) => ({ lang, address: lang === 'en' ? base : base + lang }))
  /** @type {Record<string, string>} */
  const files = { 'home.css': await homeStyle() }
  for (const { lang, address } of languages) {
    const page = homeOf(await homeWords(lang), await appWords(lang), { lang, dir: dir(lang), brand, sample })
    const description = lang === 'en' ? null : (await shotsOf(lang)).description ?? null
    files[lang === 'en' ? 'index.html' : `${lang}.html`] = withHome(pageAt(description, address), page, { lang, dir: dir(lang), own: lang !== 'en', languages })
  }
  return files
}
