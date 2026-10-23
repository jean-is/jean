// Set by a parent (D228): what a parent sets in a child's profile, kept in its parent.json in
// policy.json's shape, so that what honours an organisation's policy honours it too: the brains and
// rules as the parent left them, the sources web search reads, capabilities turned off, the picture
// check at its strictest, and instructions made from the child's age and a choice for each topic.
// Plain data, which node --test reads.

/** Where it is kept, in the child's profile. */
export const TIER = 'parent.json'
/** The topics a parent chooses for, by their words in the prompt. */
export const TOPICS = /** @type {const} */ ({
  sexuality: 'sexuality and relationships', violence: 'violence and crime in detail', drugs: 'drugs, alcohol and tobacco',
  frightening: 'frightening content', gambling: 'gambling', weapons: 'weapons', extremism: 'extremism and hate',
  body: 'dieting and body image', death: 'death and grief',
})
/** @typedef {keyof typeof TOPICS} Topic */
/** Explain for their age, Talk with us first, or Later. */
export const CHOICES = /** @type {const} */ (['explain', 'parent', 'later'])
/** @typedef {typeof CHOICES[number]} Choice */
/** Each topic's choice at 10 or under, 11 and 12, 13 and 14, then 15 to 17: a draft for the owner to settle. @type {Record<Topic, Choice[]>} */
const BY_AGE = {
  sexuality: ['parent', 'parent', 'explain', 'explain'], violence: ['later', 'later', 'parent', 'explain'], drugs: ['explain', 'explain', 'explain', 'explain'],
  frightening: ['later', 'parent', 'explain', 'explain'], gambling: ['explain', 'explain', 'explain', 'explain'], weapons: ['later', 'parent', 'parent', 'explain'],
  extremism: ['parent', 'explain', 'explain', 'explain'], body: ['parent', 'parent', 'parent', 'parent'], death: ['parent', 'explain', 'explain', 'explain'],
}
/** What a child's profile turns off at first: services, commands on the computer, apps, and sites shown beside the conversation. */
const OFF = ['connections', 'machine', 'apps', 'browser']
/** The picture check refusing everything it can (D275, D280). */
export const STRICTEST = { suggestive: true, hate: true, violence: true, selfHarm: true }
/** What each of a child's messages comes with (D394): Learn it's steps, as if they had named it, rather than left for a brain to pick. @param {string} steps */
export const learning = (steps) => `For this message, follow the steps of the skill learn-it:\n\n${steps.trim()}`
/** The kinds of danger told to a parent (D228), by their words in the prompt. */
export const DANGERS = /** @type {const} */ ({ harm: 'self-harm or suicide', abuse: 'abuse or violence done to them', secrecy: 'an adult asking them for secrecy, pictures or a meeting', bullying: 'bullying or threats' })

/**
 * @typedef {{ format: 1, born: number, topics: Record<Topic, Choice>, searches: string[], capabilities: { deny: string[] },
 *   pictureCheck: typeof STRICTEST, brains?: import('../../core/types.js').BrainConfig[], rules?: Record<string, import('../../core/types.js').RuleValue>, by?: string, updatedAt?: string }} Tier
 */

/** The age a child reaches in the year their school year began, in September: 13 is 4e in France. @param {number} born @param {Date} [now] */
export const age = (born, now = new Date()) => now.getFullYear() - (now.getMonth() < 8 ? 1 : 0) - born

/** A child's profile as a parent first sets it, by the year they were born. @param {number} born @returns {Tier} */
export function tierFor(born) {
  const band = Math.max(0, [10, 12, 14, Infinity].findIndex((top) => age(born) <= top))
  return { format: 1, born, topics: /** @type {Record<Topic, Choice>} */ (Object.fromEntries(Object.entries(BY_AGE).map(([id, by]) => [id, by[band]]))),
    searches: age(born) < 13 ? ['vikidia'] : ['vikidia', 'wikipedia'], capabilities: { deny: OFF }, pictureCheck: STRICTEST, brains: [] }
}

/**
 * Child helplines by country, for a danger at home, or any (D228), each as Child Helpline International or CRIN's
 * list gives it (Japan's from its ministry, Malaysia's Talian Kasih); elsewhere, the brain is told to give its country's.
 */
const HELPLINES = /** @type {Record<string, string>} */ ({
  FR: '119', BE: '103', CH: '147', LU: '116 111', DE: '116 111', AT: '147', NL: '0800-0432', ES: '900 20 20 10', IT: '19696', PT: '116 111', PL: '116 111',
  UA: '116 111', RU: '8-800-2000-122', GB: '0800 1111', IE: '1800 66 66 66', US: '1-800-422-4453', CA: '1-800-668-6868', BR: '100', AU: '1800 55 1800',
  IN: '1098', BD: '1098', LK: '1929', JP: '0120-0-78310', KR: '1388', TW: '113', ID: '1500771', MY: '15999', PH: '163', TH: '1387', VN: '111',
  EG: '16000', SA: '116 111', KE: '116', TZ: '116',
})
/** The child helpline's number where the browser's language says the child is, when there is one here. @param {readonly string[]} languages */
export const helplineOf = (languages) => HELPLINES[languages.map((tag) => { try { return new Intl.Locale(tag).maximize().region } catch { return undefined } }).find(Boolean) ?? '']
/** The child helpline, as the prompt says it. @param {readonly string[]} languages */
export const helpline = (languages) => (helplineOf(languages) ? `the child helpline, ${helplineOf(languages)}` : 'their country’s child helpline')

/** The September their school year at 13 begins, from which their profile opens without their parent (D389). @param {number} born */
export const thirteen = (born) => new Date(born + 13, 8, 1)

/**
 * The tier as policy, over the organisation's if there is one, whose own come first where both set
 * something, but its capabilities turned off, which add up. @param {Tier} tier @param {Record<string, any>} policy @param {string} line
 */
export function asPolicy(tier, policy, line) {
  /** @type {Record<Choice, string>} */
  const say = { explain: 'Explain these for their age, as a school book would', parent: 'For these, say it is a good question for their parent, and help them ask it', later: 'For these, say why they are for later, without details' }
  const chosen = CHOICES.map((choice) => [choice, Object.entries(TOPICS).filter(([id]) => tier.topics[/** @type {Topic} */ (id)] === choice).map(([, words]) => words)])
  const instructions = [`The user is a child, born in ${tier.born}. Their parent set how to answer them:`,
    '- Explain what their school programme teaches as their school book does.',
    '- Help with their schoolwork by explaining and giving hints; never write work that is theirs to do.',
    `- When they tell of self-harm, abuse or another danger, answer with care, say where to find help (${line}), and urge them to tell a trusted adult.`,
    ...chosen.filter(([, words]) => words.length).map(([choice, words]) => `- ${say[/** @type {Choice} */ (choice)]}: ${/** @type {string[]} */ (words).join('; ')}.`)].join('\n')
  return { searches: tier.searches, pictureCheck: STRICTEST, ...(tier.brains && { brains: tier.brains }), ...policy, child: true, rules: { ...tier.rules, ...policy.rules },
    capabilities: { ...policy.capabilities, deny: [...tier.capabilities.deny, ...policy.capabilities?.deny ?? []], preUnlock: ['search', 'reflexes', ...policy.capabilities?.preUnlock ?? []] },
    instructions: [instructions, policy.instructions].filter(Boolean).join('\n\n') }
}
