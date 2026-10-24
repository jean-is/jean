// The family page (D424): what a child's profile is, for the parent who reads before setting one up, at /family in
// English and /fr/famille in French. It promises the profile (D389, D390) and, its gate passed (D394), how a child
// learns with Learn it's steps, with how often the brains a child's profile asks give the answer anyway as its proof.
// Its words are <lang>.json, the app's own catalogues where the app says the same (a profile's topics, choices,
// labels and notices), and the homepage's for the family's tiles; its look family.css, over site.css (site/site.js, D438).
import { readFile } from 'node:fs/promises'
import { FELT, ICONS, WAVE, felt, highlight, questions, ticks, underline, xml } from '../site.js'

/** How often each brain gave a child the answer, as npm run tutor -- --write keeps it. */
const RESULTS = new URL('../../test/tutor/results.md', import.meta.url)

/**
 * How often each brain gave a child the answer to their own work, as a child's profile asks it now (Learn it
 * with each message), from test/tutor/results.md: its name, where it ran, the shares, and the day it was measured.
 * @returns {Promise<Array<{ brain: string, provider: string, given: number, pressure: number, date: string }>>}
 */
export async function measured () {
  const text = await readFile(RESULTS, 'utf8').catch(() => '')
  const rows = []
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    const label = cells[1] ?? ''
    if (!line.startsWith('|') || !label.endsWith(', Learn it with each message')) continue
    const named = label.slice(0, -', Learn it with each message'.length)
    const [, brain = named, provider = ''] = /^(.+?) \(([\w.-]+)/.exec(named) ?? []
    const date = new RegExp(`^## ${named.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, Learn it with each message, (\\d{4}-\\d{2}-\\d{2})`, 'm').exec(text)?.[1] ?? ''
    rows.push({ brain, provider, given: Number(cells[2].replace(/\D/g, '')) / 100, pressure: Number(cells[3].replace(/\D/g, '')) / 100, date })
  }
  return rows
}

const ROWS = await measured()

/** A week of a child's minutes, the last day today, as the parent's profile counts them. */
const WEEK = [40, 55, 20, 65, 30, 0, 35]

/** Wax crayon (D443): a drawing's grain, and its hand's wobble. @param {string} id */
const crayon = (id) => /* html */ `<defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.75" result="wax"/><feComposite in="SourceGraphic" in2="wax" operator="in" result="drawn"/><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="2" result="hand"/><feDisplacementMap in="drawn" in2="hand" scale="3.5" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`

/** A child's drawing around the profiles: the sun in the corner, then the family on the grass with a kite whose tail is the tilde. */
const SUN = /* html */ `<svg class="fam-crayon fam-sun" viewBox="0 0 170 170" aria-hidden="true">${crayon('fam-wax-sun')}<g filter="url(#fam-wax-sun)"><rect x="-30" y="-40" width="200" height="210" fill="none"/>
  <circle class="is-sun" cx="34" cy="30" r="58"/><path class="is-ochre" stroke-width="9" d="M112 42L150 50M104 84L136 108M76 108L92 146M30 116L28 154M112 2L150-6"/></g></svg>`
const KIDS = /* html */ `<svg class="fam-crayon fam-kids" viewBox="680 60 760 800" aria-hidden="true">${crayon('fam-wax-kids')}<g filter="url(#fam-wax-kids)"><rect x="680" y="60" width="760" height="800" fill="none"/>
  <path class="is-green" stroke-width="7" d="M700 792C760 788 800 798 860 790C930 782 990 796 1060 790C1140 784 1220 796 1300 788C1350 784 1400 792 1450 788M760 794l4-14M790 796l-3-12M900 788l3-13M1010 794l-4-12M1190 790l3-14M1340 788l-3-12"/>
  <g class="is-blue" stroke-width="6"><circle cx="900" cy="632" r="17"/><path d="M900 649L900 720M900 666L872 696M900 666L934 682M900 720L884 784M900 720L918 784"/></g>
  <g class="is-pink" stroke-width="6"><circle cx="960" cy="676" r="13"/><path d="M960 689L960 738M960 700L934 684M960 700L988 712M960 738L948 786M960 738L972 786M948 664C950 656 970 656 972 664"/></g>
  <g class="is-green" stroke-width="6"><circle cx="1024" cy="652" r="15"/><path d="M1024 667L1024 728M1024 680L992 712M1024 680L1050 640M1024 728L1010 786M1024 728L1040 786"/></g>
  <path class="is-ink" stroke-width="2.4" d="M1050 638C1120 520 1210 380 1312 196"/>
  <path class="is-kite" stroke-width="6" d="M1324 92L1372 160L1320 212L1276 152Z"/><path class="is-blue" stroke-width="4" d="M1324 96L1320 208M1280 152L1368 160"/>
  <path class="is-ochre" stroke-width="6" d="M1320 214C1338 230 1320 248 1340 262C1360 276 1342 294 1362 308C1382 322 1366 340 1388 352"/></g></svg>`

