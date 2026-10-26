// Help (D612): the help home, at /help, and its articles, each a folder of site/help/ (D438) whose page.js says what
// kind of article it is, the moment of the home it belongs to, how long it takes to read, what it shows and its
// steps, and whose words are its <lang>.json over the home's. An article answers first, in a sentence or two; then
// shows, with Show me in Jean, a guided tour (D460) over the reader's own Jean opened where its steps start, or with
// Jean's own replay of a task (D462); then its parts, the words it explains, its steps, what is good to know, what to
// do when it doesn't work, Ask Jean, and the address to write to after that, then the article before it and the one
// after it in its moment, as the home lists them. A part or a step can show what it says, under it, with a caption
// (site/help/figures.js). Its words name Jean's menus and buttons by the app's own
// strings, so a step says what the reader's screen says, in bold; its tour, written beside it from the same steps
// (help/<folder>.<lang>.json), points at them by the same strings, and test/help.spec.js walks it over Jean as it is.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { demoFiles, demoFrame } from '../demo.js'
import { ICONS, SITE, SUPPORT, fill, glyph, xml } from '../site.js'

/** The home's moments, in the order people meet Jean; an article is in one. */
export const MOMENTS = ['start', 'ai', 'ask', 'make', 'safe', 'further', 'family', 'fix']

/**
 * What the words name, by their {params}: a part of Jean by the app's string for it ({settings}: Settings, in bold),
 * another article, by its folder ({refused}: a link to it, named by its h1), or another of the site's pages, by its
 * name ({files}: a link to it, named by Help's `page.files`).
 * @typedef {Record<string, string>} Names
 *
 * Where a step's stop points, on Jean's screen: the last element `on` finds that shows, or with `named`, the last of
 * them that the app's string `named` names (its aria-label, or words of its own or of one inside it). `go` is how
 * the stop goes on: once the reader clicks what it points at, or with Next (the default). Its words are the step's,
 * or those of the article's key `say`, where Show me has already done what the step says (opened Settings).
 * @typedef {{ on: string, named?: string, go?: 'click' | 'next', say?: string }} Point
 *
 * What shows a part or a step (site/help/figures.js), under it, and its caption, a key of the article's words.
 * @typedef {{ figure: import('./figures.js').Figure, caption: string }} Shown
 *
 * A step: its words are the article's `steps` at its place; what they name, where its stop points, and what shows it.
 * @typedef {{ names?: Names, point?: Point, show?: Shown }} Step
 *
 * A help article's page.js.
 * @typedef {object} Article
 * @property {Record<string, string>} addresses
 * @property {'explainer' | 'howto' | 'fix'} kind
 * @property {string} moment  one of MOMENTS
 * @property {number} minutes  to read it
 * @property {number} [start]  its place in the home's Start here, if it is in it
 * @property {Names} [names]  what its other words name
 * @property {Step[]} [steps]
 * @property {string} [open]  Show me: the page of Settings its tour opens Jean at, as Jean's address names it
 *   (brains/add, approvals…); an article with steps and no `open` has no Show me
 * @property {(kit: import('../site.js').Kit, text: (key: string) => string) => import('../demo.js').Task} [demo]  Jean's
 *   replay of a task, from its words as text
 * @property {Array<Shown | null>} [shows]  what shows each of its parts, in their order
 * @property {string[]} [also]  the articles its end links to, by folder
 */

/** Each moment's articles, by folder, as the home lists them: helpHome() reads every article, before any is written. @type {Map<string, string[]> | null} */
let sections = null

/** An article's folder, from its page's name (help/<folder>). @param {import('../site.js').Kit} kit */
const folderOf = (kit) => kit.name.split('/')[1]

/** Where its tour is, from the site's root, which Jean's ?help= reads (caps/tour/live.js). @param {import('../site.js').Kit} kit */
export const tourOf = (kit) => `help/${folderOf(kit)}.${kit.lang}.json`

/**
 * Its words, filled with what they name: `say` as HTML, a part of Jean in bold and an article as a link to it; `text`
 * as plain words, for a tour, each part of Jean as the app names it and an article by its h1.
 * @param {import('../site.js').Kit} kit @param {Names} [names]
 */
