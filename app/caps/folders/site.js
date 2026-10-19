// A folder's pages, for the browser (D156): a page of the conversation's folder put together as one
// document, the way a site's server would serve it, for a frame that can't load anything itself. A
// page's own scripts run only in an opaque origin, which no service worker serves, so what the page
// uses from the folder goes in with it: style sheets as <style>, scripts, pictures, sounds and fonts
// as data: addresses, modules through an import map of data: addresses (their imports first made
// absolute), and the data files its scripts name, which its fetch() then finds. "/" is the top of the
// page's project, where its package.json is, as its dev server would serve it; else the folder's. Code
// a browser can't run as it is, made for a build (JSX, TypeScript, a style sheet imported, a package
// by its name), is noted, so the browser says so in the page's place. Never a hidden file
// (a name starting with a dot) or one outside the folder. A folder shows its index.html, or what it
// holds, which the browser draws itself; any other file goes to the browser as it is, which shows it
// as the preview does (D190). No DOM: node tests run it.
import { walkFolder } from './work.js'

/** The made-up site a page's addresses are resolved in, never fetched. */
export const SITE = 'https://folder.invalid/'
const MAX_BYTES = 20 * 1024 * 1024
const TYPES = /** @type {Record<string, string>} */ ({
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', geojson: 'application/json',
  xml: 'application/xml', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', tsv: 'text/tab-separated-values', yml: 'text/plain', yaml: 'text/plain',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  apng: 'image/apng', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif', jxl: 'image/jxl',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg', mkv: 'video/x-matroska', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', weba: 'audio/webm',
  flac: 'audio/flac', aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf', mid: 'audio/midi', midi: 'audio/midi', kar: 'audio/midi', rmi: 'audio/midi',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
})
// Files a script may fetch: data, not pages or code.
const DATA = /\.(json|geojson|csv|tsv|txt|md|xml|ya?ml|svg)$/i
// What only a build turns into a page: code browsers don't run, and style sheets imported as modules.
const BUILT = /\.(jsx|tsx|[mc]?ts|vue|svelte|css|s[ac]ss|less)$/i
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** @typedef {import('../../core/types.js').FS} FS */
/** @typedef {{ fs: FS, page: string, root: string, files: Record<string, string>, modules: Map<string, string>, data: Record<string, string>, mapped: boolean, build?: string }} Context */
/**
 * What a folder's address shows: a page put together, with the first file of it that needs a build;
 * a file that isn't a page, with its media type, as the preview shows it; or a folder's name and what
 * it holds (D190). With the path its links are resolved from and the files it was made of, by size
 * and date. Or why it can't show (a file too big).
 * @typedef {({ html: string, build?: string } | { file: Uint8Array, type: string } | { title: string, list: { name: string, folder: boolean }[] }) & { path: string, files: Record<string, string> } | { note: 'missing' | 'unshown' }} Shown
 */

const typeOf = (/** @type {string} */ path) => TYPES[/\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? ''] ?? 'application/octet-stream'
const address = (/** @type {string} */ path) => SITE + path.split('/').map(encodeURIComponent).join('/')

/** @param {Uint8Array} bytes */
function base64(bytes) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
export const dataURL = (/** @type {string} */ type, /** @type {Uint8Array} */ bytes) => `data:${type};base64,${base64(bytes)}`

/**
 * A reference in a file of the folder, as the path of the file it names: null for another site, a
 * data address, a place in the page (#…), a hidden file. "/" is `root`, the folder's top by default.
 * @param {string} ref @param {string} from the path of the file it is in @param {string} [root] a folder's path, ending with /
 */
