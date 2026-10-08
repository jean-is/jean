import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lex, withFormulas } from '../ui/markdown.js'
import { plainText } from '../ui/spoken.js'
import { latexToMarkdown, wholeSoFar } from '../caps/math/latex.js'

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

test('formulas in a request or a follow-up: drawn in the line, nothing else read as Markdown', () => {
  /** @param {string} text */
  const parts = (text) => withFormulas(text, (token) => token).filter(Boolean)
  assert.deepEqual(parts('Démontre la formule $e^{ix}=\\cos x+i\\sin x$'), ['Démontre la formule ', { text: 'e^{ix}=\\cos x+i\\sin x' }])
  assert.deepEqual(parts("Explique l'indicatrice d'Euler $\\varphi(n)$ et \\(n!\\) *ici*"), ["Explique l'indicatrice d'Euler ", { text: '\\varphi(n)' }, ' et ', { text: 'n!' }, ' *ici*'])
  assert.deepEqual(parts('$$a$$ then \\[ b \\]'), [{ text: 'a' }, ' then ', { text: 'b' }])
  assert.deepEqual(parts('It costs $5 and $10, or 5 $ et 10 $.'), ['It costs $5 and $10, or 5 $ et 10 $.'])
  assert.deepEqual(parts('Escaped \\$x$ stays'), ['Escaped \\$x$ stays'])
})

test('formulas: read aloud as symbols', () => {
  assert.equal(plainText('Convergence vers $\\varphi \\approx 1,618034$'), 'Convergence vers φ ≈ 1,618034')
  assert.equal(plainText('$$\\sin^2 \\theta + \\cos^2 \\theta = 1$$'), 'sin² θ + cos² θ = 1')
  assert.equal(plainText('Area $\\pi r^2$, $\\frac{1}{2}$ and $\\Delta x \\le 10\\,\\text{cm}$'), 'Area π r², 1/2 and Δ x ≤ 10 cm')
  assert.equal(plainText('It costs $5 and $10.'), 'It costs $5 and $10.')
})

test('a LaTeX document: sections, lists, emphasis and formulas, its preamble gone', () => {
  const euler = String.raw`\section*{Formules d'Euler}

\subsection*{1. Formule d'Euler}
\[ e^{i\pi} + 1 = 0 \]
Pour un cube : $8 - 12 + 6 = 2$.`
  assert.equal(shown(latexToMarkdown(euler)), "Formules d'Euler1. Formule d'Euler[[e^{i\\pi} + 1 = 0]]Pour un cube : [8 - 12 + 6 = 2].")
  assert.deepEqual(lex(latexToMarkdown(euler)).filter((token) => token.type === 'heading').map((token) => token.depth), [2, 3])
  const doc = String.raw`\documentclass{article}
\title{Notes}
\begin{document}
\maketitle
Some \textbf{bold}, \emph{a $\{x\}$ set} and~more -- 50\% % a comment
\begin{enumerate}
  \item One $x$
  \item Two
\end{enumerate}
\begin{align*} a &= b \\ c &= d \end{align*}
\end{document}`
  const markdown = latexToMarkdown(doc)
  assert.match(markdown, /^## Notes$/m)
  assert.match(markdown, /Some \*\*bold\*\*, \*a \$\\\{x\\\}\$ set\* and\u00a0more – 50\\%\s*\n/)
  assert.match(markdown, /\n1\. One \$x\$\n1\. Two\n/)
  assert.equal(shown(markdown).endsWith('[[\\begin{align*} a &= b \\\\ c &= d \\end{align*}]]'), true)
  assert.doesNotMatch(markdown, /documentclass|comment|maketitle/)
})

test('a LaTeX block of math environments alone: one formula each, its words and breaks left to Temml', () => {
  const proof = String.raw`\begin{aligned}
&\textbf{Théorème : } \forall x\in\mathbb{R},\quad e^{ix}=\cos x+i\sin x\\[1.2em]
&\text{Étape 1 : } z=ix \;\Rightarrow\; e^{ix}=\sum_{n=0}^{\infty}\frac{(ix)^n}{n!}\qquad\blacksquare
\end{aligned}`
  assert.equal(shown(latexToMarkdown(proof)), `[[${proof}]]`)
  assert.equal(shown(latexToMarkdown('f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{sinon} \\end{cases}')), '[[f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{sinon} \\end{cases}]]')
  const doc = String.raw`\section*{Preuve}
\begin{gathered}
\textbf{a} = b \\[2pt] c
\end{gathered}
Donc $\textbf{x}$ et \textbf{fin}.\\[4pt]
Suite`
  assert.equal(shown(latexToMarkdown(doc)).startsWith('Preuve[[\\begin{gathered}\n\\textbf{a} = b \\\\[2pt] c\n\\end{gathered}]]Donc [\\textbf{x}] et fin.'), true)
  assert.match(latexToMarkdown(doc), / et \*\*fin\*\*\.\s+Suite$/)
})

test('a LaTeX block still being written: its finished lines, what they open closed', () => {
  assert.equal(wholeSoFar('\\begin{aligned}\n&a\\\\\n&\\textbf{b}\\\\[1.2em]\n&\\textbf{Th'), '\\begin{aligned}\n&a\\\\\n&\\textbf{b}\n\\end{aligned}')
  assert.equal(wholeSoFar('\\[ \\begin{cases} 1 \\\\\n0 & x'), '\\[ \\begin{cases} 1\n\\end{cases}\n\\]')
  assert.equal(wholeSoFar('\\section*{A}\n$$\nx^2\n$$\nSoit $y$ et\n'), '\\section*{A}\n$$\nx^2\n$$\nSoit $y$ et\n')
  assert.equal(wholeSoFar('Soit\n$$\nx +'), 'Soit\n$$\n$$')
  assert.equal(wholeSoFar('\\begin{aligned}'), '')
  assert.equal(shown(latexToMarkdown(wholeSoFar('\\begin{aligned}\n&a = 1\\\\\n&b ='))), '[[\\begin{aligned}\n&a = 1\n\\end{aligned}]]')
})

test('a LaTeX block with only formulas: one each paragraph', () => {
  assert.equal(shown(latexToMarkdown('\\frac{a}{b} = c\n\n  \\sqrt{2}\n')), '[[\\frac{a}{b} = c]][[\\sqrt{2}]]')
})
