// A folder's pages, for the browser (D156): a page of the conversation's folder put together as one
// document, the way a site's server would serve it, for a frame that can't load anything itself. A
// page's own scripts run only in an opaque origin, which no service worker serves, so what the page
// uses from the folder goes in with it: style sheets as <style>, scripts, pictures, sounds and fonts
// as data: addresses, modules through an import map of data: addresses (their imports first made
// absolute), and the data files its scripts name, which its fetch() then finds. Never a hidden file
// (a name starting with a dot) or one outside the folder. A folder shows its index.html, or what it
// holds; a picture, a sound, a film or a text shows as itself. No DOM: node tests run it.
import { walkFolder } from './work.js'

/** The made-up site a page's addresses are resolved in, never fetched. */
export const SITE = 'https://folder.invalid/'
const MAX_BYTES = 20 * 1024 * 1024
const TYPES = /** @type {Record<string, string>} */ ({
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', geojson: 'application/json',
  xml: 'application/xml', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values', yml: 'text/plain', yaml: 'text/plain',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
})
// Files a script may fetch: data, not pages or code.
const DATA = /\.(json|geojson|csv|tsv|txt|md|xml|ya?ml|svg)$/i
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {{ fs: FS, page: string, files: Record<string, string>, modules: Map<string, string>, data: Record<string, string> }} Context */
/**
 * What a folder's address shows: a page put together, with the path its links are resolved from and
 * the files it was made of, by size and date; or why it can't show.
 * @typedef {{ html: string, path: string, files: Record<string, string> } | { note: 'missing' | 'unshown' }} Shown
 */

const typeOf = (/** @type {string} */ path) => TYPES[/\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? ''] ?? 'application/octet-stream'
const escape = (/** @type {string} */ text) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
const address = (/** @type {string} */ path) => SITE + path.split('/').map(encodeURIComponent).join('/')

/** @param {Uint8Array} bytes */
function base64(bytes) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
const dataURL = (/** @type {string} */ type, /** @type {Uint8Array} */ bytes) => `data:${type};base64,${base64(bytes)}`

/**
 * A reference in a file of the folder, as the path of the file it names: null for another site, a
 * data address, a place in the page (#…), a hidden file. "/" is the folder's top.
 * @param {string} ref @param {string} from the path of the file it is in
 */
export function inFolder(ref, from) {
  const text = ref.trim().replace(/&amp;/g, '&')
  if (!text || /^([a-z][\w+.-]*:|\/\/|#)/i.test(text)) return null
  try {
    const path = decodeURIComponent(new URL(text, address(from)).pathname.slice(1))
    return path.split('/').some((part) => part.startsWith('.')) ? null : path
  } catch {
    return null
  }
}

/**
 * Replaces each match by what a function makes of it, which may take time.
 * @param {string} text @param {RegExp} pattern global @param {(...match: string[]) => string | Promise<string>} make
 */
async function replace(text, pattern, make) {
  /** @type {(string | Promise<string>)[]} */
  const parts = []
  let at = 0
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(at, match.index), make(...match))
    at = (match.index ?? 0) + match[0].length
  }
  parts.push(text.slice(at))
  return (await Promise.all(parts)).join('')
}

/** A file's bytes, noted as part of the page; null when it isn't there or is too big. @param {Context} ctx @param {string} path */
async function bytesOf(ctx, path) {
  const stamp = await ctx.fs.stat?.(path).catch(() => null)
  if (!stamp || stamp.size > MAX_BYTES) return null
  ctx.files[path] = `${stamp.size}:${stamp.lastModified}`
  return ctx.fs.readBytes(path)
}

/** A file of the folder as a data address, or null. @param {Context} ctx @param {string} ref @param {string} from */
async function asData(ctx, ref, from) {
  const path = inFolder(ref, from)
  const bytes = path === null ? null : await bytesOf(ctx, path)
  return bytes && path !== null ? dataURL(typeOf(path), bytes) : null
}

/** A style sheet with what it uses inside it: the sheets it imports, then pictures and fonts. @param {Context} ctx @param {string} css @param {string} from @param {number} [depth] */
async function style(ctx, css, from, depth = 0) {
  const imported = await replace(css, /@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1\s*\)?([^;]*);/gi, async (whole, _, ref, media) => {
    const path = depth < 8 ? inFolder(ref, from) : null
    const bytes = path === null ? null : await bytesOf(ctx, path)
    if (!bytes || path === null) return whole
    const inner = await style(ctx, decoder.decode(bytes), path, depth + 1)
    return media.trim() ? `@media ${media.trim()} {${inner}}` : inner
  })
  return replace(imported, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (whole, _, ref) => {
    const data = await asData(ctx, ref, from)
    return data ? `url("${data}")` : whole
  })
}

