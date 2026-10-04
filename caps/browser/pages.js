// The browser (D140), the parts with no browser in them (tested under node --test): what a typed
// address leads to, which pages can show beside the conversation, where Back and Forward go, a
// page's words for the brain, and how this browser installs a site as an app.

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/
const HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[\da-f:]+\])(:\d+)?([/?#]|$)/i
const DOMAIN = /^[^\s/?#@]+\.\p{L}{2,}(:\d+)?([/?#]|$)/u

/** @param {string} text @returns {URL | null} */
function parse(text) {
  try {
    return new URL(text)
  } catch {
    return null
  }
}

/**
 * Where what was typed in the address field leads: an address as it is, a site's name over
 * https (http on this computer), and words to the search page, in the user's language. Null
 * for any other scheme (a script, a file, data), which never opens.
 * @param {string} typed @param {string} search with {query} and {lang} @param {string} [lang]
 * @returns {string | null}
 */
export function addressOf(typed, search, lang = 'en') {
  const text = typed.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return parse(text)?.href ?? null
  if (!/\s/.test(text)) {
    const url = HOST.test(text) || DOMAIN.test(text) ? parse(`http://${text}`) : null
    if (url && !LOCAL.test(url.hostname)) url.protocol = 'https:'
    if (url) return url.href
    if (/^[a-z][a-z\d+.-]*:/i.test(text)) return null
  }
  return search.replace('{lang}', lang).replace('{query}', encodeURIComponent(text))
}

/**
 * Whether a page can show beside the conversation: a web page of another site than Jean's, over
 * https, unless it is on this computer or Jean itself is served over http (a secure page can't
 * frame an insecure one). @param {string} url @param {string} here Jean's own address
 */
export function showable(url, here) {
  const page = parse(url)
  const jean = parse(here)
  if (!page || !/^https?:$/.test(page.protocol) || page.origin === jean?.origin) return false
  return page.protocol === 'https:' || LOCAL.test(page.hostname) || jean?.protocol === 'http:'
}

/** A page's site, as Jean remembers sites that open in a tab of their own. @param {string} url */
export const siteOf = (url) => parse(url)?.host ?? ''

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', euro: '€' })

/** @param {string} text */
const decode = (text) => text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name) => {
  if (name[0] !== '#') return ENTITIES[name] ?? entity
  const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
  return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : entity
})

const HIDDEN = /<(script|style|noscript|template|svg|head|iframe|canvas|select)\b[\s\S]*?<\/\1\s*>/gi
const BLOCK = /<\/?(p|div|br|hr|h[1-6]|li|dt|dd|tr|td|th|section|article|header|footer|main|nav|aside|blockquote|pre|table|ul|ol|form|figure|figcaption)\b[^>]*>/gi

/**
 * A page's words, as a scanner reads them (no DOMParser: Trusted Types guard it in the page, and
 * this runs in Node): its title, its text line by line without its scripts, styles or drawings,
 * and whether it links a web app manifest, which makes it a site made to install as an app.
 * @param {string} source HTML @param {number} [max] characters of text kept
 */
export function pageText(source, max = 12000) {
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] ?? '').replace(/\s+/g, ' ').trim()
  const manifest = /<link\b[^>]*\brel=["']?manifest\b/i.test(source)
  const lines = decode(source.replace(/<!--[\s\S]*?-->/g, '').replace(HIDDEN, ' ').replace(BLOCK, '\n').replace(/<[^>]*>/g, ' '))
    .split('\n').map((line) => line.replace(/[\s ]+/g, ' ').trim()).filter(Boolean)
  const text = lines.join('\n')
  return { title, text: text.length > max ? `${text.slice(0, max)}…` : text, manifest }
}

/**
 * How this browser installs a site as an app (docs/product.md): from its menu in Chrome, Edge and
 * other Chromium browsers, Safari's Add to Dock, a phone's home screen. Firefox on a computer
 * can't ('none'). @param {{ userAgent?: string, userAgentData?: { brands?: { brand: string }[], mobile?: boolean }, maxTouchPoints?: number }} browser navigator
 * @returns {'chrome' | 'edge' | 'safari' | 'phone' | 'other' | 'none'}
 */
