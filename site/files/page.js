// SPDX-License-Identifier: MIT
// Where files go, which every copy of Jean has and links to: its text in each language, <lang>.html, as written, and
// its title and description, <lang>.json. A landing page as the site's others are (landing() in site.js), its title
// no sentence: its top is its title, when it was last updated and its first lines; its acts are three of its own
// headings, before a request, with one and beside one, each over its text and the sections that follow it, their
// headings a level down; and it ends on Jean itself (site/site.js, D438).
import { hero, landing, penned } from '../site.js'

/** The acts, each an id and which of the text's sections (an <h2> and what follows it) it holds: the first gives its title, the others are blocks under it. */
const ACTS = /** @type {Array<[string, number[]]>} */ ([['files-before', [0]], ['files-ask', [1, 2, 3]], ['files-else', [4, 5]]])

/** @type {import('../site.js').Page} */
export default {
  addresses: { en: 'files', fr: 'fr/files' },
  ships: true,
  main (kit) {
    const [head, ...sections] = penned(kit.prose).split(/(?=<h2>)/)
    const top = /^\s*<h1>([\s\S]*?)<\/h1>\s*<p class="muted">([\s\S]*?)<\/p>\s*<p>([\s\S]*?)<\/p>\s*$/.exec(head)
    const parts = sections.map((section) => /^<h2>([\s\S]*?)<\/h2>([\s\S]*)$/.exec(section)?.slice(1) ?? [])
    if (!top || parts.length !== ACTS.flatMap(([, which]) => which).length || parts.some((part) => part.length !== 2)) throw new Error(`site/files/${kit.lang}.html: a title, when it was updated and a paragraph, then ${ACTS.flatMap(([, which]) => which).length} sections, each under an <h2>`)
    const text = (/** @type {string} */ html) => /* html */ `<div class="prose">${html}</div>`
    return landing(kit, {
      top: hero(kit, { id: 'files-title', eyebrow: top[2], title: top[1], lede: top[3] }),
      acts: ACTS.map(([id, [first, ...then]]) => ({
        id,
        title: parts[first][0],
        body: [/* html */ `<div class="site-block">${text(parts[first][1])}</div>`, ...then.map((at, i) => /* html */ `<section class="site-block" aria-labelledby="${id}-${i + 1}"><h3 id="${id}-${i + 1}">${parts[at][0]}</h3>${text(parts[at][1].replace(/<(\/?)h3/g, '<$1h4'))}</section>`)].join('\n'),
      })),
      turn: { id: 'files-open', body: /* html */ `<p class="site-cta"><a class="button primary" href="${kit.start}">${kit.say('open')}</a></p>` },
    })
  },
}