export function inFolder(ref, from, root = '') {
  const text = ref.trim().replace(/&amp;/g, '&')
  if (!text || /^([a-z][\w+.-]*:|\/\/|#)/i.test(text)) return null
  try {
    const top = text.startsWith('/')
    const path = decodeURIComponent(new URL(top ? text.slice(1) : text, address(top ? root : from)).pathname.slice(1))
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
  const path = inFolder(ref, from, ctx.root)
  const bytes = path === null ? null : await bytesOf(ctx, path)
  return bytes && path !== null ? dataURL(typeOf(path), bytes) : null
}

/** A style sheet with what it uses inside it: the sheets it imports, then pictures and fonts. @param {Context} ctx @param {string} css @param {string} from @param {number} [depth] */
async function style(ctx, css, from, depth = 0) {
  const imported = await replace(css, /@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1\s*\)?([^;]*);/gi, async (whole, _, ref, media) => {
    const path = depth < 8 ? inFolder(ref, from, ctx.root) : null
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
    const path = /^\.{0,2}\//.test(spec) ? inFolder(spec, from, ctx.root) : null
    // A package by its name, with no import map of the page's; a file without its ending, or one of BUILT's.
    if (/^(\.{0,2}\/|[a-z][\w+.-]*:)/i.test(spec) ? path !== null && (BUILT.test(path) || !/\.\w+$/.test(path)) : !ctx.mapped) ctx.build ??= from
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
    if (kind === 'style') return /* html */ `<style${rawAttributes}>${await style(ctx, inner, from)}</style>`
    if (kind === 'script') {
      const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(rawAttributes)?.[1].toLowerCase() ?? ''
      const src = /\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(rawAttributes)?.[1].replace(/^["']|["']$/g, '')
      if (type && type !== 'module' && !/javascript|ecmascript/.test(type)) return whole
      const path = src === undefined ? null : inFolder(src, from, ctx.root)
      if (path !== null && BUILT.test(path)) ctx.build ??= path
      if (path === null) return src === undefined ? /* html */ `<script${rawAttributes}>${await code(ctx, inner, from, type === 'module')}</script>` : whole
      const bytes = await bytesOf(ctx, path)
      if (!bytes) return whole
      const source = await code(ctx, decoder.decode(bytes), path, type === 'module')
      return /* html */ `<script${rawAttributes.replace(/\sintegrity\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '').replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` src="${dataURL('text/javascript', encoder.encode(source))}"`)}></script>`
    }
    if (!tag) return whole
    const rel = /\srel\s*=\s*["']?([^"'>]*)/i.exec(rest)?.[1] ?? ''
    const href = /\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(rest)?.[1].replace(/^["']|["']$/g, '')
    if (tag.toLowerCase() === 'link' && /\bstylesheet\b/i.test(rel) && href !== undefined) {
      const path = inFolder(href, from, ctx.root)
      const bytes = path === null ? null : await bytesOf(ctx, path)
      const media = /\smedia\s*=\s*("[^"]*"|'[^']*')/i.exec(rest)?.[0] ?? ''
      if (bytes && path !== null) return /* html */ `<style${media}>${await style(ctx, decoder.decode(bytes), path)}</style>`
    }
    return /* html */ `<${tag}${await attributes(ctx, tag, rest, from)}>`
  })
  const head = [
    ctx.modules.size ? /* html */ `<script type="importmap">${JSON.stringify({ imports: Object.fromEntries([...ctx.modules].filter(([, url]) => url)) })}</script>` : '',
    // Its fetch() finds the data files its scripts name, resolved from the page as a browser would.
    Object.keys(ctx.data).length ? /* html */ `<script>(() => { const files = ${JSON.stringify(ctx.data).replace(/</g, '\\u003c')}, base = ${JSON.stringify(address(from))}, own = window.fetch.bind(window)
      window.fetch = (input, init) => { try { const url = new URL(input instanceof Request ? input.url : String(input), base), file = url.origin === new URL(base).origin && files[decodeURIComponent(url.pathname.slice(1))]
        if (file) return Promise.resolve(new Response(Uint8Array.from(atob(file.split(',')[1]), (c) => c.charCodeAt(0)), { headers: { 'content-type': file.slice(5, file.indexOf(';')) } })) } catch {} return own(input, init) } })()</script>` : '',
  ]
  return head.join('') + body
}

/**
 * What a path of the folder shows (D156): a page put together, a folder as its index.html or the
 * list of what it holds, any other file as it is, for the browser to show as the preview does (D190).
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
    const list = entries.flatMap((entry) => {
      const last = entry.path.split('/').at(-1) ?? ''
      return last.startsWith('.') ? [] : [{ name: last, folder: entry.kind === 'directory' }]
    })
    return { title: dir.split('/').at(-1) || name, list, path: at, files: {} }
  }
  /** @type {Context} */
  const ctx = { fs, page: clean, root: '', files: {}, modules: new Map(), data: {}, mapped: false }
  const bytes = await bytesOf(ctx, clean)
  const type = typeOf(clean)
  if (!bytes) return { note: 'unshown' }
  if (type !== 'text/html') return { file: bytes, type, path: clean, files: ctx.files }
  // Its project's top: the nearest folder up that holds a package.json.
  for (const dir of clean.split('/').slice(0, -1).map((_, n, all) => `${all.slice(0, all.length - n).join('/')}/`)) {
    if (!ctx.root && (await fs.stat?.(`${dir}package.json`).catch(() => null))) ctx.root = dir
  }
  const source = decoder.decode(bytes)
  ctx.mapped = /<script\b[^>]*\btype\s*=\s*["']?importmap/i.test(source)
  const html = await page(ctx, source, clean)
  return { html, ...(ctx.build ? { build: ctx.build } : {}), path: clean, files: ctx.files }
}
