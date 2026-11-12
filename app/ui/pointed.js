// SPDX-License-Identifier: MIT
// A picture's area an answer points at (D715): the picture shown small under its mark, the area boxed as the file's view
// boxes it, a click opening it there. Most often the screen shared or the camera's picture, where it says "here".
import { html, nothing } from 'lit-html'
import { define } from './base.js'
import { Shown } from './shown.js'
import { openFile } from './state.js'
import { styleSheet } from './sheet.js'
import { t } from '../core/i18n.js'

await styleSheet(new URL('view.css', import.meta.url))

class Pointed extends Shown {
  render() {
    const [x, y, w, h] = (this.getAttribute('area') ?? '').split(',').map(Number)
    const link = /** @type {import('../core/types.js').ResourceLink} */ ({ type: 'resource_link', uri: this.getAttribute('uri') ?? '', name: this.getAttribute('name') ?? '', mimeType: this.getAttribute('type') ?? '' })
    return this.url.value ? html`<button type="button" class="view-marked pointed" aria-label=${t('sources.open', { name: link.name })} @click=${() => openFile(link, `: ${x},${y},${w},${h}`)}>
      <img src=${this.url.value} alt=""><svg class="view-mark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path fill-rule="evenodd" d=${`M0 0H100V100H0ZM${x} ${y}h${w}v${h}h${-w}Z`}></path>
      <rect x=${x} y=${y} width=${w} height=${h} vector-effect="non-scaling-stroke"></rect></svg></button>` : nothing
  }
}

define('app-pointed', Pointed)
