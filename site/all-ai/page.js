// SPDX-License-Identifier: MIT
// The page for every AI in one place, at /all-ai in English and /fr/toutes-les-ia in French: ChatGPT, Claude, Gemini,
// a free AI and one on this computer, from one box; a task that keeps its history when the AI changes; and no
// subscription of Jean's own. It sells switching with nothing lost, not answers side by side, which Jean doesn't give:
// its second act's catch and its first question say one AI answers at a time. Its table is the pricing page's with a
// fourth way, a key, and a way into Jean for each, Settings › Brains with that way open (?brain=<way>, ui/brains.js);
// the line under its thread's answers is the app's own, with the app's names for who answered. Its words are
// <lang>.json, and the homepage's, the comparison hub's and the pricing page's where they say the same, read with
// wordsOf() where they are lists, which kit.from() doesn't give; its look all-ai.css, over site.css (site/site.js,
// D438). Only jean.is has it.
import { PROVIDERS } from '../../app/core/llm.js'
import { ICONS, WAVE, caught, felt, fill, hero, landing, underline, wordsOf, xml } from '../site.js'

const ADDRESSES = { en: 'all-ai', fr: 'fr/toutes-les-ia' }

/** The names people type, as the top's picture lists them, before the two ways that have none. */
export const NAMES = ['ChatGPT', 'Claude', 'Gemini', 'Mistral', 'Copilot']

/** The way each row of the table opens in Settings › Brains (WAYS in ui/brain-pages.js), in the table's order. */
export const WAYS = ['device', 'quick', 'chatgpt', 'key']

/** The thread's savings, in euros: three ways by July, the first a sum set aside each month, then the fourth the second AI adds. */
const MONTHLY = 150
const SAVED = [{ amount: 1200, about: false }, { amount: 300, about: true }, { amount: 200, about: true }]
const ADDED = 96

/** The other pages' words in each language, for the lists this page says as they do. */
const THEIRS = Object.fromEntries(await Promise.all(Object.keys(ADDRESSES).map(async (lang) => [lang, {
  home: await wordsOf('home', lang), compare: await wordsOf('compare', lang), pricing: await wordsOf('pricing', lang),
}])))

