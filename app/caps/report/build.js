// SPDX-License-Identifier: MIT
// A report for support (D771), made from what the room gathers (report.js), anonymous by construction: what Jean names itself passes
// (capability ids, providers and models, tool names and kinds, rules, catalogued connections, versions), and whatever the person wrote,
// named or keyed becomes its shape, how long and in which script; an address, its kind; an id or a path, one drawn for the report, the
// same wherever it comes back, so that a stand-in made from it holds together (standin.js) and nothing leads back. Pure: node --test.

/** @import { Envelope } from '../../core/types.js' */

/** @typedef {{ text: number, script: string }} Shape a text as a report keeps it: its length, and the script most of its letters are in */

const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Devanagari', 'Bengali', 'Thai', 'Hangul', 'Hiragana', 'Katakana', 'Han', 'Ethiopic']
const LETTERS = new Map(SCRIPTS.map((name) => [name, new RegExp(`\\p{Script=${name}}`, 'gu')]))
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
// What says only when or how often: a cron line, an ISO time or length of time.
const TIMING = /^(?:[\d*/,\- ]{5,40}|\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?|P(?:\d+[YMWD])*(?:T(?:\d+[HMS])+)?)$/

/** Which script most of a text's letters are in. @param {string} text */
export function scriptOf(text) {
  let [best, most] = ['Common', 0]
  for (const [name, letters] of LETTERS) { const count = text.match(letters)?.length ?? 0; if (count > most) [best, most] = [name, count] }
  // Japanese is kana, among Han or not.
  return /^(Han|Hiragana|Katakana)$/.test(best) && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? 'Japanese' : best
}

/** @param {string} text @returns {Shape} */
export const shape = (text) => ({ text: [...text].length, script: scriptOf(text) })

/**
 * What a log line keeps: its first line, and the frames of Jean's own files as paths after its address; quoted words, addresses,
 * email addresses, paths, ids and long numbers each a mark. @param {string} text @param {string} [stack] @param {string} [origin] Jean's own
 */
export function scrub(text, stack = '', origin = '') {
  const hide = (/** @type {string} */ line) => line
    .replace(/(["'“‘«`])(?:(?!\1)[^\n]){1,400}?(["'”’»`])/g, '‹…›')
    .replace(/\b(?:https?|wss?|blob|data|file|mailto):[^\s)>\]]+/gi, '‹address›')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '‹email›')
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.\-~ ]+){2,}/g, '‹path›')
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, '‹id›')
    .replace(/\d{4,}/g, '‹number›')
  const frames = stack.split('\n').filter((line) => origin && line.includes(origin)).slice(0, 6)
    .map((line) => line.trim().replace(origin, '').replace(/[^\w ./:@<>-]/g, '').slice(0, 120))
  return [hide(text.split('\n')[0] ?? '').slice(0, 300), ...frames].join('\n')
}

/**
 * Draws ids for what the report names, the same each time a thing comes back: a task, a project, a brain, a connection. Counted,
 * never derived from the real id. @returns {(real: string, kind?: string) => string}
 */
export function aliases() {
  const given = new Map()
  return (real, kind = 'x') => given.get(real) ?? given.set(real, `${kind}${[...given.values()].filter((one) => one.startsWith(kind)).length + 1}`).get(real)
}

/**
 * An address as its kind: a provider's own, this computer's port, Jean's own host, or elsewhere.
 * @param {unknown} url @param {{ defaults?: string[], origin?: string }} [known]
 */
export function addressOf(url, { defaults = [], origin = '' } = {}) {
  if (typeof url !== 'string' || !url) return ''
  if (defaults.includes(url.replace(/\/+$/, ''))) return 'default'
  try {
    const at = new URL(url, origin || undefined)
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(at.hostname)) return `local:${at.port || (at.protocol === 'https:' ? 443 : 80)}`
    if (origin && at.origin === new URL(origin).origin) return 'own'
    return at.protocol === 'mailto:' ? 'mail' : 'elsewhere'
  } catch { return 'elsewhere' }
}

/**
 * Walks what policy, a parsed file or a call's arguments hold: true, false, numbers and null as they are; a string Jean names itself,
 * or a timing, as it is; an address, its kind; an id, drawn; anything else, its shape. Keys stay when they read as a name in code.
 * @param {unknown} value @param {{ words: Set<string>, alias: (real: string, kind?: string) => string, origin?: string }} known
 * @returns {unknown}
 */
