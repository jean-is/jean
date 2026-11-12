// SPDX-License-Identifier: MIT
// What Jean reads from elsewhere can carry instructions (threat 1, docs/trust/threat-model.md). Once a task holds some, a
// person's Always allow no longer sends anything out unasked: a service's action, a move, a delete, a command on their own
// computer, an address that neither they nor what was read gave as it is, which a brain may have written something into, or
// what would carry its words into later tasks, a routine, a memory, a skill (D673). A rule the organisation set stands, but for
// a service's call in a task someone else sent or shared, and a task whose records can't be read holds some. Pure: node --test.

/** What outlives the task, and would read as the person's own in the next. */
const CARRIES = ['schedule', 'remember', 'save_skill', 'save_flow']

/** What someone else wrote coming in: a file given, a shared task's note, or what a call read off a service or a site, an error's words too, or a helper's brain, whose own search leaves no mark. @param {{ update?: any }} record */
export const fromElsewhere = ({ update: u = {} }) => (u.sessionUpdate === 'user_message_chunk' ? u.content?.type === 'resource_link' : u.sessionUpdate === '_system_note' ? u.data?.kind === 'shared'
  : u.sessionUpdate === 'tool_call' && /^(completed|failed)$/.test(u.status) && !u._meta?.declined && Boolean(u.kind === 'fetch' || u._meta?.service || u._meta?.reached || (u.kind === 'think' && u._meta?.parent) || u._meta?.raw?.some((/** @type {any} */ block) => /search|server_tool/.test(block?.type)) || u._meta?.sources?.some((/** @type {import('../core/types.js').Source} */ source) => /^https?:/.test(source.url ?? ''))))

/** Whether the person's words or what was read off elsewhere hold an address as it is, never what a brain wrote: a script's output, or an answer that echoes what the call itself was given. An address already opened says nothing new. @param {{ update?: any }[]} records @param {unknown} url */
export const given = (records, url) => typeof url === 'string' && Boolean(url) && records.some(({ update: u = {} }) => (u.kind === 'fetch' && u.status === 'completed' && u.rawInput?.url === url) || (u.sessionUpdate === 'user_message_chunk' ? JSON.stringify(u.content) : u.kind !== 'execute' && fromElsewhere({ update: u }) && !JSON.stringify(u.rawInput ?? '').includes(url) ? JSON.stringify(u.rawOutput ?? '') : '').includes(url))

/**
 * The hook: outermost but for the organisation's, so it reads what a service's own rule and an extension let through.
 * @param {(task: string) => Promise<import('../core/types.js').Envelope[] | undefined>} recordsOf @param {() => Record<string, string> | undefined} rules the organisation's @param {() => Promise<string>} why the card's words
 * @returns {import('../core/hooks.js').Hook}
 */
export const elsewhere = (recordsOf, rules, why) => ({ on: 'tool.check', tier: 'user', run: async (e, next) => {
  const said = await next(e)
  // Going back, or showing a file of the task's own, sends nothing out; a call with neither names an address, whatever shape it comes in.
  const out = e.kind === 'fetch' ? !e.service && !said?.meta?.site && typeof e.args?.path !== 'string' && !e.args?.go : CARRIES.includes(e.name) || ['other', 'move', 'delete'].includes(e.kind) || said?.meta?.machine
  if (said?.decision !== 'allow' || !(out || e.service) || !e.task) return said
  const records = await recordsOf(e.task)
  if (!(e.service && records?.some(({ update: u }) => u?.sessionUpdate === '_system_note' && u.data.kind === 'shared')) && (!out || rules()?.[e.kind] || (records && (!records.some(fromElsewhere) || (e.kind === 'fetch' && given(records, e.args?.url)))))) return said
  return { decision: 'ask', meta: { ...said.meta, guard: 'elsewhere', why: await why() } }
} })
