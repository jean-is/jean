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
import { familyAddress } from './family.js'
import { enterpriseAddress } from './enterprise.js'

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
const APP_WORDS = [['', ['starter.sample.prompt', 'starter.savings.prompt', 'welcome.files', 'welcome.privacy', 'welcome.terms', 'cap.memory.offer', 'cap.memory.yes', 'offer.no', 'action.copy', 'composer.placeholder', 'settings.language']],
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

/**
 * What the savings idea comes to (starter.savings.prompt): 200 a month for ten years at 4% a year, interest
 * added monthly; the total to the nearest ten, and what was put in.
 */
export function savingsAnswer (monthly = 200, rate = 0.04, years = 10) {
  const [month, months] = [rate / 12, years * 12]
  return { total: Math.round((monthly * ((1 + month) ** months - 1)) / month / 10) * 10, put: monthly * months }
}

/** A text with its {params} filled. @param {string} text @param {Record<string, string>} params */
const fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, key) => params[key] ?? whole)

const ICONS = {
  file: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/></svg>',
  chart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19.5V11M10 19.5V6M15 19.5v-6M20 19.5V9"/></svg>',
  brain: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M7.5 12.5c1.5-2.4 3-2.4 4.5 0s3 2.4 4.5 0"/></svg>',
  note: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  app: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17"/></svg>',
  pin: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2"/></svg>',
  tree: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M6 16v-3h12v3"/></svg>',
  table: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/></svg>',
  picture: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M20.5 16l-5-5-8 8.5"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l7 2.5v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>',
  down: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>',
  plus: '<svg class="icon is-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg class="icon is-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
}
const ARROW = '<span class="flip-rtl" aria-hidden="true">→</span>'
const TURN = '<svg class="icon flip-rtl" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

/** The tiles' pictures, drawn until each is a capture of its request done in that language. */
const MUSIC = `<svg viewBox="0 0 200 100" aria-hidden="true"><path class="home-staff" d="M10 30H190M10 40H190M10 50H190M10 60H190M10 70H190"/>${
  [[38, 65], [72, 55], [106, 45], [140, 50], [172, 60]].map(([x, y], i) => `<ellipse class="home-note-head${i === 2 ? ' is-lit' : ''}" cx="${x}" cy="${y}" rx="6.5" ry="5" transform="rotate(-20 ${x} ${y})"/><path class="home-note-stem${i === 2 ? ' is-lit' : ''}" d="M${x + 6} ${y - 1}V${y - 29}"/>`).join('')}</svg>`
