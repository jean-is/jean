// SPDX-License-Identifier: MIT
// The pages for a job people search for help with: a spreadsheet at /excel, a PDF at /pdf, slides at /slides, a diagram
// at /diagrams (in French /fr/excel, /fr/pdf, /fr/diapos, /fr/schemas). Each catches the words people type, its title saying them, then says
// that promise again part by part, as the homepage does (landing() in site.js): each part a large title over what proves
// it, then that part's own catch. What proves it: one task replayed as text, step by step (what Jean read, what it
// worked out, what it gave back and the file it made), what goes in and what comes out, how its numbers are worked
// out by a program rather than guessed (the Computer), and where the file goes. Then Your turn, a last Try that opens
// Jean with the work already asked where it can be: the sample spreadsheet in the box (?sample), a request sent
// (?q=), or Jean itself, its box waiting for a file; and questions.
// Each page's folder holds its page.js, which says its addresses, where its Try leads, what it draws of its own and
// which part of its promise each limit is about, and its words, whose `acts` cut its promise into its parts; this
// module writes them, with the homepage's words for a replay's steps, and excel.css is
// the look of them all, over site.css (site/site.js, D438). A page whose task Jean can play has its pane frame
// Jean's own demo of it (demo.html), shown as it ended with a button that plays it, from a task file written here from
// its words, beside the page; with a guided tour over it, that button plays the tour full size, in a popover.
import { demoFiles, demoFrame } from '../demo.js'
import { FELT, ICONS, WAVE, caught, landing, underline, xml } from '../site.js'

/**
 * Where a page's Try leads: the sample spreadsheet in the box with its request, the request its words give
 * (`try.ask`) sent at once, or Jean itself, its box waiting for the file the page says to drop.
 * @typedef {'sample' | 'ask' | 'open'} Into
 *
 * What a page draws of its own, as HTML: beside its promise, the answer as Jean shows it; in the replay, under what
 * was worked out and under what came back.
 * @typedef {{ pane: string, work?: string, got?: string }} Drawn
 *
 * What the pane's demo plays, from a page's words as text: the shared file's type, the program the computer runs and
 * what it gives back where it runs one, the answer, in Markdown, and any guided tour over it.
 * @typedef {{ type?: string, code?: string, output?: string, answer: string, tour?: import('../../app/caps/tour/tour.js').Stop[] }} Demo
 *
 * Its words' {params}, worked out as it is written: plain ones, and names kept in their own direction (<bdi>).
 * @typedef {{ params?: import('../site.js').Params, names?: Record<string, string> }} Filled
 *
 * What proves a part of a page's promise, a block each: what a page shows of its own, its task replayed, what goes
 * in and what comes out, how its numbers are worked out, where the file goes.
 * @typedef {'shows' | 'replay' | 'io' | 'exact' | 'where'} Proof
 *
 * A job's page.js.
 * @typedef {object} Job
 * @property {Record<string, string>} addresses
 * @property {Into} into
 * @property {(kit: import('../site.js').Kit) => Filled} [filled]
 * @property {(kit: import('../site.js').Kit, words: { say: (key: string) => string, list: (key: string) => string[] }) => Drawn} drawn  its words filled as the page's are
 * @property {(kit: import('../site.js').Kit, words: { text: (key: string) => string, texts: (key: string) => string[] }) => Demo} [demo]  what its pane plays, its words filled as text
 * @property {(kit: import('../site.js').Kit, words: { text: (key: string) => string, texts: (key: string) => string[] }) => Record<string, string>} [tasks]  the files of the other tasks it frames, by their paths
 * @property {(kit: import('../site.js').Kit, words: { say: (key: string) => string, text: (key: string) => string }) => string} [shows]  a block of its own, as HTML, the first of what proves its task
 * @property {Record<string, number[]>} limits  which items of its catch (`catch.items`, from 0) each part of its promise is about, by the part's name in its words' `acts`
 * @property {Record<string, Proof[]>} [proves]  what proves each part of its promise, in the argument's order, where its parts aren't PROVES'
 * @property {string[]} [exact]  the icons of its cards on numbers, where they say something else first
 * @property {boolean} [tall]  whether its pane is taller, for an answer that wouldn't show whole
 */

/**
 * The task a job's pane plays (site/demo.js): the file the replay shares, the request its pane shows (the page's own,
 * else the replay's), the AI as the page names it, then what the page's demo() gives.
 * @param {import('../site.js').Kit} kit @param {Into} into @param {Filled} own @param {NonNullable<Job['demo']>} demo
 * @returns {import('../demo.js').Task}
 */
