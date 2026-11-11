// Jean's hand in a site's frame (D741): written ahead of the page its pane shows (./frame.js), it runs in the frame alone, never in
// Jean's page, idle until Jean asks. Retyping, the words of headings, paragraphs, list items, quotes, captions, labels, links and
// buttons are each a field of plain text, which Tab reaches as a click does: Enter keeps what was typed, Escape puts it back, and
// what changed goes to Jean as each text's words before and after, put back if Jean refuses them; a key that took any markup away,
// or left a text without words, puts the field back at once. Pointing, a click on a part, or Enter on one Tab reached, every part
// with words or a picture reachable, points at it: Jean hears its words and its place, a selector from the body. Meanwhile links
// lead nowhere and the page's own script hears no click. What it sends is untrusted all the same: the page's script could send it.
;(() => {
  const post = (/** @type {unknown} */ message) => parent.postMessage(message, '*'), sheet = new CSSStyleSheet(), sent = /** @type {Map<number, [Text, string][]>} */ (new Map())
  const WORDS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,caption,th,td,label,summary,a,button,span,strong,em,b,i,small,time,address,cite,q', ring = 'outline: 2px solid Highlight !important; outline-offset: 2px !important; box-shadow: 0 0 0 5px Canvas !important'
  sheet.replaceSync(`[data-app-hand]:focus, [data-app-hand]:hover, [data-app-over] { ${ring} } :is([data-app-hand]:hover, [data-app-over]):not(:focus) { outline-style: dashed !important }
    [data-app-pointed] { ${ring}; outline-width: 3px !important } [contenteditable][data-app-hand] { cursor: text }`)
  // Retyping, pointing or neither; what each change sent was, until Jean keeps or refuses it; what was changed on each element, to put back;
  // the field typed in, its texts and their words, how many elements it holds and a copy to put back; the part pointed at, the one under the pointer.
  let mode = '', ids = 0, marked = /** @type {[Element, string, string | null][]} */ ([]), field = /** @type {{ at: HTMLElement, was: [Text, string][], count: number, copy: Node } | null} */ (null)
  let pointed = /** @type {Element | null} */ (null), over = /** @type {Element | null} */ (null)
  const texts = (/** @type {Node} */ at) => { const walk = document.createTreeWalker(at, NodeFilter.SHOW_TEXT), all = /** @type {Text[]} */ ([]); while (walk.nextNode()) all.push(/** @type {Text} */ (walk.currentNode)); return all }
  const worded = (/** @type {Element} */ at) => [...at.childNodes].some((node) => node.nodeType === 3 && /** @type {Text} */ (node).data.trim())
  const mark = (/** @type {Element} */ at, /** @type {string} */ name, /** @type {string} */ value) => { marked.push([at, name, at.getAttribute(name)]); at.setAttribute(name, value) }
  const hold = (/** @type {HTMLElement} */ at) => { field = { at, was: texts(at).map((node) => [node, node.data]), count: at.getElementsByTagName('*').length, copy: at.cloneNode(true) } }
  const back = (/** @type {HTMLElement} */ at, /** @type {Node} */ copy) => at.replaceChildren(...copy.cloneNode(true).childNodes)

  /** The field's words kept: what changed sent to Jean, or the field put back when markup went; then held again while it has the keys. @param {boolean} stay */
  function keep(stay) {
    const now = field, nodes = now ? texts(now.at) : []
    if (!now) return
    field = null
    if (nodes.length !== now.was.length || now.was.some(([node, words], i) => node !== nodes[i] || (words.trim() && !node.data.trim())) || now.at.getElementsByTagName('*').length !== now.count) back(now.at, now.copy), post({ refused: true })
    else if (now.was.some(([node, words]) => node.data !== words)) {
      const changed = now.was.filter(([node, words]) => node.data !== words)
      sent.set(++ids, changed), post({ edited: { id: ids, changes: changed.map(([node, words]) => ({ old: words, new: node.data })) } })
    }
    if (stay) hold(now.at)
  }

  /** Where a part is: a selector from the body, or from the nearest id, its first class and its place among its kind. @param {Element} at */
  function placeOf(at) {
    const steps = []
    for (let one = /** @type {Element | null} */ (at); one && one !== document.body; one = one.parentElement) {
      if (one.id) { steps.unshift(`#${CSS.escape(one.id)}`); break }
      const kin = [...(one.parentElement?.children ?? [])].filter((other) => other.localName === one?.localName)
      steps.unshift(`${one.localName}${one.classList[0] ? `.${CSS.escape(one.classList[0])}` : ''}${kin.length > 1 ? `:nth-of-type(${kin.indexOf(one) + 1})` : ''}`)
    }
    return steps[0]?.startsWith('#') ? steps.join(' > ') : ['body', ...steps].join(' > ')
  }
  /** A part pointed at, its words and place told to Jean unless it is pointed at again after the page showed anew. @param {Element | null} at @param {boolean} [told] */
  function point(at, told = true) {
    if (!at || at === document.body || !document.body.contains(at)) return
    pointed?.removeAttribute('data-app-pointed'), (pointed = at).setAttribute('data-app-pointed', '')
    if (told) post({ pointed: { name: at.localName, place: placeOf(at), words: (at instanceof HTMLImageElement ? at.alt : at instanceof HTMLElement ? at.innerText : at.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) } })
  }

  /** Retyping, pointing or neither, as Jean asks, and the part pointed at before the page showed anew. @param {string} next @param {unknown} at */
  function use(next, at) {
    keep(false)
    for (const [one, name, value] of marked.reverse()) value === null ? one.removeAttribute(name) : one.setAttribute(name, value)
    pointed?.removeAttribute('data-app-pointed'), over?.removeAttribute('data-app-over')
    ;[marked, pointed, over, mode] = [[], null, null, next === 'edit' || next === 'point' ? next : '']
    document.adoptedStyleSheets = [...document.adoptedStyleSheets.filter((one) => one !== sheet), ...(mode ? [sheet] : [])]
    for (const one of mode ? document.body.querySelectorAll('*') : []) {
      // A browser that has no plain text fields types into a rich one, whose markup keep() puts back.
      if (mode === 'edit' && one.matches(WORDS) && worded(one) && !one.closest('[data-app-hand]') && !/** @type {HTMLElement} */ (one).isContentEditable) {
        mark(one, 'contenteditable', 'plaintext-only'), mark(one, 'data-app-hand', '')
        if (!/** @type {HTMLElement} */ (one).isContentEditable) one.setAttribute('contenteditable', 'true')
      }
      if (mode === 'point' && (worded(one) || one.matches('img, svg, video, figure')) && !one.parentElement?.closest('svg') && /** @type {HTMLElement} */ (one).tabIndex < 0) mark(one, 'tabindex', '0'), mark(one, 'data-app-hand', '')
    }
    if (mode === 'point' && typeof at === 'string' && at) try { point(document.querySelector(at), false) } catch {}
  }

  addEventListener('message', ({ source, data }) => {
    if (source !== parent || !data || typeof data !== 'object') return
    if ('hand' in data) document.readyState === 'loading' ? addEventListener('DOMContentLoaded', () => use(String(data.hand), data.at), { once: true }) : use(String(data.hand), data.at)
    if (typeof data.undo === 'number') for (const [node, words] of sent.get(data.undo) ?? []) node.data = words
    sent.delete(data.kept ?? data.undo)
  })
  addEventListener('click', (event) => { if (mode) event.preventDefault(), event.stopPropagation(), mode === 'point' && event.target instanceof Element && point(event.target) }, true)
  addEventListener('keydown', (event) => {
    const { key, target } = event
    if (mode === 'edit' && field && target === field.at && !event.isComposing && (key === 'Enter' || key === 'Escape')) event.preventDefault(), key === 'Enter' ? keep(true) : (back(field.at, field.copy), hold(field.at))
    else if (mode === 'point' && (key === 'Enter' || key === ' ') && target instanceof Element && target !== document.body) event.preventDefault(), event.stopPropagation(), point(target)
  }, true)
  // A field holds one line of words: no new paragraph, no line break, no bold.
  addEventListener('beforeinput', (event) => { if (mode === 'edit' && /^(insertParagraph|insertLineBreak|format|insertFromDrop)/.test(event.inputType)) event.preventDefault() }, true)
  addEventListener('focusin', (event) => { if (mode === 'edit' && event.target instanceof HTMLElement && event.target.hasAttribute('data-app-hand')) hold(event.target) }, true)
  addEventListener('focusout', (event) => { if (field?.at === event.target) keep(false) }, true)
  addEventListener('mouseover', (event) => { if (mode === 'point' && event.target instanceof Element) over?.removeAttribute('data-app-over'), (over = event.target === document.body ? null : event.target)?.setAttribute('data-app-over', '') }, true)
})()
