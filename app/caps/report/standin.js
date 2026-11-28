// SPDX-License-Identifier: MIT
// A stand-in from a report (D771): the files of a profile like the one that sent it, as a backup Jean restores (caps/backup): its switches,
// rules and capabilities, its brains on their providers' own addresses with no key, the directory's connections signed out, its projects,
// its own skills, its memory and its task's last requests, every word the person wrote filler of the same length and script, so that the
// same paths run, right to left and line breaking included; a task's words as they were when they came with it. What can't be stood up
// is said beside it, in a few groups: keys and accounts, files and folders, extensions, routines and ready-made skills, the person's own
// services and addresses, the device's own choices a restore leaves as they are (a month's limit), the browser and its system, the
// organisation's policy. npm run reproduce writes settings whole. Pure: node --test.
import { ulid } from '../../core/ulid.js'
import { stringifyFrontMatter } from '../../core/settings.js'

/** @import { Shape } from './build.js' */

// Words of each script, repeated to the length a text had: spaces where the script has them.
const FILLER = /** @type {Record<string, string>} */ ({
  Latin: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ', Cyrillic: 'съешь же ещё этих мягких французских булок ', Greek: 'ξεσκεπάζω την ψυχοφθόρα βδελυγμία ',
  Arabic: 'نص حكيم له سر قاطع وذو شأن عظيم ', Hebrew: 'דג סקרן שט בים מאוכזב ', Devanagari: 'यह एक नमूना पाठ है ', Bengali: 'এটি একটি নমুনা লেখা ', Thai: 'ข้อความตัวอย่างสำหรับทดสอบ',
  Hangul: '다람쥐 헌 쳇바퀴에 타고파 ', Japanese: 'これは見本の文章です。', Han: '天地玄黄宇宙洪荒日月盈昃', Ethiopic: 'ይህ የሙከራ ጽሑፍ ነው ', Common: '0123456789 ',
})

/** Filler of a text's length, in its script. @param {Shape | string | undefined} given */
export function filler(given) {
  if (typeof given === 'string') return given
  if (!given?.text) return ''
  const words = [...(FILLER[given.script] ?? FILLER.Latin)]
  return Array.from({ length: given.text }, (_, i) => words[i % words.length]).join('').replace(/\s+$/, (end) => '.'.repeat(end.length))
}

/** A value walked for a report (build.js), filled again: shapes as filler, addresses as one nobody answers. @param {unknown} value @returns {unknown} */
export function filled(value) {
  if (Array.isArray(value)) return value.map(filled)
  if (!value || typeof value !== 'object') return value
  const keys = Object.keys(value)
  if (keys.length === 2 && 'text' in value && 'script' in value) return filler(/** @type {Shape} */ (value))
  if (keys.length === 1 && 'address' in value) return 'https://example.invalid/'
  return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, filled(one)]))
}

/** @param {Record<string, any>} report the shape the report has; the stand-in reads only what it needs */
const check = (report) => { if (report?.format !== 1 || report.kind !== 'report') throw new Error('This is not a report') }

/**
 * The stand-in's files, as a backup's, and what it can't hold. @param {Record<string, any>} report
 * @param {{ now?: Date, providers: Record<string, { api: string, baseURL: string }>, directory: Record<string, { name: string, url?: string }> }} known
 *   providers: each provider's own address; directory: the connections Jean lists, by id
 * @returns {{ files: { name: string, bytes: Uint8Array }[], missing: string[] }}
 */
