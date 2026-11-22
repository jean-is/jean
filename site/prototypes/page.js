// SPDX-License-Identifier: MIT
// AI for prototypes (the job pages, ../excel/job.js), at /prototypes and /fr/prototypes, for the reader who searched
// for a free AI that makes a clickable mockup of an app. Its Try sends a salon's idea with ?q= (ui/app.js): asked for
// a prototype, the brain reads Jean's own skill "Make a prototype" (D401), which brings Prototypes (D742), and makes it
// with `prototype`. Its pane is no conversation but the prototype that request makes, live in Jean's own pane
// (site/creation.js): All pages, its board, then Try it. Its five pages are written here as the skill has a brain
// write them, in the page's words: a choice travels in the address, a line says it is a prototype, and no field asks
// for a password or a card. Jean's own check passes them (test/creation.test.js).
import { job } from '../excel/job.js'

/** What each service costs, in the order the first page lists them, as the request gives them. */
const PRICES = [32, 78, 15]

/** A page's head, as the skill asks for one: its own name, then the prototype's. @param {string} lang @param {string} dir @param {string} title */
const head = (lang, dir, title) => `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="look.css">
<link rel="stylesheet" href="style.css">
<script src="prototype.js" defer></script>
</head>`

/** Its one style sheet: an app in a column, coloured and set only through look.css's properties. */
const STYLE = `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; min-block-size: 100dvh; display: flex; flex-direction: column; max-inline-size: 26rem; margin-inline: auto; font: 1.0625rem/1.5 var(--font); color: var(--ink); background: var(--paper); }
h1, h2 { font-family: var(--display); font-weight: var(--display-weight); overflow-wrap: break-word; }
h1 { margin: 0; font-size: 1.6rem; line-height: 1.2; }
h2 { margin-block: 1.5rem 0.5rem; font-size: 1.1rem; }
header { display: flex; flex-direction: column; gap: 0.35rem; padding: 1.25rem 1.25rem 0.75rem; }
main { flex: 1; padding: 0.5rem 1.25rem 1.5rem; }
a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.sample { margin: 0; color: var(--quiet); font-size: 0.875rem; }
.back { align-self: flex-start; font-size: 0.9375rem; }
.list { display: grid; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
.list a, .card { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: 1rem; border-radius: 0.875rem; background: var(--tint); color: var(--ink); text-decoration: none; }
.list small, .card small { display: block; color: var(--quiet); font-size: 0.875rem; }
.price { font-weight: 700; white-space: nowrap; }
form { display: grid; gap: 1rem; }
fieldset { display: grid; gap: 0.6rem; margin: 0; padding: 0; border: 0; }
legend { margin-block-end: 0.6rem; font-weight: 600; }
fieldset label { display: flex; align-items: center; gap: 0.6rem; padding: 0.875rem 1rem; border-radius: 0.875rem; background: var(--tint); }
.button { display: block; inline-size: 100%; padding: 0.875rem 1.25rem; border: 0; border-radius: 0.875rem; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600; text-align: center; text-decoration: none; cursor: pointer; }
dl { display: grid; gap: 0.75rem; margin-block: 0 1.25rem; padding: 1rem; border-radius: 0.875rem; background: var(--tint); }
dt { color: var(--quiet); font-size: 0.875rem; }
dd { margin: 0; font-weight: 600; }
.quiet { color: var(--quiet); font-size: 0.9375rem; }
.tabs { position: sticky; inset-block-end: 0; border-block-start: 1px solid color-mix(in srgb, var(--quiet) 30%, var(--paper)); background: var(--paper); }
.tabs ul { display: grid; grid-template-columns: 1fr 1fr; margin: 0; padding: 0; list-style: none; }
.tabs a { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.6rem; color: var(--quiet); font-size: 0.8125rem; text-decoration: none; }
.tabs a[aria-current] { color: var(--accent); font-weight: 600; }
.tabs svg { inline-size: 1.5rem; block-size: 1.5rem; }
`

/** Its one script, as the skill's sheet on a prototype's shapes gives it: what earlier pages chose, read from the address, shown and carried along. */
const SCRIPT = `// What earlier pages chose, from the address: shown where a page names it, and put in the fields that send it on.
const given = new URLSearchParams(location.search)
for (const element of document.querySelectorAll('[data-given]')) {
  const chosen = given.get(element.dataset.given)
  if (!chosen) continue
  if (element instanceof HTMLInputElement) element.value = chosen
  else element.textContent = chosen
}
// Links that carry every choice so far along.
for (const link of document.querySelectorAll('a[data-carry]')) {
  const url = new URL(link.getAttribute('href'), location.href)
  for (const [key, value] of given) if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  link.href = url.pathname.split('/').pop() + url.search
}
`

/** The tabs' drawings: a calendar, and a list. */
const BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>'
const MINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01"/></svg>'

