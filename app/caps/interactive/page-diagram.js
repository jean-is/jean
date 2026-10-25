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
      const picture = Object.assign(document.createElement('img'), { src: data.picture, alt: data.words })
      picture.style.cssText = 'display: block; max-width: 100%; height: auto; margin: 0 auto'
      this.shown.replaceChildren(picture)
    }
    addEventListener('message', heard)
    parent.postMessage({ diagram: source, width: this.clientWidth, id }, '*')
  }
})
