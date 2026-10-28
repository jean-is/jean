// A check in the condition of every `while` and classic `for` loop of a game's code, so that a loop that
// never ends throws instead of freezing Jean. Nothing is added on a line of its own: lines keep their numbers.
const WORD = /[\w$\u0080-￿]/
const START = /[A-Za-z_$\u0080-￿]/
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])

/** The code's words and punctuation, with strings, templates, comments and regular expressions skipped. @param {string} code */
export function tokens (code) {
  const out = [], tpl = []
  let i = 0, depth = 0, last = null
  const regexOk = () => !last || (last.type === 'punct' && !')]'.includes(last.value)) || (last.type === 'word' && BEFORE_REGEX.has(last.value))
  const chunk = () => {
    while (i < code.length) {
      const c = code[i]
      if (c === '\\') { i += 2; continue }
      if (c === '`') { i++; last = { type: 'string' }; return }
      if (c === '$' && code[i + 1] === '{') { i += 2; tpl.push(depth++); last = { type: 'punct', value: '{' }; return }
      i++
    }
  }
  while (i < code.length) {
    const c = code[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '/' && code[i + 1] === '/') { const e = code.indexOf('\n', i); i = e < 0 ? code.length : e; continue }
    if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? code.length : e + 2; continue }
    if (c === '"' || c === "'") {
      i++
      while (i < code.length && code[i] !== c && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1
      i++; last = { type: 'string' }; continue
    }
    if (c === '`') { i++; chunk(); continue }
    if (c === '/' && regexOk()) {
      i++
      for (let cls = false; i < code.length && code[i] !== '\n'; i++) {
        if (code[i] === '\\') { i++; continue }
        if (code[i] === '[') cls = true
        else if (code[i] === ']') cls = false
        else if (code[i] === '/' && !cls) break
      }
      i++
      while (i < code.length && /[a-z]/i.test(code[i])) i++
      last = { type: 'regex' }; continue
    }
    if (START.test(c)) {
      const start = i
      while (i < code.length && WORD.test(code[i])) i++
      const value = code.slice(start, i)
      out.push({ type: 'word', value, start, end: i, dotted: last?.type === 'punct' && last.value === '.' })
      last = { type: 'word', value }; continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1] ?? ''))) {
      while (i < code.length && (WORD.test(code[i]) || code[i] === '.' || (/[eE]/.test(code[i - 1]) && /[+-]/.test(code[i])))) i++
      last = { type: 'number' }; continue
    }
    if (c === '{') depth++
    if (c === '}') {
      if (tpl.length && tpl.at(-1) === depth - 1) { tpl.pop(); depth--; chunk(); continue }
      depth--
    }
    out.push({ type: 'punct', value: c, start: i, end: i + 1 })
    last = { type: 'punct', value: c }
    i++
  }
  return out
}

/** The code with `check()` in every loop's condition. @param {string} code @param {string} check */
export function guard (code, check = '__loop()') {
  const list = tokens(code), edits = []
  for (let k = 0; k < list.length; k++) {
    const t = list[k]
    if (t.type !== 'word' || t.dotted || (t.value !== 'while' && t.value !== 'for')) continue
    let open = k + 1
    if (t.value === 'for' && list[open]?.value === 'await') open++
    if (list[open]?.value !== '(') continue
    let level = 0, close = -1
    const semis = []
    for (let m = open; m < list.length; m++) {
      const v = list[m].value
      if ('([{'.includes(v)) level++
      else if (')]}'.includes(v)) { level--; if (level === 0) { close = m; break } }
      else if (v === ';' && level === 1) semis.push(m)
    }
    if (close < 0) continue
    if (t.value === 'while') {
      if (close === open + 1) continue
      edits.push([list[open].end, `${check} && (`], [list[close].start, ')'])
    } else if (semis.length === 2) {
      const [a, b] = semis
      if (b === a + 1) edits.push([list[a].end, ` ${check}`])
      else edits.push([list[a].end, ` ${check} && (`], [list[b].start, ')'])
    }
  }
  let out = code
  for (const [at, text] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, at) + text + out.slice(at)
  return out
}
