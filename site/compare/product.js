// SPDX-License-Identifier: MIT
// The pages that set Jean beside other products: the hub, /compare, and a page a product, /compare/<product>,
// for the reader who searched for another product's alternative. A product's page puts the reader's words in its
// title, then says that promise part by part, as the homepage does (landing() in site.js): an alternative to the other
// product, over a fair paragraph on it and where it does better; then where Jean works and keeps things, over the
// table and how to use both; each part with its own catch. Then Your turn, a last Try, the questions and the sources.
// Jean's side of a row carries its status, as on the page for IT; the other product's, the page of its maker's that
// says so, since every fact about another product is read there, never from memory: cited by number, as an answer's
// sources are, each number leading to its footnote at the end of the main part, under what was checked and when.
// Each product's folder holds its page.js, which names its addresses, its sources, where its buttons lead and which
// part of its promise each of its limits is about, and its words; this module writes it, the hub's words saying what
// every page says alike, and compare.css is the look of them all, over site.css (site/site.js, D438).
import { COMPARED, FELT, ICONS, REPOSITORY, WAVE, caught, felt, landing, underline, xml } from '../site.js'

/** What Jean's side of a row can be: built, with a key, by design, or built and on a computer, through This computer. */
export const STATUSES = ['built', 'key', 'design', 'computer']

/**
 * What the top's empty half shows on a wide window, drawn in marker with the felt-tip's sunflower: on the hub,
 * a balance, Jean's tilde on one pan and another app's bubble on the other, level; on a product's page, two windows,
 * the other app's behind Jean's, and what one brings over carried from one to the other.
 */
const hand = (/** @type {string} */ id, /** @type {string} */ body) => /* html */ `<svg class="cmp-drawn" viewBox="0 0 360 300" aria-hidden="true"><defs><filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="5" result="hand"/><feDisplacementMap in="SourceGraphic" in2="hand" scale="2" xChannelSelector="R" yChannelSelector="G"/></filter></defs><g filter="url(#${id})"><rect width="360" height="300" fill="none" stroke="none"/>${body}</g></svg>`
export const DRAWN = {
  balance: hand('cmp-hand-balance', /* html */ `<path d="M180 272C180 210 181 150 180 84M140 280C160 276 200 276 222 280M150 280C162 264 168 262 180 262C192 262 198 264 210 280"/><circle cx="180" cy="76" r="7"/>
  <path d="M58 92C120 88 240 88 302 92M58 92L28 170M58 92L88 170M302 92L272 170M302 92L332 170"/><path d="M20 170C50 171 80 169 96 170C88 194 30 194 20 170M264 170C294 171 324 169 340 170C332 194 274 194 264 170"/>
  <path class="is-tilde" d="M34 158q12-15 24 0t24 0"/><path d="M280 128C280 120 285 116 292 116L320 116C327 116 332 120 332 128L332 142C332 150 327 154 320 154L302 154L290 165L293 154C286 154 280 150 280 142Z"/>`),
  both: hand('cmp-hand-both', /* html */ `<path d="M164 34C220 33 290 35 334 34C344 34 350 40 350 50C349 90 351 140 350 176C350 186 344 192 334 192C290 193 220 191 164 192C154 192 148 186 148 176C149 140 147 90 148 50C148 40 154 34 164 34M150 58C210 59 290 57 348 58"/>
  <path d="M232 104C232 98 236 94 242 94L280 94C286 94 290 98 290 104L290 126C290 132 286 136 280 136L262 136L250 146L252 136L242 136C236 136 232 132 232 126Z"/>
  <path class="is-paper" d="M36 108C100 107 170 109 222 108C232 108 238 114 238 124C237 170 239 230 238 264C238 274 232 280 222 280C170 281 100 279 36 280C26 280 20 274 20 264C21 230 19 170 20 124C20 114 26 108 36 108Z"/><path d="M22 132C80 133 170 131 236 132M34 120l0.5 0M46 120l0.5 0M58 120l0.5 0"/>
  <path class="is-tilde" d="M88 204q19-24 38 0t38 0"/><path d="M292 198L304 198L310 204L310 220L292 220ZM304 198L304 204L310 204"/><path class="is-felt" d="M301 226C303 250 282 262 248 258M258 247C254 251 251 254 247 258C252 261 256 264 261 268"/>`),
}

