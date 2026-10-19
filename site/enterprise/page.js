// The page for IT (D428): how an organisation gets everyone's AI and deploys it like a web page, for the IT,
// security, privacy, purchasing and staff representatives who decide together, mostly without a seller, at
// /enterprise in English and /fr/entreprise in French. Each answer says whether it is built, needs a key, holds by
// design or isn't built yet, and the page claims nothing else. Its words are <lang>.json, the app's where they say
// the same; its look enterprise.css, over site.css (site/site.js, D438).
import { ICONS, REPOSITORY, WAVE, questions, xml } from '../site.js'

/** Where questions and trial keys go. */
export const CONTACT = 'arnaud@jean.is'

/** The subscription: the people who can use Jean, and its price a year in euros, excl. VAT; free up to SMALL (D428). */
export const BANDS = [{ people: 250, price: 3900 }, { people: 1000, price: 9900 }, { people: 5000, price: 19900 }]
export const SMALL = 50

/** The shares why.facts cites, in its order, and Copilot's paid seats among Microsoft 365's (January 2026). */
const FACTS = [0.78, 15e6 / 450e6, 0.27]
const SEATS = { paid: 15e6, total: 450e6 }

/** The trust pack's documents, in trust.docs's order, as paths in the repository; null is the site's own page. */
const DOCS = ['trust/threat-model.md', 'trust/anssi.md', 'trust/dpia.md', 'trust/accessibility.md', 'trust/pentest.md', 'trust/releases.md', null, 'deploy/README.md', 'docs/enterprise.md']

/** The roles, as the style sheet names their radio buttons and panels, and the statuses an answer can have. */
export const ROLES = ['security', 'privacy', 'it', 'purchasing', 'staff', 'ai']
export const STATUSES = ['built', 'key', 'design', 'not']

