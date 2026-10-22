// What the parts of a document's editor share (D485): an element made, a glyph drawn, and a box floated
// beside what it is for, under it or over it, never past the window's edges.

/** @param {string} tag @param {Record<string, string>} [attrs] @param {...(Node | string)} children */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  node.append(...children)
  return node
}

/** A glyph: one path drawn in the text's colour. @param {string} d @param {number} [width] its stroke's */
export function icon(d, width = 2) {
  const [svg, path] = ['svg', 'path'].map((tag) => document.createElementNS('http://www.w3.org/2000/svg', tag))
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': String(width), 'stroke-linecap': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value)
  path.setAttribute('d', d)
  svg.append(path)
  return svg
}

/**
 * A fixed box beside what it is for: under it, or over it when `over` (each the other way round where there is no
 * room), its start at the rect's start as the page reads, or `centred` on it.
 * @param {HTMLElement} box @param {{ top: number, bottom: number, left: number, right: number }} rect
 * @param {{ over?: boolean, centred?: boolean, gap?: number }} [how]
 */
export function float(box, rect, { over = false, centred = false, gap = 6 } = {}) {
  const { offsetWidth: width, offsetHeight: height } = box
  const [below, above] = [rect.bottom + gap + height <= innerHeight - 8, rect.top - gap - height >= 8]
  box.style.top = `${Math.max(8, (over ? above || !below : !below && above) ? rect.top - gap - height : rect.bottom + gap)}px`
  const start = centred ? (rect.left + rect.right - width) / 2 : document.documentElement.dir === 'rtl' ? rect.right - width : rect.left
  box.style.left = `${Math.max(8, Math.min(start, innerWidth - width - 8))}px`
}