/** @type {import('../site.js').Page} */
export default {
  addresses: ADDRESSES,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const params = { zero: money.format(0), send: kit.appText('action.send'), auto: kit.appText('auto.name') }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key, more = {}) => kit.list(key, { ...params, ...more })
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    /** One of another page's lists, of words or of rows, filled and escaped. @param {'home' | 'compare' | 'pricing'} page @param {string} key */
    const theirs = (page, key) => {
      const value = (THEIRS[lang] ?? THEIRS.en)[page]?.[key]
      if (!Array.isArray(value)) throw new Error(`site/${page}/${lang}.json: ${key} is not a list, as site/all-ai reads it`)
      const said = (/** @type {string} */ text) => xml(fill(text, { name: kit.brand.name, domain: kit.brand.domain, ...params }))
      return value.map((item) => (Array.isArray(item) ? item.map(said) : [said(item)]))
    }
    const home = kit.from('home')
    // The homepage's ways and their catch, the hub's ways by name and its catch, the pricing page's table and what is not for sale.
    const ways = theirs('home', 'any.ways').map(([way]) => way)
    const lines = theirs('home', 'any.catch').map(([line]) => line)
    const cards = theirs('compare', 'choose.cards').map(([way]) => way)
    const limits = theirs('compare', 'catch.items').map(([line]) => line)
    const heads = [...theirs('pricing', 'ways.heads').map(([head]) => head), say('ways.start')]
    const rows = [...theirs('pricing', 'ways.rows').slice(0, 3), list('ways.key')]
    const sold = theirs('pricing', 'sale.items')
    if (ways.length !== 4 || lines.length !== 3 || cards.length !== 4 || limits.length !== 5 || heads.length !== 4 || rows.length !== WAYS.length || sold.length !== 3) {
      throw new Error(`site/all-ai/${lang}.json, or the homepage's any.ways or any.catch, the hub's choose.cards or catch.items, or the pricing page's ways or sale.items, has a row too many or too few`)
    }
    const [free, , device] = ways
    const named = [device, free, cards[3], cards[2]]
    const which = list('ways.which')
    const go = list('ways.go')
    const pricing = kit.link('pricing') ?? 'pricing'
    const open = /* html */ `<a class="button primary" href="${kit.start}">${kit.say('open')}</a>`
    // A <b>, as a mark by hand holds nothing of its own tag (penned() in site.js).
    const chip = /* html */ `<b class="allai-chip">${ICONS.brain}${kit.app('auto.name')}${ICONS.down}</b>`

    // The names people type over the one box, the chip that picks among them circled by hand.
    const top = hero(kit, {
      id: 'allai-title',
      title: underline(say('h1'), say('h1.mark')),
      lede: say('lede'),
      actions: open,
      facts: list('facts'),
      classes: 'allai-hero',
      aside: /* html */ `<figure class="allai-tab">
    <p class="allai-tab-head">${say('tab.head')}</p>
    <ul class="allai-pills">${[...NAMES.map(xml), free, device].map((name) => /* html */ `<li>${ICONS.brain}${name}</li>`).join('')}</ul>
    <div class="allai-box" aria-hidden="true"><span class="allai-ask">${kit.app('composer.placeholder')}</span>${felt(chip, 'circle')}<span class="allai-send">${ICONS.send}</span></div>
    <figcaption>${say('tab.caption')}</figcaption>
  </figure>`,
    })

    const costs = /* html */ `<section class="site-block" aria-labelledby="allai-ways">
  <header><h3 id="allai-ways">${say('ways.title')}</h3><p class="site-why">${say('ways.why')}</p></header>
  <table class="allai-ways" aria-labelledby="allai-ways">
    <thead><tr>${heads.map((head) => /* html */ `<th scope="col">${head}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([pay, need], i) => /* html */ `
      <tr><th scope="row"><span class="allai-way">${ICONS.brain}${named[i]}</span><span class="allai-which">${which[i]}</span></th><td class="allai-pay" data-label="${heads[1]}">${pay}</td><td class="allai-need" data-label="${heads[2]}">${need}</td><td class="allai-go"><a href="${kit.start}?brain=${WAYS[i]}">${go[i]}</a></td></tr>`).join('')}
    </tbody>
  </table>
</section>`

    // One task, two AIs, each answer with the app's line under it: the device's, then a Claude plan's, as Jean names them.
    const by = (/** @type {string} */ brain) => /* html */ `<p class="allai-by">${ICONS.brain}${kit.app('activity.answeredWith', { brain })}</p>`
    const bars = [...SAVED.map(({ amount }) => amount), ADDED]
    const most = Math.max(...bars)
    const thread = /* html */ `<figure class="allai-thread">
      <p class="allai-said">${kit.from('compare').say('try.ask')}</p>
      <div class="allai-answer">
        <table class="allai-mini"><thead><tr>${list('thread.heads').map((head) => /* html */ `<th scope="col">${head}</th>`).join('')}</tr></thead>
          <tbody>${list('thread.rows', { monthly: money.format(MONTHLY) }).map((way, i) => /* html */ `<tr><td>${way}</td><td>${SAVED[i].about ? say('thread.about', { amount: money.format(SAVED[i].amount) }) : xml(money.format(SAVED[i].amount))}</td></tr>`).join('')}</tbody>
        </table>
        ${by(kit.appText('provider.device'))}
      </div>
      <p class="allai-switched">${say('thread.switched')}</p>
      <p class="allai-said">${say('thread.ask')}</p>
      <div class="allai-answer">
        <ul class="allai-bars">${list('thread.bars').map((what, i) => /* html */ `<li><span>${what}</span><svg aria-hidden="true"><rect height="100%" width="${(bars[i] / most * 100).toFixed(1)}%" rx="3"/></svg><b>${xml(money.format(bars[i]))}</b></li>`).join('')}</ul>
        ${by(`${kit.appText('provider.claudecode')} · ${PROVIDERS.anthropic.defaultModel}`)}
      </div>
      <figcaption>${say('thread.caption')}</figcaption>
    </figure>`
    const middle = /* html */ `<section class="site-block" aria-labelledby="allai-mid">
  <div class="allai-two">
    <div class="allai-words"><h3 id="allai-mid">${say('mid.title')}</h3>${list('mid.why').map((line) => /* html */ `<p class="site-why">${line}</p>`).join('')}</div>
    ${thread}
  </div>
