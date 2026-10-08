// A LaTeX document as Markdown (D185), for what brains write in a ```latex block: sections, lists,
// emphasis and formulas, which Markdown's reading then lays out; the rest of a preamble goes. A block
// with none of those, or only math environments, is formulas, one per paragraph. Pure, for Node's tests.

/** Formulas, kept aside as they are: set apart, a math environment (a document's, or one a formula holds, which brains write alone too), in a line. A \\[1em] is a line break. */
const ENVIRONMENT = String.raw`\\begin\{(equation|align|alignat|gather|multline|aligned|alignedat|gathered|split|[dr]?cases|array|[pbBvV]?matrix|smallmatrix|CD)(\*?)\}[\s\S]*?\\end\{\1\2\}`
const MATH = new RegExp(String.raw`(?<!\\)\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|${ENVIRONMENT}|(?<!\\)\\\([\s\S]*?\\\)|(?<!\\)\$(?:\\.|[^\\$])+\$`, 'g')
const DOCUMENT = /\$|(?<!\\)\\[[(]|\\begin\{(?:document|itemize|enumerate)|\\(?:sub)*section|\\item\b|\\(?:textbf|textit|emph)\{/
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
  // The formulas first, so that what reads the words around them leaves their \textbf and \\ alone.
  const kept = /** @type {string[]} */ ([])
  const text = body.replace(MATH, (formula) => `\u0000${kept.push(formula) - 1}\u0000`)
  const back = (/** @type {string} */ markdown, apart = false) => markdown.replace(/\u0000(\d+)\u0000/g, (_, i) => (apart && kept[i].startsWith('\\begin') ? `\n\\[${kept[i]}\\]\n` : kept[i]))
  if (!DOCUMENT.test(body.replace(new RegExp(ENVIRONMENT, 'g'), ''))) return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((formula) => `\\[${back(formula)}\\]`).join('\n\n')
  return back(prose(text
    .replace(/\\maketitle/, title ? `\n\n## ${title}\n\n` : '')
    .replace(HEADING, (_, level, words) => `\n\n${LEVELS[level]} ${words}\n\n`)
    .replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (_, kind, items) => `${items.replace(/\s*\\item\s*/g, kind === 'itemize' ? '\n- ' : '\n1. ')}\n\n`)
    .replace(new RegExp(String.raw`\\textbf` + ARGUMENT, 'g'), '**$1**')
    .replace(new RegExp(String.raw`\\(?:textit|emph)` + ARGUMENT, 'g'), '*$1*')), true)
}

/** What is whole of a block still being written: its finished lines, what they open closed, a row break they end on gone. @param {string} source */
export function wholeSoFar(source) {
  const lines = source.slice(0, source.lastIndexOf('\n') + 1)
  const closing = /** @type {string[]} */ ([])
  for (const [mark, name] of lines.matchAll(/\\begin\{([^{}]*)\}|\\end\{[^{}]*\}|(?<!\\)\\[[\]]|\$\$/g)) {
    if (name !== undefined) closing.push(`\\end{${name}}`)
    else if (mark === '\\[' || (mark === '$$' && closing.at(-1) !== '$$')) closing.push(mark === '$$' ? '$$' : '\\]')
    else closing.pop()
  }
  return closing.length ? `${lines.replace(/\s*(?:\\\\(?:\[[^\]]*\])?)?\s*$/, '')}\n${closing.reverse().join('\n')}` : lines
}

/** The words around the formulas: breaks and typography; what lays a page out goes. @param {string} text */
const prose = (text) => text
  .replace(new RegExp(String.raw`\\(?:underline|textrm|textsc|mbox)` + ARGUMENT, 'g'), '$1')
  .replace(/\\\\(?:\[[^\]]*\])?|\\newline\b/g, '  \n')
  .replace(/\\(?:noindent|centering|par|newpage|clearpage|(?:small|med|big)skip)\b|\\(?:[vh]space|label)\*?\{[^{}]*\}/g, '')
  .replace(/\\(LaTeX|TeX)\b/g, '$1').replace(/\\(?:ldots|dots)\b/g, '…')
  .replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”').replace(/~/g, ' ')
