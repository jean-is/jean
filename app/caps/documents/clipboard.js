// What a paste or a drop brings as HTML (D485), read where reading it is safe: in a small sealed frame of
// preview.html's kind, which runs cleanTree and hands back only a tree of what a document keeps, its Word
// and Google Docs lists made lists on the way; the editor builds that tree again with fromTree in an inert
// document, where nothing loads, and ProseMirror reads that. It imports nothing: the frame has it alone.

/** What a document keeps of pasted HTML: these elements, these attributes, these styles; of anything else, what it holds. */
const KEEP = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'b', 'strong', 'i', 'em', 's', 'del', 'strike', 'span', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'div', 'sup', 'sub'])
const DROP = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'noscript', 'head', 'title', 'meta', 'link', 'svg', 'math', 'video', 'audio', 'canvas', 'form', 'input', 'button', 'select', 'textarea'])
const ATTRS = /** @type {Record<string, string[]>} */ ({ a: ['href', 'title'], img: ['src', 'alt', 'title'], ol: ['start'], td: ['colspan', 'rowspan', 'data-align'], th: ['colspan', 'rowspan', 'data-align'] })
const STYLES = /** @type {const} */ (['fontWeight', 'fontStyle', 'textDecorationLine', 'textAlign'])

/** @typedef {string | { tag: string, attrs: Record<string, string>, style: Record<string, string>, children: Tree }} Item */
/** @typedef {Item[]} Tree */

/**
 * Lists as lists, in place: Word puts them on the clipboard as paragraphs styled mso-list, how deep each is
 * in that style (`level2`), and its bullet or number as text only other programs read, between
 * <!--[if !supportLists]--> and <![endif]-->; Google Docs a list inside a list, beside its item. @param {Document} doc
 */
function lists(doc) {
  /** @type {Array<{ list: HTMLElement, level: number }>} */
  let stack = []
  /** @type {Element | null} */
  let previous = null
  for (const p of [...doc.body.querySelectorAll('p')].filter((p) => /mso-list:\s*l\d+\s+level\d+/i.test(p.getAttribute('style') ?? ''))) {
    let marker = ''
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_COMMENT)
    const comments = []
    for (let comment = walker.nextNode(); comment; comment = walker.nextNode()) comments.push(comment)
    for (const comment of comments.filter((one) => /\[if !supportLists\]/.test(/** @type {Comment} */ (one).data))) {
      for (let next = comment.nextSibling; next && !(next.nodeType === Node.COMMENT_NODE && /\[endif\]/.test(/** @type {Comment} */ (next).data)); next = comment.nextSibling) {
        marker += next.textContent ?? ''
        next.remove()
      }
    }
    const level = Number(/level(\d+)/i.exec(p.getAttribute('style') ?? '')?.[1] ?? 1)
    if (previous?.nextElementSibling !== p) stack = []
    while (stack.length && stack[stack.length - 1].level > level) stack.pop()
    if (!stack.length || stack[stack.length - 1].level < level) {
      const list = doc.createElement(/^\s*(\d+|[a-z]|[ivxlc]+)[.)]/i.test(marker) ? 'ol' : 'ul')
      if (stack.length) (stack[stack.length - 1].list.lastElementChild ?? stack[stack.length - 1].list).append(list)
      else p.before(list)
      stack.push({ list, level })
    }
    const li = doc.createElement('li')
    li.append(...p.childNodes)
    stack[stack.length - 1].list.append(li)
    // A mark where the paragraph was, so that the next one knows it follows it.
    previous = doc.createElement('template')
    p.replaceWith(previous)
  }
  for (const mark of doc.body.querySelectorAll('template')) mark.remove()
  for (const list of doc.body.querySelectorAll(':is(ul, ol) > :is(ul, ol)')) if (list.previousElementSibling?.tagName === 'LI') list.previousElementSibling.append(list)
}

/** Pasted HTML, its lists made lists, as a tree of what a document keeps: what the frame hands back. @param {string} html */
export function cleanTree(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  lists(doc)
  return toTree(doc.body)
}

/** @param {Node} node @returns {Tree} */
function toTree(node) {
  /** @type {Tree} */
  const out = []
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) out.push(/** @type {Text} */ (child).data)
    const element = /** @type {HTMLElement} */ (child)
    if (child.nodeType !== Node.ELEMENT_NODE || DROP.has(element.localName)) continue
    if (!KEEP.has(element.localName)) {
      out.push(...toTree(element))
      continue
    }
    const attrs = Object.fromEntries((ATTRS[element.localName] ?? []).flatMap((name) => (element.hasAttribute(name) ? [[name, String(element.getAttribute(name))]] : [])))
    const style = Object.fromEntries(STYLES.flatMap((name) => (element.style?.[name] ? [[name, element.style[name]]] : [])))
    out.push({ tag: element.localName, attrs, style, children: toTree(element) })
  }
  return out
}

/**
 * The tree as elements of `doc`, which is inert (document.implementation.createHTMLDocument), where a picture
 * never loads: only what the tree kept, set one by one, its styles through the CSSOM, which a strict policy allows.
 * @param {Tree} tree @param {Document} doc @param {HTMLElement} [into]
 */
export function fromTree(tree, doc, into = doc.createElement('div')) {
  for (const item of tree) {
    if (typeof item === 'string') into.append(doc.createTextNode(item))
    if (typeof item === 'string' || !KEEP.has(item.tag)) continue
    const node = doc.createElement(item.tag)
    for (const name of ATTRS[item.tag] ?? []) if (typeof item.attrs[name] === 'string') node.setAttribute(name, item.attrs[name])
    for (const name of STYLES) if (typeof item.style[name] === 'string') node.style[name] = item.style[name]
    into.append(fromTree(item.children, doc, node))
  }
  return into
}