function task (kit, into, own, demo) {
  const params = { free: kit.appText('first.free'), ...own.params, ...own.names }
  const text = (/** @type {string} */ key) => kit.text(key, params)
  const { type = '', ...rest } = demo(kit, { text, texts: (key) => kit.texts(key, params) })
  const asked = kit.has('pane.ask') ? text('pane.ask') : into === 'sample' ? kit.appText('starter.sample.prompt') : text(into === 'ask' ? 'try.ask' : 'replay.ask')
  return { ...kit.has('replay.file') && { file: { name: text('replay.file'), type } }, asked, brain: text('demo.brain'), ...rest }
}

/**
 * A job's promise in two parts, as its words' `acts` name them, and what proves each, in the argument's order: the
 * task itself, then what makes its answer one to trust. A page whose promise says something else names its own
 * parts (`proves`).
 * @type {Record<string, Proof[]>}
 */
const PROVES = { task: ['shows', 'replay', 'io'], trust: ['exact', 'where'] }

/** The icons of what goes in and what comes out, by the words' first column. */
const KINDS = { file: ICONS.file, pdf: ICONS.pdf, slides: ICONS.slides, table: ICONS.table, chart: ICONS.chart, picture: ICONS.picture, app: ICONS.app, brain: ICONS.brain, tree: ICONS.tree, clock: ICONS.clock, place: ICONS.place }
/** The icons of the cards on numbers and on where the file goes, in their words' order. */
const EXACT = [ICONS.computer, ICONS.app, ICONS.clock]
const WHERE = [ICONS.lock, ICONS.brain, ICONS.never]

/**
 * A job's page, as its page.js names it.
 * @param {Job} job @returns {import('../site.js').Page}
 */
