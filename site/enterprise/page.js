// The page for IT (D428): how an organisation puts every AI it approves in one assistant, deployed like a web page, for the IT,
// security, privacy, purchasing and staff representatives who decide together, mostly without a seller, at
// /enterprise in English and /fr/entreprise in French. Each part says one thing and shows it: any provider and any
// model, the least costly of them for each request, a pilot, the answers each role asks for with their status
// (built, with a key, by design, not yet), then what people get and what it costs. It claims nothing else. Its words
// are <lang>.json, the app's where they say the same (Auto's levels and reasons, what policy sets); its look
// enterprise.css, over site.css (site/site.js, D438). Its pane is Jean's own demo of what people get.
import { readFile } from 'node:fs/promises'
import { demoFiles, demoFrame } from '../demo.js'
import { FELT, ICONS, REPOSITORY, WAVE, caught, felt, hero, highlight, landing, underline, xml } from '../site.js'

/** Where questions go; keys are asked for on their own page (site/enterprise-key/). */
export const CONTACT = 'arnaud@jean.is'

/** The one rule (D428): free for an organisation of fewer than SMALL people; from SMALL, PRICE a year in euros excl. VAT, whatever its size. */
export const PRICE = 9900
export const SMALL = 250

/** The share people.fact cites: who brings their own AI tools to work. */
const SHARE = 0.78

/** The trust pack's documents, in trust.docs's order, as paths in the repository; null is the site's own page, a bare name another page of the site. */
const DOCS = ['docs/trust/threat-model.md', 'docs/trust/anssi.md', 'docs/trust/dpia.md', 'accessibility', 'docs/trust/pentest.md', 'docs/trust/releases.md', null, 'deploy/README.md', 'docs/enterprise.md']

/** Auto's levels, from the least costly, as the app's picker names them, and why Auto chose each, as a task's activity says it (ui/auto.js). */
const LEVELS = ['picker.fast', 'picker.smart', 'picker.best']
const CHOSEN = ['auto.demand.0', 'auto.demand.1', 'auto.demand.2']

