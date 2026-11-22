// SPDX-License-Identifier: MIT
// What Jean's views read of the room where a page of the site frames a creation (./player.js), in ui/state.js's place:
// a saved copy's state (ui/reader-state.js), which keeps and sends nothing, with files in memory alone, so that a
// whiteboard's own engine (caps/tables) reads and changes its collection as it does in a project, and nothing of it
// outlives the page.
import { signal } from '@preact/signals-core'
import { app as copy } from '#app/ui/reader-state.js'
import { memoryFS } from '#app/core/fs.js'

export * from '#app/ui/reader-state.js'

/** The copy's state, with the project the creation is in: no project of the reader's but a folder of the memory's, with no design system, nothing typed, no dialog open and nothing said in passing. */
export const app = Object.assign(copy, { fs: memoryFS(), projectDir: 'shown', project: signal({ dir: 'shown', data: {} }), draft: signal(''), dialog: signal(null), toast: signal(null) })

/** No task runs here, so no call is any task's. */
export const conversationOf = () => null
