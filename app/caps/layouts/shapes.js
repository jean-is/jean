// Which shape a table, a numbered list or a quote has (D215), told from its Markdown alone, never its
// words, so that it holds in every language. The tokens are marked's.
import { Marked, Tokenizer } from 'marked'

/** A number and no word: a price, a share, a date. */
const AMOUNT = /^\P{L}*\p{N}\P{L}*$/u

/** How each column lines up: as the table says, or at the end for a column of amounts. @param {any} token @returns {string[]} */
export const aligned = (token) => token.align.map((/** @type {string | null} */ side, /** @type {number} */ i) => side ?? (i && token.rows.every((/** @type {any[]} */ row) => AMOUNT.test(row[i].text)) ? 'right' : ''))

// What a cell holds: a mark (✓, ✗, a dash, or nothing), an amount, a few words, or more.
const MARK = /^(?:[✓✔✅☑✗✘❌✖—–-]\uFE0F?)?$/u
/** @param {any} cell */
function kind(cell) {
  const text = cell.text.replace(/[*_~`]/g, '').trim()
  return MARK.test(text) ? 0 : AMOUNT.test(text) ? 1 : text.length > 24 ? 3 : 2
}

/** The share of lines whose cells are all of one kind. @param {number[][]} lines */
const alike = (lines) => lines.filter((line) => line.every((k) => k === line[0])).length / lines.length

/**
 * A comparison: two to five options side by side, the criteria down the start. It has a ★ on the
 * option recommended, its corner left empty (a table of numbers alone aside), or rows more alike than
 * its columns: a price in each, a ✓ in each, where a table of records has a column of prices.
 * @param {any} token @returns {{ pick: number } | null} the recommended option's column, or -1
 */
export function compared(token) {
  if (token.header.length < 3 || token.header.length > 6 || token.rows.length < 2) return null
  const rows = token.rows.map((/** @type {any[]} */ row) => row.slice(1).map(kind))
  const columns = rows[0].map((/** @type {number} */ _, /** @type {number} */ i) => rows.map((/** @type {number[]} */ row) => row[i]))
  const pick = token.header.findIndex((/** @type {any} */ cell) => /[★⭐]/u.test(cell.text))
  const cornered = !token.header[0].text.trim() && !rows.flat().every((/** @type {number} */ k) => k === 1)
  return pick > 0 || cornered || alike(rows) > alike(columns) ? { pick: pick > 0 ? pick : -1 } : null
}

// Characters that take two places: Chinese, Japanese and Korean, and full-width forms.
const DOUBLE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\uFF00-\uFFEF]/u

/**
 * Whether a comparison's options say much: their longest cells, side by side, over 110 characters (a
 * Chinese, Japanese or Korean one counting two). Their cards then take the room beside the text.
 * @param {any} token
 */
export function roomy(token) {
  /** @param {any} cell */
  const size = (cell) => [...cell.text.replace(/[*_~`]/g, '')].reduce((n, char) => n + (DOUBLE.test(char) ? 2 : 1), 0)
  return token.header.slice(1).reduce((/** @type {number} */ sum, /** @type {any} */ _, /** @type {number} */ i) => sum + Math.max(...token.rows.map((/** @type {any[]} */ row) => size(row[i + 1]))), 0) > 110
}

/** What sets a comparison's cell apart: the best of its row (in bold, and only that), a yes or a no. @param {any} cell */
export function marked(cell) {
  const parts = cell.tokens.filter((/** @type {any} */ part) => part.type !== 'text' || part.text.trim())
  return [parts.length === 1 && parts[0].type === 'strong' && 'is-best', /^[✓✔✅☑]/u.test(cell.text) && 'is-yes', /^[✗✘❌✖]/u.test(cell.text) && 'is-no'].filter(Boolean).join(' ')
}

/** Numbered items that each start in bold are steps, as are those `sequenced` gathers. @param {any} token */
export const stepped = (token) => token.steps || (token.ordered && token.items.length > 1 && token.items.every(bold))
/** @param {any} item */
const bold = (item) => item.tokens[0]?.tokens?.[0]?.type === 'strong'
/** What an item starts with in bold, or nothing. @param {any} item @returns {string} */
const lead = (item) => (bold(item) ? item.tokens[0].tokens[0].text.trim() : '')

// A time or a date in digits, so that it holds in every language (09:00, 9h30, 2026-10-12, 12/10, 1969), or two of them, from one to the other.
const DAY = String.raw`(?:\d{1,2}[:h.]\d{2}|\d{4}(?:-\d{2}){0,2}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)`
const WHEN = new RegExp(`^${DAY}(?:\\s*[–-]\\s*${DAY})?$`)

