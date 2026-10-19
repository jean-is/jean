// The family page (D424): what a child's profile is, for the parent who reads before setting one up, at /family in
// English and /fr/famille in French. It promises the profile (D389, D390) and shows how often the brains a child's
// profile asks give the answer anyway, never the tutor itself, until its gate passes (D394). Its words are
// <lang>.json, the app's own catalogues where the app says the same (a profile's topics, choices, labels and
// notices), and the homepage's for the family's tiles; its look family.css, over site.css (site/site.js, D438).
import { readFile } from 'node:fs/promises'
import { ICONS, WAVE, questions, ticks, xml } from '../site.js'

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

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'family', fr: 'fr/famille' },
  title: (kit) => `${kit.say('title')} · ${kit.say('h1').replace(/\.$/, '')}`,
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
    const tiles = [['note', 'tile.music'], ['app', 'tile.quiz'], ['tree', 'tile.tree'], ['file', 'tile.invitation']]
    const files = kit.link('files')
    return /* html */ `<section class="site-hero fam-hero" aria-labelledby="fam-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="fam-title">${say('h1')}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${jean}?child">${say('cta')}</a><a href="#fam-decide">${say('see')}</a></p>
    <ul class="site-facts">${list('facts').map((fact) => /* html */ `<li>${fact}</li>`).join('')}</ul>
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
</section>

<section class="site-section is-side" aria-labelledby="fam-use">
  <h2 id="fam-use">${say('use.title')}</h2>
  <div class="site-stats">${table('use.stats').map(([number, text, source]) => /* html */ `<p><b>${number}</b><span>${text}</span><small>${source}</small></p>`).join('')}</div>
  <dl class="fam-versus"><div><dt>${say('use.mostLabel')}</dt><dd>${say('use.most')}</dd></div><div><dt>${say('use.wantLabel')}</dt><dd>${say('use.want')}</dd></div></dl>
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
    ${ticks(list('told.list'))}
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
    ${ticks(list('sees.list'))}
  </div>
</section>

<section id="fam-learn" class="site-section is-side" aria-labelledby="fam-learn-title">
  <header><p class="fam-not-yet">${ICONS.clock}${say('learn.notYet')}</p><h2 id="fam-learn-title">${say('learn.title')}</h2><p class="site-why">${say('learn.why')}</p></header>
  <div class="site-two">
    <p class="fam-body">${say('learn.body')}</p>
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

<section class="site-section is-side" aria-labelledby="fam-family">
  <header><h2 id="fam-family">${say('family.title')}</h2><p class="site-why">${say('family.why')}</p></header>
  <ul class="fam-tiles">${tiles.map(([icon, key]) => /* html */ `<li>${ICONS[/** @type {keyof typeof ICONS} */ (icon)]}<p>${home.say(key)}</p><a class="button" href="${jean}?q=${encodeURIComponent(home.text(key))}">${home.say('tile.try')}</a></li>`).join('')}</ul>
  <p><a href="${jean}">${say('family.go')}</a></p>
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
  <p><a class="button primary" href="${jean}?child">${say('cta')}</a></p>
  <p class="site-why">${say('start.note')}</p>
</section>`
  },
}
