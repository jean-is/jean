// Lines of code: lines with something other than comments and white space, as the line budgets
// count them (D246). Comments are found by reading the text as a browser would, so a '//' or a
// '/*' inside a string, a template or a regular expression is code.
// Pure functions only (tested in test/manifest.test.js).

/** Spaces in place of a span, its line breaks kept. @param {string} text */
const blank = (text) => text.replace(/[^\n]/g, ' ')

// After these words, a '/' starts a regular expression; after any other word, it divides.
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])

/** JavaScript without its comments. @param {string} text */
export function stripJS(text) {
  let out = ''
  let at = 0
  // A '/' here starts a regular expression: after an operator, an opening bracket or one of BEFORE_REGEX.
  let regex = true
  // For each template being read, how many braces its ${…} has open.
  /** @type {number[]} */
  const templates = []
  /** Copies text up to `end` as it is. @param {number} end */
  const keep = (end) => {
    out += text.slice(at, end)
    at = end
  }
  /** Reads a template from `at` (just past a '`' or a '}'), up to its end or its next ${. */
  const template = () => {
    let i = at
    while (i < text.length && text[i] !== '`' && !(text[i] === '$' && text[i + 1] === '{')) i += text[i] === '\\' ? 2 : 1
    if (text[i] === '`') keep(i + 1)
    else {
      keep(i + 2)
      templates.push(0)
    }
    regex = text[i] !== '`'
  }
  if (text.startsWith('#!')) keep(text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'))
  while (at < text.length) {
    const c = text[at]
    const next = text[at + 1]
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', at)
      out += blank(text.slice(at, end < 0 ? text.length : end))
      at = end < 0 ? text.length : end
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', at + 2)
      out += blank(text.slice(at, end < 0 ? text.length : end + 2))
      at = end < 0 ? text.length : end + 2
    } else if (c === '"' || c === "'") {
      let i = at + 1
      while (i < text.length && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1
      keep(i + 1)
      regex = false
    } else if (c === '`') {
      at++
      out += c
      template()
    } else if (c === '/' && regex && regexEnd(text, at) > 0) {
      keep(regexEnd(text, at))
      regex = false
    } else if (/[\w$#\u0080-￿]/.test(c)) {
      const word = /^[\w$#\u0080-￿.]+/.exec(text.slice(at, at + 200))?.[0] ?? c
      keep(at + word.length)
      regex = BEFORE_REGEX.has(word)
    } else if (c === '}' && templates.at(-1) === 0) {
      templates.pop()
      keep(at + 1)
      template()
    } else {
      if (c === '{' && templates.length) templates[templates.length - 1]++
      if (c === '}' && templates.length) templates[templates.length - 1]--
      if (!/\s/.test(c)) regex = c !== ')' && c !== ']'
      keep(at + 1)
    }
  }
  return out
}

/** Where a regular expression starting at `start` ends (past its flags), or -1 when the line ends first. @param {string} text @param {number} start */
function regexEnd(text, start) {
  let inClass = false
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i]
    if (c === '\n') return -1
    if (c === '\\') i++
    else if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) return i + 1 + (/^[a-z]*/.exec(text.slice(i + 1))?.[0].length ?? 0)
  }
  return -1
}

/** CSS without its comments. @param {string} text */
export function stripCSS(text) {
  return text.replace(/"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|\/\*[\s\S]*?(?:\*\/|$)/g, (match) => (match.startsWith('/*') ? blank(match) : match))
}

/** HTML without its comments, nor those of its scripts and style sheets. @param {string} text */
export function stripHTML(text) {
  return text.replace(/<!--[\s\S]*?(?:-->|$)|(<script\b[^>]*>)([\s\S]*?)(?=<\/script>)|(<style\b[^>]*>)([\s\S]*?)(?=<\/style>)/gi,
    (match, script, js, style, css) => (script ? script + stripJS(js) : style ? style + stripCSS(css) : blank(match)))
}

/** The lines of code of a file, by its kind: a module, a style sheet or a page. @param {string} text @param {string} path */
export function countLoc(text, path) {
  const strip = path.endsWith('.css') ? stripCSS : path.endsWith('.html') ? stripHTML : stripJS
  return strip(text).split('\n').filter((line) => line.trim()).length
}
