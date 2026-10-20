// The pages that set Jean beside other products (D445): the hub, /compare, and a page a product, /compare/<product>,
// for the reader who searched for another product's alternative. A product's page puts the reader's words in its
// title, then a fair paragraph on the other product, the table, where it does better, how to use both, the catch,
// questions and a last Try. Jean's side of a row carries its status, as on the page for IT; the other product's, the
// page of its maker's that says so, linked and dated, since every fact about another product is read there, never
// from memory. Each product's folder holds its page.js, which names its addresses, its sources and where its
// buttons lead, and its words; this module writes it, the hub's words saying what every page says alike, and
// compare.css is the look of them all, over site.css (site/site.js, D438).
import { FELT, ICONS, REPOSITORY, WAVE, felt, questions, underline, xml } from '../site.js'

/** What Jean's side of a row can be: built, with a key, by design, or built and on a computer, through This computer. */
export const STATUSES = ['built', 'key', 'design', 'computer']

/**
 * What the top's empty half shows on a wide window, drawn in marker with the felt-tip's sunflower (D443): on the hub,
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

/** The browser's perimeter, on the two fences, drawn round by the felt-tip pen. */
const LOOP = '<svg class="cmp-loop" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true"><path d="M210 6C120 3 30 6 12 20C2 30 4 100 8 120C12 134 100 136 200 134C300 132 386 134 392 116C398 96 396 36 390 20C384 6 300 4 170 9"/></svg>'

/** The products' pages, by folder, in the order the hub and the foot list them. */
export const PRODUCTS = ['compare-chatgpt', 'compare-claude-cowork', 'compare-openclaw', 'compare-open-webui']

