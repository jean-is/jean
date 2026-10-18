// jean.is's page for IT (D428): how an organisation gets everyone's AI and deploys it like a web page, for the
// IT, security, privacy, purchasing and staff representatives who decide together, mostly without a seller,
// as a page of its own beside the app: enterprise.html at /enterprise in English and fr/entreprise.html at
// /fr/entreprise in French, each naming the other for search engines. build:web writes them only for the site
// whose address is the brand's own domain, as it does the family page (scripts/family.js, D424). Each answer
// says whether it is built, needs a key, holds by design or isn't built yet, and the page claims nothing else.
// Its words are scripts/enterprise/<lang>.json, the app's and the homepage's where they say the same; its look
// scripts/enterprise/enterprise.css over the app's style sheet. `node scripts/serve.js --home` serves it.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dir, languageName } from '../app/core/i18n.js'
import { xml } from './desktop.js'
import { ICONS, WAVE, theme, themeFor } from './family.js'
import { SHARE } from './manifest.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HERE = join(ROOT, 'scripts', 'enterprise')

/** Each language's address for the page, from the site's root: English's at the root, others under their own. */
export const ADDRESSES = /** @type {Record<string, string>} */ ({ en: 'enterprise', fr: 'fr/entreprise' })

/** The page's address in a language, English's where it has none, as the homepage links it. @param {string} lang */
export const enterpriseAddress = (lang) => ADDRESSES[lang] ?? ADDRESSES.en

/** Where questions and trial keys go. */
export const CONTACT = 'arnaud@jean.is'

/** The public repository holding the pilot kit's documentation, once it has an address; until then the site's /source. */
export const REPOSITORY = ''

/** The subscription: the people who can use Jean, and its price a year in euros, excl. VAT; free up to SMALL (D428). */
export const BANDS = [{ people: 250, price: 3900 }, { people: 1000, price: 9900 }, { people: 5000, price: 19900 }]
export const SMALL = 50

/** The shares why.facts cites, in its order, and Copilot's paid seats among Microsoft 365's (January 2026). */
const FACTS = [0.78, 15e6 / 450e6, 0.27]
const SEATS = { paid: 15e6, total: 450e6 }

/** The trust pack's documents, in trust.docs's order, as paths in the repository; null is the site's own page. */
const DOCS = ['trust/threat-model.md', 'trust/anssi.md', 'trust/dpia.md', 'trust/accessibility.md', 'trust/pentest.md', 'trust/releases.md', null, 'deploy/README.md', 'docs/enterprise.md']

/** The roles, as the style sheet names their radio buttons and panels, and the statuses an answer can have. */
const ROLES = ['security', 'privacy', 'it', 'purchasing', 'staff', 'ai']
const STATUSES = ['built', 'key', 'design', 'not']

/** What each pilot step shows, in pilot.steps's order: a command, a policy, a header, an address. */
const SNIPPETS = [
  'npm ci && npm run build:web',
  '{ "signIn": { "issuer": "https://login.microsoftonline.com/<tenant>/v2.0", "clientId": "…" },\n  "brains": [{ "baseURL": "https://ai.acme.example/v1", "auth": "oidc" }],\n  "rules": { "send": "ask", "share": "never" } }',
  "Content-Security-Policy: connect-src 'self' https://ai.acme.example",
  'https://assistant.acme.example/policy',
]
const VERIFY = 'ssh-keygen -Y verify -f allowed_signers -I jean.is -n file -s SHA256SUMS.sig < SHA256SUMS'

/** @typedef {Record<string, string | string[] | string[][]>} Words */

/** The languages with a page, English first: one file of words each, and an address. */
export async function enterpriseLanguages () {
  const langs = (await readdir(HERE)).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length))
  for (const lang of langs) if (!ADDRESSES[lang]) throw new Error(`scripts/enterprise/${lang}.json has no address in ADDRESSES`)
  return ['en', ...langs.filter((lang) => lang !== 'en').sort()]
}

/** A language's words for the page. @param {string} lang @returns {Promise<Words>} */
export const enterpriseWords = async (lang) => JSON.parse(await readFile(join(HERE, `${lang}.json`), 'utf8'))

/** The page's style sheet. */
export const enterpriseStyle = () => readFile(join(HERE, 'enterprise.css'), 'utf8')

/** A catalogue's words in a language over English's, those of a missing language being English's. @param {string} path @param {string} lang */
const catalogue = async (path, lang) => ({
  ...JSON.parse(await readFile(join(ROOT, path, 'en.json'), 'utf8')),
  ...JSON.parse(await readFile(join(ROOT, path, `${lang}.json`), 'utf8').catch(() => '{}')),
})

