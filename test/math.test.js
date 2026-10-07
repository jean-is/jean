import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lex } from '../ui/markdown.js'
import { plainText } from '../ui/spoken.js'

/** What a text shows, in order: its words, and its formulas as [source], or [[source]] when set apart. @param {string} source */
function shown(source) {
  /** @type {string[]} */
  const out = []
  /** @param {any} token */
  const visit = (token) => {
    if (token.type === 'math') out.push(token.block ? `[[${token.text}]]` : `[${token.text}]`)
    else if (token.tokens) token.tokens.forEach(visit)
    else if (token.items || token.header) [...(token.items ?? []), ...(token.header ?? []), ...(token.rows ?? []).flat()].forEach(visit)
    else if (token.type !== 'space') out.push(token.text)
  }
  lex(source).forEach(visit)
  return out.join('')
}

test('formulas: in a line, set apart, in tables and lists', () => {
  assert.equal(shown('Convergence vers $\\varphi \\approx 1,618034$'), 'Convergence vers [\\varphi \\approx 1,618034]')
  assert.equal(shown('| Termes | Ratio |\n|---|---|\n| $F_3 / F_2$ | 1,0000 |'), 'TermesRatio[F_3 / F_2]1,0000')
  assert.equal(shown('Inline \\(a^2+b^2\\), apart \\[c^2\\] and $$d$$.'), 'Inline [a^2+b^2], apart [[c^2]] and [[d]].')
  assert.equal(shown('Before\n$$\n\\frac{a}{b}\n- c\n$$\nAfter'), 'Before[[\\frac{a}{b}\n- c]]After')
  assert.equal(shown('- item $\\alpha_1$ and $\\beta_2$'), 'item [\\alpha_1] and [\\beta_2]')
})

test('formulas: prices, escapes and code stay text', () => {
  assert.equal(shown('It costs $5 and $10, or 5 $ et 10 $, or $5-$10.'), 'It costs $5 and $10, or 5 $ et 10 $, or $5-$10.')
  assert.equal(shown('Escaped \\$x\\$ stays.'), 'Escaped $x$ stays.')
  assert.equal(shown('`$x$` and\n\n```\n$$y$$\n```'), '$x$ and$$y$$')
})

test('formulas: read aloud as symbols', () => {
  assert.equal(plainText('Convergence vers $\\varphi \\approx 1,618034$'), 'Convergence vers φ ≈ 1,618034')
  assert.equal(plainText('$$\\sin^2 \\theta + \\cos^2 \\theta = 1$$'), 'sin² θ + cos² θ = 1')
  assert.equal(plainText('Area $\\pi r^2$, $\\frac{1}{2}$ and $\\Delta x \\le 10\\,\\text{cm}$'), 'Area π r², 1/2 and Δ x ≤ 10 cm')
  assert.equal(plainText('It costs $5 and $10.'), 'It costs $5 and $10.')
})
