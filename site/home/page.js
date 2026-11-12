// SPDX-License-Identifier: MIT
// jean.is's own page, under the app's first screen (D397): what Jean is, for a first visit, as static HTML and CSS
// after the app's root, which build:web writes into index.html and into one page per language beside it,
// <lang>.html, served at /<lang> as /privacy is, so that every address in it and in the app resolves against the
// site's root as at /; each names the others for search engines (hreflang), and the app speaks its language there
// unless the person chose one. Only the site whose address is the brand's own domain has it: never app/, an
// organisation's copy or the desktop app. The app shows it before any task, in a browser's tab, and takes it away
// with the first request (ui/shell.js, ui/home.js). Its words are <lang>.json, English's first, with the app's own
// catalogues where the app already says the same (the sample request, the box's words, what the first screen says of it), and its look
// home.css, over the app's style sheet and site.css, whose foot it ends with (site/site.js, D438).
import { readFile } from 'node:fs/promises'
import { LOCALES, intlLocales } from '../../app/core/i18n.js'
import { FELT, ICONS, fill, foot, languageMenu, pictureOf, wave, xml } from '../site.js'

/** Each language's page, from the site's root. @type {Record<string, string>} */
const ADDRESSES = { en: '', ar: 'ar', br: 'br', co: 'co', da: 'da', de: 'de', es: 'es', fi: 'fi', fr: 'fr', 'fr-CA': 'fr-CA', ha: 'ha', hu: 'hu', id: 'id', it: 'it', ja: 'ja', ko: 'ko', ms: 'ms', nl: 'nl', pl: 'pl', pt: 'pt', ro: 'ro', tl: 'tl', 'zh-Hans': 'zh-Hans', 'zh-Hant': 'zh-Hant' }

/**
 * The sample spreadsheet's answer, which its tile says: the product that grew the most
 * from its first month to its last, and by how much, with how many products and months it reads.
 */
export async function sampleAnswer () {
  const rows = (await readFile(new URL('../../app/caps/files/sales.csv', import.meta.url), 'utf8')).trim().split('\n').slice(1).map((line) => line.split(','))
  const months = [...new Set(rows.map(([month]) => month))].sort()
  const products = [...new Set(rows.map((row) => row[1]))]
  const units = (/** @type {string | undefined} */ month, /** @type {string} */ product) => Number(rows.find((row) => row[0] === month && row[1] === product)?.[2])
  const [best] = products.map((product) => ({ product, growth: units(months.at(-1), product) / units(months[0], product) - 1 })).sort((a, b) => b.growth - a.growth)
  return { ...best, products: products.length, months: months.length }
}

const SAMPLE = await sampleAnswer()

const ARROW = '<span class="flip-rtl" aria-hidden="true">→</span>'
const TURN = '<svg class="icon flip-rtl" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

/** The tiles' pictures, drawn until each is a capture of its request done in that language. */
const MUSIC = /* html */ `<svg viewBox="0 0 200 100" aria-hidden="true"><path class="home-staff" d="M10 30H190M10 40H190M10 50H190M10 60H190M10 70H190"/>${
  [[38, 65], [72, 55], [106, 45], [140, 50], [172, 60]].map(([x, y], i) => /* html */ `<ellipse class="home-note-head${i === 2 ? ' is-lit' : ''}" cx="${x}" cy="${y}" rx="6.5" ry="5" transform="rotate(-20 ${x} ${y})"/><path class="home-note-stem${i === 2 ? ' is-lit' : ''}" d="M${x + 6} ${y - 1}V${y - 29}"/>`).join('')}</svg>`
