// jean.is's own page, under the app's first screen (D397): what Jean is, for a first visit, as static HTML and CSS
// after the app's root, which build:web writes into index.html and into one page per language beside it,
// <lang>.html, served at /<lang> as /privacy is, so that every address in it and in the app resolves against the
// site's root as at /; each names the others for search engines (hreflang), and the app speaks its language there
// unless the person chose one. Only the site whose address is the brand's own domain has it: never app/, an
// organisation's copy or the desktop app. The app shows it before any task, in a browser's tab, and takes it away
// with the first request (ui/shell.js, ui/home.js). Its words are <lang>.json, English's first, with the app's own
// catalogues where the app already says the same (the sample request, the receipt, the legal links), and its look
// home.css, over the app's style sheet and site.css, whose foot it ends with (site/site.js, D438).
import { readFile } from 'node:fs/promises'
import { LOCALES, languageName } from '../../app/core/i18n.js'
import { ICONS, REPOSITORY, fill, foot, xml } from '../site.js'

/**
 * The sample spreadsheet's answer, which its tile and its replay say: the product that grew the most
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

/**
 * What the savings idea comes to (starter.savings.prompt): 200 a month for ten years at 4% a year, interest
 * added monthly; the total to the nearest ten, and what was put in.
 */
export function savingsAnswer (monthly = 200, rate = 0.04, years = 10) {
  const [month, months] = [rate / 12, years * 12]
  return { total: Math.round((monthly * ((1 + month) ** months - 1)) / month / 10) * 10, put: monthly * months }
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

/**
 * The page, in one language: the part index.html ends with, with the site's foot and its language menu.
 * @param {import('../site.js').Kit} kit @param {{ sample?: typeof SAMPLE, saved?: ReturnType<typeof savingsAnswer> }} [at]
 */
export function homeOf (kit, { sample = SAMPLE, saved = savingsAnswer() } = {}) {
  const { lang, dir, brand } = kit
  const params = { free: kit.appText('first.free') }
  const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
  const list = (/** @type {string} */ key) => kit.list(key, params)
  const appSays = (/** @type {string} */ key) => kit.app(key)
  const [open, close] = say('quote').split('{text}')
  const quoted = (/** @type {string} */ text) => /* html */ `${open}<span class="home-request">${text}</span>${close}`
  const growth = new Intl.NumberFormat(lang, { style: 'percent', signDisplay: 'exceptZero' }).format(sample.growth)
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 })
  const results = { product: '\u0000', growth, total: number.format(saved.total), saved: number.format(saved.put) }
  /** A replay's step or result, filled with what the sample and the savings come to, the product in its own direction. @param {string} text */
  const fact = (text) => xml(fill(text, { name: brand.name, ...params, ...results })).replace('\u0000', /* html */ `<bdi>${xml(sample.product)}</bdi>`)
  /** A tile's replay: three steps, what came back, its chip. @param {string} key @returns {string[]} */
  const replayOf = (key) => {
    const items = kit.raw(`replay.${key}`)
    if (!Array.isArray(items) || items.length !== 5) throw new Error(`site/home/${lang}.json: replay.${key} is three steps, a result and a chip`)
    return items.map((item) => fact(String(item)))
  }
  const file = /* html */ `<span class="home-file" dir="ltr">${ICONS.file}sales.csv</span>`
  const tryIt = (/** @type {string} */ key, primary = false) => /* html */ `<button type="button" class="button${primary ? ' primary' : ''}" data-try="${key}">${say('tile.try')}</button>`
  /** A use with no file: its request, quoted on the tile and as asked in its replay. @param {string} text */
  const asking = (text) => ({ ask: quoted(text), said: /* html */ `<span>${text}</span>` })
  // Four for each, three rows of four mixed, a row each once filtered: what Jean makes and shows, never homework.
  const uses = [
    { key: 'sample', group: 'work', chip: 'chart', ask: `${file} ${quoted(appSays('starter.sample.prompt'))}`, said: /* html */ `${file}<span>${appSays('starter.sample.prompt')}</span>`,
      art: /* html */ `<div class="home-art" aria-hidden="true"><span class="home-bars"><i></i><i></i><i></i><i></i></span><span class="home-badge">${replayOf('sample')[3]}</span></div>` },
    { key: 'music', group: 'family', chip: 'music', ...asking(say('tile.music')), art: /* html */ `<div class="home-art">${MUSIC}</div>` },
    { key: 'quiz', group: 'family', chip: 'app', ...asking(say('tile.quiz')), art: /* html */ `<div class="home-art" aria-hidden="true"><span class="home-quiz"><b>${say('tile.quiz.question')}</b>${list('tile.quiz.answers').map((answer) => /* html */ `<span>${answer}</span>`).join('')}</span></div>` },
    { key: 'map', group: 'home', chip: 'place', ...asking(say('tile.map')), art: /* html */ `<div class="home-art is-map">${MAP}</div>` },
    { key: 'slides', group: 'work', chip: 'slides', ...asking(say('tile.slides')), art: /* html */ `<div class="home-art">${DECK}</div>` },
    { key: 'savings', group: 'home', chip: 'chart', ...asking(appSays('starter.savings.prompt')), art: /* html */ `<div class="home-art">${SAVINGS}</div>` },
    { key: 'tree', group: 'family', chip: 'tree', ...asking(say('tile.tree')), art: /* html */ `<div class="home-art">${TREE}</div>` },
    { key: 'dinners', group: 'home', chip: 'table', ...asking(say('tile.dinners')), art: /* html */ `<div class="home-art">${WEEK}</div>` },
    { key: 'minutes', group: 'work', chip: 'file', ...asking(say('tile.minutes')), art: /* html */ `<div class="home-art">${MINUTES}</div>` },
    { key: 'invitation', group: 'family', chip: 'file', ...asking(say('tile.invitation')), art: /* html */ `<div class="home-art">${CARD}</div>` },
    { key: 'picture', group: 'home', chip: 'picture', ...asking(say('tile.picture')), art: /* html */ `<div class="home-art is-map">${STREET}</div>` },
    { key: 'plan', group: 'work', chip: 'file', ...asking(say('tile.plan')), art: /* html */ `<div class="home-art">${PLAN}</div>` },
  ]
  // One tile is the active one at all times, the first until the pointer, a tap or the keyboard picks another, its Try the
  // primary one and its replay the one shown (ui/home.js).
  const tile = (/** @type {typeof uses[number]} */ use, /** @type {number} */ i) => /* html */ `
    <li class="home-tile${i ? '' : ' is-active'}" data-for="${use.group}"${i ? '' : ' aria-current="true"'}>
      <span class="home-where">${say(`range.${use.group}`)}</span>
      <p class="home-ask">${use.ask}</p>
      ${use.art}
      <p class="home-go">${tryIt(use.key, !i)}</p>
    </li>`
  const replay = (/** @type {typeof uses[number]} */ use, /** @type {number} */ i) => {
    const [first, second, third, got, chip] = replayOf(use.key)
    return /* html */ `
      <ol class="home-replay" data-replay="${use.key}" aria-label="${say('replay.how')}"${i ? ' inert' : ''}>
        <li><span class="home-step">${say('replay.ask')}</span><p class="home-asked" dir="auto">${use.said}</p></li>
        <li><span class="home-step">${say('replay.work')}</span><ul class="home-ticks">${[first, second, third].map((step) => /* html */ `<li>${step}</li>`).join('')}</ul></li>
        <li><span class="home-step">${say('replay.get')}</span><p>${got}</p><span class="home-file" dir="auto">${ICONS[/** @type {keyof typeof ICONS} */ (use.chip)]}${chip}</span></li>
        <li><span class="home-step">${say('replay.where')}</span><p class="home-receipt"><b>${ICONS.brain}${appSays('receipt.inCloud')}</b><span>${say('replay.sent', { host: '\u0000' }).replace('\u0000', '<bdi>gateway.ai</bdi>')}</span><span>${appSays('receipt.certificate')} ✓</span></p></li>
      </ol>`
  }
  const more = (/** @type {string} */ label, /** @type {string[]} */ items, dots = false) => /* html */ `<details><summary>${label}${ICONS.down}</summary><ul${dots ? ' class="home-dots"' : ''}>${items.map((item) => /* html */ `<li>${item}</li>`).join('')}</ul></details>`
  const door = (/** @type {string} */ id, /** @type {string} */ key, /** @type {string} */ body, featured = false) => /* html */ `
      <article id="home-${id}" class="home-door${featured ? ' is-featured' : ''}" aria-labelledby="home-${id}-title">
        <p class="home-door-name">${say(`${key}.name`)}</p>
        <p class="home-door-why">${say(`${key}.why`)}</p>
        <h3 id="home-${id}-title" class="home-door-title">${say(`${key}.title`)}</h3>
        ${body}
      </article>`
  const go = (/** @type {Array<[string, string]>} */ links) => /* html */ `<p class="home-door-go">${links.map(([href, label]) => /* html */ `<a href="${href}">${label} ${ARROW}</a>`).join('')}</p>`
  // Two columns that lay out on their own, so a question opened in one never moves the other; one open at a time (name).
  const columns = (/** @type {string[]} */ items) => [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))].map((half) => /* html */ `<div>${half.join('')}</div>`).join('')
  const person = (/** @type {string} */ who, /** @type {string} */ how) => /* html */ `<li><i aria-hidden="true">${xml([...kit.text(who, params)][0] ?? '')}</i><span><b>${say(who)}</b><small>${say(how)}</small></span></li>`
  const menu = /* html */ `
    <label class="home-languages"><span class="visually-hidden">${appSays('settings.language')}</span><select>${LOCALES.map((code) => /* html */ `
      <option value="${code}" lang="${code}"${code === lang ? ' selected' : ''}>${xml(languageName(code))}</option>`).join('')}
    </select></label>`
  // Under the promise, how it is kept: the rest of the description, which search results show after the title.
  const described = kit.text('description')
  const rest = described.slice(described.split(/(?<=[.!?؟])\s+|(?<=[。！？])/u)[0].length).trim()
  return /* html */ `<div class="home" lang="${lang}" dir="${dir}">
  <h1 class="home-title home-promise">${say('promise')}</h1>${rest ? /* html */ `
  <p class="home-promise-sub">${xml(rest)}</p>` : ''}
  <nav class="home-strip" aria-labelledby="home-for">
    <span id="home-for" class="home-strip-label">${say('strip.label')}</span>
    <a class="button" href="#home-range">${say('strip.home')}</a><a class="button" href="#home-family">${say('strip.family')}</a><a class="button" href="${kit.link('work') ?? '#home-range'}">${say('strip.work')}</a><a class="button" href="#home-open">${say('strip.it')}</a><a class="button" href="#home-open">${say('strip.developer')}</a>
  </nav>
  <section id="home-range" class="home-section" aria-labelledby="home-range-title">
    <header class="home-head is-centred">
      <p class="home-why">${say('range.why')}</p>
      <h2 id="home-range-title" class="home-title">${say('range.title')}</h2>
      <p class="home-sub">${say('range.sub')}</p>
    </header>
    <dl class="home-formats">
      <div><dt>${say('range.in')}</dt><dd><ul>${list('range.ins').map((word) => /* html */ `<li>${word}</li>`).join('')}</ul></dd></div>
      <div><dt>${say('range.out')}</dt><dd><ul>${list('range.outs').map((word) => /* html */ `<li>${word}</li>`).join('')}</ul></dd></div>
    </dl>
    <fieldset class="home-filter">
      <legend class="visually-hidden">${say('strip.label')}</legend>
      ${['all', 'home', 'family', 'work'].map((group) => /* html */ `<input type="radio" name="home-for" id="home-for-${group}"${group === 'all' ? ' checked' : ''}><label for="home-for-${group}">${say(`range.${group}`)}</label>`).join('')}
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
  <section id="home-personal" class="home-section is-ruled" aria-labelledby="home-personal-title">
    <header class="home-head">
      <p class="home-why">${say('personal.why')}</p>
      <h2 id="home-personal-title" class="home-title">${say('personal.title')}</h2>
      <p class="home-sub">${say('personal.sub')}</p>
    </header>
    <table class="home-personal">
      <thead><tr><td></td><th scope="col">${say('confidential.mostLabel')}</th><th scope="col">${say('confidential.oursLabel')}</th></tr></thead>
      <tbody>${list('personal.topics').map((topic, row) => /* html */ `
        <tr><th scope="row">${topic}</th><td data-label="${say('confidential.mostLabel')}">${list('personal.theirs')[row]}</td><td data-label="${say('confidential.oursLabel')}">${list('personal.yours')[row]}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="home-note">${say('personal.note')}</p>
    ${go([[kit.link('import') ?? 'import', say('personal.go')], [kit.link('files') ?? 'files', appSays('welcome.files')]])}
  </section>
  <section id="home-why" class="home-section is-side" aria-labelledby="home-why-title">
    <header class="home-head">
      <h2 id="home-why-title" class="home-title">${say('why.title')}</h2>
      <p class="home-sub">${say('why.sub')}</p>
    </header>
    <div class="home-doors">${[
      door('confidential', 'confidential', /* html */ `<dl class="home-versus"><div><dt>${say('confidential.mostLabel')}</dt><dd>${say('confidential.most')}</dd></div><div><dt>${say('confidential.oursLabel')}</dt><dd>${say('confidential.ours')}</dd></div></dl>
        <p class="home-sealed" aria-hidden="true"><span>${appSays('composer.placeholder')}</span><span>${ICONS.shield}${say('confidential.sealed')}</span></p>
        <p class="home-note">${say('confidential.offline')}</p>
        ${go([[kit.link('files') ?? 'files', appSays('welcome.files')]])}`, true),
      door('ai', 'ai', /* html */ `<ul class="home-rows">${list('ai.ways').map((way) => /* html */ `<li>${ICONS.brain}${way}</li>`).join('')}</ul>
        ${go([[kit.link('compare') ?? 'compare', say('ai.go')]])}`),
      door('family', 'family', /* html */ `<ul class="home-people">${person('family.younger', 'family.withYou')}${person('family.older', 'family.alone')}</ul>
        <p class="home-source">${say('family.source')}</p>
        ${go([[kit.link('family') ?? 'family', say('family.go')]])}`),
      door('simple', 'simple', /* html */ `<div class="home-offer" aria-hidden="true"><p>${appSays('cap.memory.offer')}</p><span><span class="button primary">${appSays('cap.memory.yes')}</span><span class="button subtle">${appSays('offer.no')}</span></span></div>
        ${more(say('door.more'), list('simple.more'))}`),
      door('shareable', 'share', /* html */ `<p class="home-link" dir="ltr" aria-hidden="true"><span>https://hst.ing/…</span><span class="button">${appSays('action.copy')}</span></p>
        <p class="home-note">${say('share.limits')}</p>
        ${more(say('door.more'), list('share.more'))}`),
      door('open', 'open', /* html */ `<p>${say('open.text')}</p>
        ${go([[REPOSITORY, say('open.source')], [kit.link('enterprise') ?? 'enterprise', say('open.it')]])}`),
      door('catch', 'catch', /* html */ `<ul class="home-dots">${list('catch.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
        ${more(say('catch.more'), list('catch.rest'), true)}`),
    ].join('')}
    </div>
  </section>
  <section id="home-questions" class="home-section" aria-labelledby="home-questions-title">
    <h2 id="home-questions-title" class="home-title is-small">${say('faq.title')}</h2>
    <div class="home-questions">${columns(kit.table('faq.items', 2, params).map(([question, answer], i) => /* html */ `
      <details name="home-questions"${i ? '' : ' open'}><summary>${question}${ICONS.closed}${ICONS.open}</summary><p>${answer}</p></details>`))}
    </div>
  </section>
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
 * index.html in another language, for its own address: its description, which the title and the cards
 * then say, in that language. @param {string} html @param {string} description
 */
export function inLanguage (html, description) {
  if (!/<meta name="description" content="[^"]*">/.test(html)) throw new Error('index.html has no description')
  return html.replace(/<meta name="description" content="[^"]*">/, () => /* html */ `<meta name="description" content="${xml(description)}">`)
}

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: '', ar: 'ar', fr: 'fr', ja: 'ja', ko: 'ko' },
  main: (kit) => homeOf(kit),
  document (kit, main) {
    if (!kit.index) throw new Error('the homepage is written into index.html, which the build gives it')
    const address = kit.address(kit.lang) ?? ''
    const languages = kit.languages.map((code) => ({ lang: code, address: kit.address(code) ?? '' }))
    // Its own description, shorter than the install's, which index.html has, the title the same sentence before the rest.
    return withHome(kit.index(kit.text('description'), address), main, { lang: kit.lang, dir: kit.dir, own: kit.lang !== 'en', languages, noscript: kit.say('noscript') })
  },
}
