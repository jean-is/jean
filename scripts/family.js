// jean.is's family page (D424): what a child's profile is, for the parent who reads before setting one
// up, as a page of its own beside the app, family.html at /family in English and famille.html at
// /famille in French, each naming the other for search engines. build:web writes them only for the site whose
// address is the brand's own domain, as it does the page under the app's first screen (scripts/home.js, D397).
// It promises the profile (D389, D390) and shows how often the brains a child's profile asks give the answer
// anyway, never the tutor itself, until its gate passes (D394). Its words are scripts/family/<lang>.json, the
// app's own catalogues where the app says the same (a profile's topics, choices, labels and notices), and the
// homepage's for the family's tiles; its look scripts/family/family.css over the app's style sheet and
// look, as the privacy policy has them. `node scripts/serve.js --home` (npm run dev:home) serves it.
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dir, languageName } from '../app/core/i18n.js'
import { xml } from './desktop.js'
import { SHARE } from './manifest.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HERE = join(ROOT, 'scripts', 'family')
const APP = join(ROOT, 'app')

/** Each language's address for the page, at the site's root: its own word for family. */
export const ADDRESSES = /** @type {Record<string, string>} */ ({ en: 'family', fr: 'famille' })

/** The page's address in a language, English's where it has none, as the homepage's door links it. @param {string} lang */
export const familyAddress = (lang) => ADDRESSES[lang] ?? ADDRESSES.en

/** @typedef {Record<string, string | string[] | string[][]>} Words */

/** The languages with a page, English first: one file of words each, and an address. */
export async function familyLanguages () {
  const langs = (await readdir(HERE)).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length))
  for (const lang of langs) if (!ADDRESSES[lang]) throw new Error(`scripts/family/${lang}.json has no address in ADDRESSES`)
  return ['en', ...langs.filter((lang) => lang !== 'en').sort()]
}

/** A language's words for the page. @param {string} lang @returns {Promise<Words>} */
export const familyWords = async (lang) => JSON.parse(await readFile(join(HERE, `${lang}.json`), 'utf8'))

/** The page's style sheet. */
export const familyStyle = () => readFile(join(HERE, 'family.css'), 'utf8')

/** The homepage's words in a language, English's where it has none, for the family's tiles. @param {string} lang */
const homeWords = async (lang) => JSON.parse(await readFile(join(ROOT, 'scripts', 'home', `${lang}.json`), 'utf8').catch(() => readFile(join(ROOT, 'scripts', 'home', 'en.json'), 'utf8')))

/** The app's own words the page repeats, in a catalogue part each, English's where a language has none. */
const APP_WORDS = [
  ['', ['composer.placeholder', 'composer.ai', 'welcome.files', 'welcome.privacy', 'welcome.terms', 'profiles.add']],
  ['first', ['first.free']],
  ['profiles', ['profiles.forChild', 'profiles.born', 'profiles.tier', 'profiles.change', 'profiles.topics', 'profiles.choice.explain', 'profiles.choice.parent',
    'profiles.choice.later', 'profiles.sources', 'profiles.source.vikidia', 'profiles.concern', 'profiles.kind.bullying', 'profiles.whatToDo', 'profiles.seen',
    'profiles.never', 'profiles.time', 'profiles.shared', 'profiles.understood', 'profiles.locked',
    ...['sexuality', 'frightening', 'drugs', 'violence', 'gambling', 'weapons', 'extremism', 'body', 'death'].map((topic) => `profiles.topic.${topic}`)]],
]

/** @param {string} lang @returns {Promise<Record<string, string>>} */
export async function appWords (lang) {
  /** @type {Record<string, string>} */
  const words = {}
  for (const [part, keys] of APP_WORDS) {
    for (const code of ['en', lang]) {
      const catalogue = JSON.parse(await readFile(join(APP, 'locales', /** @type {string} */ (part), `${code}.json`), 'utf8').catch(() => '{}'))
      for (const key of keys) if (typeof catalogue[key] === 'string') words[key] = catalogue[key]
    }
  }
  return words
}

/**
 * How often each brain gave a child the answer to their own work, as a child's profile asks it now (Learn it
 * with each message), from test/tutor/results.md, which `npm run tutor -- --write` keeps: its name, where it
 * ran, the shares, and the day it was measured.
 * @returns {Promise<Array<{ brain: string, provider: string, given: number, pressure: number, date: string }>>}
 */