/** A timeline (D291): a list whose items each start with a time or a date, in bold. @param {any} token */
export const timed = (token) => !token.ordered && token.items.length > 1 && token.items.every((/** @type {any} */ item) => WHEN.test(lead(item)))

/** Key figures (D291): two to six items, each a number in bold and a few words. @param {any} token */
export const figured = (token) => !token.ordered && token.items.length > 1 && token.items.length < 7
  && token.items.every((/** @type {any} */ item) => AMOUNT.test(lead(item)) && item.tokens.length === 1 && item.text.replace(/[*_]/g, '').length < 60)

/** A checklist (D291): a list of things to do, ticked or not. @param {any} token */
export const ticked = (token) => token.items.every((/** @type {any} */ item) => item.task)

/**
 * A step's bold start is its title when the line ends there or a colon or a dash follows it: what
 * ends it, kept for copying, and what follows. Null when it has no bold start, or its bold words begin a sentence.
 * @param {any[]} tokens a step's first line @returns {{ end: string, rest: any[] } | null}
 */
export function titled([title, next, ...after]) {
  if (title?.type !== 'strong') return null
  if (!next || next.type === 'br') return { end: '', rest: after }
  const end = next.type === 'text' ? /^\s*(?:[:：]|[-–—](?=\s))\s*|^\n/.exec(next.text)?.[0] : undefined
  return end === undefined ? null : { end, rest: [{ ...next, text: next.text.slice(end.length), tokens: undefined }, ...after] }
}

const NUMBER = /^(\d{1,3})[.)](?:\s+|$)/

/**
 * Where a block starts steps, each with its number and first blocks: a paragraph that starts in bold
 * with its number ("**1. Choose**", "**1.** Choose"), without it, or a numbered list whose items all
 * start in bold. Null for any other block.
 * @param {any} token @returns {{ n: number, tokens: any[] }[] | null}
 */
function starts(token) {
  if (token.type === 'list') return token.ordered && token.items.every(bold) ? token.items.map((/** @type {any} */ item, /** @type {number} */ i) => ({ n: (token.start || 1) + i, tokens: item.tokens })) : null
  const [strong, ...rest] = token.type === 'paragraph' ? token.tokens : []
  const first = strong?.type === 'strong' ? strong.tokens[0] : null
  const number = first?.type === 'text' ? NUMBER.exec(first.text) : null
  if (!number) return null
  const title = [{ ...first, text: first.text.slice(number[0].length), tokens: undefined }, ...strong.tokens.slice(1)].filter((part) => part.type !== 'text' || part.text)
  const line = title.length ? [{ ...strong, tokens: title }, ...rest] : rest.map((/** @type {any} */ part, /** @type {number} */ i) => (i || part.type !== 'text' ? part : { ...part, text: part.text.trimStart(), tokens: undefined }))
  return [{ n: Number(number[1]), tokens: [{ ...token, tokens: line }] }]
}

/**
 * Steps written apart, as brains often do: paragraphs that start in bold with 1., 2., 3. …, or numbered
 * lists cut apart by what each step holds, each followed by its details, made one numbered list of
 * steps. A step holds what follows it up to the next, the last as many blocks as the longest before it
 * (an answer's closing words aren't the last step's); a heading, a rule or a number out of turn ends them.
 * @param {any[]} tokens @returns {any[]}
 */
export function sequenced(tokens) {
  const out = []
  for (let i = 0; i < tokens.length;) {
    /** @type {{ n: number, tokens: any[], holds: any[] }[]} */
    const steps = (starts(tokens[i]) ?? []).map((step) => ({ ...step, holds: [] }))
    /** @type {any[]} */
    let after = []
    let j = i + 1
    for (; steps.length && j < tokens.length && tokens[j].type !== 'heading' && tokens[j].type !== 'hr'; j++) {
      const more = starts(tokens[j])
      if (!more) {
        after.push(tokens[j])
        continue
      }
      if (more[0].n !== steps[steps.length - 1].n + 1) break
      steps[steps.length - 1].holds = after
      steps.push(...more.map((step) => ({ ...step, holds: [] })))
      after = []
    }
    if (steps.length < 2) {
      out.push(tokens[i++])
      continue
    }
    const most = Math.max(...steps.slice(0, -1).map((step) => step.holds.filter((block) => block.type !== 'space').length))
    let taken = 0
    const beyond = after.findIndex((block) => block.type !== 'space' && ++taken > most)
    steps[steps.length - 1].holds = beyond < 0 ? after : after.slice(0, beyond)
    out.push({ type: 'list', raw: '', ordered: true, start: steps[0].n, loose: true, steps: true, items: steps.map((step) => ({ type: 'list_item', raw: '', loose: true, tokens: [...step.tokens, ...step.holds] })) })
    i = beyond < 0 ? j : j - after.length + beyond
  }
  return out
}

