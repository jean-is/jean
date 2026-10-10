// A module's own style sheet, linked when the module loads rather than with the first screen.

/** Each sheet linked, by its address: one that several modules ask for is linked once. @type {Map<string, Promise<unknown>>} */
const linked = new Map()

/** Links a style sheet last in the head; settles once it loads or fails (the page works without it). @param {string | URL} href */
export function styleSheet(href) {
  const url = new URL(href, document.baseURI).href
  if (!linked.has(url)) linked.set(url, new Promise((resolve) => {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url, onload: resolve, onerror: resolve }))
  }))
  return /** @type {Promise<unknown>} */ (linked.get(url))
}