export async function measured () {
  const text = await readFile(join(ROOT, 'test', 'tutor', 'results.md'), 'utf8').catch(() => '')
  const rows = []
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    const label = cells[1] ?? ''
    if (!line.startsWith('|') || !label.endsWith(', Learn it with each message')) continue
    const named = label.slice(0, -', Learn it with each message'.length)
    const [, brain = named, provider = ''] = /^(.+?) \(([\w.-]+)/.exec(named) ?? []
    const date = new RegExp(`^## ${named.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, Learn it with each message, (\\d{4}-\\d{2}-\\d{2})`, 'm').exec(text)?.[1] ?? ''
    rows.push({ brain, provider, given: Number(cells[2].replace(/\D/g, '')) / 100, pressure: Number(cells[3].replace(/\D/g, '')) / 100, date })
  }
  return rows
}

/**
 * The theme script the app's own documents run first (app/privacy.html): the person's look and light or dark,
 * as Jean shows them, and the hash the page's policy allows it by.
 */
export async function theme () {
  const html = await readFile(join(APP, 'privacy.html'), 'utf8')
  const script = /<script>([^<]*)<\/script>/.exec(html)?.[1]
  if (!script) throw new Error('app/privacy.html has no theme script')
  return { script, hash: `'sha256-${createHash('sha256').update(script).digest('base64')}'` }
}

/** A text with its {params} filled. @param {string} text @param {Record<string, string>} params */
const fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, key) => params[key] ?? whole)

const ICONS = {
  lock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
  bell: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  brain: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M7.5 12.5c1.5-2.4 3-2.4 4.5 0s3 2.4 4.5 0"/></svg>',
  computer: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M2.5 19.5h19"/></svg>',
  key: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 19 4M16 7l2 2M14 9l2 2"/></svg>',
  never: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>',
  note: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  app: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17"/></svg>',
  tree: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M6 16v-3h12v3"/></svg>',
  file: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/></svg>',
  plusSmall: '<svg class="icon is-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg class="icon is-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  globe: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5s1.1-5.9 3.6-8.5z"/></svg>',
}
const WAVE = '<app-persona data-presence="idle" aria-hidden="true"><svg class="persona" viewBox="12 18 40 28" focusable="false"><g class="persona-wave"><path class="persona-line" d="M-34 32q6-11 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0"/></g></svg></app-persona>'
/** A week of a child's minutes, the last day today, as the parent's profile counts them. */
const WEEK = [40, 55, 20, 65, 30, 0, 35]

/**
 * The page, in one language, as a whole document.
 * @param {Words} words  scripts/family/<lang>.json
 * @param {Record<string, string>} app  appWords()'s, in the same language
 * @param {Record<string, unknown>} home  the homepage's words in the same language, for the family's tiles
 * @param {{ lang: string, brand: { name: string, domain: string }, base: string, languages: string[], rows: Awaited<ReturnType<typeof measured>>, theme: Awaited<ReturnType<typeof theme>>, now?: Date }} context
 */