export function standIn(report, { now = new Date(), providers, directory }) {
  check(report)
  const ids = new Map(), at = now.getTime(), missing = new Set()
  const idOf = (/** @type {string} */ alias) => ids.get(alias) ?? ids.set(alias, ulid(at + ids.size)).get(alias)
  const encode = (/** @type {string} */ text) => new TextEncoder().encode(text)
  /** @type {{ name: string, bytes: Uint8Array }[]} */
  const files = [{ name: 'backup.json', bytes: encode(`${JSON.stringify({ format: 1, kind: 'backup', createdAt: now.toISOString(), by: 'report' })}\n`) }]
  const add = (/** @type {string} */ name, /** @type {string} */ text) => files.push({ name, bytes: encode(text) })
  const s = report.settings ?? {}

  // Projects first: the brains, connections and the task name theirs.
  const projects = (report.context?.projects ?? []).map((/** @type {Record<string, any>} */ project, /** @type {number} */ i) => {
    const dir = `projects/${idOf(project.id ?? `p${i}`)}-${project.home ? 'home' : 'project'}`
    if (project.folder) missing.add('files')
    add(`${dir}/project.md`, stringifyFrontMatter({ format: 1, ...(project.home && { default: true }), name: filler(project.name) || 'Project', ...(project.cloud === false && { cloud: false }), createdAt: now.toISOString(), by: 'report' }, filler(project.instructions)))
    return { ...project, dir }
  })
  const home = projects.find((/** @type {{ home: boolean }} */ one) => one.home) ?? projects[0]
  const current = projects.find((/** @type {{ current: boolean }} */ one) => one.current) ?? home
  const projectIds = (/** @type {string[] | undefined} */ list) => list?.map((alias) => idOf(alias))

  const brains = (s.brains ?? []).map((/** @type {Record<string, any>} */ brain) => {
    const own = providers[brain.provider], local = /^local:(\d+)$/.exec(brain.address ?? '')
    if (brain.address === 'elsewhere' || (!own?.baseURL && !local)) missing.add('own')
    if (brain.key) missing.add('keys')
    return { id: idOf(brain.id), provider: brain.provider, api: brain.api ?? own?.api ?? 'openai', model: brain.model, baseURL: local ? `http://localhost:${local[1]}/v1` : own?.baseURL ?? '',
      ...(brain.label && { label: filler(brain.label) }), ...(brain.effort && { effort: brain.effort }), ...(brain.trains !== undefined && { trains: brain.trains }), ...(brain.jurisdiction && { jurisdiction: brain.jurisdiction }), ...(brain.projects && { projects: projectIds(brain.projects) }) }
  })
  const connections = (s.connections ?? []).flatMap((/** @type {Record<string, any>} */ one) => {
    const listed = directory[one.known]
    if (!listed?.url) return (missing.add('own'), [])
    missing.add('keys')
    return [{ id: idOf(one.id), name: listed.name, url: listed.url, auth: one.auth, ...(one.gateway && { gateway: true }), ...(one.projects && { projects: projectIds(one.projects) }) }]
  })
  const urls = Object.fromEntries(Object.entries(s.urls ?? {}).flatMap(([key, kind]) => (/^local:\d+$/.test(String(kind)) ? [[key, `http://localhost:${String(kind).slice(6)}/`]] : (kind !== 'none' && kind !== 'default' && missing.add('own'), []))))
  const plain = (/** @type {unknown} */ value) => (value && typeof value === 'object' ? undefined : value)
  const switches = Object.fromEntries(['format', 'locale', 'auto', 'cloud', 'wasAuto', 'mix', 'crossCheck', 'memory', 'naturalVoice', 'notifications', 'hurried', 'restored', 'terminal', 'films', 'search', 'limit', 'forget', 'retried', 'cited', 'browsed', 'photos', 'readAloud', 'stepped', 'dictated', 'voice', 'pictures']
    .flatMap((key) => (plain(s[key]) !== undefined ? [[key, s[key]]] : [])))
  const rules = (/** @type {Record<string, unknown> | undefined} */ given) => Object.fromEntries(Object.entries(given ?? {}).filter(([, value]) => typeof value === 'string'))
  add('settings.json', `${JSON.stringify({ format: 1, brains, activeBrain: s.activeBrain ? idOf(s.activeBrain) : null, rules: rules(s.rules), voice: null, unlocked: s.unlocked ?? [], offers: Object.fromEntries((s.offers ?? []).map((/** @type {string} */ id) => [id, now.toISOString()])),
    auto: true, cloud: true, ...switches, ...(s.off && { off: s.off }), ...(connections.length && { connections }), ...(s.services && { services: Object.fromEntries(Object.entries(s.services).map(([alias, given]) => [idOf(alias), rules(/** @type {Record<string, unknown>} */ (given))])) }),
    ...(Object.keys(urls).length && { urls }), ...(s.look?.id && { look: { id: s.look.id } }), ...(s.searches && { searches: s.searches }), ...(s.certificates && { certificates: s.certificates }) }, null, 2)}\n`)
  if (s.guards || s.maskWords) missing.add('own')
  // What a restore leaves as this device has it (caps/devices/bundle.js's STAYS), as moving to a new device does.
  if (s.limit || s.cloud === false || s.look || s.forget) missing.add('device')

  // Skills of the person's own, with their sizes; ready-made ones are added again from Skills.
  for (const [i, skill] of (report.context?.skills ?? []).entries()) {
    if (skill.ready) { missing.add('routines'); continue }
    const name = `skill-${i + 1}`
    add(`skills/${name}/SKILL.md`, stringifyFrontMatter({ name, description: filler({ text: 60, script: skill.body?.script ?? 'Latin' }), ...(skill.blocks?.length && { metadata: { blocks: skill.blocks.join(', ') } }) }, filler(skill.body)))
  }
  const remembered = Number(report.context?.memory ?? 0)
  if (remembered) add('memory.md', stringifyFrontMatter({ format: 1, kind: 'memory' }, Array.from({ length: remembered }, (_, i) => `- ${filler({ text: 48, script: 'Latin' })} <!-- at=${now.toISOString()} by=report n=${i} -->\n`).join('')))
  if (report.context?.extensions?.length) missing.add('routines')
  if (report.context?.routines?.some((/** @type {{ count: number }} */ one) => one.count) || report.context?.flows) missing.add('routines')

  // The task on screen, its last requests again.
  const task = report.task
  if (task?.last?.length && current) {
    const id = idOf(task.id ?? 't1'), created = new Date(at - (task.last.at(-1)?.at ?? 0) - 1000)
    const when = (/** @type {number} */ ms) => new Date(created.getTime() + 1000 + (ms ?? 0)).toISOString()
    const text = (/** @type {Shape | string} */ given) => filler(given)
    const records = task.last.flatMap((/** @type {Record<string, any>} */ one, /** @type {number} */ i) => {
      const by = one.by === 'jean' ? 'jean' : 'user', envelope = (/** @type {Record<string, unknown>} */ update) => [{ at: when(one.at), by, ...(by === 'jean' && { step: 0 }), update }]
      if (one.meta) return []
      if (one.type === 'user_message_chunk') return one.file ? (missing.add('files'), envelope({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: text(one.file.name) } })) : envelope({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: text(one.text) }, ...(one.steer && { _meta: { steer: true } }) })
      if (one.type === 'agent_message_chunk' || one.type === 'agent_thought_chunk') return envelope({ sessionUpdate: one.type, content: { type: 'text', text: text(one.text) } })
      if (one.type === '_system_note') return envelope({ sessionUpdate: '_system_note', text: '', data: { kind: one.note } })
      if (one.type === 'plan') return envelope({ sessionUpdate: 'plan', entries: (one.entries ?? []).map((/** @type {{ status: string, content: Shape }} */ entry) => ({ content: text(entry.content), priority: 'medium', status: entry.status })) })
      if (one.type !== 'tool_call') return []
      const meta = { ...(one.ms !== undefined && { ms: one.ms }), ...(one.limitedUse && { limitedUse: true }), ...(one.helper && { parent: 'helper' }), ...(one.declined && { declined: true }) }
      const out = { ...(one.code && { code: one.code }), ...(one.http && { status: one.http }), ...(one.error && { error: one.error }) }
      if (one.brain) return envelope({ sessionUpdate: 'tool_call', toolCallId: `brain-${i}-report`, title: one.brain.model ?? '', kind: 'think', status: one.status, rawInput: one.brain,
        rawOutput: { ...out, ...(one.stop && { stopReason: one.stop }), ...(one.usage && { usage: one.usage }) }, _meta: { ...meta, ...(one.first !== undefined && { first: one.first }), ...(one.spoke !== undefined && { spoke: one.spoke }) } })
      return envelope({ sessionUpdate: 'tool_call', toolCallId: `call-${i}-report`, name: one.tool, title: one.tool, kind: one.kind, status: one.status, rawInput: filled(one.args ?? {}), rawOutput: out,
        _meta: { ...meta, ...(one.decidedBy && { by: one.decidedBy }) } })
    })
    add(`${current.dir}/conversations/${id}.jsonl`, [{ format: 1, kind: 'conversation', id, createdAt: created.toISOString(), by: 'report' }, { at: created.toISOString(), by: 'user', meta: { title: filler({ text: 24, script: task.last.find((/** @type {{ text?: Shape }} */ one) => one.text?.script)?.text.script ?? 'Latin' }) } }, ...records]
      .map((record) => JSON.stringify(record)).join('\n') + '\n')
  }
  missing.add('browser')
  if (report.policy) missing.add('policy')
  return { files, missing: [...missing] }
}
