// SPDX-License-Identifier: MIT
// A diagram in a page (D291, D592), lent to it as it appears: <app-diagram> holds Mermaid as its text, which the page's own code
// may set, and asks Jean for its picture, drawn by Pele in the room's colours, again when its text, the room's light or dark or
// its look changes. Its text shows nowhere; one Pele can't read keeps what it showed.
customElements.define('app-diagram', class extends HTMLElement {
  shown = this.attachShadow({ mode: 'open' })
  /** What was asked last, so that the same isn't asked again and an older answer is passed by. */
  asked = ''
  changed = new MutationObserver(() => this.draw())

  connectedCallback() {
    this.changed.observe(this, { childList: true, characterData: true, subtree: true })
    this.changed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look'] })
    this.draw()
  }

  disconnectedCallback() {
    this.changed.disconnect()
  }

  draw() {
    const root = document.documentElement
    const [source, id] = [this.textContent ?? '', Math.random()]
    const key = [source, root.dataset.theme, root.dataset.look].join('\n')
    if (key === this.asked) return
    this.asked = key
    const heard = (/** @type {MessageEvent} */ { data, source: from }) => {
      if (from !== parent || data?.id !== id) return
      removeEventListener('message', heard)
      if (this.asked !== key || !data.picture) return
      const picture = Object.assign(document.createElement('img'), { src: data.picture, alt: data.words.alt })
      picture.style.cssText = 'display: block; max-width: 100%; height: auto; margin: 0 auto'
      // Told in words under it, folded as they were if it is drawn again.
      const made = (/** @type {string} */ tag, /** @type {string} */ text = '') => Object.assign(document.createElement(tag), { textContent: text }), held = Object.assign(made('details'), { open: Boolean(this.shown.querySelector('details')?.open) })
      const list = (/** @type {{ box: string, next?: string[] }[]} */ items) => { const all = made('ul'); all.append(...items.map(({ box, next = [] }) => { const item = made('li', box); if (next.length) item.append(list(next.map((one) => ({ box: one })))); return item })); return all }
      held.append(made('summary', data.words.summary), list(data.words.steps))
      this.shown.replaceChildren(picture, held)
    }
    addEventListener('message', heard)
    parent.postMessage({ diagram: source, width: this.clientWidth, id }, '*')
  }
})