const MAP = '<svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path class="home-road" d="M-10 40C40 30 70 60 120 50S200 20 220 30M30-10C40 40 20 80 50 140M150-10C140 50 170 90 150 140M-10 100C60 90 120 110 220 95"/><path class="home-route" d="M44 104C40 70 70 52 104 52S152 30 150 70 120 104 92 100"/><circle class="home-start" cx="44" cy="104" r="5.5"/><circle class="home-end" cx="92" cy="100" r="5.5"/></svg>'
/** Savings growing month by month, the end of the curve marked. */
const SAVINGS = '<svg viewBox="0 0 200 110" aria-hidden="true"><path class="home-grid" d="M14 22H190M14 50H190M14 78H190M14 100H190"/><path class="home-wash" d="M14 100C60 96 110 80 186 24V100Z"/><path class="home-curve" d="M14 100C60 96 110 80 186 24"/><circle class="home-water" cx="186" cy="24" r="5"/></svg>'
/** A week of dinners, a plate a day. */
const WEEK = /* html */ `<svg viewBox="0 0 210 100" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6].map((day) => /* html */ `<rect class="home-card" x="${6 + day * 29}" y="14" width="25" height="72" rx="5"/><circle class="${day === 3 ? 'home-water' : 'home-soft'}" cx="${18.5 + day * 29}" cy="38" r="8"/><rect class="home-soft" x="${11 + day * 29}" y="56" width="15" height="4" rx="2"/><rect class="home-soft" x="${11 + day * 29}" y="66" width="10" height="4" rx="2"/>`).join('')}</svg>`
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
const PLAN = /* html */ `<svg viewBox="0 0 200 110" aria-hidden="true"><path class="home-grid" d="M64 10V100M106 10V100M148 10V100"/>${[[18, 62, 44], [38, 84, 52], [58, 118, 46], [78, 150, 38]].map(([y, x, w], i) => /* html */ `<rect class="home-soft" x="12" y="${y}" width="40" height="6" rx="3"/><rect class="${i === 2 ? 'home-water' : 'home-bar'}" x="${x}" y="${y - 3}" width="${w}" height="12" rx="6"/>`).join('')}<path class="home-today" d="M118 6V104"/></svg>`

/** Three days of a year, for the tasks a history shows: said as that language says a day. */
const DAYS = ['2026-03-12', '2026-06-02', '2026-09-19']

/** Each act's ground: paper, the app's fill, what waits. */
const GROUNDS = /** @type {const} */ ({ create: 'paper', any: 'fill', keep: 'wait' })

/**
 * The page, in one language: the part index.html ends with, with the site's foot and its language menu. Its promise
 * is its outline: its heading, for whoever hears the page or searches it, then an act for each part of the sentence, in
 * the order that language says them, their titles reading as the promise; then what Jean asks of the reader, the
 * questions and the foot.
 * @param {import('../site.js').Kit} kit @param {{ sample?: typeof SAMPLE }} [at]
 */