/** A text with its {params} filled. @param {string} text @param {Record<string, string>} params */
const fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, key) => params[key] ?? whole)

/**
 * The page, in one language, as a whole document.
 * @param {Words} words  scripts/enterprise/<lang>.json
 * @param {Record<string, unknown>} app  the app's main catalogue in the same language
 * @param {Record<string, unknown>} home  the homepage's words in the same language, for its foot
 * @param {{ lang: string, brand: { name: string, domain: string }, base: string, languages: string[], theme: Awaited<ReturnType<typeof theme>> }} context
 */
export function enterpriseOf (words, app, home, { lang, brand, base, languages, theme: root }) {
  const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const count = new Intl.NumberFormat(lang)
  const compact = new Intl.NumberFormat(lang, { notation: 'compact', compactDisplay: 'long' })
  const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 })
  const params = { name: brand.name, contact: CONTACT, small: count.format(SMALL), from: money.format(BANDS[0].price), paid: compact.format(SEATS.paid), total: compact.format(SEATS.total) }
  /** One of the page's strings, filled and escaped. @param {string} key */
  const say = (key) => {
    const text = words[key]
    if (typeof text !== 'string') throw new Error(`scripts/enterprise/${lang}.json: ${key} is missing or not a string`)
    return xml(fill(text, params))
  }
  /** @param {string} key @returns {string[]} */
  const list = (key) => {
    const items = words[key]
    if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) throw new Error(`scripts/enterprise/${lang}.json: ${key} is missing or not a list`)
    return /** @type {string[]} */ (items).map((item) => xml(fill(item, params)))
  }
  /** @param {string} key @param {number} [width] @returns {string[][]} */
  const table = (key, width) => {
    const items = words[key]
    if (!Array.isArray(items) || items.some((item) => !Array.isArray(item) || (width !== undefined && item.length !== width))) throw new Error(`scripts/enterprise/${lang}.json: ${key} is missing or not a list of lists${width ? ` of ${width}` : ''}`)
    return /** @type {string[][]} */ (items).map((item) => item.map((cell) => xml(fill(cell, params))))
  }
  /** One of the app's or the homepage's strings, filled and escaped. @param {Record<string, unknown>} from @param {string} key */
  const theirs = (from, key) => xml(fill(String(from[key] ?? ''), params))
  const address = (/** @type {string} */ code) => base + ADDRESSES[code]
  // From a page under a language's folder, the site's own files are one folder up.
  const up = '../'.repeat(ADDRESSES[lang].split('/').length - 1)
  const site = (/** @type {string} */ path) => up + path
  const { script, hash } = themeFor(root, up)
  // The app in this language: the site's root for English, a language's own address otherwise (D397).
  const jean = lang === 'en' ? up || './' : site(lang)
  const kit = REPOSITORY || site('source')
  const doc = (/** @type {string | null} */ path) => path === null ? site('files') : REPOSITORY ? `${REPOSITORY}/blob/main/${path}` : site('source')
  const mail = `mailto:${CONTACT}`
  const status = (/** @type {string} */ code) => {
    if (!STATUSES.includes(code)) throw new Error(`scripts/enterprise/${lang}.json: an answer's status is ${code}, not one of ${STATUSES.join(', ')}`)
    return `<span class="ent-status is-${code}">${say(`status.${code}`)}</span>`
  }
  const roles = table('roles', 2)
  for (const [id] of roles) if (!ROLES.includes(id)) throw new Error(`scripts/enterprise/${lang}.json: role ${id} isn't one the style sheet knows`)
  const facts = table('why.facts', 2)
  const docs = table('trust.docs', 2)
  if (facts.length !== FACTS.length || docs.length !== DOCS.length) throw new Error(`scripts/enterprise/${lang}.json: why.facts or trust.docs has a row too many or too few`)
  const head = list('compare.head')
  const compared = table('compare.rows', 5)
  /** A role's answers: its question and answer, filled and escaped, and its status as written. @param {string} id */
  const answers = (id) => table(`answers.${id}`, 3).map(([question, answer], i) => [question, answer, String(/** @type {string[][]} */ (words[`answers.${id}`])[i][2])])
  const title = `${say('title')} · ${say('h1').replace(/\.$/, '')}`
  const description = say('description')
  const card = {
    'og:type': 'website',
    'og:site_name': xml(brand.name),
    'og:title': title,
    'og:description': description,
    'og:url': xml(address(lang)),
    'og:image': xml(base + SHARE.src),
    'og:image:width': String(SHARE.width),
    'og:image:height': String(SHARE.height),
    'og:image:alt': xml(SHARE.alt),
  }
  const node = ([name, text], /** @type {string} */ kind = '') => `<li class="ent-node${kind}"><b>${name}</b><small>${text}</small></li>`
  return `<!doctype html>
<html lang="${lang}" dir="${dir(lang)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${hash}; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<script>${script}</script>
<meta name="referrer" content="no-referrer">
<meta name="description" content="${description}">
<title>${title}</title>
<link rel="icon" href="${site('icons/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${site('ui/style.css')}">
<link rel="stylesheet" href="${site('enterprise.css')}">
<link rel="canonical" href="${xml(address(lang))}">
${languages.map((code) => `<link rel="alternate" hreflang="${code}" href="${xml(address(code))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${xml(address(languages[0]))}">
${Object.entries(card).map(([property, content]) => `<meta property="${property}" content="${content}">`).join('\n')}
<meta name="twitter:card" content="summary_large_image">
</head>
<body class="ent">
<header class="ent-top">
  <a class="wordmark" href="${jean}">${WAVE}${xml(brand.name)}</a><span class="ent-for">${say('for')}</span>
  <nav class="ent-langs" aria-label="${say('languages')}">${ICONS.globe}${languages.map((code) => code === lang ? `<span lang="${code}" aria-current="page">${xml(languageName(code))}</span>` : `<a href="${site(ADDRESSES[code])}" hreflang="${code}" lang="${code}">${xml(languageName(code))}</a>`).join('')}</nav>
  <a class="button" href="${jean}">${say('open')}</a>
