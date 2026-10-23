// An app's manifest (D296): app.json, Jean's own, after Claude Code's for what both need (name,
// version, description, author, homepage), with what Jean adds: its title and description in each
// language (title-<lang>, description-<lang>, as a skill gives its own, D222), the module that runs it
// (main, beside it), the rights it asks for, which the user grants in adding it and Jean holds it to, and
// the glyph of Jean's it is shown with, if it names one that stands for neither safety nor one of Jean's
// own controls (icon, D535).
// Host-agnostic: no DOM, tested under node --test.

/** What an app may do, in the order its card lists them. */
export const RIGHTS = /** @type {const} */ (['watch', 'draw', 'notify', 'change', 'refuse', 'loosen'])
/** The events an app may hook, and the slots it may draw in. */
export const EVENTS = ['task.start', 'file.add', 'tool.check', 'turn.end', 'record']
export const SLOTS = ['above', 'answer', 'settings']
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
// Glyphs an app can't take: a shield or a lock on it would read as Jean's own protection, a send or a trash as Jean's controls.
const NOT_ICONS = ['shield', 'lock', 'key', 'check', 'double-check', 'badge', 'stop', 'trash', 'close', 'send', 'more', 'chevron']

/**
 * @typedef {typeof RIGHTS[number]} Right
 * @typedef {{ format: 1, name: string, version: string, title: string, description: string, author?: string, homepage?: string, icon?: string,
 *   main: string, rights: Right[], shown: Record<string, { title?: string, description?: string }> }} Manifest
 */

/** A manifest from an app.json's text; what is wrong with one is thrown as a code (json, format, name, main, rights). @param {string} text @returns {Manifest} */
export function readManifest(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('json')
  }
  if (data?.format !== 1) throw new Error('format')
  if (!NAME.test(String(data.name ?? ''))) throw new Error('name')
  if (typeof data.main !== 'string' || !/^[\w.-]+\.m?js$/.test(data.main) || data.main.startsWith('.')) throw new Error('main')
  const asked = Array.isArray(data.rights) ? data.rights : []
  if (asked.some((/** @type {any} */ right) => !RIGHTS.includes(right))) throw new Error('rights')
  /** @type {Manifest['shown']} */
  const shown = {}
  for (const [key, value] of Object.entries(data)) {
    const [, field, lang] = /^(title|description)-(.+)$/.exec(key) ?? []
    if (field && typeof value === 'string') (shown[lang] ??= {})[/** @type {'title' | 'description'} */ (field)] = value
  }
  const author = typeof data.author === 'string' ? data.author : data.author?.name
  return {
    format: 1, name: data.name, version: String(data.version ?? ''), title: String(data.title ?? data.name), description: String(data.description ?? ''),
    ...(author && { author: String(author) }), ...(typeof data.homepage === 'string' && { homepage: data.homepage }), ...(/^[a-z-]{1,40}$/.test(String(data.icon ?? '')) && !NOT_ICONS.includes(data.icon) && { icon: data.icon }),
    main: data.main, rights: RIGHTS.filter((right) => asked.includes(right)), shown,
  }
}

/** Its title and description in a language, else as written. @param {Manifest} manifest @param {string} lang */
export const shownIn = (manifest, lang) => ({ title: manifest.shown[lang]?.title ?? manifest.title, description: manifest.shown[lang]?.description ?? manifest.description })

/**
 * The address its files are read from: a folder's, given or by its app.json, or a repository's or one
 * of its folders' on GitHub, read as raw files; null for what isn't an address. @param {string} address
 */
export function baseOf(address) {
  let url
  try {
    url = new URL(/^[a-z]+:/i.test(address) ? address : `https://${address}`)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null
  const github = url.hostname === 'github.com' && /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)\/?(.*))?\/?$/.exec(url.pathname)
  if (github) return `https://raw.githubusercontent.com/${github[1]}/${github[2]}/${github[3] ?? 'HEAD'}/${github[4] ? `${github[4].replace(/\/$/, '')}/` : ''}`
  return `${url.origin}${url.pathname.replace(/app\.json$/, '').replace(/\/?$/, '/')}`
}

/** Where an app's files are read from, as its page says it: a repository on GitHub by its name, else the site. @param {string} base */
export function siteOf(base) {
  const { hostname, host, pathname } = new URL(base)
  return hostname === 'raw.githubusercontent.com' ? `github.com/${pathname.split('/').slice(1, 3).join('/')}` : host
}
