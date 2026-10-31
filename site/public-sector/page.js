// The page for public bodies, the page for IT's sibling (D428), at /public-sector in English and /fr/secteur-public in
// French: for the IT head of a town hall, a ministry or any public body, who doesn't click a door called Enterprise.
// It says first that nobody needs a key to use Jean; then the AI the body names (Albert, a shared provider, its own
// servers) behind its gateway and its sign-in (D385), one price per body that four years keep under France's
// threshold for buying without a procedure, and its review team's answers, each marked as the page for IT marks them.
// Into Jean: a trial key, or the page passed to the review team. The page for IT has the depth. Its words are
// <lang>.json, the page for IT's where they say the same; its look public-sector.css, over site.css (site/site.js, D438).
import { CONTACT, PRICE, SMALL, STATUSES } from '../enterprise/page.js'
import { FELT, REPOSITORY, WAVE, felt, fill, highlight, underline, wordsOf, xml } from '../site.js'

/** @type {Record<string, string>} */
const ADDRESSES = { en: 'public-sector', fr: 'fr/secteur-public', ko: 'ko/public-sector' }

/** France's threshold for buying without a procedure, in euros excl. VAT, and the years of the price that stay under it, or the build stops. */
const THRESHOLD = 60_000
const YEARS = 4
if (!(PRICE * YEARS < THRESHOLD)) throw new Error(`site/public-sector: the price no longer stays under France’s threshold over ${YEARS} years, as the page says it does`)

/** The trust pack's documents, in trust.docs's order, as paths in the repository; null is the repository itself. */
const DOCS = ['docs/trust/anssi.md', 'docs/trust/accessibility.md', 'docs/trust/dpia.md', null]

/** The answers, in groups's order: this page's own, then the page for IT's to staff representatives, repeated as they are. */
const GROUPS = ['answers.security', 'answers.purchasing', 'answers.staff']
const THEIRS = ['answers.staff']

/**
 * The top's empty half, drawn in marker on a wide window: a town hall, its steps, columns and door, the
 * felt-tip's sunflower on its flag and Jean's tilde on its pediment. No word in it, hidden from screen readers.
 */
const HALL = /* html */ `<svg class="ps-hall" viewBox="0 0 360 300" aria-hidden="true">
  <path d="M34 284C120 282 240 285 326 283M46 270C130 268 230 271 314 269M58 256C140 254 222 257 302 255"/>
  <path d="M62 120C140 118 222 121 298 119M60 136C140 134 222 137 300 135M62 120L61 136M298 119L300 135"/>
  <path d="M52 120C100 98 146 78 180 62C214 78 260 98 308 119"/>
  <path d="M82 140C83 180 81 220 82 254M100 140C99 180 101 220 100 254M128 140C129 180 127 220 128 254M146 140C145 180 147 220 146 254M214 140C215 180 213 220 214 254M232 140C231 180 233 220 232 254M260 140C261 180 259 220 260 254M278 140C277 180 279 220 278 254"/>
  <path d="M166 254C166 230 165 214 167 204C170 190 190 190 193 204C195 214 194 230 194 254"/>
  <path class="is-tilde" d="M154 104q13-15 26 0t26 0"/>
  <path d="M180 62C181 50 179 36 180 20"/><path class="is-felt" d="M181 22C196 17 206 29 222 23C221 30 223 36 222 42C206 48 196 36 181 41"/>
</svg>`

/** The page for IT's words in each language, for the answers it gives as a list, which kit.from() doesn't. */
const IT = Object.fromEntries(await Promise.all(Object.keys(ADDRESSES).map(async (lang) => [lang, await wordsOf('enterprise', lang)])))