</header>
<main>
<section class="ent-hero" aria-labelledby="ent-title">
  <div class="ent-hero-text">
    <p class="ent-eyebrow">${say('eyebrow')}</p>
    <h1 id="ent-title">${say('h1')}</h1>
    <p class="ent-lede">${say('lede')}</p>
    <p class="ent-cta"><a class="button primary" href="${kit}">${say('cta')}</a><a class="button" href="#ent-answers">${say('see')}</a><a href="${jean}">${say('try')}</a></p>
    <ul class="ent-facts">${list('facts').map((fact) => `<li>${fact}</li>`).join('')}</ul>
  </div>
  <figure class="ent-path" aria-labelledby="ent-path-caption">
    <ol class="ent-flow">${table('path.nodes', 2).map((cells, i) => `${i ? '<li class="ent-arrow" aria-hidden="true"></li>' : ''}${node(cells)}`).join('')}</ol>
    <ul class="ent-sides">${table('path.sides', 2).map((cells, i) => node(cells, i === 2 ? ' is-none' : '')).join('')}</ul>
    <figcaption id="ent-path-caption"><span class="visually-hidden">${say('path.label')}: </span>${say('path.caption')}</figcaption>
  </figure>
</section>

<section class="ent-section is-side" aria-labelledby="ent-why">
  <h2 id="ent-why">${say('why.title')}</h2>
  <div class="ent-stats">${facts.map(([text, source], i) => `<p><b>${xml(percent.format(FACTS[i]))}</b><span>${text}</span><small>${source}</small></p>`).join('')}</div>
  <p class="ent-line">${say('why.line')}</p>
</section>

<section id="ent-pilot" class="ent-section" aria-labelledby="ent-pilot-title">
  <h2 id="ent-pilot-title">${say('pilot.title')}</h2>
  <ol class="ent-steps">${table('pilot.steps', 2).map(([name, text], i) => `<li><h3>${name}</h3><p>${text}</p><pre>${xml(SNIPPETS[i] ?? '')}</pre></li>`).join('')}</ol>
  <p class="ent-after">${say('pilot.after')}</p>
  <p><a href="${kit}">${say('pilot.kit')}</a></p>
</section>

<section class="ent-section is-side" aria-labelledby="ent-people">
  <div class="ent-two">
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
      <p class="ent-box">${theirs(app, 'composer.placeholder')}</p>
      <p class="ent-ai">${theirs(app, 'composer.ai')}</p>
    </div>
  </div>
</section>

<section id="ent-answers" class="ent-section" aria-labelledby="ent-answers-title">
  <header><h2 id="ent-answers-title">${say('answers.title')}</h2><p class="ent-why">${say('answers.why')}</p></header>
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

