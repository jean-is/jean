// SPDX-License-Identifier: MIT
// What shows over a collection's rows (caps/tables/view.js fetches this folder as a collection is first shown, and draws it in the table's bar),
// each part drawn by a folder of its own and showing only where it has something to say: what the collection's own check found (caps/checks),
// what is coming up (caps/soon), then where its rows come from (caps/sources). A line each, small, under the bar's tools (./over.css), its head
// folding it.
import { html } from 'lit-html'
import look from '../checks/look.js'
import soon from '../soon/soon.js'
import sources from '../sources/sources.js'
import { styleSheet } from '../../ui/sheet.js'

await styleSheet(new URL('over.css', import.meta.url))

/** @param {{ one: import('../tables/tables.js').Loaded, open: (row: string) => void }} given the collection and what opens a row's sheet */
export default (given) => html`<div class="table-over">${[look(given), soon(given), sources(given)]}</div>`