/** @type {import('../site.js').Page} */
export default {
  addresses: ADDRESSES,
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/\.$/, '')}`,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const count = new Intl.NumberFormat(lang)
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { threshold: money.format(THRESHOLD), price: money.format(PRICE), small: count.format(SMALL), ...more })
    const it = kit.from('enterprise')
    const enterprise = kit.link('enterprise')
    const key = kit.link('enterprise-key')
    const trial = key ? `${key}#trial` : `mailto:${CONTACT}`
    // The page's whole address, to show and to send: the site's, or the brand's own, where only it has the page.
    const address = kit.address(lang) ?? `https://${kit.brand.domain}/${ADDRESSES[lang]}`
    const mail = `mailto:?subject=${encodeURIComponent(kit.text('mail.subject'))}&amp;body=${encodeURIComponent(kit.text('mail.body', { page: address }))}`
    /** A group's answers, each its question, its answer and its status, one of the page for IT's. @param {string} group */
    const answers = (group) => {
      const rows = THEIRS.includes(group)
        ? /** @type {string[][]} */ ((IT[lang] ?? IT.en)[group]).map((row) => row.map((cell) => xml(fill(cell, { name: kit.brand.name, domain: kit.brand.domain }))))
        : kit.table(group, 3)
      for (const [, , code] of rows) if (!STATUSES.includes(code)) throw new Error(`site/public-sector/${lang}.json: an answer's status is ${code}, not one of ${STATUSES.join(', ')}`)
      return rows
    }
    const groups = kit.list('groups')
    const docs = kit.table('trust.docs', 2)
    if (groups.length !== GROUPS.length || docs.length !== DOCS.length) throw new Error(`site/public-sector/${lang}.json: groups or trust.docs has a row too many or too few`)
    const doc = (/** @type {string | null} */ path) => (path === null ? REPOSITORY : `${REPOSITORY}/blob/main/${path}`)
    const node = (/** @type {string[]} */ [name, text], kind = '', drawn = name) => /* html */ `<li class="ps-node${kind}"><b>${drawn}</b><small>${text}</small></li>`
    return /* html */ `<section class="site-hero ps-hero" aria-labelledby="ps-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="ps-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="ps-nokey">${highlight(say('nokey'))} ${say('nokey.why')}</p>
    <p class="site-cta"><a class="button primary" href="${trial}">${say('cta')}</a><a class="button" href="#ps-share">${say('share')}</a><a href="${kit.start}">${it.say('try')}</a></p>
    <ul class="site-facts is-felt">${kit.list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  ${HALL}
</section>

<section class="site-section is-side" aria-labelledby="ps-ai">
  <header><h2 id="ps-ai">${say('ai.title')}</h2><p class="site-why">${say('ai.why')}</p></header>
  <figure class="ps-path" aria-labelledby="ps-path-caption">
    <ol class="ps-flow">${kit.table('path.nodes', 2).map((cells, i) => `${i ? /* html */ `<li class="ps-arrow" aria-hidden="true">${FELT.across}</li>` : ''}${node(cells)}`).join('')}</ol>
    <ul class="ps-sides">${kit.table('path.sides', 2).map((cells, i) => (i === 2 ? node(cells, ' is-none', felt(cells[0], 'strike')) : node(cells))).join('')}</ul>
    <figcaption id="ps-path-caption"><span class="visually-hidden">${it.say('path.label')}: </span>${it.say('path.caption')}</figcaption>
  </figure>
</section>

<section class="site-section" aria-labelledby="ps-buy">
  <header><h2 id="ps-buy">${it.say('price.title')}</h2><p class="site-why">${say('buy.why')}</p></header>
  <table class="ps-bands">
    <caption>${say('buy.caption')}</caption>
    <thead><tr><td></td><th scope="col">${say('buy.year')}</th><th scope="col">${say('buy.years')}</th></tr></thead>
    <tbody>
      <tr><th scope="row">${say('buy.under')}</th><td colspan="2">${say('buy.free')}</td></tr>
      <tr><th scope="row">${say('buy.over')}</th><td>${xml(money.format(PRICE))}</td><td>${felt(xml(money.format(PRICE * YEARS)), 'circle')}</td></tr>
    </tbody>
  </table>
  <p class="site-cta"><a class="button primary" href="${trial}">${say('cta')}</a>${enterprise ? /* html */ `<a href="${enterprise}#ent-price">${say('buy.more')}</a>` : ''}</p>
</section>

<section class="site-section is-side" aria-labelledby="ps-answers">
  <header><h2 id="ps-answers">${say('answers.title')}</h2><p class="site-why">${say('answers.why')}</p></header>
  <div class="ps-groups">${GROUPS.map((group, g) => /* html */ `
    <div class="ps-group">
      <h3>${groups[g]}</h3>
      <dl class="ps-answers">${answers(group).map(([question, answer, code]) => /* html */ `
        <div class="ps-row"><dt>${question}</dt><dd>${answer}</dd><dd><span class="ps-status is-${code}">${it.say(`status.${code}`)}</span></dd></div>`).join('')}
      </dl>
    </div>`).join('')}
  </div>
  ${enterprise ? /* html */ `<p><a href="${enterprise}#ent-answers">${say('answers.more')}</a></p>` : ''}
</section>

<section class="site-section" aria-labelledby="ps-trust">
  <h2 id="ps-trust">${say('trust.title')}</h2>
  <ul class="ps-docs">${docs.map(([name, text], i) => /* html */ `<li><a href="${doc(DOCS[i])}"><b>${name}</b><span>${text}</span></a></li>`).join('')}</ul>
  ${enterprise ? /* html */ `<p><a href="${enterprise}#ent-trust">${say('trust.more')}</a></p>` : ''}
</section>

<section id="ps-share" class="site-section is-side site-end" aria-labelledby="ps-share-title">
  ${WAVE}
  <h2 id="ps-share-title">${it.say('share.title')}</h2>
  <p class="site-why">${say('end.body')}</p>
  <p class="ps-address">${FELT.point}${xml(address)}</p>
  <p class="site-cta"><a class="button primary" href="${mail}">${say('end.send')}</a><a class="button" href="${trial}">${say('cta')}</a></p>
  <p><a href="mailto:${CONTACT}">${it.say('share.write', { contact: CONTACT })}</a></p>
</section>`
  },
}
