// The page for IT (D428): how an organisation puts every AI it approves in one assistant, deployed like a web page, for the IT,
// security, privacy, purchasing and staff representatives who decide together, mostly without a seller, at
// /enterprise in English and /fr/entreprise in French. Each answer says whether it is built, needs a key, holds by
// design or isn't built yet, and the page claims nothing else. Its words are <lang>.json, the app's where they say
// the same; its look enterprise.css, over site.css (site/site.js, D438). Its pane is Jean's own demo of what people get.
import { demoFiles, demoFrame } from '../demo.js'
import { FELT, ICONS, REPOSITORY, WAVE, caught, felt, highlight, landing, underline, xml } from '../site.js'

/** Where questions go; keys are asked for on their own page (site/enterprise-key/). */
export const CONTACT = 'arnaud@jean.is'

/** The one rule (D428): free for an organisation of fewer than SMALL people; from SMALL, PRICE a year in euros excl. VAT, whatever its size. */
export const PRICE = 9900
export const SMALL = 250

/** The shares why.facts cites, in its order, and Copilot's paid seats among Microsoft 365's (January 2026). */
const FACTS = [0.78, 15e6 / 450e6, 0.27]
const SEATS = { paid: 15e6, total: 450e6 }

/** The trust pack's documents, in trust.docs's order, as paths in the repository; null is the site's own page, a bare name another page of the site. */
const DOCS = ['docs/trust/threat-model.md', 'docs/trust/anssi.md', 'docs/trust/dpia.md', 'accessibility', 'docs/trust/pentest.md', 'docs/trust/releases.md', null, 'deploy/README.md', 'docs/enterprise.md']

/** The part of the promise each limit is about, in limits.items's order: its act says it, under what proves that part. */
const ABOUT = ['approved', 'approved', 'approved', 'used', 'used', 'approved']

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
/** The skill that sets up an organisation's copy from the example (D415): one address, for a coding assistant and for Settings › Skills. */
const SKILL = `${REPOSITORY}/tree/main/examples/enterprise/organisation-setup`