function wordsOf (kit, names = {}) {
  const part = (/** @type {string} */ key) => {
    if (key.startsWith('help/') || kit.has(`page.${key}`)) return null
    const name = fill(kit.appText(key), { name: kit.brand.name })
    if (!name) throw new Error(`site/${kit.name}: it names ${key}, which isn't one of the app's strings`)
    return name
  }
  const article = (/** @type {string} */ key) => {
    if (!kit.link(key)) throw new Error(`site/${kit.name}: it links to ${key}, which isn't a page of the site`)
    return key.startsWith('help/') ? kit.from(key).text('h1') : kit.text(`page.${key}`)
  }
  const named = (/** @type {Names} */ more) => ({ ...names, ...more })
  // Each name in its own place, put in once the words around it are escaped.
  const marks = (/** @type {Names} */ all) => Object.fromEntries(Object.keys(all).map((key, i) => [key, String.fromCharCode(0xe000 + i)]))
  const html = (/** @type {string} */ escaped, /** @type {Names} */ all) => Object.entries(marks(all)).reduce((out, [key, mark]) => out.replaceAll(mark, () => {
    const name = part(all[key])
    return name === null ? /* html */ `<a href="${kit.link(all[key])}">${xml(article(all[key]))}</a>` : /* html */ `<b class="help-ui">${xml(name)}</b>`
  }), escaped)
  const plain = (/** @type {Names} */ all) => Object.fromEntries(Object.entries(all).map(([key, at]) => [key, part(at) ?? article(at)]))
  return {
    /** @param {string} key @param {Names} [more] */
    say: (key, more = {}) => html(kit.say(key, { mail: SUPPORT, ...marks(named(more)) }), named(more)).replace(SUPPORT, () => /* html */ `<a href="mailto:${SUPPORT}">${SUPPORT}</a>`),
    /** @param {string} key @param {Names} [more] */
    list: (key, more = {}) => kit.list(key, marks(named(more))).map((item) => html(item, named(more))),
    /** @param {string} key @param {Names} [more] */
    table: (key, more = {}) => kit.table(key, 2, marks(named(more))).map((row) => row.map((cell) => html(cell, named(more)))),
    /** @param {string} key @param {Names} [more] */
    text: (key, more = {}) => kit.text(key, plain(named(more))),
    /** The step at `i`, as HTML or as words. @param {number} i @param {Names} [more] */
    step: (i, more = {}) => html(kit.list('steps', marks(named(more)))[i], named(more)),
    /** @param {number} i @param {Names} [more] */
    stepText: (i, more = {}) => kit.texts('steps', plain(named(more)))[i],
  }
}

/**
 * Its kind, how long it takes to read and where it works, as the strip under its title says.
 * @param {import('../site.js').Kit} kit @param {Article} article
 */
function strip (kit, { kind, minutes }) {
  return /* html */ `<ul class="help-strip"><li>${kit.say(`kind.${kind}`)}</li><li>${kit.say('time', { time: duration(kit, minutes) })}</li><li>${kit.say('works')}</li></ul>`
}

/**
 * The article before it and the one after it in its moment, as the home lists them, under where it is in it ("Start,
 * 2 of 4"); nothing in a moment of one.
 * @param {import('../site.js').Kit} kit @param {string} moment
 */
function pager (kit, moment) {
  if (!sections) throw new Error(`site/${kit.name}: Help's home reads the articles before one is written`)
  const folders = sections.get(moment) ?? []
  const at = folders.indexOf(folderOf(kit))
  if (folders.length < 2) return ''
  const number = new Intl.NumberFormat(kit.lang)
  const card = (/** @type {string | undefined} */ folder, /** @type {'prev' | 'next'} */ way) => (folder ? /* html */ `<a class="help-pager-${way}" href="${kit.link(`help/${folder}`)}" rel="${way}"><span>${way === 'prev' ? glyph('back', ' flip-rtl') : ''}${kit.say(`pager.${way}`)}${way === 'next' ? ICONS.arrow : ''}</span><b>${kit.from(`help/${folder}`).say('h1')}</b></a>` : '')
  return /* html */ `
  <nav class="help-pager" aria-labelledby="help-pager"><p id="help-pager" class="help-label">${kit.say('pager', { moment: kit.text(`moment.${moment}`), at: number.format(at + 1), count: number.format(folders.length) })}</p>${card(folders[at - 1], 'prev')}${card(folders[at + 1], 'next')}</nav>`
}

