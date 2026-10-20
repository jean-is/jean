// The pages for a job people search for help with: a spreadsheet at /excel, a PDF at /pdf, slides at /slides (in
// French /fr/excel, /fr/pdf, /fr/diapos). Each catches the words people type, its title saying them, then replays one
// task as text, step by step: what Jean read, what it worked out, what it gave back and the file it made. Then what
// goes in and what comes out, how its numbers are worked out by a program rather than guessed (the Computer), where
// the file goes, the catch, questions, and a last Try that opens Jean with the work already asked where it can be:
// the sample spreadsheet in the box (?sample), a request sent (?q=), or Jean itself, its box waiting for a file.
// Each page's folder holds its page.js, which says its addresses, where its Try leads and what it draws of its own,
// and its words; this module writes the three, with the homepage's words for a replay's steps, and excel.css is
// the look of them all, over site.css (site/site.js, D438).
import { FELT, ICONS, WAVE, questions, underline, xml } from '../site.js'

/**
 * Where a page's Try leads: the sample spreadsheet in the box with its request, the request its words give
 * (`try.ask`) sent at once, or Jean itself, its box waiting for the file the page says to drop.
 * @typedef {'sample' | 'ask' | 'open'} Into
 *
 * What a page draws of its own, as HTML: beside its promise, the answer as Jean shows it; in the replay, under what
 * was worked out and under what came back.
 * @typedef {{ pane: string, work?: string, got?: string }} Drawn
 *
 * Its words' {params}, worked out as it is written: plain ones, and names kept in their own direction (<bdi>).
 * @typedef {{ params?: import('../site.js').Params, names?: Record<string, string> }} Filled
 *
 * A job's page.js.
 * @typedef {object} Job
 * @property {Record<string, string>} addresses
 * @property {Into} into
 * @property {(kit: import('../site.js').Kit) => Filled} [filled]
 * @property {(kit: import('../site.js').Kit, words: { say: (key: string) => string, list: (key: string) => string[] }) => Drawn} drawn  its words filled as the page's are
 */

/** The icons of what goes in and what comes out, by the words' first column. */
const KINDS = { file: ICONS.file, table: ICONS.table, chart: ICONS.chart, picture: ICONS.picture, app: ICONS.app, brain: ICONS.brain }
/** The icons of the cards on numbers and on where the file goes, in their words' order. */
const EXACT = [ICONS.computer, ICONS.app, ICONS.clock]
const WHERE = [ICONS.lock, ICONS.brain, ICONS.never]

/**
 * A job's page, as its page.js names it.
 * @param {Job} job @returns {import('../site.js').Page}
 */
