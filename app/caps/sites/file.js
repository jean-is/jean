// A site (D720) is a folder of the project, `sites/<ulid>-<slug>`, named once and never renamed: its pages, style sheets,
// scripts, drawings and pictures at their own paths in it, and site.json, its record: its format, name, author, times, whether
// it is pinned, the task it came from, its files, its last check and where it was published, and what publishing draws from the
// secret kept for it: its token and its recovery code; and a page on its own made a site of one page. Pure: node tests run it.
import { unescape } from './html.js'

/**
 * What site.json holds; `page`, the page on its own it is made from again each time it is published (sited()); `published`, where it went
 * online (./publish.js): the host, the name, its address, until when, when, and its files' hashes; `look`, the look it wears (./look.js), and the brain's or the user's colours;
 * `shape`, what a prototype is made for, a phone or a computer (D742).
 * @typedef {{ format: number, name: string, author: string, created: string, changed: string, pinned?: boolean, source: string, page?: string, files: string[], text?: string, check?: { problems: string[], fill: string[], flow?: import("../prototypes/check.js").Flow, at: string },
 *   look?: { id: string, voice: string, own?: import('./look.js').Own }, shape?: 'phone' | 'computer',
 *   published?: { host: string, name: string, address: string, expires: string, at: string, files: Record<string, string> } }} SiteRecord
 */

export const PLACE = /^sites\/[^/.][^/]*$/
export const RECORD = 'site.json'
/** What a site holds, by extension: what a host serves it as. */
export const TYPES = /** @type {Record<string, string>} */ ({ html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon', txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json' })

/** A file's path in a site, as given, or why it can't be one. @param {unknown} path */
export function pathIn(path) {
  const clean = String(path ?? '').trim().replace(/^\.?\/+/, '')
  if (!clean || clean === RECORD || clean.split('/').some((part) => part === '..' || part === '' || part.startsWith('.')) || /^[a-z]+:/i.test(clean)) throw new Error(`"${path}" isn't a path in the site: write one such as index.html or fr/index.html`)
  if (!TYPES[clean.toLowerCase().split('.').pop() ?? '']) throw new Error(`${clean}: a site holds pages, style sheets, scripts, drawings and pictures, not .${clean.split('.').pop()} files`)
  return clean
}

/** The file a path reaches, as a host serves it: a folder's index.html, a page without its .html. @param {Map<string, unknown>} files @param {string} path */
export const reach = (files, path) => [path, `${path}.html`, `${path}${path === '' || path.endsWith('/') ? '' : '/'}index.html`].find((one) => files.has(one)) ?? null

/**
 * The site's files with each change made, its passage found once in its file, or what failed; nothing changed then.
 * @param {Map<string, Uint8Array>} files @param {{ path?: unknown, old?: unknown, new?: unknown }[]} changes @returns {{ files: Map<string, Uint8Array> } | { error: string }}
 */
export function changed(files, changes) {
  const next = new Map(files), failed = /** @type {string[]} */ ([])
  for (const change of changes) {
    const path = pathIn(change.path), bytes = next.get(path), old = String(change.old ?? '')
    if (!bytes) { failed.push(`${path} isn't in the site`); continue }
    const text = new TextDecoder().decode(bytes), count = old ? text.split(old).length - 1 : 0
    if (count !== 1) failed.push(`${path}: the passage "${old.slice(0, 60)}" is found ${count} times, not once`)
    else next.set(path, new TextEncoder().encode(text.replace(old, () => String(change.new ?? ''))))
  }
  return failed.length ? { error: `Nothing changed: ${failed.join('; ')}. Quote each passage exactly as it is in the file.` } : { files: next }
}

