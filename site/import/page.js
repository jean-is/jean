// SPDX-License-Identifier: MIT
// The page for people moving from another assistant: how to export from ChatGPT, Claude and Gemini, what
// Restore brings in from each and what it leaves out (D340, D341), and why one never has to move again, at /import in
// English and /fr/importer in French. Every step in another app links its maker's help page and the day it was read
// there, as the comparison pages do. Its buttons open Settings › Your data (?restore). Its words are
// <lang>.json; its look import.css, over site.css (site/site.js, D438).
import { FELT, ICONS, WAVE, caught, felt, highlight, landing, ticks, underline } from '../site.js'

/** Each app's help page for its export, in how.cards's order, and the day it was read there. */
const SOURCES = [
  { url: 'https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data', checked: '2026-10-20' },
  { url: 'https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data', checked: '2026-10-20' },
  { url: 'https://support.google.com/gemini/answer/16920332', checked: '2026-10-20' },
]

/** The comparison's page for each app, in how.cards's order, where there is one. */
const COMPARED = ['compare-chatgpt', 'compare-claude-cowork', null]

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'import', fr: 'fr/importer', ko: 'ko/import' },
  title: (kit) => kit.say('title'),
  main (kit) {
    const { lang } = kit
    const say = kit.say
    const jean = kit.start
    const restore = `${jean}?restore`
    const cards = kit.table('how.cards', 3)
    if (cards.length !== SOURCES.length) throw new Error(`site/import/${lang}.json: how.cards has ${cards.length} apps, SOURCES ${SOURCES.length}`)
    const day = (/** @type {string} */ date) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
    const compare = kit.link('compare')
    const hero = /* html */ `<section class="site-hero imp-hero" aria-labelledby="imp-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="imp-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${restore}">${say('cta')}</a><a class="button" href="#imp-how">${say('see')}</a></p>
    <ul class="site-facts is-felt">${kit.list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="imp-move" aria-hidden="true">
    <ul class="imp-from">${cards.map(([app]) => /* html */ `<li>${ICONS.file}<span>${app}</span></li>`).join('')}</ul>
    ${FELT.across}
    <div class="imp-pane">
      <p class="imp-pane-head">${say('pane.head')}</p>
      <ul class="imp-list">${kit.table('pane.rows', 2).map(([name, from]) => /* html */ `<li dir="${kit.dir}"><span>${name}</span><small>${from}</small></li>`).join('')}</ul>
      <p class="imp-done">${ICONS.plus}${say('pane.done')}</p>
    </div>
  </div>
</section>`
    const how = /* html */ `<section id="imp-how" class="site-block" aria-labelledby="imp-how-title">
  <header><h3 id="imp-how-title">${say('how.title')}</h3><p class="site-why">${say('how.why')}</p></header>
  <ol class="imp-apps">${cards.map(([app, steps, arrives], i) => {
    const page = COMPARED[i] ? kit.link(/** @type {string} */ (COMPARED[i])) : null
    return /* html */ `
    <li><h4>${app}</h4><p>${steps}</p><p class="imp-arrives">${arrives}</p>
      <p class="site-source"><a href="${SOURCES[i].url}">${say('how.read', { app, date: day(SOURCES[i].checked) })}</a></p>${page ? /* html */ `
      <p><a href="${page}">${say('how.compare', { app: kit.from(/** @type {string} */ (COMPARED[i])).text('product') })}</a></p>` : ''}</li>`
  }).join('')}
  </ol>
  <p class="imp-then">${say('how.then', { settings: kit.appText('settings.title'), data: kit.appText('settings.storage'), restore: kit.appText('backup.restore') })}</p>
</section>`
    const what = /* html */ `<section class="site-block" aria-labelledby="imp-what">
  <header><h3 id="imp-what">${say('what.title')}</h3><p class="site-why">${say('what.why')}</p></header>
  <div class="site-two">
    <div class="imp-col"><h4>${say('what.in')}</h4>${ticks(kit.list('what.ins').map((item, i) => (i === 3 ? highlight(item) : item)))}</div>
    <div class="imp-col"><h4>${say('what.out')}</h4><ul class="imp-not">${kit.list('what.outs').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul></div>
  </div>
</section>`
    const never = /* html */ `<section class="site-block" aria-labelledby="imp-never">
  <header><h3 id="imp-never">${felt(say('never.title'), 'under')}</h3><p class="site-why">${say('never.why')}</p></header>
  <div class="imp-cards">${kit.table('never.cards', 2).map(([name, text], i) => /* html */ `<div>${[ICONS.file, ICONS.brain, ICONS.lock][i]}<h4>${name}</h4><p>${text}</p></div>`).join('')}</div>
  ${compare ? /* html */ `<p><a href="${compare}">${say('never.compare')}</a></p>` : ''}
</section>`
    const end = /* html */ `${WAVE}
  <h3>${say('end.title')}</h3>
  <p class="site-why">${say('end.why')}</p>
  <p class="site-cta imp-go">${FELT.point}<a class="button primary" href="${restore}">${say('cta')}</a><a href="#imp-how">${say('see')}</a></p>`
    // What to know first, said under the part of the promise each is about.
    const limits = kit.list('limits.items'), know = (/** @type {number[]} */ ...which) => caught(say('limits.title'), which.map((i) => limits[i]))
    return landing(kit, {
      top: hero,
      promise: say('h1'),
      acts: {
        conversations: { id: 'imp-conversations', body: `${how}\n${what}`, catch: know(0, 1, 3) },
        come: { id: 'imp-come', body: never, catch: know(2) },
      },
      turn: { id: 'imp-end', body: end },
      questions: { id: 'imp-faq', name: 'imp-questions', title: say('faq.title'), items: kit.table('faq.items', 2) },
    })
  },
}