/** So many minutes, in words. @param {import('../site.js').Kit} kit @param {number} minutes */
const duration = (kit, minutes) => new Intl.NumberFormat(kit.lang, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(minutes)

/**
 * A help article, as its page.js names it.
 * @param {Article} article @returns {import('../site.js').Page & Article}
 */
export function helpArticle (article) {
  const { addresses, moment, steps = [], open, demo, shows = [], also = [], names = {} } = article
  if (!MOMENTS.includes(moment)) throw new Error(`a help article's moment is ${moment}, not one of ${MOMENTS.join(', ')}`)
  return {
    ...article,
    style: 'help',
    words: 'help',
    frames: Boolean(demo) || [...shows, ...steps.map((step) => step.show)].some((shown) => shown?.figure.frames),
    files (kit) {
      const words = wordsOf(kit, names)
      // Show me's tour: Jean opened where the steps start, then a stop at each step that points at something.
      const tour = open ? { [tourOf(kit)]: JSON.stringify({ open, stops: steps.flatMap(({ names: more, point }, i) => (point ? [{ ...point, say: point.say ? words.text(point.say, more) : words.stepText(i, more) }] : [])) }, null, 2) + '\n' } : {}
      return { ...tour, ...demo && demoFiles(kit, demo(kit, (key) => words.text(key))) }
    },
    main (kit) {
      const words = wordsOf(kit, names)
      const home = kit.link('help')
      const section = (/** @type {string} */ id, /** @type {string} */ title, /** @type {string} */ body) => /* html */ `
  <section class="help-part" aria-labelledby="help-${id}"><h2 id="help-${id}">${title}</h2>${body}</section>`
      const show = open ? /* html */ `
  <p class="help-show"><a class="button primary" href="${xml(`${kit.start}?help=${folderOf(kit)}`)}">${ICONS.play}<span>${kit.say('show')}</span></a><span>${kit.say('show.note')}</span></p>` : ''
      const replay = demo ? /* html */ `
  <div class="help-demo">${demoFrame(kit)}</div>` : ''
      const figure = (/** @type {Shown | null | undefined} */ shown) => (shown ? /* html */ `<figure class="help-figure">${shown.figure.draw(kit, words.text(shown.caption))}<figcaption>${words.say(shown.caption)}</figcaption></figure>` : '')
      const parts = kit.has('parts') ? words.table('parts').map(([title, text], i) => section(`part-${i + 1}`, title, /* html */ `<p>${text}</p>${figure(shows[i])}`)).join('') : ''
      const terms = kit.has('terms') ? section('terms', words.say('terms.title'), /* html */ `<dl class="help-terms">${words.table('terms').map(([term, meaning]) => /* html */ `<div><dt>${term}</dt><dd>${meaning}</dd></div>`).join('')}</dl>`) : ''
      const need = kit.has('need') ? section('need', kit.say('need.title'), /* html */ `<ul class="help-list">${words.list('need').map((item) => /* html */ `<li><span>${item}</span></li>`).join('')}</ul>`) : ''
      const list = steps.length ? section('steps', kit.has('steps.title') ? words.say('steps.title') : kit.say('steps.heading'), /* html */ `<ol class="help-steps">${steps.map(({ names: more, show: shown }, i) => /* html */ `<li><span>${words.step(i, more)}</span>${figure(shown)}</li>`).join('')}</ol>`) : ''
      const fixes = words.table('fixes').map(([problem, answer]) => /* html */ `<h3>${problem}</h3><p>${answer}</p>`).join('')
      const stuck = (kit.has('ask') ? /* html */ `<p>${kit.say('stuck.ask', { question: '' }).replace('', () => /* html */ `<a href="${xml(`${kit.start}?q=${encodeURIComponent(kit.text('ask'))}`)}">${kit.say('ask')}</a>`)}</p>` : '')
        + /* html */ `<p>${words.say(kit.has('ask') ? 'stuck.mail' : 'stuck.write')}</p>`
      const seeAlso = also.map((other) => {
        const href = kit.link(`help/${other}`)
        if (!href) throw new Error(`site/${kit.name}: its See also names help/${other}, which isn't an article`)
        return /* html */ `<li><span><a href="${href}">${kit.from(`help/${other}`).say('h1')}</a></span></li>`
      }).join('')
      return /* html */ `<article class="help" aria-labelledby="help-title">
  <nav class="help-crumbs" aria-label="${kit.say('crumbs')}"><a href="${home}">${kit.app('learn.help')}</a><span aria-hidden="true">›</span><span>${kit.say(`moment.${moment}`)}</span></nav>
  <h1 id="help-title">${words.say('h1')}</h1>
  ${strip(kit, article)}
  <p class="help-answer">${words.say('answer')}</p>${show}${replay}${need}${parts}${terms}${list}${section('good', kit.say('good.title'), /* html */ `<ul class="help-list">${words.list('good').map((item) => /* html */ `<li><span>${item}</span></li>`).join('')}</ul>`)}${section('fixes', kit.say('fixes.title'), /* html */ `<div class="help-fixes">${fixes}</div>`)}${section('stuck', kit.say('stuck'), stuck)}${seeAlso ? section('also', kit.say('also'), /* html */ `<ul class="help-list">${seeAlso}</ul>`) : ''}${pager(kit, moment)}
</article>`
    },
  }
}

/** Every article, by folder: site/help/'s folders with a page.js. @returns {Promise<Map<string, Article>>} */
async function articles () {
  const folders = (await readdir(join(SITE, 'help'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  /** @type {Map<string, Article>} */
  const found = new Map()
  for (const folder of folders) {
    if ((await readdir(join(SITE, 'help', folder))).includes('page.js')) found.set(folder, (await import(pathToFileURL(join(SITE, 'help', folder, 'page.js')).href)).default)
  }
  return found
}

/**
 * The help home, one column: its title; what to do when something is wrong, for someone a message of Jean's sent
 * here; Start here, the articles a newcomer reads in order, and how long they take; then a card for each moment, in
 * the order people meet Jean, naming its articles, those of Start here first, as they are read.
 * @param {Record<string, string>} addresses @returns {Promise<import('../site.js').Page>}
 */
export async function helpHome (addresses) {
  const all = await articles()
  const order = (/** @type {Article} */ article) => article.start ?? Infinity
  const listed = [...all].sort(([, a], [, b]) => order(a) - order(b))
  sections = new Map(MOMENTS.map((moment) => [moment, listed.filter(([, article]) => article.moment === moment).map(([folder]) => folder)]))
  return {
    addresses,
    style: 'help',
    main (kit) {
      const link = (/** @type {string} */ folder) => /* html */ `<a href="${kit.link(`help/${folder}`)}">${kit.from(`help/${folder}`).say('h1')}</a>`
      const fixes = listed.filter(([, article]) => article.moment === 'fix').map(([folder]) => /* html */ `<li>${link(folder)}</li>`).join('')
      const path = listed.filter(([, article]) => article.start !== undefined)
      const minutes = path.reduce((sum, [, article]) => sum + article.minutes, 0)
      const moments = MOMENTS.filter((moment) => moment !== 'fix').map((moment) => [moment, listed.filter(([, article]) => article.moment === moment).map(([folder]) => /* html */ `<li>${link(folder)}</li>`).join('')]).filter(([, items]) => items)
      return /* html */ `<div class="help-home">
  <header class="help-head">
    <h1 id="help-title">${kit.say('h1')}</h1>
    <p class="site-lede">${kit.say('lede')}</p>
  </header>${fixes ? /* html */ `

  <section class="help-band" aria-labelledby="help-wrong">
    <h2 id="help-wrong" class="help-label">${kit.say('home.fix')}</h2>
    <ul class="help-chips">${fixes}</ul>
  </section>` : ''}${path.length ? /* html */ `

  <section class="help-band" aria-labelledby="help-path">
    <h2 id="help-path" class="help-label">${kit.say('home.start')}<span>${kit.say('time', { time: duration(kit, minutes) })}</span></h2>
    <ol class="help-path">${path.map(([folder]) => /* html */ `<li>${link(folder)}</li>`).join('')}</ol>
  </section>` : ''}

  <section class="help-band" aria-labelledby="help-every">
    <h2 id="help-every" class="help-label">${kit.say('home.every')}</h2>
    <div class="help-moments">${moments.map(([moment, items]) => /* html */ `
      <section aria-labelledby="help-${moment}"><h3 id="help-${moment}">${kit.say(`moment.${moment}`)}</h3><ul>${items}</ul></section>`).join('')}
    </div>
  </section>

  <p class="help-more">${kit.say('home.stuck', { mail: '' }).replace('', () => /* html */ `<a href="mailto:${SUPPORT}">${SUPPORT}</a>`)}</p>
</div>`
    },
  }
}