/**
 * What the bars of weights hold besides a product's own: Jean's, as `npm run build:web` leaves it (measured on 13
 * November 2026: the first load as it travels, in brotli, the font included; the files the service worker keeps to work
 * offline, every language's, as they are kept; the AI on this computer, GEMMA.bytes in caps/brain-local/brain-local.js),
 * and two things everyone knows, about their size.
 * @typedef {{ id: string, bytes: number, kind: 'jean' | 'optional' | 'everyday' | 'other', source?: string }} Weight
 * @type {Weight[]}
 */
const WEIGHTS = [
  { id: 'open', bytes: 9.2e4, kind: 'jean' },
  { id: 'photo', bytes: 3e6, kind: 'everyday' },
  { id: 'offline', bytes: 6.7e6, kind: 'jean' },
  { id: 'ai', bytes: 3.11e9, kind: 'optional' },
  { id: 'film', bytes: 4e9, kind: 'everyday' },
]

/** The browser's perimeter, on the two fences, drawn round by the felt-tip pen. */
const LOOP = '<svg class="cmp-loop" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true"><path d="M210 6C120 3 30 6 12 20C2 30 4 100 8 120C12 134 100 136 200 134C300 132 386 134 392 116C398 96 396 36 390 20C384 6 300 4 170 9"/></svg>'

/** The products' pages, by folder, in the order the hub and the foot list them. */
export const PRODUCTS = COMPARED.slice(1)

/**
 * A maker's page that says what a cell says, and the day it was read there.
 * @typedef {{ url: string, checked: string }} Source
 *
 * Where a button leads: a request sent (`?q=`), the sample spreadsheet in the box, Settings where Restore brings an
 * export in, Settings › Brains with one way open, the deploy guide, or the page for IT.
 * @typedef {'try' | 'sample' | 'history' | 'claude' | 'chatgpt' | 'local' | 'device' | 'host' | 'work'} Action
 *
 * A product's page.js.
 * @typedef {object} Product
 * @property {Record<string, string>} addresses
 * @property {Record<string, Source>} sources  by the ids its words name
 * @property {[Action, Action]} actions  its two buttons, at its top and at its end
 * @property {{ id: string, bytes: number, source: string }[]} [weights]  what it weighs on a computer, in bars to scale
 *   beside Jean's, each read on one of its sources, its words saying what each is (`weight.<id>`)
 * @property {{ alternative: number[], where: number[] }} limits  the limits each part of its promise is caught by: an
 *   alternative to the other product, and where Jean works and keeps things; by their place in its words' catch.items
 */

/**
 * What every comparison page writes alike, in one language.
 * @param {import('../site.js').Kit} kit @param {Record<string, Source>} sources
 */