/** A module, its imports of the folder made absolute: an entry of the import map. @param {Context} ctx @param {string} path */
async function module(ctx, path) {
  const url = address(path)
  if (ctx.modules.has(url)) return url
  ctx.modules.set(url, '')
  const bytes = await bytesOf(ctx, path)
  if (bytes) ctx.modules.set(url, dataURL('text/javascript', encoder.encode(await code(ctx, decoder.decode(bytes), path, true))))
  return url
}

/**
 * A script's code: a module's imports of the folder made absolute (resolved by the import map), and
 * the data files it names, put in for its fetch(), which resolves them from the page.
 * @param {Context} ctx @param {string} source @param {string} from @param {boolean} modular
 */
async function code(ctx, source, from, modular) {
  for (const [, , name] of source.matchAll(/(["'`])([^"'`\s<>()]+)\1/g)) {
    const path = DATA.test(name) ? inFolder(name, ctx.page) : null
    const bytes = path === null || ctx.data[path] ? null : await bytesOf(ctx, path)
    if (bytes && path !== null) ctx.data[path] = dataURL(typeOf(path), bytes)
  }
  if (!modular) return source
  return replace(source, /(\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*[\w$*{}\s,]+?\s*from\s*|\bimport\s*\(\s*)(["'])([^"'\n]+)\2/g, async (whole, head, quote, spec) => {
    const path = /^\.{0,2}\//.test(spec) ? inFolder(spec, from) : null
    return path === null ? whole : `${head}${quote}${await module(ctx, path)}${quote}`
  })
}

/** A tag's attributes with the files they name inside: src, poster, srcset, SVG's href, style. @param {Context} ctx @param {string} tag @param {string} text @param {string} from */
function attributes(ctx, tag, text, from) {
  return replace(text, /(\s)([^\s"'>/=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g, async (whole, space, name, _, quoted) => {
    const key = name.toLowerCase()
    const value = /^["']/.test(quoted) ? quoted.slice(1, -1) : quoted
    let next = null
    if (key === 'src' || key === 'poster' || (/^(xlink:)?href$/.test(key) && /^(image|use|feimage)$/i.test(tag))) next = await asData(ctx, value, from)
    else if (key === 'srcset') next = await replace(value, /([^\s,]+)(\s*[^,]*)/g, async (each, ref, size) => `${(await asData(ctx, ref, from)) ?? ref}${size}`)
    else if (key === 'style') next = await style(ctx, value, from)
    return next === null ? whole : `${space}${name}="${next.replace(/"/g, '&quot;')}"`
  })
}

/** A page of the folder put together: its links to other pages stay as they are, for the browser to follow. @param {Context} ctx @param {string} html @param {string} from */
async function page(ctx, html, from) {
  const tags = /<!--[\s\S]*?-->|<(script|style|textarea|title)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<([a-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
  const body = await replace(html, tags, async (whole, raw, rawAttributes, inner, tag, rest) => {
    const kind = (raw ?? '').toLowerCase()
    if (kind === 'style') return `<style${rawAttributes}>${await style(ctx, inner, from)}</style>`
    if (kind === 'script') {
      const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(rawAttributes)?.[1].toLowerCase() ?? ''
      const src = /\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(rawAttributes)?.[1].replace(/^["']|["']$/g, '')
      if (type && type !== 'module' && !/javascript|ecmascript/.test(type)) return whole
      const path = src === undefined ? null : inFolder(src, from)
      if (path === null) return src === undefined ? `<script${rawAttributes}>${await code(ctx, inner, from, type === 'module')}</script>` : whole
      const bytes = await bytesOf(ctx, path)
      if (!bytes) return whole
      const source = await code(ctx, decoder.decode(bytes), path, type === 'module')
      return `<script${rawAttributes.replace(/\sintegrity\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '').replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` src="${dataURL('text/javascript', encoder.encode(source))}"`)}></script>`
    }
    if (!tag) return whole
    const rel = /\srel\s*=\s*["']?([^"'>]*)/i.exec(rest)?.[1] ?? ''
    const href = /\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(rest)?.[1].replace(/^["']|["']$/g, '')
    if (tag.toLowerCase() === 'link' && /\bstylesheet\b/i.test(rel) && href !== undefined) {
      const path = inFolder(href, from)
      const bytes = path === null ? null : await bytesOf(ctx, path)
      const media = /\smedia\s*=\s*("[^"]*"|'[^']*')/i.exec(rest)?.[0] ?? ''
      if (bytes && path !== null) return `<style${media}>${await style(ctx, decoder.decode(bytes), path)}</style>`
    }
    return `<${tag}${await attributes(ctx, tag, rest, from)}>`
  })
  const head = [
    ctx.modules.size ? `<script type="importmap">${JSON.stringify({ imports: Object.fromEntries([...ctx.modules].filter(([, url]) => url)) })}</script>` : '',
    // Its fetch() finds the data files its scripts name, resolved from the page as a browser would.
    Object.keys(ctx.data).length ? `<script>(() => { const files = ${JSON.stringify(ctx.data).replace(/</g, '\\u003c')}, base = ${JSON.stringify(address(from))}, own = window.fetch.bind(window)
      window.fetch = (input, init) => { try { const url = new URL(input instanceof Request ? input.url : String(input), base), file = url.origin === new URL(base).origin && files[decodeURIComponent(url.pathname.slice(1))]
        if (file) return Promise.resolve(new Response(Uint8Array.from(atob(file.split(',')[1]), (c) => c.charCodeAt(0)), { headers: { 'content-type': file.slice(5, file.indexOf(';')) } })) } catch {} return own(input, init) } })()</script>` : '',
  ]
  return head.join('') + body
}

/** A page of a few words of Jean's, for what isn't a page: a picture, a film, a text, a folder. @param {string} title @param {string} inner */
const plain = (title, inner) => `<meta charset="utf-8"><title>${escape(title)}</title>
<style>body { margin: 0; padding: 1.5rem; font: 1rem/1.5 system-ui, sans-serif; } img, video { display: block; max-inline-size: 100%; margin: auto; } pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; } li { margin-block: 0.25rem; }</style>${inner}`

/**
 * What a path of the folder shows (D156): a page put together, a picture, a sound, a film or a text
 * as itself, a folder as its index.html or the list of what it holds.
 * @param {FS} fs @param {string} path @param {string} [name] the folder's, for the list of its top
 * @returns {Promise<Shown>}
 */
export async function sitePage(fs, path, name = '') {
  const clean = path.replace(/^\/+/, '')
  if (clean.split('/').some((part) => part.startsWith('.'))) return { note: 'missing' }
  const stamp = clean && !clean.endsWith('/') ? await fs.stat?.(clean).catch(() => null) : null
  if (!stamp) {
    const dir = clean.replace(/\/+$/, '')
    if (dir && !(await fs.exists(dir))) return { note: 'missing' }
    const at = dir ? `${dir}/` : ''
    if (await fs.stat?.(`${at}index.html`).catch(() => null)) return sitePage(fs, `${at}index.html`, name)
    const { entries } = await walkFolder(fs, dir, 1)
    const items = entries.filter((entry) => !entry.path.split('/').at(-1)?.startsWith('.')).map((entry) => {
      const label = `${entry.path.split('/').at(-1)}${entry.kind === 'directory' ? '/' : ''}`
      return `<li><a href="${escape(label.split('/').map(encodeURIComponent).join('/'))}" dir="auto">${escape(label)}</a></li>`
    })
    return { html: plain(dir || name, `<h1 dir="auto">${escape(dir.split('/').at(-1) || name)}</h1><ul>${dir ? '<li><a href="../">..</a></li>' : ''}${items.join('')}</ul>`), path: at, files: {} }
  }
  /** @type {Context} */
  const ctx = { fs, page: clean, files: {}, modules: new Map(), data: {} }
  const bytes = await bytesOf(ctx, clean)
  const type = typeOf(clean)
  const file = clean.split('/').at(-1) ?? clean
  if (!bytes) return { note: 'unshown' }
  if (type === 'text/html') return { html: await page(ctx, decoder.decode(bytes), clean), path: clean, files: ctx.files }
  const media = /^(image|video|audio)\//.exec(type)?.[1]
  const inner = media === 'image' ? `<img src="${dataURL(type, bytes)}" alt="${escape(file)}">`
    : media ? `<${media} src="${dataURL(type, bytes)}" controls></${media}>`
    : /^text\/|json|xml/.test(type) ? `<pre dir="auto">${escape(decoder.decode(bytes))}</pre>` : null
  return inner === null ? { note: 'unshown' } : { html: plain(file, inner), path: clean, files: ctx.files }
}
