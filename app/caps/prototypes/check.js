// The check of a prototype (D742) from its files: a site's (../sites/check.js) less what only a site for strangers needs (a description,
// a card, a header and a foot, forms its host receives), and a prototype's own rules: a page per step, nothing kept but the address, no
// alert(). What pressing its controls finds (./press.js) joins it: the pages nobody reaches, the controls that do nothing. Pure: node tests
// run it, and npm run prototypes measures brains with it.
import { checkFiles } from '../sites/check.js'
import { parse, elements } from '../sites/html.js'

/** What pressing every control from the first page found: each page reached, where each leads, the controls that did nothing. @typedef {{ screens: string[], reached: string[], followed: number, pressed: number, dead: string[], unsure: number, leads: [string, string[]][], errors: number }} Flow */
/** @typedef {import('../sites/check.js').Report & { flow?: Flow }} Report */

/** What only a site for strangers needs, which a prototype's pages don't. */
const SITE_ONLY = [/: its description is /, /: its card for shared links/, /top \(header\), not one/, /foot \(footer\), not one/, /a form sends to /, /a form doesn’t send with method="post"/,
  /a form has no data-form name/, /nothing leads to it from index\.html/, /navigations has no name/]

/** A site's words, said of a prototype. @param {string} problem */
const said = (problem) => problem
  .replace('a field asks for a password; a site never does', 'a field asks for a password; a prototype never does: show signing in as a button such as “Continue as Sara”')
  .replace('a field asks for a card or bank number; a site never takes payments', 'a field asks for a card or bank number; a prototype never does: write the card as words (“Visa ending 4242, sample”) above a Pay button that leads to the next page')
  .replace('the page a visitor lands on', 'its first page')
  .replace(/\bsite\.js\b/g, 'prototype.js').replace(/\bthe site’s\b/g, 'the prototype’s').replace(/\bthe site has\b/g, 'the prototype has').replace(/\ba site\b/g, 'a prototype').replace(/\bthe site\b/g, 'the prototype')

/** The check from the files alone. @param {Map<string, Uint8Array>} files @returns {Report} */
export function checkScreens(files) {
  const found = checkFiles(files), decode = (/** @type {Uint8Array} */ bytes) => new TextDecoder().decode(bytes)
  const problems = found.problems.filter((problem) => !SITE_ONLY.some((pattern) => pattern.test(problem))).map(said)
  if (found.pages.length === 1) problems.push('it has one page; a prototype shows its flow as a page per step, each its own .html, linked from the one before')
  for (const [path, bytes] of files) {
    const type = path.toLowerCase().split('.').pop()
    const scripts = type === 'js' ? [decode(bytes)] : type === 'html' ? elements(parse(decode(bytes))).filter((element) => element.name === 'script').map((element) => element.children.join('')) : []
    for (const code of scripts) {
      const kept = /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.exec(code)?.[0]
      if (kept) problems.push(`${path}: it keeps choices in ${kept}, which Jean's frame doesn't have; carry them in the address (confirm.html?time=10:30) and read them with URLSearchParams`)
      // The browser's own alert(), confirm() and prompt(), not a function of the script's that bears the name.
      const own = new Set([...code.matchAll(/(?:function\s+|(?:const|let|var)\s+)(alert|confirm|prompt)\b/g)].map((match) => match[1]))
      for (const shown of new Set([...code.matchAll(/(?<![\w$.])(?<!function\s+)(window\.)?(alert|confirm|prompt)\s*\(/g)].filter((match) => match[1] || !own.has(match[2])).map((match) => match[2]))) {
        problems.push(`${path}: it calls ${shown}(), which Jean's frame doesn't show; write the message on the page`)
      }
    }
  }
  return { ...found, problems: [...new Set(problems)] }
}

/** Whether its flow works: every page reached from the first, no control that does nothing, no script failing. @param {Report} report */
export const flows = (report) => !!report.flow && report.flow.reached.length >= report.flow.screens.length && !report.flow.dead.length && !report.flow.errors
  && !report.problems.some((problem) => /can't be pressed|isn't in the prototype|nobody reaches it|its script failed|by its own script/.test(problem))

/** The report as the brain reads it. @param {Report} report @param {{ name: string, place: string }} prototype */
export function told(report, { name, place }) {
  const shown = report.problems.slice(0, 30), flow = report.flow
  return [
    `Prototype "${name}" is at ${place}: ${report.pages.length} ${report.pages.length === 1 ? 'page' : 'pages'}${report.languages.length ? ` in ${report.languages.join(', ')}` : ''}.`,
    ...(flow ? [`Pressed through from index.html: ${flow.reached.length} of ${flow.screens.length} pages reached, ${flow.followed} links followed and ${flow.pressed} controls pressed, ${flow.dead.length} doing nothing.`] : []),
    report.problems.length ? `Checked for phones, computers and screen readers: ${report.problems.length} to fix.` : 'Checked for phones, computers and screen readers: nothing to fix.',
    ...shown.map((problem) => `- ${problem}`),
    ...(report.problems.length > shown.length ? [`- and ${report.problems.length - shown.length} more`] : []),
    ...(report.fill.length ? [`Left to fill in: ${report.fill.join('; ')}.`] : []),
  ].join('\n')
}