const MAP = '<svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path class="home-road" d="M-10 40C40 30 70 60 120 50S200 20 220 30M30-10C40 40 20 80 50 140M150-10C140 50 170 90 150 140M-10 100C60 90 120 110 220 95"/><path class="home-route" d="M44 104C40 70 70 52 104 52S152 30 150 70 120 104 92 100"/><circle class="home-start" cx="44" cy="104" r="5.5"/><circle class="home-end" cx="92" cy="100" r="5.5"/></svg>'
/** Savings growing month by month, the end of the curve marked. */
const SAVINGS = '<svg viewBox="0 0 200 110" aria-hidden="true"><path class="home-grid" d="M14 22H190M14 50H190M14 78H190M14 100H190"/><path class="home-wash" d="M14 100C60 96 110 80 186 24V100Z"/><path class="home-curve" d="M14 100C60 96 110 80 186 24"/><circle class="home-water" cx="186" cy="24" r="5"/></svg>'
/** A week of dinners, a plate a day. */
const WEEK = `<svg viewBox="0 0 210 100" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6].map((day) => `<rect class="home-card" x="${6 + day * 29}" y="14" width="25" height="72" rx="5"/><circle class="${day === 3 ? 'home-water' : 'home-soft'}" cx="${18.5 + day * 29}" cy="38" r="8"/><rect class="home-soft" x="${11 + day * 29}" y="56" width="15" height="4" rx="2"/><rect class="home-soft" x="${11 + day * 29}" y="66" width="10" height="4" rx="2"/>`).join('')}</svg>`
/** A street in spring, in washes of water colour. */
const STREET = '<svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect class="home-wash" width="200" height="130"/><circle class="home-sun" cx="160" cy="30" r="14"/><path class="home-soft" d="M0 104H200V130H0Z"/><path class="home-house" d="M20 104V64L44 44 68 64V104ZM76 104V72L96 56 116 72V104Z"/><path class="home-ink-soft" d="M36 104V84H52V104ZM90 104V88H102V104Z"/><circle class="home-leaf" cx="146" cy="76" r="22"/><path class="home-trunk" d="M146 98V104"/><circle class="home-blossom" cx="138" cy="70" r="3"/><circle class="home-blossom" cx="154" cy="80" r="3"/><circle class="home-blossom" cx="148" cy="64" r="3"/></svg>'
/** A family tree: grandparents, their children, the grandchildren. */
const TREE = '<svg viewBox="0 0 200 120" aria-hidden="true"><path class="home-link-line" d="M100 26V44M54 44H146M54 44V62M146 44V62M54 62V76M146 62V76M32 76H76M124 76H168M32 76V90M76 76V90M124 76V90M168 76V90"/><circle class="home-ink" cx="100" cy="18" r="9"/><circle class="home-card" cx="54" cy="62" r="9"/><circle class="home-card" cx="146" cy="62" r="9"/><circle class="home-soft" cx="32" cy="100" r="9"/><circle class="home-soft" cx="76" cy="100" r="9"/><circle class="home-water" cx="124" cy="100" r="9"/><circle class="home-soft" cx="168" cy="100" r="9"/></svg>'
/** An invitation card, a balloon beside it. */
const CARD = '<svg viewBox="0 0 200 120" aria-hidden="true"><g transform="rotate(-6 92 62)"><rect class="home-card" x="46" y="18" width="92" height="88" rx="6"/><path class="home-water" d="M92 30 98 50H86Z"/><rect class="home-ink-soft" x="62" y="60" width="60" height="7" rx="3.5"/><rect class="home-soft" x="70" y="74" width="44" height="5" rx="2.5"/><rect class="home-soft" x="76" y="86" width="32" height="5" rx="2.5"/></g><ellipse class="home-wash-strong" cx="162" cy="40" rx="14" ry="17"/><path class="home-string" d="M162 57C158 70 168 80 160 100"/></svg>'
/** Meeting minutes as a document, its tasks ticked or not yet. */
const MINUTES = '<svg viewBox="0 0 200 120" aria-hidden="true"><rect class="home-card" x="46" y="8" width="108" height="108" rx="5"/><rect class="home-ink-soft" x="58" y="20" width="56" height="7" rx="3.5"/><rect class="home-soft" x="58" y="34" width="84" height="4" rx="2"/><rect class="home-soft" x="58" y="43" width="72" height="4" rx="2"/><rect class="home-soft" x="58" y="52" width="80" height="4" rx="2"/><rect class="home-box" x="58" y="66" width="9" height="9" rx="2"/><path class="home-tick" d="M60 70.5 62.5 73 66 68"/><rect class="home-soft" x="73" y="68" width="56" height="4" rx="2"/><rect class="home-box" x="58" y="82" width="9" height="9" rx="2"/><path class="home-tick" d="M60 86.5 62.5 89 66 84"/><rect class="home-soft" x="73" y="84" width="48" height="4" rx="2"/><rect class="home-box" x="58" y="98" width="9" height="9" rx="2"/><rect class="home-soft" x="73" y="100" width="62" height="4" rx="2"/></svg>'
/** Slides, the front one with its chart. */
const DECK = '<svg viewBox="0 0 200 120" aria-hidden="true"><rect class="home-card home-shadow" x="56" y="10" width="104" height="62" rx="4"/><rect class="home-card home-shadow" x="48" y="24" width="104" height="62" rx="4"/><rect class="home-card" x="40" y="38" width="104" height="62" rx="4"/><rect class="home-ink-soft" x="50" y="47" width="46" height="6" rx="3"/><rect class="home-soft" x="54" y="76" width="12" height="16"/><rect class="home-soft" x="72" y="70" width="12" height="22"/><rect class="home-soft" x="90" y="66" width="12" height="26"/><rect class="home-water" x="108" y="58" width="12" height="34"/></svg>'
/** A plan as a timeline: who does what, and when, today marked. */
const PLAN = `<svg viewBox="0 0 200 110" aria-hidden="true"><path class="home-grid" d="M64 10V100M106 10V100M148 10V100"/>${[[18, 62, 44], [38, 84, 52], [58, 118, 46], [78, 150, 38]].map(([y, x, w], i) => `<rect class="home-soft" x="12" y="${y}" width="40" height="6" rx="3"/><rect class="${i === 2 ? 'home-water' : 'home-bar'}" x="${x}" y="${y - 3}" width="${w}" height="12" rx="6"/>`).join('')}<path class="home-today" d="M118 6V104"/></svg>`