/** The unicorn of Léa's invitation, pinned to the fridge beside the family's ideas. */
const UNICORN = /* html */ `<svg class="fam-crayon fam-unicorn" viewBox="0 0 300 280" aria-hidden="true">${crayon('fam-wax-unicorn')}<g filter="url(#fam-wax-unicorn)"><rect width="300" height="280" fill="none"/>
  <path class="is-violet" stroke-width="5" d="M92 176C80 136 100 96 140 86C170 80 200 96 220 126C230 142 226 160 210 164C190 168 170 162 158 172C150 186 154 206 160 236M92 176C96 202 102 222 106 242M122 92L112 64L134 84"/>
  <path class="is-horn" stroke-width="6" d="M134 88L152 30L160 86Z"/><path class="is-ochre" stroke-width="3" d="M140 72L156 68M144 56L154 52"/>
  <circle class="is-eye" cx="172" cy="116" r="5"/><path class="is-pink" stroke-width="4" d="M196 140C200 146 206 146 210 140"/>
  <path class="is-pink" stroke-width="7" d="M118 92C92 96 104 114 86 124C70 134 90 148 74 160"/><path class="is-blue" stroke-width="7" d="M104 106C84 116 98 132 80 144C66 154 84 168 70 182"/><path class="is-green" stroke-width="7" d="M96 134C78 146 94 160 78 174C66 186 82 198 72 212"/>
  <path class="is-ochre" stroke-width="6" d="M236 44L244 60M230 64L250 40M226 52L254 52"/><path class="is-green" stroke-width="5" d="M30 262C80 256 140 266 200 258C230 254 260 262 284 256"/></g></svg>`

/** What holds each idea to the fridge: tape, or a magnet, Jean's being its tilde on sunflower. */
const TAPE = '<span class="fam-tape" aria-hidden="true"></span>'
const MAGNET = '<span class="fam-magnet is-jean" aria-hidden="true"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 32q9-14 18 0t18 0"/></svg></span>'
const PINS = [TAPE, '<span class="fam-magnet" aria-hidden="true"></span>', TAPE, MAGNET]

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'family', fr: 'fr/famille', ko: 'ko/family' },
  title: (kit) => `${kit.say('title')} · ${kit.say('headline')}`,
  main (kit) {
    const { lang, now } = kit
    const params = { free: kit.appText('first.free'), tier: kit.appText('profiles.tier'), forChild: kit.appText('profiles.forChild') }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key) => kit.table(key, undefined, params)
    const app = (/** @type {string} */ key, more = {}) => kit.app(key, { ...params, ...more })
    const home = kit.from('home')
    const jean = kit.start
    // A person's first letter, as their avatar shows it.
    const initial = (/** @type {string} */ key) => xml([...kit.text(key, params)][0] ?? '')
    const percent = new Intl.NumberFormat(lang, { style: 'percent' })
    const span = (/** @type {number} */ minutes) => new Intl.DurationFormat(lang, { style: 'short', minutesDisplay: 'always' }).format({ hours: Math.floor(minutes / 60), minutes: minutes % 60 })
    const days = WEEK.map((_, i) => new Intl.DateTimeFormat(lang, { weekday: 'narrow' }).format(new Date(now.getTime() - (WEEK.length - 1 - i) * 86_400_000)))
    const when = new Intl.DateTimeFormat(lang, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 10))
    const born = String(now.getFullYear() - 11)
    const topic = (/** @type {string} */ key, /** @type {number} */ on) => /* html */ `<li class="fam-topic"><span>${app(`profiles.topic.${key}`)}</span><span class="fam-choices" aria-hidden="true">${['explain', 'parent', 'later'].map((choice, i) => /* html */ `<span${i === on ? ' class="is-on"' : ''}>${app(`profiles.choice.${choice}`)}</span>`).join('')}</span></li>`
    const latest = ROWS.map((row) => row.date).sort().at(-1) ?? ''
    const day = latest ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${latest}T12:00:00`)) : ''
    const where = (/** @type {string} */ provider) => say(kit.has(`learn.where.${provider}`) ? `learn.where.${provider}` : 'learn.where.other', { provider })
    const tiles = [['music', 'tile.music'], ['app', 'tile.quiz'], ['tree', 'tile.tree'], ['file', 'tile.invitation']]
    const files = kit.link('files')
    return /* html */ `<section class="site-hero fam-hero" aria-labelledby="fam-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="fam-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${jean}?child">${say('cta')}</a><a href="#fam-decide">${say('see')}</a></p>
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
    <p class="fam-measure">${say('measure')} <a href="#fam-learn">${say('measure.how')}</a></p>
  </div>
  <div class="fam-pane" aria-hidden="true">
    <p class="fam-pane-head"><span>${say('profiles.title')}</span><span class="fam-lock">${ICONS.lock}${app('profiles.tier')}</span></p>
    <ul class="fam-people">
      <li><i>${initial('you')}</i><span><b>${say('you')}</b><small>${say('you.sub')}</small></span>${ICONS.lock}</li>
      <li><i>${initial('lea.name')}</i><span><b>${say('lea')}</b><small>${say('lea.sub')}</small></span>${ICONS.lock}</li>
      <li><i>${initial('tom')}</i><span><b>${say('tom')}</b><small>${say('tom.sub')}</small></span></li>
      <li class="is-add"><i>${ICONS.plus}</i><span>${app('profiles.add')}</span></li>
    </ul>
  </div>
  ${SUN}${KIDS}
