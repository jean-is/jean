// The little light: Jean's persona, the room's light with a face (docs/design.md).
// Decorative. It mirrors the presence, and CSS does all the moving (ui/style.css).
import { html } from 'lit-html'
import { Element, define } from './base.js'
import { app } from './state.js'

const face = html`<svg class="persona" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <g class="persona-sparks"><circle cx="57" cy="4" r="2.6"/><circle cx="50" cy="3" r="2"/><circle cx="63" cy="5" r="1.6"/></g>
  <g class="persona-flame">
    <path class="persona-body" d="M57 6C61 17 80 33 80 61A30 30 0 0 1 20 61C20 44 31 33 41 24C47 18 53 15 57 6Z"/>
    <path class="persona-inner" d="M54 30C57 39 70 48 70 64A20 20 0 0 1 30 64C30 53 37 46 43 41C48 37 52 35 54 30Z"/>
    <g class="persona-face">
      <g class="persona-cheeks"><ellipse cx="35" cy="70" rx="4.4" ry="2.7"/><ellipse cx="65" cy="70" rx="4.4" ry="2.7"/></g>
      <g class="persona-eyes"><ellipse cx="41.5" cy="62" rx="3.9" ry="5.3"/><ellipse cx="58.5" cy="62" rx="3.9" ry="5.3"/><circle cx="42.9" cy="59.8" r="1.4"/><circle cx="59.9" cy="59.8" r="1.4"/></g>
      <path class="persona-happy" d="M37.5 63.5Q41.5 57.5 45.5 63.5M54.5 63.5Q58.5 57.5 62.5 63.5"/>
      <path class="persona-mouth" d="M45.5 70Q50 74.5 54.5 70"/>
    </g>
  </g>
</svg>`

class Persona extends Element {
  render() {
    // Beyond the room's presence: waiting for the user's approval, and sorry after an error.
    this.dataset.presence = app.permission.value ? 'waiting' : app.error.value ? 'oops' : app.presence.value
    return face
  }
}

define('app-persona', Persona)
