// The page for the person at work (D447): what Jean does with their work, where it goes, why their IT may say no and
// what answers it, and a ready email that asks IT, at /work in English and /fr/travail in French. It never shows a
// way round IT. The email leads to the page for IT (D428), or the public sector's where it is built. Its words are
// <lang>.json, the homepage's for the tiles it shares and the page for IT's where they say the same; its look
// work.css, over site.css (site/site.js, D438).
import { BANDS, SMALL } from '../enterprise/page.js'
import { FELT, ICONS, WAVE, highlight, questions, underline, xml } from '../site.js'

const ADDRESSES = { en: 'work', fr: 'fr/travail' }

/** What IT asks, in it.rows's order: each answer's status, as the page for IT's statuses are. */
const STATUSES = ['built', 'built', 'built', 'built', 'built', 'key']

/** The jobs it shows, each an icon and the homepage's tile, tried with ?q=; the first is the sample spreadsheet's, tried with ?sample. */
const TILES = [['table', null], ['slides', 'tile.slides'], ['file', 'tile.minutes'], ['clock', 'tile.plan']]

/** @type {import('../site.js').Page} */
export default {
  addresses: ADDRESSES,
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/\.$/, '')}`,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const params = { from: money.format(BANDS[0].price), people: new Intl.NumberFormat(lang).format(BANDS[0].people), small: new Intl.NumberFormat(lang).format(SMALL) }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    const home = kit.from('home')
    const it = kit.from('enterprise')
    const jean = kit.start
    const rows = table('it.rows', 2)
    if (rows.length !== STATUSES.length) throw new Error(`site/work/${lang}.json: it.rows has ${rows.length} rows, STATUSES ${STATUSES.length}`)
    // The pages the email can lead to, each by its whole address: the page for IT, and the public sector's once built.
    const whole = (/** @type {string | null} */ link) => (link ? new URL(link, kit.address(lang) ?? `https://${kit.brand.domain}/${ADDRESSES[/** @type {'en' | 'fr'} */ (lang)]}`).href : null)
    const employers = [['mail.company', whole(kit.link('enterprise'))], ['mail.public', whole(kit.link('public-sector'))]].filter(([, page]) => page)
    const mail = (/** @type {string | null} */ page) => `mailto:?subject=${encodeURIComponent(kit.text('mail.subject'))}&amp;body=${encodeURIComponent(kit.text('mail.body', { page: page ?? '' }))}`
    const files = kit.link('files')
    const enterprise = kit.link('enterprise')
    return /* html */ `<section class="site-hero wrk-hero" aria-labelledby="wrk-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="wrk-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${jean}?sample">${say('cta')}</a><a class="button" href="#wrk-kit">${say('ask')}</a></p>
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="wrk-pane" aria-hidden="true">
    <p class="wrk-pane-head"><span>${xml(kit.brand.name)}</span><span class="wrk-chip">${ICONS.brain}${say('pane.brain')}</span></p>
    <p class="wrk-file" dir="auto">${ICONS.file}${it.say('people.file')}</p>
    <p class="wrk-asked" dir="auto">${it.say('people.ask')}</p>
    <p class="wrk-answer" dir="auto">${it.say('people.answer')}</p>
    <p class="wrk-box">${kit.app('composer.placeholder')}</p>
    <p class="wrk-ai">${kit.app('composer.ai')}</p>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="wrk-jobs">
  <header><h2 id="wrk-jobs">${say('jobs.title')}</h2><p class="site-why">${say('jobs.why')}</p></header>
  <ul class="wrk-tiles">${TILES.map(([icon, key]) => /* html */ `<li>${ICONS[/** @type {keyof typeof ICONS} */ (icon)]}<p>${key ? home.say(key) : say('jobs.sample')}</p><a class="button" href="${jean}${key ? `?q=${encodeURIComponent(home.text(key))}` : '?sample'}">${home.say('tile.try')}</a></li>`).join('')}</ul>
</section>

<section class="site-section" aria-labelledby="wrk-where">
  <header><h2 id="wrk-where">${say('where.title')}</h2><p class="site-why">${say('where.why')}</p></header>
  <div class="wrk-where">${table('where.cards', 2).map(([name, text], i) => /* html */ `<div${i === 2 ? ' class="is-never"' : ''}>${[ICONS.computer, ICONS.brain, ICONS.never][i]}<h3>${name}</h3><p>${text}</p></div>`).join('')}</div>
  ${files ? /* html */ `<p><a href="${files}">${kit.app('welcome.files')}</a></p>` : ''}
</section>

<section class="site-section is-side" aria-labelledby="wrk-it">
  <header><h2 id="wrk-it">${say('it.title')}</h2><p class="site-why">${say('it.why')}</p></header>
  <div class="site-two">
    <div class="wrk-body">
      <p>${highlight(say('it.body'))}</p>
      <p class="site-source">${say('it.source')}</p>
      ${enterprise ? /* html */ `<p><a href="${enterprise}">${say('it.more')}</a></p>` : ''}
    </div>
    <dl class="wrk-answers">${rows.map(([question, answer], i) => /* html */ `
      <div><dt>${question}</dt><dd>${answer}</dd><dd><span class="wrk-status is-${STATUSES[i]}">${it.say(`status.${STATUSES[i]}`)}</span></dd></div>`).join('')}
    </dl>
  </div>
</section>

<section id="wrk-kit" class="site-section" aria-labelledby="wrk-kit-title">
  <header><h2 id="wrk-kit-title">${say('kit.title')}</h2><p class="site-why">${say('kit.why')}</p></header>
  <div class="site-two">
    <figure class="wrk-mail">
      <figcaption>${say('kit.label')}</figcaption>
      <p class="wrk-subject"><span>${say('kit.subject')}</span> ${say('mail.subject')}</p>
      <p class="wrk-letter" dir="auto">${say('mail.body', { page: employers[0]?.[1] ?? '' })}</p>
    </figure>
    <div class="wrk-send">
      <ol class="wrk-steps">${list('kit.steps').map((step) => /* html */ `<li>${step}</li>`).join('')}</ol>
      <p class="wrk-go">${FELT.point}${employers.map(([key, page], i) => /* html */ `<a class="button${i ? '' : ' primary'}" href="${mail(page)}">${say(key)}</a>`).join('')}</p>
      <p class="site-source">${say('kit.note')}</p>
    </div>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="wrk-limits">
  <h2 id="wrk-limits">${say('limits.title')}</h2>
  <ul class="site-limits">${list('limits.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>

<section class="site-section" aria-labelledby="wrk-faq">
  <h2 id="wrk-faq">${say('faq.title')}</h2>
  ${questions('wrk-questions', table('faq.items', 2))}
</section>

<section class="site-section is-side site-end" aria-labelledby="wrk-end">
  ${WAVE}
  <h2 id="wrk-end">${say('end.title')}</h2>
  <p class="site-why">${say('end.why')}</p>
  <p class="site-cta wrk-go">${FELT.point}<a class="button primary" href="${jean}?sample">${say('cta')}</a><a href="#wrk-kit">${say('ask')}</a></p>
</section>`
  },
}