/** What Intuition weighs, in bytes of download, as the app's own table of sizes says it (ui/caps.js); one it no longer says so stops the build. */
const WEIGHS = Number(/\breflexes: ([\d.e]+)/.exec(await readFile(new URL('../../app/ui/caps.js', import.meta.url), 'utf8'))?.[1])
if (!WEIGHS) throw new Error('app/ui/caps.js no longer says the size of Intuition’s download as site/enterprise/page.js reads it')

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
    const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 })
    const params = { contact: CONTACT, small: count.format(SMALL), price: money.format(PRICE), size: new Intl.NumberFormat(lang, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 }).format(WEIGHS / 1e6) }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    const jean = kit.start
    const pilot = REPOSITORY
    const files = kit.link('files')
    const doc = (/** @type {string | null} */ path) => (path === null ? files ?? REPOSITORY : path.includes('/') ? `${REPOSITORY}/blob/main/${path}` : kit.link(path) ?? REPOSITORY)
    const mail = `mailto:${CONTACT}`
    const key = kit.link('enterprise-key')
    // Each price's way on: the key page with its key chosen.
    const ways = [key ? `${key}#free` : mail, key ? `${key}#trial` : mail]
    const status = (/** @type {string} */ code) => {
      if (!STATUSES.includes(code)) throw new Error(`site/enterprise/${lang}.json: an answer's status is ${code}, not one of ${STATUSES.join(', ')}`)
      return /* html */ `<span class="ent-status is-${code}">${say(`status.${code}`)}</span>`
    }
    const roles = table('roles', 2)
    for (const [id] of roles) if (!ROLES.includes(id)) throw new Error(`site/enterprise/${lang}.json: role ${id} isn't one the style sheet knows`)
    const docs = list('trust.docs')
    const models = list('any.rows')
    const asks = list('cost.asks')
    const prices = table('price.cards', 4)
    const [fact, source] = list('people.fact')
    if (docs.length !== DOCS.length || models.length !== LEVELS.length || asks.length !== LEVELS.length || prices.length !== ways.length) throw new Error(`site/enterprise/${lang}.json: trust.docs, any.rows, cost.asks or price.cards has a row too many or too few`)
    // What weighs a request is called as the app calls it, so the page and Settings name one thing.
    if (!kit.text('cost.why').includes(kit.appText('cap.reflexes.name'))) throw new Error(`site/enterprise/${lang}.json: cost.why doesn't name ${kit.appText('cap.reflexes.name')}`)
    const not = (/** @type {string} */ part) => caught(say('limits.title'), list(`limits.${part}`))
    /** A role's answers: each its question, its answer and its status, one of STATUSES. @param {string} id */
    const answers = (id) => table(`answers.${id}`, 3)
    const node = (/** @type {string[]} */ [name, text], /** @type {string} */ kind = '', drawn = name) => /* html */ `<li class="ent-node${kind}">${SKETCH}<b>${drawn}</b><small>${text}</small></li>`
    /** A level as the app names it, its cost drawn before it: one coin for the least costly, three for the most. @param {number} i */
    const level = (i) => /* html */ `<span class="ent-cost" aria-hidden="true">${LEVELS.map((_, at) => /* html */ `<span${at <= i ? ' class="is-on"' : ''}></span>`).join('')}</span>${kit.app(LEVELS[i])}`
    const address = kit.address(lang)
    const top = hero(kit, { id: 'ent-title', title: underline(say('h1'), say('h1.mark')), lede: say('lede'), actions: /* html */ `<a class="button primary" href="${pilot}">${say('cta')}</a><a href="${jean}">${say('try')}</a>`, facts: list('facts'), aside: /* html */ `<figure class="ent-path" aria-labelledby="ent-path-caption">
    <ol class="ent-flow">${table('path.nodes', 2).map((cells, i) => `${i ? /* html */ `<li class="ent-arrow" aria-hidden="true">${FELT.across}</li>` : ''}${node(cells, '', i === 1 ? highlight(cells[0]) : cells[0])}`).join('')}</ol>
    <ul class="ent-sides">${table('path.sides', 2).map((cells, i) => (i === 2 ? node(cells, ' is-none', felt(cells[0], 'strike')) : node(cells))).join('')}</ul>
    <figcaption id="ent-path-caption"><span class="visually-hidden">${say('path.label')}: </span>${say('path.caption')}</figcaption>
  </figure>` })
    // Each part says one thing and shows it: its words on one side, a screen of the app's on the other.
    const any = /* html */ `<section class="site-block" aria-labelledby="ent-any"><div class="site-two ent-two">
  <div class="ent-body"><h3 id="ent-any">${say('any.title')}</h3><p class="site-why">${say('any.why')}</p></div>
  <div class="ent-pane">
    <p class="ent-pane-head"><span>${say('demo.brain')}</span><span class="ent-chip">${ICONS.lock}${kit.app('policy.locked')}</span></p>
    <dl class="ent-levels">${models.map((model, i) => /* html */ `<div><dt>${level(i)}</dt><dd>${model}</dd></div>`).join('')}</dl>
  </div>
</div></section>`
    const least = /* html */ `<section class="site-block" aria-labelledby="ent-cost"><div class="site-two ent-two">
  <div class="ent-body"><h3 id="ent-cost">${say('cost.title')}</h3><p class="site-why">${say('cost.why')}</p></div>
  <div class="ent-pane">
    <p class="ent-pane-head"><span>${xml(kit.brand.name)}</span><span class="ent-chip">${ICONS.brain}${kit.app('auto.name')}</span></p>
    <ol class="ent-asks">${asks.map((ask, i) => /* html */ `<li><p class="ent-asked" dir="${kit.dir}">${ask}</p><p class="ent-pick"><span class="ent-chip">${level(i)}</span><small>${kit.app(CHOSEN[i])}</small></p></li>`).join('')}</ol>
  </div>
</div></section>`
    const afternoon = /* html */ `<section id="ent-pilot" class="site-block" aria-labelledby="ent-pilot-title">
  <div class="site-two ent-two">
    <div class="ent-body">
      <h3 id="ent-pilot-title">${say('pilot.title')}</h3>
      <p class="site-why">${say('pilot.assist.body')}</p>
      <p><a href="${pilot}">${say('pilot.kit')}</a></p>
    </div>
    <div class="ent-assist">
      <pre dir="auto">${say('pilot.assist.prompt', { skill: SKILL })}</pre>
      <p><a href="${SKILL.replace('/tree/', '/blob/')}/SKILL.md">${say('pilot.assist.read')}</a></p>
    </div>
  </div>
  <details class="ent-manual">
    <summary><span>${say('pilot.manual')}</span>${ICONS.closed}${ICONS.open}</summary>
    <ol class="ent-steps">${table('pilot.steps', 2).map(([name, text], i) => /* html */ `<li><h4>${name}</h4><p>${text}</p><pre>${xml(SNIPPETS[i] ?? '')}</pre></li>`).join('')}</ol>
  </details>
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
  <div id="ent-trust" class="ent-trust">
    <h4>${say('trust.title')}</h4>
    <ul class="ent-docs">${docs.map((name, i) => /* html */ `<li><a href="${doc(DOCS[i])}">${name}</a></li>`).join('')}</ul>
  </div>
</section>`
    const box = /* html */ `<section class="site-block" aria-labelledby="ent-people">
  <div class="site-two ent-two">
    <div class="ent-body">
      <h3 id="ent-people">${say('people.title')}</h3>
      <p class="site-why">${say('people.body')}</p>
      <p class="ent-stat"><b>${felt(xml(percent.format(SHARE)), 'circle')}</b><span>${fact} <small>${source}</small></span></p>
      <p><a href="${jean}">${say('people.more')}</a></p>
    </div>
    <div class="ent-pane ent-demo">
      <p class="ent-pane-head" aria-hidden="true"><span>${xml(kit.brand.name)}</span><span class="ent-chip">${ICONS.brain}${say('demo.brain')}</span></p>
      ${demoFrame(kit)}
    </div>
  </div>
</section>`
    const price = /* html */ `<section class="site-block" aria-labelledby="ent-price">
  <h3 id="ent-price">${say('price.title')}</h3>
  <ul class="ent-prices">${prices.map(([name, cost, text, action], i) => /* html */ `<li><h4>${name}</h4><b>${i ? cost : felt(cost, 'circle')}</b><p>${text}</p><a class="button${i ? ' primary' : ''}" href="${ways[i]}">${action}</a></li>`).join('')}</ul>
  <p class="site-source">${say('price.note')}</p>
</section>`
    const share = /* html */ `${WAVE}
  <h3>${say('share.title')}</h3>
  ${address ? /* html */ `<p class="ent-address">${FELT.point}${xml(address)}</p>` : ''}
  <p><a href="${mail}">${say('share.write')}</a></p>`
    // The promise part by part: what the organisation approves, sets up and reviews, then what its people get and at
    // what price; each limit once, under the part it is about.
    return landing(kit, {
      top,
      promise: say('h1'),
      acts: {
        approved: { id: 'ent-approved', body: `${any}\n${least}\n${afternoon}\n${asked}`, catch: not('approved') },
        used: { id: 'ent-used', body: `${box}\n${price}`, catch: not('used') },
      },
      turn: { id: 'ent-share', body: share },
      questions: { id: 'ent-faq', name: 'ent-questions', title: say('faq.title'), items: table('faq.items', 2) },
    })
  },
}
