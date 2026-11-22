// SPDX-License-Identifier: MIT
// AI for designs (the job pages, ../excel/job.js), at /designs and /fr/visuels, for the reader who searched for a free
// AI that makes a poster or an invitation. Its Try sends a studio's facts with ?q= (ui/app.js): the brain gives them by
// their role with `design`, and Jean lays them out (D572). Its pane is no conversation but that design, live in its own
// view (site/creation.js): what `design` is given, in the page's words, a square post, whose parts are large enough to
// press at the size a page frames it, laid out as Jean's first take by Designs' own layouts, the one fact the request
// doesn't give left as a gap in square brackets, which the view marks.
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

/** The roles the page's words fill, as `design` names them. */
const ROLES = ['title', 'words', 'when', 'where', 'who', 'small']

export default job({
  addresses: { en: 'designs', fr: 'fr/visuels' },
  into: 'ask',
  // Its promise goes from the facts to the design: the facts, proved by what goes in, what comes out and where it
  // goes; the design, by one invitation laid out step by step, and by what Jean lays out itself.
  proves: { facts: ['io', 'where'], design: ['replay', 'exact'] },
  exact: [ICONS.app, ICONS.check, ICONS.never],
  // The AI behind it and where its picture comes from, under the facts; what a design can't do yet, who finishes it, and being wrong, under the design.
  limits: { facts: [0, 1], design: [2, 3, 4] },
  drawn: () => ({ pane: '' }),
  made: (kit, { text }) => ({
    kind: 'design', name: text('made.name'), asked: text('pane.asked'),
    args: { name: text('made.name'), size: 'square', occasion: text('made.occasion'), words: Object.fromEntries(ROLES.map((role) => [role, text(`made.${role}`)])) },
  }),
})