const ALERT = /^\[!(note|tip|important|warning|caution)\][ \t]*([^\n]*)\n?/i

/**
 * A note: a GitHub alert, its kind, its own title if it has one, and its text; or a quote that starts
 * with an emoji, its kind from that emoji. Null for any other quote.
 * @param {any} token @returns {{ kind: string, title?: string, text?: string } | null}
 */
export function noted(token) {
  const alert = ALERT.exec(token.text)
  if (alert) return { kind: alert[1].toLowerCase(), title: alert[2].trim(), text: token.text.slice(alert[0].length) }
  const lead = /^\s*(\p{Extended_Pictographic})/u.exec(token.text)?.[1]
  return lead ? { kind: /[⚠❗‼🚨⛔🛑❌]/u.test(lead) ? 'warning' : /[💡✅✨]/u.test(lead) ? 'tip' : 'note' } : null
}

/**
 * Columns side by side (D501), as Pandoc and Quarto write them: a fence of colons opening `columns`, then each column
 * between a fence that names it and a fence of colons alone, and a last one closing them all. marked's extension, for
 * answers (./layouts.js) and documents (caps/documents/markdown.js): each column's blocks, as marked reads them.
 * @type {import('marked').TokenizerExtension}
 */
export const columns = {
  name: 'columns', level: 'block',
  start: (src) => src.match(/(?<=\n) {0,3}:{3,} *\{?\.?columns\b/)?.index,
  tokenizer(src) {
    const open = /^ {0,3}:{3,} *\{?\.?columns\b.*(?:\n|$)/.exec(src)
    if (!open) return
    /** @type {string[][]} */
    const parts = []
    let depth = 0, end = open[0].length
    for (const line of src.slice(end).split('\n')) {
      end += line.length + 1
      const [fence, name] = /^ {0,3}:{3,} *(\S*)/.exec(line) ?? []
      if (fence && !name && !depth) return { type: 'columns', raw: src.slice(0, end), columns: parts.map((part) => ({ tokens: this.lexer.blockTokens(part.join('\n'), []) })) }
      // A fence that names a block inside a column, Pandoc's, and the one closing it, stay the column's.
      if (fence) depth += name ? 1 : -1
      if (fence && name && depth === 1) parts.push([])
      else if (depth) parts[parts.length - 1].push(line)
    }
  },
}

/** Chinese, Japanese and Korean: their scripts, and the punctuation and full-width forms they write with. */
const CJK = /[\p{scx=Hani}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}\p{scx=Bopo}\u3000-\u303f\uff00-\uffef]/u
/** Punctuation that keeps a run of * from flanking: before a run a letter follows, or after one a letter comes before. */
const STOP = /(?!\*)[\p{P}\p{S}](?=\*+([^\s\p{P}\p{S}]))|(?<=([^\s\p{P}\p{S}])\*+)(?!\*)[\p{P}\p{S}]/gu

/**
 * Emphasis as Chinese, Japanese and Korean are written (D590), for answers (./layouts.js), documents and the files Jean
 * writes: with no space between words, a run of * that punctuation touches still opens or closes when that punctuation,
 * or the character on the run's other side, is CJK, as markdown-cjk-friendly proposes for CommonMark, so that
 * `**5月21日（金）**に` is bold. marked still reads every run: told that a run's punctuation came after a space, and
 * shown the text it looks for a closing run in, as it masks it, with such punctuation as a letter.
 * @type {import('marked').MarkedExtension}
 */
export const cjk = { hooks: { emStrongMask: (masked) => (CJK.test(masked) ? masked.replace(STOP, (mark, next, last) => (CJK.test(mark + (next ?? last)) ? 'a'.repeat(mark.length) : mark)) : masked) }, tokenizer: { emStrong(src, masked, prev = '') {
  const [, after = ''] = /^\*+(?!\*)([\p{P}\p{S}])/u.exec(src) ?? []
  return after && CJK.test(prev + after) ? Tokenizer.prototype.emStrong.call(this, src, masked, '') : false
} } }

/** marked's tokens, emphasis read as answers read it, for the files Jean writes (caps/made). @param {string} source @param {import('marked').MarkedExtension} [options] */
export const lexed = (source, options) => new Marked(cjk, { ...options }).lexer(source)
