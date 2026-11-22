// SPDX-License-Identifier: MIT
// AI for apps (the job pages, ../excel/job.js), at /apps and /fr/applis, for the reader who searched for a free AI
// that makes a small app: a tracker, a calculator, a planner. Its Try sends a freelancer's request with ?q= (ui/app.js):
// asked for an app, the brain reads Jean's own skill "Make an app" (D401) and writes it as a page in its answer (D289),
// kept as an app among the creations (D553) with what it keeps (D688). Its pane plays that task: the app in the answer,
// working there, written here as the skill has a brain write one, in the page's words: two views of one page, what is
// entered kept and added up again at each change, its look the room's, samples said to be samples.
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

/** The app's style, the room's colours and type alone, and its script, which keeps what is entered under one key. */
const STYLE = `nav { display: flex; gap: 0.5rem; margin-block-end: 1rem; }
nav button[aria-current] { background: var(--color-background-inverse); color: var(--color-text-inverse); }
h2 { margin-block: 0 0.75rem; font-size: 1.15rem; }
form { display: grid; grid-template-columns: minmax(0, 1fr) 6rem auto; gap: 0.5rem; align-items: end; }
form div { display: grid; gap: 0.25rem; }
input { box-sizing: border-box; inline-size: 100%; }
#missing { grid-column: 1 / -1; margin: 0; color: var(--color-text-danger); }
.note { margin-block: 0.75rem 0; color: var(--color-text-secondary); }
ul { display: grid; gap: 0.5rem; margin: 0.75rem 0 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.5rem 0.5rem 0.75rem; border: 1px solid var(--color-border-primary); border-radius: var(--border-radius-lg); }
li span:first-child { flex: 1; overflow-wrap: anywhere; }
table { inline-size: 100%; border-collapse: collapse; }
th, td { padding: 0.5rem 0.25rem; border-block-end: 1px solid var(--color-border-primary); text-align: start; font-weight: 400; }
th:last-child, td:last-child { text-align: end; font-variant-numeric: tabular-nums; }
thead th, tfoot :is(th, td) { font-weight: 600; }`

const SCRIPT = `const KEY = 'hours', $ = (id) => document.getElementById(id)
const hours = new Intl.NumberFormat(document.documentElement.lang || 'en', { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 2 })
let state = null, gone = null
try { state = JSON.parse(localStorage.getItem(KEY)) } catch {}
state ??= { entries: SAMPLES.map(([client, time], i) => ({ id: i + 1, client, hours: Number(time), sample: true })) }
const keep = () => { localStorage.setItem(KEY, JSON.stringify(state)); draw() }
const make = (tag, text, more = {}) => Object.assign(document.createElement(tag), { textContent: text, ...more })
function draw () {
  $('entries').replaceChildren(...state.entries.map((entry) => {
    const row = make('li', ''), off = make('button', '×', { type: 'button' })
    off.setAttribute('aria-label', WORDS.remove.replace('{who}', entry.client))
    off.addEventListener('click', () => { state.entries = state.entries.filter((one) => one !== entry); gone = entry; $('said').textContent = WORDS.removed.replace('{who}', entry.client); $('undo').hidden = false; keep() })
    row.append(make('span', entry.client, { dir: 'auto' }), make('span', hours.format(entry.hours)), off)
    return row
  }))
  $('samples').hidden = !state.entries.some((entry) => entry.sample)
  $('empty').hidden = state.entries.length > 0
  const sums = new Map()
  for (const entry of state.entries) sums.set(entry.client, (sums.get(entry.client) ?? 0) + entry.hours)
  $('rows').replaceChildren(...[...sums].sort((a, b) => b[1] - a[1]).map(([client, sum]) => { const row = make('tr', ''); row.append(make('th', client, { scope: 'row', dir: 'auto' }), make('td', hours.format(sum))); return row }))
  $('sum').textContent = hours.format(state.entries.reduce((sum, entry) => sum + entry.hours, 0))
}
$('add').addEventListener('submit', (event) => {
  event.preventDefault()
  const client = $('client').value.trim(), time = Number($('hours').value)
  $('missing').textContent = client && time > 0 ? '' : WORDS.missing
  if (!client || !(time > 0)) return
  state.entries.push({ id: Date.now(), client, hours: time })
  $('add').reset(); $('client').focus(); keep()
})
$('unsample').addEventListener('click', () => { state.entries = state.entries.filter((entry) => !entry.sample); keep() })
$('undo').addEventListener('click', () => { if (gone) state.entries = [...state.entries, gone].sort((a, b) => a.id - b.id); gone = null; $('said').textContent = ''; $('undo').hidden = true; keep() })
for (const button of document.querySelectorAll('nav button')) button.addEventListener('click', () => {
  for (const other of document.querySelectorAll('nav button')) other.toggleAttribute('aria-current', false)
  button.setAttribute('aria-current', 'page')
  for (const view of document.querySelectorAll('section')) view.hidden = view.id !== button.dataset.view
  document.querySelector('#' + button.dataset.view + ' h2').focus()
})
draw()`