</section>`

    // Where the history is kept: in each AI's own app, or once, under every AI.
    const parts = list('kept.parts')
    const kept = /* html */ `<section class="site-block" aria-labelledby="allai-kept">
  <header><h3 id="allai-kept">${say('kept.title')}</h3><p class="site-why">${say('kept.why')}</p></header>
  <div class="allai-kept">
    <div class="allai-side">
      <div class="allai-frame"><p class="allai-label">${say('kept.apps')}</p>
        <ul class="allai-silos">${NAMES.slice(0, 3).map((name) => /* html */ `<li><b>${xml(name)}</b>${parts.map((part) => /* html */ `<span>${part}</span>`).join('')}</li>`).join('')}</ul>
      </div>
      <p>${say('kept.apps.line')}</p>
    </div>
    <div class="allai-side is-jean">
      <div class="allai-frame"><p class="allai-label">${say('kept.jean')}</p>
        <ul class="allai-over">${[...NAMES.slice(0, 3).map(xml), free, device].map((name) => /* html */ `<li>${name}</li>`).join('')}</ul>
        <ul class="allai-shelf">
          <li><b>${home.say('keep.history')}</b><span>${home.say('keep.history.text')}</span></li>
          <li><b>${home.say('keep.files')}</b><span>${say('kept.files')}</span></li>
          <li><b>${home.say('keep.memory')}</b><span>${say('kept.memory')}</span></li>
        </ul>
      </div>
      <p>${say('kept.jean.line')}</p>
    </div>
  </div>
  <div class="allai-strip"><p>${say('kept.move')}</p><a class="button" href="${kit.link('import') ?? 'import'}">${home.say('move.go')}</a></div>
</section>`

    // What Jean doesn't sell, struck through by hand, and where its price is.
    const sale = /* html */ `<section class="site-block" aria-labelledby="allai-sale">
  <header><h3 id="allai-sale">${say('sale.title')}</h3><p class="site-why">${say('sale.why')}</p></header>
  <ul class="allai-nots">${[...table('sale.items', 2), sold[2]].map(([what, why]) => /* html */ `<li><h4>${felt(what, 'strike')}</h4><p>${why}</p></li>`).join('')}</ul>
  <p class="allai-source">${say('sale.source').replace('{pricing}', () => /* html */ `<a href="${pricing}">${say('sale.pricing')}</a>`)}</p>
</section>`

    const turn = /* html */ `${WAVE}
  <h3>${say('turn.body')}</h3>
  <p class="site-cta">${open}</p>
  <p class="allai-other">${say('turn.other').replace('{plan}', () => /* html */ `<a href="${kit.start}?brain=${WAYS[2]}">${say('turn.plan')}</a>`)}</p>`

    // The promise part by part: every AI is here, the task survives the switch, and Jean adds no subscription; each limit once, under its part.
    const name = kit.say('catch.name')
    return landing(kit, {
      top,
      promise: say('h1'),
      acts: {
        place: { id: 'allai-place', body: costs, catch: caught(name, [lines[1], lines[2], say('place.limit')]) },
        switch: { id: 'allai-switch', body: `${middle}\n${kept}`, catch: caught(name, [...list('switch.limits'), limits[3]]) },
        free: { id: 'allai-free', body: sale, catch: caught(name, [lines[0], kit.from('pricing').say('ways.limit')]) },
      },
      turn: { id: 'allai-turn', body: turn },
      questions: { id: 'allai-faq', name: 'allai-questions', title: home.say('faq.title'), items: table('faq.items', 2) },
    })
  },
}
