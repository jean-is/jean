// A file of the project as it is drawn: read once it is on the page, and let go with it. A picture
// the user shared shows itself in their request; Pictures draws those Jean made (D251), once named
// when made where it is drawn. Attributes, so they survive the upgrade.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app } from './state.js'

export class Shown extends Element {
  static observedAttributes = ['uri']
  url = signal('')
  /** The file it reads or shows. */
  #uri = ''

  connectedCallback() {
    super.connectedCallback()
    this.#read()
  }

  attributeChangedCallback() {
    this.#read()
  }

  /** Its file's bytes, once on the page, or named anew: the one before let go, and a read that ends after another was named dropped. */
  async #read() {
    const uri = this.getAttribute('uri') ?? ''
    if (!this.isConnected || uri === this.#uri) return
    this.#let()
    this.#uri = uri
    const bytes = uri ? await app.fs.readBytes(`${app.projectDir}/${uri}`) : null
    if (bytes && this.isConnected && this.#uri === uri && !this.url.peek()) this.url.value = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: this.getAttribute('type') ?? '' }))
  }

  #let() {
    URL.revokeObjectURL(this.url.peek())
    this.url.value = ''
    this.#uri = ''
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.#let()
  }
}

/** A picture the user shared, in their request: the button around it, named after it, opens it whole. */
class Shared extends Shown {
  render() {
    return this.url.value ? html`<img src=${this.url.value} alt="">` : nothing
  }
}

define('app-shared', Shared)
