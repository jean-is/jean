// SPDX-License-Identifier: MIT
// Cells copied from a spreadsheet, pasted on a cell of a collection's table (D759; caps/tables/view.js fetches this folder at the first paste): they fill the
// cells from that one, a line a row and past the last row new ones, each value as its column takes it (./block.js), as one change of the person's, said
// with how many rows it wrote and an Undo that takes it back whole, as ⌘Z does. What no column takes is said, nothing changing. Tables' words come
// from the view, whose strings they are.
import { t, intlLocales } from '../../core/i18n.js'
import { notify } from '../../ui/state.js'
import { change, undoStep } from '../tables/tables.js'
import { rowNamed } from '../tables/export.js'
import { cellsOf, planned, valueFor } from './block.js'

/** @import { Property } from '../tables/table.js' */
/** @import { Loaded } from '../tables/tables.js' */

/**
 * @param {{ one: Loaded, text: string, columns: Property[], rows: string[], from: string, words: { pasted: (count: number) => string, wrong: string, yes: string, no: string } }} given the
 *   collection, the clipboard's text, the columns shown from the cell's, the rows shown, by their ids, the cell's row, and Tables' words
 */
export async function paste({ one, text, columns, rows, from, words }) {
  const how = { locales: intlLocales(), yes: words.yes, no: words.no }
  /** A relation's row by its name, as a change names one; any other cell as its column's kind writes it. @param {Property} property @param {string} said */
  const read = (property, said) => (property.type !== 'relation' ? valueFor(property, said, how)
    : !said.trim() ? null : rowNamed(one.related?.get(String(property.collection))?.rows ?? [], one.names ?? new Map(), said.trim()))
  const edits = planned(cellsOf(text), columns, rows, from, read)
  if (!edits.length || !(await change(one, edits, 'user').catch(() => null))) return notify(words.wrong, { alert: true })
  notify(words.pasted(edits.length), { label: t('memory.undo'), run: () => undoStep(one) })
}
