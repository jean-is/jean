// The security rules AGENTS.md writes down, checked in the code rather than left to a review (D679): `npm run security`,
// and test/security.test.js in `npm test`, so that going against one fails CI. Reads every module of Jean's, its services and
// its scripts; what a rule allows on purpose is listed here with the reason. A second pass looks through every tracked file
// for what a secret looks like. CodeQL (.github/workflows/codeql.yml) looks further, at what flows where.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Each rule's allowed places, a path relative to the repository's root and why. A rule is its name; a place that stops
 * needing its exception fails too, so that the list stays true.
 * @type {Record<string, Record<string, string>>}
 */
export const ALLOWED = {
  storage: {
    'app/ui/storage-worker.js': 'the one place that opens OPFS, sealing what it writes (D371)',
    'app/ui/opfs.js': 'only asks whether OPFS exists, before starting that worker',
  },
  'trusted-types': { 'app/ui/trusted.js': 'app-urls, the one policy of Jean\'s own (lit-html brings the other)' },
  'weak-random': { 'app/caps/connections/apis.js': 'the spread of a retry\'s wait, which guards nothing' },
  'html-sink': {
    'app/ui/view.js': 'srcdoc is RELAY, a constant of Jean\'s, in a frame with no allow-same-origin',
    'app/caps/interactive/interactive.js': 'srcdoc is RELAY, a constant of Jean\'s, in a frame with no allow-same-origin',
  },
  'message-unchecked': {
    'app/caps/extensions/extensions.js': 'hear: source === frame.contentWindow',
    'app/caps/games/frame.js': 'heard: source checked against its frame',
    'app/caps/interactive/interactive.js': 'heard: source !== frame.contentWindow returns',
  },
  'blank-target': { 'app/ui/composer.js': 'the site\'s own privacy policy and terms; browsers open such a link without an opener anyway' },
}

/** @typedef {{ rule: string, path: string, line: number, text: string }} Finding */

/**
 * A module with its comments and regular expressions blanked, and what its strings and templates hold too unless `strings`: what
 * is left is code, on the same lines, so a rule never reads a word in a sentence as a call. No parser: a regular expression right
 * after `)`, or a division that starts a line, can blank the rest of that line, which CodeQL still reads. @param {string} text @param {boolean} [strings]
 */
export function codeOf(text, strings = false) {
  let out = ''
  let i = 0
  let depth = 0
  /** How deep each template's `${` opened. @type {number[]} */
  const open = []
  const blank = (/** @type {number} */ to) => { out += text.slice(i, to).replace(/[^\n]/g, ' '); i = to }
  const hold = (/** @type {number} */ to) => { if (strings) { out += text.slice(i, to); i = to } else blank(to) }
  /** A template's text from i to the end of it or its next `${`. */
  const template = () => {
    let at = i
    while (at < text.length && text[at] !== '`' && !(text[at] === '$' && text[at + 1] === '{')) at += text[at] === '\\' ? 2 : 1
    hold(at)
    if (text[i] === '`') { out += '`'; i++ } else { out += '${'; i += 2; open.push(depth) }
  }
  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '/' && next === '/') { const end = text.indexOf('\n', i); blank(end < 0 ? text.length : end) }
    else if (char === '/' && next === '*') { const end = text.indexOf('*/', i + 2); blank(end < 0 ? text.length : end + 2) }
    else if (char === '"' || char === "'") {
      let at = i + 1
      while (at < text.length && text[at] !== char && text[at] !== '\n') at += text[at] === '\\' ? 2 : 1
      out += char
      i++
      hold(at)
      if (text[i] === char) { out += char; i++ }
    } else if (char === '`') { out += char; i++; template() }
    else if (char === '}' && open.at(-1) === depth) { open.pop(); out += char; i++; template() }
    else if (char === '/' && /(?:^|[(,=:[!&|?{};\n>]|\b(?:return|typeof|case|void|throw|of|in|await|yield))\s*$/.test(out.slice(-12))) {
      let at = i + 1
      for (let inClass = false; at < text.length && text[at] !== '\n' && (inClass || text[at] !== '/'); at += text[at] === '\\' ? 2 : 1) inClass = text[at] === '[' ? true : text[at] === ']' ? false : inClass
      blank(at + 1)
    } else {
      if (char === '{') depth++
      if (char === '}') depth--
      out += char
      i++
    }
  }
  return out
}

