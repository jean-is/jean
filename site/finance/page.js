// SPDX-License-Identifier: MIT
// The page for banks, insurers and asset managers, the page for IT's sibling (D428), at /finance in English and
// /fr/finance in French: for whoever is asked to give a financial firm AI and must take it past security, third-party
// risk, data protection and compliance. Its promise in two acts: everyone gets the AI the firm already contracted, at
// one price; and no new vendor sits in the data path, shown as the DORA register entry a copy the firm serves makes,
// each reviewer's answers with their status, as the page for IT marks them, and the trust pack. Into Jean: a trial
// key, or the page sent to the committee. Its words are <lang>.json, the page for IT's where they say the same; its
// look finance.css, over site.css (site/site.js, D438).
import { CONTACT, PRICE, SMALL, STATUSES } from '../enterprise/page.js'
import { FELT, REPOSITORY, WAVE, caught, felt, hero, landing, underline, xml } from '../site.js'

/** @type {Record<string, string>} */
const ADDRESSES = { en: 'finance', fr: 'fr/finance' }

/** The share of the banks the ECB supervises directly that use generative AI, as its supervisory board's chair said on 22 September 2026 (models.source). */
const SHARE = 0.85

/** The firm sizes the price is shown at, beside its cost per person; above SMALL, or the build stops. */
const SIZES = [1000, 5000, 20000]
if (SIZES.some((size) => size < SMALL)) throw new Error(`site/finance: every size the price is shown at must be ${SMALL} people or more`)

/** The register entry's row whose value is circled by hand: what of the firm's data the vendor hosts or processes. */
const NONE = 2

/** The answers, in groups's order. */
const GROUPS = ['answers.security', 'answers.third', 'answers.data', 'answers.records']

/** The trust pack's documents, in trust.docs's order, as paths in the repository, or a bare name for a page of the site. */
const DOCS = ['docs/trust/threat-model.md', 'docs/trust/pentest.md', 'docs/trust/anssi.md', 'docs/trust/dpia.md', 'docs/trust/releases.md', 'files']

/**
 * The top's empty half, drawn in marker on a wide window: a vault's door in its frame, its wheel and hinges, a glint
 * in felt-tip and Jean's tilde in sunflower on the sill. No word in it, hidden from screen readers.
 */
const VAULT = /* html */ `<svg class="fin-vault" viewBox="0 0 360 300" aria-hidden="true">
  <path d="M44 34C130 31 230 33 316 32M315 30C317 120 314 200 316 280M318 278C230 281 130 279 42 280M43 282C41 190 44 110 42 32"/>
  <path d="M180 58C234 57 273 98 272 150C271 203 232 243 179 242C125 241 88 201 88 149C88 98 128 60 185 59"/>
  <path d="M180 84C218 83 246 113 246 150C246 188 217 216 180 216C142 216 114 187 114 150C114 115 142 85 176 85"/>
  <path d="M180 138C187 138 192 143 192 150C192 157 187 162 180 162C173 162 168 157 168 150C168 143 173 138 182 138"/>
  <path d="M180 137C181 125 179 113 180 102M191 144C201 138 211 132 222 126M191 156C201 162 211 168 222 174M180 163C179 175 181 187 180 198M169 156C159 162 149 168 138 174M169 144C159 138 149 132 138 126"/>
  <path d="M60 104C66 103 76 105 90 104M60 112C66 111 76 113 90 112M60 188C66 187 76 189 90 188M60 196C66 195 76 197 90 196"/>
  <path class="is-felt" d="M226 86C239 96 248 108 253 123"/>
  <path class="is-tilde" d="M158 262q11-12 22 0t22 0"/>
</svg>`