/**
 * The page, in one language.
 * @param {Words} words  scripts/home/<lang>.json
 * @param {Record<string, string>} app  appWords()'s, in the same language
 * @param {{ lang: string, dir: string, brand: { name: string, domain: string }, sample: Awaited<ReturnType<typeof sampleAnswer>>, saved?: ReturnType<typeof savingsAnswer> }} context
 */
export function homeOf (words, app, { lang, dir, brand, sample, saved = savingsAnswer() }) {
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
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 })
  const results = { product: '\u0000', growth, total: number.format(saved.total), saved: number.format(saved.put) }
  /** A replay's step or result, filled with what the sample and the savings come to, the product in its own direction. @param {string} text */
  const fact = (text) => xml(fill(text, { ...params, ...results })).replace('\u0000', `<bdi>${xml(sample.product)}</bdi>`)
  /** A tile's replay: three steps, what came back, its chip. @param {string} key @returns {string[]} */
  const replayOf = (key) => {
    const items = words[`replay.${key}`]
    if (!Array.isArray(items) || items.length !== 5) throw new Error(`scripts/home/${lang}.json: replay.${key} is three steps, a result and a chip`)
    return items.map((item) => fact(String(item)))
  }
  const file = `<span class="home-file" dir="ltr">${ICONS.file}sales.csv</span>`
  const tryIt = (/** @type {string} */ key, primary = false) => `<button type="button" class="button${primary ? ' primary' : ''}" data-try="${key}">${say('tile.try')}</button>`
  /** A use with no file: its request, quoted on the tile and as asked in its replay. @param {string} text */
  const asking = (text) => ({ ask: quoted(text), said: `<span>${text}</span>` })
  // Four for each, three rows of four mixed, a row each once filtered: what Jean makes and shows, never homework.
  const uses = [
    { key: 'sample', group: 'work', chip: 'chart', ask: `${file} ${quoted(appSays('starter.sample.prompt'))}`, said: `${file}<span>${appSays('starter.sample.prompt')}</span>`,
      art: `<div class="home-art" aria-hidden="true"><span class="home-bars"><i></i><i></i><i></i><i></i></span><span class="home-badge">${replayOf('sample')[3]}</span></div>` },
    { key: 'music', group: 'family', chip: 'note', ...asking(say('tile.music')), art: `<div class="home-art">${MUSIC}</div>` },
    { key: 'quiz', group: 'family', chip: 'app', ...asking(say('tile.quiz')), art: `<div class="home-art" aria-hidden="true"><span class="home-quiz"><b>${say('tile.quiz.question')}</b>${list('tile.quiz.answers').map((answer) => `<span>${answer}</span>`).join('')}</span></div>` },
    { key: 'map', group: 'home', chip: 'pin', ...asking(say('tile.map')), art: `<div class="home-art is-map">${MAP}</div>` },
    { key: 'slides', group: 'work', chip: 'file', ...asking(say('tile.slides')), art: `<div class="home-art">${DECK}</div>` },
    { key: 'savings', group: 'home', chip: 'chart', ...asking(appSays('starter.savings.prompt')), art: `<div class="home-art">${SAVINGS}</div>` },
    { key: 'tree', group: 'family', chip: 'tree', ...asking(say('tile.tree')), art: `<div class="home-art">${TREE}</div>` },
    { key: 'dinners', group: 'home', chip: 'table', ...asking(say('tile.dinners')), art: `<div class="home-art">${WEEK}</div>` },
    { key: 'minutes', group: 'work', chip: 'file', ...asking(say('tile.minutes')), art: `<div class="home-art">${MINUTES}</div>` },
    { key: 'invitation', group: 'family', chip: 'file', ...asking(say('tile.invitation')), art: `<div class="home-art">${CARD}</div>` },
    { key: 'picture', group: 'home', chip: 'picture', ...asking(say('tile.picture')), art: `<div class="home-art is-map">${STREET}</div>` },
    { key: 'plan', group: 'work', chip: 'file', ...asking(say('tile.plan')), art: `<div class="home-art">${PLAN}</div>` },
  ]
  // One tile is the active one at all times, the first until the pointer, a tap or the keyboard picks another, its Try the
  // primary one and its replay the one shown (ui/home.js).
  const tile = (/** @type {typeof uses[number]} */ use, /** @type {number} */ i) => `
    <li class="home-tile${i ? '' : ' is-active'}" data-for="${use.group}"${i ? '' : ' aria-current="true"'}>
      <span class="home-where">${say(`range.${use.group}`)}</span>
      <p class="home-ask">${use.ask}</p>
      ${use.art}
      <p class="home-go">${tryIt(use.key, !i)}</p>
    </li>`
  const replay = (/** @type {typeof uses[number]} */ use, /** @type {number} */ i) => {
    const [first, second, third, got, chip] = replayOf(use.key)
    return `
      <ol class="home-replay" data-replay="${use.key}" aria-label="${say('replay.how')}"${i ? ' inert' : ''}>
        <li><span class="home-step">${say('replay.ask')}</span><p class="home-asked" dir="auto">${use.said}</p></li>
        <li><span class="home-step">${say('replay.work')}</span><ul class="home-ticks">${[first, second, third].map((step) => `<li>${step}</li>`).join('')}</ul></li>
        <li><span class="home-step">${say('replay.get')}</span><p>${got}</p><span class="home-file" dir="auto">${ICONS[/** @type {keyof typeof ICONS} */ (use.chip)]}${chip}</span></li>
        <li><span class="home-step">${say('replay.where')}</span><p class="home-receipt"><b>${ICONS.brain}${appSays('receipt.inCloud')}</b><span>${say('replay.sent', { host: '\u0000' }).replace('\u0000', '<bdi>openrouter.ai</bdi>')}</span><span>${appSays('receipt.certificate')} ✓</span></p>${tryIt(use.key, true)}</li>
      </ol>`
  }
  const more = (/** @type {string} */ label, /** @type {string[]} */ items, dots = false) => `<details><summary>${label}${ICONS.down}</summary><ul${dots ? ' class="home-dots"' : ''}>${items.map((item) => `<li>${item}</li>`).join('')}</ul></details>`
  const door = (/** @type {string} */ id, /** @type {string} */ key, /** @type {string} */ body, featured = false) => `
      <article id="home-${id}" class="home-door${featured ? ' is-featured' : ''}" aria-labelledby="home-${id}-title">
        <p class="home-door-name">${say(`${key}.name`)}</p>
        <p class="home-door-why">${say(`${key}.why`)}</p>
        <h3 id="home-${id}-title" class="home-door-title">${say(`${key}.title`)}</h3>
        ${body}
      </article>`
  const go = (/** @type {Array<[string, string]>} */ links) => `<p class="home-door-go">${links.map(([href, label]) => `<a href="${href}">${label} ${ARROW}</a>`).join('')}</p>`
  // Two columns that lay out on their own, so a question opened in one never moves the other; one open at a time (name).
  const columns = (/** @type {string[]} */ items) => [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))].map((half) => `<div>${half.join('')}</div>`).join('')
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
      <span class="home-filter-mark" aria-hidden="true"></span>
      ${['all', 'home', 'family', 'work'].map((group) => `<input type="radio" name="home-for" id="home-for-${group}"${group === 'all' ? ' checked' : ''}><label for="home-for-${group}">${say(`range.${group}`)}</label>`).join('')}
    </fieldset>
    <div class="home-row">
    <button type="button" class="home-turn is-back" aria-label="${say('range.back')}" disabled>${TURN}</button>
    <ul class="home-tiles">${uses.map(tile).join('')}
    </ul>
    <button type="button" class="home-turn is-next" aria-label="${say('range.next')}">${TURN}</button>
    </div>
    <div id="home-how" class="home-replays" aria-live="polite">${uses.map(replay).join('')}
    </div>
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
        ${go([[familyAddress(lang), say('family.go')]])}`),
      door('simple', 'simple', `<div class="home-offer" aria-hidden="true"><p>${appSays('cap.memory.offer')}</p><span><span class="button primary">${appSays('cap.memory.yes')}</span><span class="button subtle">${appSays('offer.no')}</span></span></div>
        ${more(say('door.more'), list('simple.more'))}`),
      door('shareable', 'share', `<p class="home-link" dir="ltr" aria-hidden="true"><span>https://hst.ing/s/3f9a…#k=Qm7…</span><span class="button">${appSays('action.copy')}</span></p>
        <p class="home-note">${say('share.limits')}</p>
        ${more(say('door.more'), list('share.more'))}`),
      door('open', 'open', `<p>${say('open.text')}</p>
        ${go([['source', say('open.source')], [enterpriseAddress(lang), say('open.it')]])}`),
      door('catch', 'catch', `<ul class="home-dots">${list('catch.items').map((item) => `<li>${item}</li>`).join('')}</ul>
        ${more(say('catch.more'), list('catch.rest'), true)}`),
    ].join('')}
    </div>
  </section>
  <section id="home-questions" class="home-section" aria-labelledby="home-questions-title">
    <h2 id="home-questions-title" class="home-title is-small">${say('faq.title')}</h2>
    <div class="home-questions">${columns(/** @type {string[][]} */ (words['faq.items']).map(([question, answer], i) => `
      <details name="home-questions"${i ? '' : ' open'}><summary>${xml(fill(question, params))}${ICONS.plus}${ICONS.minus}</summary><p>${xml(fill(answer, params))}</p></details>`))}
    </div>
  </section>
  <footer class="home-foot">
    <div><p class="home-mark">${xml(brand.name)}</p><p>${say('foot.tagline')}</p><p>${say('foot.made')}</p></div>
    <nav aria-labelledby="home-foot-site"><p id="home-foot-site" class="home-foot-head">${xml(brand.name)}</p><ul>
      <li><a href="files">${appSays('welcome.files')}</a></li><li><a href="privacy">${appSays('welcome.privacy')}</a></li><li><a href="terms">${appSays('welcome.terms')}</a></li><li><a href="source">${say('open.source')}</a></li>
    </ul></nav>
    <nav aria-labelledby="home-foot-for"><p id="home-foot-for" class="home-foot-head">${say('foot.for')}</p><ul>
      <li><a href="${familyAddress(lang)}">${say('foot.families')}</a></li><li><a href="${enterpriseAddress(lang)}">${say('foot.it')}</a></li>
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
