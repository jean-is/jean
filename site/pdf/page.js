// AI for PDF files (the job pages, ../excel/job.js), at /pdf and /fr/pdf, for the reader who searched for a free AI
// to read a PDF, summarise it or turn it into Excel. Jean has no sample PDF, so its Try opens Jean, and the page says
// to drop a PDF in the box; its replay is a statement's transactions made a workbook. Scanned PDFs, with no text, are
// not read (caps/files/files.js), which its catch says.
import { job } from '../excel/job.js'

/** A page of text, an arrow, and the sheet it becomes. */
const PANE = /* html */ `<svg class="job-drawn" viewBox="0 0 200 92" aria-hidden="true"><rect class="is-paper" x="10" y="6" width="58" height="80" rx="4"/><path class="is-text" d="M20 20H52M20 30H58M20 40H46M20 54H58M20 62H58M20 70H58"/><path class="is-felt flip-rtl" d="M78 46C92 38 104 38 116 44M108 38C111 41 114 43 117 45C113 47 110 49 107 52"/><rect class="is-paper" x="128" y="18" width="64" height="56" rx="4"/><path class="is-grid" d="M128 32H192M128 46H192M128 60H192M150 18V74M172 18V74"/><rect class="is-lit" x="128" y="18" width="64" height="14" rx="4"/></svg>`

export default job({
  addresses: { en: 'pdf', fr: 'fr/pdf', ko: 'ko/pdf' },
  into: 'open',
  drawn: () => ({ pane: PANE }),
})