/** @type {import('../site.js').Page} */
export default {
  addresses: ADDRESSES,
  // The name, then the heading's first clause: whole, it is longer than a search result shows.
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/,.*$|\.$/, '')}`,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const cents = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const count = new Intl.NumberFormat(lang)
    const share = new Intl.NumberFormat(lang, { style: 'percent' }).format(SHARE)
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { small: count.format(SMALL), share, ...more })
    const it = kit.from('enterprise')
    const key = kit.link('enterprise-key')
    const trial = key ? `${key}#trial` : `mailto:${CONTACT}`
    // The page's whole address, to show and to send: the site's, or the brand's own, where only it has the page.
    const address = kit.address(lang) ?? `https://${kit.brand.domain}/${ADDRESSES[lang]}`
    const mail = `mailto:?subject=${encodeURIComponent(kit.text('mail.subject'))}&amp;body=${encodeURIComponent(kit.text('mail.body', { page: address }))}`
    const groups = kit.list('groups')
    const docs = kit.table('trust.docs', 2)
    const rows = kit.table('register.rows', 2)
    if (groups.length !== GROUPS.length || docs.length !== DOCS.length || rows.length <= NONE) throw new Error(`site/finance/${lang}.json: groups, trust.docs or register.rows has a row too many or too few`)
    /** A group's answers, each its question, its answer and its status, one of the page for IT's. @param {string} group */
    const answers = (group) => {
      const table = kit.table(group, 3)
      for (const [, , code] of table) if (!STATUSES.includes(code)) throw new Error(`site/finance/${lang}.json: an answer's status is ${code}, not one of ${STATUSES.join(', ')}`)
      return table
    }
    const doc = (/** @type {string} */ path) => (path.includes('/') ? `${REPOSITORY}/blob/main/${path}` : kit.link(path) ?? REPOSITORY)
    const node = (/** @type {string[]} */ [name, text], kind = '', drawn = name) => /* html */ `<li class="fin-node${kind}"><b>${drawn}</b><small>${text}</small></li>`
    const top = hero(kit, {
      id: 'fin-title',
      classes: 'fin-hero',
      eyebrow: say('eyebrow'),
      title: underline(say('h1'), say('h1.mark')),
      lede: say('lede'),
      actions: /* html */ `<a class="button primary" href="${trial}">${say('cta')}</a><a href="#fin-share">${say('share')}</a>`,
      facts: kit.list('facts'),
      aside: VAULT,
    })
    const models = /* html */ `<section class="site-block" aria-labelledby="fin-models">
  <header><h3 id="fin-models">${say('models.title')}</h3><p class="site-why">${say('models.why')}</p><p class="site-source">${say('models.source')}</p></header>
  <figure class="fin-path" aria-labelledby="fin-path-caption">
    <ol class="fin-flow">${kit.table('path.nodes', 2).map((cells, i) => `${i ? /* html */ `<li class="fin-arrow" aria-hidden="true">${FELT.across}</li>` : ''}${node(cells)}`).join('')}</ol>
    <ul class="fin-sides">${kit.table('path.sides', 2).map((cells, i) => (i === 2 ? node(cells, ' is-none', felt(cells[0], 'strike')) : node(cells))).join('')}</ul>
    <figcaption id="fin-path-caption"><span class="visually-hidden">${it.say('path.label')}: </span>${it.say('path.caption')}</figcaption>
  </figure>
</section>`
    const price = /* html */ `<section class="site-block" aria-labelledby="fin-price">
  <header><h3 id="fin-price">${say('price.title')}</h3><p class="site-why">${say('price.why')}</p></header>
  <table class="fin-price">
    <caption>${say('price.caption')}</caption>
    <thead><tr><th scope="col">${say('price.people')}</th><th scope="col">${say('price.year')}</th><th scope="col">${say('price.each')}</th></tr></thead>
    <tbody>
      <tr><th scope="row">${say('price.small')}</th><td>${say('price.free')}</td><td>${say('price.free')}</td></tr>${SIZES.map((size, i) => /* html */ `
      <tr><th scope="row">${xml(count.format(size))}</th><td>${xml(money.format(PRICE))}</td><td>${i + 1 === SIZES.length ? felt(xml(cents.format(PRICE / size)), 'circle') : xml(cents.format(PRICE / size))}</td></tr>`).join('')}
    </tbody>
  </table>
</section>`
    const register = /* html */ `<section class="site-block" aria-labelledby="fin-register">
  <header><h3 id="fin-register">${say('register.title')}</h3><p class="site-why">${say('register.why')}</p></header>
  <figure class="fin-entry" aria-labelledby="fin-entry-caption">
    <figcaption id="fin-entry-caption">${say('register.caption')}</figcaption>
    <dl>${rows.map(([label, value], i) => /* html */ `<div><dt>${label}</dt><dd>${i === NONE ? felt(value, 'circle') : value}</dd></div>`).join('')}</dl>
  </figure>
</section>`
    const review = /* html */ `<section class="site-block" aria-labelledby="fin-answers">
  <header><h3 id="fin-answers">${say('answers.title')}</h3><p class="site-why">${say('answers.why')}</p></header>
  <div class="fin-groups">${GROUPS.map((group, g) => /* html */ `
    <div class="fin-group">
      <h4>${groups[g]}</h4>
      <dl class="fin-answers">${answers(group).map(([question, answer, code]) => /* html */ `
        <div class="fin-row"><dt>${question}</dt><dd>${answer}</dd><dd><span class="fin-status is-${code}">${it.say(`status.${code}`)}</span></dd></div>`).join('')}
      </dl>
    </div>`).join('')}
  </div>
</section>`
    const pack = /* html */ `<section class="site-block" aria-labelledby="fin-trust">
  <h3 id="fin-trust">${say('trust.title')}</h3>
  <ul class="fin-docs">${docs.map(([name, text], i) => /* html */ `<li><a href="${doc(DOCS[i])}"><h4>${name}</h4><span>${text}</span></a></li>`).join('')}</ul>
</section>`
    const ending = /* html */ `${WAVE}
  <h3>${say('end.title')}</h3>
  <p class="site-why">${say('end.body')}</p>
  <p class="fin-address">${FELT.point}${xml(address)}</p>
  <p class="site-cta"><a class="button primary" href="${mail}">${say('end.send')}</a><a class="button" href="${trial}">${say('cta')}</a></p>
  <p><a href="mailto:${CONTACT}">${it.say('share.write', { contact: CONTACT })}</a></p>`
    return landing(kit, {
      top,
      promise: say('h1'),
      acts: {
        everyone: { id: 'fin-everyone', body: `${models}\n${price}`, catch: caught(say('catch.name'), kit.list('catch.everyone')) },
        vendor: { id: 'fin-vendor', body: `${register}\n${review}\n${pack}`, catch: caught(say('catch.name'), kit.list('catch.vendor')) },
      },
      turn: { id: 'fin-share', body: ending },
      questions: { id: 'fin-faq', name: 'fin-questions', title: say('faq.title'), items: kit.table('faq.items', 2) },
    })
  },
}