export function helpers (kit, sources) {
  const { lang } = kit
  const hub = kit.from('compare')
  const day = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  const status = (/** @type {string} */ code) => {
    if (!STATUSES.includes(code)) throw new Error(`site/${kit.name}/${lang}.json: a status is ${code}, not one of ${STATUSES.join(', ')}`)
    return /* html */ `<span class="cmp-status is-${code}">${hub.say(`status.${code}`)}</span>`
  }
  const read = (/** @type {string} */ checked) => day.format(new Date(`${checked}T12:00:00Z`))
  /** The sources cited, numbered in the order the page first cites them, as an answer's are: sourced() numbers them. @type {string[]} */
  const numbered = []
  /**
   * The pages a fact is read from, each to be a number leading to its footnote once the page is whole (sourced()): a
   * language says the parts of the promise in its own order, so a number is only known where the fact stands.
   * @param {string} ids  space-separated
   */
  const cited = (ids) => ids.split(/\s+/).filter(Boolean).map((id) => {
    if (!sources[id]) throw new Error(`site/${kit.name}/${lang}.json: the source ${id} isn't in its page.js`)
    return /* html */ `<!--cite ${id}-->`
  }).join('')
  /**
   * The footnotes, at the end of the main part: what was checked and when, then each page cited, by its maker's name
   * for it. The foot itself is the same on every page. Written last, once every number is given.
   * @param {boolean} dated  each says the day it was read, where the note doesn't say one day for them all
   */
  const footnotes = (dated) => /* html */ `<section class="cmp-notes" aria-label="${kit.app('sources.title')}">
  <p>${kit.say('foot.note', { date: read(latest(sources)) })}</p>
  <ol>${numbered.map((id, i) => /* html */ `
    <li id="cmp-source-${i + 1}"><span class="cmp-cite">${i + 1}</span><span><a href="${xml(sources[id].url)}">${kit.say(`source.${id}`)}</a>${dated ? /* html */ ` · <time datetime="${sources[id].checked}">${xml(read(sources[id].checked))}</time>` : ''}</span></li>`).join('')}
  </ol>
</section>`
  /**
   * The page whole: each source cited given its number, in the order the page first cites them, then the footnotes.
   * @param {string} html  the page, as its language orders it @param {boolean} [dated]  as footnotes() takes it
   */
  const sourced = (html, dated = false) => `${html.replace(/<!--cite ([\w-]+)-->/g, (whole, id) => {
    if (!numbered.includes(id)) numbered.push(id)
    const n = String(numbered.indexOf(id) + 1)
    const date = read(sources[id].checked)
    return /* html */ `<a class="cmp-cite" href="#cmp-source-${n}" aria-label="${hub.say('cite.label', { n, name: kit.text(`source.${id}`), date })}">${n}<span class="cmp-cite-tip">${kit.say(`source.${id}`)}<small>${xml(date)}</small></span></a>`
  })}\n\n${footnotes(dated)}`
  /** @param {Action} action */
  const href = (action) => {
    const start = kit.start
    switch (action) {
      case 'try': return `${start}?q=${encodeURIComponent(kit.text('try.ask'))}`
      case 'sample': return `${start}?sample`
      case 'history': return `${start}?restore`
      case 'host': return `${REPOSITORY}/blob/main/deploy/README.md`
      case 'work': return kit.link('enterprise') ?? REPOSITORY
      default: return `${start}?brain=${action}`
    }
  }
  /** The two buttons, the first the primary one. @param {[Action, Action]} actions @param {string[]} labels */
  const buttons = (actions, labels) => actions.map((action, i) => /* html */ `<a class="button${i ? '' : ' primary'}" href="${xml(href(action))}">${labels[i]}</a>`).join('')
  /** Its questions, whose answers may point at the page for IT ({enterprise}). */
  const asked = () => {
    const it = kit.link('enterprise')
    return kit.table('faq.items', 2).map(([question, answer]) => [question, answer.replace('{enterprise}', it ? /* html */ `<a href="${it}">${kit.from('enterprise').say('title')}</a>` : kit.from('enterprise').say('title'))])
  }
  /**
   * The catch, plainly, said under the part of the promise each limit is about: every limit the page's words list
   * under one part, and one only, or the build stops.
   * @param {Record<string, number[]>} by  each part's limits, by their place in catch.items
   * @param {(part: string) => string} [label]  what a part's catch is called, as HTML
   * @returns {Record<string, string | undefined>}
   */
  const catches = (by, label = () => hub.say('catch.title')) => {
    const limits = kit.list('catch.items')
    if (`${Object.values(by).flat().sort((a, b) => a - b)}` !== `${limits.map((limit, i) => i)}`) throw new Error(`site/${kit.name}/${lang}.json: catch.items lists ${limits.length} limits, which its page.js doesn't put each under one part of its promise`)
    return Object.fromEntries(Object.entries(by).map(([part, which]) => [part, which.length ? caught(label(part), which.map((i) => limits[i])) : undefined]))
  }
  /**
   * A table set side by side, which a narrow window stacks a row at a time, each cell saying whose it is: its roles
   * said outright, since a table laid out otherwise loses them in some browsers.
   * @param {string} id  its heading's @param {string[]} heads  its columns' headings, as HTML, Jean's first
   * @param {string[][]} rows  each its heading and its cells, as HTML @param {string} [kind]
   */
  const sideBySide = (id, heads, rows, kind = '') => /* html */ `<div class="cmp-scroll" role="region" aria-labelledby="${id}" tabindex="0"><table aria-labelledby="${id}" class="cmp-table${kind}" role="table">
    <thead role="rowgroup"><tr role="row"><td role="cell"></td>${heads.map((head, i) => /* html */ `<th scope="col" role="columnheader"${i ? '' : ' class="is-jean"'}>${i ? head : felt(head, 'circle')}</th>`).join('')}</tr></thead>
    <tbody role="rowgroup">${rows.map(([what, ...cells]) => /* html */ `
      <tr role="row"><th scope="row" role="rowheader">${what}</th>${cells.map((cell, i) => /* html */ `<td role="cell"${i ? '' : ' class="is-jean"'}><span class="cmp-col">${heads[i].replace(/<small>.*<\/small>/, '')}</span>${cell}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table></div>`
  return { hub, status, cited, sourced, href, buttons, asked, catches, sideBySide }
}

/**
 * What each weighs on a computer, in bars to scale, lightest first: what it is, how much, and a bar as long as its
 * share of the heaviest, so the lightest barely show. A bar is a drawing, hidden from screen readers, its length a
 * rect's width, since the site's policy allows no style written in the page; one too thin to see is a sliver.
 * @param {import('../site.js').Kit} kit @param {ReturnType<typeof helpers>} help @param {NonNullable<Product['weights']>} own
 */
function bars (kit, { hub, cited }, own) {
  const units = /** @type {const} */ ([[1e9, 'gigabyte'], [1e6, 'megabyte'], [1e3, 'kilobyte']])
  const size = (/** @type {number} */ bytes) => {
    const [per, unit] = units.find(([at]) => bytes >= at) ?? units[2]
    // A number never ends a line apart from its unit.
    return new Intl.NumberFormat(kit.lang, { style: 'unit', unit, maximumSignificantDigits: 2 }).format(bytes / per).replaceAll(' ', '\u00a0')
  }
  const all = [...WEIGHTS, ...own.map((weight) => ({ ...weight, kind: /** @type {const} */ ('other') }))].sort((a, b) => a.bytes - b.bytes)
  const most = all.at(-1)?.bytes ?? 1
  const items = all.map(({ id, bytes, kind, source }) => {
    const what = kind === 'other' ? kit.say(`weight.${id}`) : hub.say(`weight.${id}`)
    const weight = kind === 'jean' || kind === 'optional' ? size(bytes) : hub.say('weight.about', { size: size(bytes) })
    const share = (100 * bytes) / most
    return /* html */ `<li class="cmp-weight is-${kind}"><span class="cmp-what">${what}${source ? cited(source) : ''}</span> <b>${xml(weight)}</b><svg class="cmp-bar" aria-hidden="true"><rect height="100%" width="${share < 0.5 ? '3' : `${share.toFixed(2)}%`}" rx="3"/></svg></li>`
  })
  return /* html */ `<section class="site-block cmp-weigh" aria-labelledby="cmp-weight">
  <header><h3 id="cmp-weight">${hub.say('weight.title')}</h3><p class="site-why">${kit.say('weight.say')}</p></header>
  <figure class="cmp-bars" aria-labelledby="cmp-weight">
    <ol class="cmp-weights">${items.join('')}</ol>
    <figcaption>${hub.say('weight.how')}</figcaption>
  </figure>
</section>`
}

/** The day the last of a page's facts was read. @param {Record<string, Source>} sources */
export const latest = (sources) => Object.values(sources).map((source) => source.checked).sort().at(-1) ?? ''

/** The icons of a product's ways to use both, in its words' order. */
const BOTH = { history: ICONS.clock, plan: ICONS.computer, private: ICONS.lock, switch: ICONS.brain, skills: ICONS.file, connections: ICONS.globe, program: ICONS.computer, models: ICONS.brain, server: ICONS.app, servers: ICONS.globe }

// Escape hides the tip of the number under the pointer or the keys, until they leave it (no "<", which a page's scripts can't
// hold), on the hub and every product's page.
export const CITES = `addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  for (const cite of document.querySelectorAll('.cmp-cite:hover, .cmp-cite:focus-visible')) {
    const back = () => cite.classList.remove('is-quiet')
    cite.classList.add('is-quiet')
    cite.addEventListener('pointerleave', back, { once: true })
    cite.addEventListener('blur', back, { once: true })
  }
})`

/**
 * A product's page, as its page.js names it: its promise in two parts, as its words' `acts` cut it. An alternative to
 * the other product, over what is fair to say of it and where it does better; and where Jean works and keeps things,
 * over the two fences where the page draws them, the table and how to use both.
 * @param {Product} product @returns {import('../site.js').Page}
 */
export function product ({ addresses, sources, actions, limits, weights = [] }) {
  return {
    addresses,
    style: 'compare',
    script: CITES,
    main (kit) {
      const { lang } = kit
      const help = helpers(kit, sources)
      const { hub, status, cited, sourced, buttons, asked, catches, sideBySide } = help
      const say = kit.say
      const name = say('product')
      const origin = kit.base ? new URL(kit.base).origin : `https://${kit.brand.domain}`
      const both = kit.table('both.cards', 4)
      for (const [icon] of both) if (!(icon in BOTH)) throw new Error(`site/${kit.name}/${lang}.json: a way to use both is ${icon}, not one of ${Object.keys(BOTH).join(', ')}`)
      const better = kit.list('better.items')
      const betterSources = kit.list('better.sources')
      if (betterSources.length !== better.length) throw new Error(`site/${kit.name}/${lang}.json: better.sources names ${betterSources.length} items' sources, better.items has ${better.length}`)
      const hero = /* html */ `<section class="site-hero cmp-hero" aria-labelledby="cmp-title">
  <div class="site-hero-text">
    <nav class="cmp-crumbs" aria-label="${hub.say('crumbs')}"><ol><li><a href="${kit.link('compare')}">${hub.say('crumbs.hub')}</a></li><li><span class="flip-rtl" aria-hidden="true">›</span><span aria-current="page">${name}</span></li></ol></nav>
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="cmp-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta">${buttons(actions, [say('cta'), say('cta2')])}</p>
    <ul class="site-facts is-felt">${kit.list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>${kit.has('setting.title') ? /* html */ `
  <div class="cmp-setting">
    <h2 class="cmp-setting-head">${say('setting.title')}</h2>
    <pre>OLLAMA_ORIGINS=${xml(origin)} ollama serve</pre>
    <p>${say('setting.text')}</p>
  </div>` : `\n  ${DRAWN.both}`}
</section>`
      const fair = /* html */ `<section class="site-block" aria-labelledby="cmp-fair">
  <div class="cmp-fair">
    <h3 id="cmp-fair">${say('fair.title')}</h3>
    <p>${say('fair.body')}${cited(kit.text('fair.sources'))}</p>
  </div>
</section>`
      const fences = kit.has('fence.title') ? /* html */ `<section class="site-block" aria-labelledby="cmp-fence">
  <h3 id="cmp-fence">${say('fence.title')}</h3>
  <div class="cmp-fences">
    <figure class="cmp-fence" aria-labelledby="cmp-fence-jean">
      <div class="cmp-computer"><p class="cmp-label">${say('fence.computer')}</p>
        <div class="cmp-inside">${LOOP}<p class="cmp-label">${say('fence.inside')}</p><ul>${kit.list('fence.jean').map((item, i) => /* html */ `<li${i ? '' : ' class="is-jean"'}>${item}</li>`).join('')}</ul></div>
        <div class="cmp-outside"><p class="cmp-label">${say('fence.outside')}</p><ul>${kit.list('fence.away').map((item) => /* html */ `<li>${felt(item, 'strike')}</li>`).join('')}</ul></div>
      </div>
      <figcaption id="cmp-fence-jean">${say('fence.jeanCaption')}</figcaption>
    </figure>
    <figure class="cmp-fence" aria-labelledby="cmp-fence-other">
      <div class="cmp-computer is-open"><p class="cmp-label">${say('fence.computer')}</p>
        <p class="cmp-shell">${say('fence.shell')}</p>
        <ul>${kit.list('fence.reach').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
      </div>
      <figcaption id="cmp-fence-other">${say('fence.otherCaption')}</figcaption>
    </figure>
  </div>
</section>` : ''
      /** A side-by-side table's rows, each its heading, Jean's side and its status, the other's and where it was read. @param {string} key */
      const rows = (key) => kit.table(key, 5).map(([what, jean, code, other, ids]) => [what, /* html */ `<p>${jean}</p>${status(code)}`, /* html */ `<p>${other}${cited(ids)}</p>`])
      const table = /* html */ `<section id="cmp-table" class="site-block" aria-labelledby="cmp-table-title">
  <h3 id="cmp-table-title">${hub.say('table.side')}</h3>
  ${sideBySide('cmp-table-title', [xml(kit.brand.name), name], rows('table.rows'))}
</section>`
      // Where the other product runs in a mode of its own on a company's cloud, what that mode keeps beside Jean.
      const cloud = kit.has('cloud.title') ? /* html */ `<section class="site-block" aria-labelledby="cmp-cloud">
  <header><h3 id="cmp-cloud">${say('cloud.title')}</h3><p class="site-why">${say('cloud.why')}${cited(kit.text('cloud.sources'))}</p></header>
  ${sideBySide('cmp-cloud', [xml(kit.brand.name), /* html */ `${name}<small>${say('cloud.mode')}</small>`], rows('cloud.rows'))}
</section>` : ''
      const does = /* html */ `<section class="site-block" aria-labelledby="cmp-better">
  <header><h3 id="cmp-better">${say('better.title')}</h3><p class="site-why">${hub.say('better.why')}</p></header>
  <ul class="site-limits cmp-better">${better.map((item, i) => /* html */ `<li><span>${item}${cited(betterSources[i])}</span></li>`).join('')}</ul>
</section>`
      const together = /* html */ `<section class="site-block" aria-labelledby="cmp-both">
  <h3 id="cmp-both">${say('both.title')}</h3>
  <ul class="cmp-cards">${both.map(([icon, title, text, code]) => /* html */ `
    <li>${BOTH[/** @type {keyof typeof BOTH} */ (icon)]}<h4>${title}</h4><p>${text}</p>${status(code)}</li>`).join('')}
  </ul>
</section>`
      const end = /* html */ `${WAVE}
  <h3>${say('end.title')}</h3>
  <p class="site-cta">${FELT.point}${buttons(actions, [say('cta'), say('cta2')])}</p>`
      // The catch, said under the part of the promise each limit is about, as the product's page.js sorts them.
      const not = catches(limits)
      return sourced(landing(kit, {
        top: hero,
        promise: say('h1'),
        acts: {
          alternative: { id: 'cmp-alternative', body: `${fair}\n${does}`, catch: not.alternative },
          where: { id: 'cmp-where', body: `${fences && `${fences}\n`}${weights.length ? `${bars(kit, help, weights)}\n` : ''}${table}\n${cloud && `${cloud}\n`}${together}`, catch: not.where },
        },
        turn: { id: 'cmp-end', body: end, classes: 'cmp-end' },
        questions: { id: 'cmp-faq', name: 'cmp-questions', title: hub.say('faq.title'), items: asked() },
      }))
    },
  }
}
