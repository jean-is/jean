// SPDX-License-Identifier: MIT
// The comparison's hub: Jean beside the kinds of AI app people know, at /compare in English and /fr/comparer
// in French, which the homepage's act on any AI leads to. Its promise part by part, as the homepage says its own
// (landing() in site.js): Jean beside, over its table, kinds rather than brands since products change every month, and a
// card for each product's own page under it; the AI apps one knows, over the ways to use the AI one already has; each
// part with its own catch. Then Your turn, a last Try, the questions and the sources. Its words say what every
// comparison page says alike (product.js); its look compare.css.
import { CITES, DRAWN, PRODUCTS, helpers } from './product.js'
import { FELT, WAVE, landing, underline } from '../site.js'

/** The makers' pages the table's cells are read from, and the day each was read. */
const SOURCES = {
  'openai-train': { url: 'https://chatgpt.com/pricing', checked: '2026-10-20' },
  'claude-train': { url: 'https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training', checked: '2026-10-20' },
  'claude-pricing': { url: 'https://claude.com/pricing', checked: '2026-10-20' },
  'openai-export': { url: 'https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data', checked: '2026-10-20' },
  'claude-export': { url: 'https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data', checked: '2026-10-20' },
  'openai-parents': { url: 'https://help.openai.com/en/articles/12315553-managing-parental-controls-in-chatgpt', checked: '2026-10-20' },
  'claude-age': { url: 'https://www.anthropic.com/legal/consumer-terms', checked: '2026-10-20' },
  'cowork': { url: 'https://claude.com/product/cowork', checked: '2026-10-20' },
  'manus-home': { url: 'https://manus.im/', checked: '2026-11-01' },
  'manus-welcome': { url: 'https://manus.im/docs/introduction/welcome', checked: '2026-11-01' },
  'manus-privacy': { url: 'https://manus.im/privacy', checked: '2026-11-01' },
  'manus-pricing': { url: 'https://manus.im/pricing', checked: '2026-11-01' },
}

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'compare', fr: 'fr/comparer', ko: 'ko/compare' },
  script: CITES,
  main (kit) {
    const { status, cited, sourced, buttons, catches, asked, sideBySide } = helpers(kit, SOURCES)
    const say = kit.say
    const head = kit.table('table.head', 2)
    const choose = kit.table('choose.cards', 3)
    const cards = kit.list('one.cards')
    if (head.length !== 4 || cards.length !== PRODUCTS.length) throw new Error(`site/compare/${kit.lang}.json: table.head names four kinds, one.cards a card a product`)
    const hero = /* html */ `<section class="site-hero cmp-hero" aria-labelledby="cmp-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="cmp-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${kit.start}?q=${encodeURIComponent(kit.text('try.ask'))}">${say('cta')}</a><a class="button" href="#cmp-table">${say('see')}</a></p>
    <ul class="site-facts is-felt">${kit.list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  ${DRAWN.balance}
</section>`
    const table = /* html */ `<section id="cmp-table" class="site-block" aria-labelledby="cmp-table-title">
  <header><h3 id="cmp-table-title">${say('table.title')}</h3><p class="site-why">${say('table.why')}</p></header>
  ${sideBySide('cmp-table-title', [say('table.jean'), ...head.map(([kind, examples]) => /* html */ `${kind}<small>${examples}</small>`)],
    kit.table('table.rows', 9).map(([what, jean, code, chat, chatIds, apps, appsIds, ...others]) => [what, /* html */ `<p>${jean}</p>${status(code)}`,
      /* html */ `<p>${chat}${cited(chatIds)}</p>`, /* html */ `<p>${apps}${cited(appsIds)}</p>`, ...others.map((cell) => /* html */ `<p>${cell}</p>`)]), ' is-kinds')}
</section>`
    const ways = /* html */ `<section class="site-block" aria-labelledby="cmp-choose">
  <header><h3 id="cmp-choose">${say('choose.title')}</h3><p class="site-why">${say('choose.why')}</p></header>
  <ul class="cmp-cards is-four">${choose.map(([title, text, code]) => /* html */ `
    <li><h4>${title}</h4><p>${text}</p>${status(code)}</li>`).join('')}
  </ul>
  <div class="cmp-strip"><p>${say('choose.history')}</p><a class="button" href="${kit.start}?restore">${say('history')}</a></div>
</section>`
    const one = /* html */ `<section class="site-block" aria-labelledby="cmp-one">
  <h3 id="cmp-one">${say('one.title')}</h3>
  <ul class="cmp-products">${PRODUCTS.map((name, i) => /* html */ `
    <li><a href="${kit.link(name)}"><h4>${kit.from(name).say('product')}</h4><span>${cards[i]}</span><span class="cmp-go">${kit.from(name).say('eyebrow')} <span class="flip-rtl" aria-hidden="true">→</span></span></a></li>`).join('')}
  </ul>
</section>`
    const end = /* html */ `${WAVE}
  <h3>${say('end.title')}</h3>
  <p class="site-cta">${FELT.point}${buttons(['try', 'history'], [say('cta'), say('history')])}</p>`
    // The catch, said under the part of the promise each limit is about: where Jean's work lives and that it can be
    // wrong, under Jean beside; what the AI costs, needs and takes, under the AI apps one knows. Why there is one is
    // said once, with the first, whichever part this language says first.
    const [[first]] = kit.table('acts', 2)
    const not = catches({ beside: [3, 4], known: [0, 1, 2] }, (part) => (part === first ? /* html */ `${say('catch.title')}<span class="cmp-why"> ${say('catch.why')}</span>` : say('catch.title')))
    return sourced(landing(kit, {
      top: hero,
      promise: say('h1'),
      acts: {
        beside: { id: 'cmp-beside', body: `${table}\n${one}`, catch: not.beside },
        known: { id: 'cmp-known', body: ways, catch: not.known },
      },
      turn: { id: 'cmp-end', body: end, classes: 'cmp-end' },
      questions: { id: 'cmp-faq', name: 'cmp-questions', title: say('faq.title'), items: asked() },
    }), true)
  },
}