/** What each pilot step shows, in pilot.steps's order: a command, a policy, a header, an address. */
const SNIPPETS = [
  'npm ci && npm run build:web',
  '{ "signIn": { "issuer": "https://login.microsoftonline.com/<tenant>/v2.0", "clientId": "…" },\n  "brains": [{ "baseURL": "https://ai.acme.example/v1", "auth": "oidc" }],\n  "rules": { "send": "ask", "share": "never" } }',
  "Content-Security-Policy: connect-src 'self' https://ai.acme.example",
  'https://assistant.acme.example/policy',
]
const VERIFY = 'ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s SHA256SUMS.sig < SHA256SUMS'

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'enterprise', fr: 'fr/entreprise' },
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/\.$/, '')}`,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const count = new Intl.NumberFormat(lang)
    const compact = new Intl.NumberFormat(lang, { notation: 'compact', compactDisplay: 'long' })
    const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 })
    const params = { contact: CONTACT, small: count.format(SMALL), from: money.format(BANDS[0].price), paid: compact.format(SEATS.paid), total: compact.format(SEATS.total) }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    const jean = kit.start
    const pilot = REPOSITORY
    const files = kit.link('files')
    const doc = (/** @type {string | null} */ path) => (path === null ? files ?? REPOSITORY : `${REPOSITORY}/blob/main/${path}`)
    const mail = `mailto:${CONTACT}`
    const status = (/** @type {string} */ code) => {
      if (!STATUSES.includes(code)) throw new Error(`site/enterprise/${lang}.json: an answer's status is ${code}, not one of ${STATUSES.join(', ')}`)
      return `<span class="ent-status is-${code}">${say(`status.${code}`)}</span>`
    }
    const roles = table('roles', 2)
    for (const [id] of roles) if (!ROLES.includes(id)) throw new Error(`site/enterprise/${lang}.json: role ${id} isn't one the style sheet knows`)
    const facts = table('why.facts', 2)
    const docs = table('trust.docs', 2)
    if (facts.length !== FACTS.length || docs.length !== DOCS.length) throw new Error(`site/enterprise/${lang}.json: why.facts or trust.docs has a row too many or too few`)
    const head = list('compare.head')
    const compared = table('compare.rows', 5)
    /** A role's answers: each its question, its answer and its status, one of STATUSES. @param {string} id */
    const answers = (id) => table(`answers.${id}`, 3)
    const node = (/** @type {string[]} */ [name, text], /** @type {string} */ kind = '') => `<li class="ent-node${kind}"><b>${name}</b><small>${text}</small></li>`
    const address = kit.address(lang)
    return `<section class="site-hero" aria-labelledby="ent-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="ent-title">${say('h1')}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${pilot}">${say('cta')}</a><a class="button" href="#ent-answers">${say('see')}</a><a href="${jean}">${say('try')}</a></p>
    <ul class="site-facts">${list('facts').map((fact) => `<li>${fact}</li>`).join('')}</ul>
  </div>
  <figure class="ent-path" aria-labelledby="ent-path-caption">
    <ol class="ent-flow">${table('path.nodes', 2).map((cells, i) => `${i ? '<li class="ent-arrow" aria-hidden="true"></li>' : ''}${node(cells)}`).join('')}</ol>
    <ul class="ent-sides">${table('path.sides', 2).map((cells, i) => node(cells, i === 2 ? ' is-none' : '')).join('')}</ul>
    <figcaption id="ent-path-caption"><span class="visually-hidden">${say('path.label')}: </span>${say('path.caption')}</figcaption>
  </figure>
</section>

<section class="site-section is-side" aria-labelledby="ent-why">
  <h2 id="ent-why">${say('why.title')}</h2>
  <div class="site-stats">${facts.map(([text, source], i) => `<p><b>${xml(percent.format(FACTS[i]))}</b><span>${text}</span><small>${source}</small></p>`).join('')}</div>
  <p class="ent-line">${say('why.line')}</p>
</section>

<section id="ent-pilot" class="site-section" aria-labelledby="ent-pilot-title">
  <h2 id="ent-pilot-title">${say('pilot.title')}</h2>
  <ol class="ent-steps">${table('pilot.steps', 2).map(([name, text], i) => `<li><h3>${name}</h3><p>${text}</p><pre>${xml(SNIPPETS[i] ?? '')}</pre></li>`).join('')}</ol>
  <p class="ent-after">${say('pilot.after')}</p>
  <p><a href="${pilot}">${say('pilot.kit')}</a></p>
</section>

<section class="site-section is-side" aria-labelledby="ent-people">
  <div class="site-two ent-two">
    <div class="ent-body">
      <h2 id="ent-people">${say('people.title')}</h2>
      <p>${say('people.body')}</p>
      <p><a href="${jean}">${say('people.more')}</a></p>
    </div>
    <div class="ent-pane" aria-hidden="true">
      <p class="ent-pane-head">${say('people.brand')}</p>
      <p class="ent-file" dir="auto">${ICONS.file}${say('people.file')}</p>
      <p class="ent-asked" dir="auto">${say('people.ask')}</p>
      <p class="ent-answer" dir="auto">${say('people.answer')}</p>
      <p class="ent-box">${kit.app('composer.placeholder')}</p>
      <p class="ent-ai">${kit.app('composer.ai')}</p>
    </div>
  </div>
</section>

<section id="ent-answers" class="site-section" aria-labelledby="ent-answers-title">
  <header><h2 id="ent-answers-title">${say('answers.title')}</h2><p class="site-why">${say('answers.why')}</p></header>
  <fieldset class="ent-roles">
    <legend class="visually-hidden">${say('answers.show')}</legend>
    ${roles.map(([id], i) => `<input type="radio" name="ent-role" id="ent-role-${id}"${i ? '' : ' checked'}>`).join('')}
    <div class="ent-tabs">${roles.map(([id, name]) => `<label for="ent-role-${id}">${name}</label>`).join('')}</div>
    <div class="ent-panels">${roles.map(([id, name]) => `
      <dl id="ent-panel-${id}" class="ent-panel" aria-label="${name}">${answers(id).map(([question, answer, code]) => `
        <div class="ent-answer-row"><dt>${question}</dt><dd>${answer}</dd><dd>${status(code)}</dd></div>`).join('')}
      </dl>`).join('')}
    </div>
  </fieldset>
</section>

<section class="site-section is-side" aria-labelledby="ent-compare">
  <header><h2 id="ent-compare">${say('compare.title')}</h2><p class="site-why">${say('compare.note')}</p></header>
  <div class="ent-scroll"><table class="ent-table">
    <thead><tr>${head.map((cell, i) => `<th scope="col"${i === 1 ? ' class="is-jean"' : ''}>${cell}</th>`).join('')}</tr></thead>
    <tbody>${compared.map(([what, ...cells]) => `
      <tr><th scope="row">${what}</th>${cells.map((cell, i) => `<td${i ? '' : ' class="is-jean"'}>${cell}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table></div>
</section>

<section class="site-section" aria-labelledby="ent-limits">
  <h2 id="ent-limits">${say('limits.title')}</h2>
  <ul class="site-limits">${list('limits.items').map((item) => `<li>${item}</li>`).join('')}</ul>
</section>

<section id="ent-trust" class="site-section is-side" aria-labelledby="ent-trust-title">
  <h2 id="ent-trust-title">${say('trust.title')}</h2>
  <ul class="ent-docs">${docs.map(([name, text], i) => `<li><a href="${doc(DOCS[i])}"><b>${name}</b><span>${text}</span></a></li>`).join('')}</ul>
  <div class="ent-verify"><p>${say('trust.verify')}</p><pre>${xml(VERIFY)}</pre><p class="site-source">${say('trust.ci')}</p></div>
</section>

<section class="site-section" aria-labelledby="ent-price">
  <h2 id="ent-price">${say('price.title')}</h2>
  <ul class="ent-prices">${table('price.cards', 4).map(([name, price, text, action], i) => `<li><h3>${name}</h3><b>${price}</b><p>${text}</p><a class="button${i ? '' : ' primary'}" href="${i ? mail : pilot}">${action}</a></li>`).join('')}</ul>
  <table class="ent-bands">
    <caption>${say('price.bandsTitle')}</caption>
    <tbody>${BANDS.map((band) => `<tr><th scope="row">${say('price.band', { people: count.format(band.people) })}</th><td>${xml(money.format(band.price))}</td></tr>`).join('')}
      <tr><th scope="row">${say('price.more')}</th><td>${say('price.quote')}</td></tr></tbody>
  </table>
  <p class="site-source">${say('price.note')}</p>
</section>

<section class="site-section is-side" aria-labelledby="ent-faq">
  <h2 id="ent-faq">${say('faq.title')}</h2>
  ${questions('ent-questions', table('faq.items', 2))}
</section>

<section class="site-section site-end" aria-labelledby="ent-share">
  ${WAVE}
  <h2 id="ent-share">${say('share.title')}</h2>
  <p class="site-why">${say('share.body')}</p>
  ${address ? `<p class="ent-address">${xml(address)}</p>` : ''}
  <p><a href="${mail}">${say('share.write')}</a></p>
</section>`
  },
}
