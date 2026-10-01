// Static import graph and index.html parsing, shared by budgets, manifest and vendor.
// Pure functions only (tested in test/manifest.test.js).

const BASE = 'https://app.invalid/'

const STATIC_IMPORT = new RegExp(
  String.raw`(?:^|[;\n}]|\*\/)\s*` +
  String.raw`(?:import\b\s*(?:[\w$*{][^;'"\x60]*?\bfrom\s*)?` +
  String.raw`|export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)` +
  String.raw`(['"])([^'"\n]+)\1`,
  'g',
)

/**
 * Specifiers of static imports and re-exports, in source order. Dynamic
 * `import()` and `import.meta` are ignored, as are imports in comments.
 * @param {string} source
 */
export function extractStaticImports (source) {
  return [...source.matchAll(STATIC_IMPORT)].map((m) => m[2])
}

/** @param {string} html */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '')

/**
 * @param {string} html
 * @returns {{ imports: Record<string, string> }}
 */
export function parseImportMap (html) {
  const match = stripComments(html).match(/<script\b[^>]*\btype\s*=\s*["']?importmap\b[^>]*>([\s\S]*?)<\/script>/i)
  if (!match) return { imports: {} }
  return { imports: JSON.parse(match[1]).imports ?? {} }
}

/** @param {URL} url */
function toPath (url) {
  return url.origin === new URL(BASE).origin ? decodeURIComponent(url.pathname.slice(1)) : null
}

/**
 * Resolves a module specifier to a root-relative path, or null if unknown.
 * Bare specifiers go through the import map (exact match first, then the
 * longest matching `prefix/`); map targets resolve against index.html.
 * @param {string} specifier
 * @param {string} from  root-relative path of the importing file
 * @param {{ imports: Record<string, string> }} importMap
 */
export function resolveSpecifier (specifier, from, importMap = { imports: {} }) {
  const { imports } = importMap
  if (Object.hasOwn(imports, specifier)) return toPath(new URL(imports[specifier], BASE))
  const prefix = Object.keys(imports)
    .filter((key) => key.endsWith('/') && specifier.startsWith(key))
    .sort((a, b) => b.length - a.length)[0]
  if (prefix) return toPath(new URL(imports[prefix] + specifier.slice(prefix.length), BASE))
  if (/^\.{0,2}\//.test(specifier)) return toPath(new URL(specifier, BASE + from))
  return null
}

/**
 * @param {string} tag
 * @param {string} name
 */
function attribute (tag, name) {
  const match = tag.match(new RegExp(String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`, 'i'))
  return match ? (match[1] ?? match[2] ?? match[3]) : null
}

/**
 * Root-relative paths of `<link rel="stylesheet">` in index.html.
 * @param {string} html
 */
export function linkedStylesheets (html) {
  const paths = []
  for (const [tag] of stripComments(html).matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    const href = attribute(tag, 'href')
    const path = href && rel.includes('stylesheet') ? toPath(new URL(href, `${BASE}index.html`)) : null
    if (path) paths.push(path)
  }
  return paths
}


/**
 * Walks static imports from `entry` (or several entries), breadth first.
 * `read` returns a file's text, or null if missing.
 * @param {string | string[]} entry
 * @param {{ imports: Record<string, string> }} importMap
 * @param {(path: string) => Promise<string | null>} read
 */
export async function moduleGraph (entry, importMap, read) {
  const queue = [...new Set([entry].flat())]
  const seen = new Set(queue)
  const found = []
  const problems = []
  while (queue.length) {
    const path = /** @type {string} */ (queue.shift())
    const source = await read(path)
    if (source === null) {
      problems.push(`missing ${path}`)
      continue
    }
    found.push(path)
    for (const specifier of extractStaticImports(source)) {
      const target = resolveSpecifier(specifier, path, importMap)
      if (target === null) {
        problems.push(`cannot resolve '${specifier}' from ${path}`)
      } else if (!seen.has(target)) {
        seen.add(target)
        queue.push(target)
      }
    }
  }
  return { found, problems }
}
