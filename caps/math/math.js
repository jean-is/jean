// Formulas (D185): drawn by the browser as MathML, which Temml writes from the LaTeX brains use, and
// LaTeX documents laid out with them. Unlocked by the first formula or document a message holds,
// never offered; until then, or if Temml can't read one, its source shows (ui/markdown.js).
import { html, render } from 'lit-html'
import { markdown } from '../../ui/markdown.js'
import { styleSheet } from '../../ui/sheet.js'
import { latexToMarkdown } from './latex.js'

const [{ default: temml }] = await Promise.all([
  import(new URL('../../vendor/temml/temml.mjs', import.meta.url).href),
  styleSheet(new URL('../../vendor/temml/temml.css', import.meta.url)),
])

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
    } catch {
      this.replaceChildren(Object.assign(document.createElement('code'), { textContent: tex }))
    }
  }
}

/** A ```latex block laid out, its source under it as the brain wrote it, named by the block's own tag. */
class AppLatex extends HTMLElement {
  static observedAttributes = ['tex']

  attributeChangedCallback() {
    const tex = this.getAttribute('tex') ?? ''
    render(html`${markdown(latexToMarkdown(tex))}<details><summary>${this.getAttribute('kind')}</summary><pre dir="ltr"><code>${tex}</code></pre></details>`, this)
  }
}

customElements.define('app-math', AppMath)
customElements.define('app-latex', AppLatex)