/**
 * A maker's page that says what a cell says, and the day it was read there.
 * @typedef {{ url: string, checked: string }} Source
 *
 * Where a button leads: a request sent (`?q=`), the sample spreadsheet in the box, Settings where Restore brings an
 * export in, Settings › Brains with one way open, the deploy guide, or the page for IT.
 * @typedef {'try' | 'sample' | 'history' | 'claude' | 'chatgpt' | 'local' | 'host' | 'work'} Action
 *
 * A product's page.js.
 * @typedef {object} Product
 * @property {Record<string, string>} addresses
 * @property {Record<string, Source>} sources  by the ids its words name
 * @property {[Action, Action]} actions  its two buttons, at its top and at its end
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
  /** The pages a cell is read from, each its maker's name for it and the day it was read. @param {string} ids  space-separated */
  const cited = (ids) => {
    const links = ids.split(/\s+/).filter(Boolean).map((id) => {
      const source = sources[id]
      if (!source) throw new Error(`site/${kit.name}/${lang}.json: the source ${id} isn't in its page.js`)
      return /* html */ `<a href="${xml(source.url)}">${kit.say(`source.${id}`)}</a> · <time datetime="${source.checked}">${xml(day.format(new Date(`${source.checked}T12:00:00Z`)))}</time>`
    })
    return links.length ? /* html */ `<small class="cmp-source">${links.join('<br>')}</small>` : ''
  }
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
  /** Questions whose answers may point at the page for IT ({enterprise}). @param {string} id */
  const asked = (id) => {
    const it = kit.link('enterprise')
    return questions(id, kit.table('faq.items', 2).map(([question, answer]) => [question, answer.replace('{enterprise}', it ? /* html */ `<a href="${it}">${kit.from('enterprise').say('title')}</a>` : kit.from('enterprise').say('title'))]))
  }
  /** The catch, plainly: a list, with what says why beside it where there is one. @param {string} tone  its section's class */
  const caught = (tone) => /* html */ `<section class="site-section${tone} cmp-catch" aria-labelledby="cmp-catch">
  <header><h2 id="cmp-catch">${hub.say('catch.title')}</h2>${kit.has('catch.why') ? /* html */ `<p class="site-why">${kit.say('catch.why')}</p>` : ''}</header>
  <ul class="site-limits">${kit.list('catch.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>`
  /** The foot's part: the pages compared, this one said rather than linked, and which facts were checked where. */
  const foot = () => {
    const here = kit.name
    const item = (/** @type {string} */ name, /** @type {string} */ label) => (name === here ? /* html */ `<li><span aria-current="page">${label}</span></li>` : /* html */ `<li><a href="${kit.link(name)}">${label}</a></li>`)
    return /* html */ `
  <nav class="cmp-foot" aria-labelledby="cmp-foot-head"><p id="cmp-foot-head" class="site-foot-head">${hub.say('foot.compared')}</p><ul>
    ${item('compare', hub.say('foot.all'))}${PRODUCTS.map((name) => item(name, kit.from(name).say('product'))).join('')}
  </ul></nav>
  <p class="cmp-note">${kit.say('foot.note', { date: day.format(new Date(`${latest(sources)}T12:00:00Z`)) })}</p>`
  }
  /**
   * A table set side by side, which a narrow window stacks a row at a time, each cell saying whose it is: its roles
   * said outright, since a table laid out otherwise loses them in some browsers.
   * @param {string} id  its heading's @param {string[]} heads  its columns' headings, as HTML, Jean's first
   * @param {string[][]} rows  each its heading and its cells, as HTML @param {string} [kind]
   */
  const sideBySide = (id, heads, rows, kind = '') => /* html */ `<div class="cmp-scroll" role="region" aria-labelledby="${id}" tabindex="0"><table class="cmp-table${kind}" role="table">
    <thead role="rowgroup"><tr role="row"><td role="cell"></td>${heads.map((head, i) => /* html */ `<th scope="col" role="columnheader"${i ? '' : ' class="is-jean"'}>${i ? head : felt(head, 'circle')}</th>`).join('')}</tr></thead>
    <tbody role="rowgroup">${rows.map(([what, ...cells]) => /* html */ `
      <tr role="row"><th scope="row" role="rowheader">${what}</th>${cells.map((cell, i) => /* html */ `<td role="cell"${i ? '' : ' class="is-jean"'}><span class="cmp-col">${heads[i].replace(/<small>.*<\/small>/, '')}</span>${cell}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table></div>`
  return { hub, status, cited, href, buttons, asked, caught, foot, sideBySide }
}

/** The day the last of a page's facts was read. @param {Record<string, Source>} sources */
export const latest = (sources) => Object.values(sources).map((source) => source.checked).sort().at(-1) ?? ''

/** The icons of a product's ways to use both, in its words' order. */
const BOTH = { history: ICONS.clock, plan: ICONS.computer, private: ICONS.lock, switch: ICONS.brain, skills: ICONS.file, connections: ICONS.globe, program: ICONS.computer, models: ICONS.brain, server: ICONS.app, servers: ICONS.globe }

/**
 * A product's page, as its page.js names it.
 * @param {Product} product @returns {import('../site.js').Page}
 */
export function product ({ addresses, sources, actions }) {
  return {
    addresses,
    style: 'compare',
    foot: (kit) => helpers(kit, sources).foot(),
    main (kit) {
      const { lang } = kit
      const { hub, status, cited, buttons, asked, caught, sideBySide } = helpers(kit, sources)
      const say = kit.say
      const name = say('product')
      const origin = kit.base ? new URL(kit.base).origin : `https://${kit.brand.domain}`
      const both = kit.table('both.cards', 4)
      for (const [icon] of both) if (!(icon in BOTH)) throw new Error(`site/${kit.name}/${lang}.json: a way to use both is ${icon}, not one of ${Object.keys(BOTH).join(', ')}`)
      const fence = kit.has('fence.title')
      // The sections after the top, shaded one in two whichever there are.
      let n = 0
      const tone = () => (n++ % 2 ? '' : ' is-side')
      return /* html */ `<section class="site-hero cmp-hero" aria-labelledby="cmp-title">
  <div class="site-hero-text">
    <nav class="cmp-crumbs" aria-label="${hub.say('crumbs')}"><a href="${kit.link('compare')}">${hub.say('crumbs.hub')}</a><span class="flip-rtl" aria-hidden="true">›</span><span aria-current="page">${name}</span></nav>
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="cmp-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta">${buttons(actions, [say('cta'), say('cta2')])}</p>
    <ul class="site-facts is-felt">${kit.list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>${kit.has('setting.title') ? /* html */ `
  <div class="cmp-setting">
    <p class="cmp-setting-head">${say('setting.title')}</p>
    <pre>OLLAMA_ORIGINS=${xml(origin)} ollama serve</pre>
    <p>${say('setting.text')}</p>
  </div>` : `\n  ${DRAWN.both}`}
</section>

<section class="site-section${tone()}" aria-labelledby="cmp-fair">
  <div class="cmp-fair">
    <h2 id="cmp-fair">${say('fair.title')}</h2>
    <p>${say('fair.body')}</p>
    ${cited(kit.text('fair.sources'))}
  </div>
</section>
${fence ? /* html */ `
<section class="site-section${tone()}" aria-labelledby="cmp-fence">
  <h2 id="cmp-fence">${say('fence.title')}</h2>
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
</section>
` : ''}
<section id="cmp-table" class="site-section${tone()}" aria-labelledby="cmp-table-title">
  <h2 id="cmp-table-title">${hub.say('table.side')}</h2>
  ${sideBySide('cmp-table-title', [xml(kit.brand.name), name], kit.table('table.rows', 5).map(([what, jean, code, other, ids]) => [what, /* html */ `<p>${jean}</p>${status(code)}`, /* html */ `<p>${other}</p>${cited(ids)}`]))}
</section>

<section class="site-section${tone()}" aria-labelledby="cmp-better">
  <header><h2 id="cmp-better">${say('better.title')}</h2><p class="site-why">${hub.say('better.why')}</p></header>
  <ul class="site-limits cmp-better">${kit.list('better.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
  ${kit.text('better.sources') ? cited(kit.text('better.sources')) : ''}
</section>

<section class="site-section${tone()}" aria-labelledby="cmp-both">
  <h2 id="cmp-both">${say('both.title')}</h2>
  <ul class="cmp-cards">${both.map(([icon, title, text, code]) => /* html */ `
    <li>${BOTH[/** @type {keyof typeof BOTH} */ (icon)]}<h3>${title}</h3><p>${text}</p>${status(code)}</li>`).join('')}
  </ul>
</section>

${caught(tone())}

<section class="site-section${tone()}" aria-labelledby="cmp-faq">
  <h2 id="cmp-faq">${hub.say('faq.title')}</h2>
  ${asked('cmp-questions')}
</section>

<section class="site-section${tone()} site-end cmp-end" aria-labelledby="cmp-end">
  ${WAVE}
  <h2 id="cmp-end">${say('end.title')}</h2>
  <p class="site-cta">${FELT.point}${buttons(actions, [say('cta'), say('cta2')])}</p>
</section>`
    },
  }
}