/** Text made safe in the app's markup. @param {string} text */
const safe = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/**
 * The app, as an answer holds it: from its <title>, its markup, one style and one script.
 * @param {import('../site.js').Kit} kit @param {(key: string) => string} text @param {(key: string) => string[]} texts
 */
export function appOf (kit, text, texts) {
  const say = (/** @type {string} */ key) => safe(text(`app.${key}`)), [log, totals] = texts('app.views').map(safe), [client, time] = texts('app.heads').map(safe)
  const words = Object.fromEntries(['remove', 'removed', 'missing'].map((key) => [key, text(`app.${key}`)]))
  return `<title>${say('title')}</title>
<nav aria-label="${say('nav')}"><button type="button" data-view="log" aria-current="page">${log}</button><button type="button" data-view="totals">${totals}</button></nav>
<section id="log">
  <h2 tabindex="-1">${say('week')}</h2>
  <form id="add" novalidate>
    <div><label for="client">${client}</label><input id="client" autocomplete="off"></div>
    <div><label for="hours">${time}</label><input id="hours" type="number" min="0.25" max="24" step="0.25" inputmode="decimal"></div>
    <button>${say('add')}</button>
    <p id="missing" role="alert"></p>
  </form>
  <p id="samples" class="note">${say('samples')} <button type="button" id="unsample">${say('unsample')}</button></p>
  <p id="empty" class="note" hidden>${say('empty')}</p>
  <ul id="entries"></ul>
  <p class="note"><span id="said" role="status"></span> <button type="button" id="undo" hidden>${say('undo')}</button></p>
</section>
<section id="totals" hidden>
  <h2 tabindex="-1">${say('totals')}</h2>
  <table>
    <thead><tr><th scope="col">${client}</th><th scope="col">${time}</th></tr></thead>
    <tbody id="rows"></tbody>
    <tfoot><tr><th scope="row">${say('total')}</th><td id="sum"></td></tr></tfoot>
  </table>
</section>
<style>
${STYLE}
</style>
<script>
const WORDS = ${JSON.stringify(words)}, SAMPLES = ${JSON.stringify(kit.raw('app.sample'))}
${SCRIPT}
</script>`
}

export default job({
  addresses: { en: 'apps', fr: 'fr/applis' },
  into: 'ask',
  tall: true,
  // Its promise goes from the words to the use: the words, proved by what goes in, what comes out and where what is
  // entered goes; the use, by one app made step by step and what Jean tries before the answer ends.
  proves: { say: ['io', 'where'], use: ['replay', 'exact'] },
  exact: [ICONS.computer, ICONS.app, ICONS.shield],
  // The AI behind it and when a page needs no code, under the words; what an app can't do, how much it keeps, and being wrong, under the use.
  limits: { say: [0, 1], use: [2, 3, 4] },
  drawn: () => ({ pane: '' }),
  demo: (kit, { text, texts }) => ({ answer: `${text('demo.before')}\n\n\`\`\`html\n${appOf(kit, text, texts)}\n\`\`\`\n\n${text('demo.after')}` }),
})
