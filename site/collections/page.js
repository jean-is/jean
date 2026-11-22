// SPDX-License-Identifier: MIT
// AI for trackers (the job pages, ../excel/job.js), at /collections and /fr/collections, for the reader who searched for
// a free AI that keeps a list or a table up to date. "Collection" is Jean's word for one; its title says what people
// type. Its Try sends a job hunt's request with ?q= (ui/app.js): the brain makes the collection with `table_create`
// (D473, D507). Its pane is no conversation but that collection, live in Tables' own view (site/creation.js): the table
// `table_create` makes of its columns, the person's rows, and the change `table_change` then makes of them from an
// email, in the page's words, which waits there to be accepted or rejected (D505). Its dates are days after the build, so they are always coming up.
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

/** Each column's kind, in the order the page's words name them: the company, the role, where it stands, the day to follow up, the next step. */
const KINDS = ['text', 'text', 'status', 'date', 'text']
const DAY = 86_400_000

export default job({
  addresses: { en: 'collections', fr: 'fr/collections' },
  into: 'ask',
  // Its promise goes from keeping to updating: keeping, proved by what goes in, what comes out and where the list
  // lives; updating, by one collection made and changed step by step, and by changes that wait for the person.
  proves: { keep: ['io', 'where'], update: ['replay', 'exact'] },
  exact: [ICONS.check, ICONS.clock, ICONS.computer],
  // The AI behind it and what a collection isn't, under keeping; what the AI reads, how much, and being wrong, under updating.
  limits: { keep: [0, 1], update: [2, 3, 4] },
  drawn: () => ({ pane: '' }),
  made (kit, { text, texts }) {
    const columns = texts('made.columns'), on = (/** @type {string} */ days) => (days ? new Date(kit.now.getTime() + Number(days) * DAY).toISOString().slice(0, 10) : '')
    /** A row's cells by their columns' names, the empty ones left out, its day the one in so many days. @param {string[]} cells */
    const row = (cells) => Object.fromEntries(cells.map((cell, i) => [columns[i], i === 3 ? on(cell) : cell]).filter(([, cell]) => cell))
    return {
      kind: 'collection', name: text('made.name'), why: text('made.why'),
      columns: columns.map((name, i) => ({ name, type: KINDS[i], ...(KINDS[i] === 'status' && { options: texts('made.steps') }) })),
      rows: /** @type {string[][]} */ (kit.raw('made.rows')).map(row),
      // What the email changes: a row the collection has, by its company, the cells it sets; another company, a row to add.
      then: /** @type {string[][]} */ (kit.raw('made.then')).map((cells) => {
        const has = /** @type {string[][]} */ (kit.raw('made.rows')).some(([company]) => company === cells[0]), { [columns[0]]: company, ...rest } = row(cells)
        return has ? { row: company, set: rest } : { set: { [columns[0]]: company, ...rest } }
      }),
    }
  },
})