<section class="ent-section is-side" aria-labelledby="ent-compare">
  <header><h2 id="ent-compare">${say('compare.title')}</h2><p class="ent-why">${say('compare.note')}</p></header>
  <div class="ent-scroll"><table class="ent-table">
    <thead><tr>${head.map((cell, i) => `<th scope="col"${i === 1 ? ' class="is-jean"' : ''}>${cell}</th>`).join('')}</tr></thead>
    <tbody>${compared.map(([what, ...cells]) => `
      <tr><th scope="row">${what}</th>${cells.map((cell, i) => `<td${i ? '' : ' class="is-jean"'}>${cell}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table></div>
</section>

<section class="ent-section" aria-labelledby="ent-limits">
  <h2 id="ent-limits">${say('limits.title')}</h2>
  <ul class="ent-limits">${list('limits.items').map((item) => `<li>${item}</li>`).join('')}</ul>
</section>

<section id="ent-trust" class="ent-section is-side" aria-labelledby="ent-trust-title">
  <h2 id="ent-trust-title">${say('trust.title')}</h2>
  <ul class="ent-docs">${docs.map(([name, text], i) => `<li><a href="${doc(DOCS[i])}"><b>${name}</b><span>${text}</span></a></li>`).join('')}</ul>
  <div class="ent-verify"><p>${say('trust.verify')}</p><pre>${xml(VERIFY)}</pre><p class="ent-source">${say('trust.ci')}</p></div>
</section>

<section class="ent-section" aria-labelledby="ent-price">
  <h2 id="ent-price">${say('price.title')}</h2>
  <ul class="ent-prices">${table('price.cards', 4).map(([name, price, text, action], i) => `<li><h3>${name}</h3><b>${price}</b><p>${text}</p><a class="button${i ? '' : ' primary'}" href="${i ? mail : kit}">${action}</a></li>`).join('')}</ul>
  <table class="ent-bands">
    <caption>${say('price.bandsTitle')}</caption>
    <tbody>${BANDS.map((band) => `<tr><th scope="row">${xml(fill(String(words['price.band']), { people: count.format(band.people) }))}</th><td>${xml(money.format(band.price))}</td></tr>`).join('')}
      <tr><th scope="row">${say('price.more')}</th><td>${say('price.quote')}</td></tr></tbody>
  </table>
  <p class="ent-source">${say('price.note')}</p>
</section>

<section class="ent-section is-side" aria-labelledby="ent-faq">
  <h2 id="ent-faq">${say('faq.title')}</h2>
  <div class="ent-questions">${table('faq.items', 2).map(([question, answer], i) => `
    <details name="ent-questions"${i ? '' : ' open'}><summary>${question}${ICONS.plusSmall}${ICONS.minus}</summary><p>${answer}</p></details>`).join('')}
  </div>
</section>

<section class="ent-section ent-share" aria-labelledby="ent-share">
  ${WAVE}
  <h2 id="ent-share">${say('share.title')}</h2>
  <p class="ent-why">${say('share.body')}</p>
  <p class="ent-address">${xml(address(lang))}</p>
  <p><a href="${mail}">${say('share.write')}</a></p>
</section>
</main>
<footer class="ent-foot">
  <p>${theirs(home, 'foot.tagline')}</p>
  <nav><a href="${jean}">${xml(brand.domain)}</a><a href="${site('files')}">${theirs(app, 'welcome.files')}</a><a href="${kit}">${theirs(home, 'open.source')}</a><a href="${site('privacy')}">${theirs(app, 'welcome.privacy')}</a><a href="${site('terms')}">${theirs(app, 'welcome.terms')}</a></nav>
  <p class="ent-made">${theirs(home, 'foot.made')}</p>
</footer>
</body>
</html>
`
}

/**
 * The site's files with the page: <address>.html for each language with words, and enterprise.css.
 * @param {string} base  the site's address, siteBase()'s
 * @param {{ name: string, domain: string }} brand
 * @returns {Promise<Record<string, string>>}
 */
export async function enterpriseFiles (base, brand) {
  const languages = await enterpriseLanguages()
  const script = await theme()
  /** @type {Record<string, string>} */
  const files = { 'enterprise.css': await enterpriseStyle() }
  for (const lang of languages) {
    const [words, app, home] = await Promise.all([enterpriseWords(lang), catalogue('app/locales', lang), catalogue('scripts/home', lang)])
    files[`${ADDRESSES[lang]}.html`] = enterpriseOf(words, app, home, { lang, brand, base, languages, theme: script })
  }
  return files
}
