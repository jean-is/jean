// A module's own style sheet, linked when the module loads rather than with the first screen.

/** Links a style sheet last in the head; settles once it loads or fails (the page works without it). @param {string | URL} href */
export const styleSheet = (href) => new Promise((resolve) => {
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: String(href), onload: resolve, onerror: resolve }))
})