/** Paths where randomness guards something. */
const GUARDED = /^(app\/ee\/|app\/ui\/(seal|secrets|storage-worker)\.js|app\/caps\/(share|lock|connections|signin|receipt)\/|app\/core\/oauth\.js|host\/|requests\/|gateway\/)/

/**
 * What a module does against the rules, each a pattern on its code, or on its code with its strings where a string is what's wrong.
 * @type {{ rule: string, code?: RegExp, strings?: RegExp, where?: RegExp, unless?: RegExp, within?: number }[]}
 */
const RULES = [
  { rule: 'eval', code: /(?<![\w$])eval\s*[()]/g },
  { rule: 'eval', code: /(?<![\w$])Function\s*\(/g },
  { rule: 'eval', strings: /\b(?:setTimeout|setInterval)\s*\(\s*['"`]/g },
  { rule: 'html-sink', code: /\.(?:innerHTML|outerHTML|srcdoc)\s*\+?=(?!=)/g },
  { rule: 'html-sink', strings: /\[\s*['"](?:innerHTML|outerHTML|srcdoc)['"]\s*\]\s*\+?=(?!=)|\bsetAttribute\(\s*['"](?:srcdoc)['"]|\bsrcdoc=\$\{/g },
  { rule: 'html-sink', code: /\b(?:unsafeHTML|setHTMLUnsafe|createContextualFragment)\b/g },
  { rule: 'html-sink', code: /\binsertAdjacentHTML\s*\(/g },
  { rule: 'html-sink', code: /\bdocument\.write(?:ln)?\s*\(/g },
  { rule: 'storage', code: /\bnavigator\.storage\??\.getDirectory\b/g },
  { rule: 'trusted-types', code: /\btrustedTypes\??\.createPolicy\b/g },
  { rule: 'weak-random', code: /\bMath\.random\s*\(/g, where: GUARDED },
  // Frames of Jean's are opaque origins, which only '*' reaches; a window that may hold another site gets nothing that way.
  { rule: 'post-to-any', strings: /\b(?:opener|top)\.postMessage\([^;\n]*,\s*['"]\*['"]/g },
  { rule: 'fixed-address', strings: /\bfetch\(\s*['"`]https?:\/\/(?!localhost|127\.0\.0\.1)/g, where: /^app\/(core|ui|caps|ee)\// },
  { rule: 'message-unchecked', code: /(?<![\w$.])(?:window\.|self\.|globalThis\.)?onmessage\s*=(?!=)/g, where: /^(?!.*-worker\.js$)(?!.*-worklet\.js$)/ },
  { rule: 'message-unchecked', strings: /\b(?:window\.|self\.)?addEventListener\(\s*['"]message['"]/g, unless: /\bsource\b|\.origin\b/, within: 400 },
  { rule: 'sandbox', strings: /\bsandbox\b[^>\n]*\ballow-scripts\b[^>\n]*\ballow-same-origin\b|\bsandbox\b[^>\n]*\ballow-same-origin\b[^>\n]*\ballow-scripts\b/g },
  { rule: 'blank-target', strings: /target=["']?_blank["']?(?![^>\n]*rel=["'][^"'\n]*noopener)/g },
  { rule: 'tls-off', code: /\b(?:rejectUnauthorized|strictSSL)\s*:\s*false\b/g },
  { rule: 'tls-off', strings: /NODE_TLS_REJECT_UNAUTHORIZED/g },
]

/**
 * What one module does against the rules. @param {string} path relative to the root @param {string} text
 * @returns {Finding[]}
 */
export function scan(path, text) {
  const views = { code: codeOf(text), strings: codeOf(text, true) }
  return RULES.flatMap((rule) => {
    if (rule.where && !rule.where.test(path)) return []
    const view = rule.code ? views.code : views.strings
    return [.../** @type {string} */ (view).matchAll(/** @type {RegExp} */ (rule.code ?? rule.strings))]
      .filter((match) => !rule.unless?.test(view.slice(match.index, match.index + (rule.within ?? 0))))
      .map((match) => ({ rule: rule.rule, path, line: view.slice(0, match.index).split('\n').length, text: text.split('\n')[view.slice(0, match.index).split('\n').length - 1].trim().slice(0, 120) }))
  })
}

/** Modules that are code of Jean's, its services' or its build's, not third party's. @returns {string[]} */
export function modules() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.js', '*.mjs'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')
    .filter((path) => path && /^(app|gateway|host|requests|cli|scripts|deploy)\//.test(path) && !/^app\/vendor\//.test(path))
}

/** What a secret looks like: never in a tracked file. */
export const SECRET = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_\w{40,}\b|\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{40,}\b|\bxox[abprs]-[A-Za-z0-9-]{20,}\b|\bAIza[\w-]{35}\b/

/** Tracked files that hold a secret's shape on purpose, and why. */
export const NOT_SECRETS = /** @type {Record<string, string>} */ ({
  'scripts/security.js': 'the shape itself, in its comment and pattern',
  'test/security.test.js': 'the shape itself, to see it found',
  'test/ee-dlp.test.js': 'fake keys, to see them found',
  'test/llm.test.js': 'a key made for the test, its header written around it',
  'test/talk.spec.js': 'a key made for the test, its header written around it',
  'test/vertex.test.js': 'a key made for the test, its header written around it',
})

/** Files a secret could be in: every tracked text file but third-party ones and built data. @returns {string[]} */
const tracked = () => execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')
  .filter((path) => path && !/^(app\/vendor|spikes|dist)\/|\.(png|jpe?g|webp|woff2?|ttf|wasm|xlsx|zip|ico|icns|onnx|bin|sf3|pdf|docx|pptx|mp3|mp4|wav)$|package-lock\.json$/i.test(path))

/** A workflow's actions as anything but a commit, which is all that can't move under a run. @param {string} path @param {string} text @returns {Finding[]} */
export const unpinned = (path, text) => text.split('\n').flatMap((line, i) => (/^\s*-?\s*uses:\s*(?!\.\/)[^#\s]+@(?![0-9a-f]{40}\b)/.test(line) ? [{ rule: 'unpinned-action', path, line: i + 1, text: line.trim() }] : []))

/** @returns {{ findings: Finding[], stale: string[] }} what goes against a rule, and exceptions that no longer need to be */
export function audit() {
  /** @type {Finding[]} */
  const all = []
  for (const path of tracked().filter((one) => /^\.github\/workflows\//.test(one))) all.push(...unpinned(path, readFileSync(join(ROOT, path), 'utf8')))
  for (const path of modules()) all.push(...scan(path, readFileSync(join(ROOT, path), 'utf8')))
  for (const path of tracked()) {
    if (NOT_SECRETS[path]) continue
    let text = ''
    try { text = readFileSync(join(ROOT, path), 'utf8') } catch { continue }
    const lines = SECRET.test(text) ? text.split('\n') : []
    lines.forEach((line, i) => { if (SECRET.test(line)) all.push({ rule: 'secret', path, line: i + 1, text: line.slice(0, 60) }) })
  }
  const findings = all.filter(({ rule, path }) => !ALLOWED[rule]?.[path])
  const used = new Set(all.map(({ rule, path }) => `${rule} ${path}`))
  const stale = Object.entries(ALLOWED).flatMap(([rule, places]) => Object.keys(places).filter((path) => !used.has(`${rule} ${path}`)).map((path) => `${rule} ${path}`))
  return { findings, stale }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { findings, stale } = audit()
  for (const { rule, path, line, text } of findings) console.log(`${path}:${line} ${rule}: ${text}`)
  for (const one of stale) console.log(`no longer needed in scripts/security.js: ${one}`)
  console.log(findings.length || stale.length ? `${findings.length + stale.length} to look at.` : 'Every security rule holds.')
  process.exit(findings.length || stale.length ? 1 : 0)
}