export function job ({ addresses, into, filled = () => ({}), drawn }) {
  return {
    addresses,
    style: 'excel',
    main (kit) {
      const { lang } = kit
      const own = filled(kit)
      // The name of the free way in, as the app's first step says it.
      const params = { free: kit.appText('first.free'), ...own.params }
      const names = own.names ?? {}
      // Each name in its own direction, put in once the words around it are escaped.
      const marks = Object.fromEntries(Object.keys(names).map((key, i) => [key, String.fromCharCode(0xe000 + i)]))
      const bdi = (/** @type {string} */ html) => Object.entries(marks).reduce((text, [key, mark]) => text.replaceAll(mark, /* html */ `<bdi>${xml(names[key])}</bdi>`), html)
      const say = (/** @type {string} */ key) => bdi(kit.say(key, { ...params, ...marks }))
      const list = (/** @type {string} */ key) => kit.list(key, { ...params, ...marks }).map(bdi)
      const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, { ...params, ...marks }).map((row) => row.map(bdi))
      const home = kit.from('home')
      const jean = kit.start
      const href = into === 'sample' ? `${jean}?sample` : into === 'ask' ? `${jean}?q=${encodeURIComponent(kit.text('try.ask', params))}` : jean
      // What the replay's task asks: the app's own question for its sample, the request a Try sends, or the page's.
      const asked = into === 'sample' ? kit.app('starter.sample.prompt') : into === 'ask' ? say('try.ask') : say('replay.ask')
      const art = drawn(kit, { say, list })
      const file = kit.has('replay.file') ? /* html */ `<span class="job-file" dir="auto">${ICONS.file}${say('replay.file')}</span>` : ''
      const chip = (/** @type {string} */ icon, /** @type {string} */ key) => /* html */ `<span class="job-file" dir="auto">${KINDS[/** @type {keyof typeof KINDS} */ (icon)] ?? ICONS.file}${say(key)}</span>`
      const ticks = (/** @type {string} */ key) => /* html */ `<ul class="job-ticks">${list(key).map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>`
      const io = (/** @type {string} */ key) => table(key, 3).map(([icon, name, text]) => {
        if (!(icon in KINDS)) throw new Error(`site/${kit.name}/${lang}.json: ${key} names the icon ${icon}, not one of ${Object.keys(KINDS).join(', ')}`)
        return /* html */ `<li>${KINDS[/** @type {keyof typeof KINDS} */ (icon)]}<span><b>${name}</b><span>${text}</span></span></li>`
      }).join('')
      const cards = (/** @type {string} */ key, /** @type {string[]} */ icons) => {
        const rows = table(key, 2)
        if (rows.length !== icons.length) throw new Error(`site/${kit.name}/${lang}.json: ${key} has ${rows.length} cards, not ${icons.length}`)
        return rows.map(([title, text], i) => /* html */ `<li>${icons[i]}<h3>${title}</h3><p>${text}</p></li>`).join('')
      }
      const files = kit.link('files')
      // The Try, and the replay: a button at the top, a link at the end.
      const go = (/** @type {boolean} */ top) => /* html */ `<a class="button primary" href="${xml(href)}">${say('cta')}</a><a${top ? ' class="button"' : ''} href="#job-replay">${say('see')}</a>`
      return /* html */ `<section class="site-hero job-hero" aria-labelledby="job-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="job-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta">${go(true)}</p>${kit.has('cta.note') ? /* html */ `
    <p class="job-note">${say('cta.note')}</p>` : ''}
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="job-pane" aria-hidden="true">
    <p class="job-pane-head"><span>${xml(kit.brand.name)}</span><span class="job-chip">${ICONS.brain}${say('pane.brain')}</span></p>
    <p class="job-sent" dir="auto">${file}<span>${kit.has('pane.ask') ? say('pane.ask') : asked}</span></p>
    <div class="job-said"><p dir="auto">${say('pane.answer')}</p>${art.pane}${chip(kit.text('pane.icon'), 'pane.chip')}</div>
    <p class="job-box">${kit.app('composer.placeholder')}</p>
    <p class="job-ai">${kit.app('composer.ai')}</p>
  </div>
</section>

<section id="job-replay" class="site-section is-side" aria-labelledby="job-replay-title">
  <header><h2 id="job-replay-title">${say('replay.title')}</h2><p class="site-why">${say('replay.why')}</p></header>
  <div class="job-replay">
  <ol class="job-steps">
    <li><span class="job-step">${home.say('replay.ask')}</span><p class="job-asked" dir="auto">${file}<span>${asked}</span></p></li>
    <li><span class="job-step">${say('step.read')}</span>${ticks('replay.reads')}</li>
    <li><span class="job-step">${home.say('replay.work')}</span>${ticks('replay.works')}${art.work ?? ''}</li>
    <li><span class="job-step">${home.say('replay.get')}</span><p>${say('replay.got')}</p>${art.got ?? ''}${chip(kit.text('replay.icon'), 'replay.chip')}</li>
    <li><span class="job-step">${say('step.again')}</span><p class="job-asked" dir="auto"><span>${say('replay.again')}</span></p></li>
    <li><span class="job-step">${say('step.made')}</span><p>${say('replay.made')}</p>${chip(kit.text('replay.madeIcon'), 'replay.madeChip')}</li>
  </ol>
  <div class="job-more">
    <h3>${say('asks.title')}</h3>
    <ul class="job-asks">${list('asks.items').map((item) => /* html */ `<li dir="auto">${item}</li>`).join('')}</ul>
  </div>
  </div>
</section>

<section class="site-section" aria-labelledby="job-io">
  <header><h2 id="job-io">${say('io.title')}</h2><p class="site-why">${say('io.why')}</p></header>
  <div class="job-io">
    <div><h3>${say('io.in')}</h3><ul>${io('io.ins')}</ul></div>
    <div><h3>${say('io.out')}</h3><ul>${io('io.outs')}</ul></div>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="job-exact">
  <header><h2 id="job-exact">${say('exact.title')}</h2><p class="site-why">${say('exact.why')}</p></header>
  <ul class="job-cards">${cards('exact.cards', EXACT)}</ul>
</section>

<section class="site-section" aria-labelledby="job-where">
  <header><h2 id="job-where">${say('where.title')}</h2><p class="site-why">${say('where.why')}</p></header>
  <ul class="job-cards is-where">${cards('where.cards', WHERE)}</ul>
  ${files ? /* html */ `<p><a href="${files}">${kit.app('welcome.files')}</a></p>` : ''}
</section>

<section class="site-section is-side" aria-labelledby="job-catch">
  <h2 id="job-catch">${home.say('catch.title')}</h2>
  <ul class="site-limits">${list('catch.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>

<section class="site-section" aria-labelledby="job-faq">
  <h2 id="job-faq">${home.say('faq.title')}</h2>
  ${questions('job-questions', table('faq.items', 2))}
</section>

<section class="site-section is-side site-end" aria-labelledby="job-end">
  ${WAVE}
  <h2 id="job-end">${say('end.title')}</h2>
  <p class="site-why">${say('end.why')}</p>
  <p class="site-cta job-go">${FELT.point}${go(false)}</p>
</section>`
    },
  }
}
