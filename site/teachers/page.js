// The teachers' page (D448): a teacher's own work, at /teachers in English and /fr/enseignants in French. What comes out of a
// lesson (this week's quiz, a worksheet in Word, slides, flash cards, the term's plans), then the three worries in the
// order teachers have them (free, pupils' data, allowed), whom to hand the work to, the catch, questions and a last Try.
// It promises nothing the product lacks: the pupils' part is the family page's (a profile set by a parent, learning
// measured before it's promised, D394), and the state's own assistants are named beside Jean, never replaced. Its
// button asks for a quiz in words that bring Jean's own quiz skill (D406). Its words are <lang>.json; its look
// teachers.css, over site.css (site/site.js, D438).
import { FELT, ICONS, WAVE, felt, questions, ticks, underline } from '../site.js'

/** Whom a teacher hands the work to: the class, the parents and, once its page is built, the head teacher. */
const PEOPLE = /* html */ '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19.5c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 0 5 1.9 5 5.3"/></svg>'
const BOARD = /* html */ '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="11.5" rx="1.5"/><path d="M12 15.5v4M8.5 20.5h7M7 8.5h6M7 11.5h4"/></svg>'

/** What comes out, in its words' order, each with the request that tries it (out.<key>.ask): the quiz, the worksheet, the slides, the flash cards, the term's plans. */
const OUT = [['quiz', ICONS.app], ['worksheet', ICONS.file], ['slides', BOARD], ['cards', ICONS.clock], ['plans', ICONS.table]]

/** The quiz's right answer, in the top's pane, which the felt-tip pen circles. */
const RIGHT = 1

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'teachers', fr: 'fr/enseignants' },
  main (kit) {
    const params = { free: kit.appText('first.free') }
    const say = (/** @type {string} */ key, more = {}) => kit.say(key, { ...params, ...more })
    const list = (/** @type {string} */ key) => kit.list(key, params)
    const table = (/** @type {string} */ key, /** @type {number} */ width) => kit.table(key, width, params)
    const jean = kit.start
    const ask = (/** @type {string} */ request) => `${jean}?q=${encodeURIComponent(request)}`
    const files = kit.link('files')
    const family = kit.link('family')
    const charter = kit.link('charter')
    const hands = [
      { icon: BOARD, key: 'class' },
      ...(family ? [{ icon: PEOPLE, key: 'parents', href: family }] : []),
      ...(charter ? [{ icon: ICONS.file, key: 'head', href: charter }] : []),
    ]
    const worry = (/** @type {string} */ key, /** @type {string} */ more = '') => /* html */ `<div><h3>${say(`${key}.title`)}</h3><p>${say(`${key}.text`)}</p>${ticks(list(`${key}.list`))}${more}</div>`
    return /* html */ `<section class="site-hero tch-hero" aria-labelledby="tch-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="tch-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${ask(kit.text('try.ask'))}">${say('cta')}</a><a href="#tch-out">${say('see')}</a></p>
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="tch-pane" aria-hidden="true">
    <p class="tch-pane-head"><span>${say('quiz.head')}</span><span class="tch-chip">${say('quiz.level')}</span></p>
    <div class="tch-quiz">
      <p class="tch-count">${say('quiz.count')}</p>
      <p class="tch-question">${say('quiz.question')}</p>
      <ul class="tch-answers">${list('quiz.answers').map((answer, i) => /* html */ `<li${i === RIGHT ? ' class="is-right"' : ''}>${i === RIGHT ? felt(answer, 'circle') : answer}</li>`).join('')}</ul>
      <p class="tch-why">${say('quiz.why')}</p>
    </div>
    <ul class="tch-ways">${list('quiz.ways').map((way) => /* html */ `<li>${way}</li>`).join('')}</ul>
  </div>
</section>

<section id="tch-out" class="site-section is-side" aria-labelledby="tch-out-title">
  <header><h2 id="tch-out-title">${say('out.title')}</h2><p class="site-why">${say('out.why')}</p></header>
  <ul class="tch-out">${OUT.map(([key, icon]) => /* html */ `
    <li>${icon}<h3>${say(`out.${key}`)}</h3><p>${say(`out.${key}.text`)}</p><p class="tch-ask" dir="auto">${say('quote', { text: kit.text(`out.${key}.ask`) })}</p><a class="button" href="${ask(kit.text(`out.${key}.ask`))}">${say('out.try')}</a></li>`).join('')}
  </ul>
  <p>${say('out.more')} <a href="${jean}">${say('out.go')}</a></p>
</section>

<section id="tch-worries" class="site-section" aria-labelledby="tch-worries-title">
  <header><h2 id="tch-worries-title">${say('worries.title')}</h2><p class="site-why">${say('worries.why')}</p></header>
  <div class="tch-worries">
    ${worry('free')}
    ${worry('data', files ? /* html */ `<p><a href="${files}">${kit.app('welcome.files')}</a></p>` : '')}
    ${worry('allowed', /* html */ `<p class="site-source">${say('allowed.source')}</p>`)}
  </div>
</section>

<section class="site-section is-side" aria-labelledby="tch-hand">
  <header><h2 id="tch-hand">${say('hand.title')}</h2><p class="site-why">${say('hand.why')}</p></header>
  <ul class="tch-hand">${hands.map(({ icon, key, href }) => /* html */ `
    <li>${icon}<h3>${say(`hand.${key}.title`)}</h3><p>${say(`hand.${key}.text`)}</p>${href ? /* html */ `<a href="${href}">${say(`hand.${key}.go`)}</a>` : ''}</li>`).join('')}
  </ul>
</section>

<section class="site-section" aria-labelledby="tch-limits">
  <h2 id="tch-limits">${say('limits.title')}</h2>
  <ul class="site-limits">${list('limits.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>

<section class="site-section is-side" aria-labelledby="tch-faq">
  <h2 id="tch-faq">${say('faq.title')}</h2>
  ${questions('tch-questions', table('faq.items', 2))}
</section>

<section class="site-section site-end tch-end" aria-labelledby="tch-end">
  ${WAVE}
  <h2 id="tch-end">${say('end.title')}</h2>
  <ol>${list('end.steps').map((step) => /* html */ `<li>${step}</li>`).join('')}</ol>
  <p class="tch-go">${FELT.point}<a class="button primary" href="${ask(kit.text('try.ask'))}">${say('cta')}</a></p>
  <p class="site-why">${say('end.note')}</p>
</section>`
  },
}