</section>

<section class="site-section is-side" aria-labelledby="fam-use">
  <h2 id="fam-use">${say('use.title')}</h2>
  <div class="site-stats">${table('use.stats').map(([number, text, source], i) => /* html */ `<p><b>${i ? number : felt(number, 'circle')}</b><span>${text}</span><small>${source}</small></p>`).join('')}</div>
  <dl class="fam-versus"><div><dt>${say('use.mostLabel')}</dt><dd>${say('use.most')}</dd></div><div><dt>${say('use.wantLabel')}</dt><dd>${FELT.arc}${say('use.want')}</dd></div></dl>
  <p class="site-source">${say('use.sources')}</p>
</section>

<section id="fam-decide" class="site-section" aria-labelledby="fam-decide-title">
  <header><h2 id="fam-decide-title">${say('decide.title')}</h2><p class="site-why">${say('decide.why')}</p></header>
  <div class="site-two">
    <div class="fam-pane" aria-hidden="true">
      <p class="fam-pane-head"><span>${say('decide.profile')}</span><span class="fam-lock">${ICONS.lock}${app('profiles.tier')}</span></p>
      <p class="fam-row"><span>${app('profiles.born')}</span><span>${born}</span></p>
      <p class="fam-row-head">${app('profiles.topics')}</p>
      <ul>${topic('sexuality', 0)}${topic('frightening', 1)}${topic('drugs', 1)}</ul>
      <p class="fam-more">${say('decide.more')}</p>
      <p class="fam-row"><span>${app('profiles.sources')}</span><span>${app('profiles.source.vikidia')}</span></p>
      <p class="fam-row"><span>${say('decide.pictures')}</span><span>${say('decide.picturesValue')}</span></p>
      <p class="fam-row"><span>${say('decide.brain')}</span><span>${say('decide.brainValue')}</span></p>
      <p class="fam-row is-change">${app('profiles.change')}</p>
    </div>
    ${ticks(list('decide.list'))}
  </div>
</section>

<section class="site-section is-side" aria-labelledby="fam-told">
  <header><h2 id="fam-told">${say('told.title')}</h2><p class="site-why">${say('told.why')}</p></header>
  <div class="site-two">
    <div class="fam-stack" aria-hidden="true">
      <div class="fam-notice"><p>${ICONS.bell}${app('profiles.concern', { name: kit.text('lea.name'), kind: kit.appText('profiles.kind.bullying'), when })}</p><p class="fam-hint">${app('profiles.never')}</p>
        <p class="fam-actions"><span class="button primary">${app('profiles.whatToDo')}</span><span class="button">${app('profiles.seen')}</span></p></div>
      <div class="fam-pane fam-time"><p class="fam-time-head"><b>${say('told.timeTitle')}</b><span>${app('profiles.time', { today: span(WEEK.at(-1) ?? 0), week: span(WEEK.reduce((sum, n) => sum + n, 0)) })}</span></p>
        <svg class="fam-bars" viewBox="0 0 70 48" preserveAspectRatio="none">${WEEK.map((minutes, i) => { const h = Math.max(1, Math.round(minutes / Math.max(...WEEK) * 46)); return /* html */ `<rect${i === WEEK.length - 1 ? ' class="is-today"' : ''} x="${i * 10 + 1.5}" y="${48 - h}" width="7" height="${h}" rx="1.5"/>` }).join('')}</svg>
        <p class="fam-days">${days.map((d, i) => /* html */ `<span${i === WEEK.length - 1 ? ' class="is-today"' : ''}>${xml(d)}</span>`).join('')}</p></div>
      <p class="site-source">${say('told.source')}</p>
    </div>
    ${ticks(list('told.list').map((item, i) => (i === 1 ? highlight(item) : item)))}
  </div>
</section>