export function walk(value, known, depth = 0) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    if (known.words.has(value) || TIMING.test(value)) return value
    if (ULID.test(value)) return known.alias(value, 'id')
    if (/^(?:https?|wss?|mailto):/i.test(value)) return { address: addressOf(value, { origin: known.origin }) }
    return shape(value)
  }
  if (depth > 8) return null
  if (Array.isArray(value)) return value.slice(0, 50).map((one) => walk(one, known, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, one], i) => [/^[A-Za-z_$][\w$.:-]{0,40}$/.test(key) ? key : ULID.test(key) ? known.alias(key, 'id') : `key${i + 1}`, walk(one, known, depth + 1)]))
  }
  return null
}

// What settings say that is never the person's own words: switches, counts, choices among Jean's own.
const SWITCHES = ['format', 'locale', 'auto', 'cloud', 'wasAuto', 'memory', 'naturalVoice', 'notifications', 'hurried', 'restored', 'terminal', 'films', 'search', 'limit', 'forget',
  'retried', 'cited', 'browsed', 'photos', 'readAloud', 'stepped', 'dictated', 'voice', 'pictures']

/**
 * Settings as a report keeps them. @param {Record<string, any>} settings
 * @param {{ words: Set<string>, alias: (real: string, kind?: string) => string, origin?: string, defaults: Record<string, string>, keyed: Set<string>, directory: Record<string, string> }} known
 *   defaults: each address's own, and each provider's (`provider:<id>`); keyed: the brains whose key is here; directory: the connections Jean lists, by address
 */
export function settingsOf(settings, known) {
  const kept = Object.fromEntries(SWITCHES.filter((key) => key in settings).map((key) => [key, typeof settings[key] === 'string' && !known.words.has(settings[key]) && key !== 'locale' ? shape(settings[key]) : settings[key]]))
  const ids = (/** @type {unknown} */ list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && known.words.has(id)) : undefined)
  const count = (/** @type {unknown} */ list) => (Array.isArray(list) ? list.length : undefined)
  const pages = settings.pages ?? {}
  return {
    ...kept,
    unlocked: ids(settings.unlocked), off: ids(settings.off), offers: Object.keys(settings.offers ?? {}).filter((id) => known.words.has(id)),
    rules: walk(settings.rules ?? {}, known), services: Object.fromEntries(Object.entries(settings.services ?? {}).map(([id, rules]) => [known.alias(id, 'c'), walk(rules, known)])),
    guards: count(settings.guards), urls: Object.fromEntries(Object.entries(settings.urls ?? {}).map(([key, url]) => [key, addressOf(url, { origin: known.origin, defaults: [known.defaults[key] ?? ''] }) || 'none'])),
    look: settings.look && { id: known.words.has(settings.look.id) ? settings.look.id : settings.look.id ? 'own' : undefined, touched: Object.keys(settings.look).filter((key) => key !== 'id') },
    pages: Object.fromEntries(Object.entries(pages).map(([key, on]) => [key, Array.isArray(on) ? on.length : on])), searches: ids(settings.searches),
    sources: count(settings.sources), windowed: count(settings.windowed), meet: count(settings.meet), maskWords: count(settings.maskWords), grouped: count(settings.grouped),
    certificates: settings.certificates, computer: settings.computer ? walk(settings.computer, known) : undefined,
    brains: (settings.brains ?? []).map((/** @type {Record<string, any>} */ brain) => brainOf(brain, known)), activeBrain: settings.activeBrain ? known.alias(settings.activeBrain, 'b') : null,
    connections: (settings.connections ?? []).map((/** @type {Record<string, any>} */ one) => connectionOf(one, known)),
  }
}

/** A brain: its provider and model, how it is reached, whether its key is here. @param {Record<string, any>} brain @param {Parameters<typeof settingsOf>[1]} known */
export const brainOf = (brain, known) => ({ id: known.alias(brain.id, 'b'), provider: brain.provider, api: brain.api, model: brain.model, address: addressOf(brain.baseURL, { origin: known.origin, defaults: [known.defaults[`provider:${brain.provider}`] ?? ''] }),
  ...(brain.label && { label: shape(brain.label) }), ...(brain.effort && { effort: brain.effort }), ...(brain.trains !== undefined && { trains: brain.trains }), ...(brain.auth && { auth: brain.auth }),
  ...(brain.jurisdiction && { jurisdiction: brain.jurisdiction }), ...(brain.projects && { projects: brain.projects.map((/** @type {string} */ id) => known.alias(id, 'p')) }), headers: Object.keys(brain.headers ?? {}).length, key: known.keyed.has(brain.id) })

/** A connection: which of the directory's, or one of the person's own, and how it signs in. @param {Record<string, any>} one @param {Parameters<typeof settingsOf>[1]} known */
export const connectionOf = (one, known) => ({ id: known.alias(one.id, 'c'), known: known.directory[one.url] ?? 'own',
  address: addressOf(one.url, { origin: known.origin }), auth: one.auth, servers: one.servers?.length ?? 0, gateway: Boolean(one.gateway), ...(one.projects && { projects: one.projects.map((/** @type {string} */ id) => known.alias(id, 'p')) }) })

