// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// Masked requests (D681): what policy's `dlp.mask` hides goes to a brain in the cloud as marks, found on the device, and
// comes back real. Only the wire changes: records, tools, files, memory and approvals keep real values, so the one hook sits
// innermost, at the edge, as a generator, which fire() can't pass over: anything failing before the request fails the step.
// Every text is read as a person reads it, decoded and folded, each character keeping its place in the original, so that
// `Herm%C3%A8s`, `HERMÈS` and `Marie\u00a0Dupont` are the values they are. Masked isn't anonymous: context can still say who,
// and what nothing finds goes as it is. Host-agnostic.
import { finder, leaves, OUT, PLACES, SENT } from './detect.js'
import { partsOf } from './names.js'

const PLACEHOLDER = /⟦\s*([A-Z])([0-9a-f]{6,})\s*⟧/g
// A brain may drop the brackets, or write others: a known id is known without them, sparse as ids are, and any other stays as it is.
const REVEALED = /⟦\s*([A-Z])([0-9a-f]{6,})\s*⟧|(?<![\p{L}\p{N}])([A-Z])([0-9a-f]{6,})(?![\p{L}\p{N}])/gu
// Where a mark may have begun at the end of what came so far: waited for, so that it comes back whole.
const OPENING = /(?:⟦[^⟧\n]{0,40}|(?<![\p{L}\p{N}])[A-Z][0-9a-f]{0,15})$/u
// Whatever a source holds between these brackets is hidden too, so a file can't forge one.
const BRACKETED = /⟦[^⟦⟧\r\n]{0,40}⟧/g
const LETTERS = /** @type {Record<string, string>} */ ({ person: 'P', organisation: 'O', place: 'L', email: 'E', phone: 'T', id: 'I', word: 'W', forged: 'X', cut: 'C' })
// Forged marks and parts of values go back where they stood, but aren't looked for anywhere else.
const UNSEARCHED = ['X', 'C']
const RULE = 'Marks like ⟦P7f3a9c⟧ stand for real names and details that the person sees in full. Copy them exactly, in code too; never guess at them or ask what they are.'
const UNSAFE = 'A mark stands where its value could run as code, or end the text it is in. Put it in a plain quoted string, or read it from a file, and try again.'
// Letters of a script the names model wasn't measured on, which finds next to nothing there: one is enough, as a French contract can hold an Arabic name. A Greek letter alone is a symbol.
const OTHER_SCRIPT = /(?![\p{Script=Latin}\p{Script=Greek}\p{Script=Common}\p{Script=Inherited}])\p{L}|\p{Script=Greek}{2,}/u
// What of a system prompt is Jean's own: its tools' lines read like sentences, and `save_name: Save the first name` isn't anyone's name.
const JEANS_OWN = /<(tools|rules|language|context)>[\s\S]*?<\/\1>/g
// The key on a call whose marks couldn't be made real: tool.check refuses it, saying why.
const UNREVEALED = '__unrevealed'

const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){0,7}\.\p{L}{2,24}(?![\p{L}\p{N}])/gu
const PHONE = /(?<![\p{L}\p{N}.,+])(?:(?:\+|00)\d{1,3}[ .\u00a0/-]?(?:\(\d{1,4}\)[ .\u00a0/-]?)?\d(?:[ .\u00a0/-]?\d){5,13}|(?!\d{2}[./]\d{2}[./]\d{2,4}(?![./]?\d))0\d(?:[ .\u00a0/-]?\d{2}){4}|0\d{1,3}[ ./-]\d{3,4}[ ./-]\d{3,4}|\(\d{3}\)[ .\u00a0-]?\d{3}[ .-]\d{4}|\d{3}[-.]\d{3}[-.]\d{4})(?![\p{L}\p{N}])/gu
/** A phone by its shape, and a number with a country's prefix by its length: `+1 250 000` is an amount. @param {string} found */
const isPhone = (found) => !/^(?:\+|00)/.test(found) || found.replace(/\D/g, '').length >= 9
/** What `hide` can ask for, and what holds of what it finds. @type {Record<string, [RegExp, (found: string) => boolean]>} */
const HIDDEN = { email: [EMAIL, () => true], phone: [PHONE, isPhone] }

// Titles, guards, summaries and answer-now slice before the hook, so a number can arrive cut, its key gone.
const CUT_ENDS = /** @type {Record<string, RegExp>} */ ({
  card: /(?<![\d.,])[2-6]\d{3}(?:[ \u00a0-]?\d{3,4}){2,3}(?:[ \u00a0-]?\d{1,4})?$/,
  iban: /\b[A-Z]{2}\d{2}(?:[ \u00a0-]?[A-Z0-9]{4}){3,6}(?:[ \u00a0-]?[A-Z0-9]{1,3})?$/,
})
const CUT_START = /^\d{1,4}(?:[ \u00a0-]\d{4}){2,3}(?:[ \u00a0-]?\d{1,4})?(?=\s|$)/
const SHORTEST_CUT = 4
const CUT_LOOK = 64
// What may follow a cut, or come before one: `Marie Dup…`.
const AROUND_A_CUT = /[\s…]/u

// ─── Reading a text as a person does ──────────────────────────────────────────

