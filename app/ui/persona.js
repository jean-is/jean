// The wave: Jean's presence, the tilde of its mark (docs/design.md).
// Decorative. It mirrors the presence, and CSS does all the moving (ui/style.css).
import { html } from 'lit-html'
import { Element, define } from './base.js'
import { app, decisionsHere } from './state.js'

const wave = html`<svg class="persona" viewBox="12 18 40 28" aria-hidden="true" focusable="false">
  <g class="persona-wave"><path class="persona-line" d="M-28 32q6-11 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0"/></g>
  <path class="persona-smile" d="M19 28Q32 40 45 28"/>
  <path class="persona-frown" d="M19 38Q32 27 45 38"/>
</svg>`

class Persona extends Element {
  render() {
    // Beyond the room's presence: waiting for the user's approval here, and sorry after an error. A still one (on paper) is the tilde alone.
    this.dataset.presence = this.hasAttribute('still') ? 'still' : decisionsHere().length ? 'waiting' : app.error.value ? 'oops' : app.presence.value
    return wave
  }
}

define('app-persona', Persona)
