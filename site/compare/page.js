// The comparison's hub (D445): Jean beside the kinds of AI app people know, at /compare in English and /fr/comparer
// in French, which the homepage's Your AI door leads to. Kinds rather than brands in its table, since products
// change every month; then the ways to use the AI one already has, a card for each product's own page, the catch,
// questions and a last Try. Its words say what every comparison page says alike (product.js); its look compare.css.
import { PRODUCTS, helpers } from './product.js'
import { WAVE } from '../site.js'

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
}

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'compare', fr: 'fr/comparer' },
  foot: (kit) => helpers(kit, SOURCES).foot(),
  main (kit) {
    const { status, cited, buttons, caught, asked, sideBySide } = helpers(kit, SOURCES)
    const say = kit.say
    const head = kit.table('table.head', 2)
    const choose = kit.table('choose.cards', 3)
    const cards = kit.list('one.cards')
    if (head.length !== 4 || cards.length !== PRODUCTS.length) throw new Error(`site/compare/${kit.lang}.json: table.head names four kinds, one.cards a card a product`)
    let n = 0
    const tone = () => (n++ % 2 ? '' : ' is-side')
    return /* html */ `<section class="site-hero cmp-hero" aria-labelledby="cmp-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="cmp-title">${say('h1')}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${kit.start}?q=${encodeURIComponent(kit.text('try.ask'))}">${say('cta')}</a><a class="button" href="#cmp-table">${say('see')}</a></p>
    <ul class="site-facts">${kit.list('facts').map((fact) => /* html */ `<li>${fact}</li>`).join('')}</ul>
  </div>
</section>

<section id="cmp-table" class="site-section${tone()}" aria-labelledby="cmp-table-title">
  <header><h2 id="cmp-table-title">${say('table.title')}</h2><p class="site-why">${say('table.why')}</p></header>
  ${sideBySide('cmp-table-title', [say('table.jean'), ...head.map(([kind, examples]) => /* html */ `${kind}<small>${examples}</small>`)],
    kit.table('table.rows', 9).map(([what, jean, code, chat, chatIds, apps, appsIds, ...others]) => [what, /* html */ `<p>${jean}</p>${status(code)}`,
      /* html */ `<p>${chat}</p>${cited(chatIds)}`, /* html */ `<p>${apps}</p>${cited(appsIds)}`, ...others.map((cell) => /* html */ `<p>${cell}</p>`)]), ' is-kinds')}
</section>

<section class="site-section${tone()}" aria-labelledby="cmp-choose">
  <header><h2 id="cmp-choose">${say('choose.title')}</h2><p class="site-why">${say('choose.why')}</p></header>
  <ul class="cmp-cards is-four">${choose.map(([title, text, code]) => /* html */ `
    <li><h3>${title}</h3><p>${text}</p>${status(code)}</li>`).join('')}
  </ul>
  <div class="cmp-strip"><p>${say('choose.history')}</p><a class="button" href="${kit.start}?restore">${say('history')}</a></div>
</section>

<section class="site-section${tone()}" aria-labelledby="cmp-one">
  <h2 id="cmp-one">${say('one.title')}</h2>
  <ul class="cmp-products">${PRODUCTS.map((name, i) => /* html */ `
    <li><a href="${kit.link(name)}"><b>${kit.from(name).say('product')}</b><span>${cards[i]}</span><span class="cmp-go">${kit.from(name).say('eyebrow')} <span class="flip-rtl" aria-hidden="true">→</span></span></a></li>`).join('')}
  </ul>
</section>

${caught(tone())}

<section class="site-section${tone()}" aria-labelledby="cmp-faq">
  <h2 id="cmp-faq">${say('faq.title')}</h2>
  ${asked('cmp-questions')}
</section>

<section class="site-section${tone()} site-end cmp-end" aria-labelledby="cmp-end">
  ${WAVE}
  <h2 id="cmp-end">${say('end.title')}</h2>
  <p class="site-cta">${buttons(['try', 'history'], [say('cta'), say('history')])}</p>
</section>`
  },
}
