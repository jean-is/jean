// SPDX-License-Identifier: MIT
// AI for documents (the job pages, ../excel/job.js), at /documents and /fr/documents, for the reader who searched for a
// free AI to write a document with. Its Try sends a studio's request with ?q= (ui/app.js): the brain makes the document
// with `document` (D473, D485). Its pane is no conversation but that document, live in its own editor
// (site/creation.js): the page's words as its Markdown, a title, a checklist, a table and a callout, and Jean's version
// of it, as `suggest` gives one, with a few words for each change, waiting there to be accepted or rejected (D505).
import { ICONS } from '../site.js'
import { job } from '../excel/job.js'

export default job({
  addresses: { en: 'documents', fr: 'fr/documents' },
  into: 'ask',
  // Its promise goes from writing to improving: writing, proved by what goes in, what comes out and where the document
  // goes; improving, by one document written and changed step by step, and by changes that wait for the person.
  proves: { write: ['io', 'where'], improve: ['replay', 'exact'] },
  exact: [ICONS.check, ICONS.clock, ICONS.app],
  // The AI behind it and what an editor isn't, under writing; where pictures come from, and being wrong, under improving.
  limits: { write: [0, 1], improve: [2, 3] },
  drawn: () => ({ pane: '' }),
  made: (kit, { text, texts }) => ({ kind: 'document', name: text('made.name'), markdown: texts('made.lines').join('\n'), held: { markdown: texts('made.theirs').join('\n'), notes: texts('made.notes') } }),
})
