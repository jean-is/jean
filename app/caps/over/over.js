// SPDX-License-Identifier: MIT
// What shows over a collection's rows (caps/tables/view.js fetches this folder as a collection is first shown), each part drawn by a folder of its
// own and showing only where it has something to say: what the collection's own check found (caps/checks), what is coming up (caps/soon), then
// its summary (caps/sum).
import look from '../checks/look.js'
import soon from '../soon/soon.js'
import sum from '../sum/sum.js'
import { styleSheet } from '../../ui/sheet.js'

await styleSheet(new URL('over.css', import.meta.url))

/** @param {{ one: import('../tables/tables.js').Loaded, open: (row: string) => void }} given the collection and what opens a row's sheet */
export default (given) => [look(given), soon(given), sum(given)]
