// A module's own style sheet, linked when the module loads rather than with the first screen.

/** Whether to keep still: as the user asked on this device (Settings › Appearance › Motion), else as the device asks. */
export const still = () => (document.documentElement.dataset.motion || (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'less' : '')) === 'less'

/** Each sheet linked, by its address: one that several modules ask for is linked once. @type {Map<string, Promise<unknown>>} */
const linked = new Map()

/** Links a style sheet last in the head; settles once it loads or fails (the page works without it). @param {string | URL} href */
export function styleSheet(href) {
  const url = new URL(href, document.baseURI).href
  if (!linked.has(url)) linked.set(url, new Promise((resolve) => {
    const link = document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url, onerror: resolve }))
    link.onload = () => { if (link.sheet) contrast([link.sheet]); resolve(undefined) }
  }))
  return /** @type {Promise<unknown>} */ (linked.get(url))
}

/** Each rule for more contrast, by what it was written for. @type {WeakMap<CSSMediaRule, string>} */
const written = new WeakMap()
/**
 * The rules for more contrast on, as the user asked on this device (Settings › Appearance › Contrast, `data-contrast="more"`),
 * off (`usual`), or as the device asks: a control on the page is what RGAA counts as a way to more contrast (3.2, 3.3).
 * @param {Iterable<CSSStyleSheet>} [sheets]
 */
export function contrast(sheets = document.styleSheets) {
  const asked = document.documentElement.dataset.contrast
  const walk = (/** @type {CSSRuleList} */ rules) => { for (const rule of rules) {
    const was = rule instanceof CSSMediaRule ? written.get(rule) ?? rule.media.mediaText : ''
    if (rule instanceof CSSMediaRule && was.includes('(prefers-contrast: more)')) written.set(rule, was), (rule.media.mediaText = asked ? was.replaceAll('(prefers-contrast: more)', asked === 'more' ? 'all' : 'not all') : was)
    if ('cssRules' in rule) walk(/** @type {CSSGroupingRule} */ (rule).cssRules)
  } }
  // Another site's sheet, a font's, can't be read.
  for (const sheet of sheets) try { walk(sheet.cssRules) } catch {}
}
