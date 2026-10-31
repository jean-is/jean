// The associations' page: what Jean does for an association run by volunteers, with no IT and no budget, for the
// board and the volunteers who decide together, at /fr/associations in French and /nonprofits in English. Its jobs
// open the app on a request with sample notes (?q=) or on the sample spreadsheet (?sample); its answers to the
// board say what is true today, each volunteer on their own device and a task shared by link (D361), with nothing
// for the association as a team; the charter's page is linked once it is built. Its words are <lang>.json, the
// app's where it says the same and the homepage's for a request quoted and a Try; its look associations.css, over
// site.css (site/site.js, D438).
import { FELT, ICONS, WAVE, felt, highlight, questions, ticks, underline, xml } from '../site.js'

/** Where the figures on France's associations come from: Recherches & Solidarités' press release, 16 October 2025. */
const SOURCE = 'https://recherches-solidarites.org/wp-content/uploads/2025/10/La_France_associative_CP_16-10-2025.pdf'

const svg = (/** @type {string} */ body) => /* html */ `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`
/** The page's own icons, drawn as site.js's are. */
const OWN = {
  pen: svg('<path d="M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5z"/><path d="M13.5 7l3.5 3.5"/>'),
  mail: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7.5l8 6 8-6"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5"/><path d="M15 9a3.5 3.5 0 1 0 0 6M8 11h5M8 13.5h5"/>'),
  phone: svg('<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>'),
}

/** The jobs, in order, each with its icon; the accounts' Try is the sample spreadsheet, the others a request. */
const JOBS = [
  { key: 'grant', icon: ICONS.file },
  { key: 'minutes', icon: OWN.pen },
  { key: 'newsletter', icon: OWN.mail },
  { key: 'accounts', icon: ICONS.chart, sample: true },
  { key: 'flyer', icon: ICONS.picture },
]
/** The board's four questions, each with its icon and the item of its list under the highlighter, if one is. */
const WORRIES = /** @type {const} */ ([['cost', OWN.coin, -1], ['devices', OWN.phone, -1], ['data', ICONS.lock, 0], ['training', ICONS.brain, -1]])

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'nonprofits', fr: 'fr/associations', ko: 'ko/nonprofits' },
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/\.$/, '')}`,
  main (kit) {
    const { lang, now } = kit
    const params = { free: kit.appText('first.free'), sample: kit.appText('starter.sample.prompt') }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const home = kit.from('home')
    const jean = kit.start
    const ask = (/** @type {string} */ key) => `${jean}?q=${encodeURIComponent(kit.text(`job.${key}.ask`))}`
    const minutes = ask('minutes')
    // The email to the board: no address, its subject and body in the page's language, with this page's whole address.
    const address = kit.address(lang)
    const send = address && `mailto:?subject=${encodeURIComponent(kit.text('mail.subject'))}&body=${encodeURIComponent(kit.text('mail.body', { address }))}`
    const sendIt = send ? /* html */ `<a class="button" href="${xml(send)}">${say('send')}</a>` : ''
    const files = kit.link('files')
    const charter = kit.link('charter')
    const it = kit.link('enterprise')
    // The sections after the board's questions take turns with the side colour, however many there are.
    let turn = 0
    const tone = () => (turn++ % 2 ? ' is-side' : '')
    const job = (/** @type {typeof JOBS[number]} */ { key, icon, sample }) => /* html */ `
    <li>${icon}<h3 id="asso-job-${key}">${say(`job.${key}`)}</h3>
      <p class="asso-ask" dir="auto">${sample ? say(`job.${key}.ask`) : home.say('quote', { text: kit.text(`job.${key}.ask`) })}</p>
      <p class="asso-get"><span>${say('jobs.get')}</span>${say(`job.${key}.get`)}</p>
      <a class="button" href="${sample ? `${jean}?sample` : ask(key)}" aria-describedby="asso-job-${key}">${sample ? say('job.accounts.try') : home.say('tile.try')}</a></li>`
    return /* html */ `<section class="site-hero asso-hero" aria-labelledby="asso-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="asso-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${minutes}">${say('cta')}</a>${sendIt}</p>
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="asso-pane" aria-hidden="true">
    <p class="asso-asked" dir="auto">${say('pane.ask')}</p>
    <p class="asso-answer" dir="auto">${say('pane.answer')}</p>
    <p class="asso-file">${ICONS.file}<span><b>${say('pane.file', { year: String(now.getFullYear()) })}</b><small>${say('pane.kind')}</small></span></p>
    <p class="asso-box">${kit.app('composer.placeholder')}</p>
    <p class="asso-ai">${kit.app('composer.ai')}</p>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="asso-count">
  <header><h2 id="asso-count">${say('count.title')}</h2><p class="site-why">${say('count.why')}</p></header>
  <div class="site-stats">${kit.table('count.stats', 3).map(([number, text, source], i) => /* html */ `<p><b>${i === 1 ? felt(number, 'circle') : number}</b><span>${text}</span><small>${source}</small></p>`).join('')}</div>
  <p class="asso-free">${say('count.free')}</p>
  <p class="site-source"><a href="${SOURCE}" hreflang="fr">${say('count.source')}</a></p>
