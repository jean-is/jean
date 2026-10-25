// A diagram (D592): Mermaid's language drawn by Pele (Obsidian's, MIT) with no DOM, its words measured on an OffscreenCanvas,
// each kind of diagram loaded as one first shows. The SVG and its size go back to the page, which shows it as a picture.
import { renderAsync } from '../../vendor/pele/lazy.js'

onmessage = async ({ data: { id, source, options } }) => {
  try {
    const { svg, width, height } = await renderAsync(source, options)
    postMessage({ id, svg, width, height })
  } catch (error) {
    postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
