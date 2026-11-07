// A site (D720) is a folder of the project, `sites/<ulid>-<slug>`, named once and never renamed: its pages, style sheets,
// scripts, drawings and pictures at their own paths in it, and site.json, its record: its format, name, author, times, whether
// it is pinned, the task it came from, its files and its last check. Pure: node tests run it.

/** @typedef {{ format: number, name: string, author: string, created: string, changed: string, pinned?: boolean, source: string, files: string[], text?: string, check?: { problems: string[], fill: string[], at: string } }} SiteRecord */

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
