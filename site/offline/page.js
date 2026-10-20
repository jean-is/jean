// The page for the AI on the person's own computer (D319): downloaded once, then answering in the browser tab with no
// internet, no account and nothing to install, at /offline in English and /fr/hors-ligne in French. What it needs and
// what it does less well than a big online AI come first, in the lede, then again in full. Its sizes are read from
// the device's brain itself (app/caps/brain-local/brain-local.js), so the page follows it; its words are <lang>.json,
// the app's own catalogues where the app says the same (the box sealed, its download, Keep on this device); its look
// offline.css, over site.css (site/site.js, D438).
import { readFile } from 'node:fs/promises'
import { FELT, ICONS, WAVE, felt, questions, ticks, underline, xml } from '../site.js'

const CODE = 'app/caps/brain-local/brain-local.js'
const BRAIN = await readFile(new URL(`../../${CODE}`, import.meta.url), 'utf8')

/** A number the device's brain says of itself; one it no longer says as it did stops the build. @param {RegExp} pattern @param {string} what */
function said (pattern, what) {
  const found = Number(pattern.exec(BRAIN)?.[1])
  if (!found) throw new Error(`${CODE} no longer says ${what} as site/offline/page.js reads it`)
  return found
}

/** Its download, in bytes; the memory a computer needs, in GB; and how much more free space than the download it asks. */
const BYTES = said(/bytes: ([\d.e]+)/, 'its download’s size')
const MEMORY = said(/const MEMORY_GB = (\d+)/, 'the memory it needs')
const ROOM = said(/GEMMA\.bytes \* ([\d.]+)/, 'the free space it asks')

/** What it holds once loaded, in GB, measured in Chromium on a Mac (docs/architecture.md, Brain ladder). */
const LOADED = 7
/** How soon its first words came once loaded, in seconds, in Chromium and Playwright's WebKit on an M3 Max (docs/certificates.md, D402). */
const FIRST = { date: '2026-10-18', chromium: 0.16, webkit: 0.5 }
/** How much of the download the box in Settings shows done. */
const DONE = 0.4

