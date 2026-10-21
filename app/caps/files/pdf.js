// PDF text, page by page, with pdf.js (loaded on demand; its legacy build covers Safari 16.4).
// No font faces: glyphs are drawn as shapes, so pdf.js never needs eval. Character maps let it
// read Chinese, Japanese and Korean text; standard font metrics keep words apart. A scan's pictures
// are decoded by its WebAssembly: JBIG2 and CCITT fax, as office scanners write them, and JPEG 2000.
import { scriptURL } from '../../ui/trusted.js'
import { bodySize, pageText } from './extract.js'

const BASE = new URL('../../vendor/pdfjs/', import.meta.url)

/** @type {Promise<any> | null} */
let library = null

function pdfjs() {
  library ??= import(new URL('pdf.min.mjs', BASE).href).then(async (pdf) => {
    // Trusted Types: pdf.js would create its worker from a plain string, so Jean does. A saved task (D305) has it from the render
    // package, another origin, where no worker starts: there it runs beside the page.
    const worker = new URL('pdf.worker.min.mjs', BASE)
    if (worker.origin === location.origin) pdf.GlobalWorkerOptions.workerPort = new Worker(scriptURL(worker), { type: 'module' })
    else Object.assign(globalThis, { pdfjsWorker: await import(worker.href) })
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
    wasmUrl: new URL('wasm/', BASE).href,
    // Its data fetched by the page, as without a wasmUrl: fetched by its worker, a share's viewer drew no page.
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  })
}

/**
 * What `read` makes of each page of a PDF, the first `count`, in turn; the PDF is let go after.
 * @template T @param {Uint8Array} bytes @param {(page: any) => Promise<T>} read @returns {Promise<T[]>}
 */
export async function eachPage(bytes, read, count = Infinity) {
  const task = await openPdf(bytes)
  const out = []
  try {
    const doc = await task.promise
    for (let n = 1; n <= Math.min(count, doc.numPages); n++) out.push(await doc.getPage(n).then((/** @type {any} */ page) => read(page).finally(() => page.cleanup())))
    return out
  } finally {
    await task.destroy()
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<string[]>} one string per page
 */
export async function pdfPages(bytes) {
  const pages = await eachPage(bytes, async (page) => (await page.getTextContent()).items)
  // Headings are told by their size against the whole document's text, not one page's.
  const body = bodySize(pages.flat())
  return pages.map((items) => pageText(items, body))
}