export function homeOf (kit, { sample = SAMPLE } = {}) {
  const { lang, dir, brand } = kit
  const params = { free: kit.appText('first.free') }
  const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
  const list = (/** @type {string} */ key) => kit.list(key, params)
  const appSays = (/** @type {string} */ key) => kit.app(key)
  const quoted = (/** @type {string} */ text) => /* html */ `<q class="home-request">${text}</q>`
  // Numbers and days as the app writes them in that language: a language Intl lacks, as its region does (core/i18n.js).
  const growth = new Intl.NumberFormat(intlLocales(lang), { style: 'percent', signDisplay: 'exceptZero' }).format(sample.growth)
  // What the sample comes to, on its tile, the product in its own direction.
  const badge = xml(fill(String(kit.raw('tile.sample.badge')), { name: brand.name, ...params, product: '\u0000', growth })).replace('\u0000', /* html */ `<bdi lang="en" dir="ltr">${xml(sample.product)}</bdi>`)
  const file = /* html */ `<span class="home-file" dir="ltr">${ICONS.file}sales.csv</span>`
  const tryIt = (/** @type {string} */ key, primary = false) => /* html */ `<button type="button" class="button${primary ? ' primary' : ''}" data-try="${key}" id="home-try-${key}" aria-labelledby="home-try-${key} home-ask-${key}">${say('tile.try')}</button>`
  // Twelve, four in view, the rest a turn away: what Jean makes and shows, never homework. Written in this order, which
  // is the one without scripts; the app deals them anew each visit (ui/tiles.js).
  const uses = [
    { key: 'sample', group: 'work', ask: `${file} ${quoted(appSays('starter.sample.prompt'))}`, art: /* html */ `<div class="home-art" aria-hidden="true"><span class="home-bars"><span></span><span></span><span></span><span></span></span><span class="home-badge">${badge}</span></div>` },
    { key: 'music', group: 'family', ask: quoted(say('tile.music')), art: /* html */ `<div class="home-art">${MUSIC}</div>` },
    { key: 'quiz', group: 'family', ask: quoted(say('tile.quiz')), art: /* html */ `<div class="home-art" aria-hidden="true"><span class="home-quiz"><b>${say('tile.quiz.question')}</b>${list('tile.quiz.answers').map((answer) => /* html */ `<span>${answer}</span>`).join('')}</span></div>` },
    { key: 'map', group: 'home', ask: quoted(say('tile.map')), art: /* html */ `<div class="home-art is-map">${MAP}</div>` },
    { key: 'slides', group: 'work', ask: quoted(say('tile.slides')), art: /* html */ `<div class="home-art">${DECK}</div>` },
    { key: 'savings', group: 'home', ask: quoted(appSays('starter.savings.prompt')), art: /* html */ `<div class="home-art">${SAVINGS}</div>` },
    { key: 'tree', group: 'family', ask: quoted(say('tile.tree')), art: /* html */ `<div class="home-art">${TREE}</div>` },
    { key: 'dinners', group: 'home', ask: quoted(say('tile.dinners')), art: /* html */ `<div class="home-art">${WEEK}</div>` },
    { key: 'minutes', group: 'work', ask: quoted(say('tile.minutes')), art: /* html */ `<div class="home-art">${MINUTES}</div>` },
    { key: 'invitation', group: 'family', ask: quoted(say('tile.invitation')), art: /* html */ `<div class="home-art">${CARD}</div>` },
    { key: 'picture', group: 'home', ask: quoted(say('tile.picture')), art: /* html */ `<div class="home-art is-map">${STREET}</div>` },
    { key: 'plan', group: 'work', ask: quoted(say('tile.plan')), art: /* html */ `<div class="home-art">${PLAN}</div>` },
  ]
  // A tile: what comes back, drawn; who it is for and what it is; the request; its Try, the first one's the primary one,
  // as written and as dealt.
  const tile = (/** @type {typeof uses[number]} */ use, /** @type {number} */ i) => /* html */ `
        <li class="home-tile">
          ${use.art}
          <p class="home-where"><span>${say(`where.${use.group}`)}</span><bdi>${say(`kind.${use.key}`)}</bdi></p>
          <p class="home-ask" id="home-ask-${use.key}">${use.ask}</p>
          <p class="home-go">${tryIt(use.key, !i)}</p>
        </li>`
  // The acts in the order this language's promise says them; a language that writes no spaces joins sentences without one.
  const join = /^(ja|zh)\b/.test(lang) ? '' : ' '
  const order = /** @type {Array<keyof typeof GROUNDS>} */ (list('acts'))
  if (`${[...order].sort()}` !== 'any,create,keep') throw new Error(`site/home/${lang}.json: acts is create, any and keep, in the order its promise says them`)
  // A day as the page's English writes it, the day first, as its spelling is Britain's.
  const day = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : intlLocales(lang), { day: 'numeric', month: 'long', timeZone: 'UTC' })
  // An act's title, its full stop in the mark's colour; its catch, said under it, every promise with its own.
  const title = (/** @type {string} */ act) => /* html */ `<h2 id="home-${act}-title" class="home-act-title">${say(`${act}.title`).replace(/([.。])$/u, '<span class="home-dot">$1</span>')}</h2>`
  const caught = (/** @type {string[]} */ sentences) => /* html */ `<p class="home-catch"><b>${say('catch.name')}</b> <span>${sentences.join(join)}</span></p>`
  const go = (/** @type {string} */ href, /** @type {string} */ label) => /* html */ `<a href="${href}">${label} ${ARROW}</a>`
  const acts = {
    create: /* html */ `
      <header class="home-act-head">
        ${title('create')}
        <p class="home-act-lead">${say('create.why')}</p>
      </header>
      <div class="home-row">
      <button type="button" class="home-turn is-back" aria-label="${say('tiles.back')}" disabled>${TURN}</button>
      <ul class="home-tiles">${uses.map(tile).join('')}
      </ul>
      <button type="button" class="home-turn is-next" aria-label="${say('tiles.next')}">${TURN}</button>
      </div>
      ${caught([say('create.catch')])}`,
    any: /* html */ `
      <div class="home-any">
        <header class="home-act-head is-stacked">
          ${title('any')}
          <p class="home-act-why">${say('any.why')}</p>
          <p class="home-act-lead">${say('any.lead')}</p>
          <p class="home-act-go">${go(kit.link('compare') ?? 'compare', say('any.go'))}</p>
        </header>
        <ul class="home-ways">${list('any.ways').map((way, i) => /* html */ `
          <li${i ? '' : ' class="is-chosen"'}>${ICONS.brain}<span><b>${way}</b><small>${list('any.notes')[i]}</small></span>${i ? '' : ICONS.check}</li>`).join('')}
        </ul>
      </div>
      ${caught(list('any.catch'))}`,
    keep: /* html */ `
      <header class="home-act-head">
        ${title('keep')}
        <div><p class="home-act-why">${say('keep.why')}</p><p class="home-act-lead">${say('keep.lead')}</p></div>
      </header>
      <div class="home-shelf">
        <article><h3>${say('keep.history')}</h3><ul class="home-past" aria-hidden="true">${list('keep.history.tasks').map((task, i) => /* html */ `<li><span>${task}</span><span>${xml(day.format(new Date(DAYS[i])))}</span></li>`).join('')}</ul><p>${say('keep.history.text')}</p></article>
        <article><h3>${say('keep.files')}</h3><ul class="home-files" aria-hidden="true">${['slides', 'minutes', 'plan', 'invitation'].map((key) => /* html */ `<li>${ICONS.file}<bdi>${say(`kind.${key}`)}</bdi></li>`).join('')}</ul><p>${say('keep.files.text')}</p></article>
        <article><h3>${say('keep.memory')}</h3><ul class="home-lines" aria-hidden="true">${list('keep.memory.lines').map((line) => /* html */ `<li>${line}</li>`).join('')}</ul><p>${say('keep.memory.text')}</p></article>
      </div>
      <div class="home-move">
        <div><h3>${say('move.title')}</h3><p>${say('move.sub')}</p></div>
        <a class="button" href="${kit.link('import') ?? 'import'}">${say('move.go')} ${ARROW}</a>
      </div>
      ${caught([say('keep.catch')])}`,
  }
  // Two columns that lay out on their own, so a question opened in one never moves the other; one open at a time (name).
  const columns = (/** @type {string[]} */ items) => [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))].map((half) => /* html */ `<div>${half.join('')}</div>`).join('')
  // Each language a link, to its own page or, where it has none, to English's, where the app speaks it all the same (ui/home.js, D680).
  const menu = languageMenu(kit, LOCALES, (code) => /* html */ `href="${kit.site(ADDRESSES[code] ?? '')}" data-language="${code}"${code in ADDRESSES ? ` hreflang="${code}"` : ''}${code === lang ? ' aria-current="true"' : ''}`)
  // The page's own main content while it shows, the app's first screen above it (ui/home.js), then the site's foot.
  return /* html */ `<div class="home" lang="${lang}" dir="${dir}"><main>
  <h1 class="visually-hidden">${say('promise')}</h1>${order.map((act, i) => /* html */ `
  <section id="home-${act}" class="home-act is-${GROUNDS[act]}" aria-labelledby="home-${act}-title">
    <div class="home-act-in">${acts[act]}
    </div>
    ${wave(GROUNDS[order[i + 1]] ?? 'paper', 'home')}
  </section>`).join('')}
  <section id="home-turn" class="home-yours" aria-labelledby="home-turn-title">
    ${title('turn')}
    <p><button type="button" class="home-yours-box" data-turn><span>${appSays('composer.placeholder')}</span>${ICONS.send}</button>${FELT.arc}</p>
    <ul class="home-facts">${['welcome.install', 'welcome.device', 'welcome.open'].map((key) => /* html */ `<li>${appSays(key)}</li>`).join('')}</ul>
  </section>
  <section id="home-questions" class="home-section" aria-labelledby="home-questions-title">
    <h2 id="home-questions-title" class="home-title is-small">${say('faq.title')}</h2>
    <div class="home-questions">${columns(kit.table('faq.items', 2, params).map(([question, answer], i) => /* html */ `
      <details name="home-questions"${i ? '' : ' open'}><summary><span>${question}</span>${ICONS.closed}${ICONS.open}</summary><p>${answer}</p></details>`))}
    </div>
  </section>
  </main>
  ${foot(kit, menu)}
</div>`
}

