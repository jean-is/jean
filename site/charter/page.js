// The AI charter page: a template any organisation can adopt as its AI charter, in plain words and true of any AI,
// for whoever writes it and whoever signs it, at /charter in English and /fr/charte-ia in French. The template is on
// the page, readable without Jean, with lines of its own for an association, a school, a company and a public body,
// the kind chosen with radio buttons and the style sheet alone; Write ours with Jean sends the template as the
// request (?q=), the blanks asked of the person, never made up, and the charter made a Word document. It claims no
// law is met. For an organisation that hosts its own Jean, it says which parts policy.json can hold; then it hands
// the page to whoever signs it and to the page for that kind of organisation, where one is built. Its words are
// <lang>.json; its look charter.css, over site.css (site/site.js, D438).
import { FELT, WAVE, fill, highlight, questions, underline, xml } from '../site.js'

/** The kinds of organisation the template has lines for, in `kinds`'s order, as the style sheet names them. */
export const KINDS = ['association', 'school', 'company', 'public']

/** How many parts the template has, s1 to s7 in <lang>.json. */
export const PARTS = 7

/** The pages for each kind of organisation, linked where they are built, each with its words in next.<page>. */
const NEXT = { association: ['associations'], school: ['teachers', 'family'], company: ['enterprise'], public: ['public-sector', 'enterprise'] }

/** What policy.json holds for each of policy.rows, in its order. */
const KEYS = ['brains', 'guards', 'rules']

/** A policy.json that holds what a tool can of the charter (docs/enterprise.md), its brain's label and guard's question in the page's language. */
const policy = (/** @type {string} */ label, /** @type {string} */ question) => `{
  "brains": [{
    "id": "ours", "provider": "custom", "api": "openai",
    "baseURL": "https://ai.example.org/v1", "model": "…",
    "label": ${JSON.stringify(label)}
  }],
  "guards": [{
    "id": "people", "kind": "fetch", "then": "ask",
    "if": ${JSON.stringify(question)}
  }],
  "rules": { "send": "ask", "share": "never" }
}`

/** A signature in felt-tip, at the foot of the charter the hero shows. */
const SIGNED = '<svg class="felt-sign" viewBox="0 0 160 60" aria-hidden="true"><path d="M6 40C14 22 22 10 28 16C34 22 22 44 30 42C38 40 44 20 50 24C56 28 50 40 58 38C66 36 70 26 78 28C86 30 82 40 92 38C104 36 112 22 124 26C134 29 128 40 140 36C148 33 152 30 156 28M18 52C60 48 110 49 152 46"/></svg>'

