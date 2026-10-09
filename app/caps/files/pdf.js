// PDF text, page by page, with pdf.js (loaded on demand; its legacy build covers Safari 16.4).
// No font faces: glyphs are drawn as shapes, so pdf.js never needs eval. Character maps let it
// read Chinese, Japanese and Korean text; standard font metrics keep words apart.
import { scriptURL } from '../../ui/trusted.js'

const BASE = new URL('../../vendor/pdfjs/', import.meta.url)

/** @type {Promise<any> | null} */
let library = null

function pdfjs() {
  library ??= import(new URL('pdf.min.mjs', BASE).href).then((pdf) => {
    // Trusted Types: pdf.js would create its worker from a plain string, so Jean does.
    pdf.GlobalWorkerOptions.workerPort = new Worker(scriptURL(new URL('pdf.worker.min.mjs', BASE)), { type: 'module' })
    return pdf
  })
  return library
}

/** A PDF, opened: its text is read here, its pages drawn where a file shows (ui/view.js, D126). @param {Uint8Array} bytes */
export async function openPdf(bytes) {
  return (await pdfjs()).getDocument({
    data: bytes.slice(), // the buffer is transferred to the worker
    cMapUrl: new URL('cmaps/', BASE).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', BASE).href,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  })
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<string[]>} one string per page
 */
export async function pdfPages(bytes) {
  const task = await openPdf(bytes)
  const doc = await task.promise
  try {
    /** @type {string[]} */
    const pages = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const { items } = await page.getTextContent()
      pages.push(items.map((/** @type {any} */ item) => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim())
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}
