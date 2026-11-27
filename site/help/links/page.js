// SPDX-License-Identifier: MIT
// How a project's creations link (D763, D764): in a creation's pane, Linked creations lists what shows it, five at first, and what
// it shows at the version it reads; See them drawn draws that as a map, and Creations' Sort ›
// Links the whole project's, once three creations are linked; each creation's line says the version it reads, a later
// one out, how often an instruction runs by itself and on which brain, that it shows nothing and why, or that nothing
// uses it. Its pane replays a request asking Jean how the project's creations link: it reads them with creation_links,
// its title the app's, then answers with a flowchart, sources first, its versions in the app's words.
import { fill } from '../../site.js'
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/how-creations-link', fr: 'fr/aide/comment-les-creations-sont-liees' },
  kind: 'howto',
  moment: 'make',
  minutes: 3,
  names: {
    links: 'compose.links', usedIn: 'compose.usedIn', uses: 'compose.uses', drawn: 'compose.drawn', which: 'compose.which',
    creations: 'creations.title', changed: 'creations.changed', map: 'compose.map', all: 'creations.all', find: 'creations.find',
    live: 'compose.live', published: 'compose.published', auto: 'compose.auto', hourly: 'compose.hourly', every5: 'compose.every5',
    missing: 'compose.missing', loop: 'compose.loop', unused: 'compose.unused', answer: 'compose.answer',
  },
  steps: [{}, {}, {}, {}, {}],
  demo: (kit, text) => {
    const app = (/** @type {string} */ key, n = 0) => fill(kit.appText(key), { n: String(n) })
    const box = (/** @type {string} */ key) => JSON.stringify(text(`demo.${key}`))
    const flowchart = `flowchart LR
  P[(${box('prices')})] -->|${JSON.stringify(app('compose.pinned', 2))}| D[${box('deck')}]
  P -->|${JSON.stringify(app('compose.published'))}| L[${box('list')}]
  P -->|${JSON.stringify(app('compose.live'))}| S[${box('shop')}]
  L -->|${JSON.stringify(app('compose.live'))}| S
  O[(${box('orders')})] -.- P`
    return {
      asked: text('demo.asked'),
      brain: text('demo.brain'),
      call: { name: 'creation_links', title: kit.appText('compose.linkingAll'), kind: 'read', input: {}, output: text('demo.read') },
      answer: `${text('demo.answer')}\n\n\`\`\`mermaid\n${flowchart}\n\`\`\`\n\n${text('demo.then')}`,
    }
  },
  also: ['together', 'where-kept', 'what-jean-can-do'],
})
