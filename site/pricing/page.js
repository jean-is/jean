// SPDX-License-Identifier: MIT
// The pricing page, the price's one address (D428 · D464), at /pricing in English, /fr/tarifs in French and /ko/pricing
// in Korean: free for a person, whichever AI answers, each AI's own price in a table; then an organisation's one rule,
// what its price comes to per person beside what a price per seat does (SEAT), and what is never for sale (D749). Its
// numbers are the page for IT's (PRICE, SMALL) and the public sector's (THRESHOLD), formatted with Intl in the page's
// language. Its words are <lang>.json, the homepage's four ways and their catch and the page for IT's price cards and
// note where it says the same; its look pricing.css, over site.css (site/site.js, D438). Only jean.is has it.
import { CONTACT, PRICE, SMALL } from '../enterprise/page.js'
import { THRESHOLD } from '../public-sector/page.js'
import { ICONS, WAVE, caught, felt, fill, hero, landing, underline, wordsOf, xml } from '../site.js'

const ADDRESSES = { en: 'pricing', fr: 'fr/tarifs', ko: 'ko/pricing' }

/** The sizes the price is shown at per person: the smallest that pays, then two larger; none under SMALL, or the build stops. */
const SIZES = [SMALL, 1000, 5000]
if (SIZES.some((size) => size < SMALL)) throw new Error(`site/pricing: every size the price is shown at must be ${SMALL} people or more`)

/**
 * A price per seat, set beside what Jean's comes to per person: a plan whose price is made as Jean's is, the seat on
 * one side and the AI's use billed on top, so the two compare; its list price a seat a month, billed yearly, as its
 * maker's page says it, and the day it was read there, as the comparison's sources are (site/compare/product.js).
 * Read the page again before changing either, never from memory.
 */
export const SEAT = { plan: 'Claude Enterprise', month: 20, currency: 'USD', source: 'claude-pricing', url: 'https://claude.com/pricing', checked: '2026-11-16' }

/** The homepage's four ways (`any.ways`), in the table's order, from no account to the company's; and which of its catch's lines (`any.catch`) this page's says. */
const WAYS = [2, 0, 1, 3]
const CATCH = [1, 2]

/** The homepage's and the page for IT's words in each language, for the lists this page says as they do, which kit.from() doesn't give. */
const THEIRS = Object.fromEntries(await Promise.all(Object.keys(ADDRESSES).map(async (lang) => [lang, { home: await wordsOf('home', lang), enterprise: await wordsOf('enterprise', lang) }])))

