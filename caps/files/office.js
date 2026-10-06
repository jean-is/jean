// Word, Excel and PowerPoint files as Office draws them (D183), in the preview and the browser: by
// @silurus/ooxml, its parsers WebAssembly, its viewers drawing on a canvas, so nothing of the file
// becomes markup, in a frame of the preview's kind (an opaque origin with no network), in a page made
// here: modules as data: addresses under an import map, the parser and the file as data too.
import { dataURL } from '../folders/site.js'
import { t } from '../../core/i18n.js'

const BASE = new URL('../../vendor/ooxml/', import.meta.url)
const VIEWERS = /** @type {Record<string, string>} */ ({ docx: 'DocxScrollViewer', pptx: 'PptxScrollViewer', xlsx: 'XlsxViewer' })
/** A file of vendor/ooxml as a data: address. @param {string} path @param {string} [type] */
const data = async (path, type = 'text/javascript') => dataURL(type, new Uint8Array(await (await fetch(new URL(path, BASE))).arrayBuffer()))
let graph = /** @type {Promise<Record<string, string[]>> | undefined} */ (undefined)

/** A page that draws a Word document, a workbook or a deck. @param {string} ext docx, xlsx or pptx @param {Uint8Array} bytes @param {string} name */
export async function officePage(ext, bytes, name) {
  graph ??= fetch(new URL('graph.json', BASE)).then((response) => response.json())
  const imports = Object.fromEntries(await Promise.all((await graph)[ext].map(async (file) => [`ooxml/${file}`, await data(file)])))
  const failed = JSON.stringify(t('files.failed', { name })).replace(/</g, '\\u003c')
  return `<meta charset="utf-8"><style>html, body { block-size: 100%; margin: 0; background: #ececef; font: 0.9rem system-ui, sans-serif; } main { block-size: 100vh; } p { margin: 2rem; text-align: center; }</style>
<script type="importmap">${JSON.stringify({ imports })}</script><main></main>
<script type="module">
import { ${VIEWERS[ext]} as Viewer } from 'ooxml/${ext}.mjs'
const main = document.querySelector('main')
new Viewer(main, { wasmUrl: '${await data(`${ext}_parser_bg.wasm`, 'application/wasm')}', enableTextSelection: true, background: '#ececef' })
  .load(Uint8Array.from(atob('${dataURL('', bytes).slice(13)}'), (char) => char.charCodeAt(0)).buffer)
  .catch((error) => { console.warn(error); main.replaceChildren(Object.assign(document.createElement('p'), { textContent: ${failed}, dir: 'auto' })) })
</script>`
}
