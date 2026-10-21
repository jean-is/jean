// What is read aloud, by the speaker under an answer (ui/voices.js) or in Live: a message's plain
// text, its formulas as symbols (D185). Outside the first load.
import { FORMULA } from './markdown.js'

const FORMULAS = new RegExp(FORMULA.source.slice(1), 'g')
const GREEK = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho varsigma sigma tau upsilon phi chi psi omega'.split(' ')
const SYMBOLS = /** @type {Record<string, string>} */ ({ approx: '≈', times: '×', cdot: '·', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒', sqrt: '√', sum: '∑', prod: '∏', int: '∫', partial: '∂', in: '∈', ldots: '…', cdots: '…', dots: '…', circ: '°' })

/** A formula as a voice can read it, in any language: φ ≈ 1.618, x², a/b, sin x. @param {string} tex */
function spoken(tex) {
  return tex
    .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/\^\{?(\d+)\}?/g, (_, digits) => [...digits].map((digit) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[digit]).join(''))
    .replace(/\\([a-zA-Z]+)/g, (_, name) => {
      const greek = GREEK.indexOf(name.toLowerCase().replace(/^var(?!sigma)/, ''))
      if (greek >= 0) return String.fromCodePoint((name[0] < 'a' ? 0x391 : 0x3b1) + greek)
      return SYMBOLS[name] ?? (/^(?:sin|cos|tan|log|ln|exp|lim|max|min)$/.test(name) ? name : '')
    })
    .replace(/\\([%$&#])|\\.|[{}]/g, (mark, kept) => kept ?? (mark.length > 1 ? ' ' : ''))
}

/** A message's plain text, its formulas as symbols. @param {string} source */
export function plainText(source) {
  return source
    .replace(/```[\s\S]*?```/g, '')
    .replace(FORMULAS, (_, ...found) => spoken(found.slice(0, 4).find((part) => part !== undefined) ?? ''))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // A star between figures multiplies, and only a quote's marks open a line with >.
    .replace(/(\d) ?\* ?(?=\d)/g, '$1 × ').replace(/^[ \t]*(?:>[ \t]?)+/gm, '')
    .replace(/[*_`#|~]+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