export function job ({ addresses, into, filled = () => ({}), drawn, demo, tasks, shows, limits, proves = PROVES, exact = EXACT, tall = false }) {
  /** Its words as text, filled as its demo's are. @param {import('../site.js').Kit} kit */
  const asText = (kit) => {
    const { params, names } = filled(kit)
    const all = { free: kit.appText('first.free'), ...params, ...names }
    return { text: (/** @type {string} */ key) => kit.text(key, all), texts: (/** @type {string} */ key) => kit.texts(key, all) }
  }
  return {
    addresses,
    style: 'excel',
    frames: Boolean(demo),
    files: (kit) => (demo ? { ...demoFiles(kit, task(kit, into, filled(kit), demo)), ...tasks?.(kit, asText(kit)) } : {}),
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
      const file = kit.has('replay.file') ? /* html */ `<span class="job-file" dir="${kit.dir}">${ICONS.file}<span>${say('replay.file')}</span></span>` : ''
      const chip = (/** @type {string} */ icon, /** @type {string} */ key) => /* html */ `<span class="job-file" dir="${kit.dir}">${KINDS[/** @type {keyof typeof KINDS} */ (icon)] ?? ICONS.file}<span>${say(key)}</span></span>`
      const ticks = (/** @type {string} */ key) => /* html */ `<ul class="job-ticks">${list(key).map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>`
      const io = (/** @type {string} */ key) => table(key, 3).map(([icon, name, text]) => {
        if (!(icon in KINDS)) throw new Error(`site/${kit.name}/${lang}.json: ${key} names the icon ${icon}, not one of ${Object.keys(KINDS).join(', ')}`)
        return /* html */ `<div><dt>${KINDS[/** @type {keyof typeof KINDS} */ (icon)]}${name}</dt><dd>${text}</dd></div>`
      }).join('')
      const cards = (/** @type {string} */ key, /** @type {string[]} */ icons) => {
        const rows = table(key, 2)
        if (rows.length !== icons.length) throw new Error(`site/${kit.name}/${lang}.json: ${key} has ${rows.length} cards, not ${icons.length}`)
        return rows.map(([title, text], i) => /* html */ `<li>${icons[i]}<h4>${title}</h4><p>${text}</p></li>`).join('')
      }
      const files = kit.link('files')
      // The Try, and the replay: a button at the top, a link at the end.
      const go = (/** @type {boolean} */ top) => /* html */ `<a class="button primary" href="${xml(href)}">${say('cta')}</a><a${top ? ' class="button"' : ''} href="#job-replay">${say('see')}</a>`
      // The pane: Jean's own demo of the task where the page has one, under the pane's head; else a drawing of it, with the box.
      const hero = /* html */ `<section class="site-hero job-hero" aria-labelledby="job-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="job-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta">${go(true)}</p>${kit.has('cta.note') ? /* html */ `
    <p class="job-note">${say('cta.note')}</p>` : ''}
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="job-pane${tall ? ' is-tall' : ''}"${demo ? '' : ' aria-hidden="true"'}>
    <p class="job-pane-head"${demo ? ' aria-hidden="true"' : ''}><span>${xml(kit.brand.name)}</span><span class="job-chip">${ICONS.brain}${say('pane.brain')}</span></p>
    ${demo ? demoFrame(kit, Boolean(task(kit, into, own, demo).tour)) : /* html */ `<p class="job-sent" dir="${kit.dir}">${file}<span>${kit.has('pane.ask') ? say('pane.ask') : asked}</span></p>
    <div class="job-said"><p dir="${kit.dir}">${say('pane.answer')}</p>${art.pane}${chip(kit.text('pane.icon'), 'pane.chip')}</div>
    <p class="job-box">${kit.app('composer.placeholder')}</p>
    <p class="job-ai">${kit.app('composer.ai')}</p>`}
  </div>
</section>`
      // What proves the promise, a block each.
      /** @type {Record<Proof, string>} */
      const blocks = {
        shows: shows ? shows(kit, { say, text: asText(kit).text }) : '',
        replay: /* html */ `<section id="job-replay" class="site-block" aria-labelledby="job-replay-title">
  <header><h3 id="job-replay-title">${say('replay.title')}</h3><p class="site-why">${say('replay.why')}</p></header>
  <div class="job-replay">
  <ol class="job-steps">
    <li><span class="job-step">${home.say('replay.ask')}</span><p class="job-asked" dir="${kit.dir}">${file}<span>${asked}</span></p></li>
    <li><span class="job-step">${say('step.read')}</span>${ticks('replay.reads')}</li>
    <li><span class="job-step">${home.say('replay.work')}</span>${ticks('replay.works')}${art.work ?? ''}</li>
    <li><span class="job-step">${home.say('replay.get')}</span><p>${say('replay.got')}</p>${art.got ?? ''}${chip(kit.text('replay.icon'), 'replay.chip')}</li>
    <li><span class="job-step">${say('step.again')}</span><p class="job-asked" dir="${kit.dir}"><span>${say('replay.again')}</span></p></li>
    <li><span class="job-step">${say('step.made')}</span><p>${say('replay.made')}</p>${chip(kit.text('replay.madeIcon'), 'replay.madeChip')}</li>
  </ol>
  <div class="job-more">
    <h4>${say('asks.title')}</h4>
    <ul class="job-asks">${list('asks.items').map((item) => /* html */ `<li dir="${kit.dir}">${item}</li>`).join('')}</ul>
  </div>
  </div>
</section>`,
        io: /* html */ `<section class="site-block" aria-labelledby="job-io">
  <header><h3 id="job-io">${say('io.title')}</h3><p class="site-why">${say('io.why')}</p></header>
  <div class="job-io">
    <div><h4>${say('io.in')}</h4><dl>${io('io.ins')}</dl></div>
    <div><h4>${say('io.out')}</h4><dl>${io('io.outs')}</dl></div>
  </div>
</section>`,
        exact: /* html */ `<section class="site-block" aria-labelledby="job-exact">
  <header><h3 id="job-exact">${say('exact.title')}</h3><p class="site-why">${say('exact.why')}</p></header>
  <ul class="job-cards">${cards('exact.cards', exact)}</ul>
</section>`,
        where: /* html */ `<section class="site-block" aria-labelledby="job-where">
  <header><h3 id="job-where">${say('where.title')}</h3><p class="site-why">${say('where.why')}</p></header>
  <ul class="job-cards is-where">${cards('where.cards', WHERE)}</ul>
  ${files ? /* html */ `<p><a href="${files}">${kit.app('welcome.files')}</a></p>` : ''}
</section>`,
      }
      const end = /* html */ `${WAVE}
  <h3>${say('end.title')}</h3>
  <p class="site-why">${say('end.why')}</p>
  <p class="site-cta job-go">${FELT.point}${go(false)}</p>`
      // Each part of the promise over what proves it, then the catch's items that part is about: every block the page
      // has under one part, and every item under one, or the build stops.
      const catches = list('catch.items')
      const parts = Object.entries(proves).map(([name, proofs]) => ({ name, proofs: proofs.filter((proof) => blocks[proof]), about: limits[name] ?? [] }))
      const once = (/** @type {Array<string | number>} */ placed, /** @type {Array<string | number>} */ all) => `${[...placed].sort()}` === `${[...all].sort()}`
      if (!once(parts.flatMap(({ proofs }) => proofs), Object.entries(blocks).filter(([, block]) => block).map(([proof]) => proof))) throw new Error(`site/${kit.name}/page.js: proves is not each block of the page, once`)
      if (!once(parts.flatMap(({ about }) => about), catches.map((_, i) => i))) throw new Error(`site/${kit.name}/page.js: limits is not each item of catch.items, once`)
      const named = Object.fromEntries(parts.map(({ name, proofs, about }) => [name, {
        id: `job-${name}`,
        body: proofs.map((proof) => blocks[proof]).join('\n'),
        ...about.length && { catch: caught(home.say('catch.title'), about.map((i) => catches[i])) },
      }]))
      return landing(kit, {
        top: hero,
        promise: say('h1'),
        acts: named,
        turn: { id: 'job-end', body: end },
        questions: { id: 'job-faq', name: 'job-questions', title: home.say('faq.title'), items: table('faq.items', 2) },
      })
    },
  }
}
