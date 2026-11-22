// SPDX-License-Identifier: MIT
// AI for whiteboards (the job pages, ../excel/job.js), at /whiteboards and /fr/tableaux-blancs, for the reader who
// searched for a free online whiteboard, sticky notes for a brainstorm or a retrospective, with an AI that sorts them.
// Its Try sends a retrospective's notes with ?q= (ui/app.js): asked for a whiteboard, the brain reads Jean's own skill
// "Make a whiteboard" (D401), which brings Whiteboards (D747), and makes it with `whiteboard`. Its pane is no
// conversation but that whiteboard, live on Jean's own board (site/creation.js), its notes dragged, written and drawn
// as in a project: the sections and notes the request gives, as `whiteboard` lays them; the notes a team wrote since,
// waiting on its shelf; and, when Group them is pressed, the change `whiteboard_change` makes of them, in the page's
// words, to accept or reject.
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

export default job({
  addresses: { en: 'whiteboards', fr: 'fr/tableaux-blancs' },
  into: 'ask',
  // Its promise goes from writing to sorting: writing together, proved by what goes in, what comes out and where the
  // board lives; sorting, by one board made and sorted step by step, and by changes that wait for the person.
  proves: { write: ['io', 'where'], sort: ['replay', 'exact'] },
  exact: [ICONS.check, ICONS.clock, ICONS.never],
  // The AI behind it and who writes on a board, under writing; where notes go, what the AI doesn't read or make, and being wrong, under sorting.
  limits: { write: [0, 1], sort: [2, 3, 4] },
  filled: (kit) => ({ params: { group: kit.appText('whiteboards.group'), before: kit.appText('whiteboards.before') } }),
  drawn: () => ({ pane: '' }),
  made: (kit, { text, texts }) => ({
    kind: 'whiteboard', name: text('made.name'), asked: text('pane.asked'), areas: texts('made.areas'),
    notes: /** @type {string[][]} */ (kit.raw('made.notes')).map(([area, words]) => ({ area, words })), shelf: texts('made.shelf'),
    then: /** @type {string[][]} */ (kit.raw('made.then')).map(([note, area]) => ({ note, area })),
  }),
})