/**
 * index.html with the page, once: in a language, which its <html> says, and which the app is asked to
 * speak at a language's own address (`app-language`); every language's address named for search
 * engines, the root's as the default; the site's style sheet and the page's after the app's; the page after the
 * app's root, which the app puts first in <body>; and what it says without scripts, in that language.
 * @param {string} html  index.html, as the rest of build:web leaves it
 * @param {string} page  homeOf()'s
 * @param {{ lang: string, dir: string, own: boolean, languages: Array<{ lang: string, address: string }>, noscript: string }} at  `own`: the page at a language's own address
 */
export function withHome (html, page, { lang, dir, own, languages, noscript }) {
  if (html.includes('class="home"') || !html.includes('</head>') || !html.includes('</body>') || !/<html lang="en" dir="ltr"/.test(html) || !/<p class="noscript">[^<]*<\/p>/.test(html)) throw new Error('index.html has the page already, or no <html lang="en" dir="ltr">, </head>, </body> or line without scripts')
  const alternates = [...languages.map((language) => /* html */ `<link rel="alternate" hreflang="${language.lang}" href="${xml(language.address)}">`),
    /* html */ `<link rel="alternate" hreflang="x-default" href="${xml(languages[0].address)}">`]
  const head = [...own ? [/* html */ `<meta name="app-language" content="${lang}">`] : [], ...alternates, '<link rel="stylesheet" href="site.css">', '<link rel="stylesheet" href="home.css">']
  return html.replace('<html lang="en" dir="ltr"', /* html */ `<html lang="${lang}" dir="${dir}"`)
    .replace('</head>', () => `${head.join('\n')}\n</head>`)
    .replace(/<p class="noscript">[^<]*<\/p>/, () => /* html */ `<p class="noscript">${noscript}</p>`)
    .replace('</body>', () => `${page}\n</body>`)
}

