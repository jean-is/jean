// Formulas (D185): drawn by the browser as MathML, which Temml writes from the LaTeX brains use.
// Unlocked by the first formula a message holds, never offered; until then, or if Temml can't read
// one, its source shows (ui/markdown.js).
import { styleSheet } from '../../ui/sheet.js'

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

customElements.define('app-math', AppMath)
