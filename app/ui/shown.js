// A file of the project as it is drawn: read once it is on the page, and let go with it. A picture
// the user shared shows itself in their request; Pictures draws those Jean made (D251). Attributes,
// so they survive the upgrade.
import { html, nothing } from 'lit-html'
import { signal } from '@preact/signals-core'
import { Element, define } from './base.js'
import { app } from './state.js'

export class Shown extends Element {
  url = signal('')

  async connectedCallback() {
    super.connectedCallback()
    const bytes = await app.fs.readBytes(`${app.projectDir}/${this.getAttribute('uri')}`)
    if (bytes && this.isConnected && !this.url.peek()) this.url.value = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: this.getAttribute('type') ?? '' }))
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    URL.revokeObjectURL(this.url.peek())
    this.url.value = ''
  }
}

/** A picture the user shared, in their request: the button around it, named after it, opens it whole. */
class Shared extends Shown {
  render() {
    return this.url.value ? html`<img src=${this.url.value} alt="">` : nothing
  }
}

define('app-shared', Shared)
