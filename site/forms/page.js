// SPDX-License-Identifier: MIT
// Online forms (the job pages, ../excel/job.js), at /forms and /fr/formulaires, for the reader who searched for a free
// form maker with no account, a sign-up sheet, or a form whose replies stay private. What Jean has for it is a
// collection's own form (caps/collect): Share's Collect replies ticks the columns to ask and puts the form online, a
// site of one page, and each reply, sealed in the visitor's browser (D751), comes into that collection as a row. Its
// Try sends a school fair's request with ?q= (ui/app.js): the brain makes the collection with `table_create` and says
// where its form is, since the person puts it online. Its pane is no conversation but that collection, live, beside
// its form as people see it (site/creation.js): the columns it asks are those Collect replies can ask, each with the
// field its kind takes, and what is sent in it comes into the collection as a published form's reply does.
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

/** Each column's kind, in the order the page's words name them: the name, the email, the shift, the cake, the note; then the person's own, the stall and whether they confirmed. */
const KINDS = ['text', 'email', 'select', 'checkbox', 'text', 'text', 'checkbox']
/** How many of them the form asks, the first ones; the others stay the person's. */
export const ASKED = 5

export default job({
  addresses: { en: 'forms', fr: 'fr/formulaires' },
  into: 'ask',
  // Its promise goes from the form to its replies: the form, proved by one list made and put online step by step and
  // by what goes in and comes out; the replies, by how they are sealed and by where the list lives.
  proves: { form: ['replay', 'io'], replies: ['exact', 'where'] },
  exact: [ICONS.lock, ICONS.never, ICONS.key],
  // The AI behind it, what a form asks and where it is online, under the form; when replies come, who can send one,
  // what a visitor keeps and what opens them, under the replies.
  limits: { form: [0, 1, 2], replies: [3, 4, 5, 6] },
  filled: (kit) => ({ params: { share: kit.appText('share.title'), collect: kit.appText('collect.tab'), online: kit.appText('collect.online') } }),
  drawn: () => ({ pane: '' }),
  made (kit, { text, texts }) {
    const columns = texts('made.columns')
    /** A row's cells by their columns' names, a box ticked where its words say yes, the empty ones left out. @param {string[]} cells */
    const row = (cells) => Object.fromEntries(cells.map((cell, i) => /** @type {[string, string | boolean]} */ ([columns[i], KINDS[i] === 'checkbox' ? cell === 'yes' : cell])).filter(([, cell]) => cell))
    return {
      kind: 'form', name: text('made.name'), asked: text('pane.asked'),
      columns: columns.map((name, i) => ({ name, type: KINDS[i], ...(KINDS[i] === 'select' && { options: texts('made.shifts') }) })),
      asks: columns.slice(0, ASKED),
      rows: /** @type {string[][]} */ (kit.raw('made.rows')).map(row),
    }
  },
})
