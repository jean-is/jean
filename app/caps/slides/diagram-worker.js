// A deck's diagram (D592): Mermaid's language drawn by Pele (Obsidian's, MIT) with no DOM, its words measured on an
// OffscreenCanvas, each kind of diagram loaded as one first shows. The SVG goes back to the page, which shows it as a picture.
import { renderAsync } from '../../vendor/pele/lazy.js'

onmessage = async ({ data: { id, source, options } }) => {
  try {
    postMessage({ id, svg: (await renderAsync(source, options)).svg })
  } catch (error) {
    postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