/**
 * A task's last requests, as a skeleton: when each record came after the task began, what it is, how long it took and how it ended, its
 * words as shapes, or as they are when the person chose to include them. @param {Envelope[]} records @param {{ alias: (real: string, kind?: string) => string, tools: Set<string>, words: Set<string>, origin?: string, include: boolean }} known
 */
export function skeleton(records, known, turns = 3) {
  const requests = records.flatMap((record, i) => (record.update?.sessionUpdate === 'user_message_chunk' && record.update.content.type === 'text' ? [i] : []))
  const from = requests.at(-turns) ?? 0, began = Date.parse(records[0]?.at ?? '') || 0
  const text = (/** @type {string} */ words) => (known.include ? words : shape(words))
  return records.slice(from).map((record) => {
    const at = (Date.parse(record.at) || began) - began, by = record.by === 'jean' ? 'jean' : record.by === 'user' ? 'person' : 'device'
    const u = /** @type {Record<string, any> | undefined} */ (record.update)
    if (!u) return { at, by, meta: Object.keys(record.meta ?? {}) }
    const type = u.sessionUpdate
    if (type === 'user_message_chunk') return { at, by, type, ...(u.content.type === 'text' ? { text: text(u.content.text) } : { file: { type: u.content.mimeType, size: u.content.size, name: shape(String(u.content.name ?? '')), pages: u.content._meta?.pages?.length } }), ...(u._meta?.steer && { steer: true }) }
    if (type === 'agent_message_chunk' || type === 'agent_thought_chunk') return { at, by, type, text: text(u.content?.text ?? '') }
    if (type === '_system_note') return { at, by, type, note: u.data?.kind ?? '' }
    if (type === 'tool_call') {
      const meta = u._meta ?? {}, out = u.rawOutput ?? {}
      const common = { at, by, type, status: u.status, ms: meta.ms, ...(meta.limitedUse && { limitedUse: true }), ...(meta.parent && { helper: true }), ...(out.code && { code: out.code }), ...(out.status && { http: out.status }) }
      if (!u.name) return { ...common, brain: { provider: u.rawInput?.provider, model: u.rawInput?.model, local: u.rawInput?.local, ...(u.rawInput?.auto && { auto: u.rawInput.auto }), ...(u.rawInput?.effort && { effort: u.rawInput.effort }) },
        first: meta.first, spoke: meta.spoke, ...(meta.retrying && { retrying: true }), ...(meta.stopped && { stopped: meta.stopped }), stop: out.stopReason, usage: out.usage, ...(out.error && { error: scrub(String(out.error)) }) }
      return { ...common, tool: known.tools.has(u.name) ? u.name : 'other', kind: u.kind, ...(meta.by && { decidedBy: known.words.has(meta.by) ? meta.by : 'other' }), ...(meta.declined && { declined: true }),
        ...(meta.waiting && { waiting: true }), args: known.include ? u.rawInput : walk(u.rawInput ?? {}, known), ...(out.error && { error: scrub(String(out.error)) }) }
    }
    if (type === 'plan') return { at, by, type, entries: u.entries?.map((/** @type {{ status: string, content: string }} */ entry) => ({ status: entry.status, content: text(entry.content) })) }
    return { at, by, type, ...(u.status && { status: u.status }) }
  })
}

/**
 * The report. @param {Gathered} given @returns {Record<string, any>}
 * @typedef {{ made: number, why: string, origin: string, jean: Record<string, unknown>, browser: Record<string, unknown>, settings: Record<string, any>, policy?: Record<string, unknown> | null,
 *   words: string[], tools: string[], defaults: Record<string, string>, keyed: string[], directory: Record<string, string>, projects: { dir: string, data: Record<string, unknown>, body: string, current: boolean }[],
 *   skills: { name: string, source?: string, blocks?: string[], body: string, ready: boolean }[], routines: Record<string, unknown>[], flows: number, memory: number,
 *   extensions: { name: string, source: string, hooks: string[], slots: string[], rights: string[], on: boolean, failed?: boolean }[], status: Record<string, { tools?: unknown[], error?: string }>,
 *   now: { busy: boolean, presence: string, task: string | null, runs: { path: string, provider: string, model: string, steps: number, stopped: boolean }[], trail: import('../../ui/trail.js').Trail | null,
 *     ended: import('../../ui/trail.js').Trail[], attempts: import('../../ui/trail.js').Attempt[], waiting: { path?: string, kind: string }[], hooks: { by: string, on: string, tier: string }[], loaded: string[], denied: string[], coming?: string[],
 *     probes: Record<string, string | number> }, task: { path: string, records: Envelope[] } | null, include: boolean, log: { at: number, level: string, text: string, stack?: string }[] }} Gathered
 */