/**
 * The prototype, as `prototype` is given it: its style sheet, its script, then its pages in the order a client meets them.
 * @param {import('../site.js').Kit} kit @param {(key: string) => string} text @param {(key: string) => string[]} texts
 * @returns {Record<string, string>}
 */
export function pagesOf (kit, text, texts) {
  const { lang, dir } = kit, name = text('made.name'), [service, time] = texts('made.labels'), first = /** @type {string[][]} */ (kit.raw('made.services'))[0][0], slots = texts('made.time.slots')
  const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format
  const page = (/** @type {string} */ key, /** @type {string} */ top, /** @type {string} */ body, tab = -1) => `${head(lang, dir, `${text(`made.${key}.h1`)} · ${name}`)}
<body>
<header>
  ${top}<h1>${text(`made.${key}.h1`)}</h1>
</header>
<main>
${body}
</main>${tab < 0 ? '' : `
<nav class="tabs" aria-label="${text('made.menu')}"><ul>
  <li><a href="index.html"${tab ? '' : ' aria-current="page"'}>${BOOK}${text('made.tabs.book')}</a></li>
  <li><a href="bookings.html"${tab ? ' aria-current="page"' : ''}>${MINE}${text('made.tabs.mine')}</a></li>
</ul></nav>`}
</body>
</html>
`
  const back = (/** @type {string} */ to) => `<a class="back" href="${to}" data-carry><span aria-hidden="true">←</span> ${text('made.back')}</a>\n  `
  const chosen = `<dl>
    <div><dt>${service}</dt><dd data-given="service">${first}</dd></div>
    <div><dt>${time}</dt><dd data-given="time">${slots[0]}</dd></div>
  </dl>`
  return {
    'style.css': STYLE,
    'prototype.js': SCRIPT,
    'index.html': page('home', '', `  <p class="sample">${text('made.sample')}</p>
  <h2>${text('made.home.h2')}</h2>
  <ul class="list">
    ${/** @type {string[][]} */ (kit.raw('made.services')).map(([title, long], i) => `<li><a href="time.html?service=${encodeURIComponent(title)}"><span>${title}<small>${long}</small></span><span class="price">${money(PRICES[i])}</span></a></li>`).join('\n    ')}
  </ul>`, 0),
    'time.html': page('time', back('index.html'), `  <form action="confirm.html" method="get">
    <input type="hidden" name="service" value="${first}" data-given="service">
    <fieldset><legend>${text('made.time.legend')}</legend>
      ${slots.map((slot, i) => `<label for="slot-${i}"><input id="slot-${i}" type="radio" name="time" value="${slot}"${i ? '' : ' checked'}> ${slot}</label>`).join('\n      ')}
    </fieldset>
    <button class="button" type="submit">${text('made.time.next')}</button>
  </form>`),
    'confirm.html': page('confirm', back('time.html'), `  ${chosen}
  <p class="quiet">${text('made.confirm.pay')}</p>
  <a class="button" href="done.html" data-carry>${text('made.confirm.cta')}</a>`),
    'done.html': page('done', '', `  ${chosen}
  <p class="quiet">${text('made.done.note')}</p>
  <p><a class="button" href="bookings.html" data-carry>${text('made.done.mine')}</a></p>
  <p><a href="index.html">${text('made.done.again')}</a></p>`),
    'bookings.html': page('mine', '', `  <h2>${text('made.mine.next')}</h2>
  <div class="card"><span><span data-given="service">${first}</span><small data-given="time">${slots[0]}</small></span></div>
  <h2>${text('made.mine.past')}</h2>
  <div class="card"><span>${text('made.mine.earlier')}<small>${text('made.mine.when')}</small></span></div>`, 1),
  }
}

export default job({
  addresses: { en: 'prototypes', fr: 'fr/prototypes' },
  into: 'ask',
  // Its promise goes from the idea to the click: the idea, proved by what goes in, what comes out and where it goes;
  // the click, by one prototype made step by step and what Jean presses before it shows it.
  proves: { idea: ['io', 'where'], click: ['replay', 'exact'] },
  // The AI behind it and where pictures come from, under the idea; what a prototype isn't, how much it holds, and being wrong, under the click.
  limits: { idea: [0, 1], click: [2, 3, 4] },
  filled (kit) {
    const money = new Intl.NumberFormat(kit.lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format
    return { params: { cut: money(PRICES[0]), colour: money(PRICES[1]), beard: money(PRICES[2]), build: kit.appText('prototypes.build') } }
  },
  drawn: () => ({ pane: '' }),
  made: (kit, { text, texts }) => ({ kind: 'prototype', name: text('made.name'), label: text('pane.title'), asked: text('pane.asked'), shape: 'phone', look: { accent: '#7a4fd6', type: 'calm' }, files: pagesOf(kit, text, texts) }),
})
