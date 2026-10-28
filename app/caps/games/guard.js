// A check in the condition of every `while`, `do … while` and classic `for` loop of a game's code (D648), so that a loop that never
// ends throws at its own line instead of freezing Jean, whose page shares its thread with a game's frame in WebKit. Strings,
// templates, comments and regular expressions are read past, `for … of` and `for … in` left alone, and nothing goes on a line of its
// own, so lines keep their numbers. Pure.
const WORD = /[\w$\u0080-￿]/
const START = /[A-Za-z_$\u0080-￿]/
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])

/** @typedef {{ type: 'word' | 'punct', value: string, start: number, end: number, dotted?: boolean }} Token */

/** The code's words and punctuation, what isn't code read past. @param {string} code */
export function tokens(code) {
  const out = /** @type {Token[]} */ ([]), templates = /** @type {number[]} */ ([])
  let i = 0, depth = 0, last = /** @type {{ type: string, value?: string } | null} */ (null)
  const regexOk = () => !last || (last.type === 'punct' && !')]'.includes(last.value ?? '')) || (last.type === 'word' && BEFORE_REGEX.has(last.value ?? ''))
  // A template's text, to its end or to an expression in it.
  const chunk = () => {
    for (; i < code.length; i++) {
      if (code[i] === '\\') i++
      else if (code[i] === '`') return void (i++, last = { type: 'string' })
      else if (code[i] === '$' && code[i + 1] === '{') return void (i += 2, templates.push(depth++), last = { type: 'punct', value: '{' })
    }
  }
  while (i < code.length) {
    const c = code[i]
    if (/\s/.test(c)) i++
    else if (c === '/' && code[i + 1] === '/') i = code.includes('\n', i) ? code.indexOf('\n', i) : code.length
    else if (c === '/' && code[i + 1] === '*') i = code.includes('*/', i + 2) ? code.indexOf('*/', i + 2) + 2 : code.length
    else if (c === '"' || c === "'") {
      for (i++; i < code.length && code[i] !== c && code[i] !== '\n'; i++) if (code[i] === '\\') i++
      i++, last = { type: 'string' }
    } else if (c === '`') i++, chunk()
    else if (c === '/' && regexOk()) {
      // To its closing slash, one in a set of characters ([/]) or escaped not closing it; then its flags.
      for (let set = false; ++i < code.length && code[i] !== '\n' && (code[i] !== '/' || set);) {
        if (code[i] === '\\') i++
        else if (code[i] === '[') set = true
        else if (code[i] === ']') set = false
      }
      for (i++; i < code.length && /[a-z]/i.test(code[i]); i++);
      last = { type: 'regex' }
    } else if (START.test(c)) {
      const start = i
      while (i < code.length && WORD.test(code[i])) i++
      const value = code.slice(start, i)
      out.push({ type: 'word', value, start, end: i, dotted: last?.type === 'punct' && last.value === '.' })
      last = { type: 'word', value }
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1] ?? ''))) {
      while (i < code.length && (WORD.test(code[i]) || code[i] === '.' || (/[eE]/.test(code[i - 1]) && /[+-]/.test(code[i])))) i++
      last = { type: 'number' }
    } else if (c === '}' && templates.length && templates.at(-1) === depth - 1) templates.pop(), depth--, i++, chunk()
    else {
      if (c === '{') depth++
      if (c === '}') depth--
      out.push({ type: 'punct', value: c, start: i, end: i + 1 })
      last = { type: 'punct', value: c }
      i++
    }
  }
  return out
}

/** The code with `check` in every loop's condition. @param {string} code @param {string} check a call that returns true, or throws */
export function guard(code, check) {
  const list = tokens(code), edits = /** @type {[number, string][]} */ ([])
  for (const [k, word] of list.entries()) {
    if (word.type !== 'word' || word.dotted || (word.value !== 'while' && word.value !== 'for')) continue
    const open = k + (word.value === 'for' && list[k + 1]?.value === 'await' ? 2 : 1)
    if (list[open]?.value !== '(') continue
    let level = 0, close = -1
    const semicolons = /** @type {number[]} */ ([])
    for (let m = open; m < list.length && close < 0; m++) {
      const { value } = list[m]
      if ('([{'.includes(value)) level++
      else if (')]}'.includes(value) && --level === 0) close = m
      else if (value === ';' && level === 1) semicolons.push(m)
    }
    if (close < 0 || close === open + 1) continue
    if (word.value === 'while') edits.push([list[open].end, `${check} && (`], [list[close].start, ')'])
    else if (semicolons.length === 2) {
      const [a, b] = semicolons
      edits.push(...(b === a + 1 ? [/** @type {[number, string]} */ ([list[a].end, ` ${check}`])] : [/** @type {[number, string]} */ ([list[a].end, ` ${check} && (`]), /** @type {[number, string]} */ ([list[b].start, ')'])]))
    }
  }
  return edits.sort((x, y) => y[0] - x[0]).reduce((out, [at, text]) => out.slice(0, at) + text + out.slice(at), code)
}
