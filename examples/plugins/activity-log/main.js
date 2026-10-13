// Activity log, an example of a plugin for Jean (D296). It follows everything Jean keeps in your
// conversations (the record event, D299), what going back to a request removes too, notes each task
// started and each file shared, says under each answer what was done for it, and tells you when a rule
// refused an action, and whose rule it was. What it keeps stays in its own data.json: like every plugin,
// it runs in a sandbox with no network, so nothing it sees can leave.
//
// Rights it asks for: watch (to hook events), draw (under answers, and in its row of Settings › Plugins)
// and notify (short messages).

/** How many lines of the log it keeps. */
const KEPT = 200

/** @param {(event: string, match: object | Function, run?: Function) => void} on @param {any} $ */
export async function register(on, $) {
  /** The log, oldest first: { at, text }. */
  let log = (await $.store.get('log')) ?? []
  /** What was done for each answer, by the first line of its last part. */
  let done = (await $.store.get('done')) ?? {}
  /** How many lines its row shows. */
  let shown = 8

  // What it keeps is written a moment after it changes, once for many records.
  let later = 0
  const keep = () => {
    clearTimeout(later)
    later = setTimeout(() => Promise.all([$.store.set('log', log), $.store.set('done', done)]), 1000)
  }
  /** @param {string} text */
  const write = (text) => {
    log = [...log, { at: new Date().toISOString(), text }].slice(-KEPT)
    keep()
  }

  // Each record Jean keeps, once it is kept: only watched, so nothing waits on it. A hook goes on with
  // next(e), which here only says it has nothing to answer.
  on('record', async (e, next) => {
    const line = describe(e)
    if (line) write(line)
    const call = e.record?.update
    // A call a rule refused says whose rule it was, and what it decided (D299).
    if (e.type === 'tool_call' && call._meta?.declined && call._meta.decision === 'never' && call._meta.by) $.notify(`${call.title || call.kind}: refused by ${who(call._meta.by)}.`)
    return next(e)
  })

  on('task.start', (e, next) => {
    write(e.from ? 'A task was duplicated from another' : 'A task started')
    return next(e)
  })

  on('file.add', (e, next) => {
    write(`You shared ${e.file.name}`)
    return next(e)
  })

  // Once a turn ends, what was done for its answer, to show under it.
  on('turn.end', (e, next) => {
    if (begins(e.answer)) done = Object.fromEntries([...Object.entries(done), [begins(e.answer), summary(e.records)]].slice(-KEPT))
    $.redraw()
    keep()
    return next(e)
  })

  $.slot('answer', ({ text }) => {
    const said = Object.entries(done).findLast(([begun]) => text.includes(begun))?.[1]
    return said ? { text: said, muted: true } : null
  })

  // Its row in Settings › Plugins: the newest lines as a Markdown list, which Jean draws as answers are.
  $.slot('settings', () => [
    { markdown: log.length
      ? [`**${log.length}** ${log.length === 1 ? 'line' : 'lines'} kept, the newest first:`, '', ...log.slice(-shown).reverse().map(({ at, text }) => `- ${time(at)} · ${plain(text)}`)].join('\n')
      : 'Nothing yet: it starts with your next message.' },
    { row: [...(log.length > shown ? [{ button: 'Show more', action: 'more' }] : []), ...(log.length ? [{ button: 'Clear the log', action: 'clear' }] : [])] },
  ])

  $.press((action) => {
    if (action === 'more') shown += 20
    if (action === 'clear') {
      log = []
      done = {}
      shown = 8
      keep()
      $.notify('The log is cleared.')
    }
    $.redraw()
  })
}

/**
 * A line for a record, or null for one not worth a line: a request, an answer, an action once it ended,
 * a task named, and what going back to a request removed.
 * @param {{ type: string, record?: any, records?: any[] }} e
 */
function describe({ type, record, records }) {
  if (type === 'removed') return `You went back to a request: ${records?.length ?? 0} records removed`
  const update = record?.update
  if (type === 'user_message_chunk' && update.content?.type === 'text') return `You asked: “${cut(update.content.text)}”`
  if (type === 'agent_message_chunk') return `Answered in ${count(update.content?.text ?? '')} words`
  // An action once it ended; a call without a tool's name is a request to the brain, not an action.
  if (type === 'tool_call' && update.name && ['completed', 'failed'].includes(update.status)) {
    const by = update._meta?.by
    const how = update._meta?.declined ? 'not done' : update.status === 'failed' ? 'failed' : 'done'
    return `${update.title || update.kind}: ${how}${by ? `, ${decided(update._meta.decision)} by ${who(by)}` : ''}`
  }
  if (type === 'meta' && record.meta?.title) return `The task was named “${record.meta.title}”`
  return null
}

/**
 * What was done for the last answer: the calls since the last request, each once, as it ended.
 * @param {any[]} records
 */
function summary(records) {
  const from = records.findLastIndex((record) => record.update?.sessionUpdate === 'user_message_chunk')
  const calls = new Map()
  for (const record of records.slice(from + 1)) {
    if (record.update?.sessionUpdate === 'tool_call' && record.update.name && record.update.status !== 'in_progress') calls.set(record.update.toolCallId, record.update)
  }
  if (!calls.size) return 'Answered without doing anything else'
  const all = [...calls.values()]
  const refused = all.filter((call) => call._meta?.declined)
  const deciders = [...new Set(all.flatMap((call) => (call._meta?.by ? [who(call._meta.by)] : [])))]
  return [
    `${all.length} ${all.length === 1 ? 'action' : 'actions'}`,
    ...(refused.length ? [`${refused.length} not done`] : []),
    ...(deciders.length ? [`decided by ${deciders.join(', ')}`] : []),
  ].join(' · ')
}

/** What a hook decided, in words. @param {string} decision */
const decided = (decision) => ({ never: 'refused', ask: 'asked first', allow: 'allowed' })[decision] ?? 'decided'
/** Whose rule: a plugin by its name, a capability by its id; a guard's id is a ULID, which says nothing. @param {string} by */
const who = (by) => (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(by) ? 'one of your rules' : by)
/** Text as it was written, not read as Markdown: what you asked may hold a star or a bracket. @param {string} text */
const plain = (text) => text.replace(/[\\`*_[\]#<>|~]/g, '\\$&')
/** @param {string} text */
const count = (text) => text.split(/\s+/).filter(Boolean).length
/** @param {string} text */
const cut = (text) => (text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text)
/**
 * The first line of an answer's last part, to know the answer again under it: turn.end gives its last
 * part, written after the last action, and the answer slot all of it, as shown. @param {string} text
 */
const begins = (text) => String(text ?? '').trim().split('\n')[0].slice(0, 80)
/** @param {string} at */
const time = (at) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
