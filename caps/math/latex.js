// A LaTeX document as Markdown (D185), for what brains write in a ```latex block: sections, lists,
// emphasis and formulas, which Markdown's reading then lays out; the rest of a preamble goes. A
// block with none of those is formulas, one per paragraph. Pure, so Node's tests run it.

/** Formulas, kept as they are, and display environments, set apart for Temml. */
const MATH = /(\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|\$(?:\\.|[^\\$])+\$)/
const DISPLAY = /\\begin\{(equation|align|gather|multline)(\*?)\}[\s\S]*?\\end\{\1\2\}/g
const DOCUMENT = /\$|\\[[(]|\\begin\{(?:document|itemize|enumerate|equation|align|gather|multline)|\\(?:sub)*section|\\item\b|\\(?:textbf|textit|emph)\{/
/** A command's argument, which may hold one level of braces. */
const ARGUMENT = String.raw`\{((?:[^{}]|\{[^{}]*\})*)\}`
const HEADING = new RegExp(String.raw`\\(section|subsection|subsubsection)\*?` + ARGUMENT, 'g')
const LEVELS = /** @type {Record<string, string>} */ ({ section: '##', subsection: '###', subsubsection: '####' })

/** @param {string} source */
export function latexToMarkdown(source) {
  const title = new RegExp(String.raw`\\title` + ARGUMENT).exec(source)?.[1]
  const body = (/\\begin\{document\}([\s\S]*?)(?:\\end\{document\}|$)/.exec(source)?.[1] ?? source)
    .replace(/^[ \t]+/gm, '')
    .replace(/(^|[^\\])%.*$/gm, '$1')
  if (!DOCUMENT.test(body)) return body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((formula) => `\\[${formula}\\]`).join('\n\n')
  return body
    .replace(/\\maketitle/, title ? `\n\n## ${title}\n\n` : '')
    .replace(HEADING, (_, level, words) => `\n\n${LEVELS[level]} ${words}\n\n`)
    .replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (_, kind, items) => `${items.replace(/\s*\\item\s*/g, kind === 'itemize' ? '\n- ' : '\n1. ')}\n\n`)
    .replace(new RegExp(String.raw`\\textbf` + ARGUMENT, 'g'), '**$1**')
    .replace(new RegExp(String.raw`\\(?:textit|emph)` + ARGUMENT, 'g'), '*$1*')
    .replace(DISPLAY, (formula) => `\n\\[${formula}\\]\n`)
    .split(MATH)
    .map((part, i) => (i % 2 ? part : prose(part)))
    .join('')
}

/** Text between formulas: breaks and typography; what lays a page out goes. @param {string} text */
const prose = (text) => text
  .replace(new RegExp(String.raw`\\(?:underline|textrm|textsc|mbox)` + ARGUMENT, 'g'), '$1')
  .replace(/\\\\(?:\[[^\]]*\])?|\\newline\b/g, '  \n')
  .replace(/\\(?:noindent|centering|par|newpage|clearpage|(?:small|med|big)skip)\b|\\(?:[vh]space|label)\*?\{[^{}]*\}/g, '')
  .replace(/\\(LaTeX|TeX)\b/g, '$1').replace(/\\(?:ldots|dots)\b/g, '…')
  .replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”').replace(/~/g, ' ')