/** A box of the request's path as drawn on a whiteboard: two passes of the marker, a little past the corners. */
const SKETCH = '<svg class="ent-sketch" viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true"><path d="M-5 4Q150 1 305 2M301-2Q302 55 299 112M304 108Q150 110-4 107M1 111Q-1 55 2-1"/><path d="M-2 1Q150 5 302 5M298 1Q300 56 302 109M300 105Q150 106 2 110M-1 108Q2 55-1 3"/></svg>'

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'enterprise', fr: 'fr/entreprise', ko: 'ko/enterprise' },
  frames: true,
  // What people get, as Jean's own demo (D457): a spreadsheet summed up for the board, answered by the organisation's AI.
  files: (kit) => demoFiles(kit, { file: { name: kit.text('people.file'), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, asked: kit.text('people.ask'), brain: kit.text('demo.brain'), answer: kit.text('people.answer') }),
  // The name, then the heading's first clause: whole, it is longer than a search result shows.
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/,.*$|\.$/, '')}`,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const count = new Intl.NumberFormat(lang)
    const compact = new Intl.NumberFormat(lang, { notation: 'compact', compactDisplay: 'long' })
    const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 })
    const params = { contact: CONTACT, small: count.format(SMALL), price: money.format(PRICE), paid: compact.format(SEATS.paid), total: compact.format(SEATS.total) }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    const jean = kit.start
    const pilot = REPOSITORY
    const files = kit.link('files')
    const doc = (/** @type {string | null} */ path) => (path === null ? files ?? REPOSITORY : path.includes('/') ? `${REPOSITORY}/blob/main/${path}` : kit.link(path) ?? REPOSITORY)
    const mail = `mailto:${CONTACT}`
    const key = kit.link('enterprise-key')
    // Each card's way on: the pilot kit, then the key page with its key chosen.
    const ways = [pilot, key ? `${key}#trial` : mail, key ? `${key}#free` : mail]
    const status = (/** @type {string} */ code) => {
      if (!STATUSES.includes(code)) throw new Error(`site/enterprise/${lang}.json: an answer's status is ${code}, not one of ${STATUSES.join(', ')}`)
      return /* html */ `<span class="ent-status is-${code}">${say(`status.${code}`)}</span>`
    }
    const roles = table('roles', 2)
    for (const [id] of roles) if (!ROLES.includes(id)) throw new Error(`site/enterprise/${lang}.json: role ${id} isn't one the style sheet knows`)
    const facts = table('why.facts', 2)
    const docs = table('trust.docs', 2)
    const limits = list('limits.items')
    if (facts.length !== FACTS.length || docs.length !== DOCS.length || limits.length !== ABOUT.length) throw new Error(`site/enterprise/${lang}.json: why.facts, trust.docs or limits.items has a row too many or too few`)
    const not = (/** @type {string} */ part) => caught(say('limits.title'), limits.filter((limit, i) => ABOUT[i] === part))
    const head = list('compare.head')
    const compared = table('compare.rows', 5)
    /** A role's answers: each its question, its answer and its status, one of STATUSES. @param {string} id */
    const answers = (id) => table(`answers.${id}`, 3)
    const node = (/** @type {string[]} */ [name, text], /** @type {string} */ kind = '', drawn = name) => /* html */ `<li class="ent-node${kind}">${SKETCH}<b>${drawn}</b><small>${text}</small></li>`
    const address = kit.address(lang)
    const hero = /* html */ `<section class="site-hero" aria-labelledby="ent-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="ent-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${pilot}">${say('cta')}</a><a class="button" href="#ent-answers">${say('see')}</a><a href="${jean}">${say('try')}</a></p>
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <figure class="ent-path" aria-labelledby="ent-path-caption">
    <ol class="ent-flow">${table('path.nodes', 2).map((cells, i) => `${i ? /* html */ `<li class="ent-arrow" aria-hidden="true">${FELT.across}</li>` : ''}${node(cells, '', i === 1 ? highlight(cells[0]) : cells[0])}`).join('')}</ol>
    <ul class="ent-sides">${table('path.sides', 2).map((cells, i) => (i === 2 ? node(cells, ' is-none', felt(cells[0], 'strike')) : node(cells))).join('')}</ul>
    <figcaption id="ent-path-caption"><span class="visually-hidden">${say('path.label')}: </span>${say('path.caption')}</figcaption>
  </figure>
</section>`
    const why = /* html */ `<section class="site-block" aria-labelledby="ent-why">
  <h3 id="ent-why">${say('why.title')}</h3>
  <div class="site-stats">${facts.map(([text, source], i) => /* html */ `<p><b>${i ? xml(percent.format(FACTS[i])) : felt(xml(percent.format(FACTS[i])), 'circle')}</b><span>${text}</span><small>${source}</small></p>`).join('')}</div>
  <p class="ent-line">${say('why.line')}</p>
</section>`
    const afternoon = /* html */ `<section id="ent-pilot" class="site-block" aria-labelledby="ent-pilot-title">
  <h3 id="ent-pilot-title">${say('pilot.title')}</h3>
  <div class="ent-assist">
    <h4>${say('pilot.assist.title')}</h4>
    <p>${say('pilot.assist.body')}</p>
    <pre dir="auto">${say('pilot.assist.prompt', { skill: SKILL })}</pre>
    <p><a href="${SKILL.replace('/tree/', '/blob/')}/SKILL.md">${say('pilot.assist.read')}</a></p>
  </div>
  <details class="ent-manual">
    <summary><span>${say('pilot.manual')}</span>${ICONS.closed}${ICONS.open}</summary>
    <ol class="ent-steps">${table('pilot.steps', 2).map(([name, text], i) => /* html */ `<li><h4>${name}</h4><p>${text}</p><pre>${xml(SNIPPETS[i] ?? '')}</pre></li>`).join('')}</ol>
  </details>
  <p class="ent-after">${say('pilot.after')}</p>
  <p><a href="${pilot}">${say('pilot.kit')}</a></p>
</section>`
    const box = /* html */ `<section class="site-block" aria-labelledby="ent-people">
  <div class="site-two ent-two">
    <div class="ent-body">
      <h3 id="ent-people">${say('people.title')}</h3>
      <p>${say('people.body')}</p>
      <p><a href="${jean}">${say('people.more')}</a></p>
    </div>
    <div class="ent-pane">
      <p class="ent-pane-head" aria-hidden="true"><span>${xml(kit.brand.name)}</span><span class="ent-chip">${ICONS.brain}${say('demo.brain')}</span></p>
      ${demoFrame(kit)}
    </div>
  </div>
</section>`
    const asked = /* html */ `<section id="ent-answers" class="site-block" aria-labelledby="ent-answers-title">
  <header><h3 id="ent-answers-title">${say('answers.title')}</h3><p class="site-why">${say('answers.why')}</p></header>
  <fieldset class="ent-roles">
    <legend class="visually-hidden">${say('answers.show')}</legend>
    ${roles.map(([id], i) => /* html */ `<input type="radio" name="ent-role" id="ent-role-${id}"${i ? '' : ' checked'}>`).join('')}
    <div class="ent-tabs">${roles.map(([id, name]) => /* html */ `<label for="ent-role-${id}">${name}</label>`).join('')}</div>
    <div class="ent-panels">${roles.map(([id, name]) => /* html */ `
      <dl id="ent-panel-${id}" class="ent-panel" aria-label="${name}">${answers(id).map(([question, answer, code]) => /* html */ `
        <div class="ent-answer-row"><dt>${question}</dt><dd>${answer}</dd><dd>${status(code)}</dd></div>`).join('')}
      </dl>`).join('')}
    </div>
  </fieldset>
</section>`
    const compare = /* html */ `<section class="site-block" aria-labelledby="ent-compare">
  <header><h3 id="ent-compare">${say('compare.title')}</h3><p class="site-why">${say('compare.note')}</p></header>
  <div class="ent-scroll"><table class="ent-table" aria-labelledby="ent-compare">
    <thead><tr>${head.map((cell, i) => /* html */ `<th scope="col"${i === 1 ? ' class="is-jean"' : ''}>${i === 1 ? felt(cell, 'circle') : cell}</th>`).join('')}</tr></thead>
    <tbody>${compared.map(([what, ...cells]) => /* html */ `
      <tr><th scope="row">${what}</th>${cells.map((cell, i) => /* html */ `<td${i ? '' : ' class="is-jean"'}>${cell}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table></div>
</section>`
    const trust = /* html */ `<section id="ent-trust" class="site-block" aria-labelledby="ent-trust-title">
  <h3 id="ent-trust-title">${say('trust.title')}</h3>
  <ul class="ent-docs">${docs.map(([name, text], i) => /* html */ `<li><a href="${doc(DOCS[i])}"><h4>${name}</h4><span>${text}</span></a></li>`).join('')}</ul>
  <div class="ent-verify"><p>${say('trust.verify')}</p><pre>${xml(VERIFY)}</pre><p class="site-source">${say('trust.ci')}</p></div>
</section>`
    const price = /* html */ `<section class="site-block" aria-labelledby="ent-price">
  <h3 id="ent-price">${say('price.title')}</h3>
  <ul class="ent-prices">${table('price.cards', 4).map(([name, cost, text, action], i) => /* html */ `<li><h4>${name}</h4><b>${i ? cost : felt(cost, 'circle')}</b><p>${text}</p><a class="button${i ? '' : ' primary'}" href="${ways[i]}">${action}</a></li>`).join('')}</ul>
  <p class="ent-rule">${say('price.rule')}</p>
  <p class="site-source">${say('price.note')}</p>
</section>`
    const share = /* html */ `${WAVE}
  <h3>${say('share.title')}</h3>
  <p class="site-why">${say('share.body')}</p>
  ${address ? /* html */ `<p class="ent-address">${FELT.point}${xml(address)}</p>` : ''}
  <p><a href="${mail}">${say('share.write')}</a></p>`
    // The promise part by part: what the organisation governs, sets up and reviews, then what its people get and at
    // what price; each limit under the part it is about (ABOUT).
    return landing(kit, {
      top: hero,
      promise: say('h1'),
      acts: {
        approved: { id: 'ent-approved', body: `${why}\n${afternoon}\n${asked}\n${trust}`, catch: not('approved') },
        used: { id: 'ent-used', body: `${box}\n${compare}\n${price}`, catch: not('used') },
      },
      turn: { id: 'ent-share', body: share },
      questions: { id: 'ent-faq', name: 'ent-questions', title: say('faq.title'), items: table('faq.items', 2) },
    })
  },
}