/**
 * A page written right to left, each run of Latin words in its text saying its own direction, as RGAA 8.10 asks: the
 * text after a drawing too, and a word joined to the Arabic before it (وPDF). @param {string} page
 */
export const latinSaid = (page) => page.replace(/<(script|style|svg|bdi|code|pre)\b[\s\S]*?<\/\1>|(?<=>)([^<]+)(?=<)/g, (whole, _, text) =>
  (text === undefined ? whole : text.replace(/(?<![&#\p{Script=Latin}\p{N}])\p{Script=Latin}[\p{Script=Latin}\p{N}.+@/’'-]*(?: \p{Script=Latin}[\p{Script=Latin}\p{N}.+@/’'-]*)*/gu, '<span dir="ltr">$&</span>')))

/**
 * index.html in another language, for its own address: its description, which the title and the cards
 * then say, in that language. @param {string} html @param {string} description
 */
export function inLanguage (html, description) {
  if (!/<meta name="description" content="[^"]*">/.test(html)) throw new Error('index.html has no description')
  return html.replace(/<meta name="description" content="[^"]*">/, () => /* html */ `<meta name="description" content="${xml(description)}">`)
}

/** @type {import('../site.js').Page} */
export default {
  addresses: ADDRESSES,
  main: (kit) => homeOf(kit),
  document (kit, main) {
    if (!kit.index) throw new Error('the homepage is written into index.html, which the build gives it')
    const address = kit.address(kit.lang) ?? ''
    const languages = kit.languages.map((code) => ({ lang: code, address: kit.address(code) ?? '' }))
    // Its own description, shorter than the install's, which index.html has, the title the same sentence before the rest.
    return withHome(kit.index(kit.text('description'), address, pictureOf(kit)), kit.dir === 'rtl' ? latinSaid(main) : main, { lang: kit.lang, dir: kit.dir, own: kit.lang !== 'en', languages, noscript: kit.say('noscript') })
  },
}
