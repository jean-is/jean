// Formulas (D185): drawn by the browser as MathML, which Temml writes from the LaTeX brains use, and
// LaTeX documents laid out with them, copied as a widget is (D196), as their source and their
// picture at once. Unlocked by the first formula or document a message holds, never offered; until
// then, or if Temml can't read one, its source shows (ui/markdown.js).
import { html, nothing, render } from 'lit-html'
import { markdown, lex } from '../../ui/markdown.js'
import { notify } from '../../ui/state.js'
import { copyDrawing, pictureOf } from '../../ui/save.js'
import { icons } from '../../ui/icons.js'
import { styleSheet } from '../../ui/sheet.js'
import { t } from '../../core/i18n.js'
import { latexToMarkdown, wholeSoFar } from './latex.js'

const [{ default: temml }] = await Promise.all([
  import(new URL('../../vendor/temml/temml.mjs', import.meta.url).href),
  styleSheet(new URL('../../vendor/temml/temml.css', import.meta.url)),
  styleSheet(new URL('math.css', import.meta.url)),
])

/** Unicode's bold math letters and digits, which Temml writes \textbf in (that alphabet has no é), as the letters and digits they are. @param {string} text */
const unbold = (text) => text.replace(/[\u{1D400}-\u{1D433}\u{1D7CE}-\u{1D7D7}]/gu, (letter) => String.fromCodePoint(Number(letter.codePointAt(0)) - (letter >= '\u{1D7CE}' ? 0x1D79E : letter >= '\u{1D41A}' ? 0x1D3B9 : 0x1D3BF)))

class AppMath extends HTMLElement {
  static observedAttributes = ['tex', 'block']
  drawn = ''

  attributeChangedCallback() {
    const tex = this.getAttribute('tex') ?? ''
    const block = this.hasAttribute('block')
    if (this.drawn === `${block} ${tex}`) return
    this.drawn = `${block} ${tex}`
    try {
      temml.render(tex, this, { displayMode: block, throwOnError: true })
      // Bold words in their own letters, set in bold, so that "Théorème" is bold throughout, and copies and reads as itself.
      for (const text of this.querySelectorAll('mtext')) if (unbold(text.textContent ?? '') !== text.textContent) Object.assign(text, { textContent: unbold(text.textContent ?? '') }).classList.add('is-bold')
    } catch {
      // In a block still being written, a formula may not be whole yet: what was drawn stays.
      if (!this.closest('app-latex[open]')) this.replaceChildren(Object.assign(document.createElement('code'), { textContent: tex }))
    }
  }
}

/** A ```latex block laid out, Copy at its top corner; one formula or one sentence has no frame, its Copy at the end of its line; `open`, still being written, drawn as far as it is whole. */
class AppLatex extends HTMLElement {
  static observedAttributes = ['source', 'open']
  drawn = ''

  attributeChangedCallback() {
    const source = this.getAttribute('source') ?? ''
    const open = this.hasAttribute('open')
    const page = latexToMarkdown(open ? wholeSoFar(source) : source)
    if (this.drawn === `${open} ${page}`) return
    // Written: drawn anew, so that a formula Temml can't read shows its source.
    if (!open && this.drawn.startsWith('true')) render(nothing, this)
    this.drawn = `${open} ${page}`
    /** @type {any[]} */
    const [part, ...more] = lex(page).filter((token) => token.type !== 'space')
    // One line: a formula with no row breaks, or a sentence.
    this.toggleAttribute('line', !open && !more.length && (part?.type === 'math' ? !part.text.includes('\\\\') : part?.type === 'paragraph' && !part.raw.trim().includes('\n')))
    render(html`<div class="latex-page">${markdown(page)}</div>
      <div class="drawn-foot">
        <button class="icon-button subtle" aria-label=${t('action.copy')} title=${t('action.copy')}
          @click=${() => copyDrawing(source, this.picture()).then(() => notify(t('toast.copied')), () => notify(t('made.copyFailed')))}>${icons.copy}</button>
      </div>`, this)
  }

  /**
   * The document as a picture to put in a document, a PNG: a copy of it with each element's style
   * as it is drawn now, in an SVG's foreignObject, in black on white as on light paper. @returns {Promise<Blob>}
   */
  async picture() {
    const page = /** @type {HTMLElement} */ (this.querySelector('.latex-page'))
    const copy = /** @type {HTMLElement} */ (page.cloneNode(true))
    const copies = [copy, ...copy.querySelectorAll('*')]
    for (const [i, element] of [page, ...page.querySelectorAll('*')].entries()) {
      const style = getComputedStyle(element)
      const into = /** @type {HTMLElement} */ (copies[i])
      // What is drawn in the room's ink takes the paper's.
      for (const name of style) into.style?.setProperty(name, name.endsWith('color') && style.getPropertyValue(name) === style.color ? 'currentcolor' : style.getPropertyValue(name))
    }
    const { width, height } = page.getBoundingClientRect()
    const margin = 16
    Object.assign(copy.style, { color: '#000', margin: `${margin}px` })
    return pictureOf(`<svg xmlns="http://www.w3.org/2000/svg" width="${width + 2 * margin}" height="${height + 2 * margin}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(copy)}</foreignObject></svg>`, width + 2 * margin, height + 2 * margin)
  }
}

customElements.define('app-math', AppMath)
customElements.define('app-latex', AppLatex)
