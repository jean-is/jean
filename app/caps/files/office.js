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

/** Where a workbook was being looked at: its sheet, how far it was scrolled, the cell chosen. @typedef {{ sheet: number, x: number, y: number, ref: string }} Place */

// A workbook's cells changed where they are (D229): a double click, F2 or typing opens a box over the cell
// chosen (Enter is the viewer's, for comments); Enter, Tab or leaving it sends Jean what it is to hold, and
// Jean keeps a new version and shows it again where it was; Escape leaves the box, as does Jean's answer
// that the cell can't change. Closed from the keyboard, the box gives the keys back to the sheet.
const CELLS = `
const box = Object.assign(document.createElement('input'), { dir: 'auto', spellcheck: false, autocomplete: 'off' })
box.style.cssText = 'position: fixed; display: none; box-sizing: border-box; margin: 0; padding: 0 4px; border: 2px solid #1a73e8; background: #fff; color: #111; font: 13px system-ui, sans-serif'
document.body.append(box)
let cell = null
let was = ''
let back = null
const ref = ({ row, col }) => { let name = ''; for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name + row }
const close = (keys) => { cell = null; box.readOnly = false; box.style.display = 'none'; if (keys) back?.focus() }
const open = (typed) => {
  const active = viewer.selectionState?.activeCell
  const rect = active && viewer.getCellViewportRect(active)
  if (!rect) return
  const known = viewer.getSelectionContext()?.cells?.find(({ address }) => address.row === active.row && address.col === active.col)
  const grid = viewer.canvasElement.getBoundingClientRect()
  cell = active
  back = document.activeElement
  was = known?.formula ? '=' + known.formula.replace(/^=/, '') : String(known?.value ?? '')
  box.value = typed ?? was
  box.setAttribute('aria-label', ref(active))
  Object.assign(box.style, { display: 'block', left: grid.left + rect.x + 'px', top: grid.top + rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' })
  box.focus()
}
const send = (keys) => {
  if (!cell || box.readOnly) return
  if (box.value === was) return close(keys)
  box.readOnly = true
  const sheet = viewer.sheetIndex
  parent.postMessage({ cell: { sheet, ref: ref(cell), value: box.value, sheetName: viewer.sheetNames[sheet], at: { sheet, ...viewer.getViewportOffset(), ref: ref(cell) } } }, '*')
}
box.addEventListener('keydown', (event) => {
  if (event.isComposing) return
  if (event.key === 'Escape') close(true)
  else if (event.key === 'Enter' || event.key === 'Tab') send(true)
  else return
  event.preventDefault()
})
box.addEventListener('blur', () => send(false))
main.addEventListener('dblclick', () => open())
addEventListener('keydown', (event) => {
  if (cell || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.target === box) return
  if (event.key === 'F2') open()
  else if ([...event.key].length === 1) open(event.key)
  else return
  event.preventDefault()
})
addEventListener('message', ({ source, data }) => { if (source === parent && data?.unchanged) close() })
`

/**
 * A page that draws a Word document, a workbook or a deck; a workbook in the preview has cells to change,
 * shown where it was looked at. @param {string} ext docx, xlsx or pptx @param {Uint8Array} bytes @param {string} name
 * @param {{ at?: Place }} [cells]
 */
export async function officePage(ext, bytes, name, cells) {
  graph ??= fetch(new URL('graph.json', BASE)).then((response) => response.json())
  const imports = Object.fromEntries(await Promise.all((await graph)[ext].map(async (file) => [`ooxml/${file}`, await data(file)])))
  const failed = JSON.stringify(t('files.failed', { name })).replace(/</g, '\\u003c')
  const at = JSON.stringify(cells?.at ?? null).replace(/</g, '\\u003c')
  return /* html */ `<meta charset="utf-8"><style>html, body { block-size: 100%; margin: 0; background: #ececef; font: 0.9rem system-ui, sans-serif; } main { block-size: 100vh; } p { margin: 2rem; text-align: center; }</style>
<script type="importmap">${JSON.stringify({ imports })}</script><main></main>
<script type="module">
import { ${VIEWERS[ext]} as Viewer } from 'ooxml/${ext}.mjs'
const main = document.querySelector('main')
const viewer = new Viewer(main, { wasmUrl: '${await data(`${ext}_parser_bg.wasm`, 'application/wasm')}', enableTextSelection: true, background: '#ececef' })
viewer.load(Uint8Array.from(atob('${dataURL('', bytes).slice(13)}'), (char) => char.charCodeAt(0)).buffer)${ext === 'xlsx' && cells ? `
  .then(async () => {
    const at = ${at}
    if (at) await viewer.goToSheet(at.sheet).then(() => viewer.setViewportOffset(at)).then(() => viewer.setSelection(at.ref)).catch(() => {})
    ${CELLS}})` : ''}
  .catch((error) => { console.warn(error); main.replaceChildren(Object.assign(document.createElement('p'), { textContent: ${failed}, dir: 'auto' })) })
</script>`
}