export function build(given) {
  const alias = aliases(), words = new Set(given.words), tools = new Set(given.tools)
  const known = { words, alias, origin: given.origin, defaults: given.defaults, keyed: new Set(given.keyed), directory: given.directory }
  const where = (/** @type {string | null | undefined} */ path) => (path ? alias(path, path.includes('/conversations/') ? 't' : 'p') : null)
  const trailOf = (/** @type {import('../../ui/trail.js').Trail} */ one) => ({ task: where(one.path), outcome: one.outcome, ended: one.ended, began: one.began - given.made,
    stages: one.stages.map((stage) => ({ ...stage, ...(stage.by && { by: words.has(stage.by) ? stage.by : 'other' }) })) })
  const { now } = given
  return {
    format: 1, kind: 'report', made: new Date(given.made).toISOString(), why: given.why, words: given.include, jean: given.jean, browser: given.browser,
    settings: settingsOf(given.settings, known), policy: given.policy ? walk(given.policy, known) : null,
    context: {
      projects: given.projects.map((project) => ({ id: where(project.dir), current: project.current, home: project.data.default === true, cloud: project.data.cloud, folder: Boolean(project.data.folder),
        name: shape(String(project.data.name ?? '')), assistantName: Boolean(project.data.assistantName), instructions: shape(project.body) })),
      connections: (given.settings.connections ?? []).map((/** @type {{ id: string }} */ one) => ({ id: alias(one.id, 'c'), tools: given.status[one.id]?.tools?.length ?? 0, ...(given.status[one.id]?.error && { error: given.status[one.id].error }) })),
      extensions: given.extensions.map((one) => ({ name: one.source === 'listed' ? one.name : shape(one.name), source: one.source, hooks: one.hooks.filter((on) => words.has(on)), slots: one.slots.filter((slot) => words.has(slot)), rights: one.rights.filter((right) => words.has(right)), on: one.on, ...(one.failed && { failed: true }) })),
      skills: given.skills.map((skill) => ({ name: skill.ready ? skill.name : shape(skill.name), ready: skill.ready, source: skill.ready ? 'ready' : /^https:/.test(skill.source ?? '') ? 'index' : skill.source ?? 'own', blocks: skill.blocks, body: shape(skill.body) })),
      routines: given.routines.map((routine) => walk(routine, known)), flows: given.flows, memory: given.memory,
    },
    now: { busy: now.busy, presence: now.presence, task: where(now.task),
      runs: now.runs.map((run) => ({ task: where(run.path), provider: run.provider, model: run.model, steps: run.steps, stopped: run.stopped })),
      trail: now.trail ? trailOf(now.trail) : null, ended: now.ended.map(trailOf),
      attempts: now.attempts.map((one) => ({ ago: given.made - one.at, busy: one.busy, asked: one.asked, reached: one.reached, outcome: one.outcome })),
      waiting: now.waiting.map((one) => ({ task: where(one.path), kind: one.kind })),
      hooks: now.hooks.map((hook) => `${words.has(hook.by) ? hook.by : 'other'} ${hook.on} ${hook.tier}`),
      capabilities: { loaded: now.loaded, denied: now.denied, coming: now.coming }, probes: now.probes },
    task: given.task && { id: where(given.task.path), records: given.task.records.length, last: skeleton(given.task.records, { ...known, tools, include: given.include }) },
    log: given.log.map((line) => ({ ago: given.made - line.at, level: line.level, text: scrub(line.text, line.stack, given.origin) })),
  }
}

/** The report as Markdown, for a link's page: the main facts, where it was, then all of it as JSON. @param {Record<string, any>} report @param {(key: string, params?: Record<string, string | number>) => string} t */
export function markdown(report, t) {
  const stage = (report.now.trail ?? report.now.ended[0])?.stages.at(-1)
  const browser = [...(report.browser.brands ?? []).filter((/** @type {{ brand: string }} */ one) => !/Not.A.Brand/i.test(one.brand)).map((/** @type {{ brand: string, version: string }} */ one) => `${one.brand} ${one.version}`), report.browser.platform, report.browser.platformVersion].filter(Boolean).join(' · ')
  return [`# ${t('report.title')}`, '', `- ${t('report.row.version')}: ${report.jean.version ?? '?'} (${report.jean.host})`, `- ${t('report.row.browser')}: ${browser || report.browser.userAgent}`,
    `- ${report.made} · ${report.why}${stage ? ` · ${[stage.id, stage.by, stage.on, stage.brain, stage.kind].filter(Boolean).join(' ')}` : ''}`, '', '```json', JSON.stringify(report, null, 2), '```', ''].join('\n')
}