/** What's in square brackets, a blank to fill, marked as one. @param {string} html */
const blanks = (html) => html.replace(/\[([^\]]+)\]/g, '<span class="cha-blank">[$1]</span>')

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'charter', fr: 'fr/charte-ia' },
  main (kit) {
    const { say, list } = kit
    const params = { name: kit.brand.name, domain: kit.brand.domain }
    const raw = (/** @type {string} */ key) => /** @type {string[]} */ (kit.raw(key)).map((item) => fill(item, params))
    const kinds = kit.table('kinds', 3)
    const phrases = /** @type {string[][]} */ (kit.raw('kinds')).map(([, , phrase]) => phrase)
    const parts = Array.from({ length: PARTS }, (_, i) => `s${i + 1}`)
    for (const part of parts) if (list(`${part}.kinds`).length !== KINDS.length) throw new Error(`site/charter/${kit.lang}.json: ${part}.kinds has a line for each of ${KINDS.join(', ')}, "" where it has none`)
    if (kinds.length !== KINDS.length) throw new Error(`site/charter/${kit.lang}.json: kinds names ${KINDS.join(', ')}, in that order`)

    // The request Write ours with Jean sends: what to do, then the template as Markdown, with a kind's own lines (k), or none.
    const request = (/** @type {number} */ k) => [
      k < 0 ? kit.text('ask.any') : kit.text('ask.kind', { kind: phrases[k] }),
      '', `# ${kit.text('sheet.title')}`, '', kit.text('sheet.intro'),
      ...parts.flatMap((part, i) => ['', `## ${i + 1}. ${kit.text(`${part}.title`)}`, '', ...[...raw(`${part}.items`), ...(k < 0 ? [] : [raw(`${part}.kinds`)[k]])].filter(Boolean).map((item) => `- ${item}`)]),
    ].join('\n')
    const write = (/** @type {number} */ k) => `${kit.start}?q=${encodeURIComponent(request(k))}`
    const writes = kit.list('write.kinds')

    // Whoever signs it gets the page's address by mail, where the site's address is known.
    const address = kit.address(kit.lang)
    const send = address ? `mailto:?subject=${encodeURIComponent(kit.text('send.subject'))}&body=${encodeURIComponent(kit.text('send.body', { address }))}` : null

    // Then the page for each kind of organisation, those of them that are built.
    const next = KINDS.map((kind, k) => ({ tag: kinds[k][1], links: NEXT[/** @type {keyof typeof NEXT} */ (kind)].map((page) => ({ page, href: kit.link(page) })).filter(({ href }) => href) }))
      .filter(({ links }) => links.length)
    const enterprise = kit.link('enterprise')

    return /* html */ `<section class="site-hero cha-hero" aria-labelledby="cha-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${say('eyebrow')}</p>
    <h1 id="cha-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
    <p class="site-cta"><a class="button primary" href="${write(-1)}">${say('write.any')}</a><a href="#cha-template">${say('see')}</a></p>
    <ul class="site-facts is-felt">${list('facts').map((fact, i) => /* html */ `<li>${FELT.tick(i)}${fact}</li>`).join('')}</ul>
  </div>
  <div class="cha-paper" aria-hidden="true">
    <p class="cha-paper-title">${say('paper.title')}</p>
    <ol>${parts.map((part) => /* html */ `<li><b>${say(`${part}.title`)}</b><i></i><i></i></li>`).join('')}</ol>
    <p class="cha-paper-signed"><span>${say('paper.signed')}</span>${SIGNED}</p>
  </div>
</section>

<section id="cha-template" class="site-section is-side" aria-labelledby="cha-template-title">
  <header><h2 id="cha-template-title">${say('template.title')}</h2><p class="site-why">${say('template.why')}</p></header>
  <fieldset class="cha-kinds">
    <legend>${say('kinds.legend')}</legend>
    <div class="cha-choices"><input type="radio" name="cha-kind" id="cha-kind-any" checked><label for="cha-kind-any">${say('kinds.any')}</label>${kinds.map(([label], k) => /* html */ `<input type="radio" name="cha-kind" id="cha-kind-${KINDS[k]}"><label for="cha-kind-${KINDS[k]}">${label}</label>`).join('')}</div>
  </fieldset>
  <article class="cha-sheet" aria-labelledby="cha-sheet-title">
    <h3 id="cha-sheet-title">${blanks(say('sheet.title'))}</h3>
    <p>${blanks(say('sheet.intro'))}</p>
    <ol class="cha-parts">${parts.map((part, i) => /* html */ `
      <li><h4>${say(`${part}.title`)}</h4><ul>${list(`${part}.items`).map((item, j) => /* html */ `<li>${blanks(part === 's3' && !j ? highlight(item) : item)}</li>`).join('')}${list(`${part}.kinds`).map((line, k) => (line ? /* html */ `<li class="cha-for is-${KINDS[k]}"><b class="cha-tag">${kinds[k][1]}</b><span class="visually-hidden">${say('sheet.sep')}</span>${blanks(line)}</li>` : '')).join('')}</ul></li>`).join('')}
    </ol>
  </article>
  <p class="cha-write"><a class="button primary cha-go is-any" href="${write(-1)}">${say('write.any')}</a>${KINDS.map((kind, k) => /* html */ `<a class="button primary cha-go is-${kind}" href="${write(k)}">${writes[k]}</a>`).join('')}</p>
  <p class="cha-note">${say('template.note')}</p>
</section>

<section class="site-section" aria-labelledby="cha-how">
  <header><h2 id="cha-how">${say('how.title')}</h2><p class="site-why">${say('how.why')}</p></header>
  <div class="site-two">
    <ol class="cha-steps">${list('how.steps').map((step) => /* html */ `<li>${step}</li>`).join('')}</ol>
    <div class="cha-next">
      ${send ? /* html */ `<p><a class="button" href="${xml(send)}">${say('send')}</a></p>` : ''}
      ${next.length ? /* html */ `<h3>${say('next.title')}</h3>
      <dl>${next.map(({ tag, links }) => /* html */ `<div><dt>${tag}</dt>${links.map(({ page, href }) => /* html */ `<dd><a href="${href}">${say(`next.${page}`)}</a></dd>`).join('')}</div>`).join('')}</dl>` : ''}
    </div>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="cha-policy">
  <header><h2 id="cha-policy">${say('policy.title')}</h2><p class="site-why">${say('policy.why')}</p></header>
  <div class="site-two">
    <dl class="cha-holds">${kit.table('policy.rows', 2).map(([part, text], i) => /* html */ `<div><dt>${part}</dt><dd><code>${KEYS[i]}</code></dd><dd>${text}</dd></div>`).join('')}</dl>
    <pre>${xml(policy(kit.text('policy.label'), kit.text('policy.guard')))}</pre>
  </div>
  <p class="cha-people">${say('policy.people')}</p>
  ${enterprise ? /* html */ `<p><a href="${enterprise}">${say('policy.go')}</a></p>` : ''}
</section>

<section class="site-section" aria-labelledby="cha-limits">
  <h2 id="cha-limits">${say('limits.title')}</h2>
  <ul class="site-limits">${list('limits.items').map((item) => /* html */ `<li>${item}</li>`).join('')}</ul>
</section>

<section class="site-section is-side" aria-labelledby="cha-faq">
  <h2 id="cha-faq">${say('faq.title')}</h2>
  ${questions('cha-questions', kit.table('faq.items', 2))}
</section>

<section class="site-section site-end" aria-labelledby="cha-start">
  ${WAVE}
  <h2 id="cha-start">${say('start.title')}</h2>
  <p class="cha-go-end">${FELT.point}<a class="button primary" href="${write(-1)}">${say('write.any')}</a></p>
  <p class="site-why">${say('start.note')}</p>
</section>`
  },
}
