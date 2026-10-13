// What a web page in the preview may do (D143, D158), the policy it is written under, and what its
// frame allows. preview.html's own policy is the most these can allow; the relay adds this one
// ahead of the page.

/** Its own scripts run, and it may fill the screen and save files; nothing comes from the web, and nothing goes to it. */
export const PAGE_DEFAULTS = Object.freeze({ scripts: true, fullscreen: true, downloads: true, web: false, network: false, maps: false })

/** @typedef {keyof typeof PAGE_DEFAULTS} PageRight */

/** Where a page's maps come from (D291), unless policy or Settings name another service: OpenFreeMap's styles for light and dark. */
export const MAP_STYLES = Object.freeze({ light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' })

/** The map service's styles, light and dark, as policy or Settings name them (`mapStyles`). @param {{ mapStyles?: typeof MAP_STYLES }} settings @param {{ mapStyles?: typeof MAP_STYLES }} [policy] */
export const mapStyles = (settings, policy = {}) => policy.mapStyles ?? settings.mapStyles ?? MAP_STYLES
/** @typedef {Partial<Record<PageRight, boolean>> & { sites?: string[] }} PageSettings  sites: what its code may reach, any when empty */

/**
 * Defaults ← user ← policy (`pages` in policy.json), and what the organisation set, locked.
 * @param {{ pages?: PageSettings }} settings @param {{ pages?: PageSettings }} [policy]
 */
export function pageRights(settings, policy = {}) {
  const rights = /** @type {PageRight[]} */ (Object.keys(PAGE_DEFAULTS))
  const allows = /** @type {Record<PageRight, boolean>} */ (Object.fromEntries(rights.map((right) => [right, policy.pages?.[right] ?? settings.pages?.[right] ?? PAGE_DEFAULTS[right]])))
  const sites = policy.pages?.sites ?? settings.pages?.sites ?? []
  return { allows, sites, locked: new Set([...rights, 'sites'].filter((key) => policy.pages?.[/** @type {keyof PageSettings} */ (key)] !== undefined)) }
}

/** This computer, reached over http (which covers https). */
const LOCAL = /^(localhost|127\.0\.0\.1)(:|$)/

/**
 * A site its code may reach, typed or pasted: `*` (any on the internet), a domain, `*.` and a domain
 * or an ending (`*.com`) over https, or this computer; with a port, or `:*` for all. Normal form or null.
 * @param {string} text
 */
export function site(text) {
  const typed = text.trim().toLowerCase()
  if (typed === '*') return typed
  // Browsers' URL parsers differ on a * in a host, and refuse one for a port: both are set aside.
  const [, scheme = '', wild = '', rest = '', any = ''] = /^([a-z]+:\/\/)?(\*\.)?(.*?)(:\*)?$/.exec(typed) ?? []
  const local = LOCAL.test(rest)
  try {
    const url = new URL(`${scheme || (local ? 'http://' : 'https://')}${rest}`)
    const ok = (url.protocol === 'https:' || (local && url.protocol === 'http:')) && !url.username && !(any && url.port)
    return ok && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(url.hostname) && (wild || local || url.hostname.includes('.')) ? wild + url.host + any : null
  } catch {
    return null
  }
}

/**
 * A Content-Security-Policy: inline scripts when they run, and from the web (https only) what the
 * page links to, its scripts included, and what they send and receive, to the sites listed (none
 * of those valid: nowhere). Never a frame, a form or another base address. A page of the user's folder
 * (D156) or an Office file's (D183) has its scripts as data, and its own workers, pictures and WebAssembly.
 * @param {Record<PageRight, boolean>} allows @param {string[]} [sites] @param {boolean} [folder]
 */
export function pagePolicy({ scripts, web, network }, sites = [], folder = false) {
  const from = (/** @type {string} */ own) => (web ? `${own} https:` : own)
  const reach = sites.length ? sites.map(site).flatMap((host) => (host ? [host === '*' ? 'https:' : `${LOCAL.test(host) ? 'http' : 'https'}://${host}`] : [])) : ['https:']
  return [
    "default-src 'none'", `script-src ${scripts ? from(folder ? "'unsafe-inline' data: blob: 'wasm-unsafe-eval'" : "'unsafe-inline'") : "'none'"}`, `style-src ${from("'unsafe-inline'")}`,
    `img-src ${from(folder ? 'data: blob:' : 'data:')}`, `media-src ${from('data:')}`, `font-src ${from('data:')}`, `connect-src ${network && reach.length ? reach.join(' ') : "'none'"}`,
    "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ')
}

/**
 * What the frame lets its page use (D158): full screen when allowed, and copying always, as any
 * page can already copy on a click (`execCommand`) and WebKit doesn't ask. `*`, since WebKit doesn't
 * take the frame's opaque origin for its address's; only Jean's addresses show there (frame-src).
 * Saving a file isn't the frame's: the relay hands it to Jean.
 * @param {Record<PageRight, boolean>} allows
 */
export const pageAllow = ({ fullscreen }) => (fullscreen ? 'fullscreen *; clipboard-write *' : 'clipboard-write *')

/**
 * The frame's flags: its scripts, never with allow-same-origin, and its forms, since Chromium fires
 * a form's submit, and closes a dialog by its form, only where forms are allowed, so a page that
 * works out its sum on Enter did nothing. None is sent: both policies' form-action is 'none'.
 */
export const PAGE_SANDBOX = 'allow-scripts allow-forms'