</section>

<section id="asso-jobs" class="site-section" aria-labelledby="asso-jobs-title">
  <header><h2 id="asso-jobs-title">${say('jobs.title')}</h2><p class="site-why">${say('jobs.why')}</p></header>
  <ul class="asso-jobs">${JOBS.map(job).join('')}
    <li class="is-rest">${ICONS.plus}<h3>${say('job.rest')}</h3><p class="asso-ask">${say('job.rest.text')}</p><a class="button" href="${jean}">${say('job.rest.go')}</a></li>
  </ul>
  <p class="site-source">${say('jobs.note')}</p>
</section>

<section class="site-section is-side" aria-labelledby="asso-worry">
  <header><h2 id="asso-worry">${say('worry.title')}</h2><p class="site-why">${say('worry.why')}</p></header>
  <div class="asso-worries">${WORRIES.map(([key, icon, marked]) => /* html */ `
    <div>${icon}<h3>${say(`worry.${key}`)}</h3><p>${say(`worry.${key}.text`)}</p>${ticks(list(`worry.${key}.list`).map((item, i) => (i === marked ? highlight(item) : item)))}</div>`).join('')}
  </div>
  ${files ? /* html */ `<p><a href="${files}">${kit.app('welcome.files')}</a></p>` : ''}
</section>
${charter ? /* html */ `
<section class="site-section asso-charter${tone()}" aria-labelledby="asso-charter">
  <header><h2 id="asso-charter">${say('charter.title')}</h2><p class="site-why">${say('charter.text')}</p></header>
  <p><a class="button primary" href="${charter}">${say('charter.go')}</a></p>
</section>
` : ''}
<section class="site-section${tone()}" aria-labelledby="asso-limits">
  <h2 id="asso-limits">${say('limits.title')}</h2>
  <ul class="site-limits">${list('limits.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>

<section class="site-section${tone()}" aria-labelledby="asso-faq">
  <h2 id="asso-faq">${say('faq.title')}</h2>
  ${questions('asso-questions', kit.table('faq.items', 2, params))}
</section>

<section id="asso-start" class="site-section site-end asso-start${tone()}" aria-labelledby="asso-start-title">
  ${WAVE}
  <h2 id="asso-start-title">${say('start.title')}</h2>
  <ol>${list('start.steps').map((step) => /* html */ `<li>${step}</li>`).join('')}</ol>
  <p class="asso-go">${FELT.point}<a class="button primary" href="${minutes}">${say('cta')}</a>${sendIt}</p>
  <p class="site-why">${say('start.note')}</p>${it ? /* html */ `
  <p class="asso-other">${say('start.it').replace('{enterprise}', () => /* html */ `<a href="${it}">${kit.from('enterprise').say('title')}</a>`)}</p>` : ''}
</section>`
  },
}