export function familyOf (words, app, home, { lang, brand, base, languages, rows, theme: { script, hash }, now = new Date() }) {
  const params = { name: brand.name, domain: brand.domain, free: app['first.free'] ?? '', tier: app['profiles.tier'] ?? '', forChild: app['profiles.forChild'] ?? '' }
  /** One of the page's strings, filled and escaped. @param {string} key */
  const say = (key) => {
    const text = words[key]
    if (typeof text !== 'string') throw new Error(`scripts/family/${lang}.json: ${key} is missing or not a string`)
    return xml(fill(text, params))
  }
  /** @param {string} key @returns {string[]} */
  const list = (key) => {
    const items = words[key]
    if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) throw new Error(`scripts/family/${lang}.json: ${key} is missing or not a list`)
    return /** @type {string[]} */ (items).map((item) => xml(fill(item, params)))
  }
  /** @param {string} key @returns {string[][]} */
  const table = (key) => {
    const items = words[key]
    if (!Array.isArray(items) || items.some((item) => !Array.isArray(item))) throw new Error(`scripts/family/${lang}.json: ${key} is missing or not a list of lists`)
    return /** @type {string[][]} */ (items).map((item) => item.map((cell) => xml(fill(cell, params))))
  }
  /** One of the app's strings, filled and escaped. @param {string} key @param {Record<string, string>} [more] */
  const appSays = (key, more = {}) => xml(fill(app[key] ?? '', { ...params, ...more }))
  /** One of the homepage's strings. @param {string} key */
  const homeSays = (key) => xml(fill(String(home[key] ?? ''), params))
  const dirOf = dir(lang)
  const address = (/** @type {string} */ code) => base + ADDRESSES[code]
  // The app in this language: its address at the site's root for English, a language's own otherwise (D397).
  const jean = lang === 'en' ? './' : lang
  const percent = new Intl.NumberFormat(lang, { style: 'percent' })
  const span = (/** @type {number} */ minutes) => new Intl.DurationFormat(lang, { style: 'short', minutesDisplay: 'always' }).format({ hours: Math.floor(minutes / 60), minutes: minutes % 60 })
  const days = WEEK.map((_, i) => new Intl.DateTimeFormat(lang, { weekday: 'narrow' }).format(new Date(now.getTime() - (WEEK.length - 1 - i) * 86_400_000)))
  const when = new Intl.DateTimeFormat(lang, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 10))
  const born = String(now.getFullYear() - 11)
  const topic = (/** @type {string} */ key, /** @type {number} */ on) => `<li class="fam-topic"><span>${appSays(`profiles.topic.${key}`)}</span><span class="fam-choices" aria-hidden="true">${['explain', 'parent', 'later'].map((choice, i) => `<span${i === on ? ' class="is-on"' : ''}>${appSays(`profiles.choice.${choice}`)}</span>`).join('')}</span></li>`
  const ticks = (/** @type {string[]} */ items) => `<ul class="fam-ticks">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
  const latest = rows.map((row) => row.date).sort().at(-1) ?? ''
  const day = latest ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${latest}T12:00:00`)) : ''
  const where = (/** @type {string} */ provider) => xml(fill(String(words[`learn.where.${provider}`] ?? words['learn.where.other']), { provider }))
  const tiles = [['note', 'tile.music'], ['app', 'tile.quiz'], ['tree', 'tile.tree'], ['file', 'tile.invitation']]
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
  return `<!doctype html>
<html lang="${lang}" dir="${dirOf}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${hash}; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<script>${script}</script>
<meta name="referrer" content="no-referrer">
<meta name="description" content="${description}">
<title>${title}</title>
<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="ui/style.css">
<link rel="stylesheet" href="family.css">
<link rel="canonical" href="${xml(address(lang))}">
${languages.map((code) => `<link rel="alternate" hreflang="${code}" href="${xml(address(code))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${xml(address(languages[0]))}">
${Object.entries(card).map(([property, content]) => `<meta property="${property}" content="${content}">`).join('\n')}
<meta name="twitter:card" content="summary_large_image">
</head>
<body class="fam">
<header class="fam-top">
  <a class="wordmark" href="${jean}">${WAVE}${xml(brand.name)}</a><span class="fam-for">${say('for')}</span>
  <nav class="fam-langs" aria-label="${say('languages')}">${ICONS.globe}${languages.map((code) => code === lang ? `<span lang="${code}" aria-current="page">${xml(languageName(code))}</span>` : `<a href="${ADDRESSES[code]}" hreflang="${code}" lang="${code}">${xml(languageName(code))}</a>`).join('')}</nav>
  <a class="button" href="${jean}">${say('open')}</a>
</header>
<main>
<section class="fam-hero" aria-labelledby="fam-title">
  <div class="fam-hero-text">
    <p class="fam-eyebrow">${say('eyebrow')}</p>
    <h1 id="fam-title">${say('h1')}</h1>
    <p class="fam-lede">${say('lede')}</p>
    <p class="fam-cta"><a class="button primary" href="${jean}?child">${say('cta')}</a><a href="#fam-decide">${say('see')}</a></p>
    <ul class="fam-facts">${list('facts').map((fact) => `<li>${fact}</li>`).join('')}</ul>
  </div>
  <div class="fam-pane" aria-hidden="true">
    <p class="fam-pane-head"><span>${say('profiles.title')}</span><span class="fam-lock">${ICONS.lock}${appSays('profiles.tier')}</span></p>
    <ul class="fam-people">
      <li><i>${xml([...fill(String(words.you), params)][0] ?? '')}</i><span><b>${say('you')}</b><small>${say('you.sub')}</small></span>${ICONS.lock}</li>
      <li><i>${xml([...fill(String(words['lea.name']), params)][0] ?? '')}</i><span><b>${say('lea')}</b><small>${say('lea.sub')}</small></span>${ICONS.lock}</li>
      <li><i>${xml([...fill(String(words.tom), params)][0] ?? '')}</i><span><b>${say('tom')}</b><small>${say('tom.sub')}</small></span></li>
      <li class="is-add"><i>${ICONS.plus}</i><span>${appSays('profiles.add')}</span></li>
    </ul>
  </div>
</section>