/** Where the brain's version of a site waits for the person (D505, D741), beside the others: `sites/.suggested/<ulid>-<slug>`. @param {string} path */
export const waitingOf = (path) => path.replace(/^sites\//, 'sites/.suggested/')

/**
 * Words retyped in a page's frame (D741) as an exact passage of its file: the one text between two tags that reads as the words were,
 * with those tags' ends, and the words typed in its place, written as text; null where no text, or several, read so. Nothing is
 * parsed: the frame sends a text's words whole, which run from one tag to the next. Untrusted, as all the frame sends.
 * @param {string} page @param {unknown} old @param {unknown} typed @returns {{ old: string, new: string } | null}
 */
export function retyped(page, old, typed) {
  const [was, now] = [String(old ?? ''), String(typed ?? '')], plain = (/** @type {string} */ text) => text.replace(/ /g, ' ')
  const found = was.trim() && now.trim() && /^[^\0-\x08\x0b-\x1f]*$/.test(was + now) ? [...page.matchAll(/>([^<>]*)</g)].filter(([, words]) => plain(unescape(words)) === plain(was)) : []
  // A space the browser kept from collapsing is a space, unless the words had such spaces of their own.
  return found.length === 1 ? { old: found[0][0], new: `>${(/ /.test(was) ? now : plain(now)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}<` } : null
}

/** A site's recovery code: its secret as the lock writes its own, hexadecimal in fours. @param {Uint8Array} bytes */
export const codeOf = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase().replace(/.{4}(?=.)/g, '$&-')
/** A recovery code read back, whatever its case, spaces and dashes; null when it isn't one. @param {string} code */
export const secretOf = (code) => ((hex) => (/^[0-9a-f]{32}$/.test(hex) ? Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16)) : null))(code.toLowerCase().replace(/[\s-]/g, ''))
/** The token a site is published with, drawn from its secret one way, so the host, which keeps its hash, never holds the secret. @param {Uint8Array} secret */
export async function tokenOf(secret) {
  const key = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (secret), 'HKDF', false, ['deriveBits'])
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode('site write token') }, key, 256))
  return btoa(String.fromCharCode(...bits)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
/**
 * What a publish that failed says, by the host's answer if one came (host/sites.js): a recovery code typed that isn't the name's, a file or
 * the site too big, the day's new names from here all taken, too much sent this hour; or, with no answer, the connection.
 * @param {unknown} error what the publish threw: the host's answer, or what fetch threw @param {boolean} [code] whether a recovery code was typed
 */
export const failedOf = async (error, code = false) => (!(error instanceof Response) ? 'sites.failed' : error.status === 403 && code ? 'sites.wrongCode' : error.status === 413 ? 'sites.tooBig'
  : error.status !== 429 ? 'sites.failed' : (await error.json().catch(() => ({}))).why === 'names' ? 'sites.names' : 'sites.busy')

/** An opening tag, as ./html.js reads one, and one of its on…="" attributes: the event, and what it runs as the page writes it. */
const [TAG, HANDLER] = [/<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g, /\s+on([a-z]{3,})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi]
/**
 * A page on its own (a file, an app, a deck; a game's is ../games/page.js's siteOf()) as the files of a site, for the host, which runs only a
 * site's own files: each script inside it in a file of its own, in its place, and what its on…="" attributes do in one more, run once the
 * page is read; a policy of its own left out, the host's holding there, as it would stop those files; its data, its styles and the rest
 * as they were. @param {string} page @returns {Map<string, string>}
 */
export function sited(page) {
  let [files, runs, marked] = [new Map(), /** @type {string[]} */ ([]), 0], html = page.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy\b[^>]*>/gi, '').replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs, code) => {
    const type = /(?:^|\s)type\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1].toLowerCase() ?? ''
    if (/(?:^|\s)src\s*=/i.test(attrs) || !code.trim() || !/^(module|text\/javascript|application\/javascript)?$/.test(type)) return whole
    files.set(`script-${files.size + 1}.js`, code)
    return `<script src="script-${files.size}.js"${type === 'module' ? ' type="module"' : ''}></script>`
  }).replace(TAG, (whole, name, attrs, end) => {
    const found = [...attrs.matchAll(HANDLER)], at = found.length ? ++marked : 0; for (const [, event, a, b, c] of found) runs.push(`document.querySelector('[data-on="${at}"]').addEventListener('${event.toLowerCase()}', function (event) {\n${unescape(a ?? b ?? c ?? '')}\n})`)
    return found.length ? `<${name}${attrs.replace(HANDLER, '')} data-on="${at}"${end}>` : whole
  })
  if (runs.length) (files.set('on.js', runs.join('\n')), (html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, '<script src="on.js"></script>$&') : `${html}<script src="on.js"></script>`))
  return files.set('index.html', html)
}
