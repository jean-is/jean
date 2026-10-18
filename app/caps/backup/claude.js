// Claude's part of what Restore brings in (D341, imports.js): its export's conversations.json, each
// conversation with its name, its times and its messages (`chat_messages`, the human's and the
// assistant's). A request edited or an answer tried again leaves its old branch in the list, so the
// branch kept leads to `current_leaf_message_uuid`, else is the longest, through each message's
// `parent_message_uuid`. What was said is in its text blocks (`content`), else in `text`, where
// anything else says it isn't supported; thinking and tools are left out. A file shared comes as
// the text Claude read in it (`attachments`' `extracted_content`): pictures aren't in the export.
// Its projects (projects.json, sometimes in a part of its own) become projects with their
// instructions (`prompt_template`) and their documents (`docs`) as files, but for the example one
// Claude starts everyone with.
import { iso, turnsOf } from './imports.js'
import { firstWords } from '../../core/i18n.js'

/** @import { Found, Shared } from './imports.js' */

const encoder = new TextEncoder()
const UNSUPPORTED = /(```[^\n]*\s*)?This block is not supported on your current device yet\.(\s*```)?/g

/** Text read in a file, as a file of its own, under its name, as text. @param {unknown} name @param {unknown} text @returns {Shared[]} */
function textFile(name, text) {
  if (typeof text !== 'string' || !text.trim()) return []
  const base = String(name ?? '').trim() || firstWords(text, 4)
  return [{ name: /\.(txt|md|csv|json|html?|xml)$/i.test(base) ? base : `${base}.txt`, read: async () => encoder.encode(text) }]
}

/** The branch the user saw last, oldest first; the whole list when its messages have no parents. @param {any} conversation @returns {any[]} */
function branchOf(conversation) {
  const messages = conversation.chat_messages.filter(Boolean)
  const byId = new Map(messages.map((/** @type {any} */ message) => [message.uuid, message]))
  if (!messages.some((/** @type {any} */ message) => byId.has(message.parent_message_uuid))) return messages
  /** How far each is from the start, its parent coming before it. @type {Map<string, number>} */
  const depth = new Map()
  for (const message of messages) depth.set(message.uuid, (depth.get(message.parent_message_uuid) ?? 0) + 1)
  /** @type {any[]} */
  const branch = []
  let at = byId.get(conversation.current_leaf_message_uuid) ?? messages.reduce((/** @type {any} */ deepest, /** @type {any} */ message) => ((depth.get(message.uuid) ?? 0) >= (depth.get(deepest.uuid) ?? 0) ? message : deepest))
  for (; at && !branch.includes(at); at = byId.get(at.parent_message_uuid)) branch.push(at)
  return branch.reverse()
}

/** @param {any[]} items Claude's conversations and projects @returns {Found} */
export function claudeOf(items) {
  const chats = items.filter((item) => Array.isArray(item.chat_messages)).flatMap((conversation) => {
    const start = iso(conversation.created_at)
    if (!start) return []
    let time = start
    const messages = branchOf(conversation).map((message) => {
      time = iso(message.created_at) ?? time
      const blocks = (Array.isArray(message.content) ? message.content : []).filter((/** @type {any} */ block) => block?.type === 'text' && typeof block.text === 'string')
      return {
        time,
        user: message.sender === 'human',
        text: (blocks.length ? blocks.map((/** @type {any} */ block) => block.text).join('\n\n') : String(message.text ?? '').replace(UNSUPPORTED, '')).trim(),
        files: (Array.isArray(message.attachments) ? message.attachments : []).flatMap((/** @type {any} */ file) => textFile(file?.file_name, file?.extracted_content)),
      }
    })
    return [{ key: `claude ${conversation.uuid}`, title: String(conversation.name ?? ''), turns: turnsOf(messages) }]
  })
  const rooms = items.filter((item) => item.prompt_template !== undefined && !item.is_starter_project).map((project) => ({
    name: String(project.name ?? ''),
    instructions: String(project.prompt_template ?? '').trim(),
    files: (Array.isArray(project.docs) ? project.docs : []).flatMap((/** @type {any} */ doc) => textFile(doc?.filename, doc?.content)),
  }))
  return { chats, rooms, files: [] }
}