<section class="fam-section is-side" aria-labelledby="fam-use">
  <h2 id="fam-use">${say('use.title')}</h2>
  <div class="fam-stats">${table('use.stats').map(([number, text, source]) => `<p><b>${number}</b><span>${text}</span><small>${source}</small></p>`).join('')}</div>
  <dl class="fam-versus"><div><dt>${say('use.mostLabel')}</dt><dd>${say('use.most')}</dd></div><div><dt>${say('use.wantLabel')}</dt><dd>${say('use.want')}</dd></div></dl>
  <p class="fam-source">${say('use.sources')}</p>
</section>

<section id="fam-decide" class="fam-section" aria-labelledby="fam-decide-title">
  <header><h2 id="fam-decide-title">${say('decide.title')}</h2><p class="fam-why">${say('decide.why')}</p></header>
  <div class="fam-two">
    <div class="fam-pane" aria-hidden="true">
      <p class="fam-pane-head"><span>${say('decide.profile')}</span><span class="fam-lock">${ICONS.lock}${appSays('profiles.tier')}</span></p>
      <p class="fam-row"><span>${appSays('profiles.born')}</span><span>${born}</span></p>
      <p class="fam-row-head">${appSays('profiles.topics')}</p>
      <ul>${topic('sexuality', 0)}${topic('frightening', 1)}${topic('drugs', 1)}</ul>
      <p class="fam-more">${say('decide.more')}</p>
      <p class="fam-row"><span>${appSays('profiles.sources')}</span><span>${appSays('profiles.source.vikidia')}</span></p>
      <p class="fam-row"><span>${say('decide.pictures')}</span><span>${say('decide.picturesValue')}</span></p>
      <p class="fam-row"><span>${say('decide.brain')}</span><span>${say('decide.brainValue')}</span></p>
      <p class="fam-row is-change">${appSays('profiles.change')}</p>
    </div>
    ${ticks(list('decide.list'))}
  </div>
</section>

<section class="fam-section is-side" aria-labelledby="fam-told">
  <header><h2 id="fam-told">${say('told.title')}</h2><p class="fam-why">${say('told.why')}</p></header>
  <div class="fam-two">
    <div class="fam-stack" aria-hidden="true">
      <div class="fam-notice"><p>${ICONS.bell}${appSays('profiles.concern', { name: String(words['lea.name']), kind: app['profiles.kind.bullying'] ?? '', when })}</p><p class="fam-hint">${appSays('profiles.never')}</p>
        <p class="fam-actions"><span class="button primary">${appSays('profiles.whatToDo')}</span><span class="button">${appSays('profiles.seen')}</span></p></div>
      <div class="fam-pane fam-time"><p class="fam-time-head"><b>${say('told.timeTitle')}</b><span>${appSays('profiles.time', { today: span(WEEK.at(-1) ?? 0), week: span(WEEK.reduce((sum, n) => sum + n, 0)) })}</span></p>
        <svg class="fam-bars" viewBox="0 0 70 48" preserveAspectRatio="none">${WEEK.map((minutes, i) => { const h = Math.max(1, Math.round(minutes / Math.max(...WEEK) * 46)); return `<rect${i === WEEK.length - 1 ? ' class="is-today"' : ''} x="${i * 10 + 1.5}" y="${48 - h}" width="7" height="${h}" rx="1.5"/>` }).join('')}</svg>
        <p class="fam-days">${days.map((d, i) => `<span${i === WEEK.length - 1 ? ' class="is-today"' : ''}>${xml(d)}</span>`).join('')}</p></div>
      <p class="fam-source">${say('told.source')}</p>
    </div>
    ${ticks(list('told.list'))}
  </div>
</section>

<section class="fam-section" aria-labelledby="fam-sees">
  <header><h2 id="fam-sees">${say('sees.title')}</h2><p class="fam-why">${say('sees.why')}</p></header>
  <div class="fam-two">
    <div class="fam-pane fam-child" aria-hidden="true">
      <p class="fam-child-top"><i>${xml([...fill(String(words['lea.name']), params)][0] ?? '')}</i><b>${xml(String(words['lea.name']))}</b><span class="fam-lock">${ICONS.lock}${appSays('profiles.tier')}</span></p>
      <p class="fam-asked" dir="auto">${say('sees.ask')}</p>
      <p class="fam-answer" dir="auto">${say('sees.answer')}</p>
      <div class="fam-shared"><p>${appSays('profiles.shared')}</p><span class="button">${appSays('profiles.understood')}</span></div>
      <p class="fam-box"><span>${appSays('composer.placeholder')}</span><span class="fam-chip">${ICONS.brain}${say('decide.brainValue')}</span></p>
      <p class="fam-ai">${appSays('composer.ai')}</p>
    </div>
    ${ticks(list('sees.list'))}
  </div>
</section>