const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ')
const ENTITIES = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ...LATIN1.map((name, i) => /** @type {[string, string]} */ ([name, String.fromCharCode(0xa0 + i)]))])
// A `+` is a space only where an address's query says so: elsewhere it is the sum it looks like.
const ENCODED = /%[0-9a-f]{2}(?:%[0-9a-f]{2})*|\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\[nrt'"`$\\/]|'\\''|&(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,7});|(?<=[?&][^\s=&#]{0,64}=[^\s&#]{0,2048})\+/gi
const ESCAPES = /** @type {Record<string, string>} */ ({ n: '\n', r: '\r', t: '\t' })
// The zero of each set of digits people write in: each is ten in a row, so that a digit is its place from its zero.
const ZEROS = [0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xed0, 0xf20, 0x1040, 0x17e0, 0x1810, 0xff10]
const OTHER_DIGITS = new RegExp(`[${ZEROS.map((zero) => `\\u${zero.toString(16).padStart(4, '0')}-\\u${(zero + 9).toString(16).padStart(4, '0')}`).join('')}]`, 'g')
const digit = (/** @type {string} */ char) => String(char.charCodeAt(0) - /** @type {number} */ (ZEROS.find((zero) => char.charCodeAt(0) >= zero && char.charCodeAt(0) <= zero + 9)))
const utf8 = new TextDecoder('utf-8', { fatal: true })

/** What one encoded run says. @param {string} run */
function decodedRun(run) {
  if (run === '+') return ' '
  if (run[0] === '%') {
    const bytes = Uint8Array.from(run.slice(1).split('%'), (part) => Number.parseInt(part, 16))
    try { return utf8.decode(bytes) } catch { return String.fromCharCode(...bytes) }
  }
  if (run === "'\\''") return "'"
  if (run[0] === '\\') {
    if (run[1] === 'u' || run[1] === 'x') return String.fromCharCode(Number.parseInt(run.slice(2), 16))
    return ESCAPES[run[1]] ?? run[1]
  }
  if (run[1] === '#') {
    const code = run[2].toLowerCase() === 'x' ? Number.parseInt(run.slice(3, -1), 16) : Number(run.slice(2, -1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : run
  }
  return ENTITIES.get(run.slice(1, -1)) ?? run
}

/**
 * A text decoded, all digits made plain, each unit keeping where it came from. Never longer than the text.
 * @param {string} text @returns {{ plain: string, from: Int32Array | null, to: Int32Array | null }}
 */
function decode(text) {
  const runs = /[%\\&'+]/.test(text) ? [...text.matchAll(ENCODED)] : []
  if (!runs.length) return { plain: text.replace(OTHER_DIGITS, digit), from: null, to: null }
  const from = new Int32Array(text.length + 1)
  const to = new Int32Array(text.length + 1)
  let [plain, at] = ['', 0]
  const copy = (/** @type {string} */ part, /** @type {number} */ start, /** @type {number} */ end, /** @type {boolean} */ whole) => {
    for (let i = 0; i < part.length; i++) {
      from[plain.length + i] = whole ? start : start + i
      to[plain.length + i] = whole ? end : start + i + 1
    }
    plain += part
  }
  for (const run of runs) {
    copy(text.slice(at, run.index), at, run.index, false)
    copy(decodedRun(run[0]), run.index, run.index + run[0].length, true)
    at = run.index + run[0].length
  }
  copy(text.slice(at), at, text.length, false)
  return { plain: plain.replace(OTHER_DIGITS, digit), from, to }
}

const NO_DECOMPOSING = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const ARABIC_LIKE = /** @type {Record<string, string>} */ ({ 'ى': 'ي', 'ی': 'ي', 'ک': 'ك', 'ة': 'ه' })
/** @type {Map<string, string>} */
const folds = new Map()
/** One character as a person would take it to be the same: case and accents gone, every space or hyphen one space, an apostrophe an apostrophe. @param {string} char */
function foldChar(char) {
  const code = char.charCodeAt(0)
  if (code < 128) {
    if (code >= 65 && code <= 90) return String.fromCharCode(code + 32)
    if (code === 32 || code === 45 || code === 95 || (code >= 9 && code <= 13)) return ' '
    return code === 96 ? "'" : char
  }
  const had = folds.get(char)
  if (had !== undefined) return had
  let fold
  if (/[\p{Cf}\u0640]/u.test(char)) fold = ''
  else if (/[\s\p{Pd}]/u.test(char)) fold = ' '
  else if (/[’‘ʼ´＇]/u.test(char)) fold = "'"
  else if (NO_DECOMPOSING.test(char)) fold = char.normalize('NFKC')
  else fold = [...char.normalize('NFKD').replace(/[\p{Script=Inherited}\u0591-\u05c7]/gu, '').toUpperCase().toLowerCase()].map((one) => ARABIC_LIKE[one] ?? one).join('')
  folds.set(char, fold)
  return fold
}

/** A decoded text folded, each unit keeping where in it it came from. @param {string} plain */
function fold(plain) {
  /** @type {number[]} */
  const start = []
  /** @type {number[]} */
  const end = []
  const parts = []
  let length = 0
  for (let i = 0; i < plain.length;) {
    const size = /** @type {number} */ (plain.codePointAt(i)) > 0xffff ? 2 : 1
    const part = foldChar(plain.slice(i, i + size))
    if (part === ' ' && length && parts.at(-1)?.at(-1) === ' ') end[length - 1] = i + size
    else if (part) {
      for (let j = 0; j < part.length; j++) {
        start.push(i)
        end.push(i + size)
        length++
      }
      parts.push(part)
    }
    i += size
  }
  return { text: parts.join(''), start, end }
}
/** What a value is known by. @param {string} value */
const keyOf = (value) => fold(decode(value).plain).text.trim()

/** @type {Map<string, boolean>} */
const wordy = new Map()
/** Whether a unit is part of a word. @param {string | undefined} char */
function inWord(char) {
  if (char === undefined) return false
  const code = char.charCodeAt(0)
  if (code < 128) return (code >= 48 && code <= 57) || (code >= 97 && code <= 122) || (code >= 65 && code <= 90)
  let had = wordy.get(char)
  if (had === undefined) wordy.set(char, had = /[\p{L}\p{N}\p{M}]/u.test(char))
  return had
}
// Scripts that attach words to a name, or write none apart: a name there has no edge to look for.
const ATTACHING = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
/** @type {Map<string, boolean>} */
const attaching = new Map()
/** @param {string | undefined} char */
function attaches(char) {
  if (char === undefined || char.charCodeAt(0) < 128) return false
  let had = attaching.get(char)
  if (had === undefined) attaching.set(char, had = ATTACHING.test(char))
  return had
}

// ─── Looking for many values at once ──────────────────────────────────────────

/** @typedef {{ next: Map<string, Node>, value?: string }} Node */
/** @returns {Node} */
const newNode = () => ({ next: new Map() })
/** @param {Node} trie @param {string} key @param {string} value */
function addTo(trie, key, value) {
  let node = trie
  for (let i = 0; i < key.length; i++) {
    let next = node.next.get(key[i])
    if (!next) node.next.set(key[i], next = newNode())
    node = next
  }
  node.value ??= value
}

/** Each value found whole in a folded text, the longest at each place. @param {Node} trie @param {string} text @returns {{ start: number, end: number, value: string }[]} */
function search(trie, text) {
  /** @type {{ start: number, end: number, value: string }[]} */
  const found = []
  if (!trie.next.size) return found
  for (let i = 0; i < text.length; i++) {
    if (!trie.next.has(text[i]) || (inWord(text[i - 1]) && !attaches(text[i]))) continue
    let node = /** @type {Node | undefined} */ (trie)
    let end = -1
    /** @type {string | undefined} */
    let value
    for (let j = i; j < text.length; j++) {
      node = /** @type {Node} */ (node).next.get(text[j])
      if (!node) break
      if (node.value !== undefined && (!inWord(text[j + 1]) || attaches(text[j]))) [end, value] = [j + 1, node.value]
    }
    if (end > 0) {
      found.push({ start: i, end, value: /** @type {string} */ (value) })
      i = end - 1
    }
  }
  return found
}

/** @param {ArrayBuffer} bytes */
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
/** @param {string} secret */
const keyFor = (secret) => crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
/** A `raw` as a mark to recognise it by. @param {unknown} raw */
const markOf = async (raw) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))))

// ─── Making a mark real in code ───────────────────────────────────────────────

/** The argument that holds code, and its language, by tool. @type {Record<string, [string, 'shell' | 'js' | 'py']>} */
const CODE = { bash: ['command', 'shell'], javascript: ['code', 'js'], python: ['code', 'py'] }
// What runs text as code: a value going through it is read twice, once by something this can't see, so it goes only if nothing in it could be read as code.
const RUNS_TEXT = {
  shell: /\b(?:eval|exec|source|ssh|xargs)\b|\b(?:sh|bash|zsh|dash|ksh|su|sudo|python[\d.]*|node|perl|ruby|php)\b[^\n;|&]*(?:\s-\w*[ce]\b|<<)/,
  js: /\beval\s*\(|\bFunction\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['"`]/,
  py: /\b(?:eval|exec|compile)\s*\(|\bos\.(?:system|popen)\s*\(|\bshell\s*=\s*True|['"](?:ba)?sh['"]/,
}
const PLAIN_VALUE = /^[\p{L}\p{M}\p{N} .,_@+:/%-]*$/u

/**
 * A value as it goes in code, by where it lands: a string, a comment, a heredoc, or bare.
 * @param {string} value @param {string | null} state @param {'shell' | 'js' | 'py'} lang @param {boolean} [formatted] in a Python f-string
 */
export function inCode(value, state, lang, formatted = false) {
  if (state === 'comment') return value.replace(/[\r\n\u2028\u2029]+/g, ' ').replaceAll('*/', '* /')
  if (lang === 'shell') {
    if (state === "'") return value.replaceAll("'", "'\\''")
    if (state === '"') return value.replace(/[\\"$`]/g, '\\$&')
    if (state === 'here') return value.replace(/[\\$`]/g, '\\$&')
    if (state === 'here-raw') return value
    return `'${value.replaceAll("'", "'\\''")}'`
  }
  if (state === null) return JSON.stringify(value)
  const lines = (/** @type {string} */ text) => text.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  if (state === '`') return lines(value.replace(/[\\`$]/g, '\\$&'))
  const quoted = value.replace(/\\/g, '\\\\').replaceAll(state[0], `\\${state[0]}`)
  return lines(formatted ? quoted.replace(/[{}]/g, '$&$&') : quoted)
}

/**
 * Code with each mark made real, escaped for where it stands: a small lexer, as a quote in a comment or a heredoc mustn't
 * count, and `L'Oréal` must not end the string it lands in. Where it can't tell, or a value would run, it throws.
 * @param {string} code @param {'shell' | 'js' | 'py'} lang @param {(whole: string, kind: string, id: string) => string | undefined} valueOf
 */
export function revealInCode(code, lang, valueOf) {
  const nested = RUNS_TEXT[lang].test(code)
  let out = ''
  /** @type {string | null} */
  let state = null
  let closing = ''
  let formatted = false
  let [parens, inClass] = [0, false]
  /** What a shell's $( … ) or ` … ` sits in. @type {{ state: string | null, parens: number }[]} */
  const within = []
  /** @type {{ end: string, raw: boolean }[]} */
  const pending = []
  const shape = new RegExp(REVEALED.source, 'uy')
  for (let i = 0; i < code.length;) {
    const char = code[i]
    if (char === '⟦' || (char >= 'A' && char <= 'Z')) {
      shape.lastIndex = i
      const found = shape.exec(code)
      const value = found ? valueOf(found[0], found[1] ?? found[3], found[2] ?? found[4]) : undefined
      if (found && value !== undefined) {
        const here = state === 'here' || state === 'here-raw'
        if (state === 'math' || state === 'regex' || state === 'tick' || (here && (/[\r\n]/.test(value) || value.trim() === pending[0].end)) || (nested && !PLAIN_VALUE.test(value))) throw new Error(UNSAFE)
        out += inCode(value, state, lang, formatted)
        i += found[0].length
        continue
      }
      if (found && char === '⟦') {
        out += found[0]
        i += found[0].length
        continue
      }
    }
    const take = (/** @type {number} */ length) => { out += code.slice(i, i + length); i += length }
    if (state === null) {
      const three = code.slice(i, i + 3)
      if (lang === 'py' && (three === "'''" || three === '"""')) {
        formatted = /(?:^|\W)[rRbB]?[fF][rR]?$/.test(code.slice(Math.max(0, i - 3), i))
        state = three
        take(3)
      } else if (char === "'" || char === '"' || (char === '`' && lang === 'js')) {
        formatted = lang === 'py' && /(?:^|\W)[rRbB]?[fF][rR]?$/.test(code.slice(Math.max(0, i - 3), i))
        state = char
        take(1)
      } else if (lang === 'js' && code.startsWith('//', i)) { state = 'comment'; closing = '\n'; take(2) }
      else if (lang === 'js' && code.startsWith('/*', i)) { state = 'comment'; closing = '*/'; take(2) }
      else if (lang === 'js' && char === '/' && /^$|[(,=:[!&|?{};\n]$/.test(out.slice(-40).trimEnd())) { state = 'regex'; inClass = false; take(1) }
      else if (char === '#' && lang !== 'js' && (lang === 'py' || /(^|\s)$/.test(code.slice(Math.max(0, i - 1), i)))) { state = 'comment'; closing = '\n'; take(1) }
      else if (lang === 'shell' && code.startsWith('$((', i)) { within.push({ state, parens }); state = 'math'; take(3) }
      else if (lang === 'shell' && code.startsWith('$(', i)) { within.push({ state, parens }); parens = 0; take(2) }
      else if (lang === 'shell' && char === '`') { within.push({ state, parens }); state = 'tick'; take(1) }
      else if (lang === 'shell' && char === '(') { parens++; take(1) }
      else if (lang === 'shell' && char === ')') {
        if (!parens && within.length) ({ state, parens } = /** @type {{ state: string | null, parens: number }} */ (within.pop()))
        else parens = Math.max(0, parens - 1)
        take(1)
      } else if (lang === 'shell' && code.startsWith('<<', i) && code[i + 2] !== '<') {
        const here = /^<<-?\s*(?:'(\w+)'|"(\w+)"|\\?(\w+))/.exec(code.slice(i, i + 80))
        if (here) { pending.push({ end: here[1] ?? here[2] ?? here[3], raw: Boolean(here[1] ?? here[2]) }); take(here[0].length) } else take(2)
      } else if (lang === 'shell' && char === '\n' && pending.length) { take(1); state = pending[0].raw ? 'here-raw' : 'here' }
      else if (char === '\\') take(2)
      else take(1)
    } else if (state === 'comment') {
      if (closing === '\n' ? /[\r\n\u2028\u2029]/.test(char) : code.startsWith(closing, i)) { take(closing === '\n' ? 1 : closing.length); state = null } else take(1)
    } else if (state === 'here' || state === 'here-raw') {
      const eol = code.indexOf('\n', i)
      if ((i === 0 || code[i - 1] === '\n') && code.slice(i, eol < 0 ? code.length : eol).trim() === pending[0].end) {
        pending.shift()
        take((eol < 0 ? code.length : eol) - i)
        state = pending.length ? (pending[0].raw ? 'here-raw' : 'here') : null
        if (state && code[i] === '\n') take(1)
      } else take(1)
    } else if (state === 'math') {
      if (code.startsWith('))', i)) { take(2); ({ state, parens } = /** @type {{ state: string | null, parens: number }} */ (within.pop())) } else take(1)
    } else if (state === 'tick') {
      if (char === '\\') take(2)
      else if (char === '`') { take(1); ({ state, parens } = /** @type {{ state: string | null, parens: number }} */ (within.pop())) } else take(1)
    } else if (state === 'regex') {
      if (char === '\\') take(2)
      else {
        if (char === '[') inClass = true
        else if (char === ']') inClass = false
        if ((char === '/' && !inClass) || char === '\n') state = null
        take(1)
      }
    } else if (char === '\\' && !(lang === 'shell' && state === "'")) take(2)
    else if (lang === 'shell' && state === '"' && code.startsWith('$((', i)) { within.push({ state, parens }); state = 'math'; take(3) }
    else if (lang === 'shell' && state === '"' && code.startsWith('$(', i)) { within.push({ state, parens }); state = null; parens = 0; take(2) }
    else if (lang === 'shell' && state === '"' && char === '`') { within.push({ state, parens }); state = 'tick'; take(1) }
    else if (code.startsWith(/** @type {string} */ (state), i)) { const { length } = /** @type {string} */ (state); state = null; take(length) }
    else take(1)
  }
  return out
}

// ─── What goes on the wire ────────────────────────────────────────────────────

/** A promise that fails when a signal does, and otherwise never settles. @param {AbortSignal | undefined} signal @returns {Promise<never>} */
const stopped = (signal) => new Promise((_, reject) => {
  if (signal?.aborted) reject(new Error('aborted'))
  signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
})

/**
 * A copy of a value with each string, key and number as `each` gives it, by a list, however deep what a brain wrote goes.
 * @param {any} given @param {(text: string) => string} each @param {string[]} [left] the keys whose values stay as they are
 */
export function mapped(given, each, left = []) {
  const out = /** @type {any} */ ({})
  const set = (/** @type {any} */ into, /** @type {string | number} */ key, /** @type {unknown} */ value) => Object.defineProperty(into, key, { value, enumerable: true, writable: true, configurable: true })
  /** @type {[any, any, string | number][]} */
  const stack = [[given, out, 'value']]
  while (stack.length) {
    const [value, into, key] = /** @type {[any, any, string | number]} */ (stack.pop())
    if (typeof value === 'string') set(into, key, each(value))
    else if (typeof value === 'number' || typeof value === 'bigint') {
      const said = each(String(value))
      set(into, key, said === String(value) ? value : said)
    } else if (Array.isArray(value)) {
      const list = new Array(value.length)
      set(into, key, list)
      for (let i = 0; i < value.length; i++) stack.push([value[i], list, i])
    } else if (value && typeof value === 'object') {
      const object = {}
      set(into, key, object)
      for (const [name, one] of Object.entries(value)) {
        if (left.includes(name)) { set(object, name, one); continue }
        const named = each(name)
        set(object, named, undefined)
        stack.push([one, object, named])
      }
    } else set(into, key, value)
  }
  return out.value
}

// What says how a schema is shaped, which a provider reads, and no one's name.
const SHAPE_KEYS = ['type', 'format']

/**
 * What goes on the wire of a step, each string through `each`, with whether it is part of a schema: a list of what's sent, so
 * that a field added later goes nowhere until it's named here.
 * @param {any} e @param {(text: string, schema: boolean) => string} each
 */
function onWire(e, each) {
  const text = (/** @type {any} */ value, schema = false) => {
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('a request holds something other than text')
    return value && each(value, schema)
  }
  const plain = (/** @type {string} */ value) => each(value, false)
  return {
    ...e,
    system: text(e.system),
    messages: e.messages.map((/** @type {any} */ { role, content, documents, toolCalls, raw, rawModel, toolCallId, name, isError }) => ({
      role,
      content: text(content),
      ...(documents && { documents: documents.map((/** @type {any} */ part) => ({ ...part, name: text(part.name), text: text(part.text) })) }),
      ...(toolCalls && { toolCalls: toolCalls.map((/** @type {any} */ call) => ({ ...call, args: mapped(call.args, plain) })) }),
      ...(raw && { raw, rawModel }),
      ...(toolCallId !== undefined && { toolCallId, name }),
      ...(isError && { isError }),
    })),
    ...(e.tools && { tools: e.tools.map((/** @type {any} */ tool) => ({ ...tool, description: text(tool.description, true), parameters: mapped(tool.parameters, (one) => each(one, true), SHAPE_KEYS) })) }),
  }
}

/**
 * @typedef {{ start: number, end: number, kind: string, value?: string }} Span
 * @typedef {{ plain: string, from: Int32Array | null, to: Int32Array | null, folded: ReturnType<typeof fold> }} Reading
 * What is known of one task's masks.
 * @typedef {{ key: Promise<CryptoKey>, values: Map<string, string>, ids: Map<string, string>, letters: Map<string, string>, raws: Set<string>, version: number, trie: Node, backwards: Node, words: Set<string>, found: Map<string, Promise<Span[]>>, unsaved: Record<string, string> }} Entry
 */

/** @type {Map<string, Reading>} */
const readings = new Map()
let readingsSize = 0
/** A text read, kept while it lasts: a brain's window of text, read again at each step. @param {string} text @returns {Reading} */
function readingOf(text) {
  const had = readings.get(text)
  if (had) return had
  const decoded = decode(text)
  const reading = { ...decoded, folded: fold(decoded.plain) }
  if (readings.size > 4000 || readingsSize > 4e6) {
    readings.clear()
    readingsSize = 0
  }
  readingsSize += text.length
  readings.set(text, reading)
  return reading
}
/** Where a part of a decoded text was in the original. @param {Reading} reading @param {number} start @param {number} end @returns {[number, number]} */
const inSource = ({ from, to }, start, end) => (from && to ? [from[start], to[end - 1]] : [start, end])
/** Where a part of a folded text was in the original. @param {Reading} reading @param {number} start @param {number} end @returns {[number, number]} */
const foldedInSource = (reading, start, end) => inSource(reading, reading.folded.start[start], reading.folded.end[end - 1])

/**
 * The hooks. What each case says and where things are kept come from `say`.
 * @param {import('./detect.js').Dlp} dlp
 * @param {{
 *   isLocal: (brain: any) => boolean,
 *   load: (task: string) => Promise<{ id: string, records: any[] } | null>,
 *   keep: (task: string, meta: Record<string, any>) => Promise<void>,
 *   assistant: () => string,
 *   open: () => boolean,
 *   refused: (why: string, e: any, script?: boolean) => AsyncIterable<any>,
 *   held?: () => void,
 *   heldReason: () => string,
 *   why: (values: string[]) => string,
 *   mayGo: () => string,
 *   reason: () => string,
 *   names?: (text: string) => Promise<Span[]>,
 *   more?: () => string[],
 *   told?: (letters: string[], task?: string) => void,
 *   sent?: (task: string | undefined, step: any) => void,
 *   scripts?: 'any',
 * }} say
 * @returns {import('../core/hooks.js').Hook[]}
 */
export function maskHooks(dlp, say) {
  const { hide = [], words: policyWords = [], keep = [], pictures = 'hold' } = dlp.mask ?? {}
  // The organisation's, and what the person added: only ever more.
  const wordsNow = () => [...policyWords, ...say.more?.() ?? []]
  const readsNames = hide.includes('person') && say.scripts !== 'any'
  const detected = (dlp.detect ?? []).flatMap((one) => (typeof one === 'string' ? [one] : []))
  const patterns = (dlp.detect ?? []).flatMap((one) => (typeof one === 'string' ? [] : [new RegExp(one.pattern, [...new Set(`${one.flags ?? ''}g`)].join(''))]))
  const sweepFinder = finder({ detect: dlp.detect })
  const keptKeys = keep.map(keyOf)
  const policyKeys = policyWords.map(keyOf)
  /** What stays: what policy keeps, and the assistant's name, unless policy hides that. @param {string} value */
  const kept = (value) => {
    const key = keyOf(value).replace(/'s$/, '')
    return keptKeys.includes(key) || (key === keyOf(say.assistant()) && !policyKeys.includes(key))
  }
  /** @type {Map<string, Promise<Entry>>} */
  const entries = new Map()
  /** The system prompts seen: what a reading treats apart. @type {Set<string>} */
  const prompts = new Set()

  /** @param {string | undefined} secret @returns {Entry} */
  const blank = (secret) => ({ key: keyFor(secret ?? crypto.randomUUID()), values: new Map(), ids: new Map(), letters: new Map(), raws: new Set(), version: 0, trie: newNode(), backwards: newNode(), words: new Set(), found: new Map(), unsaved: {} })

  /** A value to look for from now on, of a kind's letter; a person's name, each word of it too, as `Mme Durand` is who `Marie Durand` is. @param {Entry} entry @param {string} value @param {string} letter */
  function lookFor(entry, value, letter) {
    const key = keyOf(value)
    if (key.length < 2 || kept(value)) return
    addTo(entry.trie, key, value)
    addTo(entry.backwards, [...key].reverse().join(''), value)
    if (!entry.letters.has(key)) entry.letters.set(key, letter)
    if (letter === 'P') for (const part of partsOf(value)) if (!entry.letters.has(keyOf(part))) lookFor(entry, part, 'P')
  }

  /** What is known of a task, read from its records once. @param {string | undefined} task @returns {Promise<Entry>} */
  function entryOf(task) {
    if (!task) return Promise.resolve(blank(undefined))
    const had = entries.get(task)
    if (had) return had
    const loading = say.load(task).then((loaded) => {
      const entry = blank(loaded?.id)
      for (const { meta } of loaded?.records ?? []) {
        for (const [id, value] of Object.entries(meta?.masked ?? {})) {
          const text = /** @type {string} */ (value)
          entry.values.set(id, text)
          entry.ids.set(UNSEARCHED.includes(id[0]) ? `${id[0]}:${text}` : keyOf(text), id)
          if (!UNSEARCHED.includes(id[0])) lookFor(entry, text, id[0])
        }
        if (meta?.maskedRaw) entry.raws.add(meta.maskedRaw)
      }
      return entry
    })
    loading.catch(() => entries.delete(task))
    entries.set(task, loading)
    return loading
  }

  /** @param {Entry} entry */
  function withWords(entry) {
    for (const word of wordsNow()) {
      if (entry.words.has(word)) continue
      entry.words.add(word)
      lookFor(entry, word, 'W')
    }
    return entry
  }

  /** A text without what is looked for. @param {Entry} entry @param {Reading} reading @param {string} text */
  function withoutKnown(entry, reading, text) {
    let [out, at] = ['', 0]
    for (const { start, end } of search(entry.trie, reading.folded.text)) {
      const [from, to] = foldedInSource(reading, start, end)
      out += text.slice(at, from)
      at = to
    }
    return out + text.slice(at)
  }

  /**
   * What finding doesn't depend on the map for: `detect`, `hide`, a source's brackets and the names on this device; read once
   * per text. A tool's schema is a tool's, no one's, and isn't read for names.
   * @param {Entry} entry @param {string} text @param {boolean} schema @returns {Promise<Span[]>}
   */
  function foundIn(entry, text, schema) {
    const memo = `${schema ? 's' : 't'}${text}`
    const had = entry.found.get(memo)
    if (had) return had
    const reading = readingOf(text)
    /** @type {Span[]} */
    const spans = []
    const add = (/** @type {string} */ kind, /** @type {RegExp} */ shape, /** @type {(found: string) => boolean} */ holds = () => true) => {
      for (const match of reading.plain.matchAll(shape)) {
        if (!match[0] || !holds(match[0])) continue
        const [start, end] = inSource(reading, match.index, match.index + match[0].length)
        spans.push({ start, end, kind, value: match[0] })
      }
    }
    for (const id of detected) for (const [start, end] of PLACES[id](reading.plain)) {
      const [from, to] = inSource(reading, start, end)
      spans.push({ start: from, end: to, kind: 'id', value: reading.plain.slice(start, end) })
    }
    for (const pattern of patterns) add('id', pattern)
    for (const kind of hide) if (HIDDEN[kind]) add(kind, ...HIDDEN[kind])
    for (const match of text.matchAll(BRACKETED)) spans.push({ start: match.index, end: match.index + match[0].length, kind: 'forged', value: match[0] })
    const read = prompts.has(text) ? text.replace(JEANS_OWN, (own) => ' '.repeat(own.length)) : text
    const found = say.names && !schema ? say.names(read).then((names) => [...spans, ...names]) : Promise.resolve(spans)
    if (entry.found.size > 4000) entry.found.clear()
    entry.found.set(memo, found)
    found.catch(() => entry.found.delete(memo))
    return found
  }

  /**
   * What ends or starts a line and may be part of a value: titles, guards and summaries cut before the hook, whatever follows
   * the cut. It goes back where it stood, and isn't looked for anywhere else.
   * @param {Entry} entry @param {Reading} reading @returns {Span[]}
   */
  function cutsIn(entry, reading) {
    const { plain } = reading
    /** @type {Span[]} */
    const spans = []
    const add = (/** @type {number} */ start, /** @type {number} */ end, /** @type {string} */ kind = 'cut') => {
      const [from, to] = inSource(reading, start, end)
      spans.push({ start: from, end: to, kind, value: plain.slice(start, end) })
    }
    for (let at = 0; at <= plain.length;) {
      const stop = plain.indexOf('\n', at)
      const end = stop < 0 ? plain.length : stop
      let [first, stopped] = [at, end]
      while (stopped > first && AROUND_A_CUT.test(plain[stopped - 1])) stopped--
      while (first < stopped && AROUND_A_CUT.test(plain[first])) first++
      if (stopped - first >= SHORTEST_CUT) {
        const tailAt = Math.max(first, stopped - CUT_LOOK)
        const tail = plain.slice(tailAt, stopped)
        for (const id of detected) {
          const cut = CUT_ENDS[id]?.exec(tail)
          if (cut) add(tailAt + cut.index, tailAt + tail.length, 'id')
        }
        const headAt = first
        const head = plain.slice(first, Math.min(stopped, first + CUT_LOOK))
        const number = detected.includes('card') ? CUT_START.exec(head) : null
        if (number && number[0].replace(/\D/g, '').length >= 10) add(headAt, headAt + number[0].length, 'id')
        const folded = fold(tail)
        for (let start = 0; start <= folded.text.length - SHORTEST_CUT; start++) {
          if (inWord(folded.text[start - 1]) && !attaches(folded.text[start])) continue
          let node = /** @type {Node | undefined} */ (entry.trie)
          for (let j = start; node && j < folded.text.length; j++) node = node.next.get(folded.text[j])
          if (node && node.value === undefined) {
            add(tailAt + folded.start[start], tailAt + tail.length)
            break
          }
        }
        const front = fold(head)
        for (let last = front.text.length; last >= SHORTEST_CUT; last--) {
          if (inWord(front.text[last]) && !attaches(front.text[last - 1])) continue
          let node = /** @type {Node | undefined} */ (entry.backwards)
          for (let j = last - 1; node && j >= 0; j--) node = node.next.get(front.text[j])
          if (node && node.value === undefined) {
            add(headAt, headAt + front.end[last - 1])
            break
          }
        }
      }
      if (stop < 0) break
      at = stop + 1
    }
    return spans
  }

  /** All that hides in a text, overlaps as one, the longest's kind. A schema has no cuts or names. @param {Entry} entry @param {string} text @param {boolean} schema @returns {Promise<Span[]>} */
  async function spansIn(entry, text, schema) {
    withWords(entry)
    const reading = readingOf(text)
    const spans = [...await foundIn(entry, text, schema)]
    for (const { start, end, value } of search(entry.trie, reading.folded.text)) {
      if (kept(value)) continue
      const [from, to] = foldedInSource(reading, start, end)
      spans.push({ start: from, end: to, kind: entry.letters.get(keyOf(value)) ?? 'W', value })
    }
    if (!schema) spans.push(...cutsIn(entry, reading))
    spans.sort((a, b) => a.start - b.start || b.end - a.end)
    /** @type {Span[]} */
    const merged = []
    for (const span of spans) {
      const last = merged.at(-1)
      if (last && span.start < last.end) {
        // Nested: the longest stands. Overlapping: both, so no part of either goes as it is.
        if (span.end > last.end) merged[merged.length - 1] = { start: last.start, end: span.end, kind: last.end - last.start >= span.end - span.start ? last.kind : span.kind }
      } else merged.push({ ...span })
    }
    return merged.filter((span) => span.kind === 'id' || !kept(span.value ?? text.slice(span.start, span.end)))
  }

  /** What leaves: all that hides there, parts cut short apart, as a call's arguments aren't cut. @param {Entry} entry @param {string} text */
  const foundAndKnown = async (entry, text) => (await spansIn(entry, text, false)).filter((span) => span.kind !== 'cut')

  /** The id of a value, kept in `unsaved` when new: sparse, so a brain's slip lands on nobody, and the same in whoever asks, helpers and other tabs included. @param {Entry} entry @param {string} kind @param {string} value */
  async function idOf(entry, kind, value) {
    const letter = LETTERS[kind] ?? (Object.values(LETTERS).includes(kind) ? kind : 'W')
    const unsearched = UNSEARCHED.includes(letter)
    const key = unsearched ? `${letter}:${value}` : keyOf(value)
    const had = entry.ids.get(key)
    if (had) return had
    const hash = hex(await crypto.subtle.sign('HMAC', await entry.key, new TextEncoder().encode(key)))
    for (let length = 6; ; length += 2) {
      const id = `${letter}${hash.slice(0, length)}`
      const other = entry.values.get(id)
      if (other !== undefined && other !== value) continue
      const already = entry.ids.get(key)
      if (already) return already
      entry.values.set(id, value)
      entry.ids.set(key, id)
      if (!unsearched) lookFor(entry, value, letter)
      entry.version++
      entry.unsaved[id] = value
      return id
    }
  }

  /** `raw` goes back only as the brain wrote it to this mask, whose mark was kept, and holding nothing hidden since: a signature can't be read, and an earlier turn's can hold anything. From the first that doesn't, none does. @param {any[]} messages @param {Entry} entry @param {any} brain */
  async function replayable(messages, entry, brain) {
    let dropped = false
    const out = []
    for (const message of messages) {
      if (!message.raw) { out.push(message); continue }
      const { raw, rawModel, ...rest } = message
      if (rawModel && rawModel !== brain.model) { out.push(rest); continue }
      dropped ||= !entry.raws.has(await markOf(raw)) || holdsKnown(entry, JSON.stringify(raw))
      out.push(dropped ? rest : message)
    }
    // A brain paused in its own search can't go on from part of what it wrote.
    if (dropped && messages.at(-1)?.role === 'assistant' && messages.at(-1).raw) throw new Error('a paused step can\'t go on masked')
    return out
  }

  /** Whether a text holds a value looked for. @param {Entry} entry @param {string} text */
  const holdsKnown = (entry, text) => search(entry.trie, readingOf(text).folded.text).some(({ value }) => !kept(value))

  /** Any picture out of the step, unless policy sends them, with a line saying so: they aren't read. @param {any} e */
  function held(e) {
    if (pictures === 'send' || !e.messages.some((/** @type {any} */ message) => message.documents?.some((/** @type {any} */ part) => part.images?.length))) return e
    say.held?.()
    return { ...e, messages: e.messages.map((/** @type {any} */ message) => (message.documents ? { ...message, documents: message.documents.map((/** @type {any} */ { images, ...part }) => (images?.length ? { ...part, text: `${part.text ? `${part.text}\n` : ''}${say.heldReason()}` } : part)) } : message)) }
  }

  /** The last look, over what is about to go, names of tools included: nothing found may go, whatever put it there. @param {any} e @param {Entry} entry */
  function sweep(e, entry) {
    const look = (/** @type {string} */ text, /** @type {boolean} */ schema) => {
      const without = text.replace(PLACEHOLDER, 'x').replace(BRACKETED, 'x')
      if (readsNames && !schema && OTHER_SCRIPT.test(without)) throw Object.assign(new Error('text in a script names can\'t be found in'), { script: true })
      const { plain } = readingOf(without)
      const hits = sweepFinder(plain)
      for (const kind of hide) if (HIDDEN[kind] && [...plain.matchAll(HIDDEN[kind][0])].some((match) => HIDDEN[kind][1](match[0]))) hits.push(kind)
      if (holdsKnown(entry, without)) hits.push('value')
      if (hits.length) throw new Error(`what should be masked is still there: ${[...new Set(hits)].join(', ')}`)
      return text
    }
    onWire(e, (text, schema) => look(text, schema))
    // A tool's name is someone's choice, and can't be masked: what the organisation lists stops it, and what a reading took for a name doesn't.
    const listed = wordsNow().map(keyOf)
    const names = [...e.messages.flatMap((/** @type {any} */ message) => (message.toolCalls ?? []).map((/** @type {any} */ call) => call.name)), ...(e.tools ?? []).map((/** @type {any} */ tool) => tool.name)]
    for (const name of names) {
      const { folded } = readingOf(String(name))
      if (search(entry.trie, folded.text).some(({ value }) => listed.includes(keyOf(value)))) throw new Error('what should be masked is still there: a tool\'s name')
    }
  }

  /** The step as it goes. @param {any} e @param {Entry} entry */
  async function masked(e, entry) {
    withWords(entry)
    if (e.system) {
      if (prompts.size > 64) prompts.clear()
      prompts.add(e.system)
    }
    const step = held(e)
    /** @type {Record<'true' | 'false', Set<string>>} */
    const strings = { true: new Set(), false: new Set() }
    onWire(step, (text, schema) => { strings[`${schema}`].add(text); return text })
    // Before any reading, of this or anything else: what's listed hides, and any letter left of another script refuses it now.
    if (readsNames) for (const text of strings.false) if (OTHER_SCRIPT.test(withoutKnown(entry, readingOf(text), text))) throw Object.assign(new Error('text in a script names can\'t be found in'), { script: true })
    /** @type {Record<'true' | 'false', Map<string, Span[]>>} */
    let spans = { true: new Map(), false: new Map() }
    // Whatever a text is found to hold is hidden in all of them: until nothing new turns up.
    for (let round = 0; ; round++) {
      if (round > 6) throw new Error('masking did not settle')
      const before = entry.version
      spans = { true: new Map(), false: new Map() }
      for (const schema of /** @type {const} */ (['true', 'false'])) {
        for (const text of strings[schema]) {
          if (e.signal?.aborted) throw new Error('aborted')
          // A long read can't be stopped, but no one need wait for it.
          const found = await Promise.race([spansIn(entry, text, schema === 'true'), stopped(e.signal)])
          spans[schema].set(text, found)
          for (const span of found) await idOf(entry, span.kind, span.value ?? text.slice(span.start, span.end))
        }
      }
      if (entry.version === before) break
    }
    const replaced = onWire(step, (text, schema) => {
      let [out, at] = ['', 0]
      for (const span of spans[`${schema}`].get(text) ?? []) {
        const value = span.value ?? text.slice(span.start, span.end)
        const letter = LETTERS[span.kind] ?? span.kind
        out += `${text.slice(at, span.start)}⟦${entry.ids.get(UNSEARCHED.includes(letter) ? `${letter}:${value}` : keyOf(value))}⟧`
        at = span.end
      }
      return out + text.slice(at)
    })
    const going = { ...replaced, messages: await replayable(replaced.messages, entry, e.brain) }
    sweep(going, entry)
    // What failed to be kept last time is kept now, or nothing goes: a mark the file can't say is a value lost at the next reload.
    const unsaved = entry.unsaved
    if (Object.keys(unsaved).length) {
      // Taken now: a title's request and the step's own run at once, and each new mark is kept once.
      entry.unsaved = {}
      if (e.task) {
        try {
          await say.keep(e.task, { masked: unsaved })
        } catch (error) {
          entry.unsaved = { ...unsaved, ...entry.unsaved }
          throw error
        }
      }
      say.told?.(Object.keys(unsaved).map((id) => id[0]), e.task)
    }
    say.sent?.(e.task, going)
    return { ...going, system: [going.system, RULE].filter(Boolean).join('\n\n') }
  }

  /** What came back, real: `raw` as the brain wrote it, its mark kept. @param {AsyncIterable<any>} events @param {Entry} entry @param {any} e */
  async function* revealed(events, entry, e) {
    const real = (/** @type {string} */ text) => text.replace(REVEALED, (found, kind, id, bareKind, bareId) => entry.values.get(`${kind ?? bareKind}${id ?? bareId}`) ?? found)
    const argsOf = (/** @type {any} */ call) => {
      const args = mapped(call.args, real)
      const code = Object.hasOwn(CODE, call.name) ? CODE[call.name] : null
      if (!code || typeof call.args?.[code[0]] !== 'string') return args
      // What a source forged stays a mark in code: it can hold anything.
      try {
        return { ...args, [code[0]]: revealInCode(call.args[code[0]], code[1], (_, kind, id) => (kind === 'X' ? undefined : entry.values.get(`${kind}${id}`))) }
      } catch (error) {
        return { ...call.args, [UNREVEALED]: /** @type {Error} */ (error).message }
      }
    }
    /** @type {Record<string, string>} */
    const waiting = { text: '', thinking: '' }
    /** Text up to a mark that may not have ended yet. @param {'text' | 'thinking'} type @param {string} delta */
    const ready = (type, delta) => {
      const all = waiting[type] + delta
      const open = OPENING.exec(all)
      waiting[type] = open ? open[0] : ''
      return real(open ? all.slice(0, open.index) : all)
    }
    const flush = function* () {
      for (const type of /** @type {const} */ (['thinking', 'text'])) {
        if (waiting[type]) yield { type, delta: real(waiting[type]) }
        waiting[type] = ''
      }
    }
    for await (const event of events) {
      if (event.type === 'text' || event.type === 'thinking') {
        const delta = ready(event.type, event.delta)
        if (delta) yield { ...event, delta }
        continue
      }
      yield* flush()
      if (event.type === 'tool_call') yield { ...event, call: { ...event.call, args: argsOf(event.call) } }
      else if (event.type === 'done') {
        const raw = event.message?.raw
        if (raw) {
          const mark = await markOf(raw)
          entry.raws.add(mark)
          if (e.task) await say.keep(e.task, { maskedRaw: mark }).catch((error) => console.warn('Mask', error))
        }
        yield { ...event, message: event.message && { ...event.message, content: real(event.message.content ?? ''), ...(event.message.toolCalls && { toolCalls: event.message.toolCalls.map((/** @type {any} */ call) => ({ ...call, args: argsOf(call) })) }) } }
      } else yield event
    }
    yield* flush()
  }

  return [
    { on: 'turn.step', tier: 'edge', by: 'dlp', run: async function* (/** @type {any} */ e, /** @type {(e?: any) => Promise<any>} */ next) {
      if (say.isLocal(e.brain) || dlp.brains?.includes(e.brain.id)) return yield* await next(e)
      /** @type {Entry} */
      let entry
      /** @type {any} */
      let going
      try {
        entry = await entryOf(e.task)
        going = await masked(e, entry)
      } catch (error) {
        return yield* say.refused(/** @type {Error} */ (error).message, e, /** @type {any} */ (error).script)
      }
      yield* revealed(await next(going), entry, e)
    } },
    { on: 'tool.check', tier: 'policy', by: 'dlp', run: async (/** @type {any} */ e, /** @type {(e?: any) => Promise<any>} */ next) => {
      if (e.args?.[UNREVEALED]) return { decision: 'never', reason: String(e.args[UNREVEALED]) }
      const said = await next(e)
      if (said?.refuse || said?.decision === 'never') return said
      // Past next(), a throw would hand back what the rules said: it asks, or refuses, rather than let it through.
      try {
        if ((e.name === 'picture' || e.name === 'film') && pictures !== 'send' && [e.args?.from ?? []].flat().filter(Boolean).length) return { decision: 'never', reason: say.heldReason() }
        const entry = withWords(await entryOf(e.task))
        if (e.name === 'reach_site') return entry.values.size ? { ...said, meta: { ...said?.meta, why: say.mayGo() } } : said
        if (!(OUT.includes(e.kind) || SENT.includes(e.name) || said?.meta?.machine || (e.kind === 'execute' && say.open()))) return said
        const texts = [...new Set([String(e.title ?? ''), ...leaves(e.args)])]
        const values = new Set()
        for (const text of texts) {
          for (const span of await foundAndKnown(entry, text)) {
            if (span.kind !== 'forged') values.add(span.value ?? text.slice(span.start, span.end))
          }
        }
        if (!values.size) return said
        return dlp.then === 'never' ? { decision: 'never', reason: say.reason() }
          : { decision: 'ask', meta: { ...said?.meta, guard: 'dlp', why: say.why([...values]) } }
      } catch (error) {
        console.warn('Mask', error)
        return dlp.then === 'never' ? { decision: 'never', reason: 'This could not be checked for what is hidden.' } : { decision: 'ask', meta: { ...said?.meta, guard: 'dlp' } }
      }
    } },
    { on: 'remove', tier: 'policy', by: 'dlp', run: async (/** @type {any} */ e, /** @type {(e?: any) => Promise<any>} */ next) => {
      const said = await next(e)
      if (e.task) entries.delete(e.task)
      return said
    } },
  ]
}
