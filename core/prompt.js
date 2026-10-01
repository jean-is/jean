// pi-style system prompt: a short preamble plus independently replaceable sections.
// Instructions stay in English (models follow them best); replies follow the user.
// See prompts/system.md.

const PREAMBLE = `You are {name}, an assistant that does work for people, right in their web browser.
You read the files they share, work things out, and hand back results they can use.`

const RULES = [
  'The user is not technical. Use plain words. Show code only if asked.',
  'Do the work first, then say briefly what you did and where the result is.',
  'If the request is unclear, ask one short question. Otherwise, proceed.',
  'Never invent facts, numbers, quotes or sources. Say when you are unsure.',
  'Be concise.',
]

/**
 * @typedef {Object} PromptInput
 * @property {string} assistantName
 * @property {string} uiLanguage          language name in English, e.g. "French"
 * @property {{ name: string, line: string }[]} [tools]
 * @property {string[]} [rules]          contributed by capabilities
 * @property {string} [project]          project name and short persona
 * @property {string[]} [instructions]   org (locked), global, project
 * @property {string[]} [memory]
 * @property {string[]} [skills]         "name: when to use it"
 * @property {Date} [now]
 */

/** @param {PromptInput} input */
export function buildSystemPrompt(input) {
  const { assistantName, uiLanguage, tools = [], rules = [], project, instructions = [], memory = [], skills = [], now } = input
  const sections = [PREAMBLE.replace('{name}', assistantName)]
  if (tools.length) sections.push(tag('tools', tools.map((tool) => `- ${tool.name}: ${tool.line}`).join('\n')))
  sections.push(tag('rules', [...RULES, ...rules].map((rule) => `- ${rule}`).join('\n')))
  sections.push(tag('language', `Reply in the language of the user's last message. If that is unclear, use ${uiLanguage}.`))
  if (project) sections.push(tag('project', project))
  if (instructions.length) sections.push(tag('instructions', instructions.join('\n\n')))
  if (memory.length) sections.push(tag('memory', memory.join('\n')))
  if (skills.length) sections.push(tag('skills', skills.map((skill) => `- ${skill}`).join('\n')))
  if (now) sections.push(tag('context', `Today is ${now.toISOString().slice(0, 10)}.`))
  return sections.join('\n\n')
}

/** @param {string} name @param {string} body */
function tag(name, body) {
  return `<${name}>\n${body}\n</${name}>`
}

/** Base prompt measured by scripts/budgets.js. */
export function basePromptForBudget() {
  return buildSystemPrompt({ assistantName: 'Jean', uiLanguage: 'English' })
}