<section id="fam-learn" class="fam-section is-side" aria-labelledby="fam-learn-title">
  <header><p class="fam-not-yet">${ICONS.clock}${say('learn.notYet')}</p><h2 id="fam-learn-title">${say('learn.title')}</h2><p class="fam-why">${say('learn.why')}</p></header>
  <div class="fam-two">
    <p class="fam-body">${say('learn.body')}</p>
    ${rows.length ? `<table class="fam-table"><thead><tr><th scope="col">${say('learn.brain')}</th><th scope="col">${say('learn.given')}</th><th scope="col">${say('learn.pressure')}</th></tr></thead><tbody>${rows.map((row) => `
      <tr><th scope="row"><bdi>${xml(row.brain)}</bdi> <small>${where(row.provider)}</small></th><td>${percent.format(row.given)}</td><td>${percent.format(row.pressure)}</td></tr>`).join('')}
    </tbody></table>` : `<p class="fam-body">${say('learn.none')}</p>`}
  </div>
  <p class="fam-source">${xml(fill(String(words['learn.source']), { ...params, date: day }))}</p>
</section>

<section class="fam-section" aria-labelledby="fam-where">
  <header><h2 id="fam-where">${say('where.title')}</h2><p class="fam-why">${say('where.why')}</p></header>
  <div class="fam-where">${table('where.cards').map(([name, text], i) => `<div${i === 2 ? ' class="is-never"' : ''}>${[ICONS.computer, ICONS.key, ICONS.never][i]}<h3>${name}</h3><p>${text}</p></div>`).join('')}</div>
  <p><a href="files">${appSays('welcome.files')}</a></p>
</section>

<section class="fam-section is-side" aria-labelledby="fam-family">
  <header><h2 id="fam-family">${say('family.title')}</h2><p class="fam-why">${say('family.why')}</p></header>
  <ul class="fam-tiles">${tiles.map(([icon, key]) => `<li>${ICONS[/** @type {keyof typeof ICONS} */ (icon)]}<p>${homeSays(key)}</p><a class="button" href="${jean}?q=${encodeURIComponent(String(home[key] ?? ''))}">${homeSays('tile.try')}</a></li>`).join('')}</ul>
  <p><a href="${jean}">${say('family.go')}</a></p>
</section>

<section class="fam-section" aria-labelledby="fam-limits">
  <h2 id="fam-limits">${say('limits.title')}</h2>
  <ul class="fam-limits">${list('limits.items').map((item) => `<li>${item}</li>`).join('')}</ul>
</section>

<section class="fam-section is-side" aria-labelledby="fam-faq">
  <h2 id="fam-faq">${say('faq.title')}</h2>
  <div class="fam-questions">${table('faq.items').map(([question, answer], i) => `
    <details name="fam-questions"${i ? '' : ' open'}><summary>${question}${ICONS.plusSmall}${ICONS.minus}</summary><p>${answer}</p></details>`).join('')}
  </div>
</section>

<section id="fam-start" class="fam-section fam-start" aria-labelledby="fam-start-title">
  ${WAVE}
  <h2 id="fam-start-title">${say('start.title')}</h2>
  <ol>${list('start.steps').map((step) => `<li>${step}</li>`).join('')}</ol>
  <p><a class="button primary" href="${jean}?child">${say('cta')}</a></p>
  <p class="fam-why">${say('start.note')}</p>
</section>
</main>
<footer class="fam-foot">
  <p>${say('foot.tagline')}</p>
  <nav><a href="${jean}">${xml(brand.domain)}</a><a href="files">${appSays('welcome.files')}</a><a href="source">${say('foot.source')}</a><a href="privacy">${appSays('welcome.privacy')}</a><a href="terms">${appSays('welcome.terms')}</a></nav>
  <p class="fam-made">${say('foot.made')}</p>
</footer>
</body>
</html>
`
}

/**
 * The site's files with the page: <address>.html for each language with words, and family.css.
 * @param {string} base  the site's address, siteBase()'s
 * @param {{ name: string, domain: string }} brand
 * @param {Date} [now]
 * @returns {Promise<Record<string, string>>}
 */
export async function familyFiles (base, brand, now = new Date()) {
  const languages = await familyLanguages()
  const [rows, script] = await Promise.all([measured(), theme()])
  /** @type {Record<string, string>} */
  const files = { 'family.css': await familyStyle() }
  for (const lang of languages) {
    files[`${ADDRESSES[lang]}.html`] = familyOf(await familyWords(lang), await appWords(lang), await homeWords(lang), { lang, brand, base, languages, rows, theme: script, now })
  }
  return files
}