export function installer({ userAgent = '', userAgentData, maxTouchPoints = 0 }) {
  const brands = (userAgentData?.brands ?? []).map(({ brand }) => brand)
  if (userAgentData?.mobile || /Android|iPhone|iPad|Mobile/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'phone'
  if (brands.includes('Microsoft Edge') || /Edg\//.test(userAgent)) return 'edge'
  if (brands.includes('Google Chrome')) return 'chrome'
  if (brands.length || /OPR\/|Brave|Vivaldi/.test(userAgent)) return 'other'
  if (/Firefox\//.test(userAgent)) return 'none'
  if (/Chrome\//.test(userAgent)) return 'chrome'
  return /Version\/[\d.]+.*Safari\//.test(userAgent) ? 'safari' : 'other'
}

// A load this soon after Back or Forward is the page they went to.
const WALK_MS = 3000

/**
 * Where Back and Forward lead (D140). The addresses Jean opened, each in a fresh frame, are its own
 * list. A link followed in a page adds to the tab's history, which only the browser can walk, and
 * only while those entries are known to be the site's: a page that loaded without adding one (it
 * replaced itself, or the browser's own buttons moved it), or any change of Jean's own, and Back
 * goes to Jean's list instead, so it can never take Jean somewhere else. A cross-origin frame's
 * address can't be read: a page it went to is known only as one it went to.
 */
export class Trail {
  /** @type {string[]} */
  pages = []
  at = -1
  /** The site's own pages in the tab's history, before and after the one on show. */
  behind = 0
  ahead = 0
  /** The tab's history length when last seen; -1 once it may hold something else. */
  length = -1
  /** Whether the frame is a fresh one, whose first page is the one it was asked for. */
  fresh = false
  /** Until when a page that loads is the one Back or Forward went to. */
  until = 0
  /** Whether a page replaced itself, or the tab's history changed elsewhere, since the address was opened. */
  replaced = false

  get canBack() { return this.behind > 0 || this.at > 0 }
  /** Whether the page on show may be another than the address Jean opened. */
  get moved() { return this.behind > 0 || this.replaced }
  get canForward() { return this.ahead > 0 || this.at < this.pages.length - 1 }

  /** Jean takes the frame to an address: what was ahead is dropped. @param {string} url */
  open(url) {
    this.pages.splice(this.at + 1, Infinity, url)
    this.#go(this.pages.length - 1)
  }

  /** @param {number} at @returns {string} */
  #go(at) {
    this.at = at
    Object.assign(this, { behind: 0, ahead: 0, length: -1, fresh: true, until: 0, replaced: false })
    return this.pages[at]
  }

  /** The address on show again, in a fresh frame: a page the site went to is not known. */
  reload() { return this.#go(this.at) }

  /**
   * A page loaded in the frame. True when it moved on by itself (a link followed, a form sent).
   * @param {number} length the tab's history length now @param {number} [now]
   */
  loaded(length, now = Date.now()) {
    const added = this.length >= 0 && length > this.length ? length - this.length : 0
    if (this.length >= 0 || this.fresh) this.length = length
    if (this.fresh || (now < this.until && !added)) {
      Object.assign(this, { fresh: false, until: 0 })
      return false
    }
    Object.assign(this, { behind: added ? this.behind + added : 0, ahead: 0, replaced: this.replaced || !added })
    return true
  }

  /** Entries a site added by script, without loading a page. @param {number} length */
  sync(length) {
    if (this.length < 0 || length <= this.length) return
    Object.assign(this, { behind: this.behind + length - this.length, ahead: 0, length })
  }

  /** The tab's history changed elsewhere (another conversation): it is no longer the site's to walk. */
  elsewhere() { Object.assign(this, { replaced: this.moved, behind: 0, ahead: 0, length: -1, until: 0 }) }

  /** @param {number} [now] @returns {'history' | string | null} walk the tab's history, open this address, or nothing */
  back(now = Date.now()) {
    if (this.behind > 0 && this.length >= 0) return this.#walk(-1, now)
    return this.at > 0 ? this.#go(this.at - 1) : null
  }

  /** @param {number} [now] @returns {'history' | string | null} */
  forward(now = Date.now()) {
    if (this.ahead > 0 && this.length >= 0) return this.#walk(1, now)
    return this.at < this.pages.length - 1 ? this.#go(this.at + 1) : null
  }

  /** @param {number} step @param {number} now @returns {'history'} */
  #walk(step, now) {
    Object.assign(this, { behind: this.behind + step, ahead: this.ahead - step, until: now + WALK_MS })
    return 'history'
  }
}