/** No connection: a cloud struck through, as the app's own legend draws it (caps/brain-local/private.js). */
const OFFLINE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18.5h9.25a3.75 3.75 0 0 0 .5-7.47 5.25 5.25 0 0 0-10.1-1.03A4.25 4.25 0 0 0 7.5 18.5ZM4 4l16 16"/></svg>'
/** A label: what it writes says it is an AI's. */
const MARK = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.5v-8h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.5"/></svg>'

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'offline', fr: 'fr/hors-ligne' },
  main (kit) {
    const { lang } = kit
    const gb = (/** @type {number} */ n) => new Intl.NumberFormat(lang, { style: 'unit', unit: 'gigabyte', maximumFractionDigits: 1 }).format(n)
    const seconds = (/** @type {number} */ n) => new Intl.NumberFormat(lang, { style: 'unit', unit: 'second', maximumFractionDigits: 2 }).format(n)
    const params = {
      size: gb(BYTES / 1e9), memory: gb(MEMORY), space: gb(BYTES * ROOM / 1e9), loaded: gb(LOADED),
      keep: kit.appText('picker.keepOnDevice'), auto: kit.appText('auto.name'),
      date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${FIRST.date}T12:00:00`)),
      chromium: seconds(FIRST.chromium), webkit: seconds(FIRST.webkit),
    }
    // What search results show says the download and the memory as the page does, so neither can drift from the brain.
    for (const value of [params.size, params.memory]) if (!kit.text('description').includes(value)) throw new Error(`site/offline/${lang}.json: its description doesn't say ${value}`)
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    const app = (/** @type {string} */ key, more = {}) => kit.app(key, { ...params, ...more })
    const jean = kit.start
    // Settings › Brains, with the way to the brain on this computer, or to Ollama's and LM Studio's (D445).
    const device = `${jean}?brain=device`
    const enterprise = kit.link('enterprise')
    return /* html */ `<section class="site-hero off-hero" aria-labelledby="off-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="off-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${device}">${say('cta')}</a><a href="#off-needs">${say('check')}</a></p>
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="off-pane" aria-hidden="true">
    <p class="off-pane-head"><span>${xml(kit.brand.name)}</span><span class="off-chip">${OFFLINE}${say('pane.offline')}</span></p>
    <p class="off-asked" dir="auto">${say('pane.ask')}</p>
    <p class="off-answer" dir="auto">${say('pane.answer')}</p>
    <p class="off-box"><span>${app('composer.placeholder')}</span>${felt(/* html */ `<span class="off-seal">${ICONS.shield}${app('private.away')}</span>`, 'circle')}</p>
    <p class="off-ai">${app('composer.ai')}</p>
  </div>
</section>

<section id="off-needs" class="site-section is-side" aria-labelledby="off-needs-title">
  <header><h2 id="off-needs-title">${say('needs.title')}</h2><p class="site-why">${say('needs.why')}</p></header>
  <div class="site-two">
    <dl class="off-specs">${table('needs.rows', 2).map(([what, need]) => /* html */ `
      <div><dt>${what}</dt><dd>${need}</dd></div>`).join('')}
    </dl>
    <div class="off-else">
      <h3>${say('needs.elseTitle')}</h3>
      <p>${say('needs.else')}</p>
      <p>${say('needs.local')} <a href="${jean}?brain=local">${say('needs.localLink')}</a></p>
      <p class="site-source">${say('needs.crash')}</p>
    </div>
  </div>
</section>

<section class="site-section" aria-labelledby="off-how">
  <header><h2 id="off-how">${say('how.title')}</h2><p class="site-why">${say('how.why')}</p></header>
  <div class="site-two">
    <ol class="off-steps">${list('how.steps').map((step) => /* html */ `<li>${step}</li>`).join('')}</ol>
    <div class="off-way" aria-hidden="true">
      <p class="off-way-head"><span class="off-way-icon">${ICONS.computer}</span><span><b>${app('brain.device.title')}</b><small>${app('brain.device.private')}</small></span></p>
      <p>${app('brain.device.text')}</p>
      <span class="off-progress"><span></span></span>
      <p class="off-hint">${app('brain.device.progress', { done: gb(BYTES * DONE / 1e9), total: params.size })}</p>
    </div>
  </div>
  <div class="off-speed">
    <p>${say('how.speed')}</p>
    <p class="site-source">${say('how.source')}</p>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="off-private">
  <header><h2 id="off-private">${say('private.title')}</h2><p class="site-why">${say('private.why')}</p></header>
  <div class="off-cards">${table('private.cards', 2).map(([name, text], i) => /* html */ `<div>${[ICONS.shield, ICONS.lock, MARK][i]}<h3>${name}</h3><p>${text}</p>${i === 2 ? /* html */ `<p><a href="${kit.site('check')}">${say('private.check')}</a></p>` : ''}</div>`).join('')}</div>
</section>

<section class="site-section" aria-labelledby="off-also">
  <header><h2 id="off-also">${say('also.title')}</h2><p class="site-why">${say('also.why')}</p></header>
  <div class="site-two">
    <div class="off-list"><h3>${say('also.yes')}</h3>${ticks(list('also.yesItems'))}</div>
    <div class="off-list"><h3>${say('also.no')}</h3><ul class="off-dashes">${list('also.noItems').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul></div>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="off-versus">
  <header><h2 id="off-versus">${say('versus.title')}</h2><p class="site-why">${say('versus.why')}</p></header>
  <div class="off-table-wrap">
    <table class="off-table">
      <thead><tr><td></td><th scope="col">${say('versus.here')}</th><th scope="col">${say('versus.online')}</th></tr></thead>
      <tbody>${table('versus.rows', 3).map(([what, here, online]) => /* html */ `
        <tr><th scope="row">${what}</th><td>${here}</td><td>${online}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <p class="off-both">${say('versus.both')}</p>
</section>

<section class="site-section" aria-labelledby="off-work">
  <header><h2 id="off-work">${say('work.title')}</h2><p class="site-why">${say('work.why')}</p></header>
  ${enterprise ? /* html */ `<p><a href="${enterprise}">${say('work.link')}</a></p>` : ''}
</section>

<section class="site-section is-side" aria-labelledby="off-limits">
  <h2 id="off-limits">${say('limits.title')}</h2>
  <ul class="site-limits">${list('limits.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>

<section class="site-section" aria-labelledby="off-faq">
  <h2 id="off-faq">${say('faq.title')}</h2>
  ${questions('off-questions', table('faq.items', 2))}
</section>

<section class="site-section is-side site-end" aria-labelledby="off-end">
  ${WAVE}
  <h2 id="off-end">${app('private.try')}</h2>
  <p class="site-why">${say('end.why')}</p>
  <p class="off-go">${FELT.point}<a class="button primary" href="${device}">${say('cta')}</a></p>
</section>`
  },
}