/** @type {import('../site.js').Page} */
export default {
  addresses: ADDRESSES,
  // The name, then the heading: whole, it fits a search result.
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/\.$/, '')}`,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const cents = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const count = new Intl.NumberFormat(lang)
    const seat = new Intl.NumberFormat(lang, { style: 'currency', currency: SEAT.currency, maximumFractionDigits: 0 })
    const day = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    const params = { small: count.format(SMALL), price: money.format(PRICE), zero: money.format(0), threshold: money.format(THRESHOLD) }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    /** One of another page's lists, of words or of rows, filled and escaped. @param {'home' | 'enterprise'} page @param {string} key */
    const theirs = (page, key) => {
      const value = (THEIRS[lang] ?? THEIRS.en)[page]?.[key]
      if (!Array.isArray(value)) throw new Error(`site/${page}/${lang}.json: ${key} is not a list, as site/pricing reads it`)
      const said = (/** @type {string} */ text) => xml(fill(text, { name: kit.brand.name, domain: kit.brand.domain, ...params }))
      return value.map((item) => (Array.isArray(item) ? item.map(said) : [said(item)]))
    }
    const ways = theirs('home', 'any.ways').map(([way]) => way)
    const lines = theirs('home', 'any.catch').map(([line]) => line)
    const [few, many] = theirs('enterprise', 'price.cards')
    const heads = list('ways.heads')
    const rows = table('ways.rows', 2)
    if (ways.length !== WAYS.length || rows.length !== WAYS.length || heads.length !== 3 || lines.length !== 3 || few?.length !== 4 || many?.length !== 4) throw new Error(`site/pricing/${lang}.json, or the homepage's any.ways or any.catch, or the page for IT's price.cards, has a row too many or too few`)
    const key = kit.link('enterprise-key')
    const mail = `mailto:${CONTACT}`
    const open = /* html */ `<a class="button primary" href="${kit.start}">${kit.say('open')}</a>`
    // Whoever hosts it for an organisation, shown the way to a key: beside a person's way in, and again at the end.
    const other = say('turn.other').replace('{ask}', () => /* html */ `<a href="${key ?? mail}">${few[3]}</a>`)
    const [you, organisation] = table('tags', 2)
    // The two prices, each leading to its part: a person's circled, an organisation's with its terms.
    const tag = (/** @type {string} */ act, /** @type {string[]} */ [who, what], /** @type {string} */ figure, /** @type {string} */ terms) => /* html */ `<li><a class="pricing-tag" href="#${act}"><span class="pricing-who"><b>${who}</b><small>${what}</small></span><span class="pricing-what"><b>${figure}</b><small>${terms}</small></span></a></li>`
    // The heading's first part underlined, what follows it kept together on a line of its own where it fits.
    const [h1, mark] = [say('h1'), say('h1.mark')]
    const rest = h1.slice(h1.indexOf(mark) + mark.length).trim()
    const top = hero(kit, {
      id: 'pricing-title',
      title: underline(h1, mark).replace(rest, () => /* html */ `<span class="pricing-rest">${rest}</span>`),
      lede: say('lede'),
      actions: /* html */ `${open}<span class="pricing-other">${other}</span>`,
      facts: list('facts'),
      classes: 'pricing-hero',
      aside: /* html */ `<ul class="pricing-tags">
    ${tag('pricing-you', you, felt(xml(money.format(0)), 'circle'), say('tags.free'))}
    ${tag('pricing-orgs', organisation, xml(money.format(PRICE)), say('year'))}
  </ul>`,
    })
    const costs = /* html */ `<section class="site-block" aria-labelledby="pricing-ways">
  <header><h3 id="pricing-ways">${say('ways.title')}</h3><p class="site-why">${say('ways.why')}</p></header>
  <table class="pricing-ways" aria-labelledby="pricing-ways">
    <thead><tr>${heads.map((head) => /* html */ `<th scope="col">${head}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([pay, need], i) => /* html */ `
      <tr><th scope="row"><span class="pricing-way">${ICONS.brain}${ways[WAYS[i]]}</span></th><td class="pricing-pay" data-label="${heads[1]}">${pay}</td><td data-label="${heads[2]}">${need}</td></tr>`).join('')}
    </tbody>
  </table>
</section>`
    const rule = /* html */ `<section class="site-block" aria-labelledby="pricing-rule">
  <header><h3 id="pricing-rule">${say('rule.title')}</h3><p class="site-why">${say('rule.why')}</p></header>
  <ul class="pricing-cards">
    <li><h4>${few[0]}</h4><p class="pricing-figure"><b>${felt(few[1], 'circle')}</b></p><p>${few[2]}</p><a class="button" href="${key ? `${key}#free` : mail}">${few[3]}</a></li>
    <li><h4>${many[0]}</h4><p class="pricing-figure"><b>${xml(money.format(PRICE))}</b><small>${say('year')}</small></p><p>${say('rule.size')}</p>
      <ul class="site-ticks pricing-ticks">${list('rule.ticks').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
      <a class="button primary" href="${key ? `${key}#trial` : mail}">${many[3]}</a></li>
  </ul>
  <div class="pricing-per">
    <h4>${say('per.title')}</h4>
    <div class="site-stats">${SIZES.map((size) => /* html */ `<p><b>${xml(cents.format(PRICE / size))}</b><span>${say('per.at', { count: count.format(size) })}</span></p>`).join('')}</div>
    <div class="pricing-seat">
      <p class="pricing-seat-figure"><b>${xml(seat.format(SEAT.month * 12))}</b><span>${say('seat.at')}</span></p>
      <div class="pricing-seat-note"><p>${say('seat.note', { plan: SEAT.plan, month: seat.format(SEAT.month) })}</p>
        <p class="site-source">${say('seat.source').replace('{source}', () => /* html */ `<a href="${xml(SEAT.url)}">${kit.from('compare').say(`source.${SEAT.source}`)}</a>`).replace('{date}', () => /* html */ `<time datetime="${SEAT.checked}">${xml(day.format(new Date(`${SEAT.checked}T12:00:00Z`)))}</time>`)}</p></div>
    </div>
  </div>
  <p class="site-source">${kit.from('enterprise').say('price.note')}</p>
</section>`
    const sale = /* html */ `<section class="site-block" aria-labelledby="pricing-sale">
  <h3 id="pricing-sale">${say('sale.title')}</h3>
  <ul class="pricing-nots">${table('sale.items', 2).map(([what, why]) => /* html */ `<li><h4>${felt(what, 'strike')}</h4><p>${why}</p></li>`).join('')}</ul>
</section>`
    const turn = /* html */ `${WAVE}
  <h3>${say('turn.body')}</h3>
  <p class="site-cta">${open}</p>
  <p class="pricing-other">${other}</p>`
    // The promise part by part: a person's price, then an organisation's; each limit once, under the part it is about.
    return landing(kit, {
      top,
      promise: say('h1'),
      acts: {
        you: { id: 'pricing-you', body: costs, catch: caught(kit.say('catch.name'), [...CATCH.map((i) => lines[i]), say('ways.limit')]) },
        orgs: { id: 'pricing-orgs', body: `${rule}\n${sale}`, catch: caught(kit.say('catch.name'), list('orgs.limits')) },
      },
      turn: { id: 'pricing-turn', body: turn },
      questions: { id: 'pricing-faq', name: 'pricing-questions', title: say('faq.title'), items: table('faq.items', 2) },
    })
  },
}
