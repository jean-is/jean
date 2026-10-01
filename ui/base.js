// A custom element (light DOM) that re-renders whenever a signal it reads changes.
import { render, nothing } from 'lit-html'
import { effect } from '@preact/signals-core'

export class Element extends HTMLElement {
  /** @type {(() => void) | undefined} */
  #dispose

  connectedCallback() {
    this.#dispose = effect(() => {
      render(this.render(), this)
      this.updated()
    })
  }

  disconnectedCallback() {
    this.#dispose?.()
    this.#dispose = undefined
  }

  /** @returns {unknown} */
  render() {
    return nothing
  }

  /** Called after each render. */
  updated() {}
}

/** @param {string} name @param {CustomElementConstructor} constructor */
export function define(name, constructor) {
  if (!customElements.get(name)) customElements.define(name, constructor)
}