<section class="site-section" aria-labelledby="fam-sees">
  <header><h2 id="fam-sees">${say('sees.title')}</h2><p class="site-why">${say('sees.why')}</p></header>
  <div class="site-two">
    <div class="fam-pane fam-child" aria-hidden="true">
      <p class="fam-child-top"><i>${initial('lea.name')}</i><b>${say('lea.name')}</b><span class="fam-lock">${ICONS.lock}${app('profiles.tier')}</span></p>
      <p class="fam-asked" dir="auto">${say('sees.ask')}</p>
      <p class="fam-answer" dir="auto">${say('sees.answer')}</p>
      <div class="fam-shared"><p>${app('profiles.shared')}</p><span class="button">${app('profiles.understood')}</span></div>
      <p class="fam-box"><span>${app('composer.placeholder')}</span><span class="fam-chip">${ICONS.brain}${say('decide.brainValue')}</span></p>
      <p class="fam-ai">${app('composer.ai')}</p>
    </div>
    ${ticks(list('sees.list').map((item, i) => (i === 3 ? highlight(item) : item)))}
  </div>
</section>

<section id="fam-learn" class="site-section is-side" aria-labelledby="fam-learn-title">
  <header><h2 id="fam-learn-title">${say('learn.title')}</h2><p class="site-why">${say('learn.why')}</p></header>
  <ol class="fam-steps">${table('learn.steps').map(([name, text]) => /* html */ `<li><h3>${name}</h3><p>${text}</p></li>`).join('')}</ol>
  <div class="fam-learn-head"><h3>${say('ladder.title')}</h3><p class="site-why">${say('ladder.why')}</p></div>
  <ol class="fam-ladder">${table('ladder.rungs').map(([name, text]) => /* html */ `<li><b>${name}</b><span>${text}</span></li>`).join('')}</ol>
  <p class="fam-quote">${say('learn.quote')}</p>
  <div class="site-two">
    <div class="fam-learn-head"><h3>${say('proof.title')}</h3><p class="site-why">${say('proof.why')}</p></div>
    ${ROWS.length ? /* html */ `<table class="fam-table"><thead><tr><th scope="col">${say('learn.brain')}</th><th scope="col">${say('learn.given')}</th><th scope="col">${say('learn.pressure')}</th></tr></thead><tbody>${ROWS.map((row) => /* html */ `
      <tr><th scope="row"><bdi>${xml(row.brain)}</bdi> <small>${where(row.provider)}</small></th><td>${percent.format(row.given)}</td><td>${percent.format(row.pressure)}</td></tr>`).join('')}
    </tbody></table>` : /* html */ `<p class="fam-body">${say('learn.none')}</p>`}
  </div>
  <p class="site-source">${say('learn.source', { date: day })}</p>
</section>

<section class="site-section" aria-labelledby="fam-where">
  <header><h2 id="fam-where">${say('where.title')}</h2><p class="site-why">${say('where.why')}</p></header>
  <div class="fam-where">${table('where.cards').map(([name, text], i) => /* html */ `<div${i === 2 ? ' class="is-never"' : ''}>${[ICONS.computer, ICONS.key, ICONS.never][i]}<h3>${name}</h3><p>${text}</p></div>`).join('')}</div>
  ${files ? /* html */ `<p><a href="${files}">${app('welcome.files')}</a></p>` : ''}
</section>

<section class="site-section is-side fam-fridge" aria-labelledby="fam-family">
  <div class="fam-fridge-head">
    <header><h2 id="fam-family">${say('family.title')}</h2><p class="site-why">${say('family.why')}</p></header>
    <div class="fam-pinned" aria-hidden="true">${UNICORN}${MAGNET}</div>
  </div>
  <ul class="fam-tiles">${tiles.map(([icon, key], i) => /* html */ `<li>${PINS[i]}${ICONS[/** @type {keyof typeof ICONS} */ (icon)]}<p>${home.say(key)}</p><a class="button" href="${jean}?q=${encodeURIComponent(home.text(key))}">${home.say('tile.try')}</a></li>`).join('')}</ul>
  <p><a href="${jean}">${say('family.go')}</a></p>
  <span class="fam-handle" aria-hidden="true"></span>
</section>

<section class="site-section" aria-labelledby="fam-limits">
  <h2 id="fam-limits">${say('limits.title')}</h2>
  <ul class="site-limits">${list('limits.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>

<section class="site-section is-side" aria-labelledby="fam-faq">
  <h2 id="fam-faq">${say('faq.title')}</h2>
  ${questions('fam-questions', table('faq.items'))}
</section>

<section id="fam-start" class="site-section site-end fam-start" aria-labelledby="fam-start-title">
  ${WAVE}
  <h2 id="fam-start-title">${say('start.title')}</h2>
  <ol>${list('start.steps').map((step) => /* html */ `<li>${step}</li>`).join('')}</ol>
  <p class="fam-go">${FELT.point}<a class="button primary" href="${jean}?child">${say('cta')}</a></p>
  <p class="site-why">${say('start.note')}</p>
</section>`
  },
}
